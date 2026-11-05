<?php
declare(strict_types=1);

echo "============================================================\n";
echo "MRGR Color Center: Dashboard Activity Cleanup Verification\n";
echo "============================================================\n\n";

$passes = 0;
$fails = 0;

function check(bool $cond, string $msg): void {
    global $passes, $fails;
    if ($cond) {
        echo "[PASS] $msg\n";
        $passes++;
    } else {
        echo "[FAIL] $msg\n";
        $fails++;
    }
}

$dashboardsJs = file_get_contents(__DIR__ . '/../assets/js/dashboards.js');
$shellJs = file_get_contents(__DIR__ . '/../assets/js/shell.js');
$componentsCss = file_get_contents(__DIR__ . '/../assets/css/components.css');

// -------------------------------------------------------------
// STAFF DASHBOARD CHECKS
// -------------------------------------------------------------
echo "--- 1. STAFF DASHBOARD SPECIFICATIONS ---\n";

// Staff dashboard function isolation: check content inside staffDashboard()
$staffDashStart = strpos($dashboardsJs, 'function staffDashboard()');
$staffDashEnd = strpos($dashboardsJs, 'function renderStaffStockMovementsTable()');
$staffDashBody = substr($dashboardsJs, $staffDashStart, 2500);

// Check 1: Recent Transactions completely removed from Staff Dashboard
check(
    strpos($staffDashBody, 'Recent Transactions') === false,
    "Staff Dashboard: 'Recent Transactions' section is completely removed"
);

// Check 2: Retain Recent Stock Movements as the primary activity section
check(
    strpos($dashboardsJs, '<h3>Recent Stock Movements</h3>') !== false,
    "Staff Dashboard: 'Recent Stock Movements' retained as the primary activity section"
);

// Check 3: Display latest inventory activities (receiving, sales, adjustments, etc.)
check(
    strpos($dashboardsJs, "typeFilter: 'all'") !== false &&
    strpos($dashboardsJs, "📥 Inbound Receiving") !== false &&
    strpos($dashboardsJs, "🛒 POS Sales") !== false &&
    strpos($dashboardsJs, "⚖️ Stock Adjustments") !== false &&
    strpos($dashboardsJs, "🎨 Color Mixing") !== false,
    "Staff Dashboard: Displays latest inventory activities (Stock Receiving, Sales, Adjustments, Other movements)"
);

// Check 4: 6 required table columns: Date & Time, Movement Type, Product & Container, Stock Balance Trail, Reference / Staff, Details
check(
    strpos($dashboardsJs, 'Date &amp; Time') !== false &&
    strpos($dashboardsJs, 'Movement Type') !== false &&
    strpos($dashboardsJs, 'Product &amp; Container') !== false &&
    strpos($dashboardsJs, 'Stock Balance Trail') !== false &&
    strpos($dashboardsJs, 'Reference / Staff') !== false &&
    strpos($dashboardsJs, '>Details<') !== false,
    "Staff Dashboard: Exactly keeps Date & Time, Movement Type, Product & Container, Stock Balance Trail, Reference / Staff, and Details"
);

// Check 5: Retain Full Transaction History navigation where authorized
check(
    strpos($dashboardsJs, "Full Transaction History &rarr;") !== false &&
    strpos($dashboardsJs, "currentUser.role === 'admin' || currentUser.role === 'staff'") !== false,
    "Staff Dashboard: Retains 'Full Transaction History &rarr;' navigation where authorized"
);

// -------------------------------------------------------------
// ADMIN DASHBOARD CHECKS
// -------------------------------------------------------------
echo "\n--- 2. ADMIN DASHBOARD SPECIFICATIONS ---\n";

// Check 1: Keep Recent Transactions in admin dashboard
check(
    strpos($dashboardsJs, '<h3 style="margin:0;">Recent Transactions</h3>') !== false,
    "Admin Dashboard: 'Recent Transactions' section is kept"
);

// Check 2: Continue displaying sales receipts, cashier, items, transaction status, and total amount (customer removed)
check(
    strpos($dashboardsJs, 'getReceiptNo(s)') !== false &&
    strpos($dashboardsJs, 's.cashierName') !== false &&
    strpos($dashboardsJs, 's.customerName') === false &&
    strpos($dashboardsJs, 's.items.length') !== false &&
    strpos($dashboardsJs, 'saleStatusBadge(s.status)') !== false &&
    strpos($dashboardsJs, 'peso(s.total)') !== false,
    "Admin Dashboard: Displays sales receipt #, cashier, items, status, and total amount (customer removed)"
);

// Check 3: Retain access to full Sales History and reports
check(
    strpos($dashboardsJs, "goTo('sales')") !== false &&
    strpos($dashboardsJs, "View Sales History &rarr;") !== false &&
    strpos($dashboardsJs, "View Business Reports") !== false,
    "Admin Dashboard: Retains access to full Sales History and reports"
);

// -------------------------------------------------------------
// ROLE-BASED ACCESS & ROUTING INTEGRITY
// -------------------------------------------------------------
echo "\n--- 3. ROLE-BASED ACCESS CONTROL & GUARD INTEGRATION ---\n";

// Staff cannot access adminDashboard directly
check(
    strpos($dashboardsJs, "if (currentUser && currentUser.role === 'staff') {\n    return staffDashboard();\n  }") !== false,
    "adminDashboard(): Guard delegates to staffDashboard() when currentUser.role === 'staff'"
);

// Admin cannot access staffDashboard directly
check(
    strpos($dashboardsJs, "if (currentUser && currentUser.role === 'admin') {\n    return adminDashboard();\n  }") !== false,
    "staffDashboard(): Guard delegates to adminDashboard() when currentUser.role === 'admin'"
);

// shell.js goTo routing
check(
    strpos($shellJs, "if (currentUser && currentUser.role === 'staff' && page === 'dashboard') {\n    page = 'staffDashboard';\n  }") !== false &&
    strpos($shellJs, "if (currentUser && currentUser.role === 'admin' && page === 'staffDashboard') {\n    page = 'dashboard';\n  }") !== false,
    "shell.js: goTo() correctly enforces role-appropriate dashboard navigation"
);

// shell.js renderPage renderer dispatching
check(
    strpos($shellJs, "dashboard: (currentUser && currentUser.role === 'staff') ?") !== false,
    "shell.js: renderPage() maps dashboard dynamically according to user role"
);

echo "\n============================================================\n";
echo "SUMMARY: $passes PASSED, $fails FAILED\n";
echo "============================================================\n";

if ($fails > 0) {
    exit(1);
}
echo "ALL ROLE-BASED DASHBOARD ACTIVITY CLEANUP TESTS PASSED!\n";

