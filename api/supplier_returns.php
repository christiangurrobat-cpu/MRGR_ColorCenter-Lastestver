<?php
/**
 * Damaged Stock Inspection & Supplier Returns API (MRGR Color Center)
 *
 * GET  ?action=list                         -> damagedRecords, returns (with items), activeBatches, summary
 * POST ?action=record_receiving_damage      -> log damaged units found during PO receiving (never touches sellable stock)
 * POST ?action=record_post_receiving_damage -> quarantine/deduct damaged stock discovered after receiving (FIFO/batch safe)
 * POST ?action=create_return                -> create Supplier Return (SRET-...) with 1+ damaged items (partial or full)
 * POST ?action=approve_return               -> Admin approval of a Pending Return
 * POST ?action=update_status                -> update status / resolution / credit amount (RBAC + finalized lock)
 * POST ?action=receive_replacement          -> receive replacement stock as a separate receiving transaction + FIFO batch
 */
date_default_timezone_set('Asia/Manila');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (session_status() === PHP_SESSION_NONE) session_start();

require_once __DIR__ . '/../config/database.php';
mrgrEnableGzip();
require_once __DIR__ . '/batch_lib.php';
require_once __DIR__ . '/supplier_returns_lib.php';

function sr_fail(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}

try {
    $conn = getDBConnection();
    batchEnsureSchema($conn);
    supplierReturnsEnsureSchema($conn);
} catch (Throwable $e) {
    sr_fail(500, 'Database connection failed: ' . $e->getMessage());
}

// ---- Authentication & RBAC (Admin & Inventory Staff only) ----
$uid = (string)($_SESSION['user_id'] ?? '');
session_write_close();
if ($uid === '') sr_fail(401, 'Authentication required.');
$st = $conn->prepare("SELECT id, name, role, status FROM users WHERE id = ? LIMIT 1");
$st->bind_param('s', $uid);
$st->execute();
$actor = $st->get_result()->fetch_assoc();
$st->close();
if (!$actor || $actor['status'] !== 'active') sr_fail(403, 'Access denied: inactive or unknown user.');
$role = (string)$actor['role'];
if (!in_array($role, ['admin', 'staff'], true)) {
    sr_fail(403, 'Access denied: Damaged Stock & Supplier Returns is available to Administrators and Inventory Staff only.');
}
$isAdmin = ($role === 'admin');
$actorName = (string)$actor['name'];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';
$body = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw ?: '{}', true);
    if (is_array($decoded)) $body = $decoded;
    if ($action === '' && !empty($body['action'])) $action = (string)$body['action'];
}

