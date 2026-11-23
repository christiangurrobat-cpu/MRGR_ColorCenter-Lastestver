<?php
/**
 * Damaged Stock Inspection & Supplier Returns — Shared Library (MRGR Color Center)
 *
 * Keeps damaged/quarantined stock completely separate from sellable inventory (`inventory.sealed_quantity`).
 * - Receiving damage: recorded without adding to sellable stock or inventory_batches.
 * - Post-receiving damage: deducts from sellable stock & FIFO/target batch once (`stock_deducted = 1`).
 * - Supplier returns: reference eligible damaged records without duplicate stock deductions.
 * - Replacement receiving: adds only physically received replacement cans as a new receiving transaction & batch.
 */

const SR_DAMAGE_REASONS = [
    'Leaking Paint',
    'Broken / Damaged Container',
    'Missing Product',
    'Incorrect Product Delivered',
    'Expired Product',
    'Contaminated Paint',
    'Other',
];

const SR_RETURN_STATUSES = [
    'Pending Return',
    'Returned to Supplier',
    'Awaiting Replacement',
    'Replacement Received',
    'Credit Issued',
    'Refund Received',
    'Rejected by Supplier',
    'Closed',
];

const SR_RESOLUTION_TYPES = [
    'Replacement Stock',
    'Supplier Credit',
    'Refund',
    'No Replacement / Write-Off',
];

const SR_ADMIN_ONLY_STATUSES = [
    'Credit Issued',
    'Refund Received',
    'Rejected by Supplier',
    'Closed',
];

const SR_FINALIZED_STATUSES = [
    'Closed',
    'Credit Issued',
    'Refund Received',
    'Rejected by Supplier',
];

const SR_REPLACEMENT_STATUSES = [
    'Awaiting Supplier Confirmation',
    'Confirmed by Supplier – Awaiting Delivery',
    'Partially Received',
    'Under Physical Inspection',
    'Completed',
    'Cancelled',
    'Supplier Declined',
    // Legacy aliases preserved for backward compatibility with historical records
    'Replacement Approved',
    'Awaiting Replacement Delivery',
    'Under Inspection',
];

const SR_REPLACEMENT_RESOLVED_STATUSES = [
    'Completed',
    'Cancelled',
    'Supplier Declined',
];

