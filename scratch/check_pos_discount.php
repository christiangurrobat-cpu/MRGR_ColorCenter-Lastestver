<?php
$posLines = file(__DIR__ . '/../assets/js/pos.js');
echo "=== POS Discount & Calculation Logic ===\n";
foreach ($posLines as $i => $l) {
    if (stripos($l, 'discount') !== false || stripos($l, '2500') !== false || stripos($l, '2,500') !== false || stripos($l, 'subtotal') !== false || stripos($l, 'total') !== false) {
        if (strlen(trim($l)) < 120 && stripos($l, 'class=') === false) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

