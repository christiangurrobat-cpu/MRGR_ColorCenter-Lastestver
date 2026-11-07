<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$res = $conn->query("
    SELECT TABLE_NAME, TABLE_COLLATION 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = 'MRGR_ColorCenter'
");
while ($r = $res->fetch_assoc()) {
    echo "{$r['TABLE_NAME']}: {$r['TABLE_COLLATION']}\n";
}

