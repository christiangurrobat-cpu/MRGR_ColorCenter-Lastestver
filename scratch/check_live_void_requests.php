<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

echo "=== VOID REQUESTS IN MRGR_ColorCenter ===\n";
$res = $conn->query("SELECT * FROM void_requests");
while ($r = $res->fetch_assoc()) {
    echo "ID: {$r['id']} | SaleID: {$r['sale_id']} | Receipt: {$r['receipt_no']} | Date: {$r['date']} | Status: {$r['status']} | Reason: {$r['reason']}\n";
}

echo "\n=== CORRESPONDING SALES IN MRGR_ColorCenter ===\n";
$res2 = $conn->query("SELECT id, receipt_no, date, cashier_name, total, status, void_request_id, void_reason FROM sales WHERE receipt_no IN ('OR-20261108-0129', 'OR-20261108-0128', 'OR-20261108-0127', 'OR-20261108-0126')");
while ($r = $res2->fetch_assoc()) {
    echo "SaleID: {$r['id']} | Receipt: {$r['receipt_no']} | Total: {$r['total']} | Status: {$r['status']} | VR_ID: {$r['void_request_id']}\n";
}

