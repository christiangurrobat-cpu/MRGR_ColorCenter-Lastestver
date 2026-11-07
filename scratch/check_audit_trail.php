<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$res = $conn->query("
    SELECT created_at, user_name, action, reference_no, old_value, new_value, details 
    FROM audit_logs 
    WHERE reference_no IN ('OR-20261108-0129', 'OR-20261108-0130')
    ORDER BY id ASC
");
echo "=== AUDIT LOG TRAIL FOR 0129 & 0130 ===\n";
while ($r = $res->fetch_assoc()) {
    echo "[{$r['created_at']}] {$r['user_name']} -> {$r['action']} ({$r['reference_no']}): {$r['old_value']} -> {$r['new_value']}\n";
    echo "  Details: {$r['details']}\n";
}

