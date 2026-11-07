<?php
$lines = file(__DIR__ . '/../assets/js/approvals.js');
echo "=== ONCLICK ACTIONS IN APPROVALS.JS ===\n";
foreach ($lines as $i => $l) {
    if (preg_match('/onclick=["\']([a-zA-Z0-9_]+)\(/', $l, $m)) {
        echo ($i + 1) . ': ' . $m[1] . "\n";
    }
}

