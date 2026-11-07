<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$tables = ['void_requests', 'adjustment_requests', 'audit_logs'];
foreach ($tables as $t) {
    $conn->query("ALTER TABLE `$t` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "Converted $t to utf8mb4_unicode_ci\n";
}

