<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$p = $conn->query("SELECT id, name, stock, can_stock FROM products WHERE id = 'PRD-001'")->fetch_assoc();
$s = $conn->query("SELECT * FROM product_sizes WHERE product_id = 'PRD-001' AND container_size = 1")->fetch_assoc();
$inv = $conn->query("SELECT * FROM inventory WHERE size_id = '{$s['size_id']}'")->fetch_assoc();

echo "Product: {$p['name']} ({$p['id']})\n";
echo "Product total stock: {$p['stock']} L\n";
echo "Can stock JSON: {$p['can_stock']}\n";
echo "Size: {$s['size_id']} (container_size: {$s['container_size']}L)\n";
echo "Inventory sealed_quantity: {$inv['sealed_quantity']} units\n";

