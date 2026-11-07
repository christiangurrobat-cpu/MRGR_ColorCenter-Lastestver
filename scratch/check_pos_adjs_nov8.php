<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$pos = $conn->query("SELECT id, po_number, order_date, status, total_amount FROM purchase_orders WHERE DATE(order_date) = '2026-11-08'")->fetch_all(MYSQLI_ASSOC);
echo "Purchase Orders on 2026-11-08: " . count($pos) . "\n";
foreach ($pos as $po) {
    echo "- PO: {$po['po_number']} | Date: {$po['order_date']} | Status: {$po['status']} | Total: ₱{$po['total_amount']}\n";
}

$adjs = $conn->query("SELECT id, req_number, date, status FROM adjustment_requests WHERE DATE(date) = '2026-11-08'")->fetch_all(MYSQLI_ASSOC);
echo "Adjustment Requests on 2026-11-08: " . count($adjs) . "\n";
foreach ($adjs as $adj) {
    echo "- Req: {$adj['req_number']} | Date: {$adj['date']} | Status: {$adj['status']}\n";
}

