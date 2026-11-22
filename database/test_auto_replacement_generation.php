<?php
/**
 * End-to-End Verification Suite: Automatic Supplier Replacement Request Generation
 * Tests normal deliveries, partial deliveries, fully damaged deliveries, multiple damaged products,
 * duplicate confirmation prevention, partial replacements, and damaged replacement deliveries.
 */
date_default_timezone_set('Asia/Manila');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../api/batch_lib.php';
require_once __DIR__ . '/../api/supplier_returns_lib.php';

$BASE_URL = 'http://127.0.0.1:8768';
$conn = getDBConnection();
batchEnsureSchema($conn);
supplierReturnsEnsureSchema($conn);

$passed = 0; $failed = 0;
function assertTrue($cond, $msg) {
    global $passed, $failed;
    if ($cond) { echo "  [PASS] {$msg}\n"; $passed++; }
    else { echo "  [FAIL] {$msg}\n"; $failed++; }
}

function httpJson(string $method, string $url, ?array $payload, string $cookieFile): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_COOKIEJAR => $cookieFile,
        CURLOPT_COOKIEFILE => $cookieFile,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 15,
    ]);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'json' => json_decode($body ?: '{}', true), 'raw' => $body];
}

function getSealed(mysqli $conn, string $sizeId): int {
    $r = $conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'")->fetch_assoc();
    return $r ? (int)$r['sealed_quantity'] : 0;
}
function getBatchSum(mysqli $conn, string $sizeId): int {
    $r = $conn->query("SELECT COALESCE(SUM(remaining_qty), 0) AS s FROM inventory_batches WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'")->fetch_assoc();
    return $r ? (int)$r['s'] : 0;
}
function getPORow(mysqli $conn, string $poId): array {
    return $conn->query("SELECT status, receiving_stage, total_amount, items_json FROM purchase_orders WHERE id = '" . $conn->real_escape_string($poId) . "'")->fetch_assoc() ?: [];
}

$testTag = 'AUTOREPT_' . strtoupper(bin2hex(random_bytes(3)));
$staffCookie = sys_get_temp_dir() . "/autoret_stf_{$testTag}.txt";
$testStaffId = 'u_astf_' . strtolower($testTag);
$testPass = 'TestPass123!';
$testHash = password_hash($testPass, PASSWORD_BCRYPT);
$nowSql = date('Y-m-d H:i:s');
$startTime = $nowSql;

