<?php
$funcs = [
    'confirmApproveAdjRequest', 'openRejectAdjRequestModal',
    'approvePendingProduct', 'rejectPendingProduct', 'approveProductPendingEdits',
    'confirmApprovePO', 'confirmCancelPO'
];

$files = glob(__DIR__ . '/../assets/js/*.js');
foreach ($files as $f) {
    $lines = file($f);
    foreach ($lines as $i => $l) {
        foreach ($funcs as $fn) {
            if (stripos($l, "function $fn") !== false) {
                echo basename($f) . ": " . ($i + 1) . ": " . trim($l) . "\n";
            }
        }
    }
}

