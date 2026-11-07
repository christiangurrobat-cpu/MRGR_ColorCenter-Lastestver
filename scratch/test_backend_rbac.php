<?php
require_once 'config/database.php';

// Try to inject an unauthorized user without currentUser admin credentials
$payload = [
    'db' => [
        'users' => [
            [
                'id' => 'u_test_unauth',
                'username' => 'unauth_user',
                'password' => '123',
                'name' => 'Unauth',
                'role' => 'admin',
                'status' => 'active'
            ]
        ]
    ]
];

$ctx = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => 'Content-Type: application/json',
        'content' => json_encode($payload),
        'ignore_errors' => true
    ]
]);

$url = (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] != 80) ? 'http://127.0.0.1:' . $_SERVER['SERVER_PORT'] . '/api/db.php' : 'http://127.0.0.1:8000/api/db.php';
$response = @file_get_contents($url, false, $ctx);
$conn = getDBConnection();
$chk = $conn->query("SELECT * FROM users WHERE id = 'u_test_unauth'")->fetch_assoc();

echo "Unauthenticated user sync attempt: " . ($chk ? "FAILED (Vulnerable)" : "PASSED (Blocked & Secure)") . "\n";

