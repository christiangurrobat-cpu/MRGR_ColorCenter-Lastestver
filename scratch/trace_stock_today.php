<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$movs = $conn->query("SELECT id, date, type, note FROM movements WHERE DATE(date) = '2026-11-08' ORDER BY date ASC, id ASC");
echo "Trace of movements today:\n";
while ($m = $movs->fetch_assoc()) {
    echo "- {$m['date']} | {$m['type']} | {$m['note']}\n";
}

