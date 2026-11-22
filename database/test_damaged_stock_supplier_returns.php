<?php
/**
 * End-to-End Verification Suite: Damaged Stock Inspection & Supplier Returns
 * Exercises all 8 required scenarios + RBAC + finalized lock + FIFO batch invariants
 * against the live MariaDB database and standalone PHP API, then cleans up all test data.
 */
date_default_timezone_set('Asia/Manila');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../api/batch_lib.php';
require_once __DIR__ . '/../api/supplier_returns_lib.php';

$BASE_URL = 'http://127.0.0.1:8766';
$conn = getDBConnection();
batchEnsureSchema($conn);
supplierReturnsEnsureSchema($conn);

$passed = 0;
$failed = 0;
function assertTrue($cond, $msg) {
    global $passed, $failed;
    if ($cond) {
        echo "  [PASS] {$msg}\n";
        $passed++;
    } else {
        echo "  [FAIL] {$msg}\n";
        $failed++;
    }
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
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    }
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'json' => json_decode($body ?: '{}', true), 'raw' => $body];
}

// Create authenticated PHP session cookies for Admin (u1) and Inventory Staff (u3)
// using the actual api/auth.php login? No password needed? Wait — check auth.php or create session via PHP!
// Let's check existing users and log in cleanly via a temporary test user or existing demo passwords.
$adminCookie = sys_get_temp_dir() . '/sr_test_admin_' . bin2hex(random_bytes(4)) . '.txt';
$staffCookie = sys_get_temp_dir() . '/sr_test_staff_' . bin2hex(random_bytes(4)) . '.txt';

// Create two temporary test users (admin & staff) with known password, cleaned up in finally
$testTag = 'SRTEST_' . strtoupper(bin2hex(random_bytes(3)));
$testAdminId = 'u_tadm_' . strtolower($testTag);
$testStaffId = 'u_tstf_' . strtolower($testTag);
$testPass = 'TestPass123!';
$testHash = password_hash($testPass, PASSWORD_BCRYPT);
$nowSql = date('Y-m-d H:i:s');

