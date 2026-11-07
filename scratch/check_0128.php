<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$res = $conn->query("SELECT * FROM movements WHERE note LIKE '%OR-20261108-0128%'");
echo "Movements for OR-20261108-0128:\n";
while ($r = $res->fetch_assoc()) {
    echo "  - Type: {$r['type']} | Qty: {$r['qty_change']} | Note: {$r['note']}\n";
}

$res2 = $conn->query("SELECT * FROM audit_logs WHERE reference_no = 'OR-20261108-0128' ORDER BY created_at DESC");
echo "\nAudit logs for OR-20261108-0128:\n";
while ($r = $res2->fetch_assoc()) {
    echo "  - {$r['created_at']} | Action: {$r['action']} | NewVal: {$r['new_value']} | Details: {$r['details']}\n";
}

