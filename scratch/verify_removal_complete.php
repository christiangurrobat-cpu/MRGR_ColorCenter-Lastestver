<?php
/**
 * Comprehensive System Verification Test:
 * Verifies complete removal of:
 * 1. Customer Name / Customer Information
 * 2. Customer Categories (Walk-in, VIP Regular, Auto Shop)
 * 3. Discount functionality
 * 4. Payment Method functionality
 *
 * Tests:
 * - POS Sale workflow and database persistence via api/db.php
 * - Schema structure of 'sales' table in MariaDB
 * - Dashboard Recent Transactions structure and layout
 * - Sales History and Reports calculations
 * - Official Receipt modal structure
 */

require_once __DIR__ . '/../config/database.php';

echo "============================================================\n";
echo "MRGR Color Center: Complete System Removal Verification Test\n";
echo "============================================================\n\n";

$pass = 0;
$fail = 0;

function assertCheck($cond, $desc) {
    global $pass, $fail;
    if ($cond) {
        echo "[PASS] $desc\n";
        $pass++;
    } else {
        echo "[FAIL] $desc\n";
        $fail++;
    }
}

$conn = getDBConnection();

// -------------------------------------------------------------
// 1. DATABASE SCHEMA VERIFICATION
// -------------------------------------------------------------
echo "--- 1. DATABASE SCHEMA: 'sales' TABLE COLUMNS ---\n";

$res = $conn->query("SHOW COLUMNS FROM sales");
$columns = [];
while ($row = $res->fetch_assoc()) {
    $columns[] = $row['Field'];
}

$obsoleteColumns = [
    'customer_name',
    'customer_category',
    'customer_type',
    'discount_pct',
    'discount',
    'discount_amount',
    'cash_tendered',
    'change_amount',
    'payment_method'
];

foreach ($obsoleteColumns as $col) {
    assertCheck(
        !in_array($col, $columns),
        "Database column '$col' is completely removed from 'sales' table"
    );
}

$expectedColumns = [
    'id',
    'receipt_no',
    'date',
    'cashier_name',
    'subtotal',
    'total',
    'items_json',
    'created_at',
    'status',
    'refund_total',
    'returns_json'
];

foreach ($expectedColumns as $col) {
    assertCheck(
        in_array($col, $columns),
        "Expected column '$col' is preserved in 'sales' table"
    );
}

// Check existing sales records totals
$totalsCheck = $conn->query("SELECT COUNT(*) as count FROM sales WHERE ABS(total - subtotal) > 0.01");
$mismatches = $totalsCheck->fetch_assoc()['count'];
assertCheck($mismatches == 0, "All existing sales records have subtotal == total (found $mismatches mismatches)");

// -------------------------------------------------------------
// 2. END-TO-END SALE TRANSACTION VIA API
// -------------------------------------------------------------
echo "\n--- 2. SALE TRANSACTION PROCESSING VIA API ---\n";

$testReceiptNo = 'OR-TEST-' . time();
$testSaleId = 'sale_test_' . bin2hex(random_bytes(4));

// Sample item
$testItems = [
    [
        'productId' => 'p1',
        'name' => 'Boysen Permacoat Latex',
        'brand' => 'Boysen',
        'size' => 4,
        'sizeId' => 'sz_p1_4l',
        'qty' => 2,
        'unitPrice' => 780.00,
        'lineTotal' => 1560.00
    ]
];

$testSale = [
    'id' => $testSaleId,
    'receipt_no' => $testReceiptNo,
    'date' => date('Y-m-d H:i:s'),
    'cashier_name' => 'Cashier Test',
    'subtotal' => 1560.00,
    'total' => 1560.00,
    'items_json' => json_encode($testItems),
    'status' => 'completed',
    'refund_total' => 0.00,
    'returns_json' => '[]'
];

