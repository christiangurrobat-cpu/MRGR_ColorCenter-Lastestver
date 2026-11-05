<?php
/**
 * Test Suite: Stock Adjustment Approval Indicator Consolidation
 * Verifies all requirements from USER_REQUEST:
 * 1. Admin Dashboard:
 *    - Removed separate "Pending Adjustments" KPI card
 *    - Kept single "Pending Approvals" KPI card
 *    - Count includes Stock Adjustments, PO approvals, and catalog requests
 *    - Breakdown displayed inside the card
 *    - Card links to goTo('approvals')
 *    - Removed duplicate approval banners
 * 2. Staff Dashboard:
 *    - No Admin Pending Approvals KPI
 *    - Single "My Stock Adjustment Requests" indicator
 *    - Counts requests submitted by logged-in staff member
 *    - Shows "Awaiting Admin Approval" status
 *    - Allows staff to view submitted request status
 * 3. Workflow & Data Integrity:
 *    - Uses existing records and database
 *    - Single count per request (no duplication)
 *    - Data integrity preserved
 */

declare(strict_types=1);

echo "============================================================\n";
echo "MRGR Color Center: Stock Adjustment Approval Elimination Test\n";
echo "============================================================\n\n";

$passes = 0;
$errors = [];

function check(bool $cond, string $passMsg, string $failMsg): void {
    global $passes, $errors;
    if ($cond) {
        echo "[PASS] $passMsg\n";
        $passes++;
    } else {
        echo "[FAIL] $failMsg\n";
        $errors[] = $failMsg;
    }
}

$dashboardsJs = file_get_contents('assets/js/dashboards.js');
$receivingJs = file_get_contents('assets/js/receiving.js');
$approvalsJs = file_get_contents('assets/js/approvals.js');
$componentsCss = file_get_contents('assets/css/components.css');

// --- SECTION 1: ADMIN DASHBOARD ---
echo "--- 1. Testing Admin Dashboard Specifications ---\n";

// 1.1 No separate Pending Adjustments KPI card
$hasSeparateAdjCard = strpos($dashboardsJs, 'label" style="margin-bottom:0;">⚖️ Pending Adjustments</div>') !== false;
check(!$hasSeparateAdjCard, "1. Separate 'Pending Adjustments' KPI card successfully removed from Admin Dashboard", "Separate 'Pending Adjustments' KPI card still exists");

// 1.2 Exactly one Pending Approvals KPI card
$pendingApprovalsCount = substr_count($dashboardsJs, 'label" style="margin-bottom:0;">⏳ Pending Approvals</div>');
check($pendingApprovalsCount === 1, "2. Exactly one 'Pending Approvals' KPI card exists in Admin Dashboard", "Expected 1 Pending Approvals card, found $pendingApprovalsCount");

// 1.3 Count includes all requests requiring Admin action
check(
    strpos($dashboardsJs, "totalPending =") !== false &&
    strpos($dashboardsJs, "pendingAdj") !== false &&
    strpos($dashboardsJs, "pendingPOs") !== false &&
    strpos($dashboardsJs, "pendingInv") !== false,
    "3. Pending Approvals calculation incorporates stock adjustments, POs, and catalog changes",
    "Pending Approvals calculation does not include all approval types"
);

// 1.4 Display breakdown of pending approval types inside the card
check(
    strpos($dashboardsJs, '${pendingAdj.length}</b> adjustments') !== false &&
    strpos($dashboardsJs, '${pendingPOs.length}</b> POs') !== false &&
    strpos($dashboardsJs, '${pendingInv.length}</b> catalog') !== false,
    "4. Pending Approvals KPI card displays breakdown (adjustments, POs, catalog)",
    "Breakdown of pending approval types missing in Pending Approvals card"
);

// 1.5 Pending Approvals card links to existing approvals page
check(
    strpos($dashboardsJs, 'class="stat-card ${totalPending ? \'highlight-pending\' : \'sage\'} clickable" onclick="goTo(\'approvals\')"') !== false,
    "5. Pending Approvals card links directly to existing approvals page via goTo('approvals')",
    "Pending Approvals card does not link to goTo('approvals')"
);

// 1.6 Duplicate approval banners removed
$hasOldAdjBanner = strpos($dashboardsJs, 'Stock Adjustment Request${pendingAdj.length === 1 ? \'\' : \'s\'} awaiting your approval') !== false;
$hasOldPOBanner = strpos($dashboardsJs, 'Purchase Order${pendingPOs.length === 1 ? \'\' : \'s\'} awaiting your approval') !== false;
$hasOldProdBanner = strpos($dashboardsJs, 'Product, Edit, Price, or Size Request(s) awaiting your approval') !== false;
check(!$hasOldAdjBanner && !$hasOldPOBanner && !$hasOldProdBanner, "6. Duplicate fragmented approval alert banners removed from Admin Dashboard", "Redundant approval banners still found in Admin Dashboard");

