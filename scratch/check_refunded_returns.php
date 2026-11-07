<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
$res = $conn->query("SELECT receipt_no, returns_json FROM sales WHERE receipt_no IN ('OR-20261108-0124', 'OR-20261108-0125', 'OR-20261108-0133')");
while ($r = $res->fetch_assoc()) {
    echo "Receipt: {$r['receipt_no']}\n";
    echo "Returns JSON: {$r['returns_json']}\n\n";
}

