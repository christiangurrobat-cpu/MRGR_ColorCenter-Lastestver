<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

echo "=== FOREIGN KEYS & CONSTRAINTS ===\n";
$res = $conn->query("
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'MRGR_ColorCenter' AND REFERENCED_TABLE_NAME IS NOT NULL
");
while ($r = $res->fetch_assoc()) {
    echo "{$r['TABLE_NAME']}.{$r['COLUMN_NAME']} -> {$r['REFERENCED_TABLE_NAME']}.{$r['REFERENCED_COLUMN_NAME']} ({$r['CONSTRAINT_NAME']})\n";
}

echo "\n=== TABLE PRIMARY KEYS ===\n";
$resPk = $conn->query("
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'MRGR_ColorCenter' AND CONSTRAINT_NAME = 'PRIMARY'
");
while ($r = $resPk->fetch_assoc()) {
    echo "{$r['TABLE_NAME']} PRIMARY KEY: {$r['COLUMN_NAME']}\n";
}

