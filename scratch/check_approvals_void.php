<?php
$lines = file(__DIR__ . '/../assets/js/approvals.js');
echo "=== VOID REQUESTS IN APPROVALS.JS ===\n";
foreach ($lines as $i => $l) {
    if (stripos($l, 'voidRequests') !== false || stripos($l, 'void_requests') !== false || stripos($l, 'pending_void') !== false) {
        if (strlen(trim($l)) < 120) {
            echo ($i + 1) . ': ' . trim($l) . "\n";
        }
    }
}

