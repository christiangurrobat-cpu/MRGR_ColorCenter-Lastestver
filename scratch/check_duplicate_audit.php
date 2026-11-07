<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$res = $conn->query("
    SELECT action, reference_no, COUNT(*) as cnt 
    FROM audit_logs 
    WHERE action LIKE '%VOID%' 
    GROUP BY action, reference_no 
    HAVING cnt > 1
");
echo "Duplicate void audit logs:\n";
$found = 0;
while ($r = $res->fetch_assoc()) {
    $found++;
    echo "  - Action: {$r['action']}, Ref: {$r['reference_no']} (Count: {$r['cnt']})\n";
}
if (!$found) echo "  None found.\n";

