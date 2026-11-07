<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

echo "=== CHECKING DATA INTEGRITY ===\n";

// 1. Orphaned product_sizes
$res = $conn->query("SELECT ps.size_id, ps.product_id FROM product_sizes ps LEFT JOIN products p ON ps.product_id = p.id WHERE p.id IS NULL");
$orphanedSizes = $res->fetch_all(MYSQLI_ASSOC);
echo "Orphaned product_sizes (no product): " . count($orphanedSizes) . "\n";
foreach ($orphanedSizes as $os) echo "  - Size {$os['size_id']} refs missing product {$os['product_id']}\n";

// 2. Orphaned inventory
$res = $conn->query("SELECT inv.inventory_id, inv.size_id FROM inventory inv LEFT JOIN product_sizes ps ON inv.size_id = ps.size_id WHERE ps.size_id IS NULL");
$orphanedInv = $res->fetch_all(MYSQLI_ASSOC);
echo "Orphaned inventory (no product_size): " . count($orphanedInv) . "\n";
foreach ($orphanedInv as $oi) echo "  - Inv {$oi['inventory_id']} refs missing size {$oi['size_id']}\n";

// 3. Products with invalid supplier_id
$res = $conn->query("SELECT p.id, p.name, p.supplier_id FROM products p LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.supplier_id IS NOT NULL AND p.supplier_id != '' AND s.id IS NULL");
$orphanedSuppliers = $res->fetch_all(MYSQLI_ASSOC);
echo "Products with non-existent supplier_id: " . count($orphanedSuppliers) . "\n";
foreach ($orphanedSuppliers as $os) echo "  - Product {$os['id']} ({$os['name']}) refs missing supplier {$os['supplier_id']}\n";

// 4. Products without product_sizes
$res = $conn->query("SELECT p.id, p.name FROM products p LEFT JOIN product_sizes ps ON p.id = ps.product_id WHERE ps.size_id IS NULL");
$prodsNoSizes = $res->fetch_all(MYSQLI_ASSOC);
echo "Products without product_sizes: " . count($prodsNoSizes) . "\n";
foreach ($prodsNoSizes as $pns) echo "  - Product {$pns['id']} ({$pns['name']})\n";

// 5. Product_sizes without inventory record
$res = $conn->query("SELECT ps.size_id, ps.product_id FROM product_sizes ps LEFT JOIN inventory inv ON ps.size_id = inv.size_id WHERE inv.inventory_id IS NULL");
$sizesNoInv = $res->fetch_all(MYSQLI_ASSOC);
echo "Product sizes without inventory record: " . count($sizesNoInv) . "\n";
foreach ($sizesNoInv as $sni) echo "  - Size {$sni['size_id']} (Product {$sni['product_id']})\n";

// 6. Movements referencing missing products or sizes
$res = $conn->query("SELECT m.id, m.product_id, m.size_id FROM movements m LEFT JOIN products p ON m.product_id = p.id WHERE m.product_id IS NOT NULL AND m.product_id != '' AND p.id IS NULL");
$movNoProd = $res->fetch_all(MYSQLI_ASSOC);
echo "Movements referencing non-existent products: " . count($movNoProd) . "\n";

$res = $conn->query("SELECT m.id, m.size_id, m.product_id FROM movements m LEFT JOIN product_sizes ps ON m.size_id = ps.size_id WHERE m.size_id IS NOT NULL AND m.size_id != '' AND ps.size_id IS NULL");
$movNoSize = $res->fetch_all(MYSQLI_ASSOC);
echo "Movements referencing non-existent sizes: " . count($movNoSize) . "\n";

// 7. Negative inventory
$res = $conn->query("SELECT * FROM inventory WHERE sealed_quantity < 0 OR opened_quantity < 0 OR remaining_volume < 0");
$negInv = $res->fetch_all(MYSQLI_ASSOC);
echo "Negative inventory records: " . count($negInv) . "\n";
foreach ($negInv as $ni) echo "  - Inv {$ni['inventory_id']}: sealed={$ni['sealed_quantity']}, opened={$ni['opened_quantity']}, rem={$ni['remaining_volume']}\n";

// 8. Negative product stock
$res = $conn->query("SELECT id, name, stock, opened_stock FROM products WHERE stock < 0 OR opened_stock < 0");
$negProd = $res->fetch_all(MYSQLI_ASSOC);
echo "Negative product stock records: " . count($negProd) . "\n";
foreach ($negProd as $np) echo "  - Prod {$np['id']} ({$np['name']}): stock={$np['stock']}, opened_stock={$np['opened_stock']}\n";

// 9. Stock discrepancies between products table and product_sizes/inventory table
echo "\n=== PRODUCT VS INVENTORY DISCREPANCIES ===\n";
$res = $conn->query("
    SELECT p.id, p.name, p.stock AS p_stock, p.opened_stock AS p_opened,
           COALESCE(SUM(ps.container_size * inv.sealed_quantity), 0) AS calc_sealed_liters,
           COALESCE(SUM(inv.remaining_volume), 0) AS calc_opened_liters,
           p.can_stock, p.opened_by_size
    FROM products p
    LEFT JOIN product_sizes ps ON p.id = ps.product_id
    LEFT JOIN inventory inv ON ps.size_id = inv.size_id
    GROUP BY p.id
");
while ($row = $res->fetch_assoc()) {
    $diffSealed = abs((float)$row['p_stock'] - (float)$row['calc_sealed_liters']);
    $diffOpened = abs((float)$row['p_opened'] - (float)$row['calc_opened_liters']);
    if ($diffSealed > 0.01 || $diffOpened > 0.01) {
        echo "Discrepancy in {$row['id']} ({$row['name']}):\n";
        echo "  - products.stock = {$row['p_stock']} L vs sum(inventory) = {$row['calc_sealed_liters']} L\n";
        echo "  - products.opened_stock = {$row['p_opened']} L vs sum(inventory.remaining_volume) = {$row['calc_opened_liters']} L\n";
    }
}

