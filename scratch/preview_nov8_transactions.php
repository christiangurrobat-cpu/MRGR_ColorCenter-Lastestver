<?php
require_once __DIR__ . '/../config/database.php';

$conn = getDBConnection();
echo "=======================================================\n";
echo "PREVIEW OF NOVEMBER 8, 2026 TRANSACTIONS & RELATED RECORDS\n";
echo "=======================================================\n\n";

$targetDate = '2026-11-08';

// 1. Sales on 2026-11-08
$salesQuery = "SELECT * FROM sales WHERE DATE(date) = '$targetDate' ORDER BY date ASC";
$salesRes = $conn->query($salesQuery);
$sales = [];
while ($row = $salesRes->fetch_assoc()) {
    $sales[] = $row;
}

echo "1. IDENTIFIED SALES TRANSACTIONS (DATE = $targetDate):\n";
echo "Total Found: " . count($sales) . "\n\n";

$saleIds = [];
$receiptNos = [];
$inventoryRestorationPlan = []; // [size_id => ['units' => ..., 'liters' => ..., 'product_id' => ...]]

foreach ($sales as $s) {
    $saleIds[] = $s['id'];
    if (!empty($s['receipt_no'])) {
        $receiptNos[] = $s['receipt_no'];
    }

    echo sprintf("ID: %-15s | Receipt: %-18s | Date: %s | Cashier: %-12s | Status: %-22s | Subtotal: ₱%8.2f | Disc: ₱%6.2f | Total: ₱%8.2f\n",
        $s['id'],
        $s['receipt_no'] ?: 'N/A',
        $s['date'],
        $s['cashier_name'] ?: 'N/A',
        $s['status'],
        $s['subtotal'],
        $s['discount_amount'],
        $s['total']
    );

    $items = json_decode($s['items_json'] ?? '[]', true) ?: [];
    echo "   Items (" . count($items) . "):\n";
    foreach ($items as $it) {
        $name = $it['name'] ?? ($it['productName'] ?? 'Item');
        $qty = (float)($it['qty'] ?? 1);
        $size = (float)($it['size'] ?? 1);
        $lineTot = (float)($it['total'] ?? ($it['price'] * $qty));
        $type = $it['type'] ?? 'product';
        $pid = $it['productId'] ?? ($it['product_id'] ?? null);
        $szId = $it['sizeId'] ?? ($it['size_id'] ?? null);
        echo "     - [{$type}] {$name} ({$size}L) x {$qty} = ₱" . number_format($lineTot, 2) . " (Prod: {$pid}, Size: {$szId})\n";

        // If this sale was NOT voided with inventory restored, the stock deduction needs to be reversed!
        $alreadyRestored = (bool)($s['void_inventory_restored'] ?? false) || strtolower($s['status']) === 'voided';
        if (!$alreadyRestored && $type === 'product' && $pid) {
            $key = $szId ?: ($pid . '_' . $size);
            if (!isset($inventoryRestorationPlan[$key])) {
                $inventoryRestorationPlan[$key] = [
                    'productId' => $pid,
                    'sizeId' => $szId,
                    'containerSize' => $size,
                    'units' => 0,
                    'liters' => 0,
                    'name' => $name
                ];
            }
            $inventoryRestorationPlan[$key]['units'] += (int)$qty;
            $inventoryRestorationPlan[$key]['liters'] += ($qty * $size);
        }
    }
    echo "\n";
}

// 2. Void Requests directly related to Nov 8 sales OR created on Nov 8
$vrSaleList = !empty($saleIds) ? ("'" . implode("','", $saleIds) . "'") : "''";
$vrQuery = "SELECT * FROM void_requests WHERE sale_id IN ($vrSaleList) OR DATE(date) = '$targetDate' OR DATE(created_at) = '$targetDate'";
$vrRes = $conn->query($vrQuery);
$voidRequests = [];
while ($vr = $vrRes->fetch_assoc()) {
    $voidRequests[] = $vr;
}

