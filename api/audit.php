<?php
// Audit log API: POST = record an entry, GET = list entries (admin UI).
date_default_timezone_set('Asia/Manila');
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/database.php';

try {
    $conn = getDBConnection();
    $conn->query("CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        created_at DATETIME NOT NULL,
        user_id VARCHAR(64) NULL,
        user_name VARCHAR(255) NULL,
        user_role VARCHAR(32) NULL,
        action VARCHAR(64) NOT NULL,
        entity VARCHAR(64) NULL,
        details TEXT NULL,
        ip_address VARCHAR(64) NULL,
        INDEX idx_created (created_at),
        INDEX idx_action (action),
        INDEX idx_user (user_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $d = json_decode(file_get_contents('php://input'), true) ?: [];
        $now = date('Y-m-d H:i:s');
        $uid = substr((string)($d['userId'] ?? ''), 0, 64);
        $uname = substr((string)($d['userName'] ?? ''), 0, 255);
        $role = substr((string)($d['userRole'] ?? ''), 0, 32);
        $action = substr((string)($d['action'] ?? ''), 0, 64);
        $entity = substr((string)($d['entity'] ?? ''), 0, 64);
        $details = (string)($d['details'] ?? '');
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        if ($action === '') { echo json_encode(['success' => false, 'error' => 'Missing action']); exit; }
        $st = $conn->prepare("INSERT INTO audit_logs (created_at,user_id,user_name,user_role,action,entity,details,ip_address) VALUES (?,?,?,?,?,?,?,?)");
        $st->bind_param('ssssssss', $now, $uid, $uname, $role, $action, $entity, $details, $ip);
        $st->execute();
        echo json_encode(['success' => true]);
        exit;
    }

    $where = []; $types = ''; $params = [];
    if (!empty($_GET['action'])) { $where[] = 'action = ?'; $types .= 's'; $params[] = $_GET['action']; }
    if (!empty($_GET['user'])) { $where[] = 'user_name = ?'; $types .= 's'; $params[] = $_GET['user']; }
    $from = (!empty($_GET['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['from'])) ? $_GET['from'] : null;
    $to = (!empty($_GET['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['to'])) ? $_GET['to'] : null;
    if ($from && $to && $from > $to) {
        $tmp = $from;
        $from = $to;
        $to = $tmp;
    }
    if ($from) { $where[] = 'created_at >= ?'; $types .= 's'; $params[] = $from . ' 00:00:00'; }
    if ($to) { $where[] = 'created_at <= ?'; $types .= 's'; $params[] = $to . ' 23:59:59'; }
    if (!empty($_GET['q'])) {
        $where[] = '(details LIKE ? OR entity LIKE ?)'; $types .= 'ss';
        $like = '%' . $_GET['q'] . '%'; $params[] = $like; $params[] = $like;
    }
    $sql = 'SELECT * FROM audit_logs' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 500';
    $st = $conn->prepare($sql);
    if ($params) $st->bind_param($types, ...$params);
    $st->execute();
    $rows = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    echo json_encode(['success' => true, 'logs' => $rows]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
