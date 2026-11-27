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

function logFailedLoginAudit($conn, $attemptedUsername, $matchedUser = null, $reason = 'Invalid credentials') {
    try {
        $now = date('Y-m-d H:i:s');
        $cleanUser = substr(trim((string)$attemptedUsername), 0, 120);
        $uid = ($matchedUser && !empty($matchedUser['id'])) ? substr((string)$matchedUser['id'], 0, 64) : '';
        $uname = ($matchedUser && !empty($matchedUser['name']))
            ? substr((string)$matchedUser['name'], 0, 255)
            : ($cleanUser !== '' ? substr($cleanUser, 0, 255) : 'Unknown User');
        $role = ($matchedUser && !empty($matchedUser['role'])) ? substr((string)$matchedUser['role'], 0, 32) : 'unauthenticated';
        $actionCode = 'LOGIN_FAILED';
        $entity = 'Authentication';
        $entityName = $cleanUser !== '' ? "Login Attempt (@{$cleanUser})" : 'Login Attempt';
        $fieldChanged = 'Sign-in Credentials';
        $oldVal = 'Unauthenticated';
        $newVal = 'Authentication Blocked';
        $details = "Failed sign-in attempt for username \"{$cleanUser}\" — {$reason}";
        $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);

        $st = $conn->prepare("INSERT INTO audit_logs (
            created_at, user_id, user_name, user_role, action, entity,
            entity_name, field_changed, old_value, new_value, reason, details, ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        if ($st) {
            $st->bind_param(
                'sssssssssssss',
                $now, $uid, $uname, $role, $actionCode, $entity,
                $entityName, $fieldChanged, $oldVal, $newVal, $reason, $details, $ip
            );
            $st->execute();
            $st->close();
        }
    } catch (Throwable $e) {
        // Never block auth response if audit insert fails
    }
}

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
        logFailedLoginAudit($conn, $username, null, 'Invalid username or password');
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Incorrect username or password.']);
        exit;
    }

    if ($user['status'] !== 'active') {
        logFailedLoginAudit($conn, $username, $user, 'Attempted sign-in to deactivated account');
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'This account has been deactivated. Contact the administrator.']);
        exit;
    }

    $storedHash = (string)$user['password'];
    $isValid = false;

    // Verify bcrypt hash or migrate legacy plaintext credentials (never accept a hash string as password)
    $hashInfo = password_get_info($storedHash);
    if (($hashInfo['algo'] ?? null) !== null) {
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
        }
    } elseif ($storedHash !== '' && hash_equals($storedHash, $password)) {
        // Legacy plaintext match: seamlessly upgrade to bcrypt in database
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
        logFailedLoginAudit($conn, $username, $user, 'Invalid password');
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Incorrect username or password.']);
        exit;
    }

    // Prevent session fixation
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
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

    if (empty($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Authentication required.']);
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

    if (!$user || $user['status'] !== 'active') {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid administrator credentials.']);
        exit;
    }

    $storedHash = (string)$user['password'];
    $isValid = false;
    $hashInfo = password_get_info($storedHash);
    if (($hashInfo['algo'] ?? null) !== null) {
        if (password_verify($password, $storedHash)) {
            $isValid = true;
        }
    } elseif ($storedHash !== '' && hash_equals($storedHash, $password)) {
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
        echo json_encode(['success' => false, 'error' => 'Invalid administrator credentials.']);
        exit;
    }

    // Issue a short-lived server-side authorization token for sensitive actions (returns/refunds)
    $verifyToken = bin2hex(random_bytes(24));
    $_SESSION['admin_verify_token'] = [
        'token' => $verifyToken,
        'adminId' => $user['id'],
        'adminName' => $user['name'],
        'expiresAt' => time() + 600
    ];

    // Return admin info without altering cashier/staff session
    echo json_encode([
        'success' => true,
        'verifyToken' => $verifyToken,
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
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
        exit;
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            $params['secure'],
            $params['httponly']
        );
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'error' => 'Invalid action parameter.']);
exit;
