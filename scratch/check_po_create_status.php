<?php
$lines = file(__DIR__ . '/../assets/js/purchase-orders.js');
echo "=== NEW PO CREATION STATUS IN PURCHASE-ORDERS.JS ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'status: ') !== false || stripos($l, "status = 'pending'") !== false || stripos($l, "status = 'ordered'") !== false) {
        if (strlen(trim($l)) < 120) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

