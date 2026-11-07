<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
$res = $conn->query("SELECT id, name, price, recent_price, pending_price, pending_edit FROM products");
while ($r = $res->fetch_assoc()) {
    echo sprintf("%-10s | %-30s | Price: %7.2f | Recent: %s | Pending: %s | Edit: %s\n",
        $r['id'],
        substr($r['name'], 0, 30),
        $r['price'],
        $r['recent_price'] !== null ? $r['recent_price'] : 'NULL',
        $r['pending_price'] !== null ? $r['pending_price'] : 'NULL',
        !empty($r['pending_edit']) ? 'YES' : 'NONE'
    );
}

