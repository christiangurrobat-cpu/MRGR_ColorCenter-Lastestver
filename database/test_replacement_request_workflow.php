<?php
/**
 * End-to-End Verification Suite: Supplier Return & Replacement Request Workflow
 * Tests all 7 required scenarios against live MariaDB & standalone PHP, then restores exact pre-test DB state.
 */
date_default_timezone_set('Asia/Manila');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../api/batch_lib.php';
require_once __DIR__ . '/../api/supplier_returns_lib.php';

$BASE_URL = 'http://127.0.0.1:8767';
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
    return $conn->query("SELECT status, total_amount, items_json FROM purchase_orders WHERE id = '" . $conn->real_escape_string($poId) . "'")->fetch_assoc() ?: [];
}

$testTag = 'REPTEST_' . strtoupper(bin2hex(random_bytes(3)));
$adminCookie = sys_get_temp_dir() . "/rep_adm_{$testTag}.txt";
$staffCookie = sys_get_temp_dir() . "/rep_stf_{$testTag}.txt";
$testAdminId = 'u_radm_' . strtolower($testTag);
$testStaffId = 'u_rstf_' . strtolower($testTag);
$testPass = 'TestPass123!';
$testHash = password_hash($testPass, PASSWORD_BCRYPT);
$nowSql = date('Y-m-d H:i:s');
$startTime = $nowSql;

