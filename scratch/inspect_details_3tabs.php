<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

echo "=== DETAIL 1: ADJ-2026-0012 (STOCK ADJUSTMENT) ===\n";
$rAdj = $conn->query("SELECT * FROM adjustment_requests WHERE req_number = 'ADJ-2026-0012'")->fetch_assoc();
if ($rAdj) {
    echo "ID: {$rAdj['id']} | Req: {$rAdj['req_number']} | Date: {$rAdj['date']} | Status: {$rAdj['status']} | RequestedBy: {$rAdj['requested_by']}\n";
    $rows = json_decode($rAdj['rows_json'], true);
    print_r($rows);
} else {
    echo "Not found!\n";
}

echo "\n=== DETAIL 2: PRD-004 (PRODUCT & PRICING REQUEST) ===\n";
$rProd = $conn->query("SELECT id, name, brand, type, color, price, recent_price, pending_price, pending_sizes, pending_edit FROM products WHERE id = 'PRD-004'")->fetch_assoc();
if ($rProd) {
    echo "ID: {$rProd['id']} | Name: {$rProd['name']} | Price: {$rProd['price']} | PendingPrice: {$rProd['pending_price']}\n";
    $edit = json_decode($rProd['pending_edit'], true);
    print_r($edit);
} else {
    echo "Not found!\n";
}

echo "\n=== DETAIL 3: PO-20261108-0059 (PURCHASE ORDER AWAITING AUTHORIZATION) ===\n";
$rPO = $conn->query("SELECT * FROM purchase_orders WHERE po_number = 'PO-20261108-0059'")->fetch_assoc();
if ($rPO) {
    echo "ID: {$rPO['id']} | PO: {$rPO['po_number']} | Supplier: {$rPO['supplier_name']} | Status: {$rPO['status']} | Total: {$rPO['total_amount']} | CreatedBy: {$rPO['created_by']}\n";
    $poItems = json_decode($rPO['items_json'], true);
    print_r($poItems);
} else {
    echo "Not found!\n";
}

