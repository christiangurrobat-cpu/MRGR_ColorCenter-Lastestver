<?php
require_once __DIR__ . '/../config/database.php';

echo "=== MIGRATING SALES TABLE (REMOVING CUSTOMER, DISCOUNT, PAYMENT) ===\n";
$conn = getDBConnection();

$cols = [];
$res = $conn->query("SHOW COLUMNS FROM sales");
while ($r = $res->fetch_assoc()) {
    $cols[] = $r['Field'];
}
echo "Current sales columns: " . implode(', ', $cols) . "\n";

// Ensure subtotal and total are consistent
$conn->query("UPDATE sales SET total = subtotal WHERE total = 0 OR total IS NULL");

$dropCols = ['customer_name', 'discount_pct', 'discount', 'cash_tendered', 'change_amount', 'payment_method'];
foreach ($dropCols as $col) {
    if (in_array($col, $cols)) {
        echo "Dropping column '$col' from sales...\n";
        $ok = $conn->query("ALTER TABLE sales DROP COLUMN `$col`");
        if (!$ok) {
            echo "Error dropping $col: " . $conn->error . "\n";
        } else {
            echo "Successfully dropped $col.\n";
        }
    } else {
        echo "Column '$col' not present in sales.\n";
    }
}

$newCols = [];
$res2 = $conn->query("SHOW COLUMNS FROM sales");
while ($r = $res2->fetch_assoc()) {
    $newCols[] = $r['Field'];
}
echo "New sales columns: " . implode(', ', $newCols) . "\n";

// Count sales records
$cntRes = $conn->query("SELECT COUNT(*) AS cnt, SUM(subtotal) AS sum_sub, SUM(total) AS sum_tot FROM sales");
$row = $cntRes->fetch_assoc();
echo "Sales count: {$row['cnt']}, Sum subtotal: {$row['sum_sub']}, Sum total: {$row['sum_tot']}\n";
echo "=== MIGRATION COMPLETED SUCCESSFULLY ===\n";
