<?php
require_once __DIR__ . '/../config/database.php';

$conn = getDBConnection();

$tables = [
    'products', 'product_sizes', 'inventory', 'sales', 'movements',
    'purchase_orders', 'suppliers', 'users', 'audit_logs', 'void_requests', 'adjustment_requests'
];

echo "=== TABLE STRUCTURES ===\n";
foreach ($tables as $t) {
    echo "\n--- TABLE: $t ---\n";
    $res = $conn->query("DESCRIBE `$t`");
    while ($row = $res->fetch_assoc()) {
        echo sprintf("  %-25s %-20s %-6s %-6s %-15s %s\n", 
            $row['Field'], $row['Type'], $row['Null'], $row['Key'], (string)$row['Default'], $row['Extra']);
    }
}

