<?php
date_default_timezone_set('Asia/Manila');
header('Content-Type: application/json; charset=utf-8');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/database.php';

try {
    $conn = getDBConnection();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? '';

// POST: Login endpoint
if ($action === 'login') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
        exit;
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: [];
    $username = trim((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');

    if ($username === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Username and password are required.']);
        exit;
    }

    $stmt = $conn->prepare("SELECT id, username, password, name, role, status FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1");
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error during authentication.']);
        exit;
    }

    $stmt->bind_param("s", $username);
    $stmt->execute();
    $res = $stmt->get_result();
    $user = $res->fetch_assoc();
    $stmt->close();

    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Incorrect username or password.']);
        exit;
    }

    if ($user['status'] !== 'active') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'This account has been deactivated. Contact the administrator.']);
        exit;
    }

    $storedHash = (string)$user['password'];
    $isValid = false;

    // Verify bcrypt hash or migrate legacy plaintext credentials
    if (password_verify($password, $storedHash)) {
        $isValid = true;
        if (password_needs_rehash($storedHash, PASSWORD_BCRYPT)) {
            $newHash = password_hash($password, PASSWORD_BCRYPT);
            $upStmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
            if ($upStmt) {
                $upStmt->bind_param("ss", $newHash, $user['id']);
                $upStmt->execute();
                $upStmt->close();
            }
        }
    } elseif ($password === $storedHash) {
        // Plaintext match: seamlessly upgrade to bcrypt in database
        $isValid = true;
        $newHash = password_hash($password, PASSWORD_BCRYPT);
        $upStmt = $conn->prepare("UPDATE users SET password = ? WHERE id = ?");
        if ($upStmt) {
            $upStmt->bind_param("ss", $newHash, $user['id']);
            $upStmt->execute();
            $upStmt->close();
        }
    }

    if (!$isValid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Incorrect username or password.']);
        exit;
    }

    // Set server-side session
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['name'] = $user['name'];
    $_SESSION['role'] = $user['role'];

    $safeUser = [
        'id' => $user['id'],
        'username' => $user['username'],
        'name' => $user['name'],
        'role' => $user['role'],
        'status' => $user['status']
    ];

    echo json_encode([
        'success' => true,
        'user' => $safeUser
    ]);
    exit;
}

// GET: Session status check endpoint
if ($action === 'session' || $action === 'check') {
    $userId = $_SESSION['user_id'] ?? null;
    if (!$userId) {
        echo json_encode(['success' => true, 'authenticated' => false]);
        exit;
    }

    $stmt = $conn->prepare("SELECT id, username, name, role, status FROM users WHERE id = ? LIMIT 1");
    if ($stmt) {
        $stmt->bind_param("s", $userId);
        $stmt->execute();
        $res = $stmt->get_result();
        $user = $res->fetch_assoc();
        $stmt->close();

        if ($user && $user['status'] === 'active') {
            $_SESSION['username'] = $user['username'];
            $_SESSION['name'] = $user['name'];
            $_SESSION['role'] = $user['role'];

            echo json_encode([
                'success' => true,
                'authenticated' => true,
                'user' => $user
            ]);
            exit;
        }
    }

    // Clear stale or deactivated session
    unset($_SESSION['user_id'], $_SESSION['username'], $_SESSION['name'], $_SESSION['role']);
    session_destroy();
    echo json_encode(['success' => true, 'authenticated' => false]);
    exit;
}

// POST: Verify administrator credentials for sensitive actions (e.g. Void Sale)
if ($action === 'verify_admin') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
        exit;
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: [];
    $username = trim((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');

    if ($username === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Admin username and password are required.']);
        exit;
    }

    $stmt = $conn->prepare("SELECT id, username, password, name, role, status FROM users WHERE LOWER(username) = LOWER(?) AND role = 'admin' LIMIT 1");
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error during admin verification.']);
        exit;
    }

    $stmt->bind_param("s", $username);
    $stmt->execute();
    $res = $stmt->get_result();
    $user = $res->fetch_assoc();
    $stmt->close();

    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid administrator credentials.']);
        exit;
    }

    if ($user['status'] !== 'active') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Administrator account is inactive.']);
        exit;
    }

    $storedHash = (string)$user['password'];
    $isValid = false;
    if (password_verify($password, $storedHash) || $password === $storedHash) {
        $isValid = true;
    }

    if (!$isValid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Incorrect administrator password.']);
        exit;
    }

    // Return admin info without altering cashier/staff session
    echo json_encode([
        'success' => true,
        'admin' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'name' => $user['name']
        ]
    ]);
    exit;
}

// POST: Logout endpoint
if ($action === 'logout') {
    unset($_SESSION['user_id'], $_SESSION['username'], $_SESSION['name'], $_SESSION['role']);
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'error' => 'Invalid action parameter.']);
exit;
