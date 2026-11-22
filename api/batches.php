<?php
/**
 * Expiration Tracking API — batch monitoring, details, edit and thresholds.
 *
 * GET  ?action=list                 -> all batches (+ computed expiry status), summary, filter options, thresholds
 * GET  ?action=detail&batch_id=ID   -> full batch view: product, batch, history, FIFO deductions, stock movements
 * GET  ?action=summary              -> status counts only (dashboard widgets)
 * POST ?action=update_batch         -> edit batch expiration date only (admin & staff, reason required, audited)
 * POST ?action=save_thresholds      -> change Critical / Expiring-Soon day thresholds (admin only, audited)
 *
 * Stock quantity changes are NOT made here: they go through the normal inventory + movement
 * pipeline (api/db.php), which routes them to the batch ledger (api/batch_lib.php).
 */
date_default_timezone_set('Asia/Manila');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (session_status() === PHP_SESSION_NONE) session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/batch_lib.php';

function bx_fail(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}

try {
    $conn = getDBConnection();
    batchEnsureSchema($conn);
} catch (Throwable $e) {
    bx_fail(500, 'Database connection failed: ' . $e->getMessage());
}

// ---- Authentication / RBAC (admin + staff may view & edit expiration date) ------------------
$uid = (string)($_SESSION['user_id'] ?? '');
if ($uid === '') bx_fail(401, 'Authentication required.');
$st = $conn->prepare("SELECT id, name, role, status FROM users WHERE id = ? LIMIT 1");
$st->bind_param('s', $uid);
$st->execute();
$actor = $st->get_result()->fetch_assoc();
$st->close();
if (!$actor || $actor['status'] !== 'active') bx_fail(403, 'Access denied: inactive or unknown user.');
$role = (string)$actor['role'];
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$isViewAllRole = ($method === 'GET' && in_array($action, ['pos_status', 'discounts_list'], true));
if (!in_array($role, $isViewAllRole ? ['admin', 'staff', 'cashier'] : ['admin', 'staff'], true)) {
    bx_fail(403, 'Access denied: Expiration Tracking is available to Administrators and Inventory Staff only.');
}
$isAdmin = ($role === 'admin');

