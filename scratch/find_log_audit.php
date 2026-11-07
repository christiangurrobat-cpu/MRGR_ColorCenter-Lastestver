<?php
$files = glob(__DIR__ . '/../assets/js/*.js');
foreach ($files as $f) {
    $lines = file($f);
    foreach ($lines as $i => $l) {
        if (stripos($l, 'function logAudit') !== false) {
            echo basename($f) . ": " . ($i + 1) . ": " . trim($l) . "\n";
        }
    }
}

