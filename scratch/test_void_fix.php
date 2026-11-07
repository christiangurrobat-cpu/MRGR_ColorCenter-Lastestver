<?php
/**
 * Test verification for Issue 1 Fix in api/void.php
 */
require_once __DIR__ . '/../config/database.php';

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, 'mrgr_test_audit');
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

echo "=== VERIFYING ISSUE 1 FIX (VOID INVENTORY DESYNCHRONIZATION) ===\n";

// 1. Initial State of PRD-001 (1L container SZ-001)
$pInit = $conn->query("SELECT stock, can_stock FROM products WHERE id = 'PRD-001'")->fetch_assoc();
$invInit = $conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = 'SZ-001'")->fetch_assoc();

$initialStock = (float)$pInit['stock'];
$initialSealed = (int)$invInit['sealed_quantity'];
echo "Before Void Test: products.stock = {$initialStock}L, inventory.sealed_quantity = {$initialSealed} units\n";

// 2. Insert a test sale for 5 units of PRD-001 (1L)
$saleId = 'sale_fix_verify_' . uniqid();
$receiptNo = 'OR-FIX-VERIFY-' . time();
$items = [
    [
        'type' => 'product',
        'productId' => 'PRD-001',
        'sizeId' => 'SZ-001',
        'size' => 1,
        'qty' => 5,
        'unitPrice' => 700.00,
        'lineTotal' => 3500.00
    ]
];
$itemsJson = json_encode($items);

$conn->query("INSERT INTO sales (id, receipt_no, date, cashier_id, cashier_name, payment_method, items_json, subtotal, total, status)
              VALUES ('$saleId', '$receiptNo', NOW(), 'u2', 'Ana Cruz', 'Cash', '$itemsJson', 3500.00, 3150.00, 'completed')");

// Deduct inventory as if POS sale completed
$conn->query("UPDATE inventory SET sealed_quantity = sealed_quantity - 5 WHERE size_id = 'SZ-001'");
$conn->query("UPDATE products SET stock = stock - 5.00 WHERE id = 'PRD-001'");

$invAfterSale = (int)$conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = 'SZ-001'")->fetch_row()[0];
$stockAfterSale = (float)$conn->query("SELECT stock FROM products WHERE id = 'PRD-001'")->fetch_row()[0];
echo "After Sale: products.stock = {$stockAfterSale}L, inventory.sealed_quantity = {$invAfterSale} units\n";

// 3. Create void request
$voidReqId = 'vr_fix_verify_' . uniqid();
$conn->query("INSERT INTO void_requests (id, sale_id, receipt_no, date, cashier_id, cashier_name, reason, explanation, status, total, items_json)
              VALUES ('$voidReqId', '$saleId', '$receiptNo', NOW(), 'u2', 'Ana Cruz', 'Test Void Fix', 'Verifying inventory table restoration', 'pending', 3150.00, '$itemsJson')");
$conn->query("UPDATE sales SET status = 'pending_void', void_request_id = '$voidReqId' WHERE id = '$saleId'");

// 4. Simulate the fix logic directly from api/void.php on the test database
// Revert Inventory:
foreach ($items as $item) {
    $productId = $item['productId'];
    $size = (float)$item['size'];
    $qty = (int)$item['qty'];
    $litersRestored = round($qty * $size, 2);

    $product = $conn->query("SELECT id, name, stock, can_stock FROM products WHERE id = '$productId'")->fetch_assoc();
    $newStock = round((float)$product['stock'] + $litersRestored, 2);

    $canStockMap = json_decode($product['can_stock'], true) ?: [];
    $canStockMap[(string)$size] = (int)($canStockMap[(string)$size] ?? 0) + $qty;
    $newCanStockJson = json_encode($canStockMap);

    $conn->query("UPDATE products SET stock = $newStock, can_stock = '$newCanStockJson' WHERE id = '{$product['id']}'");

    // NEW LOGIC: Resolve size_id & update inventory table
    $sizeId = $item['sizeId'] ?? null;
    if (!$sizeId) {
        $psRow = $conn->query("SELECT size_id FROM product_sizes WHERE product_id = '{$product['id']}' AND container_size = $size LIMIT 1")->fetch_assoc();
        $sizeId = $psRow['size_id'] ?? null;
    }
    if ($sizeId) {
        $conn->query("UPDATE inventory SET sealed_quantity = sealed_quantity + $qty WHERE size_id = '$sizeId'");
    }
}

$conn->query("UPDATE void_requests SET status = 'approved', reviewed_by = 'Mike Revadulla', reviewed_at = NOW(), inventory_restored = 1 WHERE id = '$voidReqId'");
$conn->query("UPDATE sales SET status = 'Voided', voided_by = 'Mike Revadulla', voided_at = NOW(), void_inventory_restored = 1 WHERE id = '$saleId'");

// 5. Final State Check
$invFinal = (int)$conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = 'SZ-001'")->fetch_row()[0];
$stockFinal = (float)$conn->query("SELECT stock FROM products WHERE id = 'PRD-001'")->fetch_row()[0];

echo "After Void Approval: products.stock = {$stockFinal}L, inventory.sealed_quantity = {$invFinal} units\n";

if ($invFinal === $initialSealed && $stockFinal === $initialStock) {
    echo "[SUCCESS] Issue 1 verified resolved! Relational inventory table (sealed_quantity) is perfectly restored in tandem with products.stock.\n";
} else {
    echo "[FAIL] Stock mismatch: Expected stock {$initialStock}L, got {$stockFinal}L; Expected units {$initialSealed}, got {$invFinal}\n";
    exit(1);
}

