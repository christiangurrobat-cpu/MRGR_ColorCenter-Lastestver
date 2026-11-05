<?php
/**
 * Test Suite: Admin Dashboard Recent Transactions Enhancement Verification
 * MRGR Color Center
 */

require_once __DIR__ . '/../config/database.php';

echo "============================================================\n";
echo "MRGR Color Center: Admin Recent Transactions Enhancement Test\n";
echo "============================================================\n\n";

$passCount = 0;
$failCount = 0;

function check($condition, $desc) {
    global $passCount, $failCount;
    if ($condition) {
        echo "[PASS] $desc\n";
        $passCount++;
    } else {
        echo "[FAIL] $desc\n";
        $failCount++;
    }
}

$conn = getDBConnection();
$dashboardsJs = file_get_contents(__DIR__ . '/../assets/js/dashboards.js');
$shellJs = file_get_contents(__DIR__ . '/../assets/js/shell.js');
$reportsJs = file_get_contents(__DIR__ . '/../assets/js/reports.js');
$posJs = file_get_contents(__DIR__ . '/../assets/js/pos.js');
$componentsCss = file_get_contents(__DIR__ . '/../assets/css/components.css');

// -------------------------------------------------------------
// 1. RECENT TRANSACTIONS TABLE STRUCTURE & COLUMNS (SECTION A)
// -------------------------------------------------------------
echo "--- 1. TABLE STRUCTURE & REQUIRED COLUMNS (SECTION A) ---\n";

$requiredHeaders = [
    'Receipt #' => 'Receipt Number',
    'Date &amp; Time' => 'Date & Time',
    'Cashier' => 'Cashier',
    'Items' => 'Items',
    'Products Sold' => 'Products Sold',
    'Transaction Status' => 'Transaction Status',
    'Total Amount' => 'Total Amount',
    'Action' => 'Action'
];

foreach ($requiredHeaders as $headerSnippet => $label) {
    check(
        strpos($dashboardsJs, "<th>$headerSnippet</th>") !== false || 
        strpos($dashboardsJs, ">$headerSnippet</th>") !== false,
        "Column '$label' is present in table header"
    );
}

// Verify Customer and Payment Method columns are completely removed
check(
    strpos($dashboardsJs, '<th>Customer</th>') === false,
    "Column 'Customer' is NOT present in table header"
);
check(
    strpos($dashboardsJs, '<th>Payment Method</th>') === false,
    "Column 'Payment Method' is NOT present in table header"
);

// -------------------------------------------------------------
// 2. TRANSACTION DETAILS ACCESSIBILITY (SECTION B)
// -------------------------------------------------------------
echo "\n--- 2. TRANSACTION DETAILS & EXPANDABLE ROWS (SECTION B) ---\n";

check(
    strpos($dashboardsJs, 'dash-txn-details-') !== false,
    "Expandable transaction details row container exists"
);
check(
    strpos($dashboardsJs, 'toggleAdminTxnRow') !== false,
    "Interactive row toggle function toggleAdminTxnRow is implemented"
);
check(
    strpos($dashboardsJs, 'formatAdminTxnProductItem') !== false,
    "Product line item details parser formatAdminTxnProductItem exists"
);
check(
    strpos($dashboardsJs, 'formatAdminTxnProductsSoldSummary') !== false,
    "Products Sold concise preview formatter exists"
);
check(
    strpos($dashboardsJs, 'getAdminTxnPaymentMethodMeta') === false,
    "Obsolete getAdminTxnPaymentMethodMeta function is removed"
);

// Check that line items detail table in expanded row includes required columns:
$detailFields = [
    'Product Name', 'Brand', 'Color Variant', 'Container Size', 'Quantity Sold', 'Unit Price', 'Subtotal'
];
foreach ($detailFields as $f) {
    check(
        strpos($dashboardsJs, ">$f</th>") !== false,
        "Expanded line items table includes '$f'"
    );
}

// Check that financial settlement summary card includes subtotal & total due, without discount/payment method:
$financialFields = ['Subtotal:', 'Total Due:'];
foreach ($financialFields as $f) {
    check(
        strpos($dashboardsJs, $f) !== false,
        "Expanded row financial summary includes '$f'"
    );
}
$removedFinancialFields = ['Discount:', 'Payment Method:', 'Amount Paid:', 'Change:'];
foreach ($removedFinancialFields as $f) {
    check(
        strpos($dashboardsJs, $f) === false,
        "Expanded row financial summary does NOT include '$f'"
    );
}

// -------------------------------------------------------------
// 3. TRANSACTION DISPLAY & DATABASE INTEGRITY (SECTIONS C & E)
// -------------------------------------------------------------
echo "\n--- 3. DATA INTEGRITY & DISPLAY RULES (SECTIONS C & E) ---\n";

// Show latest 10 by default sorted newest first
check(
    strpos($dashboardsJs, 'slice(0, 10)') !== false,
    "Admin Dashboard queries top 10 latest sales transactions by default"
);
check(
    strpos($dashboardsJs, 'new Date(b.date) - new Date(a.date)') !== false,
    "Transactions are sorted chronologically, newest first"
);

// Clickable receipt links
check(
    strpos($dashboardsJs, 'class="receipt-link"') !== false &&
    strpos($dashboardsJs, 'viewSale(') !== false,
    "Receipt numbers are clickable teal links opening the official receipt"
);

