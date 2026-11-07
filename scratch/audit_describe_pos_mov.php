<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
foreach (['purchase_orders', 'movements', 'sales'] as $t) {
    echo "\n--- $t ---\n";
    $res = $conn->query("DESCRIBE `$t`");
    while ($row = $res->fetch_assoc()) {
        echo sprintf("  %-25s %-20s %-6s\n", $row['Field'], $row['Type'], $row['Null']);
    }
}

