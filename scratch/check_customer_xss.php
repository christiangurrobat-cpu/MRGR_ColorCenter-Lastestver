<?php
$lines = file(__DIR__ . '/../assets/js/sales.js');
echo "=== CUSTOMER NAME IN SALES.JS ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'customerName') !== false || stripos($l, 'customer_name') !== false) {
        if (strlen(trim($l)) < 120) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

