<?php
$lines = file(__DIR__ . '/../api/db.php');
echo "=== VOID_REQUESTS IN API/DB.PHP ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'void_requests') !== false || stripos($l, 'voidRequests') !== false) {
        echo ($i + 1) . ': ' . trim($l) . "\n";
    }
}

