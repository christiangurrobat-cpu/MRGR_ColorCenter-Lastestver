<?php
$recLines = file(__DIR__ . '/../assets/js/receiving.js');
echo "=== RECEIVING PO IN RECEIVING.JS ===\n";
foreach ($recLines as $i => $l) {
    if (stripos($l, 'receive') !== false && (stripos($l, 'function') !== false || stripos($l, 'async') !== false)) {
        echo ($i + 1) . ': ' . trim($l) . "\n";
    }
}

