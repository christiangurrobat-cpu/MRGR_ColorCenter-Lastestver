<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$p = $conn->query("SELECT id, name, price FROM products WHERE id = 'PRD-001'")->fetch_assoc();
echo "PRD-001 price in DB: {$p['price']}\n";

$res = $conn->query("SHOW COLUMNS FROM purchase_orders");
while ($r = $res->fetch_assoc()) {
    echo "purchase_orders column: {$r['Field']}, Type: {$r['Type']}, Null: {$r['Null']}, Default: " . var_export($r['Default'], true) . "\n";
}

