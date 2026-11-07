<?php
$lines = file(__DIR__ . '/../assets/js/core.js');
foreach ($lines as $i => $line) {
    if (preg_match('/(function\s+loadDb|function\s+saveDb|api\/db)/', $line)) {
        echo ($i + 1) . ': ' . trim($line) . "\n";
    }
}

