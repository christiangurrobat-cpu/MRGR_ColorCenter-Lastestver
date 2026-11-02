<?php
// Database configuration
define('DB_HOST', '127.0.0.1');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'MRGR_ColorCenter');

// Create database connection
function getDBConnection() {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS);

    if ($conn->connect_error) {
        throw new Exception("Connection failed: " . $conn->connect_error);
    }

    $dbExists = false;
    try {
        if ($conn->select_db(DB_NAME)) {
            $dbExists = true;
        }
    } catch (mysqli_sql_exception $e) {
        $dbExists = false;
    }

    $needsSeed = !$dbExists;
    if ($dbExists) {
        try {
            $chkUsers = $conn->query("SELECT COUNT(*) AS cnt FROM `users`");
            if (!$chkUsers || (int)($chkUsers->fetch_assoc()['cnt'] ?? 0) === 0) {
                $needsSeed = true;
            }
        } catch (Throwable $e) {
            $needsSeed = true;
        }
    }

    // If the database doesn't exist or has no users yet, create it and import schema + seed data
    if ($needsSeed) {
        $conn->query("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $conn->select_db(DB_NAME);

        $schemaFile = __DIR__ . '/../database/schema.sql';
        if (file_exists($schemaFile) && is_readable($schemaFile)) {
            $schema = file_get_contents($schemaFile);
            if ($schema !== false) {
                if ($conn->multi_query($schema)) {
                    do {
                        if ($res = $conn->store_result()) {
                            $res->free();
                        }
                    } while ($conn->more_results() && $conn->next_result());
                }
            }
        }
    }

    $conn->set_charset("utf8mb4");
    return $conn;
}

// Helper function to execute queries
function executeQuery($query, $params = []) {
    $conn = getDBConnection();
    $stmt = $conn->prepare($query);
    
    if (!empty($params)) {
        $types = str_repeat('s', count($params));
        $stmt->bind_param($types, ...$params);
    }
    
    $stmt->execute();
    $result = $stmt->get_result();
    $stmt->close();
    $conn->close();
    
    return $result;
}

// Helper function to get last insert ID
function getLastInsertId($query, $params = []) {
    $conn = getDBConnection();
    $stmt = $conn->prepare($query);
    
    if (!empty($params)) {
        $types = str_repeat('s', count($params));
        $stmt->bind_param($types, ...$params);
    }
    
    $stmt->execute();
    $insertId = $conn->insert_id;
    $stmt->close();
    $conn->close();
    
    return $insertId;
}
?>
