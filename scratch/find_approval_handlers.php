<?php
$lines = file(__DIR__ . '/../assets/js/approvals.js');
echo "=== APPROVAL HANDLERS IN APPROVALS.JS ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'approve') !== false && (stripos($l, 'function') !== false || stripos($l, 'async') !== false)) {
        if (strlen(trim($l)) < 120) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

