<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$p = $conn->query("SELECT id, stock, can_stock FROM products WHERE id = 'PRD-001'")->fetch_assoc();
$inv = $conn->query("SELECT * FROM inventory WHERE size_id = 'SZ-001'")->fetch_assoc();
echo "PRD-001 stock: {$p['stock']}, can_stock: {$p['can_stock']}\n";
echo "SZ-001 inventory: sealed={$inv['sealed_quantity']}\n";

