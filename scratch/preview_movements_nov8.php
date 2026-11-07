<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
$res = $conn->query("SELECT id, date, type, product_name, qty_change, staff_name, note FROM movements WHERE DATE(date) = '2026-11-08' ORDER BY date ASC");
echo "Total movements on 2026-11-08: " . $res->num_rows . "\n";
while ($r = $res->fetch_assoc()) {
    echo "ID: {$r['id']} | Date: {$r['date']} | Type: {$r['type']} | Change: {$r['qty_change']}L | Note: {$r['note']}\n";
}

