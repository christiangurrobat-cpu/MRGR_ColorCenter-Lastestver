<?php
$poLines = file(__DIR__ . '/../assets/js/purchase-orders.js');
echo "=== RECEIVING IN PURCHASE-ORDERS.JS ===\n";
foreach ($poLines as $i => $l) {
    if (stripos($l, 'receive') !== false && (stripos($l, 'function') !== false || stripos($l, 'async') !== false)) {
        echo ($i + 1) . ': ' . trim($l) . "\n";
    }
}

