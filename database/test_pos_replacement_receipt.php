<?php
/**
 * End-to-End Verification: System-Generated POS-Style Supplier Replacement Confirmation Receipt
 * Tests automatic unique receipt generation, immutable JSON snapshot, duplicate prevention,
 * reprint logging without new receipt number, zero sales/inventory/PO side effects,
 * and separate Replacement Receiving Receipt on physical delivery.
 */
date_default_timezone_set('Asia/Manila');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../api/batch_lib.php';
require_once __DIR__ . '/../api/supplier_returns_lib.php';

$BASE_URL = 'http://127.0.0.1:8770';
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

$testTag = 'POSRCPT_' . strtoupper(bin2hex(random_bytes(3)));
$staffCookie = sys_get_temp_dir() . "/posrcpt_{$testTag}.txt";
$testStaffId = 'u_prcp_' . strtolower($testTag);
$testPass = 'TestPass123!';
$testHash = password_hash($testPass, PASSWORD_BCRYPT);
$nowSql = date('Y-m-d H:i:s');
$startTime = $nowSql;

$conn->query("INSERT INTO users (id, username, password, name, role, status, created_at) VALUES
    ('{$testStaffId}', 'prcp_{$testTag}', '{$testHash}', 'Test Staff {$testTag}', 'staff', 'active', '{$nowSql}')");

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

$poId = 'po_' . strtolower($testTag);
$poNum = "PO-{$testTag}-1";
$supId = 'sup_' . strtolower($testTag);
$supName = "Test Supplier {$testTag}";
$createdReqIds = []; $createdDmgIds = []; $createdReturnIds = [];

try {
    // Create temporary PO
    $itemsJson = json_encode([[
        'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'size' => $containerSize,
        'qty' => 10, 'receivedQty' => 5, 'acceptedQty' => 5, 'deliveredQty' => 10, 'damagedQty' => 5
    ]]);
    $st = $conn->prepare("INSERT INTO purchase_orders (id, po_number, supplier_id, supplier_name, order_date, status, total_amount, items_json, notes, created_by)
        VALUES (?, ?, ?, ?, ?, 'partial', 5000.00, ?, 'Receipt test PO', ?)");
    $staffName = "Test Staff {$testTag}";
    $st->bind_param('sssssss', $poId, $poNum, $supId, $supName, $nowSql, $itemsJson, $staffName);
    $st->execute();
    $st->close();

    $login = httpJson('POST', "{$BASE_URL}/api/auth.php?action=login", ['username' => "prcp_{$testTag}", 'password' => $testPass], $staffCookie);
    assertTrue($login['code'] === 200 && !empty($login['json']['success']), "Authenticated Inventory Staff");

    // 1. Record damaged items -> auto-generate replacement request
    $dmg = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $poId, 'poNumber' => $poNum, 'supplierId' => $supId, 'supplierName' => $supName,
        'receivingTxKey' => "rcvtx_{$testTag}",
        'items' => [[
            'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
            'deliveredQty' => 10, 'acceptedQty' => 5, 'damagedQty' => 5, 'reason' => 'Leaking Paint', 'handling' => 'returned_to_driver'
        ]]
    ], $staffCookie);
    $reqId = $dmg['json']['autoReplacementIds'][0] ?? '';
    $createdReqIds[] = $reqId;
    foreach (($dmg['json']['createdIds'] ?? []) as $id) $createdDmgIds[] = $id;
    if (!empty($dmg['json']['autoReturnId'])) $createdReturnIds[] = $dmg['json']['autoReturnId'];
    assertTrue($reqId !== '', "Auto-generated replacement request ({$reqId})");

    // 2. Confirm Supplier -> auto-generates POS-style Confirmation Receipt (SRCP-...)
    $salesBefore = (int)$conn->query("SELECT COUNT(*) AS c FROM sales")->fetch_assoc()['c'];
    $poCountBefore = (int)$conn->query("SELECT COUNT(*) AS c FROM purchase_orders")->fetch_assoc()['c'];
    $sealedBefore = getSealed($conn, $sizeId);

    $conf = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=confirm_supplier_replacement", [
        'requestId' => $reqId, 'remarks' => 'Supplier confirmed replacement of 5 leaking cans'
    ], $staffCookie);
    $rcpt = $conf['json']['receipt'] ?? null;
    assertTrue($conf['code'] === 200 && $rcpt !== null && strpos($rcpt['receiptNumber'], 'SRCP-') === 0, "Auto-generated unique Confirmation Receipt (" . ($rcpt['receiptNumber'] ?? '') . ")");
    assertTrue(($rcpt['snapshot']['receiptTitle'] ?? '') === 'SUPPLIER REPLACEMENT CONFIRMATION RECEIPT' && ($rcpt['snapshot']['totalReplacementQty'] ?? 0) === 5, "Immutable receipt snapshot contains title, quantities, and status");
    assertTrue((int)$conn->query("SELECT COUNT(*) AS c FROM sales")->fetch_assoc()['c'] === $salesBefore, "No sales transaction created");
    assertTrue((int)$conn->query("SELECT COUNT(*) AS c FROM purchase_orders")->fetch_assoc()['c'] === $poCountBefore, "No duplicate PO created");
    assertTrue(getSealed($conn, $sizeId) === $sealedBefore, "Inventory NOT modified on supplier confirmation");

    // 3. Duplicate confirmation blocked (no duplicate receipt generated)
    $dup = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=confirm_supplier_replacement", [
        'requestId' => $reqId, 'remarks' => 'Duplicate click'
    ], $staffCookie);
    $rcptCount = (int)$conn->query("SELECT COUNT(*) AS c FROM supplier_replacement_receipts WHERE request_id = '{$reqId}' AND receipt_type = 'confirmation'")->fetch_assoc()['c'];
    assertTrue($dup['code'] === 400 && $rcptCount === 1, "Duplicate confirmation blocked; only 1 confirmation receipt exists");

    // 4. Reprint logs audit & increments reprint_count WITHOUT changing receipt_number
    $rep = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=log_receipt_reprint", ['receiptId' => $rcpt['id']], $staffCookie);
    assertTrue($rep['code'] === 200 && (int)$rep['json']['reprintCount'] === 1 && $rep['json']['receiptNumber'] === $rcpt['receiptNumber'], "Reprint logged (#1) without generating a new receipt number");

    // 5. Physical replacement receiving generates separate Delivery Receipt (SRDV-...) & updates inventory
    $del = httpJson('POST', "{$BASE_URL}/api/supplier_returns.php?action=receive_replacement_delivery", [
        'requestId' => $reqId, 'deliveredQty' => 5, 'acceptedQty' => 5, 'damagedQty' => 0,
        'expirationDate' => date('Y-m-d', strtotime('+365 days')), 'idempotencyKey' => "rdel_{$testTag}"
    ], $staffCookie);
    assertTrue($del['code'] === 200 && strpos($del['json']['deliveryReceiptNumber'] ?? '', 'SRDV-') === 0, "Physical replacement receiving generated separate Delivery Receipt (" . ($del['json']['deliveryReceiptNumber'] ?? '') . ")");
    assertTrue(getSealed($conn, $sizeId) === $sealedBefore + 5, "Inventory increased by +5 ONLY after physical replacement inspection");

} finally {
    foreach ($createdReqIds as $rqId) {
        if ($rqId) {
            $conn->query("DELETE FROM supplier_replacement_receipts WHERE request_id = '" . $conn->real_escape_string($rqId) . "'");
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
    $conn->query("DELETE FROM purchase_orders WHERE id = '" . $conn->real_escape_string($poId) . "'");
    $conn->query("DELETE FROM batch_movements WHERE created_at >= '{$startTime}' AND staff_name LIKE '%{$testTag}%'");
    $conn->query("DELETE FROM inventory_batches WHERE created_by LIKE '%{$testTag}%' OR po_number = '" . $conn->real_escape_string($poNum) . "'");
    foreach ($origBatches as $bid => $rem) {
        $conn->query("UPDATE inventory_batches SET remaining_qty = {$rem} WHERE batch_id = '" . $conn->real_escape_string($bid) . "'");
    }
    $conn->query("UPDATE inventory SET sealed_quantity = {$origSealed} WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'");
    $csEsc = $origCanStock !== null ? ("'" . $conn->real_escape_string($origCanStock) . "'") : "NULL";
    $conn->query("UPDATE products SET stock = {$origStock}, can_stock = {$csEsc} WHERE id = '" . $conn->real_escape_string($productId) . "'");
    $conn->query("DELETE FROM movements WHERE date >= '{$startTime}' AND staff_name LIKE '%{$testTag}%'");
    $conn->query("DELETE FROM audit_logs WHERE created_at >= '{$startTime}' AND user_name LIKE '%{$testTag}%'");
    $conn->query("DELETE FROM users WHERE id = '{$testStaffId}'");
    @unlink($staffCookie);
}

echo "\n====================================================\n";
echo "SUMMARY: {$passed} PASSED, {$failed} FAILED\n";
echo "====================================================\n";
exit($failed > 0 ? 1 : 0);
