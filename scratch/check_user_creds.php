<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
$res = $conn->query("SELECT id, username, password, name, role, status FROM users");
while ($r = $res->fetch_assoc()) {
    echo "ID: {$r['id']} | User: {$r['username']} | Name: {$r['name']} | Role: {$r['role']} | Status: {$r['status']} | Pass starts with: " . substr($r['password'], 0, 10) . "...\n";
}

