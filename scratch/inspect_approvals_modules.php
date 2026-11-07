<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

echo "=== 1. STOCK ADJUSTMENT REQUESTS IN DB ===\n";
$resAdj = $conn->query("SELECT id, req_number, date, requested_by, role, status, reviewed_by, reviewed_at, rows_json FROM adjustment_requests ORDER BY date DESC");
$adjCount = 0;
$pendingAdj = 0;
while ($r = $resAdj->fetch_assoc()) {
    $adjCount++;
    if ($r['status'] === 'pending') $pendingAdj++;
    $rows = json_decode($r['rows_json'], true) ?: [];
    echo "ID: {$r['id']} | Req#: {$r['req_number']} | Date: {$r['date']} | Status: {$r['status']} | By: {$r['requested_by']} | ReviewedBy: {$r['reviewed_by']} | Rows: " . count($rows) . "\n";
}
echo "Total adjustments: $adjCount (Pending: $pendingAdj)\n";

echo "\n=== 2. PRODUCT & PRICING PENDING APPROVALS IN DB ===\n";
$resProd = $conn->query("SELECT id, name, status, price, pending_price, pending_sizes, pending_edit FROM products WHERE status = 'pending_approval' OR pending_price IS NOT NULL OR pending_sizes IS NOT NULL OR pending_edit IS NOT NULL");
$pendingProdCount = 0;
while ($r = $resProd->fetch_assoc()) {
    $pendingProdCount++;
    echo "ID: {$r['id']} | Name: {$r['name']} | Status: {$r['status']} | Price: {$r['price']} | PendingPrice: {$r['pending_price']} | PendingSizes: {$r['pending_sizes']} | PendingEdit: {$r['pending_edit']}\n";
}
echo "Total pending product/pricing requests: $pendingProdCount\n";

echo "\n=== 3. PURCHASE ORDERS PENDING AUTHORIZATION IN DB ===\n";
$resPO = $conn->query("SELECT id, po_number, supplier_name, order_date, status, total_amount, created_by FROM purchase_orders WHERE status = 'pending' ORDER BY order_date DESC");
$pendingPOCount = 0;
while ($r = $resPO->fetch_assoc()) {
    $pendingPOCount++;
    echo "ID: {$r['id']} | PO#: {$r['po_number']} | Supplier: {$r['supplier_name']} | Status: {$r['status']} | Total: {$r['total_amount']} | CreatedBy: {$r['created_by']}\n";
}
echo "Total pending purchase orders: $pendingPOCount\n";

echo "\nAll PO statuses:\n";
$resAllPO = $conn->query("SELECT status, COUNT(*) as cnt FROM purchase_orders GROUP BY status");
while ($r = $resAllPO->fetch_assoc()) {
    echo "  - Status '{$r['status']}': {$r['cnt']} POs\n";
}