function sr_load_all(mysqli $conn): array {
    $damaged = [];
    $resD = $conn->query("SELECT * FROM damaged_stock_records ORDER BY recorded_at DESC, id DESC");
    if ($resD) {
        while ($r = $resD->fetch_assoc()) {
            $dq = (int)$r['damaged_qty'];
            $rq = (int)$r['returned_qty'];
            $damaged[] = [
                'id' => $r['id'],
                'poId' => $r['po_id'],
                'poNumber' => $r['po_number'] ?? '',
                'supplierId' => $r['supplier_id'],
                'supplierName' => $r['supplier_name'] ?? '',
                'productId' => $r['product_id'],
                'productName' => $r['product_name'],
                'sizeId' => $r['size_id'],
                'containerSize' => (float)$r['container_size'],
                'batchId' => $r['batch_id'],
                'batchNumber' => $r['batch_number'] ?? '',
                'source' => $r['source'],
                'deliveredQty' => (int)$r['delivered_qty'],
                'acceptedQty' => (int)$r['accepted_qty'],
                'damagedQty' => $dq,
                'returnedQty' => $rq,
                'eligibleQty' => max(0, $dq - $rq),
                'reason' => $r['reason'],
                'inspectionNotes' => $r['inspection_notes'] ?? '',
                'stockDeducted' => (int)$r['stock_deducted'] === 1,
                'movementId' => $r['movement_id'],
                'recordedBy' => $r['recorded_by'],
                'recordedRole' => $r['recorded_role'],
                'recordedAt' => $r['recorded_at'],
            ];
        }
    }

    $itemsByReturn = [];
    $resI = $conn->query("SELECT * FROM supplier_return_items ORDER BY id ASC");
    if ($resI) {
        while ($it = $resI->fetch_assoc()) {
            $rid = (string)$it['return_id'];
            $dq = (int)$it['damaged_qty'];
            $rep = (int)$it['replacement_received_qty'];
            $itemsByReturn[$rid][] = [
                'id' => $it['id'],
                'returnId' => $rid,
                'damagedRecordId' => $it['damaged_record_id'],
                'productId' => $it['product_id'],
                'productName' => $it['product_name'],
                'sizeId' => $it['size_id'],
                'containerSize' => (float)$it['container_size'],
                'batchId' => $it['batch_id'],
                'batchNumber' => $it['batch_number'] ?? '',
                'damagedQty' => $dq,
                'replacementReceivedQty' => $rep,
                'replacementPendingQty' => max(0, $dq - $rep),
                'unitCost' => $it['unit_cost'] !== null ? (float)$it['unit_cost'] : null,
                'reason' => $it['reason'],
                'notes' => $it['notes'] ?? '',
            ];
        }
    }

    $returns = [];
    $resR = $conn->query("SELECT * FROM supplier_returns ORDER BY return_date DESC, created_at DESC");
    if ($resR) {
        while ($r = $resR->fetch_assoc()) {
            $rid = (string)$r['id'];
            $items = $itemsByReturn[$rid] ?? [];
            $totalDamaged = 0;
            $totalReplaced = 0;
            foreach ($items as $it) {
                $totalDamaged += $it['damagedQty'];
                $totalReplaced += $it['replacementReceivedQty'];
            }
            $returns[] = [
                'id' => $rid,
                'returnRef' => $r['return_ref'],
                'poId' => $r['po_id'],
                'poNumber' => $r['po_number'] ?? '',
                'supplierId' => $r['supplier_id'],
                'supplierName' => $r['supplier_name'] ?? '',
                'returnDate' => $r['return_date'],
                'reason' => $r['reason'],
                'notes' => $r['notes'] ?? '',
                'status' => $r['status'],
                'resolutionType' => $r['resolution_type'],
                'resolutionNotes' => $r['resolution_notes'] ?? '',
                'creditAmount' => $r['credit_amount'] !== null ? (float)$r['credit_amount'] : null,
                'isApproved' => (int)$r['is_approved'] === 1,
                'isFinalized' => (int)$r['is_finalized'] === 1,
                'createdBy' => $r['created_by'],
                'createdRole' => $r['created_role'],
                'approvedBy' => $r['approved_by'],
                'approvedAt' => $r['approved_at'],
                'updatedBy' => $r['updated_by'],
                'updatedAt' => $r['updated_at'],
                'createdAt' => $r['created_at'],
                'totalDamagedQty' => $totalDamaged,
                'totalReplacementReceivedQty' => $totalReplaced,
                'items' => $items,
            ];
        }
    }

    $batches = [];
    $resB = $conn->query("SELECT b.batch_id, b.batch_number, b.size_id, b.product_id, b.po_id, b.po_number,
            b.supplier_id, b.supplier_name, b.remaining_qty, b.expiration_date, b.date_received, ps.container_size
        FROM inventory_batches b
        LEFT JOIN product_sizes ps ON ps.size_id = b.size_id
        WHERE b.remaining_qty > 0
        ORDER BY b.date_received ASC, b.batch_id ASC");
    if ($resB) {
        while ($b = $resB->fetch_assoc()) {
            $batches[] = [
                'batchId' => $b['batch_id'],
                'batchNumber' => $b['batch_number'],
                'sizeId' => $b['size_id'],
                'productId' => $b['product_id'],
                'poId' => $b['po_id'],
                'poNumber' => $b['po_number'] ?? '',
                'supplierId' => $b['supplier_id'],
                'supplierName' => $b['supplier_name'] ?? '',
                'remainingQty' => (int)$b['remaining_qty'],
                'expirationDate' => $b['expiration_date'],
                'dateReceived' => $b['date_received'],
                'containerSize' => isset($b['container_size']) ? (float)$b['container_size'] : 1.0,
            ];
        }
    }

    $summary = [
        'totalDamagedRecords' => count($damaged),
        'unreturnedDamagedUnits' => 0,
        'activeReturns' => 0,
        'pendingApprovalReturns' => 0,
        'awaitingReplacementUnits' => 0,
        'resolvedReturns' => 0,
    ];
    foreach ($damaged as $d) {
        $summary['unreturnedDamagedUnits'] += $d['eligibleQty'];
    }
    foreach ($returns as $ret) {
        if (in_array($ret['status'], ['Pending Return', 'Returned to Supplier', 'Awaiting Replacement'], true)) {
            $summary['activeReturns']++;
        } else {
            $summary['resolvedReturns']++;
        }
        if (!$ret['isApproved'] && $ret['status'] === 'Pending Return') {
            $summary['pendingApprovalReturns']++;
        }
        if ($ret['resolutionType'] === 'Replacement Stock' && !in_array($ret['status'], ['Rejected by Supplier', 'Closed'], true)) {
            $summary['awaitingReplacementUnits'] += max(0, $ret['totalDamagedQty'] - $ret['totalReplacementReceivedQty']);
        }
    }

    $deliveriesByReq = [];
    $resDel = $conn->query("SELECT * FROM supplier_replacement_deliveries ORDER BY received_at DESC, id DESC");
    if ($resDel) {
        while ($del = $resDel->fetch_assoc()) {
            $rqId = (string)$del['request_id'];
            $deliveriesByReq[$rqId][] = [
                'id' => $del['id'],
                'requestId' => $rqId,
                'deliveredQty' => (int)$del['delivered_qty'],
                'acceptedQty' => (int)$del['accepted_qty'],
                'damagedQty' => (int)$del['damaged_qty'],
                'damageReason' => $del['damage_reason'] ?? '',
                'inspectionNotes' => $del['inspection_notes'] ?? '',
                'batchId' => $del['batch_id'],
                'batchNumber' => $del['batch_number'] ?? '',
                'expirationDate' => $del['expiration_date'],
                'movementId' => $del['movement_id'],
                'inspectedBy' => $del['inspected_by'],
                'receivedAt' => $del['received_at'],
            ];
        }
    }

    $receiptsByReq = [];
    $resRcpt = $conn->query("SELECT * FROM supplier_replacement_receipts ORDER BY issued_at DESC, id DESC");
    if ($resRcpt) {
        while ($rc = $resRcpt->fetch_assoc()) {
            $rqId = (string)$rc['request_id'];
            $snap = json_decode((string)($rc['snapshot_json'] ?? '{}'), true);
            $shapedRcpt = [
                'id' => $rc['id'],
                'receiptNumber' => $rc['receipt_number'],
                'receiptType' => $rc['receipt_type'],
                'requestId' => $rqId,
                'requestRef' => $rc['request_ref'],
                'deliveryId' => $rc['delivery_id'] ?? '',
                'poId' => $rc['po_id'],
                'poNumber' => $rc['po_number'],
                'supplierId' => $rc['supplier_id'],
                'supplierName' => $rc['supplier_name'],
                'confirmedBy' => $rc['confirmed_by'],
                'issuedAt' => $rc['issued_at'],
                'reprintCount' => (int)$rc['reprint_count'],
                'lastReprintedAt' => $rc['last_reprinted_at'],
                'snapshot' => is_array($snap) ? $snap : [],
            ];
            if ($rc['receipt_type'] === 'confirmation') {
                $receiptsByReq[$rqId]['confirmation'] = $shapedRcpt;
            } else {
                $receiptsByReq[$rqId]['deliveries'][] = $shapedRcpt;
            }
        }
    }

    $replacementRequests = [];
    $poReplacementSummary = [];
    $resRep = $conn->query("SELECT * FROM supplier_replacement_requests ORDER BY request_date DESC, created_at DESC");
    if ($resRep) {
        while ($rr = $resRep->fetch_assoc()) {
            $id = (string)$rr['id'];
            $reqQty = (int)$rr['requested_qty'];
            $rcvdQty = (int)$rr['received_qty'];
            $remQty = max(0, $reqQty - $rcvdQty);
            $isResolved = in_array($rr['status'], SR_REPLACEMENT_RESOLVED_STATUSES, true);
            $poIdKey = (string)$rr['po_id'];
            if (!isset($poReplacementSummary[$poIdKey])) {
                $poReplacementSummary[$poIdKey] = [
                    'activeCount' => 0,
                    'totalCount' => 0,
                    'requestedQty' => 0,
                    'receivedQty' => 0,
                    'pendingQty' => 0,
                ];
            }
            $poReplacementSummary[$poIdKey]['totalCount']++;
            if ($rr['status'] !== 'Cancelled') {
                $poReplacementSummary[$poIdKey]['requestedQty'] += $reqQty;
                $poReplacementSummary[$poIdKey]['receivedQty'] += $rcvdQty;
            }
            if (!$isResolved) {
                $poReplacementSummary[$poIdKey]['activeCount']++;
                $poReplacementSummary[$poIdKey]['pendingQty'] += $remQty;
            }

            $replacementRequests[] = [
                'id' => $id,
                'requestRef' => $rr['request_ref'],
                'poId' => $poIdKey,
                'poNumber' => $rr['po_number'],
                'supplierId' => $rr['supplier_id'],
                'supplierName' => $rr['supplier_name'],
                'damagedRecordId' => $rr['damaged_record_id'],
                'parentRequestId' => $rr['parent_request_id'],
                'productId' => $rr['product_id'],
                'productName' => $rr['product_name'],
                'sizeId' => $rr['size_id'],
                'containerSize' => (float)$rr['container_size'],
                'damagedQty' => (int)$rr['damaged_qty'],
                'returnedQty' => (int)$rr['returned_qty'],
                'requestedQty' => $reqQty,
                'receivedQty' => $rcvdQty,
                'rejectedQty' => (int)$rr['rejected_qty'],
                'remainingQty' => $remQty,
                'reason' => $rr['reason'],
                'requestDate' => $rr['request_date'],
                'expectedDeliveryDate' => $rr['expected_delivery_date'],
                'supplierConfirmed' => (int)$rr['supplier_confirmed'] === 1,
                'supplierConfirmedAt' => $rr['supplier_confirmed_at'],
                'confirmationRef' => $rr['confirmation_ref'] ?? '',
                'confirmationDate' => $rr['confirmation_date'] ?? null,
                'confirmedBy' => $rr['confirmed_by'] ?? '',
                'confirmationReceiptName' => $rr['confirmation_receipt_name'] ?? '',
                'confirmationReceiptMime' => $rr['confirmation_receipt_mime'] ?? '',
                'hasConfirmationReceipt' => !empty($rr['confirmation_receipt_path']),
                'supplierConfirmationNote' => $rr['supplier_confirmation_note'] ?? '',
                'status' => $rr['status'],
                'isResolved' => $isResolved,
                'creditIssued' => (int)$rr['credit_issued'] === 1,
                'creditAmount' => $rr['credit_amount'] !== null ? (float)$rr['credit_amount'] : null,
                'creditType' => $rr['credit_type'] ?? '',
                'creditNotes' => $rr['credit_notes'] ?? '',
                'staffResponsible' => $rr['staff_responsible'],
                'createdRole' => $rr['created_role'],
                'notes' => $rr['notes'] ?? '',
                'updatedBy' => $rr['updated_by'],
                'updatedAt' => $rr['updated_at'],
                'createdAt' => $rr['created_at'],
                'deliveries' => $deliveriesByReq[$id] ?? [],
                'confirmationReceipt' => $receiptsByReq[$id]['confirmation'] ?? null,
                'deliveryReceipts' => $receiptsByReq[$id]['deliveries'] ?? [],
            ];
        }
    }

    return [
        'damagedRecords' => $damaged,
        'returns' => $returns,
        'replacementRequests' => $replacementRequests,
        'poReplacementSummary' => $poReplacementSummary,
        'activeBatches' => $batches,
        'summary' => $summary,
    ];
}

try {
    // =========================================================================
    // 1. GET ?action=list
    // =========================================================================
    if ($method === 'GET' && ($action === 'list' || $action === '')) {
        $data = sr_load_all($conn);
        echo json_encode(['success' => true] + $data);
        exit;
    }

    // =========================================================================
    // 1b. GET ?action=view_confirmation_receipt&requestId=...
    //     Securely streams the uploaded Supplier Confirmation Receipt (PDF/JPG/PNG)
    // =========================================================================
    if ($method === 'GET' && $action === 'view_confirmation_receipt') {
        $requestId = trim((string)($_GET['requestId'] ?? ''));
        if ($requestId === '') sr_fail(400, 'Request ID is required.');
        $st = $conn->prepare("SELECT confirmation_receipt_path, confirmation_receipt_name, confirmation_receipt_mime FROM supplier_replacement_requests WHERE id = ? LIMIT 1");
        $st->bind_param('s', $requestId);
        $st->execute();
        $row = $st->get_result()->fetch_assoc();
        $st->close();
        if (!$row || empty($row['confirmation_receipt_path'])) {
            sr_fail(404, 'No confirmation receipt uploaded for this replacement request.');
        }
        $baseDir = realpath(__DIR__ . '/../uploads/supplier_confirmations');
        $fullPath = $baseDir ? realpath(__DIR__ . '/../' . ltrim((string)$row['confirmation_receipt_path'], '/\\')) : false;
        if (!$baseDir || !$fullPath || strpos($fullPath, $baseDir) !== 0 || !is_file($fullPath)) {
            sr_fail(404, 'Confirmation receipt file not found on server.');
        }
        $mime = (string)($row['confirmation_receipt_mime'] ?: 'application/octet-stream');
        $allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!in_array($mime, $allowedMimes, true)) $mime = 'application/octet-stream';
        $safeName = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)($row['confirmation_receipt_name'] ?: basename($fullPath)));
        header('Content-Type: ' . $mime);
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: inline; filename="' . $safeName . '"');
        header('Content-Length: ' . filesize($fullPath));
        readfile($fullPath);
        exit;
    }

    // =========================================================================
    // 2. POST ?action=record_receiving_damage
    //    Records damaged cans inspected during PO receiving.
    //    NEVER adds to sellable inventory or inventory_batches.
    // =========================================================================
    if ($method === 'POST' && $action === 'record_receiving_damage') {
        $poId = trim((string)($body['poId'] ?? ''));
        $poNumber = trim((string)($body['poNumber'] ?? ''));
        $supplierId = trim((string)($body['supplierId'] ?? ''));
        $supplierName = trim((string)($body['supplierName'] ?? ''));
        $receivingTxKey = !empty($body['receivingTxKey']) ? substr(trim((string)$body['receivingTxKey']), 0, 100) : null;
        $autoGenerateReplacement = !array_key_exists('autoGenerateReplacement', $body) || !empty($body['autoGenerateReplacement']);
        $items = isset($body['items']) && is_array($body['items']) ? $body['items'] : [];
        if (!$items) sr_fail(400, 'No damaged items provided.');

        $now = date('Y-m-d H:i:s');
        $todayDate = date('Y-m-d');
        $createdIds = [];
        $driverReturnLines = [];
        $autoReturnRef = null;
        $autoReturnId = null;
        $autoReplacementIds = [];
        $autoReplacementRefs = [];

        $conn->begin_transaction();
        try {
            // Duplicate confirmation prevention via receivingTxKey
            if ($receivingTxKey) {
                $txChk = $conn->prepare("SELECT id FROM damaged_stock_records WHERE receiving_tx_key = ? LIMIT 1");
                $txChk->bind_param('s', $receivingTxKey);
                $txChk->execute();
                $dupTx = $txChk->get_result()->fetch_assoc();
                $txChk->close();
                if ($dupTx) {
                    throw new Exception('Duplicate receiving confirmation blocked: damaged stock and replacement requests were already generated for this transaction.');
                }
            }

            foreach ($items as $it) {
                $productId = trim((string)($it['productId'] ?? ''));
                $productName = trim((string)($it['productName'] ?? ''));
                $sizeId = !empty($it['sizeId']) ? trim((string)$it['sizeId']) : null;
                $containerSize = (float)($it['containerSize'] ?? 1);
                $deliveredQty = max(0, (int)($it['deliveredQty'] ?? 0));
                $acceptedQty = max(0, (int)($it['acceptedQty'] ?? 0));
                $damagedQty = max(0, (int)($it['damagedQty'] ?? 0));
                $reason = trim((string)($it['reason'] ?? ''));
                $notes = trim((string)($it['inspectionNotes'] ?? ''));
                $handling = trim((string)($it['handling'] ?? 'returned_to_driver'));
                $batchId = !empty($it['batchId']) ? trim((string)$it['batchId']) : null;
                $batchNumber = !empty($it['batchNumber']) ? trim((string)$it['batchNumber']) : null;

                if ($damagedQty <= 0) continue;
                if ($acceptedQty > $deliveredQty || $damagedQty > $deliveredQty || $deliveredQty !== ($acceptedQty + $damagedQty)) {
                    throw new Exception("Validation error for {$productName}: Actual Delivered ({$deliveredQty}) must equal Accepted ({$acceptedQty}) + Damaged/Rejected ({$damagedQty}).");
                }
                if ($reason === '' || !in_array($reason, SR_DAMAGE_REASONS, true)) {
                    throw new Exception("A valid Damage / Rejection Reason is required for {$productName}.");
                }

                // Resolve sizeId if missing
                $psRow = srResolveProductSize($conn, $productId, $sizeId, $containerSize);
                if ($psRow) {
                    $sizeId = $psRow['size_id'];
                    if ($productName === '') $productName = $psRow['product_name'];
                }

                $isReturnedToDriver = ($handling === 'returned_to_driver');
                $actionLabel = $isReturnedToDriver ? 'Rejected & Returned to Delivery Personnel' : 'Damaged Stock Quarantined on Delivery';

                // Log 0-liter movement so it appears in Stock Movement History as Damaged / Rejected without altering sellable stock
                $mvNote = "{$actionLabel}: {$poNumber} ({$supplierName}) [Delivered: {$deliveredQty}, Accepted: {$acceptedQty}, Damaged/Rejected: {$damagedQty} × {$containerSize}L — Excluded from sellable stock] · Reason: {$reason}" . ($notes !== '' ? " — {$notes}" : '');
                $mid = srInsertMovement($conn, 'damaged', $productId ?: null, $sizeId, $containerSize, "{$productName} [Damaged / Rejected]", 0.0, $mvNote, $actorName, $now);

                $dmgId = srUid('dmg');
                $source = 'receiving';
                $stockDeducted = 0; // Never added to sellable inventory, so no deduction needed
                $returnedQty = $isReturnedToDriver ? $damagedQty : 0;

                $ins = $conn->prepare("INSERT INTO damaged_stock_records
                    (id, po_id, po_number, supplier_id, supplier_name, product_id, product_name, size_id, container_size,
                     batch_id, batch_number, source, delivered_qty, accepted_qty, damaged_qty, returned_qty, reason,
                     inspection_notes, stock_deducted, movement_id, receiving_tx_key, recorded_by, recorded_role, recorded_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $ins->bind_param(
                    'ssssssssdsssiiiississsss',
                    $dmgId, $poId, $poNumber, $supplierId, $supplierName, $productId, $productName, $sizeId, $containerSize,
                    $batchId, $batchNumber, $source, $deliveredQty, $acceptedQty, $damagedQty, $returnedQty, $reason,
                    $notes, $stockDeducted, $mid, $receivingTxKey, $actorName, $role, $now
                );
                $ins->execute();
                $ins->close();
                $createdIds[] = $dmgId;

                srWriteAudit(
                    $conn,
                    $actor,
                    'DAMAGED_STOCK_RECORD',
                    'Stock Receiving',
                    "{$actionLabel} for {$poNumber}: {$damagedQty} × {$containerSize}L of {$productName} (Delivered: {$deliveredQty}, Accepted: {$acceptedQty}, Damaged/Rejected: {$damagedQty}). Excluded from sellable stock.",
                    $productId,
                    $productName,
                    'Physical Receiving Inspection',
                    "0 damaged/rejected",
                    "{$damagedQty} × {$containerSize}L " . ($isReturnedToDriver ? 'rejected & returned to driver' : 'quarantined'),
                    $poNumber,
                    $reason . ($notes !== '' ? " — {$notes}" : '')
                );

                // Automatically generate a product-level Supplier Replacement Request (initial status: Awaiting Supplier Confirmation)
                if ($autoGenerateReplacement && $poId !== '' && $productId !== '') {
                    // Safeguard: ensure no duplicate active replacement request exists for this (po_id, receiving_tx_key, product_id, container_size) or damaged_record_id
                    $dupRepChk = null;
                    if ($receivingTxKey) {
                        $dChk = $conn->prepare("SELECT id FROM supplier_replacement_requests WHERE po_id = ? AND receiving_tx_key = ? AND product_id = ? AND ABS(container_size - ?) < 0.01 LIMIT 1");
                        $dChk->bind_param('sssd', $poId, $receivingTxKey, $productId, $containerSize);
                        $dChk->execute();
                        $dupRepChk = $dChk->get_result()->fetch_assoc();
                        $dChk->close();
                    }
                    if (!$dupRepChk) {
                        $dChk2 = $conn->prepare("SELECT id FROM supplier_replacement_requests WHERE damaged_record_id = ? AND status != 'Cancelled' LIMIT 1");
                        $dChk2->bind_param('s', $dmgId);
                        $dChk2->execute();
                        $dupRepChk = $dChk2->get_result()->fetch_assoc();
                        $dChk2->close();
                    }
                    if (!$dupRepChk) {
                        $repId = srUid('rep');
                        $repRef = srGenerateReplacementRef($conn);
                        $repStatus = 'Awaiting Supplier Confirmation';
                        $repRetQty = $isReturnedToDriver ? $damagedQty : 0;
                        $repNotes = $notes !== '' ? $notes : ($isReturnedToDriver ? 'Auto-generated upon physical receiving rejection (returned to delivery personnel).' : 'Auto-generated upon physical receiving inspection (documented for return).');

                        $insRep = $conn->prepare("INSERT INTO supplier_replacement_requests
                            (id, request_ref, po_id, po_number, supplier_id, supplier_name, damaged_record_id, receiving_tx_key, parent_request_id,
                             product_id, product_name, size_id, container_size, damaged_qty, returned_qty, requested_qty,
                             received_qty, rejected_qty, reason, request_date, expected_delivery_date,
                             supplier_confirmed, supplier_confirmed_at, supplier_confirmation_note, status,
                             staff_responsible, created_role, notes, updated_by, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, NULL, 0, NULL, '', ?, ?, ?, ?, ?, ?)");
                        $insRep->bind_param(
                            'sssssssssssdiiissssssss',
                            $repId, $repRef, $poId, $poNumber, $supplierId, $supplierName, $dmgId, $receivingTxKey,
                            $productId, $productName, $sizeId, $containerSize, $damagedQty, $repRetQty, $damagedQty,
                            $reason, $todayDate, $repStatus, $actorName, $role, $repNotes, $actorName, $now
                        );
                        $insRep->execute();
                        $insRep->close();
                        $autoReplacementIds[] = $repId;
                        $autoReplacementRefs[] = $repRef;

                        srWriteAudit(
                            $conn,
                            $actor,
                            'REPLACEMENT_REQUEST_CREATE',
                            'Purchase Order',
                            "Auto-generated Supplier Replacement Request {$repRef} linked to {$poNumber} ({$supplierName}): {$damagedQty} × {$containerSize}L of {$productName} — Status: {$repStatus}. No new PO or payable created.",
                            $productId,
                            $repRef,
                            'Replacement Request Auto-Generated',
                            null,
                            "{$repStatus} · {$damagedQty} unit(s)",
                            $repRef,
                            $reason . ($notes !== '' ? " — {$notes}" : '')
                        );
                    }
                }

                if ($isReturnedToDriver) {
                    $driverReturnLines[] = [
                        'id' => srUid('sri'),
                        'damagedRecordId' => $dmgId,
                        'productId' => $productId,
                        'productName' => $productName,
                        'sizeId' => $sizeId,
                        'containerSize' => $containerSize,
                        'batchId' => $batchId,
                        'batchNumber' => $batchNumber,
                        'damagedQty' => $damagedQty,
                        'reason' => $reason,
                        'notes' => $notes,
                    ];
                }
            }

            // Recalculate original PO status & separate quantities (stays Partial while replacement request is unresolved)
            if ($poId !== '' && count($autoReplacementIds) > 0) {
                srRecalcPOStatus($conn, $poId);
            }

            // Auto-create linked Supplier Return / Rejection transaction ONLY when Replacement Tracking is not already auto-generated
            // (prevents dual-system SRET + REP inventory double-counting for the same damaged units)
            if (count($driverReturnLines) > 0 && empty($autoReplacementIds)) {
                $autoReturnId = srUid('sret');
                $autoReturnRef = srGenerateReturnRef($conn);
                $primaryReason = $driverReturnLines[0]['reason'];
                $retStatus = 'Returned to Supplier';
                $resType = 'Replacement Stock';
                $retNotes = "Rejected during physical receiving inspection and returned directly to delivery personnel (PO: {$poNumber}).";
                $isApproved = $isAdmin ? 1 : 0;
                $approvedBy = $isAdmin ? $actorName : null;
                $approvedAt = $isAdmin ? $now : null;
                $isFinalized = 0;

                $insR = $conn->prepare("INSERT INTO supplier_returns
                    (id, return_ref, po_id, po_number, supplier_id, supplier_name, return_date, reason, notes,
                     status, resolution_type, is_approved, is_finalized, created_by, created_role, approved_by, approved_at, updated_by, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $insR->bind_param(
                    'sssssssssssiissssss',
                    $autoReturnId, $autoReturnRef, $poId, $poNumber, $supplierId, $supplierName, $todayDate, $primaryReason, $retNotes,
                    $retStatus, $resType, $isApproved, $isFinalized, $actorName, $role, $approvedBy, $approvedAt, $actorName, $now
                );
                $insR->execute();
                $insR->close();

                $insI = $conn->prepare("INSERT INTO supplier_return_items
                    (id, return_id, damaged_record_id, product_id, product_name, size_id, container_size,
                     batch_id, batch_number, damaged_qty, replacement_received_qty, reason, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)");
                $summaryParts = [];
                $totalDriverQty = 0;
                foreach ($driverReturnLines as $dl) {
                    $insI->bind_param(
                        'ssssssdssiss',
                        $dl['id'], $autoReturnId, $dl['damagedRecordId'], $dl['productId'], $dl['productName'],
                        $dl['sizeId'], $dl['containerSize'], $dl['batchId'], $dl['batchNumber'],
                        $dl['damagedQty'], $dl['reason'], $dl['notes']
                    );
                    $insI->execute();
                    $summaryParts[] = "{$dl['productName']} ({$dl['damagedQty']} × {$dl['containerSize']}L)";
                    $totalDriverQty += $dl['damagedQty'];
                }
                $insI->close();

                srWriteAudit(
                    $conn,
                    $actor,
                    'SUPPLIER_RETURN_CREATE',
                    'Supplier Return',
                    "Recorded Supplier Rejection/Return {$autoReturnRef} (returned directly to delivery personnel during PO {$poNumber} inspection): " . implode(', ', $summaryParts),
                    $driverReturnLines[0]['productId'] ?? null,
                    $autoReturnRef,
                    'Supplier Return Created (On Delivery Rejection)',
                    null,
                    "{$retStatus} · {$totalDriverQty} unit(s) · {$resType}",
                    $autoReturnRef,
                    $primaryReason
                );
            }

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(400, $e->getMessage());
        }

        echo json_encode([
            'success' => true,
            'createdIds' => $createdIds,
            'autoReturnId' => $autoReturnId,
            'autoReturnRef' => $autoReturnRef,
            'autoReplacementIds' => $autoReplacementIds,
            'autoReplacementRefs' => $autoReplacementRefs,
        ] + sr_load_all($conn));
        exit;
    }

    // =========================================================================
    // 3. POST ?action=record_post_receiving_damage
    //    Damage discovered AFTER stock was already received into inventory.
    //    Atomically deducts from sellable inventory + FIFO/target batch,
    //    and records damaged_stock_records with stock_deducted = 1.
    // =========================================================================
    if ($method === 'POST' && $action === 'record_post_receiving_damage') {
        $productId = trim((string)($body['productId'] ?? ''));
        $sizeId = !empty($body['sizeId']) ? trim((string)$body['sizeId']) : null;
        $containerSize = (float)($body['containerSize'] ?? 1);
        $damagedQty = (int)($body['damagedQty'] ?? 0);
        $reason = trim((string)($body['reason'] ?? 'Other'));
        $notes = trim((string)($body['inspectionNotes'] ?? ''));
        $poId = !empty($body['poId']) ? trim((string)$body['poId']) : null;
        $poNumber = !empty($body['poNumber']) ? trim((string)$body['poNumber']) : '';
        $supplierId = !empty($body['supplierId']) ? trim((string)$body['supplierId']) : null;
        $supplierName = !empty($body['supplierName']) ? trim((string)$body['supplierName']) : '';
        $batchId = !empty($body['batchId']) ? trim((string)$body['batchId']) : null;

        if ($productId === '' || $damagedQty <= 0) {
            sr_fail(400, 'Please select a product and enter a damaged quantity greater than 0.');
        }
        if (!in_array($reason, SR_DAMAGE_REASONS, true)) {
            $reason = 'Other';
        }

        $now = date('Y-m-d H:i:s');
        $conn->begin_transaction();
        try {
            $psRow = srResolveProductSize($conn, $productId, $sizeId, $containerSize);
            if (!$psRow) {
                throw new Exception('Selected product and container size not found in database.');
            }
            $sizeId = (string)$psRow['size_id'];
            $containerSize = (float)$psRow['container_size'];
            $productName = (string)$psRow['product_name'];

            // Lock inventory row
            $invSt = $conn->prepare("SELECT sealed_quantity FROM inventory WHERE size_id = ? FOR UPDATE");
            $invSt->bind_param('s', $sizeId);
            $invSt->execute();
            $invRow = $invSt->get_result()->fetch_assoc();
            $invSt->close();
            $availSealed = $invRow ? (int)$invRow['sealed_quantity'] : 0;

            if ($damagedQty > $availSealed) {
                throw new Exception("Cannot quarantine {$damagedQty} × {$containerSize}L of {$productName}: only {$availSealed} sealed unit(s) available in sellable inventory.");
            }

            // If a specific batch was chosen, validate its remaining_qty & inherit PO/supplier metadata
            $batchNumber = null;
            if ($batchId) {
                $bSt = $conn->prepare("SELECT batch_id, batch_number, size_id, remaining_qty, po_id, po_number, supplier_id, supplier_name
                    FROM inventory_batches WHERE batch_id = ? FOR UPDATE");
                $bSt->bind_param('s', $batchId);
                $bSt->execute();
                $bRow = $bSt->get_result()->fetch_assoc();
                $bSt->close();
                if (!$bRow || (string)$bRow['size_id'] !== $sizeId) {
                    throw new Exception('Selected batch does not match this product/size.');
                }
                if ((int)$bRow['remaining_qty'] < $damagedQty) {
                    throw new Exception("Selected batch {$bRow['batch_number']} only has {$bRow['remaining_qty']} remaining unit(s).");
                }
                $batchNumber = (string)$bRow['batch_number'];
                if (!$poId && !empty($bRow['po_id'])) $poId = (string)$bRow['po_id'];
                if ($poNumber === '' && !empty($bRow['po_number'])) $poNumber = (string)$bRow['po_number'];
                if (!$supplierId && !empty($bRow['supplier_id'])) $supplierId = (string)$bRow['supplier_id'];
                if ($supplierName === '' && !empty($bRow['supplier_name'])) $supplierName = (string)$bRow['supplier_name'];
            }

            // If PO was selected without supplier, resolve supplier from purchase_orders
            if ($poId && $supplierName === '') {
                $pSt = $conn->prepare("SELECT po_number, supplier_id, supplier_name FROM purchase_orders WHERE id = ? LIMIT 1");
                $pSt->bind_param('s', $poId);
                $pSt->execute();
                $pRow = $pSt->get_result()->fetch_assoc();
                $pSt->close();
                if ($pRow) {
                    if ($poNumber === '') $poNumber = (string)$pRow['po_number'];
                    if (!$supplierId) $supplierId = (string)$pRow['supplier_id'];
                    $supplierName = (string)$pRow['supplier_name'];
                }
            }

            // 1. Deduct from inventory.sealed_quantity
            $newSealed = $availSealed - $damagedQty;
            $upInv = $conn->prepare("UPDATE inventory SET sealed_quantity = ? WHERE size_id = ?");
            $upInv->bind_param('is', $newSealed, $sizeId);
            $upInv->execute();
            $upInv->close();

            // 2. Sync products.stock & can_stock_json
            $newTotalLiters = srSyncProductTotalsFromInventory($conn, $productId);
            $litersDeducted = round($damagedQty * $containerSize, 2);

            // 3. Insert negative damaged/quarantine stock movement
            $refTag = $poNumber !== '' ? " ({$poNumber})" : '';
            $batchTag = $batchNumber ? " [Batch: {$batchNumber}]" : '';
            $mvNote = "Post-Receiving Damaged Stock Quarantine{$refTag}{$batchTag}: -{$damagedQty} × {$containerSize}L (-{$litersDeducted}L) · {$containerSize}L Units: {$availSealed}→{$newSealed} · Reason: {$reason}" . ($notes !== '' ? " — {$notes}" : '');
            $mid = srInsertMovement($conn, 'damaged', $productId, $sizeId, $containerSize, $productName, -$litersDeducted, $mvNote, $actorName, $now);

            // 4. Deduct from inventory_batches (targeted batch first, else FIFO; allows expired batches since it's a quarantine write-off)
            $deducted = batchFifoDeduct($conn, $sizeId, $damagedQty, $mid, 'adjustment', $poNumber ?: null, substr($mvNote, 0, 400), $actorName, $now, $batchId, true);
            if ($deducted < $damagedQty) {
                batchReconcile($conn, $actorName, false);
            }

            // 5. Insert damaged_stock_records with stock_deducted = 1 (so supplier return will NOT deduct again!)
            $dmgId = srUid('dmg');
            $source = 'post_receiving';
            $deliveredQty = 0;
            $acceptedQty = 0;
            $returnedQty = 0;
            $stockDeducted = 1;

            $ins = $conn->prepare("INSERT INTO damaged_stock_records
                (id, po_id, po_number, supplier_id, supplier_name, product_id, product_name, size_id, container_size,
                 batch_id, batch_number, source, delivered_qty, accepted_qty, damaged_qty, returned_qty, reason,
                 inspection_notes, stock_deducted, movement_id, recorded_by, recorded_role, recorded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $ins->bind_param(
                'ssssssssdsssiiiississss',
                $dmgId, $poId, $poNumber, $supplierId, $supplierName, $productId, $productName, $sizeId, $containerSize,
                $batchId, $batchNumber, $source, $deliveredQty, $acceptedQty, $damagedQty, $returnedQty, $reason,
                $notes, $stockDeducted, $mid, $actorName, $role, $now
            );
            $ins->execute();
            $ins->close();

            srWriteAudit(
                $conn,
                $actor,
                'DAMAGED_STOCK_QUARANTINE',
                'Inventory',
                "Quarantined {$damagedQty} × {$containerSize}L (-{$litersDeducted}L) of {$productName} discovered damaged after receiving" . ($poNumber !== '' ? " (PO: {$poNumber})" : '') . ($batchNumber ? " [Batch: {$batchNumber}]" : '') . ".",
                $productId,
                $productName,
                'Sealed Stock Quantity',
                "{$availSealed} units ({$containerSize}L)",
                "{$newSealed} units ({$containerSize}L) · {$damagedQty} quarantined",
                $poNumber ?: $dmgId,
                $reason . ($notes !== '' ? " — {$notes}" : '')
            );

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(400, $e->getMessage());
        }

        echo json_encode(['success' => true, 'damagedRecordId' => $dmgId] + sr_load_all($conn));
        exit;
    }

    // =========================================================================
    // 4. POST ?action=create_return
    //    Creates a Supplier Return (SRET-YYYYMMDD-XXXX) with 1+ damaged items.
    //    Validates eligible qty strictly; NEVER duplicates stock deductions.
    // =========================================================================
    if ($method === 'POST' && $action === 'create_return') {
        $poId = !empty($body['poId']) ? trim((string)$body['poId']) : null;
        $poNumber = trim((string)($body['poNumber'] ?? ''));
        $supplierId = !empty($body['supplierId']) ? trim((string)$body['supplierId']) : null;
        $supplierName = trim((string)($body['supplierName'] ?? ''));
        $returnDate = trim((string)($body['returnDate'] ?? date('Y-m-d')));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $returnDate)) $returnDate = date('Y-m-d');
        $reason = trim((string)($body['reason'] ?? 'Other'));
        if (!in_array($reason, SR_DAMAGE_REASONS, true)) $reason = 'Other';
        $resolutionType = trim((string)($body['resolutionType'] ?? 'Replacement Stock'));
        if (!in_array($resolutionType, SR_RESOLUTION_TYPES, true)) $resolutionType = 'Replacement Stock';
        $notes = trim((string)($body['notes'] ?? ''));
        $items = isset($body['items']) && is_array($body['items']) ? $body['items'] : [];

        if (!$items) sr_fail(400, 'Select at least one damaged product to include in the supplier return.');

        $now = date('Y-m-d H:i:s');
        $conn->begin_transaction();
        try {
            $returnId = srUid('sret');
            $returnRef = srGenerateReturnRef($conn);
            $validatedItems = [];
            $totalReturnQty = 0;

            foreach ($items as $line) {
                $dmgId = trim((string)($line['damagedRecordId'] ?? ''));
                $qty = (int)($line['returnQty'] ?? 0);
                $lineReason = trim((string)($line['reason'] ?? $reason));
                if (!in_array($lineReason, SR_DAMAGE_REASONS, true)) $lineReason = $reason;
                $lineNotes = trim((string)($line['notes'] ?? ''));

                if ($qty <= 0) continue;
                if ($dmgId === '') {
                    throw new Exception('Each supplier return item must reference a recorded damaged stock entry.');
                }

                // Lock damaged_stock_records row to prevent concurrent over-returns
                $dSt = $conn->prepare("SELECT * FROM damaged_stock_records WHERE id = ? FOR UPDATE");
                $dSt->bind_param('s', $dmgId);
                $dSt->execute();
                $dRow = $dSt->get_result()->fetch_assoc();
                $dSt->close();

                if (!$dRow) {
                    throw new Exception("Damaged stock record ({$dmgId}) not found.");
                }

                $eligible = max(0, (int)$dRow['damaged_qty'] - (int)$dRow['returned_qty']);
                if ($qty > $eligible) {
                    throw new Exception("Cannot return {$qty} unit(s) of {$dRow['product_name']}: only {$eligible} damaged unit(s) eligible for return (Recorded: {$dRow['damaged_qty']}, Already Returned: {$dRow['returned_qty']}).");
                }

                // Inherit PO & Supplier info if not provided at header
                if (!$poId && !empty($dRow['po_id'])) $poId = (string)$dRow['po_id'];
                if ($poNumber === '' && !empty($dRow['po_number'])) $poNumber = (string)$dRow['po_number'];
                if (!$supplierId && !empty($dRow['supplier_id'])) $supplierId = (string)$dRow['supplier_id'];
                if ($supplierName === '' && !empty($dRow['supplier_name'])) $supplierName = (string)$dRow['supplier_name'];

                // Increment returned_qty on damaged_stock_records
                $newRetQty = (int)$dRow['returned_qty'] + $qty;
                $upD = $conn->prepare("UPDATE damaged_stock_records SET returned_qty = ? WHERE id = ?");
                $upD->bind_param('is', $newRetQty, $dmgId);
                $upD->execute();
                $upD->close();

                $validatedItems[] = [
                    'id' => srUid('sri'),
                    'damagedRecordId' => $dmgId,
                    'productId' => (string)$dRow['product_id'],
                    'productName' => (string)$dRow['product_name'],
                    'sizeId' => $dRow['size_id'],
                    'containerSize' => (float)$dRow['container_size'],
                    'batchId' => $dRow['batch_id'],
                    'batchNumber' => $dRow['batch_number'],
                    'damagedQty' => $qty,
                    'reason' => $lineReason,
                    'notes' => $lineNotes,
                ];
                $totalReturnQty += $qty;
            }

            if (!$validatedItems || $totalReturnQty <= 0) {
                throw new Exception('Enter at least one valid return quantity greater than 0.');
            }
            if ($supplierName === '') $supplierName = 'Unspecified Supplier';

            $status = 'Pending Return';
            $isApproved = $isAdmin ? 1 : 0;
            $approvedBy = $isAdmin ? $actorName : null;
            $approvedAt = $isAdmin ? $now : null;
            $isFinalized = 0;

            $insR = $conn->prepare("INSERT INTO supplier_returns
                (id, return_ref, po_id, po_number, supplier_id, supplier_name, return_date, reason, notes,
                 status, resolution_type, is_approved, is_finalized, created_by, created_role, approved_by, approved_at, updated_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $insR->bind_param(
                'sssssssssssiissssss',
                $returnId, $returnRef, $poId, $poNumber, $supplierId, $supplierName, $returnDate, $reason, $notes,
                $status, $resolutionType, $isApproved, $isFinalized, $actorName, $role, $approvedBy, $approvedAt, $actorName, $now
            );
            $insR->execute();
            $insR->close();

            $insI = $conn->prepare("INSERT INTO supplier_return_items
                (id, return_id, damaged_record_id, product_id, product_name, size_id, container_size,
                 batch_id, batch_number, damaged_qty, replacement_received_qty, reason, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)");
            $summaryParts = [];
            foreach ($validatedItems as $vi) {
                $insI->bind_param(
                    'ssssssdssiss',
                    $vi['id'], $returnId, $vi['damagedRecordId'], $vi['productId'], $vi['productName'],
                    $vi['sizeId'], $vi['containerSize'], $vi['batchId'], $vi['batchNumber'],
                    $vi['damagedQty'], $vi['reason'], $vi['notes']
                );
                $insI->execute();
                $summaryParts[] = "{$vi['productName']} ({$vi['damagedQty']} × {$vi['containerSize']}L)";
            }
            $insI->close();

            $firstProdId = $validatedItems[0]['productId'] ?? null;
            srWriteAudit(
                $conn,
                $actor,
                'SUPPLIER_RETURN_CREATE',
                'Supplier Return',
                "Created Supplier Return {$returnRef} for {$supplierName}" . ($poNumber !== '' ? " (PO: {$poNumber})" : '') . " — " . implode(', ', $summaryParts) . " · Resolution: {$resolutionType}" . ($isApproved ? ' [Auto-approved by Admin]' : ' [Awaiting Admin Approval]'),
                $firstProdId,
                $returnRef,
                'Supplier Return Created',
                null,
                "{$status} · {$totalReturnQty} unit(s) · {$resolutionType}",
                $returnRef,
                $reason . ($notes !== '' ? " — {$notes}" : '')
            );

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(400, $e->getMessage());
        }

        echo json_encode(['success' => true, 'returnId' => $returnId, 'returnRef' => $returnRef] + sr_load_all($conn));
        exit;
    }

    // =========================================================================
    // 5. POST ?action=approve_return (Admin ONLY)
    // =========================================================================
    if ($method === 'POST' && $action === 'approve_return') {
        if (!$isAdmin) {
            sr_fail(403, 'Only Administrators may approve supplier return transactions.');
        }
        $returnId = trim((string)($body['returnId'] ?? ''));
        if ($returnId === '') sr_fail(400, 'Return ID is required.');

        $now = date('Y-m-d H:i:s');
        $conn->begin_transaction();
        try {
            $st = $conn->prepare("SELECT * FROM supplier_returns WHERE id = ? FOR UPDATE");
            $st->bind_param('s', $returnId);
            $st->execute();
            $ret = $st->get_result()->fetch_assoc();
            $st->close();
            if (!$ret) throw new Exception('Supplier return not found.');
            if ((int)$ret['is_finalized'] === 1) throw new Exception('This supplier return is already finalized.');
            if ((int)$ret['is_approved'] === 1) throw new Exception('This supplier return is already approved.');

            $up = $conn->prepare("UPDATE supplier_returns SET is_approved = 1, approved_by = ?, approved_at = ?, updated_by = ?, updated_at = ? WHERE id = ?");
            $up->bind_param('sssss', $actorName, $now, $actorName, $now, $returnId);
            $up->execute();
            $up->close();

            srWriteAudit(
                $conn,
                $actor,
                'SUPPLIER_RETURN_APPROVE',
                'Supplier Return',
                "Approved Supplier Return {$ret['return_ref']} ({$ret['supplier_name']}, PO: {$ret['po_number']}).",
                null,
                (string)$ret['return_ref'],
                'Approval Status',
                'Pending Admin Approval',
                "Approved by {$actorName}",
                (string)$ret['return_ref'],
                (string)$ret['reason']
            );

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(400, $e->getMessage());
        }

        echo json_encode(['success' => true] + sr_load_all($conn));
        exit;
    }

    // =========================================================================
    // 6. POST ?action=update_status
    //    Updates status, resolution type, credit amount, and resolution notes.
    //    Enforces RBAC & immutability of finalized records.
    // =========================================================================
    if ($method === 'POST' && $action === 'update_status') {
        $returnId = trim((string)($body['returnId'] ?? ''));
        $newStatus = trim((string)($body['status'] ?? ''));
        $newResolution = trim((string)($body['resolutionType'] ?? ''));
        $resolutionNotes = trim((string)($body['resolutionNotes'] ?? ''));
        $creditAmount = isset($body['creditAmount']) && $body['creditAmount'] !== '' && $body['creditAmount'] !== null
            ? round((float)$body['creditAmount'], 2) : null;

        if ($returnId === '') sr_fail(400, 'Return ID is required.');
        if (!in_array($newStatus, SR_RETURN_STATUSES, true)) {
            sr_fail(400, 'Invalid return status selected.');
        }
        if ($newResolution !== '' && !in_array($newResolution, SR_RESOLUTION_TYPES, true)) {
            sr_fail(400, 'Invalid resolution type selected.');
        }
        if ($creditAmount !== null && $creditAmount <= 0) {
            sr_fail(400, 'Credit or refund amount must be greater than zero.');
        }

        $now = date('Y-m-d H:i:s');
        $conn->begin_transaction();
        try {
            $st = $conn->prepare("SELECT * FROM supplier_returns WHERE id = ? FOR UPDATE");
            $st->bind_param('s', $returnId);
            $st->execute();
            $ret = $st->get_result()->fetch_assoc();
            $st->close();
            if (!$ret) throw new Exception('Supplier return not found.');

            $oldStatus = (string)$ret['status'];
            $oldResolution = (string)$ret['resolution_type'];
            $wasFinalized = (int)$ret['is_finalized'] === 1;
            $wasApproved = (int)$ret['is_approved'] === 1;

            // Finalized record protection
            if ($wasFinalized) {
                if (!$isAdmin) {
                    throw new Exception('Access denied: Finalized supplier return records cannot be modified.');
                }
                if ($oldStatus === 'Closed') {
                    throw new Exception('This supplier return is already Closed and locked for audit integrity.');
                }
                // Admin may only transition a finalized credit/refund/rejected record to Closed
                if ($newStatus !== 'Closed') {
                    throw new Exception('Finalized supplier returns can only be marked as Closed by an Administrator.');
                }
            }

            // Admin-only status transitions (finalization / financial resolution)
            if (in_array($newStatus, SR_ADMIN_ONLY_STATUSES, true) && !$isAdmin) {
                throw new Exception("Only Administrators may set supplier return status to \"{$newStatus}\".");
            }

            // Cannot mark Replacement Received without actually receiving replacement stock via receive_replacement
            if ($newStatus === 'Replacement Received' && $oldStatus !== 'Replacement Received') {
                $chk = $conn->prepare("SELECT SUM(damaged_qty) AS dq, SUM(replacement_received_qty) AS rq FROM supplier_return_items WHERE return_id = ?");
                $chk->bind_param('s', $returnId);
                $chk->execute();
                $cr = $chk->get_result()->fetch_assoc();
                $chk->close();
                if ((int)($cr['rq'] ?? 0) <= 0) {
                    throw new Exception('Use "Receive Replacement Stock" to record actual replacement delivery — inventory is never increased merely by changing status.');
                }
            }

            // Moving past Pending Return requires approval (Admin auto-approves on status update)
            $isApproved = $wasApproved;
            $approvedBy = $ret['approved_by'];
            $approvedAt = $ret['approved_at'];
            if (!$isApproved && $newStatus !== 'Pending Return') {
                if (!$isAdmin) {
                    throw new Exception('This supplier return requires Administrator approval before advancing status.');
                }
                $isApproved = 1;
                $approvedBy = $actorName;
                $approvedAt = $now;
            }

            $finalResolution = $newResolution !== '' ? $newResolution : $oldResolution;
            $isFinalized = ($wasFinalized || in_array($newStatus, SR_FINALIZED_STATUSES, true)) ? 1 : 0;

            $up = $conn->prepare("UPDATE supplier_returns
                SET status = ?, resolution_type = ?, resolution_notes = ?, credit_amount = ?,
                    is_approved = ?, is_finalized = ?, approved_by = ?, approved_at = ?, updated_by = ?, updated_at = ?
                WHERE id = ?");
            $up->bind_param(
                'sssdiisssss',
                $newStatus, $finalResolution, $resolutionNotes, $creditAmount,
                $isApproved, $isFinalized, $approvedBy, $approvedAt, $actorName, $now, $returnId
            );
            $up->execute();
            $up->close();

            $creditStr = $creditAmount !== null ? (' · Amount: PHP ' . number_format($creditAmount, 2)) : '';
            srWriteAudit(
                $conn,
                $actor,
                'SUPPLIER_RETURN_STATUS',
                'Supplier Return',
                "Updated Supplier Return {$ret['return_ref']} ({$ret['supplier_name']}): Status \"{$oldStatus}\" → \"{$newStatus}\", Resolution \"{$oldResolution}\" → \"{$finalResolution}\"{$creditStr}" . ($resolutionNotes !== '' ? " — {$resolutionNotes}" : ''),
                null,
                (string)$ret['return_ref'],
                'Return Status & Resolution',
                "{$oldStatus} ({$oldResolution})",
                "{$newStatus} ({$finalResolution}){$creditStr}",
                (string)$ret['return_ref'],
                $resolutionNotes !== '' ? $resolutionNotes : (string)$ret['reason']
            );

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(400, $e->getMessage());
        }

        echo json_encode(['success' => true] + sr_load_all($conn));
        exit;
    }

    // =========================================================================
    // 7. POST ?action=receive_replacement
    //    Records physical arrival of replacement stock linked to a Supplier Return.
    //    Creates a separate receiving stock movement + new FIFO inventory_batch.
    //    NEVER auto-increases stock before physical receipt.
    // =========================================================================
    if ($method === 'POST' && $action === 'receive_replacement') {
        $returnId = trim((string)($body['returnId'] ?? ''));
        $items = isset($body['items']) && is_array($body['items']) ? $body['items'] : [];
        $deliveryNote = trim((string)($body['notes'] ?? ''));
        if ($returnId === '' || !$items) {
            sr_fail(400, 'Return ID and replacement item quantities are required.');
        }

        $now = date('Y-m-d H:i:s');
        $datePart = date('Ymd');
        $conn->begin_transaction();
        try {
            $st = $conn->prepare("SELECT * FROM supplier_returns WHERE id = ? FOR UPDATE");
            $st->bind_param('s', $returnId);
            $st->execute();
            $ret = $st->get_result()->fetch_assoc();
            $st->close();
            if (!$ret) throw new Exception('Supplier return not found.');
            if ((int)$ret['is_finalized'] === 1) {
                throw new Exception('Cannot receive replacement stock for a finalized/closed return.');
            }
            if ((int)$ret['is_approved'] !== 1) {
                if (!$isAdmin) {
                    throw new Exception('Supplier return must be approved by an Administrator before receiving replacement stock.');
                }
                $upApp = $conn->prepare("UPDATE supplier_returns SET is_approved = 1, approved_by = ?, approved_at = ? WHERE id = ?");
                $upApp->bind_param('sss', $actorName, $now, $returnId);
                $upApp->execute();
                $upApp->close();
            }

            $returnRef = (string)$ret['return_ref'];
            $poId = $ret['po_id'];
            $poNumber = (string)($ret['po_number'] ?? '');
            $supplierId = $ret['supplier_id'];
            $supplierName = (string)($ret['supplier_name'] ?? '');

            $receivedLines = [];
            $totalReceivedNow = 0;

            foreach ($items as $idx => $line) {
                $itemId = trim((string)($line['itemId'] ?? ''));
                $qty = (int)($line['receiveQty'] ?? 0);
                $expDate = !empty($line['expirationDate']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$line['expirationDate'])
                    ? (string)$line['expirationDate'] : null;
                $lineNote = trim((string)($line['notes'] ?? $deliveryNote));

                if ($qty <= 0) continue;
                if ($itemId === '') throw new Exception('Invalid return item ID.');

                $iSt = $conn->prepare("SELECT * FROM supplier_return_items WHERE id = ? AND return_id = ? FOR UPDATE");
                $iSt->bind_param('ss', $itemId, $returnId);
                $iSt->execute();
                $itemRow = $iSt->get_result()->fetch_assoc();
                $iSt->close();
                if (!$itemRow) throw new Exception('Supplier return item not found.');

                // Guard against dual-system double-counting: if tracked in supplier_replacement_requests, must receive there
                if (!empty($itemRow['damaged_record_id'])) {
                    $dupRepChk = $conn->prepare("SELECT request_ref FROM supplier_replacement_requests WHERE damaged_record_id = ? AND status != 'Cancelled' LIMIT 1");
                    if ($dupRepChk) {
                        $dupRepChk->bind_param('s', $itemRow['damaged_record_id']);
                        $dupRepChk->execute();
                        $dupRepRow = $dupRepChk->get_result()->fetch_assoc();
                        $dupRepChk->close();
                        if ($dupRepRow) {
                            throw new Exception("This damaged item is tracked under Replacement Request {$dupRepRow['request_ref']}. Receive the replacement delivery from Active Replacement Tracking to prevent double-counting inventory.");
                        }
                    }
                }

                $pendingRep = max(0, (int)$itemRow['damaged_qty'] - (int)$itemRow['replacement_received_qty']);
                if ($qty > $pendingRep) {
                    throw new Exception("Cannot receive {$qty} replacement unit(s) for {$itemRow['product_name']}: only {$pendingRep} unit(s) remaining for replacement.");
                }

                $productId = (string)$itemRow['product_id'];
                $containerSize = (float)$itemRow['container_size'];
                $psRow = srResolveProductSize($conn, $productId, $itemRow['size_id'], $containerSize);
                if (!$psRow) {
                    throw new Exception("Product size not found for {$itemRow['product_name']}.");
                }
                $sizeId = (string)$psRow['size_id'];
                $productName = (string)$psRow['product_name'];

                // Lock inventory row & add replacement cans
                $invSt = $conn->prepare("SELECT sealed_quantity FROM inventory WHERE size_id = ? FOR UPDATE");
                $invSt->bind_param('s', $sizeId);
                $invSt->execute();
                $invRow = $invSt->get_result()->fetch_assoc();
                $invSt->close();

                $beforeCans = $invRow ? (int)$invRow['sealed_quantity'] : 0;
                $afterCans = $beforeCans + $qty;

                if ($invRow) {
                    $upInv = $conn->prepare("UPDATE inventory SET sealed_quantity = ? WHERE size_id = ?");
                    $upInv->bind_param('is', $afterCans, $sizeId);
                    $upInv->execute();
                    $upInv->close();
                } else {
                    $newInvId = srUid('inv');
                    $insInv = $conn->prepare("INSERT INTO inventory (inventory_id, size_id, sealed_quantity, opened_quantity, remaining_volume) VALUES (?, ?, ?, 0, 0)");
                    $insInv->bind_param('ssi', $newInvId, $sizeId, $afterCans);
                    $insInv->execute();
                    $insInv->close();
                }

                // Sync product totals
                $afterLitersTotal = srSyncProductTotalsFromInventory($conn, $productId);
                $addedLiters = round($qty * $containerSize, 2);

                // Insert receiving movement linked to Supplier Return + PO
                $batchNo = 'REP-' . $datePart . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5)) . $idx;
                $mvNote = "Supplier Replacement Delivery: {$returnRef}" . ($poNumber !== '' ? " (PO: {$poNumber})" : '') . " ({$supplierName}) [Received {$qty} × {$containerSize}L (+{$addedLiters}L) · {$containerSize}L Units: {$beforeCans}→{$afterCans}, Batch: {$batchNo}]" . ($lineNote !== '' ? " — {$lineNote}" : '');
                $mid = srInsertMovement($conn, 'receiving', $productId, $sizeId, $containerSize, $productName, $addedLiters, $mvNote, $actorName, $now);

                // Create dedicated FIFO batch for the replacement stock
                $bid = batchCreate($conn, [
                    'size_id' => $sizeId,
                    'product_id' => $productId,
                    'qty' => $qty,
                    'batch_number' => $batchNo,
                    'expiration_date' => $expDate,
                    'unit_cost' => $itemRow['unit_cost'] !== null ? (float)$itemRow['unit_cost'] : null,
                    'supplier_id' => $supplierId,
                    'supplier_name' => $supplierName,
                    'po_id' => $poId,
                    'po_number' => $poNumber !== '' ? $poNumber : $returnRef,
                    'date_received' => $now,
                    'source' => 'receiving',
                    'notes' => "Replacement for {$returnRef}" . ($lineNote !== '' ? " — {$lineNote}" : ''),
                    'staff' => $actorName,
                ]);
                batchLog($conn, $bid, $mid, 'received', $qty, $qty, $returnRef, substr($mvNote, 0, 400), $actorName, $now);

                // Update replacement_received_qty on supplier_return_items
                $newRepQty = (int)$itemRow['replacement_received_qty'] + $qty;
                $upItem = $conn->prepare("UPDATE supplier_return_items SET replacement_received_qty = ? WHERE id = ?");
                $upItem->bind_param('is', $newRepQty, $itemId);
                $upItem->execute();
                $upItem->close();

                $receivedLines[] = "{$productName} ({$qty} × {$containerSize}L = +{$addedLiters}L, Batch {$batchNo})";
                $totalReceivedNow += $qty;
            }

            if ($totalReceivedNow <= 0) {
                throw new Exception('Enter at least one replacement quantity greater than 0.');
            }

            // Check if all replacement items are now fully received
            $chk = $conn->prepare("SELECT SUM(damaged_qty) AS dq, SUM(replacement_received_qty) AS rq FROM supplier_return_items WHERE return_id = ?");
            $chk->bind_param('s', $returnId);
            $chk->execute();
            $cr = $chk->get_result()->fetch_assoc();
            $chk->close();
            $allReplaced = ((int)($cr['rq'] ?? 0) >= (int)($cr['dq'] ?? 0));
            $newStatus = $allReplaced ? 'Replacement Received' : 'Awaiting Replacement';
            $oldStatus = (string)$ret['status'];

            $upR = $conn->prepare("UPDATE supplier_returns SET status = ?, resolution_type = 'Replacement Stock', updated_by = ?, updated_at = ? WHERE id = ?");
            $upR->bind_param('ssss', $newStatus, $actorName, $now, $returnId);
            $upR->execute();
            $upR->close();

            srWriteAudit(
                $conn,
                $actor,
                'SUPPLIER_RETURN_REPLACEMENT',
                'Supplier Return',
                "Received replacement stock for {$returnRef} ({$supplierName}): " . implode(', ', $receivedLines) . ". Status: {$oldStatus} → {$newStatus}.",
                null,
                $returnRef,
                'Replacement Stock Received',
                $oldStatus,
                "{$newStatus} (+{$totalReceivedNow} unit(s))",
                $returnRef,
                $deliveryNote !== '' ? $deliveryNote : "Replacement Delivery for {$returnRef}"
            );

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(400, $e->getMessage());
        }

        echo json_encode(['success' => true, 'allReplaced' => $allReplaced, 'receivedQty' => $totalReceivedNow] + sr_load_all($conn));
        exit;
    }

    // =========================================================================
    // 8. POST ?action=create_replacement_request
    //    Creates a Replacement Request (REP-YYYYMMDD-XXXX) linked to original PO.
    //    Never creates a new PO or duplicate supplier payable.
    // =========================================================================
    if ($method === 'POST' && $action === 'create_replacement_request') {
        $damagedRecordId = !empty($body['damagedRecordId']) ? trim((string)$body['damagedRecordId']) : null;
        $parentRequestId = !empty($body['parentRequestId']) ? trim((string)$body['parentRequestId']) : null;
        $poId = trim((string)($body['poId'] ?? ''));
        $poNumber = trim((string)($body['poNumber'] ?? ''));
        $supplierId = !empty($body['supplierId']) ? trim((string)$body['supplierId']) : null;
        $supplierName = trim((string)($body['supplierName'] ?? ''));
        $productId = trim((string)($body['productId'] ?? ''));
        $productName = trim((string)($body['productName'] ?? ''));
        $sizeId = !empty($body['sizeId']) ? trim((string)$body['sizeId']) : null;
        $containerSize = (float)($body['containerSize'] ?? 1);
        $damagedQty = max(0, (int)($body['damagedQty'] ?? 0));
        $returnedQty = max(0, (int)($body['returnedQty'] ?? 0));
        $requestedQty = max(0, (int)($body['requestedQty'] ?? 0));
        $reason = trim((string)($body['reason'] ?? ''));
        $requestDate = trim((string)($body['requestDate'] ?? date('Y-m-d')));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $requestDate)) $requestDate = date('Y-m-d');
        $expectedDeliveryDate = !empty($body['expectedDeliveryDate']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$body['expectedDeliveryDate'])
            ? (string)$body['expectedDeliveryDate'] : null;
        $supplierConfirmed = !empty($body['supplierConfirmed']) ? 1 : 0;
        $supplierConfirmationNote = trim((string)($body['supplierConfirmationNote'] ?? ''));
        $notes = trim((string)($body['notes'] ?? ''));

        $now = date('Y-m-d H:i:s');
        $conn->begin_transaction();
        try {
            // Auto-populate from damaged_stock_records if provided
            if ($damagedRecordId) {
                $dSt = $conn->prepare("SELECT * FROM damaged_stock_records WHERE id = ? FOR UPDATE");
                $dSt->bind_param('s', $damagedRecordId);
                $dSt->execute();
                $dRow = $dSt->get_result()->fetch_assoc();
                $dSt->close();
                if (!$dRow) throw new Exception('Referenced damaged stock record not found.');

                if ($poId === '') $poId = (string)($dRow['po_id'] ?? '');
                if ($poNumber === '') $poNumber = (string)($dRow['po_number'] ?? '');
                if (!$supplierId && !empty($dRow['supplier_id'])) $supplierId = (string)$dRow['supplier_id'];
                if ($supplierName === '') $supplierName = (string)($dRow['supplier_name'] ?? '');
                if ($productId === '') $productId = (string)$dRow['product_id'];
                if ($productName === '') $productName = (string)$dRow['product_name'];
                if (!$sizeId && !empty($dRow['size_id'])) $sizeId = (string)$dRow['size_id'];
                $containerSize = (float)$dRow['container_size'];
                $damagedQty = (int)$dRow['damaged_qty'];
                if ($returnedQty <= 0) $returnedQty = max((int)$dRow['returned_qty'], $damagedQty);
                if ($reason === '') $reason = (string)$dRow['reason'];

                // Check existing non-cancelled replacement requests against this damaged record
                $chkEx = $conn->prepare("SELECT COALESCE(SUM(requested_qty), 0) AS req_sum FROM supplier_replacement_requests WHERE damaged_record_id = ? AND status != 'Cancelled'");
                $chkEx->bind_param('s', $damagedRecordId);
                $chkEx->execute();
                $alreadyReq = (int)($chkEx->get_result()->fetch_assoc()['req_sum'] ?? 0);
                $chkEx->close();
                $maxEligible = max(0, $damagedQty - $alreadyReq);
                if ($requestedQty <= 0) $requestedQty = $maxEligible;
                if ($requestedQty <= 0 || $requestedQty > $maxEligible) {
                    throw new Exception("Requested replacement quantity ({$requestedQty}) exceeds eligible damaged quantity ({$maxEligible} remaining out of {$damagedQty}).");
                }
            }

            if ($poId === '' || $productId === '' || $requestedQty <= 0) {
                throw new Exception('Original Purchase Order, product, and a valid requested replacement quantity (> 0) are required.');
            }
            if ($reason === '' || !in_array($reason, SR_DAMAGE_REASONS, true)) {
                throw new Exception('A valid Damage Reason is required.');
            }

            $psRow = srResolveProductSize($conn, $productId, $sizeId, $containerSize);
            if ($psRow) {
                $sizeId = (string)$psRow['size_id'];
                if ($productName === '') $productName = (string)$psRow['product_name'];
            }

            $reqId = srUid('rep');
            $reqRef = srGenerateReplacementRef($conn);
            $status = $supplierConfirmed ? 'Confirmed by Supplier – Awaiting Delivery' : 'Awaiting Supplier Confirmation';
            $confirmedAt = $supplierConfirmed ? $now : null;

            $ins = $conn->prepare("INSERT INTO supplier_replacement_requests
                (id, request_ref, po_id, po_number, supplier_id, supplier_name, damaged_record_id, parent_request_id,
                 product_id, product_name, size_id, container_size, damaged_qty, returned_qty, requested_qty,
                 received_qty, rejected_qty, reason, request_date, expected_delivery_date,
                 supplier_confirmed, supplier_confirmed_at, supplier_confirmation_note, status,
                 staff_responsible, created_role, notes, updated_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $ins->bind_param(
                'sssssssssssdiiisssissssssss',
                $reqId, $reqRef, $poId, $poNumber, $supplierId, $supplierName, $damagedRecordId, $parentRequestId,
                $productId, $productName, $sizeId, $containerSize, $damagedQty, $returnedQty, $requestedQty,
                $reason, $requestDate, $expectedDeliveryDate, $supplierConfirmed, $confirmedAt, $supplierConfirmationNote,
                $status, $actorName, $role, $notes, $actorName, $now
            );
            $ins->execute();
            $ins->close();

            srRecalcPOStatus($conn, $poId);

            srWriteAudit(
                $conn,
                $actor,
                'REPLACEMENT_REQUEST_CREATE',
                'Purchase Order',
                "Created Supplier Replacement Request {$reqRef} linked to {$poNumber} ({$supplierName}): {$requestedQty} × {$containerSize}L of {$productName}" . ($parentRequestId ? " [Follow-up replacement]" : '') . ($expectedDeliveryDate ? " · Expected: {$expectedDeliveryDate}" : '') . ". No new PO or payable created.",
                $productId,
                $reqRef,
                'Replacement Request Created',
                null,
                "{$status} · {$requestedQty} unit(s)",
                $reqRef,
                $reason . ($notes !== '' ? " — {$notes}" : '')
            );

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(400, $e->getMessage());
        }

        echo json_encode(['success' => true, 'requestId' => $reqId, 'requestRef' => $reqRef] + sr_load_all($conn));
        exit;
    }

    // =========================================================================
    // 9. POST ?action=update_replacement_status
    //    Updates status (7 statuses), supplier confirmation, expected delivery date,
    //    supplier credit/refund (when supplier refuses replacement), or cancellation.
    // =========================================================================
    if ($method === 'POST' && $action === 'update_replacement_status') {
        $requestId = trim((string)($body['requestId'] ?? ''));
        $newStatus = trim((string)($body['status'] ?? ''));
        $supplierConfirmed = isset($body['supplierConfirmed']) ? (!empty($body['supplierConfirmed']) ? 1 : 0) : null;
        $expectedDeliveryDate = array_key_exists('expectedDeliveryDate', $body)
            ? (!empty($body['expectedDeliveryDate']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$body['expectedDeliveryDate']) ? (string)$body['expectedDeliveryDate'] : null)
            : '__KEEP__';
        $supplierConfirmationNote = array_key_exists('supplierConfirmationNote', $body) ? trim((string)$body['supplierConfirmationNote']) : null;
        $recordCredit = !empty($body['recordCredit']);
        $creditType = trim((string)($body['creditType'] ?? 'Supplier Credit'));
        $creditAmount = isset($body['creditAmount']) && $body['creditAmount'] !== '' && $body['creditAmount'] !== null
            ? round((float)$body['creditAmount'], 2) : null;
        $creditNotes = trim((string)($body['creditNotes'] ?? ''));
        $notes = array_key_exists('notes', $body) ? trim((string)$body['notes']) : null;

        if ($requestId === '') sr_fail(400, 'Replacement Request ID is required.');
        if ($newStatus !== '' && !in_array($newStatus, SR_REPLACEMENT_STATUSES, true)) {
            sr_fail(400, 'Invalid replacement request status.');
        }

        $now = date('Y-m-d H:i:s');
        $conn->begin_transaction();
        try {
            $st = $conn->prepare("SELECT * FROM supplier_replacement_requests WHERE id = ? FOR UPDATE");
            $st->bind_param('s', $requestId);
            $st->execute();
            $req = $st->get_result()->fetch_assoc();
            $st->close();
            if (!$req) throw new Exception('Replacement request not found.');

            $oldStatus = (string)$req['status'];
            if (in_array($oldStatus, SR_REPLACEMENT_RESOLVED_STATUSES, true)) {
                throw new Exception("Replacement request {$req['request_ref']} is already {$oldStatus} and locked.");
            }

            if ($recordCredit) {
                if (!$isAdmin) {
                    $conn->rollback();
                    sr_fail(403, 'Access denied: Only Administrators may record supplier credits or refunds.');
                }
                if ($creditAmount === null || $creditAmount <= 0) {
                    throw new Exception('Enter a valid credit or refund amount greater than 0.');
                }
                $finalStatus = 'Completed';
                $creditIssued = 1;
                $up = $conn->prepare("UPDATE supplier_replacement_requests
                    SET status = ?, credit_issued = ?, credit_type = ?, credit_amount = ?, credit_notes = ?, updated_by = ?, updated_at = ?
                    WHERE id = ?");
                $up->bind_param('sisdssss', $finalStatus, $creditIssued, $creditType, $creditAmount, $creditNotes, $actorName, $now, $requestId);
                $up->execute();
                $up->close();

                srRecalcPOStatus($conn, (string)$req['po_id']);

                srWriteAudit(
                    $conn,
                    $actor,
                    'REPLACEMENT_CREDIT_RECORDED',
                    'Purchase Order',
                    "Recorded {$creditType} of PHP " . number_format($creditAmount, 2) . " for Replacement Request {$req['request_ref']} (PO: {$req['po_number']}, Supplier: {$req['supplier_name']}) — supplier declined replacement. Original PO cost preserved.",
                    (string)$req['product_id'],
                    (string)$req['request_ref'],
                    'Supplier Credit / Refund',
                    $oldStatus,
                    "Completed ({$creditType}: PHP " . number_format($creditAmount, 2) . ")",
                    (string)$req['request_ref'],
                    $creditNotes !== '' ? $creditNotes : (string)$req['reason']
                );
            } else {
                $finalStatus = $newStatus !== '' ? $newStatus : $oldStatus;
                if (in_array($finalStatus, ['Cancelled', 'Supplier Declined'], true) && !$isAdmin) {
                    $conn->rollback();
                    sr_fail(403, "Access denied: Only Administrators may set replacement status to '{$finalStatus}'.");
                }
                if ($finalStatus === 'Confirmed by Supplier – Awaiting Delivery' && (int)$req['supplier_confirmed'] !== 1) {
                    throw new Exception('Use Confirm Supplier Replacement to confirm the request and issue a Confirmation Receipt.');
                }
                if ($finalStatus === 'Completed' && (int)$req['received_qty'] < (int)$req['requested_qty']) {
                    throw new Exception('Cannot mark Completed while replacement units remain undelivered. Receive replacement delivery or record a supplier credit/refund.');
                }
                $finalConfirmed = $supplierConfirmed !== null ? $supplierConfirmed : (int)$req['supplier_confirmed'];
                if (in_array($finalStatus, ['Replacement Approved', 'Awaiting Replacement Delivery'], true)) {
                    $finalConfirmed = 1;
                }
                $confirmedAt = ($finalConfirmed === 1 && empty($req['supplier_confirmed_at'])) ? $now : $req['supplier_confirmed_at'];
                $finalExp = ($expectedDeliveryDate === '__KEEP__') ? $req['expected_delivery_date'] : $expectedDeliveryDate;
                $finalConfNote = $supplierConfirmationNote !== null ? $supplierConfirmationNote : ($req['supplier_confirmation_note'] ?? '');
                $finalNotes = $notes !== null ? $notes : ($req['notes'] ?? '');

                $up = $conn->prepare("UPDATE supplier_replacement_requests
                    SET status = ?, supplier_confirmed = ?, supplier_confirmed_at = ?, expected_delivery_date = ?,
                        supplier_confirmation_note = ?, notes = ?, updated_by = ?, updated_at = ?
                    WHERE id = ?");
                $up->bind_param('sisssssss', $finalStatus, $finalConfirmed, $confirmedAt, $finalExp, $finalConfNote, $finalNotes, $actorName, $now, $requestId);
                $up->execute();
                $up->close();

                srRecalcPOStatus($conn, (string)$req['po_id']);

                $actCode = ($finalStatus === 'Cancelled') ? 'REPLACEMENT_REQUEST_CANCEL' : 'REPLACEMENT_REQUEST_STATUS';
                srWriteAudit(
                    $conn,
                    $actor,
                    $actCode,
                    'Purchase Order',
                    "Updated Replacement Request {$req['request_ref']} (PO: {$req['po_number']}): Status \"{$oldStatus}\" → \"{$finalStatus}\"" . ($finalConfirmed ? ' · Supplier Confirmed' : '') . ($finalExp ? " · Expected: {$finalExp}" : ''),
                    (string)$req['product_id'],
                    (string)$req['request_ref'],
                    'Replacement Request Status',
                    $oldStatus,
                    $finalStatus,
                    (string)$req['request_ref'],
                    $finalConfNote !== '' ? $finalConfNote : ($finalNotes !== '' ? $finalNotes : (string)$req['reason'])
                );
            }

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(400, $e->getMessage());
        }

        echo json_encode(['success' => true] + sr_load_all($conn));
        exit;
    }

    // =========================================================================
    // 10. POST ?action=receive_replacement_delivery
    //     Physical receiving & inspection for a Supplier Replacement Request.
    //     - Validates idempotencyKey to prevent duplicate receiving confirmations.
    //     - Validates deliveredQty = acceptedQty + damagedQty.
    //     - Adds ONLY acceptedQty to sellable inventory + FIFO batch + expiry.
    //     - If damagedQty > 0, creates a new damaged_stock_record so staff can
    //       open a follow-up replacement request linked via parentRequestId.
    //     - Recalculates original PO status (never Fully Received while unresolved).
    // =========================================================================
    if ($method === 'POST' && $action === 'receive_replacement_delivery') {
        $requestId = trim((string)($body['requestId'] ?? ''));
        $deliveredQty = max(0, (int)($body['deliveredQty'] ?? 0));
        $acceptedQty = max(0, (int)($body['acceptedQty'] ?? 0));
        $damagedQty = max(0, (int)($body['damagedQty'] ?? 0));
        $damageReason = trim((string)($body['damageReason'] ?? ''));
        $inspectionNotes = trim((string)($body['inspectionNotes'] ?? ''));
        $expDate = !empty($body['expirationDate']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$body['expirationDate'])
            ? (string)$body['expirationDate'] : null;
        $idempotencyKey = !empty($body['idempotencyKey']) ? substr(trim((string)$body['idempotencyKey']), 0, 80) : null;

        if ($requestId === '' || $deliveredQty <= 0) {
            sr_fail(400, 'Replacement Request ID and Actual Delivered Quantity (> 0) are required.');
        }
        if ($acceptedQty > $deliveredQty || $damagedQty > $deliveredQty || $deliveredQty !== ($acceptedQty + $damagedQty)) {
            sr_fail(400, "Validation failed: Actual Delivered ({$deliveredQty}) must equal Accepted ({$acceptedQty}) + Damaged ({$damagedQty}).");
        }
        if ($damagedQty > 0 && ($damageReason === '' || !in_array($damageReason, SR_DAMAGE_REASONS, true))) {
            sr_fail(400, 'A valid Damage Reason is required when replacement items arrive damaged.');
        }

        $now = date('Y-m-d H:i:s');
        $datePart = date('Ymd');
        $todayDate = date('Y-m-d');
        $newDamagedRecordId = null;
        $autoFollowUpId = null;
        $autoFollowUpRef = null;
        $batchNumber = null;

        $conn->begin_transaction();
        try {
            // Duplicate receiving confirmation guard (idempotencyKey)
            if ($idempotencyKey) {
                $idChk = $conn->prepare("SELECT id FROM supplier_replacement_deliveries WHERE idempotency_key = ? LIMIT 1");
                $idChk->bind_param('s', $idempotencyKey);
                $idChk->execute();
                $dup = $idChk->get_result()->fetch_assoc();
                $idChk->close();
                if ($dup) {
                    throw new Exception('Duplicate replacement receiving confirmation blocked: this delivery was already posted.');
                }
            }

            $st = $conn->prepare("SELECT * FROM supplier_replacement_requests WHERE id = ? FOR UPDATE");
            $st->bind_param('s', $requestId);
            $st->execute();
            $req = $st->get_result()->fetch_assoc();
            $st->close();
            if (!$req) throw new Exception('Replacement request not found.');
            if (in_array($req['status'], SR_REPLACEMENT_RESOLVED_STATUSES, true)) {
                throw new Exception("Replacement request {$req['request_ref']} is already {$req['status']}.");
            }
            if ((int)$req['supplier_confirmed'] !== 1) {
                throw new Exception("Replacement request {$req['request_ref']} must be confirmed by the supplier before receiving a replacement delivery.");
            }

            $remaining = max(0, (int)$req['requested_qty'] - (int)$req['received_qty']);
            if ($deliveredQty > $remaining) {
                throw new Exception("Actual Delivered ({$deliveredQty}) cannot exceed remaining replacement quantity ({$remaining}).");
            }

            $reqRef = (string)$req['request_ref'];
            $poId = (string)$req['po_id'];
            $poNumber = (string)$req['po_number'];
            $supplierId = $req['supplier_id'];
            $supplierName = (string)$req['supplier_name'];
            $productId = (string)$req['product_id'];
            $containerSize = (float)$req['container_size'];

            $psRow = srResolveProductSize($conn, $productId, $req['size_id'], $containerSize);
            if (!$psRow) throw new Exception("Product size not found for {$req['product_name']}.");
            $sizeId = (string)$psRow['size_id'];
            $productName = (string)$psRow['product_name'];

            $batchId = null;
            $movementId = null;

            // 1. Add ONLY accepted replacement units to sellable inventory & FIFO batch
            if ($acceptedQty > 0) {
                $invSt = $conn->prepare("SELECT sealed_quantity FROM inventory WHERE size_id = ? FOR UPDATE");
                $invSt->bind_param('s', $sizeId);
                $invSt->execute();
                $invRow = $invSt->get_result()->fetch_assoc();
                $invSt->close();

                $beforeCans = $invRow ? (int)$invRow['sealed_quantity'] : 0;
                $afterCans = $beforeCans + $acceptedQty;
                if ($invRow) {
                    $upInv = $conn->prepare("UPDATE inventory SET sealed_quantity = ? WHERE size_id = ?");
                    $upInv->bind_param('is', $afterCans, $sizeId);
                    $upInv->execute();
                    $upInv->close();
                } else {
                    $newInvId = srUid('inv');
                    $insInv = $conn->prepare("INSERT INTO inventory (inventory_id, size_id, sealed_quantity, opened_quantity, remaining_volume) VALUES (?, ?, ?, 0, 0)");
                    $insInv->bind_param('ssi', $newInvId, $sizeId, $afterCans);
                    $insInv->execute();
                    $insInv->close();
                }

                srSyncProductTotalsFromInventory($conn, $productId);
                $addedLiters = round($acceptedQty * $containerSize, 2);
                $batchNumber = 'REP-' . $datePart . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
                $mvNote = "Replacement Delivery (Inspected): {$reqRef} (PO: {$poNumber}, {$supplierName}) [Delivered {$deliveredQty}, Accepted {$acceptedQty} × {$containerSize}L (+{$addedLiters}L)" . ($damagedQty > 0 ? ", Damaged/Rejected {$damagedQty}" : '') . " · {$containerSize}L Units: {$beforeCans}→{$afterCans}, Batch: {$batchNumber}]" . ($inspectionNotes !== '' ? " — {$inspectionNotes}" : '');
                $movementId = srInsertMovement($conn, 'receiving', $productId, $sizeId, $containerSize, $productName, $addedLiters, $mvNote, $actorName, $now);

                $batchId = batchCreate($conn, [
                    'size_id' => $sizeId,
                    'product_id' => $productId,
                    'qty' => $acceptedQty,
                    'batch_number' => $batchNumber,
                    'expiration_date' => $expDate,
                    'supplier_id' => $supplierId,
                    'supplier_name' => $supplierName,
                    'po_id' => $poId,
                    'po_number' => $poNumber,
                    'date_received' => $now,
                    'source' => 'receiving',
                    'notes' => "Replacement {$reqRef} for {$poNumber}" . ($inspectionNotes !== '' ? " — {$inspectionNotes}" : ''),
                    'staff' => $actorName,
                ]);
                batchLog($conn, $batchId, $movementId, 'received', $acceptedQty, $acceptedQty, $reqRef, substr($mvNote, 0, 400), $actorName, $now);
            }

            // 2. If replacement items arrived damaged again: NEVER add to sellable stock; record damaged stock for follow-up replacement
            if ($damagedQty > 0) {
                $dmgMvNote = "Damaged Replacement Rejected: {$reqRef} (PO: {$poNumber}, {$supplierName}) [Delivered: {$deliveredQty}, Accepted: {$acceptedQty}, Damaged/Rejected: {$damagedQty} × {$containerSize}L — Excluded from sellable stock] · Reason: {$damageReason}" . ($inspectionNotes !== '' ? " — {$inspectionNotes}" : '');
                $dmgMid = srInsertMovement($conn, 'damaged', $productId, $sizeId, $containerSize, "{$productName} [Damaged Replacement]", 0.0, $dmgMvNote, $actorName, $now);
                if (!$movementId) $movementId = $dmgMid;

                $newDamagedRecordId = srUid('dmg');
                $src = 'receiving';
                $sd = 0;
                $rq = $damagedQty;
                $insD = $conn->prepare("INSERT INTO damaged_stock_records
                    (id, po_id, po_number, supplier_id, supplier_name, product_id, product_name, size_id, container_size,
                     batch_id, batch_number, source, delivered_qty, accepted_qty, damaged_qty, returned_qty, reason,
                     inspection_notes, stock_deducted, movement_id, recorded_by, recorded_role, recorded_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $insD->bind_param(
                    'ssssssssdsssiiiississss',
                    $newDamagedRecordId, $poId, $poNumber, $supplierId, $supplierName, $productId, $productName, $sizeId, $containerSize,
                    $batchId, $batchNumber, $src, $deliveredQty, $acceptedQty, $damagedQty, $rq, $damageReason,
                    $inspectionNotes, $sd, $dmgMid, $actorName, $role, $now
                );
                $insD->execute();
                $insD->close();

                // Automatically generate a linked follow-up Replacement Request for damaged replacement items
                $autoFollowUpId = srUid('rep');
                $autoFollowUpRef = srGenerateReplacementRef($conn);
                $fuStatus = 'Awaiting Supplier Confirmation';
                $fuNotes = $inspectionNotes !== '' ? $inspectionNotes : "Auto-generated follow-up replacement request: replacement delivery ({$reqRef}) arrived damaged.";
                $insFu = $conn->prepare("INSERT INTO supplier_replacement_requests
                    (id, request_ref, po_id, po_number, supplier_id, supplier_name, damaged_record_id, receiving_tx_key, parent_request_id,
                     product_id, product_name, size_id, container_size, damaged_qty, returned_qty, requested_qty,
                     received_qty, rejected_qty, reason, request_date, expected_delivery_date,
                     supplier_confirmed, supplier_confirmed_at, supplier_confirmation_note, status,
                     staff_responsible, created_role, notes, updated_by, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, NULL, 0, NULL, '', ?, ?, ?, ?, ?, ?)");
                $insFu->bind_param(
                    'ssssssssssssdiiissssssss',
                    $autoFollowUpId, $autoFollowUpRef, $poId, $poNumber, $supplierId, $supplierName, $newDamagedRecordId, $idempotencyKey, $requestId,
                    $productId, $productName, $sizeId, $containerSize, $damagedQty, $damagedQty, $damagedQty,
                    $damageReason, $todayDate, $fuStatus, $actorName, $role, $fuNotes, $actorName, $now
                );
                $insFu->execute();
                $insFu->close();

                srWriteAudit(
                    $conn,
                    $actor,
                    'REPLACEMENT_REQUEST_CREATE',
                    'Purchase Order',
                    "Auto-generated follow-up Replacement Request {$autoFollowUpRef} (parent: {$reqRef}, PO: {$poNumber}) for {$damagedQty} damaged replacement unit(s) of {$productName}. Status: {$fuStatus}.",
                    $productId,
                    $autoFollowUpRef,
                    'Follow-Up Replacement Request Auto-Generated',
                    null,
                    "{$fuStatus} · {$damagedQty} unit(s)",
                    $autoFollowUpRef,
                    $damageReason . ($inspectionNotes !== '' ? " — {$inspectionNotes}" : '')
                );
            }

            // 3. Log replacement delivery record
            $delId = srUid('rdel');
            $insDel = $conn->prepare("INSERT INTO supplier_replacement_deliveries
                (id, request_id, idempotency_key, delivered_qty, accepted_qty, damaged_qty, damage_reason,
                 inspection_notes, batch_id, batch_number, expiration_date, movement_id, inspected_by, received_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $insDel->bind_param(
                'sssiiissssssss',
                $delId, $requestId, $idempotencyKey, $deliveredQty, $acceptedQty, $damagedQty, $damageReason,
                $inspectionNotes, $batchId, $batchNumber, $expDate, $movementId, $actorName, $now
            );
            $insDel->execute();
            $insDel->close();

            // 4. Update replacement request totals & status
            // If damaged replacement units were split off into a linked follow-up request (REP-002),
            // reduce this parent request's requested_qty by damagedQty so pending units are never double-counted
            // and the original PO can properly complete once the follow-up request is fulfilled.
            $newRcvd = (int)$req['received_qty'] + $acceptedQty;
            $newRej = (int)$req['rejected_qty'] + $damagedQty;
            $effectiveRequested = ($damagedQty > 0)
                ? max($newRcvd, (int)$req['requested_qty'] - $damagedQty)
                : (int)$req['requested_qty'];
            $oldStatus = (string)$req['status'];
            if ($newRcvd >= $effectiveRequested) {
                $newStatus = 'Completed';
            } elseif ($newRcvd > 0) {
                $newStatus = 'Partially Received';
            } else {
                $newStatus = 'Confirmed by Supplier – Awaiting Delivery';
            }

            $upReq = $conn->prepare("UPDATE supplier_replacement_requests
                SET requested_qty = ?, received_qty = ?, rejected_qty = ?, status = ?, updated_by = ?, updated_at = ?
                WHERE id = ?");
            $upReq->bind_param('iiissss', $effectiveRequested, $newRcvd, $newRej, $newStatus, $actorName, $now, $requestId);
            $upReq->execute();
            $upReq->close();

            // 3b. Generate separate immutable Replacement Delivery Receipt (SRDV-YYYYMMDD-XXXX)
            $delReceiptId = srUid('srcpt');
            $delReceiptNo = srGenerateReplacementReceiptNo($conn, 'delivery');
            $supInfoDel = srLoadSupplierInfo($conn, $supplierId, $supplierName);
            $delSnapshot = [
                'businessName' => 'MRGR COLOR CENTER',
                'businessSubtitle' => 'Paint & Hardware Supply · Sales & Inventory',
                'businessAddress' => 'Blk 13 Blk 167 North Fairview Commonwealth Avenue Greater Lagro 1159 Quezon City NCR, Second District Philippines',
                'businessContact' => '09776344591',
                'receiptTitle' => 'SUPPLIER REPLACEMENT RECEIVING RECEIPT',
                'receiptNumber' => $delReceiptNo,
                'receiptType' => 'delivery',
                'requestRef' => $reqRef,
                'poNumber' => $poNumber,
                'issuedAt' => $now,
                'inspectedBy' => $actorName,
                'supplier' => $supInfoDel,
                'item' => [
                    'productId' => $productId,
                    'productName' => $productName,
                    'containerSize' => $containerSize,
                    'deliveredQty' => $deliveredQty,
                    'acceptedQty' => $acceptedQty,
                    'damagedQty' => $damagedQty,
                    'batchNumber' => $batchNumber ?: '',
                    'expirationDate' => $expDate ?: '',
                ],
                'damageReason' => $damageReason,
                'inspectionNotes' => $inspectionNotes,
                'status' => $newStatus,
            ];
            $delSnapJson = json_encode($delSnapshot);
            $delType = 'delivery';
            $insDelRcpt = $conn->prepare("INSERT INTO supplier_replacement_receipts
                (id, receipt_number, receipt_type, request_id, request_ref, delivery_id, po_id, po_number,
                 supplier_id, supplier_name, snapshot_json, confirmed_by, issued_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $insDelRcpt->bind_param(
                'sssssssssssss',
                $delReceiptId, $delReceiptNo, $delType, $requestId, $reqRef, $delId, $poId, $poNumber,
                $supplierId, $supplierName, $delSnapJson, $actorName, $now
            );
            $insDelRcpt->execute();
            $insDelRcpt->close();

            // 5. Recalculate original PO status (stays Partial while any replacement request is unresolved!)
            srRecalcPOStatus($conn, $poId);

            srWriteAudit(
                $conn,
                $actor,
                'REPLACEMENT_DELIVERY_RECEIVE',
                'Purchase Order',
                "Inspected replacement delivery for {$reqRef} (PO: {$poNumber}, {$supplierName}): Delivered {$deliveredQty}, Accepted {$acceptedQty} × {$containerSize}L (added to stock" . ($batchNumber ? ", Batch {$batchNumber}" : '') . "), Damaged/Rejected {$damagedQty}. Status: {$oldStatus} → {$newStatus}.",
                $productId,
                $reqRef,
                'Replacement Delivery Inspected',
                "{$oldStatus} ({$req['received_qty']}/{$req['requested_qty']})",
                "{$newStatus} ({$newRcvd}/{$effectiveRequested})",
                $reqRef,
                $damagedQty > 0 ? $damageReason : ($inspectionNotes !== '' ? $inspectionNotes : "Replacement Delivery for {$reqRef}")
            );

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(400, $e->getMessage());
        }

        echo json_encode([
            'success' => true,
            'newDamagedRecordId' => $newDamagedRecordId,
            'autoFollowUpId' => $autoFollowUpId,
            'autoFollowUpRef' => $autoFollowUpRef,
            'batchNumber' => $batchNumber,
            'deliveryReceiptNumber' => $delReceiptNo,
            'newStatus' => $newStatus,
        ] + sr_load_all($conn));
        exit;
    }

    // =========================================================================
    // 11. POST ?action=confirm_supplier_replacement
    //     Saves Supplier Confirmation and auto-generates an immutable POS-style
    //     SUPPLIER REPLACEMENT CONFIRMATION RECEIPT (SRCP-YYYYMMDD-XXXX).
    //     Transitions status to 'Confirmed by Supplier – Awaiting Delivery'.
    //     NEVER creates a sales transaction, deducts/adds stock, creates a PO,
    //     or generates additional supplier payables.
    // =========================================================================
    if ($method === 'POST' && $action === 'confirm_supplier_replacement') {
        $isMultipart = (strpos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') !== false);
        $src = $isMultipart ? $_POST : $body;

        $requestId = trim((string)($src['requestId'] ?? ''));
        $remarks = trim((string)($src['remarks'] ?? ''));

        if ($requestId === '') sr_fail(400, 'Replacement Request ID is required.');

        $now = date('Y-m-d H:i:s');
        $todayDate = date('Y-m-d');
        $generatedReceipt = null;

        $conn->begin_transaction();
        try {
            $st = $conn->prepare("SELECT * FROM supplier_replacement_requests WHERE id = ? FOR UPDATE");
            $st->bind_param('s', $requestId);
            $st->execute();
            $req = $st->get_result()->fetch_assoc();
            $st->close();
            if (!$req) throw new Exception('Replacement request not found.');

            $oldStatus = (string)$req['status'];
            if (in_array($oldStatus, SR_REPLACEMENT_RESOLVED_STATUSES, true)) {
                throw new Exception("Replacement request {$req['request_ref']} is already {$oldStatus} and locked.");
            }
            if ((int)$req['supplier_confirmed'] === 1) {
                throw new Exception("Supplier confirmation for {$req['request_ref']} was already recorded.");
            }

            // Duplicate receipt safeguard
            $chkR = $conn->prepare("SELECT receipt_number FROM supplier_replacement_receipts WHERE request_id = ? AND receipt_type = 'confirmation' LIMIT 1");
            $chkR->bind_param('s', $requestId);
            $chkR->execute();
            $existingRcpt = $chkR->get_result()->fetch_assoc();
            $chkR->close();
            if ($existingRcpt) {
                throw new Exception("Confirmation receipt {$existingRcpt['receipt_number']} was already generated for {$req['request_ref']}.");
            }

            $receiptId = srUid('srcpt');
            $receiptNo = srGenerateReplacementReceiptNo($conn, 'confirmation');
            $finalStatus = 'Confirmed by Supplier – Awaiting Delivery';
            $supInfo = srLoadSupplierInfo($conn, $req['supplier_id'], (string)$req['supplier_name']);

            $snapshot = [
                'businessName' => 'MRGR COLOR CENTER',
                'businessSubtitle' => 'Paint & Hardware Supply · Sales & Inventory',
                'businessAddress' => 'Blk 13 Blk 167 North Fairview Commonwealth Avenue Greater Lagro 1159 Quezon City NCR, Second District Philippines',
                'businessContact' => '09776344591',
                'receiptTitle' => 'SUPPLIER REPLACEMENT CONFIRMATION RECEIPT',
                'receiptNumber' => $receiptNo,
                'receiptType' => 'confirmation',
                'requestRef' => (string)$req['request_ref'],
                'poNumber' => (string)$req['po_number'],
                'issuedAt' => $now,
                'confirmedBy' => $actorName,
                'supplier' => $supInfo,
                'items' => [[
                    'productId' => (string)$req['product_id'],
                    'productName' => (string)$req['product_name'],
                    'containerSize' => (float)$req['container_size'],
                    'damagedQty' => (int)$req['damaged_qty'],
                    'replacementQty' => (int)$req['requested_qty'],
                ]],
                'totalReplacementQty' => (int)$req['requested_qty'],
                'damageReason' => (string)$req['reason'],
                'remarks' => $remarks,
                'status' => 'CONFIRMED BY SUPPLIER – AWAITING DELIVERY',
            ];
            $snapJson = json_encode($snapshot);
            $rcptType = 'confirmation';
            $emptyDelId = '';

            $insRcpt = $conn->prepare("INSERT INTO supplier_replacement_receipts
                (id, receipt_number, receipt_type, request_id, request_ref, delivery_id, po_id, po_number,
                 supplier_id, supplier_name, snapshot_json, confirmed_by, issued_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $insRcpt->bind_param(
                'sssssssssssss',
                $receiptId, $receiptNo, $rcptType, $requestId, $req['request_ref'], $emptyDelId,
                $req['po_id'], $req['po_number'], $req['supplier_id'], $req['supplier_name'],
                $snapJson, $actorName, $now
            );
            $insRcpt->execute();
            $insRcpt->close();

            $up = $conn->prepare("UPDATE supplier_replacement_requests
                SET status = ?, supplier_confirmed = 1, supplier_confirmed_at = ?, confirmation_ref = ?,
                    confirmation_date = ?, confirmed_by = ?, supplier_confirmation_note = ?,
                    updated_by = ?, updated_at = ?
                WHERE id = ?");
            $up->bind_param(
                'sssssssss',
                $finalStatus, $now, $receiptNo, $todayDate, $actorName, $remarks, $actorName, $now, $requestId
            );
            $up->execute();
            $up->close();

            srRecalcPOStatus($conn, (string)$req['po_id']);

            srWriteAudit(
                $conn,
                $actor,
                'REPLACEMENT_SUPPLIER_CONFIRM',
                'Purchase Order',
                "Confirmed supplier replacement agreement for {$req['request_ref']} (PO: {$req['po_number']}, Supplier: {$req['supplier_name']}) and generated Confirmation Receipt {$receiptNo}. Status: {$oldStatus} → {$finalStatus}.",
                (string)$req['product_id'],
                (string)$req['request_ref'],
                'Supplier Confirmation & Receipt',
                $oldStatus,
                "{$finalStatus} · Receipt {$receiptNo}",
                $receiptNo,
                $remarks !== '' ? $remarks : (string)$req['reason']
            );

            $generatedReceipt = [
                'id' => $receiptId,
                'receiptNumber' => $receiptNo,
                'receiptType' => 'confirmation',
                'requestId' => $requestId,
                'requestRef' => (string)$req['request_ref'],
                'poNumber' => (string)$req['po_number'],
                'confirmedBy' => $actorName,
                'issuedAt' => $now,
                'reprintCount' => 0,
                'snapshot' => $snapshot,
            ];

            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(400, $e->getMessage());
        }

        echo json_encode(['success' => true, 'receipt' => $generatedReceipt] + sr_load_all($conn));
        exit;
    }

    // =========================================================================
    // 12. POST ?action=log_receipt_reprint
    //     Increments reprint counter and logs audit trail WITHOUT generating a new receipt number.
    // =========================================================================
    if ($method === 'POST' && $action === 'log_receipt_reprint') {
        $receiptId = trim((string)($body['receiptId'] ?? ''));
        if ($receiptId === '') sr_fail(400, 'Receipt ID is required.');
        $now = date('Y-m-d H:i:s');
        $conn->begin_transaction();
        try {
            $st = $conn->prepare("SELECT * FROM supplier_replacement_receipts WHERE id = ? LIMIT 1 FOR UPDATE");
            $st->bind_param('s', $receiptId);
            $st->execute();
            $rc = $st->get_result()->fetch_assoc();
            $st->close();
            if (!$rc) {
                $conn->rollback();
                sr_fail(404, 'Supplier replacement receipt not found.');
            }

            $newCount = (int)$rc['reprint_count'] + 1;
            $up = $conn->prepare("UPDATE supplier_replacement_receipts SET reprint_count = ?, last_reprinted_at = ? WHERE id = ?");
            $up->bind_param('iss', $newCount, $now, $receiptId);
            $up->execute();
            $up->close();

            srWriteAudit(
                $conn,
                $actor,
                'REPLACEMENT_RECEIPT_REPRINT',
                'Purchase Order',
                "Reprinted Supplier Replacement Receipt {$rc['receipt_number']} (Request: {$rc['request_ref']}, PO: {$rc['po_number']}, Reprint #{$newCount}).",
                null,
                (string)$rc['receipt_number'],
                'Receipt Reprint',
                "Reprint #" . ($newCount - 1),
                "Reprint #{$newCount}",
                (string)$rc['receipt_number'],
                "Reprinted by {$actorName}"
            );
            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            sr_fail(500, 'Failed to log receipt reprint: ' . $e->getMessage());
        }

        echo json_encode(['success' => true, 'reprintCount' => $newCount, 'receiptNumber' => $rc['receipt_number']] + sr_load_all($conn));
        exit;
    }

    sr_fail(400, 'Unsupported action.');
} catch (Throwable $e) {
    sr_fail(500, 'Server error: ' . $e->getMessage());
}