function bx_audit(mysqli $conn, array $actor, string $action, string $details, ?string $productId, string $entityName, string $field, ?string $old, ?string $new, ?string $ref, ?string $reason): void {
    $now = date('Y-m-d H:i:s');
    $entity = 'Inventory';
    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
    $uidv = (string)$actor['id']; $un = (string)$actor['name']; $ur = (string)$actor['role'];
    $pid = (string)($productId ?? '');
    $st = $conn->prepare("INSERT INTO audit_logs (created_at, user_id, user_name, user_role, action, entity, product_id, entity_name, field_changed, old_value, new_value, reference_no, reason, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    if (!$st) return;
    $st->bind_param('sssssssssssssss', $now, $uidv, $un, $ur, $action, $entity, $pid, $entityName, $field, $old, $new, $ref, $reason, $details, $ip);
    $st->execute();
    $st->close();
}

const BX_SELECT = "SELECT b.*, ps.container_size, ps.price_per_can,
        COALESCE(NULLIF(p.name, ''), p.product_name) AS product_name,
        p.brand, COALESCE(NULLIF(p.category, ''), p.type) AS category, p.type AS product_type, p.color, p.color_hex, p.status AS product_status
    FROM inventory_batches b
    LEFT JOIN product_sizes ps ON ps.size_id = b.size_id
    LEFT JOIN products p ON p.id = b.product_id";

function bx_shape(array $r, array $t, array $disc = ['enabled' => false, 'criticalPct' => 0.0, 'soonPct' => 0.0, 'tiers' => []], ?array $rule = null): array {
    $days = batchDaysRemaining($r['expiration_date'] ?? null);
    $remaining = (int)$r['remaining_qty'];
    $status = batchExpirationStatus($days, $t);
    $pricePerCan = isset($r['price_per_can']) ? round((float)$r['price_per_can'], 2) : null;
    $dc = batchComputeDiscount($days, $remaining, $pricePerCan, $disc, $rule);
    return [
        'batchId' => $r['batch_id'],
        'sizeId' => $r['size_id'],
        'productId' => $r['product_id'],
        'productName' => $r['product_name'] ?? '(deleted product)',
        'brand' => $r['brand'] ?? '',
        'category' => $r['category'] ?? '',
        'color' => $r['color'] ?? '',
        'colorHex' => $r['color_hex'] ?? null,
        'containerSize' => isset($r['container_size']) ? (float)$r['container_size'] : null,
        'pricePerCan' => $pricePerCan,
        'discountPct' => $dc['discountPct'],
        'discountAmount' => $dc['discountAmount'],
        'discountedPrice' => $dc['discountedPrice'],
        'discountStatus' => $dc['discountStatus'],
        'discountSource' => $dc['discountSource'],
        'discountRule' => $rule,
        'batchNumber' => $r['batch_number'],
        'supplierId' => $r['supplier_id'],
        'supplierName' => $r['supplier_name'] ?? '',
        'poId' => $r['po_id'],
        'poNumber' => $r['po_number'],
        'dateReceived' => $r['date_received'],
        'expirationDate' => $r['expiration_date'],
        'daysRemaining' => $days,
        'originalQty' => (int)$r['original_qty'],
        'remainingQty' => $remaining,
        'unitCost' => $r['unit_cost'] !== null ? (float)$r['unit_cost'] : null,
        'source' => $r['source'],
        'notes' => $r['notes'],
        'createdBy' => $r['created_by'],
        'updatedBy' => $r['updated_by'],
        'updatedAt' => $r['updated_at'],
        'depleted' => $remaining <= 0,
        'status' => $remaining <= 0 ? 'depleted' : $status,
        'expiryStatus' => $status,
    ];
}

function bx_summary(array $batches): array {
    $s = ['total' => 0, 'good' => 0, 'soon' => 0, 'critical' => 0, 'expired' => 0, 'none' => 0,
          'unitsGood' => 0, 'unitsSoon' => 0, 'unitsCritical' => 0, 'unitsExpired' => 0, 'unitsNone' => 0, 'valueAtRisk' => 0.0];
    foreach ($batches as $b) {
        if ($b['depleted']) continue;
        $s['total']++;
        $k = $b['expiryStatus'];
        $s[$k]++;
        $u = 'units' . ucfirst($k);
        $s[$u] += $b['remainingQty'];
        if (in_array($k, ['critical', 'expired'], true) && $b['unitCost'] !== null) {
            $s['valueAtRisk'] += $b['remainingQty'] * $b['unitCost'];
        }
    }
    return $s;
}

function bx_load_all(mysqli $conn, array $t, array $disc = ['enabled' => false, 'criticalPct' => 0.0, 'soonPct' => 0.0, 'tiers' => []], array $rules = []): array {
    $out = [];
    $res = $conn->query(BX_SELECT . " ORDER BY b.date_received ASC, b.batch_id ASC");
    if ($res) {
        while ($r = $res->fetch_assoc()) {
            $bid = (string)$r['batch_id'];
            $out[] = bx_shape($r, $t, $disc, $rules[$bid] ?? null);
        }
    }
    return $out;
}

$thresholds = batchGetThresholds($conn);
$discountSettings = batchGetDiscountSettings($conn);
$discountRules = batchLoadDiscountRules($conn);

try {
    if ($method === 'GET' && $action === 'pos_status') {
        $today = date('Y-m-d');
        $bySize = [];
        $res = $conn->query("SELECT b.batch_id, b.batch_number, b.size_id, b.expiration_date, b.remaining_qty, ps.price_per_can
            FROM inventory_batches b
            LEFT JOIN product_sizes ps ON ps.size_id = b.size_id
            WHERE b.remaining_qty > 0
            ORDER BY b.date_received ASC, (b.expiration_date IS NULL) ASC, b.expiration_date ASC, b.batch_id ASC");
        if ($res) {
            while ($r = $res->fetch_assoc()) {
                $sid = (string)$r['size_id'];
                if (!isset($bySize[$sid])) {
                    $bySize[$sid] = [
                        'nonExpiredQty' => 0,
                        'expiredQty' => 0,
                        'discountedQty' => 0,
                        'regularQty' => 0,
                        'discountedBatches' => [],
                        'regularBatches' => [],
                        'bestDiscountPct' => 0.0,
                        'bestDiscountAmount' => 0.0,
                        'bestOriginalPrice' => null,
                        'bestDiscountedPrice' => null,
                        'bestDiscountBatchId' => null,
                        'bestDiscountBatchNumber' => null,
                        'bestDiscountExpiryDate' => null,
                        'bestDiscountDaysRemaining' => null,
                        'bestRegularBatchId' => null,
                        'bestRegularBatchNumber' => null,
                        'bestRegularExpiryDate' => null,
                        'bestRegularDaysRemaining' => null,
                        'bestRegularQty' => 0,
                        'fifoBatchId' => null,
                        'fifoBatchNumber' => null,
                        'fifoExpiryStatus' => null,
                        'fifoDaysRemaining' => null,
                        'fifoOriginalPrice' => null,
                        'fifoDiscountPct' => 0.0,
                        'fifoDiscountAmount' => 0.0,
                        'fifoDiscountedPrice' => null
                    ];
                }
                $rem = (int)$r['remaining_qty'];
                $exp = $r['expiration_date'];
                if (!empty($exp) && $exp < $today) {
                    $bySize[$sid]['expiredQty'] += $rem;
                    continue;
                }
                $bySize[$sid]['nonExpiredQty'] += $rem;
                $days = batchDaysRemaining($exp);
                $st = batchExpirationStatus($days, $thresholds);
                $pricePerCan = isset($r['price_per_can']) ? round((float)$r['price_per_can'], 2) : null;
                $rule = $discountRules[(string)$r['batch_id']] ?? null;
                $dc = batchComputeDiscount($days, $rem, $pricePerCan, $discountSettings, $rule);

                if ($dc['discountPct'] > 0 && $dc['discountStatus'] === 'active') {
                    $bySize[$sid]['discountedQty'] += $rem;
                    $bySize[$sid]['discountedBatches'][] = [
                        'batchId' => $r['batch_id'],
                        'batchNumber' => $r['batch_number'],
                        'remainingQty' => $rem,
                        'expirationDate' => $exp,
                        'daysRemaining' => $days,
                        'expiryStatus' => $st,
                        'originalPrice' => $pricePerCan,
                        'discountPct' => $dc['discountPct'],
                        'discountAmount' => $dc['discountAmount'],
                        'discountedPrice' => $dc['discountedPrice'],
                    ];
                    if ($bySize[$sid]['bestDiscountBatchId'] === null) {
                        $bySize[$sid]['bestDiscountPct'] = $dc['discountPct'];
                        $bySize[$sid]['bestDiscountAmount'] = $dc['discountAmount'];
                        $bySize[$sid]['bestOriginalPrice'] = $pricePerCan;
                        $bySize[$sid]['bestDiscountedPrice'] = $dc['discountedPrice'];
                        $bySize[$sid]['bestDiscountBatchId'] = $r['batch_id'];
                        $bySize[$sid]['bestDiscountBatchNumber'] = $r['batch_number'];
                        $bySize[$sid]['bestDiscountExpiryDate'] = $exp;
                        $bySize[$sid]['bestDiscountDaysRemaining'] = $days;
                    }
                } else {
                    $bySize[$sid]['regularQty'] += $rem;
                    $bySize[$sid]['regularBatches'][] = [
                        'batchId' => $r['batch_id'],
                        'batchNumber' => $r['batch_number'],
                        'remainingQty' => $rem,
                        'expirationDate' => $exp,
                        'daysRemaining' => $days,
                        'expiryStatus' => $st,
                        'originalPrice' => $pricePerCan,
                    ];
                    if ($bySize[$sid]['bestRegularBatchId'] === null) {
                        $bySize[$sid]['bestRegularBatchId'] = $r['batch_id'];
                        $bySize[$sid]['bestRegularBatchNumber'] = $r['batch_number'];
                        $bySize[$sid]['bestRegularExpiryDate'] = $exp;
                        $bySize[$sid]['bestRegularDaysRemaining'] = $days;
                        $bySize[$sid]['bestRegularQty'] = $rem;
                    }
                }

                if ($bySize[$sid]['fifoBatchId'] === null) {
                    $bySize[$sid]['fifoBatchId'] = $r['batch_id'];
                    $bySize[$sid]['fifoBatchNumber'] = $r['batch_number'];
                    $bySize[$sid]['fifoExpiryStatus'] = $st;
                    $bySize[$sid]['fifoDaysRemaining'] = $days;
                    $bySize[$sid]['fifoOriginalPrice'] = $pricePerCan;
                    $bySize[$sid]['fifoDiscountPct'] = $dc['discountPct'];
                    $bySize[$sid]['fifoDiscountAmount'] = $dc['discountAmount'];
                    $bySize[$sid]['fifoDiscountedPrice'] = $dc['discountedPrice'];
                }
            }
        }
        echo json_encode([
            'success' => true,
            'thresholds' => $thresholds,
            'discountSettings' => $discountSettings,
            'bySize' => $bySize
        ]);
        exit;
    }

    if ($method === 'GET' && $action === 'discounts_list') {
        $batches = bx_load_all($conn, $thresholds, $discountSettings, $discountRules);
        $cats = []; $sups = []; $sizes = [];
        foreach ($batches as $b) {
            if ($b['category'] !== '' && $b['category'] !== null) $cats[$b['category']] = true;
            if (!empty($b['supplierName'])) $sups[$b['supplierName']] = true;
            if ($b['containerSize'] !== null) $sizes[(string)$b['containerSize']] = (float)$b['containerSize'];
        }
        ksort($cats); ksort($sups); asort($sizes);
        echo json_encode([
            'success' => true,
            'today' => date('Y-m-d'),
            'thresholds' => $thresholds,
            'discountSettings' => $discountSettings,
            'categories' => array_keys($cats),
            'suppliers' => array_keys($sups),
            'sizes' => array_values($sizes),
            'batches' => $batches,
            'permissions' => [
                'canView' => true,
                'canManageDiscounts' => $isAdmin,
                'role' => $role,
            ],
        ]);
        exit;
    }

    if ($method === 'GET' && $action === 'list') {
        $batches = bx_load_all($conn, $thresholds, $discountSettings, $discountRules);
        $cats = []; $sups = [];
        foreach ($batches as $b) {
            if ($b['category'] !== '' && $b['category'] !== null) $cats[$b['category']] = true;
            if (!empty($b['supplierName'])) $sups[$b['supplierName']] = true;
        }
        ksort($cats); ksort($sups);
        $supplierOptions = [];
        $supRes = $conn->query("SELECT id, name FROM suppliers ORDER BY name ASC");
        if ($supRes) {
            while ($sr = $supRes->fetch_assoc()) {
                $supplierOptions[] = ['id' => $sr['id'], 'name' => $sr['name']];
            }
        }
        $canEditAny = in_array($role, ['admin', 'staff'], true);
        echo json_encode([
            'success' => true,
            'today' => date('Y-m-d'),
            'thresholds' => $thresholds,
            'discountSettings' => $discountSettings,
            'summary' => bx_summary($batches),
            'categories' => array_keys($cats),
            'suppliers' => array_keys($sups),
            'supplierOptions' => $supplierOptions,
            'batches' => $batches,
            'permissions' => [
                'canEdit' => $canEditAny,
                'canEditFull' => false,
                'canEditExpiryOnly' => $canEditAny,
                'canAdjust' => $isAdmin,
                'role' => $role,
            ],
        ]);
        exit;
    }

    if ($method === 'GET' && $action === 'summary') {
        $batches = bx_load_all($conn, $thresholds);
        $sum = bx_summary($batches);
        // Nearest-expiry in-stock batches for dashboard widgets
        $att = array_values(array_filter($batches, fn($b) => !$b['depleted'] && in_array($b['expiryStatus'], ['expired', 'critical', 'soon'], true)));
        usort($att, fn($a, $b) => $a['daysRemaining'] <=> $b['daysRemaining']);
        echo json_encode(['success' => true, 'thresholds' => $thresholds, 'summary' => $sum, 'attention' => array_slice($att, 0, 5)]);
        exit;
    }

    if ($method === 'GET' && $action === 'detail') {
        $bid = trim((string)($_GET['batch_id'] ?? ''));
        $st = $conn->prepare(BX_SELECT . " WHERE b.batch_id = ? LIMIT 1");
        $st->bind_param('s', $bid);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$row) bx_fail(404, 'Batch not found.');
        $batch = bx_shape($row, $thresholds, $discountSettings, $discountRules[$bid] ?? null);

        // Product info
        $st = $conn->prepare("SELECT p.*, ps.price_per_liter, ps.price_per_can, ps.minimum_stock FROM product_sizes ps JOIN products p ON p.id = ps.product_id WHERE ps.size_id = ? LIMIT 1");
        $st->bind_param('s', $batch['sizeId']);
        $st->execute();
        $p = $st->get_result()->fetch_assoc();
        $st->close();
        $product = null;
        if ($p) {
            $product = [
                'id' => $p['id'], 'productId' => $p['product_id'] ?: $p['id'],
                'name' => $p['name'] ?: $p['product_name'], 'brand' => $p['brand'],
                'type' => $p['type'], 'category' => $p['category'] ?: $p['type'],
                'color' => $p['color'], 'colorHex' => $p['color_hex'], 'status' => $p['status'],
                'taxClassification' => $p['tax_classification'] ?? 'vatable',
                'pricePerLiter' => (float)$p['price_per_liter'], 'pricePerCan' => (float)$p['price_per_can'],
                'minimumStock' => (int)$p['minimum_stock'],
            ];
        }
        // Size level stock (central inventory vs batch total)
        $st = $conn->prepare("SELECT inv.sealed_quantity, COALESCE((SELECT SUM(remaining_qty) FROM inventory_batches WHERE size_id = inv.size_id), 0) AS batched, (SELECT COUNT(*) FROM inventory_batches WHERE size_id = inv.size_id AND remaining_qty > 0) AS open_batches FROM inventory inv WHERE inv.size_id = ?");
        $st->bind_param('s', $batch['sizeId']);
        $st->execute();
        $inv = $st->get_result()->fetch_assoc() ?: ['sealed_quantity' => 0, 'batched' => 0, 'open_batches' => 0];
        $st->close();

        // Batch ledger
        $st = $conn->prepare("SELECT bm.*, m.type AS movement_type FROM batch_movements bm LEFT JOIN movements m ON m.id = SUBSTRING_INDEX(bm.movement_id, '#', 1) WHERE bm.batch_id = ? ORDER BY bm.created_at DESC, bm.id DESC");
        $st->bind_param('s', $bid);
        $st->execute();
        $rs = $st->get_result();
        $ledger = [];
        while ($r = $rs->fetch_assoc()) {
            $ledger[] = [
                'id' => (int)$r['id'], 'movementId' => $r['movement_id'], 'type' => $r['type'],
                'movementType' => $r['movement_type'], 'qtyChange' => (int)$r['qty_change'],
                'balanceAfter' => (int)$r['balance_after'], 'reference' => $r['reference'],
                'note' => $r['note'], 'staff' => $r['staff_name'], 'date' => $r['created_at'],
            ];
        }
        $st->close();
        $fifo = array_values(array_filter($ledger, fn($l) => in_array($l['type'], ['fifo_deduction', 'reconciliation'], true) && $l['qtyChange'] < 0));
        $totalDeducted = array_sum(array_map(fn($l) => -$l['qtyChange'], $fifo));

        // Movement history for this container size (central stock movement log)
        $st = $conn->prepare("SELECT id, date, type, qty_change, staff_name, note FROM movements WHERE size_id = ? AND date >= ? ORDER BY date DESC LIMIT 150");
        $since = $batch['dateReceived'];
        $st->bind_param('ss', $batch['sizeId'], $since);
        $st->execute();
        $rs = $st->get_result();
        $mv = [];
        while ($r = $rs->fetch_assoc()) {
            $mv[] = ['id' => $r['id'], 'date' => $r['date'], 'type' => $r['type'], 'qtyChange' => (float)$r['qty_change'], 'staff' => $r['staff_name'], 'note' => $r['note']];
        }
        $st->close();

        $canEditAny = in_array($role, ['admin', 'staff'], true);
        echo json_encode([
            'success' => true, 'batch' => $batch, 'product' => $product,
            'inventory' => ['sealedQuantity' => (int)$inv['sealed_quantity'], 'batchedQuantity' => (int)$inv['batched'], 'openBatches' => (int)$inv['open_batches']],
            'ledger' => $ledger, 'fifoDeductions' => $fifo, 'fifoTotal' => $totalDeducted, 'stockMovements' => $mv,
            'thresholds' => $thresholds,
            'permissions' => ['canEdit' => $canEditAny, 'canEditFull' => false, 'canEditExpiryOnly' => $canEditAny, 'canAdjust' => $isAdmin, 'role' => $role],
        ]);
        exit;
    }

    if ($method === 'POST' && $action === 'update_batch') {
        if (!in_array($role, ['admin', 'staff'], true)) {
            bx_fail(403, 'Access denied: you do not have permission to edit expiration dates.');
        }
        $rawBody = file_get_contents('php://input');
        $d = json_decode($rawBody, true);
        if (!is_array($d)) {
            bx_fail(400, 'Invalid JSON request payload.');
        }

        // Strict allowlist: Expiration Tracking may ONLY update expirationDate.
        // Reject any request attempting to pass protected or unexpected fields (for ALL roles, including Admin).
        $allowedKeys = ['batchId', 'expirationDate', 'reason'];
        $disallowedKeys = array_values(array_diff(array_keys($d), $allowedKeys));
        if (!empty($disallowedKeys)) {
            bx_fail(403, 'Unauthorized field modification rejected: only Expiration Date can be updated in Expiration Tracking (rejected: ' . implode(', ', $disallowedKeys) . ').');
        }

        $bid = trim((string)($d['batchId'] ?? ''));
        if ($bid === '') bx_fail(422, 'Batch ID is required.');
        if (!array_key_exists('expirationDate', $d)) {
            bx_fail(422, 'Expiration date field is required (send empty string or null to mark as Not Specified).');
        }
        $reason = trim((string)($d['reason'] ?? ''));
        if ($reason === '' || mb_strlen($reason) < 5) {
            bx_fail(422, 'Please provide a reason for the change (at least 5 characters).');
        }
        if (mb_strlen($reason) > 300) {
            $reason = mb_substr($reason, 0, 300);
        }

        $conn->begin_transaction();
        $st = $conn->prepare("SELECT * FROM inventory_batches WHERE batch_id = ? FOR UPDATE");
        $st->bind_param('s', $bid);
        $st->execute();
        $old = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$old) { $conn->rollback(); bx_fail(404, 'Batch not found.'); }

        $expRaw = $d['expirationDate'];
        if ($expRaw !== null && !is_string($expRaw)) {
            $conn->rollback();
            bx_fail(422, 'Invalid expiration date format.');
        }
        $exp = batchNormalizeDate($expRaw);
        if ($expRaw !== null && trim((string)$expRaw) !== '' && $exp === null) {
            $conn->rollback();
            bx_fail(422, 'Invalid expiration date.');
        }

        $oldRecvDate = substr((string)$old['date_received'], 0, 10);
        if ($exp !== null && $oldRecvDate !== '' && $exp < $oldRecvDate) {
            $conn->rollback();
            bx_fail(422, 'Expiration date cannot be earlier than the date received.');
        }

        $oldExpVal = $old['expiration_date'] ?: null;
        if ($oldExpVal === $exp) {
            $conn->rollback();
            echo json_encode(['success' => true, 'unchanged' => true]);
            exit;
        }

        $oldExpLabel = $oldExpVal ?: 'Not specified';
        $newExpLabel = $exp ?: 'Not specified';
        $by = (string)$actor['name'];
        $number = (string)$old['batch_number'];

        // Database-level protection: ONLY update expiration_date and updated_by
        $up = $conn->prepare("UPDATE inventory_batches SET expiration_date = ?, updated_by = ? WHERE batch_id = ?");
        $up->bind_param('sss', $exp, $by, $bid);
        $up->execute();
        $up->close();

        $summaryTxt = "Expiration Date: {$oldExpLabel} → {$newExpLabel}";
        batchLog($conn, $bid, null, 'edit', 0, (int)$old['remaining_qty'], null, $summaryTxt . ' — Reason: ' . $reason, $by);
        bx_audit(
            $conn,
            $actor,
            'BATCH_EDIT',
            "Edited expiration date for batch {$number} ({$old['size_id']}) — {$summaryTxt}",
            $old['product_id'],
            $number,
            'Expiration Date',
            $oldExpLabel,
            $newExpLabel,
            $number,
            $reason
        );
        $conn->commit();

        // Reload shaped batch + summary so UI and alerts reflect recalculated expiration status immediately
        $st2 = $conn->prepare(BX_SELECT . " WHERE b.batch_id = ? LIMIT 1");
        $st2->bind_param('s', $bid);
        $st2->execute();
        $updatedRow = $st2->get_result()->fetch_assoc();
        $st2->close();
        $updatedBatch = $updatedRow ? bx_shape($updatedRow, $thresholds, $discountSettings, $discountRules[$bid] ?? null) : null;

        echo json_encode(['success' => true, 'changes' => $summaryTxt, 'batch' => $updatedBatch]);
        exit;
    }

    if ($method === 'POST' && $action === 'save_thresholds') {
        if (!$isAdmin) bx_fail(403, 'Access denied: only Administrators can change expiration thresholds.');
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $crit = (int)($d['critical'] ?? -1);
        $soon = (int)($d['soon'] ?? -1);
        if ($crit < 1 || $crit > 365 || $soon <= $crit || $soon > 730) bx_fail(422, 'Thresholds must satisfy 1 ≤ Critical < Expiring Soon ≤ 730 days.');
        $json = json_encode(['critical' => $crit, 'soon' => $soon]);
        $st = $conn->prepare("INSERT INTO settings (setting_key, setting_value) VALUES ('expiration_thresholds', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        $st->bind_param('s', $json);
        $st->execute();
        $st->close();
        bx_audit($conn, $actor, 'EXPIRY_THRESHOLD_CHANGE', "Changed expiration thresholds: Critical ≤ {$crit} days, Expiring Soon ≤ {$soon} days (was {$thresholds['critical']} / {$thresholds['soon']})",
            null, 'Expiration Thresholds', 'Expiration Thresholds', "{$thresholds['critical']} / {$thresholds['soon']} days", "$crit / $soon days", null, 'Threshold configuration');
        echo json_encode(['success' => true, 'thresholds' => ['critical' => $crit, 'soon' => $soon]]);
        exit;
    }

    if ($method === 'POST' && $action === 'save_discount_settings') {
        if (!$isAdmin) bx_fail(403, 'Access denied: only Administrators can configure near-expiry discounts.');
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $enabled = !empty($d['enabled']);
        $critPct = round((float)($d['criticalPct'] ?? ($discountSettings['criticalPct'] ?? 0)), 2);
        $soonPct = round((float)($d['soonPct'] ?? ($discountSettings['soonPct'] ?? 0)), 2);
        if ($critPct < 0 || $critPct > 90 || $soonPct < 0 || $soonPct > 90) {
            bx_fail(422, 'Discount percentages must be between 0% and 90%.');
        }
        $tiers = $discountSettings['tiers'] ?? batchDefaultDiscountTiers();
        if (isset($d['tiers']) && is_array($d['tiers'])) {
            $cleanTiers = [];
            foreach ($d['tiers'] as $tier) {
                if (!is_array($tier) || !isset($tier['days']) || !isset($tier['pct'])) continue;
                if (!is_numeric($tier['days']) || !is_numeric($tier['pct'])) {
                    bx_fail(422, 'Schedule tier days and percentages must be numeric.');
                }
                $days = (int)$tier['days'];
                $pct = round((float)$tier['pct'], 2);
                if ($days < 0 || $days > 730) bx_fail(422, 'Days before expiration must be between 0 and 730.');
                if ($pct < 0 || $pct > 90) bx_fail(422, 'Tier discount percentage must be between 0% and 90%.');
                $cleanTiers[$days] = ['days' => $days, 'pct' => $pct];
            }
            if (!$cleanTiers) bx_fail(422, 'At least one discount schedule tier is required.');
            krsort($cleanTiers, SORT_NUMERIC);
            $tiers = array_values($cleanTiers);
        }
        $reason = trim((string)($d['reason'] ?? 'Near-expiry discount schedule configuration'));
        if ($reason === '') $reason = 'Near-expiry discount schedule configuration';

        $clean = ['enabled' => $enabled, 'criticalPct' => $critPct, 'soonPct' => $soonPct, 'tiers' => $tiers];
        $json = json_encode($clean);
        $st = $conn->prepare("INSERT INTO settings (setting_key, setting_value) VALUES ('near_expiry_discount', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        $st->bind_param('s', $json);
        $st->execute();
        $st->close();
        bx_audit($conn, $actor, 'NEAR_EXPIRY_DISCOUNT_CONFIG',
            "Updated Near-Expiry Discount schedule: " . ($enabled ? "Enabled" : "Disabled"),
            null, 'Near-Expiry Discounts', 'Discount Schedule',
            json_encode($discountSettings), $json, null, $reason);
        echo json_encode(['success' => true, 'discountSettings' => $clean]);
        exit;
    }

    if ($method === 'POST' && $action === 'save_discount_rule') {
        if (!$isAdmin) bx_fail(403, 'Access denied: only Administrators can create or edit batch discount rules.');
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $bid = trim((string)($d['batchId'] ?? ''));
        if ($bid === '') bx_fail(422, 'Batch ID is required.');
        if (!isset($d['discountPct']) || !is_numeric($d['discountPct'])) bx_fail(422, 'Discount percentage must be numeric.');
        $pct = round((float)$d['discountPct'], 2);
        if ($pct < 0 || $pct > 90) bx_fail(422, 'Discount percentage must be between 0% and 90%.');

        $daysBefore = null;
        if (isset($d['daysBeforeExpiry']) && $d['daysBeforeExpiry'] !== '' && $d['daysBeforeExpiry'] !== null) {
            if (!is_numeric($d['daysBeforeExpiry'])) bx_fail(422, 'Days before expiration must be numeric.');
            $daysBefore = (int)$d['daysBeforeExpiry'];
            if ($daysBefore < 0 || $daysBefore > 730) bx_fail(422, 'Days before expiration must be between 0 and 730.');
        }
        $isActive = !isset($d['isActive']) || !empty($d['isActive']) ? 1 : 0;
        $notesRaw = trim((string)($d['notes'] ?? ''));
        $notes = ($notesRaw === '') ? null : mb_substr($notesRaw, 0, 500);
        $reason = trim((string)($d['reason'] ?? ''));
        if (mb_strlen($reason) < 5) bx_fail(422, 'Please provide a reason for change (at least 5 characters).');

        $st = $conn->prepare(BX_SELECT . " WHERE b.batch_id = ? LIMIT 1");
        $st->bind_param('s', $bid);
        $st->execute();
        $batchRow = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$batchRow) bx_fail(404, 'Batch not found.');
        if (empty($batchRow['expiration_date'])) bx_fail(422, 'Cannot apply near-expiry discount to a batch without an expiration date.');
        $daysRem = batchDaysRemaining($batchRow['expiration_date']);
        if ($daysRem !== null && $daysRem < 0) bx_fail(422, 'Cannot apply discount to an expired batch.');
        if ((int)$batchRow['remaining_qty'] <= 0) bx_fail(422, 'Cannot apply discount to a depleted batch.');

        $oldRule = $discountRules[$bid] ?? null;
        $oldComputed = batchComputeDiscount($daysRem, (int)$batchRow['remaining_qty'], isset($batchRow['price_per_can']) ? (float)$batchRow['price_per_can'] : null, $discountSettings, $oldRule);
        $oldPctStr = number_format((float)$oldComputed['discountPct'], 2) . '%';
        $newPctStr = ($isActive ? number_format($pct, 2) . '%' : '0.00% (Inactive)');

        $by = (string)$actor['name'];
        $did = $oldRule ? $oldRule['discountId'] : ('bd_' . bin2hex(random_bytes(8)));
        $up = $conn->prepare("INSERT INTO batch_discounts (discount_id, batch_id, discount_pct, days_before_expiry, is_active, notes, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE discount_pct = VALUES(discount_pct), days_before_expiry = VALUES(days_before_expiry), is_active = VALUES(is_active), notes = VALUES(notes), updated_by = VALUES(updated_by)");
        $up->bind_param('ssdiisss', $did, $bid, $pct, $daysBefore, $isActive, $notes, $by, $by);
        $up->execute();
        $up->close();

        $bnum = (string)$batchRow['batch_number'];
        bx_audit($conn, $actor, 'NEAR_EXPIRY_BATCH_DISCOUNT',
            "Configured batch discount for {$bnum}: {$oldPctStr} → {$newPctStr}" . ($daysBefore !== null ? " (starts ≤ {$daysBefore}d)" : ''),
            $batchRow['product_id'], $bnum, 'Near-Expiry Discount',
            $oldPctStr, $newPctStr, $bnum, $reason);

        $newRules = batchLoadDiscountRules($conn);
        $shaped = bx_shape($batchRow, $thresholds, $discountSettings, $newRules[$bid] ?? null);
        echo json_encode(['success' => true, 'batch' => $shaped]);
        exit;
    }

    if ($method === 'POST' && $action === 'toggle_discount_rule') {
        if (!$isAdmin) bx_fail(403, 'Access denied: only Administrators can activate or deactivate discounts.');
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $bid = trim((string)($d['batchId'] ?? ''));
        $isActive = !empty($d['isActive']) ? 1 : 0;
        $reason = trim((string)($d['reason'] ?? ''));
        if ($bid === '') bx_fail(422, 'Batch ID is required.');
        if (mb_strlen($reason) < 5) bx_fail(422, 'Please provide a reason for change (at least 5 characters).');

        $st = $conn->prepare(BX_SELECT . " WHERE b.batch_id = ? LIMIT 1");
        $st->bind_param('s', $bid);
        $st->execute();
        $batchRow = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$batchRow) bx_fail(404, 'Batch not found.');

        $daysRem = batchDaysRemaining($batchRow['expiration_date'] ?? null);
        $oldRule = $discountRules[$bid] ?? null;
        $oldComputed = batchComputeDiscount($daysRem, (int)$batchRow['remaining_qty'], isset($batchRow['price_per_can']) ? (float)$batchRow['price_per_can'] : null, $discountSettings, $oldRule);
        $oldPctStr = number_format((float)$oldComputed['discountPct'], 2) . '%';
        $pctToKeep = $oldRule ? (float)$oldRule['discountPct'] : (float)$oldComputed['discountPct'];
        if ($isActive === 1 && $pctToKeep <= 0) {
            bx_fail(422, 'Please configure a discount percentage greater than 0% before activating this batch discount.');
        }
        $daysBefore = $oldRule ? $oldRule['daysBeforeExpiry'] : null;
        $notes = $oldRule ? ($oldRule['notes'] !== '' ? $oldRule['notes'] : null) : null;

        $by = (string)$actor['name'];
        $did = $oldRule ? $oldRule['discountId'] : ('bd_' . bin2hex(random_bytes(8)));
        $up = $conn->prepare("INSERT INTO batch_discounts (discount_id, batch_id, discount_pct, days_before_expiry, is_active, notes, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE is_active = VALUES(is_active), updated_by = VALUES(updated_by)");
        $up->bind_param('ssdiisss', $did, $bid, $pctToKeep, $daysBefore, $isActive, $notes, $by, $by);
        $up->execute();
        $up->close();

        $newPctStr = $isActive ? (number_format($pctToKeep, 2) . '% (Active)') : '0.00% (Deactivated)';
        $bnum = (string)$batchRow['batch_number'];
        bx_audit($conn, $actor, 'NEAR_EXPIRY_BATCH_DISCOUNT',
            ($isActive ? 'Activated' : 'Deactivated') . " near-expiry discount for batch {$bnum}: {$oldPctStr} → {$newPctStr}",
            $batchRow['product_id'], $bnum, 'Near-Expiry Discount Status',
            $oldPctStr, $newPctStr, $bnum, $reason);

        $newRules = batchLoadDiscountRules($conn);
        $shaped = bx_shape($batchRow, $thresholds, $discountSettings, $newRules[$bid] ?? null);
        echo json_encode(['success' => true, 'batch' => $shaped]);
        exit;
    }

    if ($method === 'POST' && $action === 'delete_discount_rule') {
        if (!$isAdmin) bx_fail(403, 'Access denied: only Administrators can delete discount rules.');
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $bid = trim((string)($d['batchId'] ?? ''));
        $reason = trim((string)($d['reason'] ?? ''));
        if ($bid === '') bx_fail(422, 'Batch ID is required.');
        if (mb_strlen($reason) < 5) bx_fail(422, 'Please provide a reason for deleting the discount rule (at least 5 characters).');

        $oldRule = $discountRules[$bid] ?? null;
        if (!$oldRule) bx_fail(404, 'No custom discount rule exists for this batch.');

        $st = $conn->prepare(BX_SELECT . " WHERE b.batch_id = ? LIMIT 1");
        $st->bind_param('s', $bid);
        $st->execute();
        $batchRow = $st->get_result()->fetch_assoc();
        $st->close();

        $del = $conn->prepare("DELETE FROM batch_discounts WHERE batch_id = ?");
        $del->bind_param('s', $bid);
        $del->execute();
        $del->close();

        $bnum = $batchRow ? (string)$batchRow['batch_number'] : $bid;
        $oldPctStr = number_format((float)$oldRule['discountPct'], 2) . '%';
        bx_audit($conn, $actor, 'NEAR_EXPIRY_DISCOUNT_DELETE',
            "Deleted custom discount rule for batch {$bnum} (was {$oldPctStr})",
            $batchRow['product_id'] ?? null, $bnum, 'Near-Expiry Discount Rule',
            $oldPctStr, 'Deleted (reverted to schedule)', $bnum, $reason);

        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'POST' && $action === 'log_export') {
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $rows = (int)($d['rows'] ?? 0);
        $filter = substr((string)($d['filter'] ?? 'all'), 0, 120);
        bx_audit($conn, $actor, 'EXPIRY_REPORT_EXPORT', "Exported Expiration Report ($rows batch record(s), filter: $filter)", null, 'Expiration Report', 'Export', null, "$rows rows", null, null);
        echo json_encode(['success' => true]);
        exit;
    }

    bx_fail(400, 'Unknown action.');
} catch (Throwable $e) {
    try { $conn->rollback(); } catch (Throwable $x) {}
    bx_fail(500, $e->getMessage());
}
