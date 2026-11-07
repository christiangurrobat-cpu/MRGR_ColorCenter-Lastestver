<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

echo "=== INSPECTING RECENT VOID TRANSACTIONS ===\n";

$res = $conn->query("
    SELECT vr.id as vr_id, vr.receipt_no, vr.status as vr_status, vr.inventory_restored, vr.reviewed_by, vr.reviewed_at, s.status as sale_status, s.total
    FROM void_requests vr
    LEFT JOIN sales s ON vr.sale_id = s.id
    WHERE vr.receipt_no IN ('OR-20261108-0129', 'OR-20261108-0130')
    ORDER BY vr.date ASC
");
while ($r = $res->fetch_assoc()) {
    echo "Receipt: {$r['receipt_no']} | VR ID: {$r['vr_id']} | VR Status: {$r['vr_status']} | Sale Status: {$r['sale_status']} | Inventory Restored: {$r['inventory_restored']} | Reviewed: {$r['reviewed_by']} at {$r['reviewed_at']}\n";
}

echo "\n=== PRODUCT STOCK RECONCILIATION ===\n";
// OR-0129 was PRD-002 (Blue, 1L SZ-007)
$p2 = $conn->query("SELECT id, name, stock, can_stock FROM products WHERE id = 'PRD-002'")->fetch_assoc();
$inv2 = $conn->query("SELECT * FROM inventory WHERE size_id = 'SZ-007'")->fetch_assoc();
echo "PRD-002 Stock: {$p2['stock']} L (canStock: {$p2['can_stock']}) | SZ-007 Inventory: {$inv2['sealed_quantity']} units\n";

// OR-0130 was PRD-001 (White, 1L SZ-001)
$p1 = $conn->query("SELECT id, name, stock, can_stock FROM products WHERE id = 'PRD-001'")->fetch_assoc();
$inv1 = $conn->query("SELECT * FROM inventory WHERE size_id = 'SZ-001'")->fetch_assoc();
echo "PRD-001 Stock: {$p1['stock']} L (canStock: {$p1['can_stock']}) | SZ-001 Inventory: {$inv1['sealed_quantity']} units\n";

