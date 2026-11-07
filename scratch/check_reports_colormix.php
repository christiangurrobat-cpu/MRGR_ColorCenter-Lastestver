<?php
$lines = file(__DIR__ . '/../assets/js/reports.js');
echo "=== COLOR MIXING IN REPORTS.JS ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'colormix') !== false || stripos($l, 'color mix') !== false || stripos($l, 'mixing') !== false) {
        if (strlen(trim($l)) < 120 && stripos($l, 'class=') === false && stripos($l, 'style=') === false) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

