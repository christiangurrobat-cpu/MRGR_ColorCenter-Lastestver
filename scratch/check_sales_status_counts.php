<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$res = $conn->query("SELECT status, COUNT(*) as cnt FROM sales GROUP BY status");
echo "Sales statuses in MRGR_ColorCenter:\n";
while ($r = $res->fetch_assoc()) {
    echo "  - Status '{$r['status']}': {$r['cnt']} sales\n";
}