echo "2. IDENTIFIED VOID REQUESTS (Directly related or created $targetDate):\n";
echo "Total Found: " . count($voidRequests) . "\n";
foreach ($voidRequests as $vr) {
    echo "   - ID: {$vr['id']} | Sale ID: {$vr['sale_id']} | Receipt: {$vr['receipt_no']} | Date: {$vr['date']} | Status: {$vr['status']} | Total: ₱{$vr['total']} | Reason: {$vr['reason']}\n";
}
echo "\n";

// 3. Movements directly related to Nov 8 sales
$recList = !empty($receiptNos) ? ("'" . implode("','", $receiptNos) . "'") : "''";
$movWhere = ["DATE(date) = '$targetDate'"];
if (!empty($receiptNos)) {
    foreach ($receiptNos as $rno) {
        $movWhere[] = "note LIKE '%$rno%'";
    }
}
$movQuery = "SELECT * FROM movements WHERE " . implode(' OR ', $movWhere);
$movRes = $conn->query($movQuery);
$movements = [];
while ($m = $movRes->fetch_assoc()) {
    $movements[] = $m;
}

echo "3. IDENTIFIED STOCK MOVEMENTS (Date $targetDate or matching receipt numbers):\n";
echo "Total Found: " . count($movements) . "\n";
foreach ($movements as $m) {
    echo "   - ID: {$m['id']} | Date: {$m['date']} | Type: {$m['type']} | Product: {$m['product_name']} | Qty Change: {$m['qty_change']}L | Staff: {$m['staff_name']} | Note: " . substr($m['note'], 0, 80) . "...\n";
}
echo "\n";

// 4. Audit Logs directly related to Nov 8 sales
$auditWhere = ["DATE(created_at) = '$targetDate' AND (action LIKE '%SALE%' OR entity LIKE '%Receipt%' OR reference_no IN ($recList))"];
if (!empty($receiptNos)) {
    foreach ($receiptNos as $rno) {
        $auditWhere[] = "reference_no = '$rno' OR details LIKE '%$rno%'";
    }
}
$auditQuery = "SELECT id, created_at, user_name, user_role, action, entity, reference_no, details FROM audit_logs WHERE " . implode(' OR ', $auditWhere);
$auditRes = $conn->query($auditQuery);
$auditLogs = [];
while ($al = $auditRes->fetch_assoc()) {
    $auditLogs[] = $al;
}

echo "4. IDENTIFIED AUDIT LOGS (Related to sales / receipts on $targetDate):\n";
echo "Total Found: " . count($auditLogs) . "\n";
foreach (array_slice($auditLogs, 0, 10) as $al) {
    echo "   - ID: {$al['id']} | {$al['created_at']} | {$al['user_name']} ({$al['user_role']}) | {$al['action']} | Ref: {$al['reference_no']} | " . substr($al['details'], 0, 60) . "...\n";
}
if (count($auditLogs) > 10) {
    echo "   ... and " . (count($auditLogs) - 10) . " more audit log entries.\n";
}
echo "\n";

// 5. Inventory Restoration Summary
echo "5. INVENTORY QUANTITY RESTORATION SUMMARY (If approved):\n";
echo "Total Items Needing Stock Restoration: " . count($inventoryRestorationPlan) . "\n";
foreach ($inventoryRestorationPlan as $key => $plan) {
    echo "   - {$plan['name']} (Size: {$plan['containerSize']}L): +{$plan['units']} sealed units (+{$plan['liters']}L total stock)\n";
}

// 6. Historical Data Preservation Check (Before 2026-11-08)
$histSalesCount = $conn->query("SELECT COUNT(*) AS c FROM sales WHERE DATE(date) < '$targetDate'")->fetch_assoc()['c'];
$futureSalesCount = $conn->query("SELECT COUNT(*) AS c FROM sales WHERE DATE(date) > '$targetDate'")->fetch_assoc()['c'];

echo "\n6. HISTORICAL DATA PRESERVATION CHECK:\n";
echo "Sales transactions prior to $targetDate: $histSalesCount (WILL BE PRESERVED 100%)\n";
echo "Sales transactions after $targetDate   : $futureSalesCount\n";

