<?php
/**
 * End-to-End Verification: Supplier Confirmation Receipt, File Upload Security,
 * Status Progression ('Confirmed by Supplier – Awaiting Delivery'), Duplicate Prevention,
 * Manual Confirmation, Proof Replacement, and Inventory Protection.
 */
date_default_timezone_set('Asia/Manila');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../api/batch_lib.php';
require_once __DIR__ . '/../api/supplier_returns_lib.php';

$BASE_URL = 'http://127.0.0.1:8769';
$conn = getDBConnection();
batchEnsureSchema($conn);
supplierReturnsEnsureSchema($conn);

$passed = 0; $failed = 0;
function assertTrue($cond, $msg) {
    global $passed, $failed;
    if ($cond) { echo "  [PASS] {$msg}\n"; $passed++; }
    else { echo "  [FAIL] {$msg}\n"; $failed++; }
}

function httpReq(string $method, string $url, $payload, string $cookieFile, bool $isMultipart = false): array {
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_COOKIEJAR => $cookieFile,
        CURLOPT_COOKIEFILE => $cookieFile,
        CURLOPT_TIMEOUT => 15,
    ];
    if ($isMultipart) {
        $opts[CURLOPT_POSTFIELDS] = $payload;
    } elseif ($payload !== null) {
        $opts[CURLOPT_HTTPHEADER] = ['Content-Type: application/json'];
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload);
    }
    curl_setopt_array($ch, $opts);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $ctype = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    return ['code' => $code, 'ctype' => $ctype, 'json' => json_decode($body ?: '{}', true), 'raw' => $body];
}

function getSealed(mysqli $conn, string $sizeId): int {
    $r = $conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = '" . $conn->real_escape_string($sizeId) . "'")->fetch_assoc();
    return $r ? (int)$r['sealed_quantity'] : 0;
}

$testTag = 'CONFTEST_' . strtoupper(bin2hex(random_bytes(3)));
$staffCookie = sys_get_temp_dir() . "/conf_stf_{$testTag}.txt";
$testStaffId = 'u_cstf_' . strtolower($testTag);
$testPass = 'TestPass123!';
$testHash = password_hash($testPass, PASSWORD_BCRYPT);
$nowSql = date('Y-m-d H:i:s');
$startTime = $nowSql;

