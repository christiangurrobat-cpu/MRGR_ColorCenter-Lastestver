<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$sales = $conn->query("SELECT id, receipt_no, status, total, void_inventory_restored, items_json FROM sales WHERE DATE(date) = '2026-11-08'")->fetch_all(MYSQLI_ASSOC);

echo "Detailed Inventory Analysis of Today's (2026-11-08) Sales:\n";
foreach ($sales as $s) {
    $items = json_decode($s['items_json'], true) ?: [];
    $isRestored = (bool)$s['void_inventory_restored'];
    echo "- Receipt: {$s['receipt_no']} | Status: {$s['status']} | Void Inv Restored: " . ($isRestored ? 'YES' : 'NO') . "\n";
    foreach ($items as $it) {
        $pname = $it['name'] ?? ($it['productName'] ?? 'Product');
        $size = $it['size'] ?? 1;
        $qty = $it['qty'] ?? 1;
        echo "    * {$pname} ({$size}L) x {$qty}\n";
    }
}