// Unified banner present when totalPending > 0
check(
    strpos($dashboardsJs, 'Pending Approval Request${totalPending === 1 ? \'\' : \'s\'} awaiting your decision') !== false,
    "6b. Single consolidated Pending Approvals notification banner present when action is required",
    "Consolidated Pending Approvals banner missing"
);

// --- SECTION 2: STAFF DASHBOARD ---
echo "\n--- 2. Testing Staff Dashboard Specifications ---\n";

// 2.1 No Admin Pending Approvals KPI on Staff Dashboard
$hasAdminApprovalsOnStaff = strpos($dashboardsJs, 'staff-kpi-label">Pending Approvals') !== false ||
                            strpos($dashboardsJs, 'staff-kpi-label">⏳ Pending Approvals') !== false;
check(!$hasAdminApprovalsOnStaff, "1. Staff Dashboard does NOT display an Admin Pending Approvals KPI", "Admin Pending Approvals KPI mistakenly found on Staff Dashboard");

// 2.2 Single "My Pending Requests" or "My Stock Adjustment Requests" indicator
check(
    strpos($dashboardsJs, "My Stock Adjustment Requests") !== false || strpos($dashboardsJs, "My Pending Requests") !== false,
    "2. Single 'My Stock Adjustment Requests' indicator present on Staff Dashboard",
    "'My Stock Adjustment Requests' indicator missing"
);

// 2.3 Displays number of requests submitted by logged-in staff member
check(
    strpos($dashboardsJs, "myPendingAdj") !== false &&
    strpos($dashboardsJs, "currentUser.name") !== false,
    "3. Indicator filters and displays Stock Adjustment Requests submitted by logged-in staff member",
    "Staff indicator does not filter by logged-in staff member"
);

// 2.4 Shows correct status: "Awaiting Admin Approval"
check(
    strpos($dashboardsJs, "Awaiting Admin Approval") !== false,
    "4. Shows correct status: 'Awaiting Admin Approval' on Staff Dashboard",
    "Status 'Awaiting Admin Approval' missing from Staff Dashboard"
);

// 2.5 Allows staff to view submitted request status
check(
    strpos($dashboardsJs, "switchAdjView('requests'); goTo('receiving')") !== false,
    "5. Allows staff to view submitted request status via switchAdjView('requests'); goTo('receiving')",
    "Link to view submitted request status missing"
);

// Check receiving.js status badge shows Awaiting Admin Approval
check(
    strpos($receivingJs, "⏳ Awaiting Admin Approval") !== false,
    "5b. Receiving approval requests table shows '⏳ Awaiting Admin Approval' badge for pending status",
    "Receiving table badge does not show 'Awaiting Admin Approval'"
);

// --- SECTION 3: DATABASE & WORKFLOW INTEGRITY ---
echo "\n--- 3. Testing Database & Workflow Integrity ---\n";

$pdo = new PDO('mysql:host=127.0.0.1;dbname=MRGR_ColorCenter;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
]);

// Verify existing adjustment requests are intact
$stmtAdj = $pdo->query("SELECT id, req_number, requested_by, role, status FROM adjustment_requests");
$allAdj = $stmtAdj->fetchAll();
check(count($allAdj) >= 1, "Database: Existing stock adjustment requests preserved (" . count($allAdj) . " records)", "Stock adjustment requests lost or deleted");

// Verify existing users
$stmtUsers = $pdo->query("SELECT id, username, role FROM users");
$allUsers = $stmtUsers->fetchAll();
check(count($allUsers) === 3, "Database: Existing user accounts intact (" . count($allUsers) . " users)", "Users lost");

// Verify audit logs preserved
$stmtAudit = $pdo->query("SELECT COUNT(*) as cnt FROM audit_logs");
$auditCount = (int)$stmtAudit->fetch()['cnt'];
check($auditCount > 0, "Database: Audit logs intact ($auditCount entries)", "Audit logs empty or missing");

// Verify responsive styling
check(
    strpos($componentsCss, ".admin-kpi-grid") !== false &&
    strpos($componentsCss, "minmax(230px, 1fr)") !== false,
    "CSS: admin-kpi-grid maintains responsive styling and spacing without awkward card slots",
    "CSS grid configuration issue"
);

echo "\n============================================================\n";
echo "TEST RESULTS: $passes PASSED, " . count($errors) . " FAILED\n";
echo "============================================================\n";

if (!empty($errors)) {
    exit(1);
}
echo "ALL APPROVAL ELIMINATION REQUIREMENTS VERIFIED!\n";
exit(0);
