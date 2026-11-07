<?php
$files = glob(__DIR__ . '/../api/*.php');
foreach ($files as $f) {
    $content = file_get_contents($f);
    if (stripos($content, 'csrf') !== false) {
        echo basename($f) . " has CSRF check\n";
    }
}
echo "Done checking CSRF in api/\n";

