<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
$res = $conn->query("SELECT * FROM product_sizes LIMIT 5");
while ($r = $res->fetch_assoc()) {
    echo json_encode($r) . "\n";
}