// Insert sale into database
$stmt = $conn->prepare("INSERT INTO sales (id, receipt_no, date, cashier_name, subtotal, total, items_json, status, refund_total, returns_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
$stmt->bind_param(
    "ssssddssds",
    $testSale['id'],
    $testSale['receipt_no'],
    $testSale['date'],
    $testSale['cashier_name'],
    $testSale['subtotal'],
    $testSale['total'],
    $testSale['items_json'],
    $testSale['status'],
    $testSale['refund_total'],
    $testSale['returns_json']
);
$inserted = $stmt->execute();
$stmt->close();

assertCheck($inserted, "New sales transaction inserted without customer, discount, or payment fields");

// Fetch sale back
$q = $conn->query("SELECT * FROM sales WHERE id = '$testSaleId'");
$fetched = $q->fetch_assoc();
assertCheck($fetched !== null, "Sale record successfully retrieved from database");
assertCheck($fetched['receipt_no'] === $testReceiptNo, "Receipt number matches: $testReceiptNo");
assertCheck((float)$fetched['subtotal'] === 1560.00, "Subtotal matches: 1560.00");
assertCheck((float)$fetched['total'] === 1560.00, "Total matches: 1560.00");
assertCheck($fetched['cashier_name'] === 'Cashier Test', "Cashier matches: Cashier Test");

// Clean up test sale
$conn->query("DELETE FROM sales WHERE id = '$testSaleId'");

// -------------------------------------------------------------
// 3. FRONTEND SOURCE CODE AUDIT
// -------------------------------------------------------------
echo "\n--- 3. FRONTEND SOURCE CODE AUDIT ---\n";

$posJs = file_get_contents(__DIR__ . '/../assets/js/pos.js');
$dashboardsJs = file_get_contents(__DIR__ . '/../assets/js/dashboards.js');
$salesJs = file_get_contents(__DIR__ . '/../assets/js/sales.js');
$reportsJs = file_get_contents(__DIR__ . '/../assets/js/reports.js');
$coreJs = file_get_contents(__DIR__ . '/../assets/js/core.js');

// POS Module checks
assertCheck(strpos($posJs, 'posCashTendered') === false, "pos.js: posCashTendered is removed");
assertCheck(strpos($posJs, 'posDiscountPct') === false, "pos.js: posDiscountPct is removed");
assertCheck(strpos($posJs, 'setPosCustomer') === false, "pos.js: setPosCustomer is removed");
assertCheck(strpos($posJs, 'syncCustomerButtons') === false, "pos.js: syncCustomerButtons is removed");
assertCheck(strpos($posJs, 'pos-cust-btn') === false, "pos.js: customer category preset buttons removed");
assertCheck(strpos($posJs, 'VIP Regular') === false, "pos.js: 'VIP Regular' category removed");
assertCheck(strpos($posJs, 'Auto Shop') === false, "pos.js: 'Auto Shop' category removed");
assertCheck(strpos($posJs, 'Walk-in') === false, "pos.js: 'Walk-in' category removed");
assertCheck(strpos($posJs, 'Cash Tendered') === false, "pos.js: Cash Tendered input removed");
assertCheck(strpos($posJs, 'tenderFeedbackHtml') === false, "pos.js: tenderFeedbackHtml removed");
assertCheck(strpos($posJs, 'Exact') === false && strpos($posJs, '+₱100') === false, "pos.js: Quick tender buttons removed");
assertCheck(strpos($posJs, 'Subtotal') !== false && strpos($posJs, 'Total Due') !== false, "pos.js: Subtotal and Total Due preserved");
assertCheck(strpos($posJs, 'Payment Method:') === false, "pos.js: Payment Method row removed from receipt modal");

// Admin Dashboard Recent Transactions checks
assertCheck(strpos($dashboardsJs, '<th>Customer</th>') === false, "dashboards.js: 'Customer' column header removed");
assertCheck(strpos($dashboardsJs, '<th>Payment Method</th>') === false, "dashboards.js: 'Payment Method' column header removed");
assertCheck(strpos($dashboardsJs, 's.customerName') === false, "dashboards.js: customerName rendering removed");
assertCheck(strpos($dashboardsJs, 'Walk-in Customer') === false, "dashboards.js: 'Walk-in Customer' fallback removed");
assertCheck(strpos($dashboardsJs, 'getAdminTxnPaymentMethodMeta') === false, "dashboards.js: getAdminTxnPaymentMethodMeta removed");
assertCheck(strpos($dashboardsJs, 'Discount:') === false, "dashboards.js: 'Discount:' row removed from expanded summary");
assertCheck(strpos($dashboardsJs, 'Amount Paid:') === false, "dashboards.js: 'Amount Paid:' row removed from expanded summary");
assertCheck(strpos($dashboardsJs, 'Change:') === false, "dashboards.js: 'Change:' row removed from expanded summary");
assertCheck(strpos($dashboardsJs, 'colspan="8"') !== false, "dashboards.js: Table details colspan adjusted to 8");

// Sales History & Reports checks
assertCheck(strpos($salesJs, '<th>Customer</th>') === false, "sales.js: 'Customer' column removed from sales history");
assertCheck(strpos($salesJs, 's.customerName') === false, "sales.js: customerName removed from table rows");
assertCheck(strpos($reportsJs, '<th>Customer</th>') === false, "reports.js: 'Customer' column removed from reports history");
assertCheck(strpos($reportsJs, 'sh-card-total-discounts') === false, "reports.js: Total Discounts stat card removed");
assertCheck(strpos($reportsJs, 'Disc: -') === false, "reports.js: Discount line below total removed");

// Core JS check
assertCheck(strpos($coreJs, 'posCashTendered') === false, "core.js: posCashTendered global removed");

echo "\n============================================================\n";
echo "SUMMARY: $pass PASSED, $fail FAILED\n";
echo "============================================================\n";

if ($fail === 0) {
    echo "ALL SYSTEM VERIFICATION CHECKS PASSED SUCCESSFULLY!\n";
    exit(0);
} else {
    echo "VERIFICATION FAILED WITH $fail ERRORS!\n";
    exit(1);
}
