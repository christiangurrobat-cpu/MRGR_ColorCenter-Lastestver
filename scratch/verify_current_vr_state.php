<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$res = $conn->query("
    SELECT vr.id, vr.receipt_no, vr.status as vr_status, vr.reviewed_by, s.status as sale_status
    FROM void_requests vr
    LEFT JOIN sales s ON vr.sale_id = s.id
    ORDER BY vr.date ASC
");
echo "=== CURRENT VOID REQUESTS IN DB ===\n";
while ($r = $res->fetch_assoc()) {
    echo "VR ID: {$r['id']} | Receipt: {$r['receipt_no']} | VR Status: {$r['vr_status']} | Sale Status: {$r['sale_status']} | Reviewed By: {$r['reviewed_by']}\n";
}

$p = $conn->query("SELECT stock, can_stock FROM products WHERE id = 'PRD-001'")->fetch_assoc();
$inv = $conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = 'SZ-001'")->fetch_assoc();
echo "\nPRD-001 Stock: {$p['stock']}L (canStock: {$p['can_stock']}) | SZ-001: {$inv['sealed_quantity']} units\n";

