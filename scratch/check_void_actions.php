<?php
$lines = file(__DIR__ . '/../api/void.php');
echo "=== ACTIONS IN API/VOID.PHP ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'action ===') !== false || stripos($l, 'action =') !== false) {
        echo ($i + 1) . ': ' . trim($l) . "\n";
    }
}