function supplierReturnsEnsureSchema(mysqli $conn): void {
    static $done = false;
    if ($done) return;
    $done = true;

    $flag = __DIR__ . '/.supplier_returns_schema_v1';
    if (file_exists($flag)) return;

    $conn->query("CREATE TABLE IF NOT EXISTS `damaged_stock_records` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `po_id` VARCHAR(50) NULL,
        `po_number` VARCHAR(50) NULL,
        `supplier_id` VARCHAR(50) NULL,
        `supplier_name` VARCHAR(200) NOT NULL DEFAULT '',
        `product_id` VARCHAR(50) NOT NULL,
        `product_name` VARCHAR(200) NOT NULL,
        `size_id` VARCHAR(50) NULL,
        `container_size` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
        `batch_id` VARCHAR(50) NULL,
        `batch_number` VARCHAR(100) NULL,
        `source` VARCHAR(30) NOT NULL DEFAULT 'receiving',
        `delivered_qty` INT NOT NULL DEFAULT 0,
        `accepted_qty` INT NOT NULL DEFAULT 0,
        `damaged_qty` INT NOT NULL DEFAULT 0,
        `returned_qty` INT NOT NULL DEFAULT 0,
        `reason` VARCHAR(100) NOT NULL DEFAULT 'Other',
        `inspection_notes` TEXT NULL,
        `stock_deducted` TINYINT(1) NOT NULL DEFAULT 0,
        `movement_id` VARCHAR(50) NULL,
        `recorded_by` VARCHAR(150) NOT NULL DEFAULT 'Staff',
        `recorded_role` VARCHAR(50) NOT NULL DEFAULT 'staff',
        `recorded_at` DATETIME NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_dsr_po` (`po_id`),
        KEY `idx_dsr_supplier` (`supplier_id`),
        KEY `idx_dsr_product` (`product_id`),
        KEY `idx_dsr_batch` (`batch_id`),
        KEY `idx_dsr_recorded` (`recorded_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $conn->query("CREATE TABLE IF NOT EXISTS `supplier_returns` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `return_ref` VARCHAR(50) NOT NULL UNIQUE,
        `po_id` VARCHAR(50) NULL,
        `po_number` VARCHAR(50) NULL,
        `supplier_id` VARCHAR(50) NULL,
        `supplier_name` VARCHAR(200) NOT NULL DEFAULT '',
        `return_date` DATE NOT NULL,
        `reason` VARCHAR(100) NOT NULL DEFAULT 'Other',
        `notes` TEXT NULL,
        `status` VARCHAR(50) NOT NULL DEFAULT 'Pending Return',
        `resolution_type` VARCHAR(50) NOT NULL DEFAULT 'Replacement Stock',
        `resolution_notes` TEXT NULL,
        `credit_amount` DECIMAL(12,2) NULL,
        `is_approved` TINYINT(1) NOT NULL DEFAULT 0,
        `is_finalized` TINYINT(1) NOT NULL DEFAULT 0,
        `created_by` VARCHAR(150) NOT NULL DEFAULT 'Staff',
        `created_role` VARCHAR(50) NOT NULL DEFAULT 'staff',
        `approved_by` VARCHAR(150) NULL,
        `approved_at` DATETIME NULL,
        `updated_by` VARCHAR(150) NULL,
        `updated_at` DATETIME NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_sr_po` (`po_id`),
        KEY `idx_sr_supplier` (`supplier_id`),
        KEY `idx_sr_status` (`status`),
        KEY `idx_sr_date` (`return_date`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $conn->query("CREATE TABLE IF NOT EXISTS `supplier_return_items` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `return_id` VARCHAR(50) NOT NULL,
        `damaged_record_id` VARCHAR(50) NULL,
        `product_id` VARCHAR(50) NOT NULL,
        `product_name` VARCHAR(200) NOT NULL,
        `size_id` VARCHAR(50) NULL,
        `container_size` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
        `batch_id` VARCHAR(50) NULL,
        `batch_number` VARCHAR(100) NULL,
        `damaged_qty` INT NOT NULL DEFAULT 0,
        `replacement_received_qty` INT NOT NULL DEFAULT 0,
        `unit_cost` DECIMAL(10,2) NULL,
        `reason` VARCHAR(100) NOT NULL DEFAULT 'Other',
        `notes` TEXT NULL,
        KEY `idx_sri_return` (`return_id`),
        KEY `idx_sri_dmg` (`damaged_record_id`),
        KEY `idx_sri_product` (`product_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $conn->query("CREATE TABLE IF NOT EXISTS `supplier_replacement_requests` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `request_ref` VARCHAR(50) NOT NULL UNIQUE,
        `po_id` VARCHAR(50) NOT NULL,
        `po_number` VARCHAR(50) NOT NULL,
        `supplier_id` VARCHAR(50) NULL,
        `supplier_name` VARCHAR(200) NOT NULL DEFAULT '',
        `damaged_record_id` VARCHAR(50) NULL,
        `parent_request_id` VARCHAR(50) NULL,
        `product_id` VARCHAR(50) NOT NULL,
        `product_name` VARCHAR(200) NOT NULL,
        `size_id` VARCHAR(50) NULL,
        `container_size` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
        `damaged_qty` INT NOT NULL DEFAULT 0,
        `returned_qty` INT NOT NULL DEFAULT 0,
        `requested_qty` INT NOT NULL DEFAULT 0,
        `received_qty` INT NOT NULL DEFAULT 0,
        `rejected_qty` INT NOT NULL DEFAULT 0,
        `reason` VARCHAR(100) NOT NULL DEFAULT 'Other',
        `request_date` DATE NOT NULL,
        `expected_delivery_date` DATE NULL,
        `supplier_confirmed` TINYINT(1) NOT NULL DEFAULT 0,
        `supplier_confirmed_at` DATETIME NULL,
        `supplier_confirmation_note` TEXT NULL,
        `status` VARCHAR(50) NOT NULL DEFAULT 'Awaiting Supplier Confirmation',
        `credit_issued` TINYINT(1) NOT NULL DEFAULT 0,
        `credit_amount` DECIMAL(12,2) NULL,
        `credit_type` VARCHAR(40) NULL,
        `credit_notes` TEXT NULL,
        `staff_responsible` VARCHAR(150) NOT NULL DEFAULT 'Staff',
        `created_role` VARCHAR(50) NOT NULL DEFAULT 'staff',
        `notes` TEXT NULL,
        `updated_by` VARCHAR(150) NULL,
        `updated_at` DATETIME NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_srr_po` (`po_id`),
        KEY `idx_srr_supplier` (`supplier_id`),
        KEY `idx_srr_product` (`product_id`),
        KEY `idx_srr_status` (`status`),
        KEY `idx_srr_dmg` (`damaged_record_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $conn->query("CREATE TABLE IF NOT EXISTS `supplier_replacement_deliveries` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `request_id` VARCHAR(50) NOT NULL,
        `idempotency_key` VARCHAR(80) NULL UNIQUE,
        `delivered_qty` INT NOT NULL DEFAULT 0,
        `accepted_qty` INT NOT NULL DEFAULT 0,
        `damaged_qty` INT NOT NULL DEFAULT 0,
        `damage_reason` VARCHAR(100) NULL,
        `inspection_notes` TEXT NULL,
        `batch_id` VARCHAR(50) NULL,
        `batch_number` VARCHAR(100) NULL,
        `expiration_date` DATE NULL,
        `movement_id` VARCHAR(50) NULL,
        `inspected_by` VARCHAR(150) NOT NULL DEFAULT 'Staff',
        `received_at` DATETIME NOT NULL,
        KEY `idx_srd_req` (`request_id`),
        KEY `idx_srd_batch` (`batch_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Safe additive columns for idempotency / duplicate prevention on existing installations
    $chkD = $conn->query("SHOW COLUMNS FROM `damaged_stock_records` LIKE 'receiving_tx_key'");
    if ($chkD && $chkD->num_rows === 0) {
        $conn->query("ALTER TABLE `damaged_stock_records` ADD COLUMN `receiving_tx_key` VARCHAR(100) NULL AFTER `movement_id`, ADD KEY `idx_dsr_txkey` (`receiving_tx_key`)");
    }
    $chkR = $conn->query("SHOW COLUMNS FROM `supplier_replacement_requests` LIKE 'receiving_tx_key'");
    if ($chkR && $chkR->num_rows === 0) {
        $conn->query("ALTER TABLE `supplier_replacement_requests` ADD COLUMN `receiving_tx_key` VARCHAR(100) NULL AFTER `damaged_record_id`, ADD KEY `idx_srr_txkey` (`receiving_tx_key`)");
    }
    $chkPO = $conn->query("SHOW COLUMNS FROM `purchase_orders` LIKE 'receiving_stage'");
    if ($chkPO && $chkPO->num_rows === 0) {
        $conn->query("ALTER TABLE `purchase_orders` ADD COLUMN `receiving_stage` VARCHAR(40) NOT NULL DEFAULT 'open' AFTER `status`");
    }
    // Database-level safeguard against duplicate auto-generated replacement requests for the same PO + receiving tx + product + size
    $chkIdx = $conn->query("SHOW INDEX FROM `supplier_replacement_requests` WHERE Key_name = 'uk_srr_tx_prod'");
    if ($chkIdx && $chkIdx->num_rows === 0) {
        $conn->query("ALTER TABLE `supplier_replacement_requests` ADD UNIQUE KEY `uk_srr_tx_prod` (`po_id`, `receiving_tx_key`, `product_id`, `container_size`)");
    }
    // Supplier Confirmation Receipt / Proof columns (safe additive migration; expected_delivery_date remains nullable for historical records)
    $confirmCols = [
        'confirmation_ref'          => "ALTER TABLE `supplier_replacement_requests` ADD COLUMN `confirmation_ref` VARCHAR(100) NULL AFTER `supplier_confirmed_at`",
        'confirmation_date'         => "ALTER TABLE `supplier_replacement_requests` ADD COLUMN `confirmation_date` DATE NULL AFTER `confirmation_ref`",
        'confirmed_by'              => "ALTER TABLE `supplier_replacement_requests` ADD COLUMN `confirmed_by` VARCHAR(150) NULL AFTER `confirmation_date`",
        'confirmation_receipt_path' => "ALTER TABLE `supplier_replacement_requests` ADD COLUMN `confirmation_receipt_path` VARCHAR(255) NULL AFTER `confirmed_by`",
        'confirmation_receipt_name' => "ALTER TABLE `supplier_replacement_requests` ADD COLUMN `confirmation_receipt_name` VARCHAR(255) NULL AFTER `confirmation_receipt_path`",
        'confirmation_receipt_mime' => "ALTER TABLE `supplier_replacement_requests` ADD COLUMN `confirmation_receipt_mime` VARCHAR(80) NULL AFTER `confirmation_receipt_name`",
    ];
    foreach ($confirmCols as $col => $sql) {
        $c = $conn->query("SHOW COLUMNS FROM `supplier_replacement_requests` LIKE '{$col}'");
        if ($c && $c->num_rows === 0) {
            $conn->query($sql);
        }
    }

    $conn->query("CREATE TABLE IF NOT EXISTS `supplier_replacement_receipts` (
        `id` VARCHAR(50) NOT NULL PRIMARY KEY,
        `receipt_number` VARCHAR(50) NOT NULL UNIQUE,
        `receipt_type` VARCHAR(40) NOT NULL DEFAULT 'confirmation',
        `request_id` VARCHAR(50) NOT NULL,
        `request_ref` VARCHAR(50) NOT NULL,
        `delivery_id` VARCHAR(50) NOT NULL DEFAULT '',
        `po_id` VARCHAR(50) NOT NULL,
        `po_number` VARCHAR(50) NOT NULL,
        `supplier_id` VARCHAR(50) NULL,
        `supplier_name` VARCHAR(200) NOT NULL DEFAULT '',
        `snapshot_json` LONGTEXT NOT NULL,
        `confirmed_by` VARCHAR(150) NOT NULL DEFAULT 'Staff',
        `issued_at` DATETIME NOT NULL,
        `reprint_count` INT NOT NULL DEFAULT 0,
        `last_reprinted_at` DATETIME NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `uk_srr_receipt_once` (`request_id`, `receipt_type`, `delivery_id`),
        KEY `idx_srcpt_req` (`request_id`),
        KEY `idx_srcpt_po` (`po_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    @file_put_contents($flag, date('Y-m-d H:i:s'));
}

function srUid(string $prefix): string {
    return $prefix . '_' . bin2hex(random_bytes(6));
}

function srGenerateReturnRef(mysqli $conn): string {
    $datePart = date('Ymd');
    $prefix = "SRET-{$datePart}-";
    $seq = 1;
    $res = $conn->query("SELECT return_ref FROM supplier_returns WHERE return_ref LIKE '" . $conn->real_escape_string($prefix) . "%' ORDER BY return_ref DESC LIMIT 1 FOR UPDATE");
    if ($res && ($row = $res->fetch_assoc())) {
        $tail = (int)substr((string)$row['return_ref'], strlen($prefix));
        if ($tail > 0) $seq = $tail + 1;
    }
    while (true) {
        $cand = $prefix . str_pad((string)$seq, 4, '0', STR_PAD_LEFT);
        $chk = $conn->prepare("SELECT 1 FROM supplier_returns WHERE return_ref = ? LIMIT 1");
        $chk->bind_param('s', $cand);
        $chk->execute();
        $exists = (bool)$chk->get_result()->fetch_row();
        $chk->close();
        if (!$exists) return $cand;
        $seq++;
    }
}

function srWriteAudit(
    mysqli $conn,
    array $actor,
    string $action,
    string $entity,
    string $details,
    ?string $productId = null,
    string $entityName = '',
    string $fieldChanged = '',
    ?string $oldValue = null,
    ?string $newValue = null,
    ?string $referenceNo = null,
    ?string $reason = null
): void {
    $now = date('Y-m-d H:i:s');
    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
    $uid = (string)($actor['id'] ?? '');
    $uname = (string)($actor['name'] ?? 'System');
    $urole = (string)($actor['role'] ?? 'staff');
    $pid = (string)($productId ?? '');
    $st = $conn->prepare("INSERT INTO audit_logs (created_at, user_id, user_name, user_role, action, entity, product_id, entity_name, field_changed, old_value, new_value, reference_no, reason, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    if (!$st) return;
    $st->bind_param('sssssssssssssss', $now, $uid, $uname, $urole, $action, $entity, $pid, $entityName, $fieldChanged, $oldValue, $newValue, $referenceNo, $reason, $details, $ip);
    $st->execute();
    $st->close();
}

function srInsertMovement(
    mysqli $conn,
    string $type,
    ?string $productId,
    ?string $sizeId,
    ?float $containerSize,
    string $productName,
    float $qtyChange,
    string $note,
    string $staffName,
    string $dateSql
): string {
    $mid = srUid('mv');
    $st = $conn->prepare("INSERT INTO movements (id, date, type, product_id, size_id, container_size, product_name, qty_change, note, staff_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    if ($st) {
        $st->bind_param('sssssdsdss', $mid, $dateSql, $type, $productId, $sizeId, $containerSize, $productName, $qtyChange, $note, $staffName);
        $st->execute();
        $st->close();
    }
    return $mid;
}

/**
 * Resolve product + size row from DB and recompute products.stock & can_stock_json from inventory table.
 */
function srResolveProductSize(mysqli $conn, string $productId, ?string $sizeId, float $containerSize): ?array {
    if ($sizeId) {
        $st = $conn->prepare("SELECT ps.size_id, ps.product_id, ps.container_size, ps.price_per_can,
                COALESCE(NULLIF(p.name, ''), p.product_name) AS product_name, p.brand,
                COALESCE(inv.sealed_quantity, 0) AS sealed_quantity, COALESCE(inv.remaining_volume, 0) AS remaining_volume
            FROM product_sizes ps
            JOIN products p ON p.id = ps.product_id
            LEFT JOIN inventory inv ON inv.size_id = ps.size_id
            WHERE ps.size_id = ? LIMIT 1");
        $st->bind_param('s', $sizeId);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        if ($row) return $row;
    }
    $st = $conn->prepare("SELECT ps.size_id, ps.product_id, ps.container_size, ps.price_per_can,
            COALESCE(NULLIF(p.name, ''), p.product_name) AS product_name, p.brand,
            COALESCE(inv.sealed_quantity, 0) AS sealed_quantity, COALESCE(inv.remaining_volume, 0) AS remaining_volume
        FROM product_sizes ps
        JOIN products p ON p.id = ps.product_id
        LEFT JOIN inventory inv ON inv.size_id = ps.size_id
        WHERE ps.product_id = ? AND ABS(ps.container_size - ?) < 0.01 LIMIT 1");
    $st->bind_param('sd', $productId, $containerSize);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    return $row ?: null;
}

function srSyncProductTotalsFromInventory(mysqli $conn, string $productId): float {
    $st = $conn->prepare("SELECT ps.container_size, COALESCE(inv.sealed_quantity, 0) AS sealed_qty
        FROM product_sizes ps
        LEFT JOIN inventory inv ON inv.size_id = ps.size_id
        WHERE ps.product_id = ?");
    $st->bind_param('s', $productId);
    $st->execute();
    $rs = $st->get_result();
    $canStock = [];
    $totalLiters = 0.0;
    while ($r = $rs->fetch_assoc()) {
        $szKey = (string)((float)$r['container_size'] == floor((float)$r['container_size']) ? (int)$r['container_size'] : (float)$r['container_size']);
        $qty = max(0, (int)$r['sealed_qty']);
        $canStock[$szKey] = $qty;
        $totalLiters += $qty * (float)$r['container_size'];
    }
    $st->close();
    $totalLiters = round($totalLiters, 2);
    $canJson = json_encode($canStock);
    $up = $conn->prepare("UPDATE products SET stock = ?, can_stock = ? WHERE id = ?");
    if ($up) {
        $up->bind_param('dss', $totalLiters, $canJson, $productId);
        $up->execute();
        $up->close();
    }
    return $totalLiters;
}

function srGenerateReplacementRef(mysqli $conn): string {
    $datePart = date('Ymd');
    $prefix = "REP-{$datePart}-";
    $seq = 1;
    $res = $conn->query("SELECT request_ref FROM supplier_replacement_requests WHERE request_ref LIKE '" . $conn->real_escape_string($prefix) . "%' ORDER BY request_ref DESC LIMIT 1 FOR UPDATE");
    if ($res && ($row = $res->fetch_assoc())) {
        $tail = (int)substr((string)$row['request_ref'], strlen($prefix));
        if ($tail > 0) $seq = $tail + 1;
    }
    while (true) {
        $cand = $prefix . str_pad((string)$seq, 4, '0', STR_PAD_LEFT);
        $chk = $conn->prepare("SELECT 1 FROM supplier_replacement_requests WHERE request_ref = ? LIMIT 1");
        $chk->bind_param('s', $cand);
        $chk->execute();
        $exists = (bool)$chk->get_result()->fetch_row();
        $chk->close();
        if (!$exists) return $cand;
        $seq++;
    }
}

/**
 * Synchronize Purchase Order replacement quantities and status.
 * Enforces: A Purchase Order must NOT be marked Fully Received ('received') while any
 * unresolved replacement request remains outstanding, and preserves original PO cost.
 */
function srRecalcPOStatus(mysqli $conn, string $poId): void {
    if ($poId === '') return;
    $st = $conn->prepare("SELECT id, status, items_json FROM purchase_orders WHERE id = ? FOR UPDATE");
    $st->bind_param('s', $poId);
    $st->execute();
    $po = $st->get_result()->fetch_assoc();
    $st->close();
    if (!$po || in_array($po['status'], ['pending', 'cancelled'], true)) return;

    $items = json_decode($po['items_json'] ?? '[]', true);
    if (!is_array($items)) $items = [];

    // Aggregate replacement requests for this PO
    $repByKey = [];
    $unresolvedCount = 0;
    $rSt = $conn->prepare("SELECT product_id, container_size, requested_qty, received_qty, returned_qty, damaged_qty, status, credit_issued
        FROM supplier_replacement_requests WHERE po_id = ?");
    $rSt->bind_param('s', $poId);
    $rSt->execute();
    $rs = $rSt->get_result();
    while ($rr = $rs->fetch_assoc()) {
        $isCancelled = ($rr['status'] === 'Cancelled');
        $isResolved = in_array($rr['status'], SR_REPLACEMENT_RESOLVED_STATUSES, true);
        if (!$isResolved) $unresolvedCount++;
        $k = (string)$rr['product_id'] . '__' . (float)$rr['container_size'];
        if (!isset($repByKey[$k])) {
            $repByKey[$k] = ['req' => 0, 'rcvd' => 0, 'credited' => 0, 'pending' => 0];
        }
        if (!$isCancelled) {
            $reqQ = (int)$rr['requested_qty'];
            $rcvdQ = (int)$rr['received_qty'];
            $repByKey[$k]['req'] += $reqQ;
            $repByKey[$k]['rcvd'] += $rcvdQ;
            if ((int)$rr['credit_issued'] === 1) {
                $repByKey[$k]['credited'] += max(0, $reqQ - $rcvdQ);
            } elseif (!$isResolved) {
                $repByKey[$k]['pending'] += max(0, $reqQ - $rcvdQ);
            }
        }
    }
    $rSt->close();

    // Also aggregate damaged/returned totals from damaged_stock_records for this PO
    $dmgByKey = [];
    $dSt = $conn->prepare("SELECT product_id, container_size, SUM(damaged_qty) AS dq, SUM(returned_qty) AS rq
        FROM damaged_stock_records WHERE po_id = ? GROUP BY product_id, container_size");
    $dSt->bind_param('s', $poId);
    $dSt->execute();
    $ds = $dSt->get_result();
    while ($dr = $ds->fetch_assoc()) {
        $k = (string)$dr['product_id'] . '__' . (float)$dr['container_size'];
        $dmgByKey[$k] = ['dmg' => (int)$dr['dq'], 'ret' => (int)$dr['rq']];
    }
    $dSt->close();

    $allFulfilled = count($items) > 0;
    $allInitialProcessed = count($items) > 0;
    $anyProgress = false;
    foreach ($items as &$it) {
        $pid = (string)($it['productId'] ?? '');
        $sz = (float)($it['size'] ?? 1);
        $k = $pid . '__' . $sz;
        $ordered = (float)($it['qty'] ?? 0);
        $accepted = isset($it['acceptedQty']) ? (float)$it['acceptedQty'] : (float)($it['receivedQty'] ?? 0);
        $repReq = $repByKey[$k]['req'] ?? 0;
        $repRcvd = $repByKey[$k]['rcvd'] ?? 0;
        $repCred = $repByKey[$k]['credited'] ?? 0;
        $repPending = $repByKey[$k]['pending'] ?? 0;
        $dmgTot = max((int)($it['damagedQty'] ?? 0), $dmgByKey[$k]['dmg'] ?? 0);
        $retTot = $dmgByKey[$k]['ret'] ?? 0;

        $it['acceptedQty'] = $accepted;
        $it['damagedQty'] = $dmgTot;
        $it['returnedQty'] = $retTot;
        $it['replacementRequestedQty'] = $repReq;
        $it['replacementReceivedQty'] = $repRcvd;
        // Total fulfilled good units (initial accepted + replacement received + credited)
        $fulfilled = $accepted + $repRcvd + $repCred;
        $effectiveRepPending = min($repPending, max(0, $ordered - $fulfilled));
        $accountedInitial = $fulfilled + $effectiveRepPending;
        $it['receivedQty'] = min($ordered, round($accepted + $repRcvd, 2));
        // Keep normalized purchase_order_items.received_quantity in sync with items_json
        $upPoi = $conn->prepare("UPDATE purchase_order_items SET received_quantity = ? WHERE po_id = ? AND product_id = ? AND ABS(container_size - ?) < 0.01");
        if ($upPoi) {
            $syncRec = (float)$it['receivedQty'];
            $upPoi->bind_param('dssd', $syncRec, $poId, $pid, $sz);
            $upPoi->execute();
            $upPoi->close();
        }
        if ($fulfilled > 0 || $dmgTot > 0 || $effectiveRepPending > 0) $anyProgress = true;
        if ($fulfilled < $ordered) $allFulfilled = false;
        if ($accountedInitial < $ordered) $allInitialProcessed = false;
    }
    unset($it);

    $newStatus = $po['status'];
    $newStage = 'open';
    if ($unresolvedCount > 0) {
        $newStatus = 'partial';
        $newStage = $allInitialProcessed ? 'awaiting_replacement' : 'open';
    } elseif ($allFulfilled && $anyProgress) {
        $newStatus = 'received';
        $newStage = 'completed';
    } elseif ($anyProgress) {
        $newStatus = 'partial';
        $newStage = 'open';
    }

    $itemsJson = json_encode($items);
    $up = $conn->prepare("UPDATE purchase_orders SET status = ?, receiving_stage = ?, items_json = ? WHERE id = ?");
    $up->bind_param('ssss', $newStatus, $newStage, $itemsJson, $poId);
    $up->execute();
    $up->close();
}


function srGenerateReplacementReceiptNo(mysqli $conn, string $type = 'confirmation'): string {
    $datePart = date('Ymd');
    $prefix = ($type === 'delivery' ? 'SRDV-' : 'SRCP-') . "{$datePart}-";
    $seq = 1;
    $res = $conn->query("SELECT receipt_number FROM supplier_replacement_receipts WHERE receipt_number LIKE '" . $conn->real_escape_string($prefix) . "%' ORDER BY receipt_number DESC LIMIT 1 FOR UPDATE");
    if ($res && ($row = $res->fetch_assoc())) {
        $tail = (int)substr((string)$row['receipt_number'], strlen($prefix));
        if ($tail > 0) $seq = $tail + 1;
    }
    while (true) {
        $cand = $prefix . str_pad((string)$seq, 4, '0', STR_PAD_LEFT);
        $chk = $conn->prepare("SELECT 1 FROM supplier_replacement_receipts WHERE receipt_number = ? LIMIT 1");
        $chk->bind_param('s', $cand);
        $chk->execute();
        $exists = (bool)$chk->get_result()->fetch_row();
        $chk->close();
        if (!$exists) return $cand;
        $seq++;
    }
}

function srLoadSupplierInfo(mysqli $conn, ?string $supplierId, string $supplierName): array {
    $info = ['id' => $supplierId, 'name' => $supplierName, 'contact' => '', 'phone' => '', 'email' => '', 'address' => ''];
    if ($supplierId) {
        $st = $conn->prepare("SELECT id, name, contact, phone, email, address FROM suppliers WHERE id = ? LIMIT 1");
        if ($st) {
            $st->bind_param('s', $supplierId);
            $st->execute();
            $r = $st->get_result()->fetch_assoc();
            $st->close();
            if ($r) {
                $info['name'] = (string)($r['name'] ?: $supplierName);
                $info['contact'] = (string)($r['contact'] ?? '');
                $info['phone'] = (string)($r['phone'] ?? '');
                $info['email'] = (string)($r['email'] ?? '');
                $info['address'] = (string)($r['address'] ?? '');
                return $info;
            }
        }
    }
    if ($supplierName !== '') {
        $st = $conn->prepare("SELECT id, name, contact, phone, email, address FROM suppliers WHERE name = ? LIMIT 1");
        if ($st) {
            $st->bind_param('s', $supplierName);
            $st->execute();
            $r = $st->get_result()->fetch_assoc();
            $st->close();
            if ($r) {
                $info['id'] = (string)$r['id'];
                $info['contact'] = (string)($r['contact'] ?? '');
                $info['phone'] = (string)($r['phone'] ?? '');
                $info['email'] = (string)($r['email'] ?? '');
                $info['address'] = (string)($r['address'] ?? '');
            }
        }
    }
    return $info;
}
