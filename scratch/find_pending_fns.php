<?php
$lines = file(__DIR__ . '/../assets/js/approvals.js');
echo "=== APPROVALS.JS PENDING LIST FUNCTIONS ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'function getPendingAdjustmentRequests') !== false || 
        stripos($l, 'function getPendingProductsList') !== false || 
        stripos($l, 'function getPendingPurchaseOrdersList') !== false ||
        stripos($l, 'function getPendingProducts') !== false ||
        stripos($l, 'function getPendingPurchaseOrders') !== false) {
        echo ($i + 1) . ': ' . trim($l) . "\n";
    }
}

