<?php
require_once 'config/database.php';
$conn = getDBConnection();

// 1. Check orphaned product_sizes
$res = $conn->query("SELECT ps.size_id, ps.product_id FROM product_sizes ps LEFT JOIN products p ON ps.product_id = p.product_id OR ps.product_id = p.id WHERE p.id IS NULL");
$orphanedSizes = $res->fetch_all(MYSQLI_ASSOC);
echo "Orphaned product_sizes: " . count($orphanedSizes) . "\n";

// 2. Check orphaned inventory records
$res = $conn->query("SELECT inv.inventory_id, inv.size_id FROM inventory inv LEFT JOIN product_sizes ps ON inv.size_id = ps.size_id WHERE ps.size_id IS NULL");
$orphanedInv = $res->fetch_all(MYSQLI_ASSOC);
echo "Orphaned inventory: " . count($orphanedInv) . "\n";

// 3. Check movements with invalid product_id
$res = $conn->query("SELECT m.id, m.product_id, m.type FROM movements m LEFT JOIN products p ON m.product_id = p.product_id OR m.product_id = p.id WHERE m.product_id IS NOT NULL AND m.product_id != '' AND m.product_id != '0' AND p.id IS NULL AND m.type != 'colormix'");
$orphanedMovements = $res->fetch_all(MYSQLI_ASSOC);
echo "Orphaned movements (non-mix): " . count($orphanedMovements) . "\n";

// 4. Check negative stock quantities in inventory table
$res = $conn->query("SELECT * FROM inventory WHERE sealed_quantity < 0 OR opened_quantity < 0 OR remaining_volume < 0");
$negativeInv = $res->fetch_all(MYSQLI_ASSOC);
echo "Negative inventory records: " . count($negativeInv) . "\n";

// 5. Check negative stock quantities in products table
$res = $conn->query("SELECT id, name, stock, opened_stock FROM products WHERE stock < 0 OR opened_stock < 0");
$negativeProd = $res->fetch_all(MYSQLI_ASSOC);
echo "Negative product stock: " . count($negativeProd) . "\n";

// 6. Check container sizes vs stock liters consistency
$res = $conn->query("SELECT p.id, p.product_id, p.name, p.stock, SUM(inv.sealed_quantity * ps.container_size) as calculated_liters
                     FROM products p
                     JOIN product_sizes ps ON ps.product_id = p.product_id OR ps.product_id = p.id
                     JOIN inventory inv ON inv.size_id = ps.size_id
                     GROUP BY p.id");
$mismatches = [];
while ($r = $res->fetch_assoc()) {
    $diff = abs((float)$r['stock'] - (float)$r['calculated_liters']);
    if ($diff > 0.01) {
        $mismatches[] = $r;
    }
}
echo "Stock liters vs sum(cans * size) mismatches: " . count($mismatches) . "\n";
foreach ($mismatches as $m) {
    echo "  Mismatch on " . $m['id'] . " (" . $m['name'] . "): products.stock=" . $m['stock'] . " vs calculated=" . $m['calculated_liters'] . "\n";
}

// 7. Check sales table subtotal vs total consistency
$res = $conn->query("SELECT id, receipt_no, subtotal, total FROM sales WHERE ABS(subtotal - total) > 0.01");
$salesMismatches = $res->fetch_all(MYSQLI_ASSOC);
echo "Sales subtotal vs total mismatches: " . count($salesMismatches) . "\n";

// 8. Check sales table line item sum vs subtotal
$res = $conn->query("SELECT id, receipt_no, subtotal, items_json FROM sales");
$lineMismatches = [];
while ($r = $res->fetch_assoc()) {
    $items = json_decode($r['items_json'] ?? '[]', true) ?: [];
    $sum = 0;
    foreach ($items as $it) {
        $sum += (float)($it['lineTotal'] ?? (($it['qty'] ?? 1) * ($it['unitPrice'] ?? 0)));
    }
    if (abs((float)$r['subtotal'] - $sum) > 0.05) {
        $lineMismatches[] = ['id' => $r['id'], 'receipt' => $r['receipt_no'], 'subtotal' => $r['subtotal'], 'sum' => $sum];
    }
}
echo "Sales items lineTotal sum vs subtotal mismatches: " . count($lineMismatches) . "\n";

// 9. Check purchase_orders table item sum vs total_amount
$res = $conn->query("SELECT id, po_number, total_amount, items_json FROM purchase_orders");
$poMismatches = [];
while ($r = $res->fetch_assoc()) {
    $items = json_decode($r['items_json'] ?? '[]', true) ?: [];
    if (empty($items)) continue; // historical summary headers
    $sum = 0;
    foreach ($items as $it) {
        $cost = (float)($it['unitCost'] ?? ($it['price'] ?? 0));
        $sum += (float)($it['total'] ?? (($it['qty'] ?? 0) * $cost));
    }
    if (abs((float)$r['total_amount'] - $sum) > 0.05) {
        $poMismatches[] = ['id' => $r['id'], 'po' => $r['po_number'], 'total' => $r['total_amount'], 'sum' => $sum];
    }
}
echo "PO items total sum vs total_amount mismatches: " . count($poMismatches) . "\n";
?>