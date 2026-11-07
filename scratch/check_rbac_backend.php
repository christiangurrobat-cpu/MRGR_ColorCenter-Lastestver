<?php
$lines = file(__DIR__ . '/../api/db.php');
echo "=== RBAC IN API/DB.PHP ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'actingRole') !== false || stripos($l, 'role') !== false && (stripos($l, '===') !== false || stripos($l, '!==') !== false)) {
        if (strlen(trim($l)) < 120) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

