<?php
$lines = file(__DIR__ . '/../api/db.php');
echo "=== SALES STATUS IN API/DB.PHP ===\n";
for ($i = 1520; $i < 1580; $i++) {
    if (isset($lines[$i])) {
        echo ($i + 1) . ': ' . trim($lines[$i]) . "\n";
    }
}

