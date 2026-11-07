<?php
require_once 'config/database.php';
$c = getDBConnection();

echo "--- 1. Orphaned Movements ---\n";
$res = $c->query("SELECT m.* FROM movements m LEFT JOIN products p ON m.product_id = p.product_id OR m.product_id = p.id WHERE m.product_id IS NOT NULL AND m.product_id != '' AND m.product_id != '0' AND p.id IS NULL AND m.type != 'colormix'");
print_r($res->fetch_all(MYSQLI_ASSOC));

echo "--- 2. Empty or Zero PO Items ---\n";
$res = $c->query("SELECT id, po_number, total_amount, items_json FROM purchase_orders WHERE items_json = '[]' OR items_json IS NULL OR items_json = ''");
$rows = $res->fetch_all(MYSQLI_ASSOC);
echo "Count of POs with empty items: " . count($rows) . "\n";
foreach (array_slice($rows, 0, 5) as $row) {
    echo "  PO: {$row['po_number']}, Total: {$row['total_amount']}, items: {$row['items_json']}\n";
}

echo "--- 3. Audit Logs Sensitive Data or Formatting Issues ---\n";
$res = $c->query("SELECT id, action, details FROM audit_logs WHERE details LIKE '%password%' OR details LIKE '%secret%' LIMIT 5");
print_r($res->fetch_all(MYSQLI_ASSOC));

echo "--- 4. SZ-001 info ---\n";
$res = $c->query("SELECT ps.*, p.name FROM product_sizes ps LEFT JOIN products p ON ps.product_id = p.id OR ps.product_id = p.product_id WHERE ps.size_id = 'SZ-001'");
print_r($res->fetch_all(MYSQLI_ASSOC));

echo "--- 5. Product with ID p11 or PRD-001 ---\n";
$res = $c->query("SELECT id, product_id, name FROM products WHERE id IN ('p1', 'p11', 'PRD-001') OR product_id IN ('p1', 'p11', 'PRD-001')");
print_r($res->fetch_all(MYSQLI_ASSOC));
