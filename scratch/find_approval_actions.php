<?php
$lines = file(__DIR__ . '/../assets/js/approvals.js');
echo "=== APPROVAL FUNCTIONS IN APPROVALS.JS ===\n";
foreach ($lines as $i => $l) {
    if (preg_match('/(function\s+approve|function\s+reject|function\s+batchApprove)/', $l)) {
        echo ($i + 1) . ': ' . trim($l) . "\n";
    }
}

