<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();
$res = $conn->query("SELECT id, username, password FROM users");
$candidates = ['admin', 'admin123', 'admin2026', 'password', 'password123', 'mrgr', 'mrgr123', 'cashier', 'cashier123', 'staff', 'staff123'];
while ($r = $res->fetch_assoc()) {
    $found = null;
    foreach ($candidates as $cand) {
        if (password_verify($cand, $r['password']) || $cand === $r['password']) {
            $found = $cand;
            break;
        }
    }
    echo "User {$r['username']} ({$r['id']}): password is " . ($found ? "'$found'" : "unknown") . "\n";
}

