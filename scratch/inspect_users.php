<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
$res = $conn->query("SELECT id, username, name, role, status FROM users");
while ($r = $res->fetch_assoc()) {
    echo json_encode($r) . "\n";
}

