<?php
$files = glob(__DIR__ . '/../assets/js/*.js');
foreach ($files as $f) {
    $lines = file($f);
    foreach ($lines as $i => $l) {
        if (stripos($l, 'approve_request') !== false || stripos($l, 'reject_request') !== false || stripos($l, 'api/void.php') !== false) {
            echo basename($f) . ": " . ($i + 1) . ": " . trim($l) . "\n";
        }
    }
}

