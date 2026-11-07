<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$backupFile = __DIR__ . '/../backups/MRGR_ColorCenter_pre_nov8_deletion_' . date('Ymd_His') . '.sql';
$tables = ['adjustment_requests', 'audit_logs', 'inventory', 'movements', 'product_sizes', 'products', 'purchase_orders', 'sales', 'suppliers', 'users', 'void_requests'];

$fp = fopen($backupFile, 'w');
fwrite($fp, "-- MRGR_ColorCenter Safety Backup Before November 8, 2026 Transactions Deletion\n");
fwrite($fp, "-- Generated: " . date('Y-m-d H:i:s') . "\n\n");
fwrite($fp, "SET FOREIGN_KEY_CHECKS=0;\n\n");

foreach ($tables as $t) {
    fwrite($fp, "-- Table: `$t`\n");
    $create = $conn->query("SHOW CREATE TABLE `$t`")->fetch_assoc()['Create Table'];
    fwrite($fp, "DROP TABLE IF EXISTS `$t`;\n" . $create . ";\n\n");

    $rows = $conn->query("SELECT * FROM `$t`");
    if ($rows && $rows->num_rows > 0) {
        fwrite($fp, "INSERT INTO `$t` VALUES \n");
        $first = true;
        while ($r = $rows->fetch_row()) {
            if (!$first) fwrite($fp, ",\n");
            $first = false;
            $vals = array_map(function($v) use ($conn) {
                if ($v === null) return "NULL";
                return "'" . $conn->real_escape_string($v) . "'";
            }, $r);
            fwrite($fp, "(" . implode(", ", $vals) . ")");
        }
        fwrite($fp, ";\n\n");
    }
}

fwrite($fp, "SET FOREIGN_KEY_CHECKS=1;\n");
fclose($fp);

echo "Safety backup created successfully: " . basename($backupFile) . " (" . filesize($backupFile) . " bytes)\n";

