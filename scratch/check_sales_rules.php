<?php
$lines = file(__DIR__ . '/../assets/js/sales.js');
echo "=== RETURNS / VOID IN SALES.JS ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'same-day') !== false || stripos($l, 'sameday') !== false || stripos($l, 'mixed') !== false || stripos($l, 'exchange') !== false || stripos($l, 'refund') !== false || stripos($l, 'void') !== false || stripos($l, 'evidence') !== false) {
        if (strlen(trim($l)) < 120 && stripos($l, 'class=') === false && stripos($l, 'style=') === false) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