$conn->query("INSERT INTO users (id, username, password, name, role, status, created_at) VALUES
    ('{$testStaffId}', 'conf_stf_{$testTag}', '{$testHash}', 'Test Staff {$testTag}', 'staff', 'active', '{$nowSql}')");

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

// Create minimal valid PDF, PNG, and invalid PHP test files in temp dir
$pdfPath = sys_get_temp_dir() . "/receipt_{$testTag}.pdf";
file_put_contents($pdfPath, "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
$pngPath = sys_get_temp_dir() . "/receipt_{$testTag}.png";
file_put_contents($pngPath, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
$badPath = sys_get_temp_dir() . "/evil_{$testTag}.php";
file_put_contents($badPath, "<?php echo 'hack'; ?>");

$createdPoIds = []; $createdDmgIds = []; $createdReqIds = []; $createdReturnIds = []; $uploadedRelPaths = [];

function makeTestPO(mysqli $conn, string $tag, int $idx, string $productId, string $productName, string $sizeId, float $containerSize, array &$createdPoIds): array {
    $poId = 'po_' . strtolower($tag) . '_' . $idx;
    $poNum = "PO-{$tag}-{$idx}";
    $supId = 'sup_' . strtolower($tag);
    $supName = "Supplier {$tag}";
    $now = date('Y-m-d H:i:s');
    $itemsJson = json_encode([[
        'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'size' => $containerSize,
        'qty' => 10, 'receivedQty' => 5, 'acceptedQty' => 5, 'deliveredQty' => 10, 'damagedQty' => 5
    ]]);
    $st = $conn->prepare("INSERT INTO purchase_orders (id, po_number, supplier_id, supplier_name, order_date, status, total_amount, items_json, notes, created_by)
        VALUES (?, ?, ?, ?, ?, 'partial', 5000.00, ?, 'Conf test PO', ?)");
    $staff = "Test Staff {$tag}";
    $st->bind_param('sssssss', $poId, $poNum, $supId, $supName, $now, $itemsJson, $staff);
    $st->execute();
    $st->close();
    $createdPoIds[] = $poId;
    return ['id' => $poId, 'poNumber' => $poNum, 'supplierId' => $supId, 'supplierName' => $supName];
}

try {
    $login = httpReq('POST', "{$BASE_URL}/api/auth.php?action=login", ['username' => "conf_stf_{$testTag}", 'password' => $testPass], $staffCookie);
    assertTrue($login['code'] === 200 && !empty($login['json']['success']), "Authenticated Inventory Staff");

    echo "\n--- 1. Auto-Generate Replacement Request & Reject Invalid Upload ---\n";
    $po1 = makeTestPO($conn, $testTag, 1, $productId, $productName, $sizeId, $containerSize, $createdPoIds);
    $dmg1 = httpReq('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $po1['id'], 'poNumber' => $po1['poNumber'], 'supplierId' => $po1['supplierId'], 'supplierName' => $po1['supplierName'],
        'receivingTxKey' => "rcvtx_{$testTag}_1",
        'items' => [[
            'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
            'deliveredQty' => 10, 'acceptedQty' => 5, 'damagedQty' => 5, 'reason' => 'Leaking Paint', 'handling' => 'returned_to_driver'
        ]]
    ], $staffCookie);
    $reqId1 = $dmg1['json']['autoReplacementIds'][0] ?? '';
    $createdReqIds[] = $reqId1;
    foreach (($dmg1['json']['createdIds'] ?? []) as $id) $createdDmgIds[] = $id;
    if (!empty($dmg1['json']['autoReturnId'])) $createdReturnIds[] = $dmg1['json']['autoReturnId'];
    assertTrue($reqId1 !== '', "Auto-generated replacement request ({$reqId1})");

    // Attempt uploading disallowed .php file -> must be rejected
    $badUp = httpReq('POST', "{$BASE_URL}/api/supplier_returns.php?action=confirm_supplier_replacement", [
        'requestId' => $reqId1, 'confirmationRef' => 'BAD-1', 'confirmationDate' => date('Y-m-d'),
        'receipt' => new CURLFile($badPath, 'application/x-php', 'evil.php')
    ], $staffCookie, true);
    assertTrue($badUp['code'] === 400, "Rejected invalid file upload (.php)");

    echo "\n--- 2. Confirm Supplier with PDF Receipt Upload (No Inventory Change!) ---\n";
    $sealedBefore = getSealed($conn, $sizeId);
    $conf1 = httpReq('POST', "{$BASE_URL}/api/supplier_returns.php?action=confirm_supplier_replacement", [
        'requestId' => $reqId1,
        'confirmationRef' => 'SUP-CONF-8899',
        'confirmationDate' => date('Y-m-d'),
        'remarks' => 'Signed supplier replacement slip received via email',
        'receipt' => new CURLFile($pdfPath, 'application/pdf', 'supplier_slip.pdf')
    ], $staffCookie, true);
    assertTrue($conf1['code'] === 200 && !empty($conf1['json']['success']), "Confirmed supplier with PDF receipt upload");
    assertTrue(getSealed($conn, $sizeId) === $sealedBefore, "Inventory NOT increased upon supplier confirmation");

    $rRow1 = $conn->query("SELECT status, supplier_confirmed, confirmation_ref, confirmation_date, confirmed_by, confirmation_receipt_path, confirmation_receipt_mime FROM supplier_replacement_requests WHERE id = '{$reqId1}'")->fetch_assoc();
    if (!empty($rRow1['confirmation_receipt_path'])) $uploadedRelPaths[] = $rRow1['confirmation_receipt_path'];
    assertTrue($rRow1['status'] === 'Confirmed by Supplier – Awaiting Delivery', "Status updated to 'Confirmed by Supplier – Awaiting Delivery'");
    assertTrue((int)$rRow1['supplier_confirmed'] === 1 && $rRow1['confirmation_ref'] === 'SUP-CONF-8899' && $rRow1['confirmation_receipt_mime'] === 'application/pdf', "Confirmation ref, date, confirmed_by & PDF metadata persisted in MariaDB");

    // View uploaded PDF via authenticated endpoint
    $view1 = httpReq('GET', "{$BASE_URL}/api/supplier_returns.php?action=view_confirmation_receipt&requestId={$reqId1}", null, $staffCookie);
    assertTrue($view1['code'] === 200 && strpos($view1['ctype'], 'application/pdf') !== false && strpos($view1['raw'], '%PDF-1.4') === 0, "Authenticated view_confirmation_receipt streams PDF securely");

    echo "\n--- 3. Duplicate Confirmation Prevention & Proof Replacement ---\n";
    $dupConf = httpReq('POST', "{$BASE_URL}/api/supplier_returns.php?action=confirm_supplier_replacement", [
        'requestId' => $reqId1, 'confirmationRef' => 'DUP-2', 'confirmationDate' => date('Y-m-d')
    ], $staffCookie, true);
    assertTrue($dupConf['code'] === 400, "Duplicate supplier confirmation blocked");

    // Replace PDF proof with PNG proof (updateProof=1)
    $oldPdfRel = $rRow1['confirmation_receipt_path'];
    $updProof = httpReq('POST', "{$BASE_URL}/api/supplier_returns.php?action=confirm_supplier_replacement", [
        'requestId' => $reqId1, 'updateProof' => '1', 'confirmationRef' => 'SUP-CONF-8899-REV2',
        'remarks' => 'Replaced with clearer scanned PNG',
        'receipt' => new CURLFile($pngPath, 'image/png', 'supplier_slip_v2.png')
    ], $staffCookie, true);
    assertTrue($updProof['code'] === 200 && !empty($updProof['json']['success']), "Replaced confirmation receipt with PNG proof");
    $rRow1After = $conn->query("SELECT status, confirmation_ref, confirmation_receipt_path, confirmation_receipt_mime FROM supplier_replacement_requests WHERE id = '{$reqId1}'")->fetch_assoc();
    if (!empty($rRow1After['confirmation_receipt_path'])) $uploadedRelPaths[] = $rRow1After['confirmation_receipt_path'];
    assertTrue($rRow1After['confirmation_receipt_mime'] === 'image/png' && $rRow1After['status'] === 'Confirmed by Supplier – Awaiting Delivery', "Proof updated to image/png while preserving status");
    assertTrue(!is_file(__DIR__ . '/../' . $oldPdfRel), "Old PDF file cleanly removed when replaced");

    echo "\n--- 4. Manual Confirmation Without Physical File ---\n";
    $po2 = makeTestPO($conn, $testTag, 2, $productId, $productName, $sizeId, $containerSize, $createdPoIds);
    $dmg2 = httpReq('POST', "{$BASE_URL}/api/supplier_returns.php?action=record_receiving_damage", [
        'poId' => $po2['id'], 'poNumber' => $po2['poNumber'], 'supplierId' => $po2['supplierId'], 'supplierName' => $po2['supplierName'],
        'receivingTxKey' => "rcvtx_{$testTag}_2",
        'items' => [[
            'productId' => $productId, 'productName' => $productName, 'sizeId' => $sizeId, 'containerSize' => $containerSize,
            'deliveredQty' => 10, 'acceptedQty' => 5, 'damagedQty' => 5, 'reason' => 'Broken / Damaged Container', 'handling' => 'returned_to_driver'
        ]]
    ], $staffCookie);
    $reqId2 = $dmg2['json']['autoReplacementIds'][0] ?? '';
    $createdReqIds[] = $reqId2;
    foreach (($dmg2['json']['createdIds'] ?? []) as $id) $createdDmgIds[] = $id;
    if (!empty($dmg2['json']['autoReturnId'])) $createdReturnIds[] = $dmg2['json']['autoReturnId'];

    $manualConf = httpReq('POST', "{$BASE_URL}/api/supplier_returns.php?action=confirm_supplier_replacement", [
        'requestId' => $reqId2, 'confirmationDate' => date('Y-m-d'), 'remarks' => 'Confirmed via phone call with supplier manager (no physical slip)'
    ], $staffCookie, true);
    assertTrue($manualConf['code'] === 200 && !empty($manualConf['json']['success']), "Manual supplier confirmation without file succeeded");

    echo "\n--- 5. Receive Replacement Stock After Confirmation (Physical Inspection Required) ---\n";
    $del1 = httpReq('POST', "{$BASE_URL}/api/supplier_returns.php?action=receive_replacement_delivery", [
        'requestId' => $reqId1, 'deliveredQty' => 5, 'acceptedQty' => 5, 'damagedQty' => 0,
        'expirationDate' => date('Y-m-d', strtotime('+365 days')), 'idempotencyKey' => "rdel_{$testTag}_1"
    ], $staffCookie);
    assertTrue($del1['code'] === 200 && $del1['json']['newStatus'] === 'Completed', "Replacement received & inspected -> Completed");
    assertTrue(getSealed($conn, $sizeId) === $sealedBefore + 5, "Inventory increased by +5 ONLY after physical replacement receipt");
    $po1Stat = $conn->query("SELECT status FROM purchase_orders WHERE id = '{$po1['id']}'")->fetch_assoc()['status'];
    assertTrue($po1Stat === 'received', "Original PO marked Fully Received ('received') once all replacement units accepted");

    $audCnt = (int)$conn->query("SELECT COUNT(*) AS c FROM audit_logs WHERE created_at >= '{$startTime}' AND action IN ('REPLACEMENT_SUPPLIER_CONFIRM','REPLACEMENT_RECEIPT_UPDATE')")->fetch_assoc()['c'];
    assertTrue($audCnt >= 3, "Audit log recorded supplier confirmation & receipt updates ({$audCnt} entries)");

} finally {
    foreach ($uploadedRelPaths as $rp) {
        $abs = __DIR__ . '/../' . ltrim($rp, '/\\');
        if (is_file($abs)) @unlink($abs);
    }
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
    $conn->query("DELETE FROM users WHERE id = '{$testStaffId}'");
    @unlink($staffCookie);
    @unlink($pdfPath);
    @unlink($pngPath);
    @unlink($badPath);
}

echo "\n====================================================\n";
echo "SUMMARY: {$passed} PASSED, {$failed} FAILED\n";
echo "====================================================\n";
exit($failed > 0 ? 1 : 0);
