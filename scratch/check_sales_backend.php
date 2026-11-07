<?php
$lines = file(__DIR__ . '/../api/db.php');
echo "=== SALES IN API/DB.PHP ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'sales') !== false || stripos($l, 'receipt_no') !== false || stripos($l, 'discount') !== false) {
        if (strlen(trim($l)) < 120) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

