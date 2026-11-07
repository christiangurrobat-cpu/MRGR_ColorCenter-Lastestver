<?php
$lines = file(__DIR__ . '/../api/db.php');
echo "=== AUDIT_LOGS IN API/DB.PHP ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'audit_logs') !== false) {
        echo ($i + 1) . ': ' . trim($l) . "\n";
    }
}

