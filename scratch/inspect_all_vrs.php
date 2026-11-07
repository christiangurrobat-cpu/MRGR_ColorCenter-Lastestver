<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$res = $conn->query("
    SELECT vr.id, vr.sale_id, vr.receipt_no, vr.status, vr.reviewed_by, vr.reviewed_at, s.status as sale_status
    FROM void_requests vr
    LEFT JOIN sales s ON vr.sale_id = s.id
    ORDER BY vr.receipt_no, vr.date
");
while ($r = $res->fetch_assoc()) {
    echo json_encode($r) . "\n";
}

