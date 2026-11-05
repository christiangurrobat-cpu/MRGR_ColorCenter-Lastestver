<?php
require_once __DIR__ . '/../config/database.php';

echo "========================================================\n";
echo "MRGR Color Center - Product ID & Size ID Verification\n";
echo "========================================================\n\n";

$conn = getDBConnection();
if (!$conn) {
    die("Database connection failed.\n");
}

$allPassed = true;
function assertTest($condition, $message) {
    global $allPassed;
    if ($condition) {
        echo " [PASS] $message\n";
    } else {
        echo " [FAIL] $message\n";
        $allPassed = false;
    }
}

// 1. Check products table
$res = $conn->query("SELECT COUNT(*) as cnt FROM products");
$pCount = (int)$res->fetch_assoc()['cnt'];
assertTest($pCount > 0, "Products table contains $pCount records.");

$res = $conn->query("SELECT COUNT(DISTINCT product_id) as cnt FROM products WHERE product_id LIKE 'PRD-%'");
$prdCount = (int)$res->fetch_assoc()['cnt'];
assertTest($prdCount === $pCount, "Every product has a unique PRD-xxx ID ($prdCount of $pCount).");

// 2. Check product_sizes table
$res = $conn->query("SELECT COUNT(*) as cnt FROM product_sizes");
$psCount = (int)$res->fetch_assoc()['cnt'];
assertTest($psCount > 0, "product_sizes table contains $psCount records.");

$res = $conn->query("SELECT COUNT(DISTINCT size_id) as cnt FROM product_sizes WHERE size_id LIKE 'SZ-%'");
$szCount = (int)$res->fetch_assoc()['cnt'];
assertTest($szCount === $psCount, "Every size variant has a unique SZ-xxx ID ($szCount of $psCount).");

// 3. Verify no duplicate sizes under same product
$res = $conn->query("SELECT product_id, container_size, COUNT(*) as cnt 
                     FROM product_sizes 
                     GROUP BY product_id, container_size 
                     HAVING cnt > 1");
assertTest($res->num_rows === 0, "No duplicate container sizes under the same parent product.");

// 4. Verify inventory table
$res = $conn->query("SELECT COUNT(*) as cnt FROM inventory");
$invCount = (int)$res->fetch_assoc()['cnt'];
assertTest($invCount === $psCount, "inventory table contains matching $invCount records (1:1 with product_sizes).");

$res = $conn->query("SELECT COUNT(DISTINCT inventory_id) as cnt FROM inventory WHERE inventory_id LIKE 'INV-%'");
$invUnique = (int)$res->fetch_assoc()['cnt'];
assertTest($invUnique === $invCount, "Every inventory record has a unique INV-xxx ID.");

// 5. Foreign Key and orphan integrity
$res = $conn->query("SELECT COUNT(*) as cnt FROM product_sizes ps 
                     LEFT JOIN products p ON p.id = ps.product_id 
                     WHERE p.id IS NULL");
$orphanSizes = (int)$res->fetch_assoc()['cnt'];
assertTest($orphanSizes === 0, "All product_sizes reference a valid parent product (zero orphans).");

$res = $conn->query("SELECT COUNT(*) as cnt FROM inventory inv 
                     LEFT JOIN product_sizes ps ON ps.size_id = inv.size_id 
                     WHERE ps.size_id IS NULL");
$orphanInv = (int)$res->fetch_assoc()['cnt'];
assertTest($orphanInv === 0, "All inventory records reference a valid size_id (zero orphans).");

// 6. Inspect PRD-001 (Boysen Permacoat Latex White)
echo "\n--- Inspecting PRD-001 (Prompt Requirement Example) ---\n";
$res = $conn->query("SELECT p.product_id, p.name, p.brand, p.color, ps.size_id, ps.container_size, ps.price_per_can, inv.sealed_quantity, inv.opened_quantity, inv.remaining_volume 
                     FROM products p 
                     JOIN product_sizes ps ON ps.product_id = p.id 
                     JOIN inventory inv ON inv.size_id = ps.size_id 
                     WHERE p.product_id = 'PRD-001' 
                     ORDER BY ps.container_size ASC");
$sizesFound = [];
while ($row = $res->fetch_assoc()) {
    $sizesFound[] = $row;
    echo "  Size ID: {$row['size_id']} | Size: {$row['container_size']}L | Price: PHP {$row['price_per_can']} | Sealed: {$row['sealed_quantity']} | Opened: {$row['opened_quantity']} | RemVol: {$row['remaining_volume']}L\n";
}
assertTest(count($sizesFound) >= 6, "PRD-001 has at least 6 container size variants matching prompt specification.");

// 7. Verify Movements tracking
$res = $conn->query("SELECT COUNT(*) as cnt FROM movements WHERE size_id IS NOT NULL AND size_id != ''");
$mvCount = (int)$res->fetch_assoc()['cnt'];
echo "\n--- Stock Movements History ---\n";
echo "  Total movements tracked with size_id: $mvCount\n";
assertTest($mvCount > 0, "Historical movements contain populated size_id references.");

// 8. Verify Sales JSON references
$res = $conn->query("SELECT COUNT(*) as cnt FROM sales WHERE items_json LIKE '%sizeId%' OR items_json LIKE '%SZ-%'");
$salesSized = (int)$res->fetch_assoc()['cnt'];
echo "  Sales records containing sizeId: $salesSized\n";
assertTest($salesSized > 0, "Historical sales records contain sizeId mappings.");

// 9. Verify Purchase Orders JSON references
$res = $conn->query("SELECT COUNT(*) as cnt FROM purchase_orders WHERE items_json LIKE '%sizeId%' OR items_json LIKE '%SZ-%'");
$poSized = (int)$res->fetch_assoc()['cnt'];
echo "  Purchase orders containing sizeId: $poSized\n";
assertTest($poSized > 0, "Historical purchase orders contain sizeId mappings.");

echo "\n========================================================\n";
if ($allPassed) {
    echo "SUCCESS: ALL INTEGRITY & RELATIONSHIP TESTS PASSED!\n";
} else {
    echo "FAILURE: ONE OR MORE TESTS FAILED.\n";
}
echo "========================================================\n";
