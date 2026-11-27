<?php
/**
 * MRGR Color Center — Dedicated Transactional Endpoints
 *
 * Replaces full-state saveDB() overwrites on the three highest-risk operations:
 *   - POST ?action=pos_checkout    : Atomic POS sale + server-side price/VAT/promo validation + FIFO deduction
 *   - POST ?action=process_return  : Atomic customer return/exchange + server-side admin verification token + stock/batch sync
 *   - POST ?action=receive_po      : Atomic PO receiving + FIFO batch creation + damaged stock & auto replacement request
 */
date_default_timezone_set('Asia/Manila');
header('Content-Type: application/json; charset=utf-8');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/batch_lib.php';
require_once __DIR__ . '/supplier_returns_lib.php';

mrgrEnableGzip();

function txRespond(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function txSafeDate($val, string $format = 'Y-m-d H:i:s', ?string $default = null): ?string {
    if ($val === null || $val === '') return $default;
    $ts = strtotime((string)$val);
    return ($ts !== false) ? date($format, $ts) : $default;
}

try {
    $conn = getDBConnection();
} catch (Throwable $e) {
    txRespond(['success' => false, 'error' => 'Database connection failed: ' . $e->getMessage()], 500);
}

$action = trim((string)($_GET['action'] ?? ''));
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    txRespond(['success' => false, 'error' => 'POST method required.'], 405);
}

// Authenticate strictly from PHP session
$sessionUserId = $_SESSION['user_id'] ?? null;
$sessionAdminVerify = $_SESSION['admin_verify_token'] ?? null;

$actingUser = null;
if (!empty($sessionUserId)) {
    $uStmt = $conn->prepare("SELECT id, username, name, role, status FROM users WHERE id = ? LIMIT 1");
    if ($uStmt) {
        $uStmt->bind_param("s", $sessionUserId);
        $uStmt->execute();
        $uRow = $uStmt->get_result()->fetch_assoc();
        $uStmt->close();
        if ($uRow && $uRow['status'] === 'active') {
            $actingUser = $uRow;
        }
    }
}
if (!$actingUser) {
    session_write_close();
    txRespond(['success' => false, 'error' => 'Authentication required.'], 401);
}

$actingUserId = (string)$actingUser['id'];
$actingName = (string)$actingUser['name'];
$actingRole = (string)$actingUser['role'];

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    session_write_close();
    txRespond(['success' => false, 'error' => 'Invalid JSON payload.'], 400);
}

