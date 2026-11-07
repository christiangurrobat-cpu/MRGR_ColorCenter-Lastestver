<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
$res = $conn->query("SHOW COLUMNS FROM movements");
while ($r = $res->fetch_assoc()) {
    echo "movements: {$r['Field']} ({$r['Type']})\n";
}

