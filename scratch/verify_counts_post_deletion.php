<?php
require_once __DIR__ . '/../config/database.php';
$conn = getDBConnection();

$todayCount = $conn->query("SELECT COUNT(*) AS c FROM sales WHERE DATE(date) = '2026-11-08'")->fetch_assoc()['c'];
$histCount = $conn->query("SELECT COUNT(*) AS c FROM sales WHERE DATE(date) < '2026-11-08'")->fetch_assoc()['c'];
$futureCount = $conn->query("SELECT COUNT(*) AS c FROM sales WHERE DATE(date) > '2026-11-08'")->fetch_assoc()['c'];
$totalSales = $conn->query("SELECT COUNT(*) AS c FROM sales")->fetch_assoc()['c'];

echo "Sales count verification:\n";
echo "- Sales on 2026-11-08: $todayCount\n";
echo "- Sales prior to 2026-11-08: $histCount\n";
echo "- Sales after 2026-11-08: $futureCount\n";
echo "- Total Sales remaining: $totalSales\n";

$vrCount = $conn->query("SELECT COUNT(*) AS c FROM void_requests")->fetch_assoc()['c'];
echo "- Remaining void requests: $vrCount\n";

$movCount = $conn->query("SELECT COUNT(*) AS c FROM movements")->fetch_assoc()['c'];
echo "- Remaining movements: $movCount\n";

$p = $conn->query("SELECT stock, can_stock FROM products WHERE id = 'PRD-001'")->fetch_assoc();
$inv = $conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = 'SZ-001'")->fetch_assoc();
echo "- Product PRD-001 stock: {$p['stock']} L\n";
echo "- Size SZ-001 sealed_quantity: {$inv['sealed_quantity']} units\n";
echo "- can_stock JSON: {$p['can_stock']}\n";

