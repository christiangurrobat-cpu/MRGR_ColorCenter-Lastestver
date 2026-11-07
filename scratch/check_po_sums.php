<?php
require_once 'config/database.php';
$conn = getDBConnection();

$res = $conn->query("SELECT id, po_number, total_amount, items_json FROM purchase_orders");
$poMismatches = [];
$emptyItems = [];
$validMatches = 0;

while ($r = $res->fetch_assoc()) {
    $items = json_decode($r['items_json'] ?? '[]', true) ?: [];
    if (empty($items)) {
        $emptyItems[] = $r['po_number'];
        continue;
    }
    $sum = 0;
    foreach ($items as $it) {
        $unitCost = (float)($it['unitCost'] ?? ($it['price'] ?? ($it['cost'] ?? 0)));
        $sum += (float)($it['total'] ?? (($it['qty'] ?? 0) * $unitCost));
    }
    if (abs((float)$r['total_amount'] - $sum) > 0.05) {
        $poMismatches[] = ['po' => $r['po_number'], 'total' => $r['total_amount'], 'sum' => $sum];
    } else {
        $validMatches++;
    }
}

echo "PO Analysis:\n";
echo "  Valid line-item matches: $validMatches\n";
echo "  Empty items POs (historical headers): " . count($emptyItems) . " -> " . implode(', ', $emptyItems) . "\n";
echo "  True mismatches: " . count($poMismatches) . "\n";
foreach ($poMismatches as $m) {
    echo "    PO: {$m['po']}, DB total: {$m['total']}, line sum: {$m['sum']}\n";
}