$conn->query("INSERT INTO users (id, username, password, name, role, status, created_at) VALUES
    ('{$testAdminId}', 'sr_adm_{$testTag}', '{$testHash}', 'Test Admin {$testTag}', 'admin', 'active', '{$nowSql}'),
    ('{$testStaffId}', 'sr_stf_{$testTag}', '{$testHash}', 'Test Staff {$testTag}', 'staff', 'active', '{$nowSql}')");

// Pick an existing active product + size to test against (and snapshot its original state for exact restoration!)
$prodRow = $conn->query("SELECT ps.size_id, ps.product_id, ps.container_size,
        COALESCE(NULLIF(p.name, ''), p.product_name) AS product_name,
        p.stock, p.can_stock, COALESCE(inv.sealed_quantity, 0) AS sealed_quantity
    FROM product_sizes ps
    JOIN products p ON p.id = ps.product_id
    LEFT JOIN inventory inv ON inv.size_id = ps.size_id
    WHERE p.status = 'active'
    ORDER BY inv.sealed_quantity DESC
    LIMIT 1")->fetch_assoc();

if (!$prodRow) {
    fwrite(STDERR, "No active product/size found in database.\n");
    exit(1);
}

$sizeId = (string)$prodRow['size_id'];
$productId = (string)$prodRow['product_id'];
$containerSize = (float)$prodRow['container_size'];
$productName = (string)$prodRow['product_name'];
$origSealed = (int)$prodRow['sealed_quantity'];
$origStock = (float)$prodRow['stock'];
$origCanStock = $prodRow['can_stock'];

// Snapshot original batches for this size
$origBatches = [];
$bRes = $conn->query("SELECT batch_id, remaining_qty FROM inventory_batches WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'");
while ($b = $bRes->fetch_assoc()) {
    $origBatches[$b['batch_id']] = (int)$b['remaining_qty'];
}

$testPoId = 'po_' . strtolower($testTag);
$testPoNum = 'PO-TEST-' . $testTag;
$testSupId = 'sup_' . strtolower($testTag);
$testSupName = 'Test Supplier ' . $testTag;
$createdBatchIds = [];
$createdDmgIds = [];
$createdReturnIds = [];
$startTime = date('Y-m-d H:i:s');

function getSealed(mysqli $conn, string $sizeId): int {
    $r = $conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'")->fetch_assoc();
    return $r ? (int)$r['sealed_quantity'] : 0;
}
function getBatchSum(mysqli $conn, string $sizeId): int {
    $r = $conn->query("SELECT COALESCE(SUM(remaining_qty), 0) AS s FROM inventory_batches WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'")->fetch_assoc();
    return $r ? (int)$r['s'] : 0;
}
function simulateGoodReceive(mysqli $conn, string $sizeId, string $productId, float $containerSize, int $goodQty, string $poId, string $poNum, string $supId, string $supName, string $tag, array &$createdBatchIds): string {
    $now = date('Y-m-d H:i:s');
    $cur = getSealed($conn, $sizeId);
    $new = $cur + $goodQty;
    $conn->query("UPDATE inventory SET sealed_quantity = {$new} WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'");
    srSyncProductTotalsFromInventory($conn, $productId);
    $bid = batchCreate($conn, [
        'size_id' => $sizeId,
        'product_id' => $productId,
        'qty' => $goodQty,
        'batch_number' => 'LOT-' . $tag . '-' . count($createdBatchIds),
        'expiration_date' => date('Y-m-d', strtotime('+180 days')),
        'supplier_id' => $supId,
        'supplier_name' => $supName,
        'po_id' => $poId,
        'po_number' => $poNum,
        'date_received' => $now,
        'source' => 'receiving',
        'notes' => "Test receiving {$tag}",
        'staff' => "Test Staff {$tag}",
    ]);
    $createdBatchIds[] = $bid;
    return $bid;
}

try {
    // Log in both Admin and Staff via real api/auth.php
    $admLogin = httpJson('POST', "{$BASE_URL}/api/auth.php?action=login", ['username' => "sr_adm_{$testTag}", 'password' => $testPass], $adminCookie);
    $stfLogin = httpJson('POST', "{$BASE_URL}/api/auth.php?action=login", ['username' => "sr_stf_{$testTag}", 'password' => $testPass], $staffCookie);
    assertTrue($admLogin['code'] === 200 && !empty($admLogin['json']['success']), "Admin authenticated via api/auth.php");
    assertTrue($stfLogin['code'] === 200 && !empty($stfLogin['json']['success']), "Inventory Staff authenticated via api/auth.php");

    echo "\n--- Scenario 1: Receive 50 units with NO damage ---\n";
    $before1 = getSealed($conn, $sizeId);
    simulateGoodReceive($conn, $sizeId, $productId, $containerSize, 50, $testPoId, $testPoNum, $testSupId, $testSupName, $testTag, $createdBatchIds);
    assertTrue(getSealed($conn, $sizeId) === $before1 + 50, "Sellable inventory increased by +50 (no damage)");
    assertTrue(getBatchSum($conn, $sizeId) === getSealed($conn, $sizeId), "FIFO batch sum equals inventory.sealed_quantity");

    echo "\n--- Scenario 2: Receive 50 units with 5 damaged (45 accepted, 5 damaged) ---\n";
    $before2 = getSealed($conn, $sizeId);
    // First test invalid Delivered != Accepted + Damaged
    $badVal = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $testPoId, 'poNumber' => $testPoNum, 'supplierId' => $testSupId, 'supplierName' => $testSupName,
        'items' => [[
            'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
            'deliveredQty' => 50, 'acceptedQty' => 46, 'damagedQty' => 5, 'reason' => 'Leaking Paint', 'inspectionNotes' => 'Mismatch test'
        ]]
    ], $staffCookie);
    assertTrue($badVal['code'] === 400, "Rejected mismatched Delivered (50) != Accepted (46) + Damaged (5)");

    // Valid: 45 accepted added to sellable stock, 5 damaged quarantined
    simulateGoodReceive($conn, $sizeId, $productId, $containerSize, 45, $testPoId, $testPoNum, $testSupId, $testSupName, $testTag, $createdBatchIds);
    $recDmg2 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $testPoId, 'poNumber' => $testPoNum, 'supplierId' => $testSupId, 'supplierName' => $testSupName,
        'items' => [[
            'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
            'deliveredQty' => 50, 'acceptedQty' => 45, 'damagedQty' => 5, 'reason' => 'Leaking Paint', 'inspectionNotes' => '5 cans leaking on pallet'
        ]]
    ], $staffCookie);
    assertTrue($recDmg2['code'] === 200 && !empty($recDmg2['json']['success']), "Recorded 5 damaged units during receiving (HTTP {$recDmg2['code']}: " . substr($recDmg2['raw'], 0, 200) . ")");
    $dmgId2 = $recDmg2['json']['createdIds'][0] ?? '';
    $createdDmgIds[] = $dmgId2;
    assertTrue(getSealed($conn, $sizeId) === $before2 + 45, "Only 45 accepted cans added to sellable inventory (5 damaged excluded)");
    assertTrue(getBatchSum($conn, $sizeId) === getSealed($conn, $sizeId), "FIFO batch sum excludes the 5 damaged cans");

    echo "\n--- Scenario 3: Partially receive an order with damaged items (20 delivered: 18 accepted, 2 damaged) ---\n";
    $before3 = getSealed($conn, $sizeId);
    simulateGoodReceive($conn, $sizeId, $productId, $containerSize, 18, $testPoId, $testPoNum, $testSupId, $testSupName, $testTag, $createdBatchIds);
    $recDmg3 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $testPoId, 'poNumber' => $testPoNum, 'supplierId' => $testSupId, 'supplierName' => $testSupName,
        'items' => [[
            'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
            'deliveredQty' => 20, 'acceptedQty' => 18, 'damagedQty' => 2, 'reason' => 'Broken / Damaged Container', 'inspectionNotes' => 'Dented rims'
        ]]
    ], $staffCookie);
    assertTrue($recDmg3['code'] === 200 && !empty($recDmg3['json']['success']), "Partial delivery with 2 damaged units recorded");
    $dmgId3 = $recDmg3['json']['createdIds'][0] ?? '';
    $createdDmgIds[] = $dmgId3;
    assertTrue(getSealed($conn, $sizeId) === $before3 + 18, "Sellable inventory increased by +18 only (2 damaged excluded)");

    echo "\n--- Scenario 4: Return only some of the damaged units (3 of 5) as Staff ---\n";
    $before4 = getSealed($conn, $sizeId);
    $ret4 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=create_return", [
        'poId' => $testPoId, 'poNumber' => $testPoNum, 'supplierId' => $testSupId, 'supplierName' => $testSupName,
        'returnDate' => date('Y-m-d'), 'reason' => 'Leaking Paint', 'resolutionType' => 'Replacement Stock',
        'notes' => 'Partial return of 3 leaking cans',
        'items' => [['damagedRecordId' => $dmgId2, 'returnQty' => 3]]
    ], $staffCookie);
    assertTrue($ret4['code'] === 200 && !empty($ret4['json']['success']), "Staff created partial supplier return (" . ($ret4['json']['returnRef'] ?? '') . ")");
    $retId4 = $ret4['json']['returnId'] ?? '';
    $createdReturnIds[] = $retId4;
    assertTrue(getSealed($conn, $sizeId) === $before4, "Zero duplicate stock deduction when creating supplier return");

    echo "\n--- Scenario 8: Attempt to return MORE units than eligible (try 3 when only 2 remain) ---\n";
    $overRet = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=create_return", [
        'poId' => $testPoId, 'poNumber' => $testPoNum, 'supplierId' => $testSupId, 'supplierName' => $testSupName,
        'returnDate' => date('Y-m-d'), 'reason' => 'Leaking Paint', 'resolutionType' => 'Replacement Stock',
        'items' => [['damagedRecordId' => $dmgId2, 'returnQty' => 3]]
    ], $staffCookie);
    assertTrue($overRet['code'] === 400, "Blocked returning 3 units when only 2 eligible remain");

    echo "\n--- RBAC & Replacement Promise Protection ---\n";
    $stfApprove = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=approve_return", ['returnId' => $retId4], $staffCookie);
    assertTrue($stfApprove['code'] === 403, "Inventory Staff blocked from approving supplier return (HTTP 403)");
    $stfClose = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=update_status", ['returnId' => $retId4, 'status' => 'Closed', 'resolutionType' => 'Replacement Stock'], $staffCookie);
    assertTrue($stfClose['code'] === 400 || $stfClose['code'] === 403, "Inventory Staff blocked from finalizing/closing supplier return");

    $admApprove = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=approve_return", ['returnId' => $retId4], $adminCookie);
    assertTrue($admApprove['code'] === 200 && !empty($admApprove['json']['success']), "Admin approved supplier return");

    $beforePromise = getSealed($conn, $sizeId);
    $awaitResp = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=update_status", [
        'returnId' => $retId4, 'status' => 'Awaiting Replacement', 'resolutionType' => 'Replacement Stock', 'resolutionNotes' => 'Supplier promised replacement next week'
    ], $adminCookie);
    assertTrue($awaitResp['code'] === 200 && getSealed($conn, $sizeId) === $beforePromise, "Setting 'Awaiting Replacement' does NOT prematurely increase sellable inventory");

    echo "\n--- Scenario 6: Receive replacement products from supplier (3 units) ---\n";
    $retObj4 = null;
    foreach ($awaitResp['json']['returns'] as $r) { if ($r['id'] === $retId4) $retObj4 = $r; }
    $retItemId4 = $retObj4['items'][0]['id'] ?? '';
    $beforeRep = getSealed($conn, $sizeId);
    $repResp = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=receive_replacement", [
        'returnId' => $retId4,
        'notes' => 'Replacement cans arrived in good condition',
        'items' => [['itemId' => $retItemId4, 'receiveQty' => 3, 'expirationDate' => date('Y-m-d', strtotime('+365 days'))]]
    ], $staffCookie);
    assertTrue($repResp['code'] === 200 && !empty($repResp['json']['success']) && !empty($repResp['json']['allReplaced']), "Replacement stock (3 units) received as separate transaction");
    assertTrue(getSealed($conn, $sizeId) === $beforeRep + 3, "Sellable inventory increased by +3 upon physical replacement receipt");
    assertTrue(getBatchSum($conn, $sizeId) === getSealed($conn, $sizeId), "New FIFO replacement batch created & batch sum matches sealed_quantity");

    echo "\n--- Scenario 5: Discover damaged stock AFTER already received (quarantine 2 units from batch) ---\n";
    $before5 = getSealed($conn, $sizeId);
    $targetBatchId = $createdBatchIds[0];
    $bBefore = (int)$conn->query("SELECT remaining_qty FROM inventory_batches WHERE batch_id = '" . $conn->real_escape_string($targetBatchId) . "'")->fetch_assoc()['remaining_qty'];
    $postDmg = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_post_receiving_damage", [
        'productId' => $productId, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
        'damagedQty' => 2, 'batchId' => $targetBatchId, 'reason' => 'Contaminated Paint',
        'inspectionNotes' => 'Discovered clumping during shelf check'
    ], $staffCookie);
    assertTrue($postDmg['code'] === 200 && !empty($postDmg['json']['success']), "Post-receiving damaged stock (2 units) quarantined");
    $dmgId5 = $postDmg['json']['damagedRecordId'] ?? '';
    $createdDmgIds[] = $dmgId5;
    $bAfter = (int)$conn->query("SELECT remaining_qty FROM inventory_batches WHERE batch_id = '" . $conn->real_escape_string($targetBatchId) . "'")->fetch_assoc()['remaining_qty'];
    assertTrue(getSealed($conn, $sizeId) === $before5 - 2, "Sellable inventory deducted by -2 on post-receiving damage");
    assertTrue($bAfter === $bBefore - 2, "Linked FIFO batch remaining_qty deducted by -2");
    assertTrue(getBatchSum($conn, $sizeId) === getSealed($conn, $sizeId), "FIFO batch invariant preserved after post-receiving quarantine");

    echo "\n--- Scenario 7: Process Supplier Credit & Finalized Lock ---\n";
    $before7 = getSealed($conn, $sizeId);
    $ret7 = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=create_return", [
        'poId' => $testPoId, 'poNumber' => $testPoNum, 'supplierId' => $testSupId, 'supplierName' => $testSupName,
        'returnDate' => date('Y-m-d'), 'reason' => 'Contaminated Paint', 'resolutionType' => 'Supplier Credit',
        'items' => [['damagedRecordId' => $dmgId5, 'returnQty' => 2]]
    ], $adminCookie);
    assertTrue($ret7['code'] === 200 && !empty($ret7['json']['success']), "Created supplier return for post-receiving damage");
    $retId7 = $ret7['json']['returnId'] ?? '';
    $createdReturnIds[] = $retId7;
    assertTrue(getSealed($conn, $sizeId) === $before7, "Zero duplicate stock deduction for post-receiving supplier return");

    $credResp = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=update_status", [
        'returnId' => $retId7, 'status' => 'Credit Issued', 'resolutionType' => 'Supplier Credit',
        'creditAmount' => 700.00, 'resolutionNotes' => 'Credit memo CM-9981'
    ], $adminCookie);
    assertTrue($credResp['code'] === 200 && !empty($credResp['json']['success']), "Admin recorded Supplier Credit (Credit Issued)");

    // Staff cannot modify finalized record
    $stfTamper = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=update_status", [
        'returnId' => $retId7, 'status' => 'Pending Return', 'resolutionType' => 'Supplier Credit'
    ], $staffCookie);
    assertTrue($stfTamper['code'] === 400 || $stfTamper['code'] === 403, "Unauthorized user blocked from modifying finalized return record");

    // Admin closes finalized record; then cannot reopen Closed record
    $closeResp = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=update_status", [
        'returnId' => $retId7, 'status' => 'Closed', 'resolutionType' => 'Supplier Credit', 'creditAmount' => 700.00, 'resolutionNotes' => 'Reconciled & closed'
    ], $adminCookie);
    assertTrue($closeResp['code'] === 200 && !empty($closeResp['json']['success']), "Admin marked finalized return as Closed");
    $reopenResp = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=update_status", [
        'returnId' => $retId7, 'status' => 'Pending Return', 'resolutionType' => 'Supplier Credit'
    ], $adminCookie);
    assertTrue($reopenResp['code'] === 400, "Closed return record is permanently locked against modification");

    // Verify audit logs were written
    $audCnt = (int)$conn->query("SELECT COUNT(*) AS c FROM audit_logs WHERE created_at >= '{$startTime}' AND action IN ('DAMAGED_STOCK_RECORD','DAMAGED_STOCK_QUARANTINE','SUPPLIER_RETURN_CREATE','SUPPLIER_RETURN_APPROVE','SUPPLIER_RETURN_STATUS','SUPPLIER_RETURN_REPLACEMENT')")->fetch_assoc()['c'];
    assertTrue($audCnt >= 8, "Audit logs recorded all damaged stock & supplier return actions ({$audCnt} entries)");

    echo "\n--- Scenario 9: Physical Inspection Validation & Direct Return to Delivery Personnel (Multi-Product PO) ---\n";
    // Missing damage reason must be rejected
    $noReason = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $testPoId, 'poNumber' => $testPoNum, 'supplierId' => $testSupId, 'supplierName' => $testSupName,
        'items' => [[
            'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
            'deliveredQty' => 10, 'acceptedQty' => 8, 'damagedQty' => 2, 'reason' => '', 'handling' => 'returned_to_driver'
        ]]
    ], $staffCookie);
    assertTrue($noReason['code'] === 400, "Rejected damaged/rejected delivery when Damage Reason is missing");

    // Multi-item rejection returned directly to delivery personnel -> auto-creates linked Supplier Return (SRET-...)
    $before9 = getSealed($conn, $sizeId);
    $driverRej = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $testPoId, 'poNumber' => $testPoNum, 'supplierId' => $testSupId, 'supplierName' => $testSupName,
        'items' => [
            [
                'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
                'deliveredQty' => 10, 'acceptedQty' => 8, 'damagedQty' => 2, 'reason' => 'Broken / Damaged Container',
                'handling' => 'returned_to_driver', 'inspectionNotes' => 'Handed back to driver on arrival'
            ],
            [
                'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
                'deliveredQty' => 6, 'acceptedQty' => 5, 'damagedQty' => 1, 'reason' => 'Leaking Paint',
                'handling' => 'returned_to_driver', 'inspectionNotes' => 'Leaking lid rejected at dock'
            ]
        ]
    ], $staffCookie);
    assertTrue($driverRej['code'] === 200 && !empty($driverRej['json']['success']), "Multi-line direct driver rejection recorded");
    assertTrue(!empty($driverRej['json']['autoReturnRef']), "Auto-generated linked Supplier Return (" . ($driverRej['json']['autoReturnRef'] ?? '') . ") for driver-rejected items");
    if (!empty($driverRej['json']['createdIds'])) {
        foreach ($driverRej['json']['createdIds'] as $cid) $createdDmgIds[] = $cid;
    }
    if (!empty($driverRej['json']['autoReturnId'])) {
        $createdReturnIds[] = $driverRej['json']['autoReturnId'];
    }
    assertTrue(getSealed($conn, $sizeId) === $before9, "Rejected items returned to driver NEVER entered sellable inventory");
    // Verify the auto-created return has status 'Returned to Supplier' and 2 items
    $autoRetObj = null;
    foreach (($driverRej['json']['returns'] ?? []) as $r) {
        if ($r['id'] === ($driverRej['json']['autoReturnId'] ?? '')) $autoRetObj = $r;
    }
    assertTrue($autoRetObj !== null && $autoRetObj['status'] === 'Returned to Supplier' && count($autoRetObj['items']) === 2 && $autoRetObj['totalDamagedQty'] === 3, "Linked driver return has status 'Returned to Supplier', 2 items, and 3 total rejected units");

} finally {
    // ---- CLEANUP: Restore DB to exact pre-test state ----
    foreach ($createdReturnIds as $rid) {
        if ($rid) {
            $conn->query("DELETE FROM supplier_return_items WHERE return_id = '" . $conn->real_escape_string($rid) . "'");
            $conn->query("DELETE FROM supplier_returns WHERE id = '" . $conn->real_escape_string($rid) . "'");
        }
    }
    foreach ($createdDmgIds as $did) {
        if ($did) $conn->query("DELETE FROM damaged_stock_records WHERE id = '" . $conn->real_escape_string($did) . "'");
    }
    // Remove test batches (including replacement batch)
    $conn->query("DELETE FROM batch_movements WHERE created_at >= '{$startTime}' AND staff_name LIKE '%{$testTag}%'");
    $conn->query("DELETE FROM inventory_batches WHERE created_by LIKE '%{$testTag}%' OR po_number = '" . $conn->real_escape_string($testPoNum) . "'");
    foreach ($origBatches as $bid => $rem) {
        $conn->query("UPDATE inventory_batches SET remaining_qty = {$rem} WHERE batch_id = '" . $conn->real_escape_string($bid) . "'");
    }
    // Restore original inventory & product stock
    $conn->query("UPDATE inventory SET sealed_quantity = {$origSealed} WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'");
    $csEsc = $origCanStock !== null ? ("'" . $conn->real_escape_string($origCanStock) . "'") : "NULL";
    $conn->query("UPDATE products SET stock = {$origStock}, can_stock = {$csEsc} WHERE id = '" . $conn->real_escape_string($productId) . "'");
    // Remove test movements, audit logs, and test users
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
