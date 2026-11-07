<?php
require_once __DIR__ . '/../config/database.php';

try {
    $conn = getDBConnection();
    echo "Connected to DB: " . DB_NAME . "\n\n";

    echo "=== TABLES AND RECORD COUNTS ===\n";
    $tablesRes = $conn->query("SHOW TABLES");
    $tables = [];
    while ($row = $tablesRes->fetch_row()) {
        $tables[] = $row[0];
    }

    foreach ($tables as $table) {
        $cntRes = $conn->query("SELECT COUNT(*) AS c FROM `$table`");
        $cnt = $cntRes ? $cntRes->fetch_assoc()['c'] : 'ERR';
        echo sprintf("%-30s : %s rows\n", $table, $cnt);
    }

    echo "\n=== FOREIGN KEYS ===\n";
    $fkRes = $conn->query("
        SELECT 
            TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
        FROM
            INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE
            TABLE_SCHEMA = '" . DB_NAME . "' AND REFERENCED_TABLE_NAME IS NOT NULL
    ");
    while ($fk = $fkRes->fetch_assoc()) {
        echo "{$fk['TABLE_NAME']}.{$fk['COLUMN_NAME']} -> {$fk['REFERENCED_TABLE_NAME']}.{$fk['REFERENCED_COLUMN_NAME']} ({$fk['CONSTRAINT_NAME']})\n";
    }

    echo "\n=== USERS & ROLES ===\n";
    $users = $conn->query("SELECT id, username, role, status FROM users");
    while ($u = $users->fetch_assoc()) {
        echo "User {$u['id']}: {$u['username']} (Role: {$u['role']}, Status: {$u['status']})\n";
    }

} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}

