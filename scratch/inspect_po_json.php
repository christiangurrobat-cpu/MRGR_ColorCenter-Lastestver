<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
$r = $conn->query("SELECT po_number, total_amount, items_json FROM purchase_orders WHERE po_number = 'PO-20261017-0002'")->fetch_assoc();
echo "PO: " . $r['po_number'] . " Total: " . $r['total_amount'] . "\n";
echo "Items JSON:\n" . $r['items_json'] . "\n";

