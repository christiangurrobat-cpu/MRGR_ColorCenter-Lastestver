<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

// Let's inspect api/db.php lines 659-725
echo "Testing inventory vs products can_stock override in api/db.php:\n";

// Let's check a sample product PRD-001
$res1 = $conn->query("SELECT id, stock, can_stock FROM products WHERE id = 'PRD-001'");
$p = $res1->fetch_assoc();
echo "products table: stock={$p['stock']}, can_stock={$p['can_stock']}\n";

$res2 = $conn->query("
    SELECT ps.size_id, ps.container_size, inv.sealed_quantity 
    FROM product_sizes ps 
    LEFT JOIN inventory inv ON inv.size_id = ps.size_id 
    WHERE ps.product_id = 'PRD-001'
");
echo "product_sizes + inventory tables:\n";
while ($r = $res2->fetch_assoc()) {
    echo "  size {$r['container_size']}L (size_id={$r['size_id']}): sealed_quantity={$r['sealed_quantity']}\n";
}

