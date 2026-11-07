<?php
$lines = file(__DIR__ . '/../assets/js/purchase-orders.js');
echo "=== SAVE PO IN PURCHASE-ORDERS.JS ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'purchaseOrders.push') !== false || stripos($l, 'function savePO') !== false || stripos($l, 'function submitPO') !== false) {
        echo ($i + 1) . ': ' . trim($l) . "\n";
    }
}

