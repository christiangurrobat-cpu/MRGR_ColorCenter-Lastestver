<?php
require_once __DIR__ . '/../config/database.php';
$conn = new mysqli(DB_HOST, DB_USER, DB_PASS);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

$testDb = 'mrgr_test_audit';
$conn->query("CREATE DATABASE IF NOT EXISTS `$testDb` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$conn->select_db($testDb);

// Copy tables and data from MRGR_ColorCenter
$tables = ['products', 'product_sizes', 'inventory', 'suppliers', 'purchase_orders', 'sales', 'users', 'movements', 'adjustment_requests', 'audit_logs', 'void_requests'];

foreach ($tables as $t) {
    $conn->query("DROP TABLE IF EXISTS `$testDb`.`$t`");
    $conn->query("CREATE TABLE `$testDb`.`$t` LIKE `MRGR_ColorCenter`.`$t`");
    $conn->query("INSERT INTO `$testDb`.`$t` SELECT * FROM `MRGR_ColorCenter`.`$t`");
    $cnt = $conn->query("SELECT COUNT(*) FROM `$testDb`.`$t`")->fetch_row()[0];
    echo "Cloned table $t: $cnt rows\n";
}

echo "Test database $testDb created and seeded successfully!\n";

