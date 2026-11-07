<?php
/**
 * End-to-end verification of the live MRGR_ColorCenter database and API endpoints
 */
require_once __DIR__ . '/../config/database.php';

$conn = getDBConnection();

echo "====================================================================\n";
echo "MRGR COLOR CENTER: LIVE DATABASE & API SYSTEM VERIFICATION\n";
echo "====================================================================\n\n";

// 1. Check void_requests table
echo "--- 1. Live `void_requests` Table Inspection ---\n";
$vres = $conn->query("SELECT * FROM void_requests ORDER BY date ASC");
$allVRs = [];
while ($r = $vres->fetch_assoc()) {
    $allVRs[] = $r;
    echo "  - VR ID: {$r['id']} | Receipt: {$r['receipt_no']} | Status: {$r['status']} | Restored: {$r['inventory_restored']} | Reviewed: {$r['reviewed_by']}\n";
}
echo "Total void requests in DB: " . count($allVRs) . "\n";

// 2. Check sales table statuses for these receipts
echo "\n--- 2. Live `sales` Table Statuses ---\n";
$sres = $conn->query("SELECT id, receipt_no, total, status, void_request_id, voided_by, void_inventory_restored FROM sales WHERE receipt_no IN ('OR-20261108-0126', 'OR-20261108-0127', 'OR-20261108-0128', 'OR-20261108-0129')");
while ($s = $sres->fetch_assoc()) {
    echo "  - Receipt: {$s['receipt_no']} | Status: '{$s['status']}' | Total: {$s['total']} | Restored: {$s['void_inventory_restored']} | VoidedBy: {$s['voided_by']}\n";
}

// 3. Check collation uniformity
echo "\n--- 3. Database Collations Check ---\n";
$colRes = $conn->query("SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'MRGR_ColorCenter'");
$collations = [];
while ($cr = $colRes->fetch_assoc()) {
    $collations[$cr['TABLE_NAME']] = $cr['TABLE_COLLATION'];
    echo "  - {$cr['TABLE_NAME']}: {$cr['TABLE_COLLATION']}\n";
}
$distinctCollations = array_unique(array_values($collations));
$isUniform = (count($distinctCollations) === 1 && $distinctCollations[0] === 'utf8mb4_unicode_ci');
echo "All tables uniform utf8mb4_unicode_ci? " . ($isUniform ? "YES [PASS]" : "NO [FAIL]") . "\n";

// 4. Test simulate GET api/db.php payload
echo "\n--- 4. Simulate GET api/db.php Data Payload ---\n";
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SESSION['user_id'] = 'u1'; // Admin Mike Revadulla

ob_start();
include __DIR__ . '/../api/db.php';
$jsonOutput = ob_get_clean();

$apiData = json_decode($jsonOutput, true);
if (!$apiData || !isset($apiData['db'])) {
    echo "  [FAIL] api/db.php failed to return valid JSON db structure.\n";
    exit(1);
}

$dbPayload = $apiData['db'];
$apiVRs = $dbPayload['voidRequests'] ?? [];
$apiSales = $dbPayload['sales'] ?? [];

echo "  api/db.php returned " . count($apiVRs) . " void requests and " . count($apiSales) . " sales.\n";

// 5. Test Javascript logic of getPendingVoidRequests() with this exact data
echo "\n--- 5. Evaluating Frontend getPendingVoidRequests() Logic ---\n";
$seenSaleIds = [];
$seenReceiptNos = [];
$resolvedSaleIds = [];
$pendingList = [];

// Step 1: Identify resolved
foreach ($apiVRs as $vr) {
    if ($vr['status'] === 'approved' || $vr['status'] === 'rejected') {
        if (!empty($vr['saleId'])) $resolvedSaleIds[$vr['saleId']] = true;
        if (!empty($vr['receiptNo'])) $resolvedSaleIds[$vr['receiptNo']] = true;
    }
}

// Step 2: Unique pending from voidRequests
foreach ($apiVRs as $vr) {
    if ($vr['status'] === 'pending') {
        $sId = $vr['saleId'] ?? '';
        $rNo = $vr['receiptNo'] ?? '';

        if (!empty($sId) && isset($resolvedSaleIds[$sId])) continue;
        if (!empty($rNo) && isset($resolvedSaleIds[$rNo])) continue;
        if (!empty($sId) && isset($seenSaleIds[$sId])) continue;
        if (!empty($rNo) && isset($seenReceiptNos[$rNo])) continue;

        $pendingList[] = [
            'id' => $vr['id'],
            'receiptNo' => $rNo,
            'saleId' => $sId,
            'total' => $vr['total']
        ];
        if (!empty($sId)) $seenSaleIds[$sId] = true;
        if (!empty($rNo)) $seenReceiptNos[$rNo] = true;
    }
}

// Step 3: From sales
foreach ($apiSales as $s) {
    $rNo = $s['receiptNo'] ?? ($s['receipt_no'] ?? '');
    $sId = $s['id'] ?? '';
    if (isset($resolvedSaleIds[$sId]) || (!empty($rNo) && isset($resolvedSaleIds[$rNo]))) continue;

    $st = strtolower(trim($s['status'] ?? ''));
    if (($st === 'pending_void' || $st === 'pending void approval') && !isset($seenSaleIds[$sId]) && (!empty($rNo) && !isset($seenReceiptNos[$rNo]))) {
        $pendingList[] = [
            'id' => $s['voidRequestId'] ?? ('vr_' . $sId),
            'receiptNo' => $rNo,
            'saleId' => $sId,
            'total' => $s['total']
        ];
        $seenSaleIds[$sId] = true;
        if (!empty($rNo)) $seenReceiptNos[$rNo] = true;
    }
}

echo "Frontend will display exactly " . count($pendingList) . " pending void request(s):\n";
foreach ($pendingList as $item) {
    echo "  -> Receipt: {$item['receiptNo']} | VR ID: {$item['id']} | Total: ₱{$item['total']}\n";
}

if (count($pendingList) === 1 && $pendingList[0]['receiptNo'] === 'OR-20261108-0129') {
    echo "\n>>> VERIFICATION SUCCESSFUL: EXACTLY 1 PENDING REQUEST (OR-20261108-0129) DETECTED! <<<\n";
} else {
    echo "\n>>> VERIFICATION FAILED: Expected 1 pending request for OR-20261108-0129, got " . count($pendingList) . " <<<\n";
    exit(1);
}

