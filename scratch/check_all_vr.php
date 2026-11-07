<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$res = $conn->query("SELECT id, sale_id, receipt_no, status, inventory_restored, reviewed_by, reviewed_at FROM void_requests ORDER BY id");
while ($r = $res->fetch_assoc()) {
    echo json_encode($r) . "\n";
}