$conn->query("INSERT INTO users (id, username, password, name, role, status, created_at) VALUES
    ('{$testAdminId}', 'rep_adm_{$testTag}', '{$testHash}', 'Test Admin {$testTag}', 'admin', 'active', '{$nowSql}'),
    ('{$testStaffId}', 'rep_stf_{$testTag}', '{$testHash}', 'Test Staff {$testTag}', 'staff', 'active', '{$nowSql}')");

$prodRow = $conn->query("SELECT ps.size_id, ps.product_id, ps.container_size,
        COALESCE(NULLIF(p.name, ''), p.product_name) AS product_name,
        p.stock, p.can_stock, COALESCE(inv.sealed_quantity, 0) AS sealed_quantity
    FROM product_sizes ps
    JOIN products p ON p.id = ps.product_id
    LEFT JOIN inventory inv ON inv.size_id = ps.size_id
    WHERE p.status = 'active'
    ORDER BY inv.sealed_quantity DESC LIMIT 1")->fetch_assoc();

$sizeId = (string)$prodRow['size_id'];
$productId = (string)$prodRow['product_id'];
$containerSize = (float)$prodRow['container_size'];
$productName = (string)$prodRow['product_name'];
$origSealed = (int)$prodRow['sealed_quantity'];
$origStock = (float)$prodRow['stock'];
$origCanStock = $prodRow['can_stock'];

$origBatches = [];
$bRes = $conn->query("SELECT batch_id, remaining_qty FROM inventory_batches WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'");
while ($b = $bRes->fetch_assoc()) $origBatches[$b['batch_id']] = (int)$b['remaining_qty'];

$createdPoIds = [];
$createdDmgIds = [];
$createdReqIds = [];
$createdReturnIds = [];

function createTestPO(mysqli $conn, string $tag, int $idx, string $productId, string $productName, string $sizeId, float $containerSize, int $ordered, int $accepted, float $totalCost, array &$createdPoIds): array {
    $poId = 'po_' . strtolower($tag) . '_' . $idx;
    $poNum = "PO-{$tag}-{$idx}";
    $supId = 'sup_' . strtolower($tag);
    $supName = "Test Supplier {$tag}";
    $now = date('Y-m-d H:i:s');
    $items = [[
        'productId' => $productId,
        'productName' => $productName,
        'sizeId' => $sizeId,
        'size' => $containerSize,
        'qty' => $ordered,
        'receivedQty' => $accepted,
        'acceptedQty' => $accepted,
        'deliveredQty' => $ordered,
        'damagedQty' => $ordered - $accepted,
    ]];
    $itemsJson = json_encode($items);
    $st = $conn->prepare("INSERT INTO purchase_orders (id, po_number, supplier_id, supplier_name, order_date, status, total_amount, items_json, notes, created_by)
        VALUES (?, ?, ?, ?, ?, 'partial', ?, ?, 'Test PO', ?)");
    $staff = "Test Staff {$tag}";
    $st->bind_param('sssssdss', $poId, $poNum, $supId, $supName, $now, $totalCost, $itemsJson, $staff);
    $st->execute();
    $st->close();
    $createdPoIds[] = $poId;
    return ['id' => $poId, 'poNumber' => $poNum, 'supplierId' => $supId, 'supplierName' => $supName, 'totalAmount' => $totalCost];
}

try {
    $admLogin = httpJson('POST', "{$BASE_URL}/api/auth.php?action=login", ['username' => "rep_adm_{$testTag}", 'password' => $testPass], $adminCookie);
    $stfLogin = httpJson('POST', "{$BASE_URL}/api/auth.php?action=login", ['username' => "rep_stf_{$testTag}", 'password' => $testPass], $staffCookie);
    assertTrue($admLogin['code'] === 200 && $stfLogin['code'] === 200, "Authenticated Admin & Inventory Staff");

    // -------------------------------------------------------------------------
    echo "\n--- Scenario 1 & 2: 10 ordered, 5 accepted, 5 damaged, 5 replacement requested -> Full replacement delivery ---\n";
    $po1 = createTestPO($conn, $testTag, 1, $productId, $productName, $sizeId, $containerSize, 10, 5, 5000.00, $createdPoIds);
    // Simulate initial 5 accepted added to inventory + batch
    $baseSealed = getSealed($conn, $sizeId);
    $conn->query("UPDATE inventory SET sealed_quantity = " . ($baseSealed + 5) . " WHERE size_id = '{$sizeId}'");
    srSyncProductTotalsFromInventory($conn, $productId);
    batchCreate($conn, ['size_id' => $sizeId, 'product_id' => $productId, 'qty' => 5, 'batch_number' => "LOT-{$testTag}-1", 'po_id' => $po1['id'], 'po_number' => $po1['poNumber'], 'date_received' => $nowSql, 'source' => 'receiving', 'staff' => "Test Staff {$testTag}"]);

    // Record 5 damaged returned directly to delivery personnel
    $dmg1 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $po1['id'], 'poNumber' => $po1['poNumber'], 'supplierId' => $po1['supplierId'], 'supplierName' => $po1['supplierName'],
        'items' => [[
            'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
            'deliveredQty' => 10, 'acceptedQty' => 5, 'damagedQty' => 5, 'reason' => 'Leaking Paint', 'handling' => 'returned_to_driver', 'inspectionNotes' => '5 cans leaking'
        ]]
    ], $staffCookie);
    $dmgId1 = $dmg1['json']['createdIds'][0] ?? '';
    $createdDmgIds[] = $dmgId1;
    if (!empty($dmg1['json']['autoReturnId'])) $createdReturnIds[] = $dmg1['json']['autoReturnId'];
    assertTrue($dmg1['code'] === 200 && getSealed($conn, $sizeId) === $baseSealed + 5, "Only 5 accepted added to sellable inventory; 5 damaged excluded");

    // Create Replacement Request for 5 units linked to original PO
    $poCountBefore = (int)$conn->query("SELECT COUNT(*) AS c FROM purchase_orders")->fetch_assoc()['c'];
    $req1 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=create_replacement_request", [
        'damagedRecordId' => $dmgId1, 'requestedQty' => 5, 'expectedDeliveryDate' => date('Y-m-d', strtotime('+5 days')),
        'supplierConfirmed' => true, 'notes' => 'Supplier confirmed 5 replacement cans'
    ], $staffCookie);
    $reqId1 = $req1['json']['requestId'] ?? '';
    $createdReqIds[] = $reqId1;
    $poCountAfter = (int)$conn->query("SELECT COUNT(*) AS c FROM purchase_orders")->fetch_assoc()['c'];
    $po1Row = getPORow($conn, $po1['id']);
    assertTrue($req1['code'] === 200 && !empty($req1['json']['requestRef']), "Created Replacement Request (" . ($req1['json']['requestRef'] ?? '') . ") linked to original PO");
    assertTrue($poCountAfter === $poCountBefore && (float)$po1Row['total_amount'] === 5000.00, "No new PO created & original PO cost (5000.00) preserved");
    assertTrue($po1Row['status'] === 'partial', "PO remains 'partial' while replacement request is unresolved");

    // Full replacement delivery (5 delivered, 5 accepted, 0 damaged) + Scenario 7 Duplicate Receiving Prevention
    $idemKey1 = "idem_{$testTag}_full";
    $del1 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=receive_replacement_delivery", [
        'requestId' => $reqId1, 'deliveredQty' => 5, 'acceptedQty' => 5, 'damagedQty' => 0,
        'expirationDate' => date('Y-m-d', strtotime('+365 days')), 'inspectionNotes' => 'All 5 replacement cans intact',
        'idempotencyKey' => $idemKey1
    ], $staffCookie);
    $po1After = getPORow($conn, $po1['id']);
    assertTrue($del1['code'] === 200 && $del1['json']['newStatus'] === 'Completed', "Full replacement delivery completed request");
    assertTrue(getSealed($conn, $sizeId) === $baseSealed + 10, "Sellable inventory increased by +5 (total +10 accepted)");
    assertTrue(getBatchSum($conn, $sizeId) === getSealed($conn, $sizeId), "FIFO batch sum matches sealed inventory after replacement");
    assertTrue($po1After['status'] === 'received' && (float)$po1After['total_amount'] === 5000.00, "PO marked Fully Received ('received') once replacement completed, preserving original cost");

    // Scenario 7: Duplicate receiving prevention (replay same idempotencyKey)
    $dup1 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=receive_replacement_delivery", [
        'requestId' => $reqId1, 'deliveredQty' => 5, 'acceptedQty' => 5, 'damagedQty' => 0, 'idempotencyKey' => $idemKey1
    ], $staffCookie);
    assertTrue($dup1['code'] === 400 && getSealed($conn, $sizeId) === $baseSealed + 10, "Scenario 7: Duplicate replacement receiving blocked (no double stock add)");

    // -------------------------------------------------------------------------
    echo "\n--- Scenario 3: Partial replacement delivery (3 of 5, then 2 of 5) ---\n";
    $po2 = createTestPO($conn, $testTag, 2, $productId, $productName, $sizeId, $containerSize, 10, 5, 5000.00, $createdPoIds);
    $dmg2 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $po2['id'], 'poNumber' => $po2['poNumber'], 'supplierId' => $po2['supplierId'], 'supplierName' => $po2['supplierName'],
        'items' => [[
            'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
            'deliveredQty' => 10, 'acceptedQty' => 5, 'damagedQty' => 5, 'reason' => 'Broken / Damaged Container', 'handling' => 'returned_to_driver'
        ]]
    ], $staffCookie);
    $dmgId2 = $dmg2['json']['createdIds'][0] ?? '';
    $createdDmgIds[] = $dmgId2;
    if (!empty($dmg2['json']['autoReturnId'])) $createdReturnIds[] = $dmg2['json']['autoReturnId'];

    $req2 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=create_replacement_request", ['damagedRecordId' => $dmgId2, 'requestedQty' => 5], $staffCookie);
    $reqId2 = $req2['json']['requestId'] ?? '';
    $createdReqIds[] = $reqId2;

    $sealedBefore3 = getSealed($conn, $sizeId);
    $part1 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=receive_replacement_delivery", [
        'requestId' => $reqId2, 'deliveredQty' => 3, 'acceptedQty' => 3, 'damagedQty' => 0, 'idempotencyKey' => "idem_{$testTag}_p1"
    ], $staffCookie);
    assertTrue($part1['code'] === 200 && $part1['json']['newStatus'] === 'Partially Received', "Partial replacement (3/5) sets status to 'Partially Received'");
    assertTrue(getPORow($conn, $po2['id'])['status'] === 'partial', "PO remains 'partial' while 2 replacement units remain pending");
    assertTrue(getSealed($conn, $sizeId) === $sealedBefore3 + 3, "Inventory increased by +3");

    $part2 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=receive_replacement_delivery", [
        'requestId' => $reqId2, 'deliveredQty' => 2, 'acceptedQty' => 2, 'damagedQty' => 0, 'idempotencyKey' => "idem_{$testTag}_p2"
    ], $staffCookie);
    assertTrue($part2['code'] === 200 && $part2['json']['newStatus'] === 'Completed', "Remaining 2/5 received -> Replacement Request 'Completed'");
    assertTrue(getPORow($conn, $po2['id'])['status'] === 'received', "PO transitions to 'received' after final partial replacement");

    // -------------------------------------------------------------------------
    echo "\n--- Scenario 4: Damaged replacement delivery -> Follow-up linked replacement request ---\n";
    $po3 = createTestPO($conn, $testTag, 3, $productId, $productName, $sizeId, $containerSize, 10, 5, 5000.00, $createdPoIds);
    $dmg3 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $po3['id'], 'poNumber' => $po3['poNumber'], 'supplierId' => $po3['supplierId'], 'supplierName' => $po3['supplierName'],
        'items' => [[
            'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
            'deliveredQty' => 10, 'acceptedQty' => 5, 'damagedQty' => 5, 'reason' => 'Leaking Paint', 'handling' => 'returned_to_driver'
        ]]
    ], $staffCookie);
    $dmgId3 = $dmg3['json']['createdIds'][0] ?? '';
    $createdDmgIds[] = $dmgId3;
    if (!empty($dmg3['json']['autoReturnId'])) $createdReturnIds[] = $dmg3['json']['autoReturnId'];

    $req3 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=create_replacement_request", ['damagedRecordId' => $dmgId3, 'requestedQty' => 5], $staffCookie);
    $reqId3 = $req3['json']['requestId'] ?? '';
    $createdReqIds[] = $reqId3;

    $sealedBefore4 = getSealed($conn, $sizeId);
    $dmgRepDel = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=receive_replacement_delivery", [
        'requestId' => $reqId3, 'deliveredQty' => 5, 'acceptedQty' => 3, 'damagedQty' => 2,
        'damageReason' => 'Broken / Damaged Container', 'inspectionNotes' => '2 replacement cans arrived dented',
        'idempotencyKey' => "idem_{$testTag}_dmgrep"
    ], $staffCookie);
    $newDmgId = $dmgRepDel['json']['newDamagedRecordId'] ?? '';
    $createdDmgIds[] = $newDmgId;
    assertTrue($dmgRepDel['code'] === 200 && !empty($newDmgId), "Damaged replacement delivery recorded new damaged record");
    assertTrue(getSealed($conn, $sizeId) === $sealedBefore4 + 3, "Only 3 accepted replacement units added to inventory (2 damaged excluded)");
    assertTrue(getPORow($conn, $po3['id'])['status'] === 'partial', "PO stays 'partial' while 2 damaged replacement units remain unresolved");

    // Create follow-up linked replacement request for the 2 damaged replacement cans
    $followUp = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=create_replacement_request", [
        'damagedRecordId' => $newDmgId, 'parentRequestId' => $reqId3, 'requestedQty' => 2
    ], $staffCookie);
    $followUpId = $followUp['json']['requestId'] ?? '';
    $createdReqIds[] = $followUpId;
    assertTrue($followUp['code'] === 200 && !empty($followUpId), "Created follow-up replacement request linked to parent request & original PO");

    // -------------------------------------------------------------------------
    echo "\n--- Scenario 5: Supplier refuses replacement & issues credit ---\n";
    $credResp = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=update_replacement_status", [
        'requestId' => $followUpId, 'recordCredit' => true, 'creditType' => 'Supplier Credit',
        'creditAmount' => 1000.00, 'creditNotes' => 'Supplier out of stock — issued credit memo CM-2026'
    ], $adminCookie);
    assertTrue($credResp['code'] === 200 && !empty($credResp['json']['success']), "Admin recorded Supplier Credit when supplier refused replacement");
    assertTrue((float)getPORow($conn, $po3['id'])['total_amount'] === 5000.00, "Original PO cost preserved after Supplier Credit");

    // -------------------------------------------------------------------------
    echo "\n--- Scenario 6: Cancelled replacement request ---\n";
    $cancelResp = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=update_replacement_status", [
        'requestId' => $reqId3, 'status' => 'Cancelled', 'notes' => 'Resolved via follow-up credit'
    ], $adminCookie);
    assertTrue($cancelResp['code'] === 200 && !empty($cancelResp['json']['success']), "Replacement request cancelled cleanly");
    $reEdit = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=update_replacement_status", [
        'requestId' => $reqId3, 'status' => 'Replacement Approved'
    ], $adminCookie);
    assertTrue($reEdit['code'] === 400, "Cancelled replacement request is locked against modification");

    // Audit trail verification
    $audCnt = (int)$conn->query("SELECT COUNT(*) AS c FROM audit_logs WHERE created_at >= '{$startTime}' AND action IN ('REPLACEMENT_REQUEST_CREATE','REPLACEMENT_REQUEST_STATUS','REPLACEMENT_REQUEST_CANCEL','REPLACEMENT_DELIVERY_RECEIVE','REPLACEMENT_CREDIT_RECORDED')")->fetch_assoc()['c'];
    assertTrue($audCnt >= 9, "Complete replacement audit trail logged ({$audCnt} audit entries)");
    assertTrue(getBatchSum($conn, $sizeId) === getSealed($conn, $sizeId), "Final FIFO batch sum == inventory.sealed_quantity invariant verified");

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
    foreach ($origBatches as $bid => $rem) {
        $conn->query("UPDATE inventory_batches SET remaining_qty = {$rem} WHERE batch_id = '" . $conn->real_escape_string($bid) . "'");
    }
    $conn->query("UPDATE inventory SET sealed_quantity = {$origSealed} WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'");
    $csEsc = $origCanStock !== null ? ("'" . $conn->real_escape_string($origCanStock) . "'") : "NULL";
    $conn->query("UPDATE products SET stock = {$origStock}, can_stock = {$csEsc} WHERE id = '" . $conn->real_escape_string($productId) . "'");
    $conn->query("DELETE FROM movements WHERE date >= '{$startTime}' AND staff_name LIKE '%{$testTag}%'");
    $conn->query("DELETE FROM audit_logs WHERE created_at >= '{$startTime}' AND user_name LIKE '%{$testTag}%'");
    $conn->query("DELETE FROM users WHERE id IN ('{$testAdminId}', '{$testStaffId}')");
    @unlink($adminCookie);
    @unlink($staffCookie);
}

echo "\n====================================================\n";
echo "SUMMARY: {$passed} PASSED, {$failed} FAILED\n";
echo "====================================================\n";
exit($failed > 0 ? 1 : 0);
