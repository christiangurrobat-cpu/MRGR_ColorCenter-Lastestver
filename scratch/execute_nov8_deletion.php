<?php
require_once __DIR__ . '/../config/database.php';

$conn = getDBConnection();

echo "=======================================================\n";
echo "EXECUTING REMOVAL OF NOVEMBER 8, 2026 TRANSACTIONS\n";
echo "=======================================================\n\n";

$targetDate = '2026-11-08';

// Identify sales to delete
$salesQuery = "SELECT * FROM sales WHERE DATE(date) = '$targetDate'";
$salesRes = $conn->query($salesQuery);
$salesToDelete = [];
$saleIds = [];
$receiptNos = [];

while ($s = $salesRes->fetch_assoc()) {
    $salesToDelete[] = $s;
    $saleIds[] = $s['id'];
    if (!empty($s['receipt_no'])) {
        $receiptNos[] = $s['receipt_no'];
    }
}

$saleCount = count($salesToDelete);
echo "1. Identified Sales to Delete: $saleCount\n";
if ($saleCount === 0) {
    echo "No sales found for $targetDate. Exiting.\n";
    exit;
}

$recListSql = "'" . implode("','", array_map([$conn, 'real_escape_string'], $receiptNos)) . "'";
$idListSql = "'" . implode("','", array_map([$conn, 'real_escape_string'], $saleIds)) . "'";

$conn->begin_transaction();

try {
    // -------------------------------------------------------------
    // STEP 1: Inventory Restoration
    // -------------------------------------------------------------
    echo "\n2. Performing Inventory Restoration (+6 units / +6L to PRD-001 / SZ-001)...\n";
    
    // Check current values
    $pBefore = $conn->query("SELECT stock, can_stock FROM products WHERE id = 'PRD-001'")->fetch_assoc();
    $invBefore = $conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = 'SZ-001'")->fetch_assoc();
    
    echo "   Before: SZ-001 Inventory = {$invBefore['sealed_quantity']} units | PRD-001 Stock = {$pBefore['stock']} L\n";
    
    // Update inventory table
    $conn->query("UPDATE inventory SET sealed_quantity = sealed_quantity + 6 WHERE size_id = 'SZ-001'");
    
    // Update products table
    $canStockMap = json_decode($pBefore['can_stock'], true) ?: [];
    $canStockMap['1'] = (int)($canStockMap['1'] ?? 162) + 6;
    $newCanStockJson = $conn->real_escape_string(json_encode($canStockMap));
    
    $conn->query("UPDATE products SET stock = stock + 6.00, can_stock = '$newCanStockJson' WHERE id = 'PRD-001'");
    
    $pAfter = $conn->query("SELECT stock, can_stock FROM products WHERE id = 'PRD-001'")->fetch_assoc();
    $invAfter = $conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = 'SZ-001'")->fetch_assoc();
    
    echo "   After : SZ-001 Inventory = {$invAfter['sealed_quantity']} units | PRD-001 Stock = {$pAfter['stock']} L\n";
    echo "   [SUCCESS] Inventory restored to start-of-day baseline.\n";

    // -------------------------------------------------------------
    // STEP 2: Delete Dependent Void Requests
    // -------------------------------------------------------------
    echo "\n3. Deleting Dependent Void Requests...\n";
    $vrDeleteSql = "DELETE FROM void_requests WHERE sale_id IN ($idListSql) OR receipt_no IN ($recListSql)";
    $conn->query($vrDeleteSql);
    $deletedVRCount = $conn->affected_rows;
    echo "   [SUCCESS] Deleted $deletedVRCount void request record(s).\n";

    // -------------------------------------------------------------
    // STEP 3: Delete Related Stock Movements
    // -------------------------------------------------------------
    echo "\n4. Deleting Related Stock Movements...\n";
    $movConditions = [];
    foreach ($receiptNos as $rno) {
        $rnoEsc = $conn->real_escape_string($rno);
        $movConditions[] = "note LIKE '%$rnoEsc%'";
    }
    $movDeleteSql = "DELETE FROM movements WHERE " . implode(' OR ', $movConditions);
    $conn->query($movDeleteSql);
    $deletedMovCount = $conn->affected_rows;
    echo "   [SUCCESS] Deleted $deletedMovCount movement record(s).\n";

    // -------------------------------------------------------------
    // STEP 4: Delete Related Audit Logs
    // -------------------------------------------------------------
    echo "\n5. Deleting Related Audit Logs...\n";
    $auditConditions = [];
    foreach ($receiptNos as $rno) {
        $rnoEsc = $conn->real_escape_string($rno);
        $auditConditions[] = "reference_no = '$rnoEsc'";
        $auditConditions[] = "details LIKE '%$rnoEsc%'";
    }
    $auditDeleteSql = "DELETE FROM audit_logs WHERE " . implode(' OR ', $auditConditions);
    $conn->query($auditDeleteSql);
    $deletedAuditCount = $conn->affected_rows;
    echo "   [SUCCESS] Deleted $deletedAuditCount audit log record(s).\n";

    // -------------------------------------------------------------
    // STEP 5: Delete Sales Transactions
    // -------------------------------------------------------------
    echo "\n6. Deleting Sales Transactions...\n";
    $salesDeleteSql = "DELETE FROM sales WHERE id IN ($idListSql)";
    $conn->query($salesDeleteSql);
    $deletedSalesCount = $conn->affected_rows;
    echo "   [SUCCESS] Deleted $deletedSalesCount sales record(s).\n";

    // Commit Transaction
    $conn->commit();
    echo "\n=======================================================\n";
    echo "DATABASE TRANSACTION COMMITTED SUCCESSFULLY!\n";
    echo "=======================================================\n";

} catch (Throwable $e) {
    $conn->rollback();
    echo "\n[ERROR] Transaction failed and was rolled back: " . $e->getMessage() . "\n";
    exit(1);
}

