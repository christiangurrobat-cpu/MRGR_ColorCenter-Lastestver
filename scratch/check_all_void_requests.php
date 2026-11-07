<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$res = $conn->query("SELECT vr.*, s.receipt_no AS s_receipt, s.date AS s_date FROM void_requests vr LEFT JOIN sales s ON vr.sale_id = s.id");
while ($r = $res->fetch_assoc()) {
    echo "ID: {$r['id']} | Sale ID: {$r['sale_id']} | VR Receipt: {$r['receipt_no']} | VR Date: {$r['date']} | Sale Date: {$r['s_date']} | Status: {$r['status']}\n";
}