$conn->query("INSERT INTO users (id, username, password, name, role, status, created_at) VALUES
    ('{$testStaffId}', 'auto_stf_{$testTag}', '{$testHash}', 'Test Staff {$testTag}', 'staff', 'active', '{$nowSql}')");

// Pick two distinct active product/sizes for multi-product testing
$prodsRes = $conn->query("SELECT ps.size_id, ps.product_id, ps.container_size,
        COALESCE(NULLIF(p.name, ''), p.product_name) AS product_name,
        p.stock, p.can_stock, COALESCE(inv.sealed_quantity, 0) AS sealed_quantity
    FROM product_sizes ps
    JOIN products p ON p.id = ps.product_id
    LEFT JOIN inventory inv ON inv.size_id = ps.size_id
    WHERE p.status = 'active'
    ORDER BY inv.sealed_quantity DESC LIMIT 2");
$prods = [];
while ($r = $prodsRes->fetch_assoc()) $prods[] = $r;
$p1 = $prods[0];
$p2 = $prods[1] ?? $prods[0];

// Snapshot original state for exact restoration
$snapshots = [];
foreach ($prods as $pr) {
    $sid = (string)$pr['size_id'];
    $pid = (string)$pr['product_id'];
    $batches = [];
    $br = $conn->query("SELECT batch_id, remaining_qty FROM inventory_batches WHERE size_id = '" . $conn->real_escape_string($sid) . "'");
    while ($b = $br->fetch_assoc()) $batches[$b['batch_id']] = (int)$b['remaining_qty'];
    $snapshots[$sid] = [
        'productId' => $pid,
        'origSealed' => (int)$pr['sealed_quantity'],
        'origStock' => (float)$pr['stock'],
        'origCanStock' => $pr['can_stock'],
        'batches' => $batches,
    ];
}

$createdPoIds = [];
$createdDmgIds = [];
$createdReqIds = [];
$createdReturnIds = [];

function makePO(mysqli $conn, string $tag, int $idx, array $lineItems, float $totalCost, array &$createdPoIds): array {
    $poId = 'po_' . strtolower($tag) . '_' . $idx;
    $poNum = "PO-{$tag}-{$idx}";
    $supId = 'sup_' . strtolower($tag);
    $supName = "Supplier {$tag}";
    $now = date('Y-m-d H:i:s');
    $itemsJson = json_encode($lineItems);
    $st = $conn->prepare("INSERT INTO purchase_orders (id, po_number, supplier_id, supplier_name, order_date, status, total_amount, items_json, notes, created_by)
        VALUES (?, ?, ?, ?, ?, 'partial', ?, ?, 'Auto-replacement test PO', ?)");
    $staff = "Test Staff {$tag}";
    $st->bind_param('sssssdss', $poId, $poNum, $supId, $supName, $now, $totalCost, $itemsJson, $staff);
    $st->execute();
    $st->close();
    $createdPoIds[] = $poId;
    return ['id' => $poId, 'poNumber' => $poNum, 'supplierId' => $supId, 'supplierName' => $supName];
}

try {
    $login = httpJson('POST', "{$BASE_URL}/api/auth.php?action=login", ['username' => "auto_stf_{$testTag}", 'password' => $testPass], $staffCookie);
    assertTrue($login['code'] === 200 && !empty($login['json']['success']), "Authenticated Inventory Staff");

    echo "\n--- 1. Partial/Damaged Delivery (10 ordered, 5 accepted, 5 damaged) -> Auto-Generates Replacement Request ---\n";
    $po1 = makePO($conn, $testTag, 1, [[
        'productId' => $p1['product_id'], 'productName' => $p1['product_name'], 'sizeId' => $p1['size_id'],
        'size' => (float)$p1['container_size'], 'qty' => 10, 'receivedQty' => 5, 'acceptedQty' => 5, 'deliveredQty' => 10, 'damagedQty' => 5
    ]], 4500.00, $createdPoIds);

    $base1 = getSealed($conn, $p1['size_id']);
    $conn->query("UPDATE inventory SET sealed_quantity = " . ($base1 + 5) . " WHERE size_id = '{$p1['size_id']}'");
    srSyncProductTotalsFromInventory($conn, $p1['product_id']);
    batchCreate($conn, ['size_id' => $p1['size_id'], 'product_id' => $p1['product_id'], 'qty' => 5, 'batch_number' => "LOT-{$testTag}-1", 'po_id' => $po1['id'], 'po_number' => $po1['poNumber'], 'date_received' => $nowSql, 'source' => 'receiving', 'staff' => "Test Staff {$testTag}"]);

    $poCountBefore = (int)$conn->query("SELECT COUNT(*) AS c FROM purchase_orders")->fetch_assoc()['c'];
    $txKey1 = "rcvtx_{$testTag}_1";
    $r1 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $po1['id'], 'poNumber' => $po1['poNumber'], 'supplierId' => $po1['supplierId'], 'supplierName' => $po1['supplierName'],
        'receivingTxKey' => $txKey1,
        'items' => [[
            'productId' => $p1['product_id'], 'productName' => $p1['product_name'], 'sizeId' => $p1['size_id'], 'containerSize' => (float)$p1['container_size'],
            'deliveredQty' => 10, 'acceptedQty' => 5, 'damagedQty' => 5, 'reason' => 'Leaking Paint', 'handling' => 'returned_to_driver', 'inspectionNotes' => '5 cans leaking at dock'
        ]]
    ], $staffCookie);
    assertTrue($r1['code'] === 200 && count($r1['json']['autoReplacementRefs'] ?? []) === 1, "Auto-generated 1 Replacement Request (" . (($r1['json']['autoReplacementRefs'][0] ?? '')) . ") without manual creation");
    $repId1 = $r1['json']['autoReplacementIds'][0] ?? '';
    $createdReqIds[] = $repId1;
    foreach (($r1['json']['createdIds'] ?? []) as $id) $createdDmgIds[] = $id;
    if (!empty($r1['json']['autoReturnId'])) $createdReturnIds[] = $r1['json']['autoReturnId'];

    $reqObj1 = null;
    foreach (($r1['json']['replacementRequests'] ?? []) as $rr) { if ($rr['id'] === $repId1) $reqObj1 = $rr; }
    assertTrue($reqObj1 !== null && $reqObj1['status'] === 'Awaiting Supplier Confirmation' && $reqObj1['requestedQty'] === 5 && $reqObj1['damagedQty'] === 5 && $reqObj1['returnedQty'] === 5, "Initial status is 'Awaiting Supplier Confirmation' with all details auto-populated");
    assertTrue((int)$conn->query("SELECT COUNT(*) AS c FROM purchase_orders")->fetch_assoc()['c'] === $poCountBefore, "No duplicate Purchase Order created");
    $po1After = getPORow($conn, $po1['id']);
    assertTrue($po1After['status'] === 'partial' && $po1After['receiving_stage'] === 'awaiting_replacement' && (float)$po1After['total_amount'] === 4500.00, "Original PO stays 'partial' with persistent receiving_stage='awaiting_replacement' (removed from active Stock Receiving queue)");

    // Simulate page refresh via GET api/db.php and verify receivingStage persists from MariaDB
    $dbRefresh = httpJson('GET', "{$BASE_URL}/api/db.php", null, $staffCookie);
    $po1FromApi = null;
    $poListApi = $dbRefresh['json']['purchaseOrders'] ?? ($dbRefresh['json']['db']['purchaseOrders'] ?? ($dbRefresh['json']['data']['purchaseOrders'] ?? []));
    foreach ($poListApi as $poItem) {
        if (($poItem['id'] ?? '') === $po1['id']) $po1FromApi = $poItem;
    }
    assertTrue($po1FromApi !== null && ($po1FromApi['receivingStage'] ?? '') === 'awaiting_replacement', "Page refresh (GET api/db.php) returns persistent receivingStage='awaiting_replacement' (HTTP {$dbRefresh['code']}, keys: " . implode(',', array_keys($dbRefresh['json'] ?? [])) . ")");

    echo "\n--- 2. Duplicate Confirmation Prevention (Replay Same receivingTxKey) ---\n";
    $dup1 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $po1['id'], 'poNumber' => $po1['poNumber'], 'supplierId' => $po1['supplierId'], 'supplierName' => $po1['supplierName'],
        'receivingTxKey' => $txKey1,
        'items' => [[
            'productId' => $p1['product_id'], 'productName' => $p1['product_name'], 'sizeId' => $p1['size_id'], 'containerSize' => (float)$p1['container_size'],
            'deliveredQty' => 10, 'acceptedQty' => 5, 'damagedQty' => 5, 'reason' => 'Leaking Paint', 'handling' => 'returned_to_driver'
        ]]
    ], $staffCookie);
    assertTrue($dup1['code'] === 400, "Duplicate receiving confirmation blocked (zero duplicate replacement requests)");

    echo "\n--- 3. Fully Damaged Delivery (10 ordered, 0 accepted, 10 damaged) ---\n";
    $po2 = makePO($conn, $testTag, 2, [[
        'productId' => $p1['product_id'], 'productName' => $p1['product_name'], 'sizeId' => $p1['size_id'],
        'size' => (float)$p1['container_size'], 'qty' => 10, 'receivedQty' => 0, 'acceptedQty' => 0, 'deliveredQty' => 10, 'damagedQty' => 10
    ]], 4500.00, $createdPoIds);
    $sealedBefore2 = getSealed($conn, $p1['size_id']);
    $r2 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $po2['id'], 'poNumber' => $po2['poNumber'], 'supplierId' => $po2['supplierId'], 'supplierName' => $po2['supplierName'],
        'receivingTxKey' => "rcvtx_{$testTag}_2",
        'items' => [[
            'productId' => $p1['product_id'], 'productName' => $p1['product_name'], 'sizeId' => $p1['size_id'], 'containerSize' => (float)$p1['container_size'],
            'deliveredQty' => 10, 'acceptedQty' => 0, 'damagedQty' => 10, 'reason' => 'Expired Product', 'handling' => 'returned_to_driver'
        ]]
    ], $staffCookie);
    assertTrue($r2['code'] === 200 && count($r2['json']['autoReplacementRefs'] ?? []) === 1, "Fully damaged delivery auto-generated Replacement Request for 10 units");
    assertTrue(getSealed($conn, $p1['size_id']) === $sealedBefore2, "0 units added to sellable inventory for fully damaged delivery");
    foreach (($r2['json']['autoReplacementIds'] ?? []) as $id) $createdReqIds[] = $id;
    foreach (($r2['json']['createdIds'] ?? []) as $id) $createdDmgIds[] = $id;
    if (!empty($r2['json']['autoReturnId'])) $createdReturnIds[] = $r2['json']['autoReturnId'];

    echo "\n--- 4. Multiple Damaged Products in One PO ---\n";
    $po3 = makePO($conn, $testTag, 3, [
        ['productId' => $p1['product_id'], 'productName' => $p1['product_name'], 'sizeId' => $p1['size_id'], 'size' => (float)$p1['container_size'], 'qty' => 8, 'receivedQty' => 6, 'acceptedQty' => 6, 'deliveredQty' => 8, 'damagedQty' => 2],
        ['productId' => $p2['product_id'], 'productName' => $p2['product_name'], 'sizeId' => $p2['size_id'], 'size' => (float)$p2['container_size'], 'qty' => 6, 'receivedQty' => 3, 'acceptedQty' => 3, 'deliveredQty' => 6, 'damagedQty' => 3],
    ], 7000.00, $createdPoIds);
    $r3 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $po3['id'], 'poNumber' => $po3['poNumber'], 'supplierId' => $po3['supplierId'], 'supplierName' => $po3['supplierName'],
        'receivingTxKey' => "rcvtx_{$testTag}_3",
        'items' => [
            ['productId' => $p1['product_id'], 'productName' => $p1['product_name'], 'sizeId' => $p1['size_id'], 'containerSize' => (float)$p1['container_size'], 'deliveredQty' => 8, 'acceptedQty' => 6, 'damagedQty' => 2, 'reason' => 'Leaking Paint', 'handling' => 'returned_to_driver'],
            ['productId' => $p2['product_id'], 'productName' => $p2['product_name'], 'sizeId' => $p2['size_id'], 'containerSize' => (float)$p2['container_size'], 'deliveredQty' => 6, 'acceptedQty' => 3, 'damagedQty' => 3, 'reason' => 'Broken / Damaged Container', 'handling' => 'returned_to_driver'],
        ]
    ], $staffCookie);
    assertTrue($r3['code'] === 200 && count($r3['json']['autoReplacementRefs'] ?? []) === 2, "Auto-generated 2 product-level Replacement Requests for multi-product damaged PO");
    foreach (($r3['json']['autoReplacementIds'] ?? []) as $id) $createdReqIds[] = $id;
    foreach (($r3['json']['createdIds'] ?? []) as $id) $createdDmgIds[] = $id;
    if (!empty($r3['json']['autoReturnId'])) $createdReturnIds[] = $r3['json']['autoReturnId'];

    echo "\n--- 5. Approve & Partial Replacement Delivery + Damaged Replacement Auto Follow-Up ---\n";
    // Approve PO1's auto-generated replacement request (5 units)
    $app1 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=update_replacement_status", [
        'requestId' => $repId1, 'status' => 'Replacement Approved', 'supplierConfirmed' => true, 'expectedDeliveryDate' => date('Y-m-d', strtotime('+3 days'))
    ], $staffCookie);
    assertTrue($app1['code'] === 200, "Updated auto-generated request to 'Replacement Approved'");

    // Partial replacement delivery: 3 delivered -> 3 accepted, 0 damaged
    $sealedBeforeRep = getSealed($conn, $p1['size_id']);
    $repDel1 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=receive_replacement_delivery", [
        'requestId' => $repId1, 'deliveredQty' => 3, 'acceptedQty' => 3, 'damagedQty' => 0,
        'expirationDate' => date('Y-m-d', strtotime('+300 days')), 'idempotencyKey' => "rdel_{$testTag}_1"
    ], $staffCookie);
    assertTrue($repDel1['code'] === 200 && $repDel1['json']['newStatus'] === 'Partially Received', "Partial replacement (3/5) -> 'Partially Received'");
    assertTrue(getSealed($conn, $p1['size_id']) === $sealedBeforeRep + 3, "Only +3 accepted replacement units added to sellable inventory");
    assertTrue(getPORow($conn, $po1['id'])['status'] === 'partial', "PO remains 'partial' while 2 replacement units remain");

    // Second replacement delivery: 2 delivered -> 1 accepted, 1 damaged again -> auto follow-up replacement request!
    $repDel2 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=receive_replacement_delivery", [
        'requestId' => $repId1, 'deliveredQty' => 2, 'acceptedQty' => 1, 'damagedQty' => 1,
        'damageReason' => 'Contaminated Paint', 'inspectionNotes' => '1 replacement can contaminated',
        'idempotencyKey' => "rdel_{$testTag}_2"
    ], $staffCookie);
    assertTrue($repDel2['code'] === 200 && !empty($repDel2['json']['autoFollowUpRef']), "Damaged replacement automatically generated follow-up Replacement Request (" . ($repDel2['json']['autoFollowUpRef'] ?? '') . ")");
    assertTrue(getSealed($conn, $p1['size_id']) === $sealedBeforeRep + 4, "Only +1 accepted unit added to inventory (1 damaged excluded)");
    assertTrue(getPORow($conn, $po1['id'])['status'] === 'partial', "PO stays 'partial' while auto-generated follow-up replacement is unresolved");
    if (!empty($repDel2['json']['autoFollowUpId'])) $createdReqIds[] = $repDel2['json']['autoFollowUpId'];
    if (!empty($repDel2['json']['newDamagedRecordId'])) $createdDmgIds[] = $repDel2['json']['newDamagedRecordId'];

    // Verify FIFO invariant and audit logs
    assertTrue(getBatchSum($conn, $p1['size_id']) === getSealed($conn, $p1['size_id']), "FIFO batch sum == inventory.sealed_quantity invariant verified");
    $audCnt = (int)$conn->query("SELECT COUNT(*) AS c FROM audit_logs WHERE created_at >= '{$startTime}' AND action = 'REPLACEMENT_REQUEST_CREATE'")->fetch_assoc()['c'];
    assertTrue($audCnt >= 5, "Audit log recorded all auto-generated replacement requests ({$audCnt} entries)");

} finally {
    foreach ($createdReqIds as $rqId) {
        if ($rqId) {
            $conn->query("DELETE FROM supplier_replacement_deliveries WHERE request_id = '" . $conn->real_escape_string($rqId) . "'");
            $conn->query("DELETE FROM supplier_replacement_requests WHERE id = '" . $conn->real_escape_string($rqId) . "'");
        }
    }
    foreach ($createdReturnIds as $rid) {
        if ($rid) {
            $conn->query("DELETE FROM supplier_return_items WHERE return_id = '" . $conn->real_escape_string($rid) . "'");
            $conn->query("DELETE FROM supplier_returns WHERE id = '" . $conn->real_escape_string($rid) . "'");
        }
    }
    foreach ($createdDmgIds as $did) {
        if ($did) $conn->query("DELETE FROM damaged_stock_records WHERE id = '" . $conn->real_escape_string($did) . "'");
    }
    foreach ($createdPoIds as $pid) {
        if ($pid) $conn->query("DELETE FROM purchase_orders WHERE id = '" . $conn->real_escape_string($pid) . "'");
    }
    $conn->query("DELETE FROM batch_movements WHERE created_at >= '{$startTime}' AND staff_name LIKE '%{$testTag}%'");
    $conn->query("DELETE FROM inventory_batches WHERE created_by LIKE '%{$testTag}%' OR po_number LIKE 'PO-{$testTag}-%'");
    foreach ($snapshots as $sid => $snap) {
        foreach ($snap['batches'] as $bid => $rem) {
            $conn->query("UPDATE inventory_batches SET remaining_qty = {$rem} WHERE batch_id = '" . $conn->real_escape_string($bid) . "'");
        }
        $conn->query("UPDATE inventory SET sealed_quantity = {$snap['origSealed']} WHERE size_id = '" . $conn->real_escape_string($sid) . "'");
        $csEsc = $snap['origCanStock'] !== null ? ("'" . $conn->real_escape_string($snap['origCanStock']) . "'") : "NULL";
        $conn->query("UPDATE products SET stock = {$snap['origStock']}, can_stock = {$csEsc} WHERE id = '" . $conn->real_escape_string($snap['productId']) . "'");
    }
    $conn->query("DELETE FROM movements WHERE date >= '{$startTime}' AND staff_name LIKE '%{$testTag}%'");
    $conn->query("DELETE FROM audit_logs WHERE created_at >= '{$startTime}' AND user_name LIKE '%{$testTag}%'");
    $conn->query("DELETE FROM users WHERE id = '{$testStaffId}'");
    @unlink($staffCookie);
}

echo "\n====================================================\n";
echo "SUMMARY: {$passed} PASSED, {$failed} FAILED\n";
echo "====================================================\n";
exit($failed > 0 ? 1 : 0);