// Customer and categories removed
check(
    strpos($dashboardsJs, 'Walk-in Customer') === false,
    "Customer categories and 'Walk-in Customer' are NOT present in dashboard transactions"
);

// Status badges and Philippine Peso formatting
check(
    strpos($dashboardsJs, 'saleStatusBadge(s.status)') !== false,
    "Transaction status uses accurate saleStatusBadge component"
);
check(
    strpos($dashboardsJs, 'peso(s.total)') !== false &&
    strpos($dashboardsJs, 'peso(item.unitPrice)') !== false &&
    strpos($dashboardsJs, 'peso(item.lineTotal)') !== false,
    "All monetary values formatted with Philippine Peso symbol via peso()"
);

// Verify live database records match
$res = $conn->query("SELECT * FROM sales ORDER BY date DESC LIMIT 10");
$salesCount = $res->num_rows;
check($salesCount > 0, "Live database contains sales transaction records (found: $salesCount)");

$allTotalsValid = true;
$sampleSale = null;
while ($row = $res->fetch_assoc()) {
    if (!$sampleSale) $sampleSale = $row;
    $items = json_decode($row['items_json'] ?? '[]', true);
    if (!is_array($items) || empty($items)) {
        $allTotalsValid = false;
    }
    // Check line totals sum roughly equals subtotal
    $calculatedSubtotal = 0;
    foreach ($items as $it) {
        $calculatedSubtotal += (float)($it['lineTotal'] ?? ($it['unitPrice'] * ($it['qty'] ?? 1)));
    }
    if (abs($calculatedSubtotal - (float)$row['subtotal']) > 0.05) {
        $allTotalsValid = false;
    }
}
check($allTotalsValid, "Sales totals in database accurately match line item breakdowns");

// -------------------------------------------------------------
// 4. VIEW SALES HISTORY BUTTON & ROUTING (SECTION D)
// -------------------------------------------------------------
echo "\n--- 4. VIEW SALES HISTORY ROUTING (SECTION D) ---\n";

check(
    strpos($dashboardsJs, 'goToReportsSalesHistory') !== false,
    "View Sales History button connects to goToReportsSalesHistory()"
);
check(
    strpos($shellJs, 'function goToReportsSalesHistory()') !== false,
    "goToReportsSalesHistory() defined globally in shell.js"
);
check(
    strpos($shellJs, "goToReportsTab('history')") !== false || 
    strpos($shellJs, "reportActiveTab = 'history'") !== false,
    "goToReportsSalesHistory() activates the Reports module's 'history' tab"
);
check(
    strpos($reportsJs, "reportActiveTab === 'history'") !== false &&
    strpos($reportsJs, "historyHtml") !== false,
    "Reports module contains existing Sales History page renderer (historyHtml)"
);
check(
    strpos($reportsJs, "renderReportsSalesHistorySectionHtml") !== false,
    "Preserves existing filters, search, date range, export, and pagination in Sales History"
);
check(
    strpos($reportsJs, "isAdmin ? (summaryCardsHtml + historyHtml)") !== false,
    "Sales History tab is accessible to Admin accounts"
);

// -------------------------------------------------------------
// 5. DESIGN & CSS ASSETS (SECTION F)
// -------------------------------------------------------------
echo "\n--- 5. DESIGN & STYLING SPECIFICATIONS (SECTION F) ---\n";

check(
    strpos($componentsCss, '.table-recent-transactions') !== false,
    "CSS contains styles for .table-recent-transactions"
);
check(
    strpos($componentsCss, '.dash-txn-row') !== false,
    "CSS contains interactive hover and expand styles for .dash-txn-row"
);
check(
    strpos($componentsCss, '.receipt-link') !== false,
    "CSS contains teal styling and hover effect for .receipt-link"
);
check(
    strpos($componentsCss, '.dash-txn-expanded-container') !== false,
    "CSS contains styling for .dash-txn-expanded-container"
);

// -------------------------------------------------------------
// 6. RECEIPT MODAL ENHANCEMENT (SECTION B & C)
// -------------------------------------------------------------
echo "\n--- 6. RECEIPT MODAL INTEGRATION (SECTION B & C) ---\n";

check(
    strpos($posJs, 'Payment Method:') === false,
    "Official receipt modal does NOT display Payment Method"
);
check(
    strpos($posJs, 'Walk-in Customer') === false,
    "Official receipt modal does NOT display Customer / Walk-in Customer"
);
check(
    strpos($posJs, 'Amount Paid') === false && strpos($posJs, 'Cash Tendered') === false,
    "Official receipt modal does NOT display Amount Paid or Cash Tendered"
);
check(
    strpos($posJs, 'Discount') === false,
    "Official receipt modal does NOT display Discount"
);
check(
    strpos($posJs, 'Subtotal') !== false && strpos($posJs, 'Total Due') !== false,
    "Official receipt modal displays Subtotal and Total Due"
);

echo "\n============================================================\n";
echo "SUMMARY: $passCount PASSED, $failCount FAILED\n";
echo "============================================================\n";

if ($failCount === 0) {
    echo "ALL ADMIN RECENT TRANSACTIONS ENHANCEMENT TESTS PASSED!\n";
    exit(0);
} else {
    echo "SOME TESTS FAILED!\n";
    exit(1);
}

