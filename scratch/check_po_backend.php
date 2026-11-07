<?php
$lines = file(__DIR__ . '/../api/db.php');
echo "=== PURCHASE ORDERS IN API/DB.PHP ===\n";
for ($i = 1580; $i < 1740; $i++) {
    if (isset($lines[$i])) {
        if (stripos($lines[$i], 'purchase_orders') !== false || stripos($lines[$i], 'actingRole') !== false || stripos($lines[$i], 'status') !== false) {
            echo ($i + 1) . ': ' . trim($lines[$i]) . "\n";
        }
    }
}

