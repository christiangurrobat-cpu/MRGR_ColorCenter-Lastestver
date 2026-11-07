<?php
$files = glob(__DIR__ . '/../api/*.php');
foreach ($files as $f) {
    $lines = file($f);
    foreach ($lines as $i => $l) {
        // Look for $conn->query(...) with variables concatenated
        if (preg_match('/\$conn->query\([^)]*\$[^)]*\)/', $l)) {
            // ignore constant creations
            if (stripos($l, 'CREATE DATABASE') === false) {
                echo basename($f) . ": " . ($i + 1) . ": " . trim($l) . "\n";
            }
        }
    }
}

