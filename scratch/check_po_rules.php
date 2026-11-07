<?php
$poLines = file(__DIR__ . '/../assets/js/purchase-orders.js');
echo "=== PURCHASE ORDERS: 15% DEDUCTION & MOQ 10 ===\n";
foreach ($poLines as $i => $l) {
    if (stripos($l, '0.15') !== false || stripos($l, '0.85') !== false || stripos($l, '15%') !== false || stripos($l, 'moq') !== false || stripos($l, 'min="10"') !== false || stripos($l, 'minimum') !== false) {
        if (strlen(trim($l)) < 130) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

