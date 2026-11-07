<?php
$lines = file(__DIR__ . '/../assets/js/color-mixing.js');
echo "=== COLOR MIXING CHECKS ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, '100%') !== false || stripos($l, 'percentage') !== false || stripos($l, 'opened') !== false || stripos($l, 'insufficient') !== false || stripos($l, 'detected') !== false || stripos($l, 'formula') !== false) {
        if (strlen(trim($l)) < 120 && stripos($l, 'class=') === false && stripos($l, 'style=') === false) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

