<?php
$lines = file(__DIR__ . '/../api/void.php');
echo "=== INVENTORY TABLE IN API/VOID.PHP ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'inventory') !== false) {
        echo ($i + 1) . ': ' . trim($l) . "\n";
    }
}