// Helper: sync products.stock, products.can_stock, products.opened_stock, products.opened_by_size from inventory + product_sizes
function txSyncProductFromInventory(mysqli $conn, string $productId): void {
    $stmt = $conn->prepare("SELECT ps.container_size, inv.sealed_quantity, inv.remaining_volume
        FROM product_sizes ps
        JOIN inventory inv ON inv.size_id = ps.size_id
        WHERE ps.product_id = ?");
    if (!$stmt) return;
    $stmt->bind_param("s", $productId);
    $stmt->execute();
    $res = $stmt->get_result();
    $canStock = [];
    $openedBySize = [];
    $totalSealedLiters = 0.0;
    $totalOpenedLiters = 0.0;
    $lastOpenedSize = 0;
    while ($r = $res->fetch_assoc()) {
        $szFloat = (float)$r['container_size'];
        $szKey = (string)((fmod($szFloat, 1.0) == 0.0) ? (int)$szFloat : $szFloat);
        $sealed = max(0, (int)$r['sealed_quantity']);
        $remVol = max(0.0, round((float)$r['remaining_volume'], 2));
        $canStock[$szKey] = $sealed;
        $totalSealedLiters += $sealed * $szFloat;
        if ($remVol > 0) {
            $openedBySize[$szKey] = $remVol;
            $totalOpenedLiters += $remVol;
            $lastOpenedSize = (int)$szFloat;
        }
    }
    $stmt->close();
    $totalSealedLiters = round($totalSealedLiters, 2);
    $totalOpenedLiters = round($totalOpenedLiters, 2);
    $canJson = json_encode($canStock);
    $openedJson = !empty($openedBySize) ? json_encode($openedBySize) : null;

    $up = $conn->prepare("UPDATE products SET stock = ?, can_stock = ?, opened_stock = ?, opened_can_size = ?, opened_by_size = ? WHERE id = ? OR product_id = ?");
    if ($up) {
        $up->bind_param("dsdisss", $totalSealedLiters, $canJson, $totalOpenedLiters, $lastOpenedSize, $openedJson, $productId, $productId);
        $up->execute();
        $up->close();
    }
}

// Helper: lock and adjust sealed_quantity by delta (positive = add, negative = deduct)
function txAdjustSealedInventory(mysqli $conn, string $sizeId, int $delta): array {
    $sel = $conn->prepare("SELECT inventory_id, sealed_quantity, opened_quantity, remaining_volume FROM inventory WHERE size_id = ? FOR UPDATE");
    if (!$sel) throw new Exception("Failed to prepare inventory lock.");
    $sel->bind_param("s", $sizeId);
    $sel->execute();
    $row = $sel->get_result()->fetch_assoc();
    $sel->close();

    if (!$row) {
        if ($delta < 0) {
            throw new Exception("Insufficient stock for size {$sizeId} (0 available).");
        }
        $invId = srUid('inv');
        $ins = $conn->prepare("INSERT INTO inventory (inventory_id, size_id, sealed_quantity, opened_quantity, remaining_volume) VALUES (?, ?, ?, 0, 0.00)");
        $ins->bind_param("ssi", $invId, $sizeId, $delta);
        $ins->execute();
        $ins->close();
        return ['before' => 0, 'after' => $delta];
    }

    $before = (int)$row['sealed_quantity'];
    $after = $before + $delta;
    if ($after < 0) {
        throw new Exception("Insufficient sealed stock for size {$sizeId} (have {$before}, requested " . abs($delta) . ").");
    }
    $up = $conn->prepare("UPDATE inventory SET sealed_quantity = ? WHERE inventory_id = ?");
    $up->bind_param("is", $after, $row['inventory_id']);
    $up->execute();
    $up->close();
    return ['before' => $before, 'after' => $after];
}

// Helper: consume liters for color mix atomically from opened stock first, then non-expired sealed cans (FOR UPDATE)
function txConsumeColorMixIngredient(mysqli $conn, string $productId, float $litersNeeded, int $preferredCanSize, string $movementId, string $receiptNo, string $staffName, string $now): array {
    $req = round(max(0.0, $litersNeeded), 4);
    if ($req <= 0) return ['cansOpened' => [], 'openedUsed' => 0.0];

    $sel = $conn->prepare("SELECT ps.size_id, ps.container_size, inv.inventory_id, inv.sealed_quantity, inv.opened_quantity, inv.remaining_volume
        FROM product_sizes ps
        JOIN inventory inv ON inv.size_id = ps.size_id
        WHERE ps.product_id = ?
        ORDER BY ps.container_size ASC
        FOR UPDATE");
    $sel->bind_param("s", $productId);
    $sel->execute();
    $res = $sel->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $rows[] = $r;
    }
    $sel->close();

    if (empty($rows)) {
        throw new Exception("No inventory sizes found for color-mix ingredient {$productId}.");
    }

    // 1. Consume from opened remaining_volume first (smallest size first, or preferred first)
    $rem = $req;
    $openedUsed = 0.0;
    foreach ($rows as &$r) {
        if ($rem <= 0.0001) break;
        $availOp = round((float)$r['remaining_volume'], 4);
        if ($availOp <= 0) continue;
        $take = min($availOp, $rem);
        $r['remaining_volume'] = round($availOp - $take, 2);
        $r['opened_quantity'] = $r['remaining_volume'] > 0 ? max(1, (int)$r['opened_quantity']) : 0;
        $rem = round($rem - $take, 4);
        $openedUsed = round($openedUsed + $take, 4);
    }
    unset($r);

    // 2. If still needed, open non-expired sealed cans
    $cansOpened = [];
    if ($rem > 0.0001) {
        // Compute non-expired sellable cans per size_id from inventory_batches
        $nonExpBySize = [];
        foreach ($rows as $r) {
            $sid = (string)$r['size_id'];
            $bStmt = $conn->prepare("SELECT COALESCE(SUM(remaining_qty), 0) AS qty FROM inventory_batches WHERE size_id = ? AND remaining_qty > 0 AND (expiration_date IS NULL OR expiration_date >= CURDATE())");
            $bStmt->bind_param("s", $sid);
            $bStmt->execute();
            $bQty = (int)($bStmt->get_result()->fetch_assoc()['qty'] ?? 0);
            $bStmt->close();
            $nonExpBySize[$sid] = min((int)$r['sealed_quantity'], $bQty);
        }

        $lastOpenedIdx = -1;
        $openedLitersFromCans = 0.0;

        // Helper to pick best-fit row index
        $pickIdx = function(float $need) use (&$rows, &$nonExpBySize, $preferredCanSize): int {
            if ($preferredCanSize > 0) {
                foreach ($rows as $idx => $r) {
                    if (abs((float)$r['container_size'] - $preferredCanSize) < 0.01 && ($nonExpBySize[$r['size_id']] ?? 0) > 0) {
                        return $idx;
                    }
                }
            }
            $bestGte = -1;
            $bestLt = -1;
            foreach ($rows as $idx => $r) {
                if (($nonExpBySize[$r['size_id']] ?? 0) <= 0) continue;
                $sz = (float)$r['container_size'];
                if ($sz >= $need - 0.0001) {
                    if ($bestGte === -1 || $sz < (float)$rows[$bestGte]['container_size']) $bestGte = $idx;
                } else {
                    if ($bestLt === -1 || $sz > (float)$rows[$bestLt]['container_size']) $bestLt = $idx;
                }
            }
            return $bestGte !== -1 ? $bestGte : $bestLt;
        };

        $stillNeeded = $rem;
        while ($rem > 0.0001) {
            $idx = $pickIdx($rem);
            if ($idx === -1) {
                throw new Exception("Insufficient non-expired sealed stock for color-mix ingredient {$productId} (short by " . round($rem, 2) . "L).");
            }
            $sid = (string)$rows[$idx]['size_id'];
            $sz = (float)$rows[$idx]['container_size'];
            $rows[$idx]['sealed_quantity'] = (int)$rows[$idx]['sealed_quantity'] - 1;
            $nonExpBySize[$sid]--;
            $cansOpened[$sid] = ($cansOpened[$sid] ?? 0) + 1;
            $openedLitersFromCans = round($openedLitersFromCans + $sz, 4);
            $lastOpenedIdx = $idx;
            $rem = round($rem - $sz, 4);
        }

        if ($lastOpenedIdx !== -1 && $openedLitersFromCans > $stillNeeded + 0.0001) {
            $leftover = round($openedLitersFromCans - $stillNeeded, 2);
            $rows[$lastOpenedIdx]['remaining_volume'] = round((float)$rows[$lastOpenedIdx]['remaining_volume'] + $leftover, 2);
            $rows[$lastOpenedIdx]['opened_quantity'] = max(1, (int)$rows[$lastOpenedIdx]['opened_quantity']);
        }
    }

    // Persist inventory rows & deduct FIFO non-expired batches
    $upInv = $conn->prepare("UPDATE inventory SET sealed_quantity = ?, opened_quantity = ?, remaining_volume = ? WHERE inventory_id = ?");
    foreach ($rows as $r) {
        $sq = (int)$r['sealed_quantity'];
        $oq = (int)$r['opened_quantity'];
        $rv = round((float)$r['remaining_volume'], 2);
        $invId = (string)$r['inventory_id'];
        $upInv->bind_param("iids", $sq, $oq, $rv, $invId);
        $upInv->execute();
    }
    $upInv->close();

    foreach ($cansOpened as $sid => $cnt) {
        $ded = batchFifoDeduct($conn, $sid, $cnt, $movementId, 'colormix', $receiptNo, "Color mix opened {$cnt} sealed can(s) ({$receiptNo})", $staffName, $now, null, false);
        if ($ded < $cnt) {
            throw new Exception("Color mixing blocked: Non-expired batch stock insufficient for size {$sid}.");
        }
    }

    txSyncProductFromInventory($conn, $productId);
    return ['cansOpened' => $cansOpened, 'openedUsed' => $openedUsed];
}

// =========================================================================
// ACTION 1: POS CHECKOUT (Transactional, Row-Locked, Server-Validated)
// =========================================================================
if ($action === 'pos_checkout') {
    session_write_close();
    if (!in_array($actingRole, ['admin', 'cashier'], true)) {
        txRespond(['success' => false, 'error' => 'Only Cashiers and Administrators can process POS sales.'], 403);
    }

    $sale = $payload['sale'] ?? null;
    if (!is_array($sale) || empty($sale['items']) || !is_array($sale['items'])) {
        txRespond(['success' => false, 'error' => 'Sale items are required.'], 400);
    }

    $saleId = trim((string)($sale['id'] ?? srUid('sale')));
    $saleDate = txSafeDate($sale['date'] ?? null, 'Y-m-d H:i:s', date('Y-m-d H:i:s'));
    $customerName = isset($sale['customerName']) && trim((string)$sale['customerName']) !== ''
        ? substr(trim((string)$sale['customerName']), 0, 150) : null;
    $paymentMethod = 'Cash';
    $cashTendered = round((float)($sale['cashTendered'] ?? 0), 2);

    // Load authoritative settings from DB
    $vatSettings = ['taxStatus' => 'vat_registered', 'pricingType' => 'inclusive', 'vatRate' => 12.0];
    $promoSettings = ['enabled' => true, 'minAmount' => 2500.0, 'discountPct' => 10.0];
    $sRes = $conn->query("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('vat_settings', 'pos_promo_discount')");
    if ($sRes) {
        while ($sr = $sRes->fetch_assoc()) {
            $dec = json_decode($sr['setting_value'], true);
            if (is_array($dec)) {
                if ($sr['setting_key'] === 'vat_settings') $vatSettings = array_merge($vatSettings, $dec);
                if ($sr['setting_key'] === 'pos_promo_discount') $promoSettings = array_merge($promoSettings, $dec);
            }
        }
    }
    $discSettings = batchGetDiscountSettings($conn);
    $discRules = batchLoadDiscountRules($conn);

    $conn->begin_transaction();
    try {
        // Idempotency check
        $chkDup = $conn->prepare("SELECT id, receipt_no FROM sales WHERE id = ? LIMIT 1 FOR UPDATE");
        $chkDup->bind_param("s", $saleId);
        $chkDup->execute();
        $dupRow = $chkDup->get_result()->fetch_assoc();
        $chkDup->close();
        if ($dupRow) {
            $conn->commit();
            txRespond(['success' => true, 'duplicate' => true, 'saleId' => $dupRow['id'], 'receiptNo' => $dupRow['receipt_no']]);
        }

        // Generate / ensure unique receipt_no
        $receiptNo = trim((string)($sale['receiptNo'] ?? ''));
        $datePart = date('Ymd', strtotime($saleDate) ?: time());
        $chkRn = $conn->prepare("SELECT id FROM sales WHERE UPPER(receipt_no) = UPPER(?) LIMIT 1");
        $needsNewRn = ($receiptNo === '');
        if (!$needsNewRn && $chkRn) {
            $chkRn->bind_param("s", $receiptNo);
            $chkRn->execute();
            if ($chkRn->get_result()->fetch_assoc()) $needsNewRn = true;
        }
        if ($chkRn) $chkRn->close();
        if ($needsNewRn) {
            $cntRes = $conn->query("SELECT COUNT(*) AS c FROM sales");
            $seq = (int)(($cntRes ? $cntRes->fetch_assoc()['c'] : 0)) + 1;
            do {
                $receiptNo = sprintf('OR-%s-%04d', $datePart, $seq++);
                $c2 = $conn->prepare("SELECT 1 FROM sales WHERE UPPER(receipt_no) = UPPER(?) LIMIT 1");
                $c2->bind_param("s", $receiptNo);
                $c2->execute();
                $exists = (bool)$c2->get_result()->fetch_assoc();
                $c2->close();
            } while ($exists);
        }

        $verifiedItems = [];
        $recomputedSubtotal = 0.0;
        $promoEligibleSubtotal = 0.0;
        $taxBuckets = ['vatable' => 0.0, 'exempt' => 0.0, 'zero_rated' => 0.0];
        $promoBuckets = ['vatable' => 0.0, 'exempt' => 0.0, 'zero_rated' => 0.0];

        foreach ($sale['items'] as $item) {
            $itemType = strtolower(trim((string)($item['type'] ?? 'product')));

            if ($itemType === 'product') {
                $pid = trim((string)($item['productId'] ?? ($item['product_id'] ?? '')));
                $size = (float)($item['size'] ?? 1);
                $qty = (int)round((float)($item['qty'] ?? 0));
                if ($pid === '' || $qty <= 0 || $size <= 0) {
                    throw new Exception("Invalid product item quantity or size.");
                }

                // Lock product & resolve size
                $pStmt = $conn->prepare("SELECT id, product_id, name, brand, color, price, status, tax_classification FROM products WHERE id = ? OR product_id = ? LIMIT 1 FOR UPDATE");
                $pStmt->bind_param("ss", $pid, $pid);
                $pStmt->execute();
                $pRow = $pStmt->get_result()->fetch_assoc();
                $pStmt->close();
                if (!$pRow || strtolower((string)$pRow['status']) !== 'active') {
                    throw new Exception("Product '{$pid}' is not active or not found.");
                }
                $canonicalPid = (string)$pRow['id'];
                $szInfo = srResolveProductSize($conn, $canonicalPid, $item['sizeId'] ?? ($item['size_id'] ?? null), $size);
                if (!$szInfo || (string)($szInfo['product_id'] ?? '') !== $canonicalPid) {
                    throw new Exception("Container size {$size}L not found for {$pRow['name']}.");
                }
                $sizeId = (string)$szInfo['size_id'];
                $psStmt = $conn->prepare("SELECT price_per_can, price_per_liter FROM product_sizes WHERE size_id = ? LIMIT 1");
                $psStmt->bind_param("s", $sizeId);
                $psStmt->execute();
                $psRow = $psStmt->get_result()->fetch_assoc();
                $psStmt->close();

                $catalogUnitPrice = ($psRow && (float)$psRow['price_per_can'] > 0)
                    ? round((float)$psRow['price_per_can'], 2)
                    : round((float)$pRow['price'] * $size, 2);

                // Check if near-expiry batch discount legitimately applies
                $targetBatchId = trim((string)($item['selectedBatchId'] ?? ($item['nearExpiryBatchId'] ?? ($item['regularBatchId'] ?? ''))));
                $isNearExpiry = false;
                $expectedUnitPrice = $catalogUnitPrice;
                if ($targetBatchId !== '') {
                    $bStmt = $conn->prepare("SELECT batch_id, batch_number, expiration_date, remaining_qty FROM inventory_batches WHERE batch_id = ? AND size_id = ? LIMIT 1 FOR UPDATE");
                    $bStmt->bind_param("ss", $targetBatchId, $sizeId);
                    $bStmt->execute();
                    $bRow = $bStmt->get_result()->fetch_assoc();
                    $bStmt->close();
                    if ($bRow) {
                        $daysRem = batchDaysRemaining($bRow['expiration_date']);
                        $rule = $discRules[$targetBatchId] ?? null;
                        $comp = batchComputeDiscount($daysRem, (int)$bRow['remaining_qty'], $catalogUnitPrice, $discSettings, $rule);
                        if (($comp['discountStatus'] ?? '') === 'active' && (float)($comp['discountPct'] ?? 0) > 0 && (int)$bRow['remaining_qty'] >= $qty) {
                            $isNearExpiry = true;
                            $expectedUnitPrice = round((float)$comp['discountedPrice'], 2);
                        }
                    }
                }

                // Enforce authoritative price (prevent client-side price tampering)
                $submittedUnit = round((float)($item['unitPrice'] ?? 0), 2);
                if (abs($submittedUnit - $expectedUnitPrice) > 0.05) {
                    $submittedUnit = $expectedUnitPrice;
                }
                $lineTotal = round($submittedUnit * $qty, 2);

                // Atomic sealed inventory deduction + FIFO non-expired batch deduction
                $adj = txAdjustSealedInventory($conn, $sizeId, -$qty);
                txSyncProductFromInventory($conn, $canonicalPid);

                $litersDeducted = round($qty * $size, 2);
                $mvNote = "Sold via POS ({$receiptNo}) [Sold {$qty} × {$size}L · {$size}L Units: {$adj['before']}→{$adj['after']}]";
                $mvId = srInsertMovement($conn, 'sale', $canonicalPid, $sizeId, $size, (string)$pRow['name'], -$litersDeducted, $mvNote, $actingName, $saleDate);

                $dedBatches = batchFifoDeduct(
                    $conn, $sizeId, $qty, $mvId, 'sale', $receiptNo, $mvNote, $actingName, $saleDate,
                    $targetBatchId !== '' ? $targetBatchId : null,
                    false
                );
                if ($dedBatches < $qty) {
                    throw new Exception("Sale blocked: Insufficient non-expired batch stock for {$pRow['name']} ({$size}L). Expired paint cannot be sold.");
                }

                $taxClass = strtolower((string)($pRow['tax_classification'] ?? 'vatable'));
                if (!isset($taxBuckets[$taxClass])) $taxClass = 'vatable';
                $taxBuckets[$taxClass] += $lineTotal;
                if (!$isNearExpiry) {
                    $promoEligibleSubtotal += $lineTotal;
                    $promoBuckets[$taxClass] += $lineTotal;
                }
                $recomputedSubtotal += $lineTotal;

                $item['productId'] = $canonicalPid;
                $item['product_id'] = $canonicalPid;
                $item['sizeId'] = $sizeId;
                $item['size_id'] = $sizeId;
                $item['unitPrice'] = $submittedUnit;
                $item['lineTotal'] = $lineTotal;
                $verifiedItems[] = $item;
            } elseif ($itemType === 'colormix') {
                $comps = isset($item['components']) && is_array($item['components']) ? $item['components'] : [];
                if (count($comps) < 2) {
                    throw new Exception("Invalid custom color mix: at least 2 ingredients required.");
                }
                $baseLiters = (float)($item['baseLiters'] ?? ($item['liters'] ?? ($item['qty'] ?? 1)));
                $qtyLiters = (float)($item['qty'] ?? ($item['liters'] ?? $baseLiters));
                if ($baseLiters < 0.5 || $qtyLiters < 0.5) {
                    throw new Exception("Custom color mix minimum volume is 0.5 L.");
                }

                $pctSum = 0.0;
                $materialCost = 0.0;
                $formulaParts = [];
                foreach ($comps as &$comp) {
                    $compPid = trim((string)($comp['productId'] ?? ($comp['product_id'] ?? '')));
                    $compPct = (float)($comp['percentage'] ?? ($comp['pctNum'] ?? ($comp['pct'] ?? 0)));
                    if ($compPid === '' || $compPct <= 0) {
                        throw new Exception("Invalid color mix ingredient.");
                    }
                    $cStmt = $conn->prepare("SELECT id, name, price, status, is_color_pigment, is_base_paint FROM products WHERE id = ? OR product_id = ? LIMIT 1 FOR UPDATE");
                    $cStmt->bind_param("ss", $compPid, $compPid);
                    $cStmt->execute();
                    $cRow = $cStmt->get_result()->fetch_assoc();
                    $cStmt->close();
                    if (!$cRow || strtolower((string)$cRow['status']) !== 'active') {
                        throw new Exception("Color mix ingredient '{$compPid}' is unavailable or inactive.");
                    }
                    if (empty($cRow['is_color_pigment']) && empty($cRow['is_base_paint'])) {
                        throw new Exception("Ingredient '{$cRow['name']}' is not approved for color mixing.");
                    }
                    $dbPrice = (float)$cRow['price'];
                    if ($dbPrice <= 0) {
                        throw new Exception("Cannot sell color mix with ₱0.00 ingredient '{$cRow['name']}'.");
                    }
                    $pctSum += $compPct;
                    $compLiters = round($qtyLiters * ($compPct / 100.0), 4);
                    $materialCost += round($compLiters * $dbPrice, 2);
                    $formulaParts[] = "{$compPct}% {$cRow['name']}";

                    $ingMvNote = "Color mix ingredient: {$compPct}% of {$qtyLiters}L (" . ($item['colorName'] ?? 'Custom') . ") · Receipt: {$receiptNo}";
                    $ingMvId = srInsertMovement($conn, 'colormix', (string)$cRow['id'], null, 0.0, "{$cRow['name']} (for " . ($item['colorName'] ?? 'Custom') . " mix)", -$compLiters, $ingMvNote, $actingName, $saleDate);
                    txConsumeColorMixIngredient($conn, (string)$cRow['id'], $compLiters, (int)($comp['preferredCanSize'] ?? 0), $ingMvId, $receiptNo, $actingName, $saleDate);
                    $comp['liters'] = round($compLiters, 4);
                }
                unset($comp);

                if (abs($pctSum - 100.0) > 0.5) {
                    throw new Exception("Color mix percentages must total 100%.");
                }

                $serviceFee = 50.00;
                $expectedLineTotal = round($materialCost + $serviceFee, 2);
                $submittedLineTotal = round((float)($item['lineTotal'] ?? 0), 2);
                // Non-admins cannot override color mix pricing; admins may override if > 0
                if ($actingRole !== 'admin' || $submittedLineTotal <= 0) {
                    $finalLineTotal = $expectedLineTotal;
                } else {
                    $finalLineTotal = $submittedLineTotal;
                }
                $finalUnitPrice = round($finalLineTotal / max(0.01, $qtyLiters), 2);

                // Summary colormix movement
                $sumNote = "Formula: " . implode(' + ', $formulaParts) . " · Receipt: {$receiptNo}";
                $mixLabel = "Custom Color Mix — " . ($item['colorName'] ?? 'Custom');
                $mixHex = $item['hexColor'] ?? null;
                $mixFormulaJson = json_encode($comps);
                $sumMvId = srUid('mv');
                $insSum = $conn->prepare("INSERT INTO movements (id, date, type, product_id, size_id, container_size, product_name, color_hex, qty_change, staff_name, note, formula_json) VALUES (?, ?, 'colormix', NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)");
                $insSum->bind_param("ssssdsss", $sumMvId, $saleDate, $mixLabel, $mixHex, $qtyLiters, $actingName, $sumNote, $mixFormulaJson);
                $insSum->execute();
                $insSum->close();

                $taxBuckets['vatable'] += $finalLineTotal;
                $promoEligibleSubtotal += $finalLineTotal;
                $promoBuckets['vatable'] += $finalLineTotal;
                $recomputedSubtotal += $finalLineTotal;

                $item['components'] = $comps;
                $item['unitPrice'] = $finalUnitPrice;
                $item['lineTotal'] = $finalLineTotal;
                $verifiedItems[] = $item;
            }
        }

        $recomputedSubtotal = round($recomputedSubtotal, 2);
        $promoEligibleSubtotal = round($promoEligibleSubtotal, 2);

        // Automatic promo discount calculation
        $discountPct = 0.0;
        $discountAmount = 0.0;
        if (!empty($promoSettings['enabled']) && $promoEligibleSubtotal >= (float)$promoSettings['minAmount'] && (float)$promoSettings['discountPct'] > 0) {
            $discountPct = round((float)$promoSettings['discountPct'], 2);
            $discountAmount = round($promoEligibleSubtotal * ($discountPct / 100.0), 2);
        }

        // Philippine VAT calculation (properly prorating promo discount ONLY across promo-eligible buckets)
        $taxStatus = strtolower((string)($vatSettings['taxStatus'] ?? 'vat_registered'));
        $pricingType = strtolower((string)($vatSettings['pricingType'] ?? 'inclusive'));
        $vatRate = round((float)($vatSettings['vatRate'] ?? 12.0), 2);

        $netVatable = $taxBuckets['vatable'];
        $netExempt = $taxBuckets['exempt'];
        $netZero = $taxBuckets['zero_rated'];
        if ($discountAmount > 0 && $promoEligibleSubtotal > 0) {
            $netVatable = max(0.0, $netVatable - $discountAmount * ($promoBuckets['vatable'] / $promoEligibleSubtotal));
            $netExempt = max(0.0, $netExempt - $discountAmount * ($promoBuckets['exempt'] / $promoEligibleSubtotal));
            $netZero = max(0.0, $netZero - $discountAmount * ($promoBuckets['zero_rated'] / $promoEligibleSubtotal));
        }

        $vatableSales = 0.0;
        $vatAmount = 0.0;
        $vatExemptSales = 0.0;
        $zeroRatedSales = 0.0;
        $finalTotal = round(max(0.0, $recomputedSubtotal - $discountAmount), 2);

        if ($taxStatus === 'vat_registered' && $vatRate > 0) {
            $vatExemptSales = round($netExempt, 2);
            $zeroRatedSales = round($netZero, 2);
            if ($pricingType === 'exclusive') {
                $vatableSales = round($netVatable, 2);
                $vatAmount = round($vatableSales * ($vatRate / 100.0), 2);
                $finalTotal = round($vatableSales + $vatAmount + $vatExemptSales + $zeroRatedSales, 2);
            } else {
                $vatableSales = round($netVatable / (1.0 + ($vatRate / 100.0)), 2);
                $vatAmount = round($netVatable - $vatableSales, 2);
                $finalTotal = round(max(0.0, $recomputedSubtotal - $discountAmount), 2);
            }
        } else {
            $vatRate = 0.0;
            $vatExemptSales = $finalTotal;
        }

        if ($finalTotal > 0 && $cashTendered + 0.005 < $finalTotal) {
            throw new Exception("Cash tendered (₱" . number_format($cashTendered, 2) . ") is less than total due (₱" . number_format($finalTotal, 2) . ").");
        }
        $changeAmount = round(max(0.0, $cashTendered - $finalTotal), 2);

        $itemsJson = json_encode($verifiedItems, JSON_UNESCAPED_UNICODE);
        $emptyReturns = '[]';
        $statusStr = 'completed';
        $zeroRef = 0.0;

        $insSale = $conn->prepare("INSERT INTO sales
            (id, receipt_no, customer_name, date, cashier_id, cashier_name, subtotal, discount_pct, discount_amount, total, status, payment_method, cash_tendered, change_amount, vat_rate, vatable_sales, vat_amount, vat_exempt_sales, zero_rated_sales, tax_status, pricing_type, refund_total, returns_json, items_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $insSale->bind_param(
            "ssssssddddssdddddddssdss",
            $saleId, $receiptNo, $customerName, $saleDate, $actingUserId, $actingName,
            $recomputedSubtotal, $discountPct, $discountAmount, $finalTotal,
            $statusStr, $paymentMethod, $cashTendered, $changeAmount,
            $vatRate, $vatableSales, $vatAmount, $vatExemptSales, $zeroRatedSales,
            $taxStatus, $pricingType, $zeroRef, $emptyReturns, $itemsJson
        );
        $insSale->execute();
        $insSale->close();

        $conn->commit();
        txRespond([
            'success' => true,
            'saleId' => $saleId,
            'receiptNo' => $receiptNo,
            'subtotal' => $recomputedSubtotal,
            'discountPct' => $discountPct,
            'discountAmount' => $discountAmount,
            'total' => $finalTotal,
            'vatableSales' => $vatableSales,
            'vatAmount' => $vatAmount,
            'cashTendered' => $cashTendered,
            'changeAmount' => $changeAmount
        ]);
    } catch (Throwable $e) {
        $conn->rollback();
        txRespond(['success' => false, 'error' => $e->getMessage()], 400);
    }
}

// =========================================================================
// ACTION 2: CUSTOMER RETURN / EXCHANGE (Transactional + Server Admin Auth)
// =========================================================================
if ($action === 'process_return') {
    $saleId = trim((string)($payload['saleId'] ?? ''));
    $returnRecord = $payload['returnRecord'] ?? null;
    $updatedItems = $payload['updatedItems'] ?? null;
    $newRefundTotal = isset($payload['refundTotal']) ? round((float)$payload['refundTotal'], 2) : null;
    $newStatus = trim((string)($payload['status'] ?? ''));
    $requiresAdminAuth = !empty($payload['requiresAdminAuth']);
    $adminVerifyToken = trim((string)($payload['adminVerifyToken'] ?? ''));

    if (!in_array($actingRole, ['admin', 'cashier'], true)) {
        session_write_close();
        txRespond(['success' => false, 'error' => 'Only Cashiers and Administrators can process returns or exchanges.'], 403);
    }
    if ($saleId === '' || !is_array($returnRecord) || !is_array($updatedItems)) {
        session_write_close();
        txRespond(['success' => false, 'error' => 'Missing required return/exchange details.'], 400);
    }

    // Server-side enforcement of Administrator verification token for refunds / exceptions
    $isRefundRes = strtolower((string)($returnRecord['resolution'] ?? '')) === 'refund';
    $netCashPayout = ((float)($returnRecord['refundAmount'] ?? 0)) > ((float)($returnRecord['exchangeAmount'] ?? 0) + 0.005);
    $mustVerifyAdmin = ($requiresAdminAuth || $isRefundRes || $netCashPayout);

    if ($mustVerifyAdmin && $actingRole !== 'admin') {
        $tokenOk = false;
        if (is_array($sessionAdminVerify) && !empty($sessionAdminVerify['token']) && $adminVerifyToken !== '') {
            if (time() <= (int)($sessionAdminVerify['expiresAt'] ?? 0) && hash_equals((string)$sessionAdminVerify['token'], $adminVerifyToken)) {
                $tokenOk = true;
                $returnRecord['authorizedBy'] = (string)$sessionAdminVerify['adminName'];
                $returnRecord['adminApproved'] = true;
                // Consume token immediately so it is strictly single-use
                unset($_SESSION['admin_verify_token']);
            }
        }
        if (!$tokenOk) {
            session_write_close();
            txRespond(['success' => false, 'error' => 'Administrator authorization is required and must be verified on the server.'], 403);
        }
    }
    session_write_close();

    $now = txSafeDate($returnRecord['date'] ?? null, 'Y-m-d H:i:s', date('Y-m-d H:i:s'));
    $reason = trim((string)($returnRecord['reason'] ?? 'Return / Exchange'));
    $note = trim((string)($returnRecord['note'] ?? ''));

    $conn->begin_transaction();
    try {
        $sStmt = $conn->prepare("SELECT id, receipt_no, date, total, refund_total, status, items_json, returns_json FROM sales WHERE id = ? LIMIT 1 FOR UPDATE");
        $sStmt->bind_param("s", $saleId);
        $sStmt->execute();
        $sRow = $sStmt->get_result()->fetch_assoc();
        $sStmt->close();

        if (!$sRow) {
            throw new Exception("Sale record not found.");
        }
        if (in_array(strtolower((string)$sRow['status']), ['voided', 'void', 'cancelled'], true)) {
            throw new Exception("Cannot process a return on a voided sale.");
        }

        // Enforce post-same-day check server-side as well
        $saleDay = substr((string)$sRow['date'], 0, 10);
        if ($saleDay !== date('Y-m-d') && $actingRole !== 'admin' && empty($returnRecord['adminApproved'])) {
            throw new Exception("Post-purchase-day returns require Administrator authorization.");
        }

        $receiptNo = (string)$sRow['receipt_no'];
        $existingReturns = json_decode($sRow['returns_json'] ?? '[]', true);
        if (!is_array($existingReturns)) $existingReturns = [];

        // Idempotency check by return voucherNo / id
        $retId = (string)($returnRecord['id'] ?? srUid('ret'));
        foreach ($existingReturns as $er) {
            if (($er['id'] ?? '') === $retId) {
                $conn->commit();
                txRespond(['success' => true, 'duplicate' => true]);
            }
        }

        // Server-side validation: returned quantities cannot exceed remaining unreturned quantities on original sale
        $origSaleItems = json_decode($sRow['items_json'] ?? '[]', true);
        if (!is_array($origSaleItems)) $origSaleItems = [];
        $remainingByKey = [];
        foreach ($origSaleItems as $oi) {
            $oType = strtolower(trim((string)($oi['type'] ?? 'product')));
            $oKey = $oType === 'colormix'
                ? ('mix:' . strtolower(trim((string)($oi['colorName'] ?? ($oi['name'] ?? 'mix')))))
                : ('prod:' . trim((string)($oi['productId'] ?? '')) . ':' . (float)($oi['size'] ?? 1));
            $oRem = max(0.0, (float)($oi['qty'] ?? 0) - (float)($oi['returnedQty'] ?? 0));
            $remainingByKey[$oKey] = round(($remainingByKey[$oKey] ?? 0.0) + $oRem, 4);
        }
        foreach (($returnRecord['items'] ?? []) as $chkRi) {
            $rType = strtolower(trim((string)($chkRi['type'] ?? 'product')));
            $rKey = $rType === 'colormix'
                ? ('mix:' . strtolower(trim((string)($chkRi['colorName'] ?? ($chkRi['name'] ?? 'mix')))))
                : ('prod:' . trim((string)($chkRi['productId'] ?? '')) . ':' . (float)($chkRi['size'] ?? 1));
            $rQty = round((float)($chkRi['qty'] ?? 0), 4);
            if ($rQty <= 0) continue;
            if (isset($remainingByKey[$rKey])) {
                if ($rQty > $remainingByKey[$rKey] + 0.001) {
                    throw new Exception("Returned quantity ({$rQty}) exceeds remaining returnable quantity ({$remainingByKey[$rKey]}) for " . ($chkRi['name'] ?? 'item') . ".");
                }
                $remainingByKey[$rKey] = round($remainingByKey[$rKey] - $rQty, 4);
            }
        }

        // 1. Restore returned sealed items (when restocked = true) or log 0L quarantine movement (when non-restocked / opened / colormix)
        foreach (($returnRecord['items'] ?? []) as $ri) {
            $riType = strtolower(trim((string)($ri['type'] ?? 'product')));
            $pid = trim((string)($ri['productId'] ?? ''));
            $size = (float)($ri['size'] ?? 1);
            $qty = (int)round((float)($ri['qty'] ?? 0));
            $rawQty = round((float)($ri['qty'] ?? 0), 2);
            if ($rawQty <= 0) continue;

            if ($riType !== 'product' || empty($ri['restocked'])) {
                $qName = trim((string)($ri['name'] ?? ($ri['colorName'] ?? 'Returned Item')));
                $qCond = trim((string)($ri['condition'] ?? ($riType === 'colormix' ? 'Custom Mix — Non-Restockable' : 'Quarantined / Non-Restockable')));
                $qNote = "Customer Return Quarantined (0L Restocked): {$receiptNo} ({$reason}) [{$rawQty}" . ($riType === 'product' ? " × {$size}L" : "L") . " · {$qCond}]" . ($note !== '' ? " — {$note}" : '');
                srInsertMovement($conn, 'adjustment', $pid !== '' ? $pid : null, $ri['sizeId'] ?? null, $riType === 'product' ? $size : 0.0, "{$qName} [Quarantined Return]", 0.0, $qNote, $actingName, $now);
                continue;
            }
            if ($pid === '' || $qty <= 0) continue;

            $szInfo = srResolveProductSize($conn, $pid, $ri['sizeId'] ?? null, $size);
            if (!$szInfo) continue;
            $sizeId = (string)$szInfo['size_id'];
            $canonPid = (string)$szInfo['product_id'];
            $adj = txAdjustSealedInventory($conn, $sizeId, +$qty);
            txSyncProductFromInventory($conn, $canonPid);

            $liters = round($qty * $size, 2);
            $mvNote = "Customer Return Restocked: {$receiptNo} ({$reason}) [Returned {$qty} × {$size}L · Units: {$adj['before']}→{$adj['after']}]" . ($note !== '' ? " — {$note}" : '');
            $mvId = srInsertMovement($conn, 'return', $canonPid, $sizeId, $size, (string)($ri['name'] ?? 'Product'), +$liters, $mvNote, $actingName, $now);
            $leftover = batchRestore($conn, $sizeId, $qty, $mvId, $receiptNo, $mvNote, $actingName, $now);
            if ($leftover > 0) {
                $retBatchNum = 'RET-' . date('Ymd-His') . '-' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));
                $retBatchId = batchCreate($conn, [
                    'size_id' => $sizeId,
                    'product_id' => $canonPid,
                    'qty' => $leftover,
                    'batch_number' => $retBatchNum,
                    'expiration_date' => null,
                    'date_received' => $now,
                    'source' => 'return',
                    'notes' => "Restocked from customer return ({$receiptNo})",
                    'staff' => $actingName,
                ]);
                batchLog($conn, $retBatchId, $mvId, 'return', $leftover, $leftover, $receiptNo, substr($mvNote, 0, 400), $actingName, $now);
            }
        }

        // 2. Deduct exchange replacement items atomically (blocking expired batches; supports both sealed products and custom color mixes)
        foreach (($returnRecord['exchangeItems'] ?? []) as $ex) {
            $exType = strtolower(trim((string)($ex['type'] ?? 'product')));
            if ($exType === 'product') {
                $pid = trim((string)($ex['productId'] ?? ''));
                $size = (float)($ex['size'] ?? 1);
                $qty = (int)round((float)($ex['qty'] ?? 0));
                if ($pid === '' || $qty <= 0) continue;

                $szInfo = srResolveProductSize($conn, $pid, $ex['sizeId'] ?? null, $size);
                if (!$szInfo) {
                    throw new Exception("Replacement product size {$size}L not found for {$pid}.");
                }
                $sizeId = (string)$szInfo['size_id'];
                $canonPid = (string)$szInfo['product_id'];
                $adj = txAdjustSealedInventory($conn, $sizeId, -$qty);
                txSyncProductFromInventory($conn, $canonPid);

                $liters = round($qty * $size, 2);
                $mvNote = "Exchange Replacement Issued: {$receiptNo} ({$reason}) [Issued {$qty} × {$size}L · Units: {$adj['before']}→{$adj['after']}]" . ($note !== '' ? " — {$note}" : '');
                $mvId = srInsertMovement($conn, 'return', $canonPid, $sizeId, $size, (string)($ex['name'] ?? 'Product'), -$liters, $mvNote, $actingName, $now);
                $ded = batchFifoDeduct($conn, $sizeId, $qty, $mvId, 'return', $receiptNo, $mvNote, $actingName, $now, null, false);
                if ($ded < $qty) {
                    throw new Exception("Exchange blocked: Insufficient non-expired batch stock for replacement item.");
                }
            } elseif ($exType === 'colormix') {
                $comps = isset($ex['components']) && is_array($ex['components']) ? $ex['components'] : [];
                $exLiters = (float)($ex['liters'] ?? ($ex['qty'] ?? 1));
                $exColorName = trim((string)($ex['colorName'] ?? 'Custom Mix'));
                $exHex = $ex['hexColor'] ?? null;
                if (empty($comps) || $exLiters <= 0) {
                    throw new Exception("Invalid custom color mix exchange item.");
                }
                $formulaParts = [];
                foreach ($comps as $comp) {
                    $compPid = trim((string)($comp['productId'] ?? ($comp['product_id'] ?? '')));
                    $compPct = (float)($comp['percentage'] ?? ($comp['pctNum'] ?? ($comp['pct'] ?? 0)));
                    $compLiters = isset($comp['liters']) && (float)$comp['liters'] > 0
                        ? round((float)$comp['liters'], 4)
                        : round($exLiters * ($compPct / 100.0), 4);
                    if ($compPid === '' || $compLiters <= 0) {
                        throw new Exception("Invalid color mix exchange ingredient.");
                    }
                    $cStmt = $conn->prepare("SELECT id, name, status, is_color_pigment, is_base_paint FROM products WHERE id = ? OR product_id = ? LIMIT 1 FOR UPDATE");
                    $cStmt->bind_param("ss", $compPid, $compPid);
                    $cStmt->execute();
                    $cRow = $cStmt->get_result()->fetch_assoc();
                    $cStmt->close();
                    if (!$cRow || strtolower((string)$cRow['status']) !== 'active') {
                        throw new Exception("Color mix exchange ingredient '{$compPid}' is unavailable or inactive.");
                    }
                    if (empty($cRow['is_color_pigment']) && empty($cRow['is_base_paint'])) {
                        throw new Exception("Ingredient '{$cRow['name']}' is not approved for color mixing.");
                    }
                    $formulaParts[] = ($compPct > 0 ? "{$compPct}% " : '') . $cRow['name'];
                    $ingMvNote = "Exchange Color Mix Ingredient: {$exLiters}L ({$exColorName}) · Receipt: {$receiptNo}" . ($note !== '' ? " — {$note}" : '');
                    $ingMvId = srInsertMovement($conn, 'colormix', (string)$cRow['id'], null, 0.0, "{$cRow['name']} (for {$exColorName} exchange mix)", -$compLiters, $ingMvNote, $actingName, $now);
                    txConsumeColorMixIngredient($conn, (string)$cRow['id'], $compLiters, (int)($comp['preferredCanSize'] ?? 0), $ingMvId, $receiptNo, $actingName, $now);
                }
                $sumNote = "Exchange Re-Mix Formula: " . implode(' + ', $formulaParts) . " · Receipt: {$receiptNo}";
                $mixLabel = "Exchange Custom Color Mix — {$exColorName}";
                $mixFormulaJson = json_encode($comps, JSON_UNESCAPED_UNICODE);
                $sumMvId = srUid('mv');
                $insSum = $conn->prepare("INSERT INTO movements (id, date, type, product_id, size_id, container_size, product_name, color_hex, qty_change, staff_name, note, formula_json) VALUES (?, ?, 'colormix', NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)");
                $insSum->bind_param("ssssdsss", $sumMvId, $now, $mixLabel, $exHex, $exLiters, $actingName, $sumNote, $mixFormulaJson);
                $insSum->execute();
                $insSum->close();
            }
        }

        // 3. Persist updated sale row
        $existingReturns[] = $returnRecord;
        $finalRefundTotal = $newRefundTotal !== null ? min((float)$sRow['total'], $newRefundTotal) : (float)$sRow['refund_total'];
        $finalStatus = in_array($newStatus, ['refunded', 'partially_refunded'], true) ? $newStatus : 'partially_refunded';
        $itemsJson = json_encode($updatedItems, JSON_UNESCAPED_UNICODE);
        $returnsJson = json_encode($existingReturns, JSON_UNESCAPED_UNICODE);

        $upSale = $conn->prepare("UPDATE sales SET refund_total = ?, status = ?, items_json = ?, returns_json = ? WHERE id = ?");
        $upSale->bind_param("dssss", $finalRefundTotal, $finalStatus, $itemsJson, $returnsJson, $saleId);
        $upSale->execute();
        $upSale->close();

        $conn->commit();
        txRespond(['success' => true, 'saleId' => $saleId, 'status' => $finalStatus, 'refundTotal' => $finalRefundTotal]);
    } catch (Throwable $e) {
        $conn->rollback();
        txRespond(['success' => false, 'error' => $e->getMessage()], 400);
    }
}

// =========================================================================
// ACTION 3: ATOMIC PO RECEIVING (Stock + Batches + Damaged + Replacement)
// =========================================================================
if ($action === 'receive_po') {
    session_write_close();
    if (!in_array($actingRole, ['admin', 'staff'], true)) {
        txRespond(['success' => false, 'error' => 'Only Inventory Staff and Administrators can receive purchase orders.'], 403);
    }

    $poId = trim((string)($payload['poId'] ?? ''));
    $lines = $payload['lines'] ?? [];
    $receivingTxKey = trim((string)($payload['receivingTxKey'] ?? ''));
    $refNote = trim((string)($payload['refNote'] ?? ''));
    $now = date('Y-m-d H:i:s');
    $today = date('Y-m-d');

    if ($poId === '' || !is_array($lines) || empty($lines)) {
        txRespond(['success' => false, 'error' => 'Purchase order ID and received lines are required.'], 400);
    }

    $conn->begin_transaction();
    try {
        // Lock PO row
        $poStmt = $conn->prepare("SELECT * FROM purchase_orders WHERE id = ? LIMIT 1 FOR UPDATE");
        $poStmt->bind_param("s", $poId);
        $poStmt->execute();
        $poRow = $poStmt->get_result()->fetch_assoc();
        $poStmt->close();
        if (!$poRow) {
            throw new Exception("Purchase Order not found.");
        }
        $poStatus = strtolower((string)$poRow['status']);
        if (!in_array($poStatus, ['ordered', 'partial'], true)) {
            throw new Exception("Purchase Order {$poRow['po_number']} cannot be received in status '{$poRow['status']}'.");
        }

        // Idempotency check via receivingTxKey marker in movements.note
        if ($receivingTxKey !== '') {
            $likeKey = '%' . $receivingTxKey . '%';
            $ikStmt = $conn->prepare("SELECT id FROM movements WHERE note LIKE ? LIMIT 1");
            $ikStmt->bind_param("s", $likeKey);
            $ikStmt->execute();
            $already = $ikStmt->get_result()->fetch_assoc();
            $ikStmt->close();
            if ($already) {
                $conn->commit();
                txRespond(['success' => true, 'duplicate' => true, 'poId' => $poId]);
            }
        }

        $poNumber = (string)$poRow['po_number'];
        $supplierId = (string)$poRow['supplier_id'];
        $supplierName = (string)$poRow['supplier_name'];
        $items = json_decode($poRow['items_json'] ?? '[]', true);
        if (!is_array($items)) $items = [];

        $receivedItemCount = 0;
        $totalAccepted = 0;
        $totalDamaged = 0;
        $autoReplacementRefs = [];
        $damagedRecorded = false;
        $datePart = date('Ymd');

        foreach ($lines as $line) {
            $idx = isset($line['index']) ? (int)$line['index'] : -1;
            if ($idx < 0 || !isset($items[$idx])) continue;
            $item = &$items[$idx];

            $ordered = (int)round((float)($item['qty'] ?? 0));
            $alreadyAccepted = (int)round((float)($item['receivedQty'] ?? 0));
            $activeRepPending = max(0, (int)round((float)($item['replacementRequestedQty'] ?? 0)) - (int)round((float)($item['replacementReceivedQty'] ?? 0)));
            $remaining = max(0, $ordered - $alreadyAccepted - $activeRepPending);

            $qtyDelivered = max(0, (int)round((float)($line['deliveredQty'] ?? 0)));
            $qtyDamaged = max(0, (int)round((float)($line['damagedQty'] ?? 0)));
            $qtyAccepted = max(0, (int)round((float)($line['acceptedQty'] ?? ($qtyDelivered - $qtyDamaged))));

            if ($qtyDelivered <= 0) continue;
            if ($qtyDelivered > $remaining) {
                throw new Exception("Delivered quantity ({$qtyDelivered}) exceeds remaining PO quantity ({$remaining}) for " . ($item['productName'] ?? 'item') . ".");
            }
            if ($qtyAccepted + $qtyDamaged !== $qtyDelivered) {
                throw new Exception("Accepted ({$qtyAccepted}) + Damaged ({$qtyDamaged}) must equal Delivered ({$qtyDelivered}).");
            }

            $receivedItemCount++;
            $totalAccepted += $qtyAccepted;
            $totalDamaged += $qtyDamaged;

            $pid = (string)($item['productId'] ?? ($item['product_id'] ?? ''));
            $size = (float)($item['size'] ?? ($item['containerSize'] ?? 1));
            $szInfo = srResolveProductSize($conn, $pid, $item['sizeId'] ?? ($item['size_id'] ?? null), $size);
            if (!$szInfo) {
                throw new Exception("Product size {$size}L not found for {$pid}.");
            }
            $sizeId = (string)$szInfo['size_id'];
            $canonPid = (string)$szInfo['product_id'];
            $prodName = (string)($item['productName'] ?? $szInfo['product_name'] ?? 'Product');
            $unitCost = isset($item['unitCost']) ? (float)$item['unitCost'] : (isset($item['purchaseCostPerUnit']) ? (float)$item['purchaseCostPerUnit'] : null);

            $batchNum = trim((string)($line['batchNumber'] ?? ''));
            if ($batchNum === '') {
                $batchNum = 'LOT-' . $datePart . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
            }
            $expDate = batchNormalizeDate($line['expirationDate'] ?? null);
            $inspNote = trim((string)($line['inspectionNotes'] ?? ''));
            $dmgReason = trim((string)($line['damageReason'] ?? 'Damaged on Delivery'));
            $handling = trim((string)($line['handling'] ?? 'returned_to_driver'));
            $txTag = $receivingTxKey !== '' ? " [TX:{$receivingTxKey}]" : '';

            // 1. Add ONLY accepted units to sellable inventory & FIFO batches
            if ($qtyAccepted > 0) {
                $adj = txAdjustSealedInventory($conn, $sizeId, +$qtyAccepted);
                txSyncProductFromInventory($conn, $canonPid);
                $liters = round($qtyAccepted * $size, 2);
                $mvNote = "PO Delivery (Inspected): {$poNumber} ({$supplierName}) [Delivered {$qtyDelivered}, Accepted {$qtyAccepted} × {$size}L (+{$liters}L)" . ($qtyDamaged > 0 ? ", Damaged {$qtyDamaged}" : '') . " · Units: {$adj['before']}→{$adj['after']}, Batch: {$batchNum}]{$txTag}" . ($refNote !== '' ? " — {$refNote}" : '');
                $mvId = srInsertMovement($conn, 'receiving', $canonPid, $sizeId, $size, $prodName, +$liters, $mvNote, $actingName, $now);

                $batchId = batchCreate($conn, [
                    'size_id' => $sizeId,
                    'product_id' => $canonPid,
                    'qty' => $qtyAccepted,
                    'batch_number' => $batchNum,
                    'expiration_date' => $expDate,
                    'unit_cost' => $unitCost,
                    'supplier_id' => $supplierId,
                    'supplier_name' => $supplierName,
                    'po_id' => $poId,
                    'po_number' => $poNumber,
                    'date_received' => $now,
                    'source' => 'receiving',
                    'notes' => $inspNote !== '' ? $inspNote : $refNote,
                    'staff' => $actingName,
                ]);
                batchLog($conn, $batchId, $mvId, 'received', $qtyAccepted, $qtyAccepted, $poNumber, substr($mvNote, 0, 400), $actingName, $now);
            }

            // 2. Record damaged units + auto-create replacement request in the SAME transaction
            if ($qtyDamaged > 0) {
                $damagedRecorded = true;
                $dmgMvNote = "Damaged Stock Excluded: {$poNumber} ({$supplierName}) [Delivered {$qtyDelivered}, Accepted {$qtyAccepted}, Damaged {$qtyDamaged} × {$size}L — Excluded from sellable stock] · Reason: {$dmgReason}{$txTag}" . ($inspNote !== '' ? " — {$inspNote}" : '');
                $dmgMvId = srInsertMovement($conn, 'damaged', $canonPid, $sizeId, $size, "{$prodName} [Damaged]", 0.0, $dmgMvNote, $actingName, $now);

                $dmgId = srUid('dmg');
                $retQty = ($handling === 'returned_to_driver') ? $qtyDamaged : 0;
                $insDmg = $conn->prepare("INSERT INTO damaged_stock_records
                    (id, po_id, po_number, supplier_id, supplier_name, product_id, product_name, size_id, container_size,
                     batch_id, batch_number, source, delivered_qty, accepted_qty, damaged_qty, returned_qty, reason,
                     inspection_notes, stock_deducted, movement_id, recorded_by, recorded_role, recorded_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'receiving', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)");
                $insDmg->bind_param(
                    "ssssssssdsiiiissssss",
                    $dmgId, $poId, $poNumber, $supplierId, $supplierName, $canonPid, $prodName, $sizeId, $size,
                    $batchNum, $qtyDelivered, $qtyAccepted, $qtyDamaged, $retQty, $dmgReason,
                    $inspNote, $dmgMvId, $actingName, $actingRole, $now
                );
                $insDmg->execute();
                $insDmg->close();

                $repId = srUid('srr');
                $repRef = srGenerateReplacementRef($conn);
                $repStatus = 'Awaiting Supplier Confirmation';
                $insRep = $conn->prepare("INSERT INTO supplier_replacement_requests
                    (id, request_ref, po_id, po_number, supplier_id, supplier_name, damaged_record_id, product_id, product_name,
                     size_id, container_size, damaged_qty, returned_qty, requested_qty, received_qty, rejected_qty, reason,
                     request_date, status, staff_responsible, created_role, notes, updated_by, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)");
                $insRep->bind_param(
                    "ssssssssssdiiissssssss",
                    $repId, $repRef, $poId, $poNumber, $supplierId, $supplierName, $dmgId, $canonPid, $prodName,
                    $sizeId, $size, $qtyDamaged, $retQty, $qtyDamaged, $dmgReason,
                    $today, $repStatus, $actingName, $actingRole, $inspNote, $actingName, $now
                );
                $insRep->execute();
                $insRep->close();
                $autoReplacementRefs[] = $repRef;
            }

            $item['receivedQty'] = $alreadyAccepted + $qtyAccepted;
            $item['acceptedQty'] = (int)round((float)($item['acceptedQty'] ?? $alreadyAccepted)) + $qtyAccepted;
            $item['damagedQty'] = (int)round((float)($item['damagedQty'] ?? 0)) + $qtyDamaged;
            $item['deliveredQty'] = (int)round((float)($item['deliveredQty'] ?? $alreadyAccepted)) + $qtyDelivered;

            $upPoi = $conn->prepare("UPDATE purchase_order_items SET received_quantity = ? WHERE po_id = ? AND product_id = ? AND ABS(container_size - ?) < 0.01");
            if ($upPoi) {
                $newRec = (int)$item['receivedQty'];
                $upPoi->bind_param("issd", $newRec, $poId, $canonPid, $size);
                $upPoi->execute();
                $upPoi->close();
            }
        }
        unset($item);

        // Save updated PO items_json & received_at, then let srRecalcPOStatus set authoritative status & receiving_stage
        $itemsJson = json_encode($items, JSON_UNESCAPED_UNICODE);
        $upPo = $conn->prepare("UPDATE purchase_orders SET items_json = ?, received_at = ? WHERE id = ?");
        $upPo->bind_param("sss", $itemsJson, $now, $poId);
        $upPo->execute();
        $upPo->close();

        srRecalcPOStatus($conn, $poId);

        $stCheck = $conn->prepare("SELECT status, receiving_stage FROM purchase_orders WHERE id = ? LIMIT 1");
        $stCheck->bind_param("s", $poId);
        $stCheck->execute();
        $finalPo = $stCheck->get_result()->fetch_assoc();
        $stCheck->close();

        $conn->commit();
        txRespond([
            'success' => true,
            'poId' => $poId,
            'poNumber' => $poNumber,
            'status' => $finalPo['status'] ?? 'partial',
            'receivingStage' => $finalPo['receiving_stage'] ?? 'open',
            'allCompleted' => strtolower((string)($finalPo['status'] ?? '')) === 'received',
            'receivedItemCount' => $receivedItemCount,
            'totalAcceptedUnits' => $totalAccepted,
            'totalDamagedUnits' => $totalDamaged,
            'damagedRecorded' => $damagedRecorded,
            'autoReplacementRefs' => $autoReplacementRefs
        ]);
    } catch (Throwable $e) {
        $conn->rollback();
        txRespond(['success' => false, 'error' => $e->getMessage()], 400);
    }
}

session_write_close();
txRespond(['success' => false, 'error' => 'Unknown transaction action.'], 400);
