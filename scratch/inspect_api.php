<?php
$lines = file(__DIR__ . '/../api/db.php');
foreach ($lines as $i => $line) {
    if (stripos($line, 'REQUEST_METHOD') !== false || stripos($line, '$_POST') !== false || stripos($line, 'POST') !== false) {
        if (strlen(trim($line)) < 120) {
            echo ($i + 1) . ': ' . trim($line) . "\n";
        }
    }
}
