<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
$tables = [];
$res = $conn->query("SHOW TABLES");
while ($r = $res->fetch_row()) {
    $tables[] = $r[0];
}
echo "Tables in DB:\n";
foreach ($tables as $t) {
    $cntRes = $conn->query("SELECT COUNT(*) FROM `$t`");
    $cnt = $cntRes ? $cntRes->fetch_row()[0] : 'err';
    echo sprintf(" - %-25s : %s rows\n", $t, $cnt);
}

