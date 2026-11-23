<?php
/**
 * Expiration Tracking — batch ledger library (MRGR Color Center)
 *
 * Batches are NOT a second stock count. They are a lot-level breakdown of the single
 * centralized `inventory.sealed_quantity`. Invariant (enforced by batchReconcile()):
 *
 *      SUM(inventory_batches.remaining_qty WHERE size_id = X)  ==  inventory.sealed_quantity (size X)
 *
 * Every stock-changing movement that reaches api/db.php is routed here:
 *   - receiving (PO delivery)  -> creates a batch (batch no. / expiry / cost from the receiving form)
 *   - negative movement (POS sale, exchange, write-off ...) -> FIFO deduction (oldest received first)
 *   - positive non-receiving movement (return, void restore, count correction) -> refills depleted batches
 * Anything that changes inventory without a movement is healed by batchReconcile().
 */

const BATCH_DEFAULT_CRITICAL_DAYS = 30;
const BATCH_DEFAULT_SOON_DAYS = 90;

function batchEnsureSchema(mysqli $conn): void {
    static $done = false;
    if ($done) return;
    $done = true;

    $flagV2 = __DIR__ . '/.batch_schema_v2';
    if (file_exists($flagV2)) return;

    // Ensure batch_discounts exists (guarded by .batch_schema_v2 so DDL does not run on every request)
    $conn->query("CREATE TABLE IF NOT EXISTS `batch_discounts` (
        `discount_id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `batch_id` VARCHAR(50) NOT NULL,
        `discount_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        `days_before_expiry` INT NULL,
        `is_active` TINYINT(1) NOT NULL DEFAULT 1,
        `notes` TEXT NULL,
        `created_by` VARCHAR(150) NULL,
        `updated_by` VARCHAR(150) NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uk_bd_batch` (`batch_id`),
        KEY `idx_bd_active` (`is_active`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $flag = __DIR__ . '/.batch_schema_v1';
    if (file_exists($flag)) {
        @file_put_contents($flagV2, date('Y-m-d H:i:s'));
        return;
    }

    $conn->query("CREATE TABLE IF NOT EXISTS `inventory_batches` (
        `batch_id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `size_id` VARCHAR(50) NOT NULL,
        `product_id` VARCHAR(50) NOT NULL,
        `product_name` VARCHAR(200) NULL,
        `brand` VARCHAR(100) NULL,
        `container_size` DECIMAL(10,2) NULL,
        `batch_number` VARCHAR(100) NOT NULL,
        `supplier_id` VARCHAR(50) NULL,
        `supplier_name` VARCHAR(200) NULL,
        `po_id` VARCHAR(50) NULL,
        `po_number` VARCHAR(50) NULL,
        `date_received` DATETIME NOT NULL,
        `expiration_date` DATE NULL,
        `original_qty` INT NOT NULL DEFAULT 0,
        `remaining_qty` INT NOT NULL DEFAULT 0,
        `unit_cost` DECIMAL(10,2) NULL,
        `source` VARCHAR(30) NOT NULL DEFAULT 'receiving',
        `notes` TEXT NULL,
        `created_by` VARCHAR(150) NULL,
        `updated_by` VARCHAR(150) NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY `idx_batch_size` (`size_id`),
        KEY `idx_batch_product` (`product_id`),
        KEY `idx_batch_exp` (`expiration_date`),
        KEY `idx_batch_received` (`date_received`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $conn->query("CREATE TABLE IF NOT EXISTS `batch_movements` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `batch_id` VARCHAR(50) NOT NULL,
        `movement_id` VARCHAR(50) NULL,
        `type` VARCHAR(30) NOT NULL,
        `qty_change` INT NOT NULL DEFAULT 0,
        `balance_after` INT NOT NULL DEFAULT 0,
        `reference` VARCHAR(150) NULL,
        `note` TEXT NULL,
        `staff_name` VARCHAR(150) NULL,
        `created_at` DATETIME NOT NULL,
        KEY `idx_bm_batch` (`batch_id`),
        KEY `idx_bm_movement` (`movement_id`),
        UNIQUE KEY `uk_bm_movement_batch` (`movement_id`, `batch_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // First run: snapshot current inventory as opening-balance batches BEFORE any new movement is processed
    batchReconcile($conn, 'System');
    @file_put_contents($flag, date('Y-m-d H:i:s'));
}

function batchGetThresholds(mysqli $conn): array {
    $t = ['critical' => BATCH_DEFAULT_CRITICAL_DAYS, 'soon' => BATCH_DEFAULT_SOON_DAYS];
    try {
        $r = $conn->query("SELECT setting_value FROM settings WHERE setting_key = 'expiration_thresholds' LIMIT 1");
        if ($r && ($row = $r->fetch_assoc())) {
            $d = json_decode($row['setting_value'], true);
            if (is_array($d)) {
                if (isset($d['critical']) && (int)$d['critical'] >= 0) $t['critical'] = (int)$d['critical'];
                if (isset($d['soon']) && (int)$d['soon'] > $t['critical']) $t['soon'] = (int)$d['soon'];
            }
        }
    } catch (Throwable $e) { /* defaults */ }
    return $t;
}

function batchDefaultDiscountTiers(): array {
    return [
        ['days' => 90, 'pct' => 0.0],
        ['days' => 60, 'pct' => 5.0],
        ['days' => 30, 'pct' => 10.0],
        ['days' => 15, 'pct' => 20.0],
        ['days' => 7,  'pct' => 30.0],
    ];
}

function batchGetDiscountSettings(mysqli $conn): array {
    $d = [
        'enabled' => false,
        'criticalPct' => 0.0,
        'soonPct' => 0.0,
        'tiers' => batchDefaultDiscountTiers(),
    ];
    try {
        $r = $conn->query("SELECT setting_value FROM settings WHERE setting_key = 'near_expiry_discount' LIMIT 1");
        if ($r && ($row = $r->fetch_assoc())) {
            $parsed = json_decode($row['setting_value'], true);
            if (is_array($parsed)) {
                $d['enabled'] = !empty($parsed['enabled']);
                if (isset($parsed['criticalPct']) && is_numeric($parsed['criticalPct'])) {
                    $d['criticalPct'] = max(0.0, min(90.0, round((float)$parsed['criticalPct'], 2)));
                }
                if (isset($parsed['soonPct']) && is_numeric($parsed['soonPct'])) {
                    $d['soonPct'] = max(0.0, min(90.0, round((float)$parsed['soonPct'], 2)));
                }
                if (isset($parsed['tiers']) && is_array($parsed['tiers'])) {
                    $cleanTiers = [];
                    foreach ($parsed['tiers'] as $tier) {
                        if (!is_array($tier) || !isset($tier['days']) || !isset($tier['pct'])) continue;
                        $days = (int)$tier['days'];
                        $pct = max(0.0, min(90.0, round((float)$tier['pct'], 2)));
                        if ($days >= 0 && $days <= 730) {
                            $cleanTiers[$days] = ['days' => $days, 'pct' => $pct];
                        }
                    }
                    if ($cleanTiers) {
                        krsort($cleanTiers, SORT_NUMERIC);
                        $d['tiers'] = array_values($cleanTiers);
                    }
                } elseif ($d['criticalPct'] > 0 || $d['soonPct'] > 0) {
                    $d['tiers'] = [
                        ['days' => BATCH_DEFAULT_SOON_DAYS, 'pct' => $d['soonPct']],
                        ['days' => BATCH_DEFAULT_CRITICAL_DAYS, 'pct' => $d['criticalPct']],
                    ];
                }
            }
        }
    } catch (Throwable $e) { /* defaults */ }
    return $d;
}

function batchLoadDiscountRules(mysqli $conn): array {
    $rules = [];
    try {
        $res = $conn->query("SELECT * FROM batch_discounts");
        if ($res) {
            while ($r = $res->fetch_assoc()) {
                $rules[(string)$r['batch_id']] = [
                    'discountId' => $r['discount_id'],
                    'batchId' => $r['batch_id'],
                    'discountPct' => round((float)$r['discount_pct'], 2),
                    'daysBeforeExpiry' => $r['days_before_expiry'] !== null ? (int)$r['days_before_expiry'] : null,
                    'isActive' => (bool)((int)$r['is_active']),
                    'notes' => $r['notes'] ?? '',
                    'createdBy' => $r['created_by'] ?? null,
                    'updatedBy' => $r['updated_by'] ?? null,
                    'updatedAt' => $r['updated_at'] ?? null,
                ];
            }
        }
    } catch (Throwable $e) { /* empty */ }
    return $rules;
}

/**
 * Compute authoritative discount percentage, amount, price, and status for a single batch.
 * Enforces: no discount on depleted, expired, or no-expiration-date batches.
 */
function batchComputeDiscount(?int $daysRemaining, int $remainingQty, ?float $pricePerCan, array $discSettings, ?array $rule = null): array {
    $origPrice = $pricePerCan !== null ? round($pricePerCan, 2) : null;
    $pct = 0.0;
    $status = 'none'; // active | inactive | scheduled | expired | depleted | ineligible | none
    $source = 'none'; // batch | schedule | none

    if ($remainingQty <= 0) {
        $status = 'depleted';
    } elseif ($daysRemaining === null) {
        $status = 'ineligible';
    } elseif ($daysRemaining < 0) {
        $status = 'expired';
    } elseif ($rule !== null) {
        if (empty($rule['isActive'])) {
            $status = 'inactive';
            $source = 'batch';
        } elseif ($rule['daysBeforeExpiry'] !== null && $daysRemaining > (int)$rule['daysBeforeExpiry']) {
            $status = 'scheduled';
            $source = 'batch';
        } elseif ((float)$rule['discountPct'] > 0) {
            $pct = round((float)$rule['discountPct'], 2);
            $status = 'active';
            $source = 'batch';
        } else {
            $status = 'inactive';
            $source = 'batch';
        }
    } elseif (!empty($discSettings['enabled'])) {
        $tiers = $discSettings['tiers'] ?? [];
        // Find the tightest matching tier where daysRemaining <= tier.days
        $matchedDays = null;
        $matchedPct = 0.0;
        foreach ($tiers as $tier) {
            $td = (int)($tier['days'] ?? -1);
            $tp = (float)($tier['pct'] ?? 0);
            if ($td >= 0 && $daysRemaining <= $td) {
                if ($matchedDays === null || $td < $matchedDays) {
                    $matchedDays = $td;
                    $matchedPct = $tp;
                }
            }
        }
        if ($matchedPct > 0) {
            $pct = round($matchedPct, 2);
            $status = 'active';
            $source = 'schedule';
        } else {
            $status = 'none';
            $source = 'schedule';
        }
    } else {
        $status = 'inactive';
    }

    $discAmt = ($origPrice !== null && $pct > 0) ? round($origPrice * ($pct / 100.0), 2) : 0.0;
    $discPrice = ($origPrice !== null && $pct > 0) ? round(max(0.0, $origPrice - $discAmt), 2) : $origPrice;

    return [
        'discountPct' => $pct,
        'discountAmount' => $discAmt,
        'discountedPrice' => $discPrice,
        'discountStatus' => $status,
        'discountSource' => $source,
    ];
}

/** Days from today to the expiration date (negative = already expired). null when not specified. */
function batchDaysRemaining(?string $exp): ?int {
    if ($exp === null || $exp === '' || $exp === '0000-00-00') return null;
    static $todayTs = null;
    static $todayYmd = '';
    $curYmd = date('Y-m-d');
    if ($todayTs === null || $todayYmd !== $curYmd) {
        $todayYmd = $curYmd;
        $todayTs = strtotime($curYmd . ' 00:00:00');
    }
    $expYmd = substr($exp, 0, 10);
    $expTs = strtotime($expYmd . ' 00:00:00');
    if ($expTs === false) return null;
    return (int)round(($expTs - $todayTs) / 86400);
}

/** good | soon | critical | expired | none */
function batchExpirationStatus(?int $days, array $t): string {
    if ($days === null) return 'none';
    if ($days < 0) return 'expired';
    if ($days <= $t['critical']) return 'critical';
    if ($days <= $t['soon']) return 'soon';
    return 'good';
}

function batchNewId(mysqli $conn): string {
    $r = $conn->query("SELECT MAX(CAST(SUBSTRING(batch_id, 5) AS UNSIGNED)) AS mx FROM inventory_batches WHERE batch_id LIKE 'BAT-%' FOR UPDATE");
    $mx = 0;
    if ($r && ($row = $r->fetch_assoc())) $mx = (int)$row['mx'];
    return sprintf('BAT-%06d', $mx + 1);
}

function batchNormalizeDate($v): ?string {
    if ($v === null) return null;
    $v = trim((string)$v);
    if ($v === '') return null;
    $ts = strtotime($v);
    if ($ts === false) return null;
    return date('Y-m-d', $ts);
}

function batchLog(mysqli $conn, string $batchId, ?string $movementId, string $type, int $qty, int $balance, ?string $ref, ?string $note, ?string $staff, ?string $when = null): void {
    $when = $when ?: date('Y-m-d H:i:s');
    $st = $conn->prepare("INSERT IGNORE INTO batch_movements (batch_id, movement_id, type, qty_change, balance_after, reference, note, staff_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    if (!$st) return;
    $st->bind_param('sssiissss', $batchId, $movementId, $type, $qty, $balance, $ref, $note, $staff, $when);
    $st->execute();
    $st->close();
}

function batchLookupProductId(mysqli $conn, string $sizeId): ?string {
    $st = $conn->prepare("SELECT product_id FROM product_sizes WHERE size_id = ? LIMIT 1");
    if (!$st) return null;
    $st->bind_param('s', $sizeId);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    return $row ? (string)$row['product_id'] : null;
}

function batchLookupProductAndSize(mysqli $conn, string $sizeId, string $productId): array {
    $pName = null;
    $brand = null;
    $cSize = null;
    $st = $conn->prepare("SELECT p.name, p.product_name, p.brand, ps.container_size 
                          FROM product_sizes ps 
                          JOIN products p ON (p.id = ps.product_id OR p.product_id = ps.product_id) 
                          WHERE ps.size_id = ? LIMIT 1");
    if ($st) {
        $st->bind_param('s', $sizeId);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        if ($row) {
            $pName = !empty($row['name']) ? $row['name'] : $row['product_name'];
            $brand = $row['brand'];
            $cSize = (float)$row['container_size'];
        }
    }
    if ($pName === null) {
        $st = $conn->prepare("SELECT name, product_name, brand FROM products WHERE id = ? OR product_id = ? LIMIT 1");
        if ($st) {
            $st->bind_param('ss', $productId, $productId);
            $st->execute();
            $row = $st->get_result()->fetch_assoc();
            $st->close();
            if ($row) {
                $pName = !empty($row['name']) ? $row['name'] : $row['product_name'];
                $brand = $row['brand'];
            }
        }
    }
    return [$pName, $brand, $cSize];
}

function batchLookupSupplier(mysqli $conn, string $productId): array {
    $st = $conn->prepare("SELECT s.id, s.name FROM products p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ? OR p.product_id = ? LIMIT 1");
    if (!$st) return [null, null];
    $st->bind_param('ss', $productId, $productId);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    return $row ? [(string)$row['id'], (string)$row['name']] : [null, null];
}

function batchCreate(mysqli $conn, array $o): string {
    $id = batchNewId($conn);
    $sizeId = (string)$o['size_id'];
    $productId = (string)$o['product_id'];
    $number = trim((string)($o['batch_number'] ?? ''));
    if ($number === '') {
        $number = 'LOT-' . date('Ymd') . '-' . substr($id, 4);
    }
    $supId = $o['supplier_id'] ?? null;
    $supName = $o['supplier_name'] ?? null;
    if (($supId === null || $supId === '') && ($supName === null || $supName === '')) {
        [$supId, $supName] = batchLookupSupplier($conn, $productId);
    }
    $poId = $o['po_id'] ?? null;
    $poNum = $o['po_number'] ?? null;
    $received = $o['date_received'] ?? date('Y-m-d H:i:s');
    $exp = batchNormalizeDate($o['expiration_date'] ?? null);
    $qty = max(0, (int)$o['qty']);
    $cost = (isset($o['unit_cost']) && $o['unit_cost'] !== '' && $o['unit_cost'] !== null) ? (float)$o['unit_cost'] : null;
    $source = (string)($o['source'] ?? 'receiving');
    $notes = $o['notes'] ?? null;
    $by = $o['staff'] ?? null;

    $pName = $o['product_name'] ?? null;
    $brand = $o['brand'] ?? null;
    $cSize = isset($o['container_size']) && $o['container_size'] !== null ? (float)$o['container_size'] : null;
    if ($pName === null || $cSize === null) {
        [$lkpName, $lkpBrand, $lkpSize] = batchLookupProductAndSize($conn, $sizeId, $productId);
        if ($pName === null) $pName = $lkpName;
        if ($brand === null) $brand = $lkpBrand;
        if ($cSize === null) $cSize = $lkpSize;
    }

    $st = $conn->prepare("INSERT INTO inventory_batches (batch_id, size_id, product_id, product_name, brand, container_size, batch_number, supplier_id, supplier_name, po_id, po_number, date_received, expiration_date, original_qty, remaining_qty, unit_cost, source, notes, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $st->bind_param('sssssdsssssssiidssss', $id, $sizeId, $productId, $pName, $brand, $cSize, $number, $supId, $supName, $poId, $poNum, $received, $exp, $qty, $qty, $cost, $source, $notes, $by, $by);
    $st->execute();
    $st->close();
    return $id;
}

/** Deduct up to $need cans FIFO (earliest received first). Returns cans actually deducted.
 * If $allowExpired is false (default, e.g. for sales), batches whose expiration_date has passed are strictly blocked.
 */
function batchFifoDeduct(mysqli $conn, string $sizeId, int $need, ?string $movementId, string $logType, ?string $ref, ?string $note, ?string $staff, ?string $when = null, ?string $firstBatchId = null, bool $allowExpired = false): int {
    $deducted = 0;
    $order = [];
    $today = date('Y-m-d');
    if ($firstBatchId) $order[] = $firstBatchId;
    $sql = "SELECT batch_id, expiration_date FROM inventory_batches WHERE size_id = ? AND remaining_qty > 0 ORDER BY date_received ASC, (expiration_date IS NULL) ASC, expiration_date ASC, batch_id ASC";
    $res = $conn->prepare($sql);
    $res->bind_param('s', $sizeId);
    $res->execute();
    $rs = $res->get_result();
    while ($r = $rs->fetch_assoc()) {
        if (!$allowExpired && !empty($r['expiration_date']) && $r['expiration_date'] < $today) {
            continue; // Strictly block expired batches from FIFO sale deduction
        }
        if ($r['batch_id'] !== $firstBatchId) $order[] = $r['batch_id'];
    }
    $res->close();

    foreach ($order as $bid) {
        if ($need <= 0) break;
        $st = $conn->prepare("SELECT remaining_qty, size_id, expiration_date FROM inventory_batches WHERE batch_id = ? FOR UPDATE");
        $st->bind_param('s', $bid);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$row || (string)$row['size_id'] !== $sizeId) continue;
        if (!$allowExpired && !empty($row['expiration_date']) && $row['expiration_date'] < $today) {
            continue; // Double check inside row lock
        }
        $take = min($need, (int)$row['remaining_qty']);
        if ($take <= 0) continue;
        $newRem = (int)$row['remaining_qty'] - $take;
        $up = $conn->prepare("UPDATE inventory_batches SET remaining_qty = ?, updated_by = ? WHERE batch_id = ?");
        $up->bind_param('iss', $newRem, $staff, $bid);
        $up->execute();
        $up->close();
        batchLog($conn, $bid, $movementId, $logType, -$take, $newRem, $ref, $note, $staff, $when);
        $need -= $take;
        $deducted += $take;
    }
    return $deducted;
}

/** Put $qty cans back into depleted batches (earliest received first); returns the leftover that fit nowhere. */
function batchRestore(mysqli $conn, string $sizeId, int $qty, ?string $movementId, ?string $ref, ?string $note, ?string $staff, ?string $when = null, ?string $firstBatchId = null): int {
    $order = [];
    if ($firstBatchId) $order[] = $firstBatchId;
    $res = $conn->prepare("SELECT batch_id FROM inventory_batches WHERE size_id = ? AND remaining_qty < original_qty ORDER BY date_received ASC, batch_id ASC");
    $res->bind_param('s', $sizeId);
    $res->execute();
    $rs = $res->get_result();
    while ($r = $rs->fetch_assoc()) {
        if ($r['batch_id'] !== $firstBatchId) $order[] = $r['batch_id'];
    }
    $res->close();

    foreach ($order as $bid) {
        if ($qty <= 0) break;
        $st = $conn->prepare("SELECT remaining_qty, original_qty, size_id FROM inventory_batches WHERE batch_id = ? FOR UPDATE");
        $st->bind_param('s', $bid);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$row || (string)$row['size_id'] !== $sizeId) continue;
        $room = (int)$row['original_qty'] - (int)$row['remaining_qty'];
        if ($room <= 0) continue;
        $put = min($qty, $room);
        $newRem = (int)$row['remaining_qty'] + $put;
        $up = $conn->prepare("UPDATE inventory_batches SET remaining_qty = ?, updated_by = ? WHERE batch_id = ?");
        $up->bind_param('iss', $newRem, $staff, $bid);
        $up->execute();
        $up->close();
        batchLog($conn, $bid, $movementId, 'restore', $put, $newRem, $ref, $note, $staff, $when);
        $qty -= $put;
    }
    return $qty;
}

function batchSizeContext(mysqli $conn, ?string $sizeId, ?string $productId, float $containerSize): array {
    if (!$sizeId && $productId && $containerSize > 0) {
        $st = $conn->prepare("SELECT size_id FROM product_sizes WHERE product_id = ? AND ABS(container_size - ?) < 0.001 LIMIT 1");
        if ($st) {
            $st->bind_param('sd', $productId, $containerSize);
            $st->execute();
            $row = $st->get_result()->fetch_assoc();
            $st->close();
            if ($row) $sizeId = (string)$row['size_id'];
        }
    }
    if (!$sizeId) return [null, null, 0.0];
    $st = $conn->prepare("SELECT product_id, container_size FROM product_sizes WHERE size_id = ? LIMIT 1");
    $st->bind_param('s', $sizeId);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    if (!$row) return [null, null, 0.0];
    return [$sizeId, (string)$row['product_id'], (float)$row['container_size']];
}

/**
 * Route a freshly-inserted stock movement into the batch ledger.
 * $m is the raw client movement; $sizeId/$productId/$containerSize are the resolved values.
 */
function batchProcessMovement(mysqli $conn, array $m, string $type, ?string $sizeId, ?string $productId, float $containerSize, float $qtyChange, string $staffName, string $note, string $dateSql): void {
    if ($type === 'colormix') return; // liters from opened/mixed stock — healed by batchReconcile()
    [$sizeId, $productId, $csz] = batchSizeContext($conn, $sizeId, $productId, $containerSize);
    if (!$sizeId || !$productId || $csz <= 0) return;
    $cans = (int)round($qtyChange / $csz);
    if ($cans === 0) return;
    if (abs($qtyChange - $cans * $csz) > 0.01) return; // not a whole-can (sealed) movement, e.g. opened-stock adjustment

    $mid = (string)($m['id'] ?? '');
    $meta = (isset($m['batch']) && is_array($m['batch'])) ? $m['batch'] : [];
    $targetBatch = !empty($meta['batchId']) ? (string)$meta['batchId'] : null;
    $ref = null;
    if (preg_match('/(OR-[A-Za-z0-9_-]+|PO-[A-Za-z0-9_-]+)/', $note, $mm)) $ref = $mm[1];
    $shortNote = substr($note, 0, 400);

    if ($cans > 0) {
        if ($type === 'receiving') {
            $rawExp = $meta['expirationDate'] ?? null;
            if ($rawExp !== null && trim((string)$rawExp) !== '') {
                $normExp = batchNormalizeDate((string)$rawExp);
                if ($normExp === null) {
                    throw new Exception('Invalid expiration date format on stock receiving.');
                }
            }
            $bid = batchCreate($conn, [
                'size_id' => $sizeId,
                'product_id' => $productId,
                'qty' => $cans,
                'batch_number' => $meta['batchNumber'] ?? '',
                'expiration_date' => $meta['expirationDate'] ?? null,
                'unit_cost' => $meta['unitCost'] ?? null,
                'supplier_id' => $meta['supplierId'] ?? null,
                'supplier_name' => $meta['supplierName'] ?? null,
                'po_id' => $meta['poId'] ?? null,
                'po_number' => $meta['poNumber'] ?? null,
                'date_received' => $dateSql,
                'source' => 'receiving',
                'notes' => (isset($meta['notes']) && trim((string)$meta['notes']) !== '') ? trim((string)$meta['notes']) : null,
                'staff' => $staffName,
            ]);
            batchLog($conn, $bid, $mid, 'received', $cans, $cans, $meta['poNumber'] ?? $ref, $shortNote, $staffName, $dateSql);
            return;
        }
        $left = batchRestore($conn, $sizeId, $cans, $mid, $ref, $shortNote, $staffName, $dateSql, $targetBatch);
        if ($left > 0) {
            if ($targetBatch) {
                // Count-correction (add) aimed at a specific batch: grow that batch
                $st = $conn->prepare("SELECT remaining_qty, original_qty FROM inventory_batches WHERE batch_id = ? AND size_id = ? FOR UPDATE");
                $st->bind_param('ss', $targetBatch, $sizeId);
                $st->execute();
                $row = $st->get_result()->fetch_assoc();
                $st->close();
                if ($row) {
                    $newRem = (int)$row['remaining_qty'] + $left;
                    $newOrig = max((int)$row['original_qty'], $newRem);
                    $up = $conn->prepare("UPDATE inventory_batches SET remaining_qty = ?, original_qty = ?, updated_by = ? WHERE batch_id = ?");
                    $up->bind_param('iiss', $newRem, $newOrig, $staffName, $targetBatch);
                    $up->execute();
                    $up->close();
                    batchLog($conn, $targetBatch, substr($mid, 0, 48) . '#x', 'adjustment', $left, $newRem, $ref, $shortNote, $staffName, $dateSql);
                    return;
                }
            }
            $bid = batchCreate($conn, [
                'size_id' => $sizeId,
                'product_id' => $productId,
                'qty' => $left,
                'batch_number' => 'ADJ-' . date('Ymd', strtotime($dateSql)) . '-' . strtoupper(substr(md5($mid), 0, 4)),
                'expiration_date' => null,
                'date_received' => $dateSql,
                'source' => $type === 'return' ? 'return' : 'adjustment',
                'notes' => 'Stock added without a batch (' . $type . '): ' . $shortNote,
                'staff' => $staffName,
            ]);
            batchLog($conn, $bid, $mid, 'received', $left, $left, $ref, $shortNote, $staffName, $dateSql);
        }
        return;
    }

    // Negative: FIFO deduction (a module-selected batch is consumed first when explicitly targeted)
    // Sales and exchange replacements ('return' negative qty) strictly block expired batches.
    // Adjustments / explicit write-offs (e.g. removing expired stock) allow expired batches.
    $allowExpired = ($type === 'adjustment');
    $logType = ($type === 'sale') ? 'fifo_deduction' : ($targetBatch ? 'adjustment' : 'fifo_deduction');
    $deducted = batchFifoDeduct($conn, $sizeId, abs($cans), $mid, $logType, $ref, $shortNote, $staffName, $dateSql, $targetBatch, $allowExpired);
    if ($deducted < abs($cans) && !$allowExpired) {
        // If unexpired batches were insufficient to cover the sale/exchange, throw exception to roll back the transaction!
        throw new Exception("Transaction blocked: Available non-expired batch stock is insufficient for size {$sizeId}. Expired batches cannot be dispensed.");
    }
}

/**
 * Enforce SUM(batch remaining) == inventory.sealed_quantity for every size.
 * Surplus inventory -> a "reconciliation" batch (expiry Not Specified); surplus batches -> FIFO trim.
 * When $blockExpiredReduction is true (e.g. a color-mixing transaction opened sealed cans),
 * expired sealed batches are strictly blocked from being consumed.
 */
function batchReconcile(mysqli $conn, string $staff = 'System', bool $blockExpiredReduction = false): int {
    $fixed = 0;
    $sql = "SELECT ps.size_id, ps.product_id, inv.sealed_quantity AS sealed,
                   COALESCE((SELECT SUM(b.remaining_qty) FROM inventory_batches b WHERE b.size_id = ps.size_id), 0) AS batched,
                   (SELECT COUNT(*) FROM inventory_batches b2 WHERE b2.size_id = ps.size_id) AS batch_count,
                   inv.created_at AS inv_created
            FROM product_sizes ps JOIN inventory inv ON inv.size_id = ps.size_id";
    $res = $conn->query($sql);
    if (!$res) return 0;
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    foreach ($rows as $r) {
        $sealed = (int)$r['sealed'];
        $batched = (int)$r['batched'];
        if ($sealed === $batched) continue;
        $sizeId = (string)$r['size_id'];
        if ($sealed > $batched) {
            $diff = $sealed - $batched;
            $first = ((int)$r['batch_count'] === 0);
            $when = $first ? ((string)($r['inv_created'] ?: date('Y-m-d H:i:s'))) : date('Y-m-d H:i:s');
            $bid = batchCreate($conn, [
                'size_id' => $sizeId,
                'product_id' => (string)$r['product_id'],
                'qty' => $diff,
                'batch_number' => $first ? ('OPENING-' . $sizeId) : ('RECON-' . date('Ymd-His') . '-' . $sizeId),
                'expiration_date' => null,
                'date_received' => $when,
                'source' => $first ? 'opening' : 'reconciliation',
                'notes' => $first ? 'Opening balance — stock on hand before batch tracking.' : 'Auto-reconciled: inventory increased without a batch record.',
                'staff' => $staff,
            ]);
            batchLog($conn, $bid, null, $first ? 'opening' : 'reconciliation', $diff, $diff, null, $first ? 'Opening balance' : 'Inventory exceeded batch total', $staff);
        } else {
            $needTrim = $batched - $sealed;
            if ($blockExpiredReduction) {
                $deducted = batchFifoDeduct($conn, $sizeId, $needTrim, null, 'reconciliation', null, 'Color-mix opened a non-expired sealed can', $staff, null, null, false);
                if ($deducted < $needTrim) {
                    throw new Exception("Color mixing blocked: Available non-expired sealed batch stock is insufficient for size {$sizeId}. Expired sealed paint batches cannot be used for mixing.");
                }
            } else {
                // Prefer non-expired batches first, then fall back to expired only for non-mix administrative reconciliation
                $deducted = batchFifoDeduct($conn, $sizeId, $needTrim, null, 'reconciliation', null, 'Inventory decreased without a movement record (e.g. color-mix opened a sealed can)', $staff, null, null, false);
                if ($deducted < $needTrim) {
                    batchFifoDeduct($conn, $sizeId, $needTrim - $deducted, null, 'reconciliation', null, 'Inventory reconciliation trim (remaining expired batch units)', $staff, null, null, true);
                }
            }
        }
        $fixed++;
    }
    return $fixed;
}
