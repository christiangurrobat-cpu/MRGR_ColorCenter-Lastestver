<?php
date_default_timezone_set('Asia/Manila');

// Database configuration
define('DB_HOST', '127.0.0.1');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'MRGR_ColorCenter');

// Enable transparent gzip compression for API JSON responses when supported by client
function mrgrEnableGzip() {
    static $started = false;
    if ($started || headers_sent() || PHP_SAPI === 'cli') return;
    $started = true;
    $accept = (string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '');
    if (stripos($accept, 'gzip') !== false && function_exists('ob_gzhandler') && !ini_get('zlib.output_compression')) {
        @ob_start('ob_gzhandler');
    }
}

// Create or reuse database connection (per-request singleton; avoids repeated TCP handshakes and per-request COUNT(*) scans)
function getDBConnection($forceNew = false) {
    static $sharedConn = null;

    if (!$forceNew && $sharedConn instanceof mysqli) {
        try {
            if (@$sharedConn->thread_id && @$sharedConn->ping()) {
                return $sharedConn;
            }
        } catch (Throwable $e) {
            $sharedConn = null;
        }
    }

    $readyFlag = __DIR__ . '/../api/.db_ready_v1';
    $conn = null;
    $dbExists = false;

    // Fast path: connect directly to DB_NAME without separate select_db() or SELECT COUNT(*) FROM users
    try {
        $conn = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
        if ($conn && !$conn->connect_error) {
            $dbExists = true;
        }
    } catch (Throwable $e) {
        $conn = null;
        $dbExists = false;
    }

    if (!$dbExists) {
        $conn = new mysqli(DB_HOST, DB_USER, DB_PASS);
        if ($conn->connect_error) {
            throw new Exception("Connection failed: " . $conn->connect_error);
        }
        try {
            if ($conn->select_db(DB_NAME)) {
                $dbExists = true;
            }
        } catch (mysqli_sql_exception $e) {
            $dbExists = false;
        }
    }

    $needsSeed = !$dbExists;
    if ($dbExists && !file_exists($readyFlag)) {
        try {
            $chkUsers = $conn->query("SELECT 1 FROM `users` LIMIT 1");
            if (!$chkUsers || $chkUsers->num_rows === 0) {
                $needsSeed = true;
            } else {
                @file_put_contents($readyFlag, date('Y-m-d H:i:s'));
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
                        if ($conn->errno) {
                            error_log("Schema seed warning: " . $conn->error);
                        }
                    } while ($conn->more_results() && $conn->next_result());
                } else {
                    error_log("Schema seed failed: " . $conn->error);
                }
            }
        }
        @file_put_contents($readyFlag, date('Y-m-d H:i:s'));
    }

    $conn->set_charset("utf8mb4");
    if (!$forceNew) {
        $sharedConn = $conn;
    }
    return $conn;
}

// Helper function to execute queries (reuses shared per-request connection)
function executeQuery($query, $params = []) {
    $conn = getDBConnection();
    $stmt = $conn->prepare($query);
    if (!$stmt) {
        throw new Exception("Prepare failed: " . $conn->error);
    }

    if (!empty($params)) {
        $types = str_repeat('s', count($params));
        $stmt->bind_param($types, ...$params);
    }

    $stmt->execute();
    $result = $stmt->get_result();
    $stmt->close();

    return $result;
}

// Helper function to get last insert ID (reuses shared per-request connection)
function getLastInsertId($query, $params = []) {
    $conn = getDBConnection();
    $stmt = $conn->prepare($query);
    if (!$stmt) {
        throw new Exception("Prepare failed: " . $conn->error);
    }

    if (!empty($params)) {
        $types = str_repeat('s', count($params));
        $stmt->bind_param($types, ...$params);
    }

    $stmt->execute();
    $insertId = $conn->insert_id;
    $stmt->close();

    return $insertId;
}
?>
