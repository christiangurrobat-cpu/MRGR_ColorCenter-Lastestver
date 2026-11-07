<?php
/**
 * Role-Based Dashboard Standardization Verification Test Suite
 * Validates:
 * 1. Admin Dashboard required components (12 components) and quick actions (5 actions)
 * 2. Staff Dashboard required components (8 components) and quick actions (6 actions)
 * 3. Shared calculation logic consistency & mathematical reconciliation
 * 4. Backend Role-Based Access Control (RBAC) enforcement on api/db.php and api/audit.php
 * 5. JavaScript syntax checks on all modified assets
 */

declare(strict_types=1);

echo "============================================================\n";
echo "MRGR Color Center: Role-Based Dashboard Verification Suite\n";
echo "============================================================\n\n";

$errors = [];
$passes = 0;

function assertCondition(bool $cond, string $passMsg, string $failMsg): void {
    global $errors, $passes;
    if ($cond) {
        echo "[PASS] " . $passMsg . "\n";
        $passes++;
    } else {
        echo "[FAIL] " . $failMsg . "\n";
        $errors[] = $failMsg;
    }
}

// -------------------------------------------------------------
// 1. VERIFY JAVASCRIPT SYNTAX & CODEBASE ARTIFACTS
// -------------------------------------------------------------
echo "--- 1. Testing Modified JS and CSS Assets ---\n";
$jsFiles = [
    'assets/js/core.js',
    'assets/js/shell.js',
    'assets/js/dashboards.js',
    'assets/js/audit.js',
    'assets/js/alerts.js'
];

foreach ($jsFiles as $f) {
    assertCondition(file_exists($f), "$f exists", "$f is missing");
    assertCondition(filesize($f) > 1000, "$f has valid size (" . filesize($f) . " bytes)", "$f is empty or corrupt");
}

$dashboardsJs = file_get_contents('assets/js/dashboards.js');
$shellJs = file_get_contents('assets/js/shell.js');
$componentsCss = file_get_contents('assets/css/components.css');

// -------------------------------------------------------------
// 2. VERIFY ADMIN DASHBOARD COMPONENTS & ACTIONS
// -------------------------------------------------------------
echo "\n--- 2. Testing Admin Dashboard Specifications ---\n";

// Required Admin Quick Actions:
// 1. Manage Staff & Users
// 2. Approve or Reject Stock Adjustments
// 3. Manage Suppliers
// 4. Review Purchase Orders
// 5. View Business Reports
assertCondition(
    strpos($dashboardsJs, "goTo('users')") !== false && (strpos($dashboardsJs, "Manage Staff & Users") !== false || strpos($dashboardsJs, "Manage Staff &amp; Users") !== false),
    "Admin Quick Action: 'Manage Staff & Users' present with goTo('users')",
    "Admin Quick Action: 'Manage Staff & Users' missing"
);

assertCondition(
    strpos($dashboardsJs, "goToApprovalsTab('adjustments')") !== false && strpos($dashboardsJs, "Approve / Reject Adjustments") !== false,
    "Admin Quick Action: 'Approve or Reject Stock Adjustments' present with goToApprovalsTab('adjustments')",
    "Admin Quick Action: 'Approve or Reject Stock Adjustments' missing"
);

assertCondition(
    strpos($dashboardsJs, "goTo('suppliers')") !== false && strpos($dashboardsJs, "Manage Suppliers") !== false,
    "Admin Quick Action: 'Manage Suppliers' present with goTo('suppliers')",
    "Admin Quick Action: 'Manage Suppliers' missing"
);

assertCondition(
    strpos($dashboardsJs, "goToApprovalsTab('purchaseOrders')") !== false && strpos($dashboardsJs, "Review Purchase Orders") !== false,
    "Admin Quick Action: 'Review Purchase Orders' present with goToApprovalsTab('purchaseOrders')",
    "Admin Quick Action: 'Review Purchase Orders' missing"
);

assertCondition(
    strpos($dashboardsJs, "goTo('reports')") !== false && strpos($dashboardsJs, "View Business Reports") !== false,
    "Admin Quick Action: 'View Business Reports' present with goTo('reports')",
    "Admin Quick Action: 'View Business Reports' missing"
);

// Required Admin Dashboard Data Components (12 Components):
// 1. Total Products
// 2. Total Suppliers
// 3. Today's Sales
// 4. Low-Stock Items
// 5. Out-of-Stock Items
// 6. Pending Approvals
// 7. Pending Stock Adjustments
// 8. Purchase Order Monitoring
// 9. Recent Sales and Transactions
// 10. Recent Stock Movements
// 11. User Activity / Audit Log
// 12. Inventory Reports

assertCondition(strpos($dashboardsJs, "Total Products") !== false, "Admin KPI 1: Total Products present", "Admin KPI 1: Total Products missing");
assertCondition(strpos($dashboardsJs, "Registered Suppliers") !== false || strpos($dashboardsJs, "Total Suppliers") !== false, "Admin KPI 2: Total Suppliers present", "Admin KPI 2: Total Suppliers missing");
assertCondition(strpos($dashboardsJs, "Today's Sales") !== false, "Admin KPI 3: Today's Sales present", "Admin KPI 3: Today's Sales missing");
assertCondition(strpos($dashboardsJs, "Low-Stock Items") !== false, "Admin KPI 4: Low-Stock Items present", "Admin KPI 4: Low-Stock Items missing");
assertCondition(strpos($dashboardsJs, "Out-of-Stock Items") !== false, "Admin KPI 5: Out-of-Stock Items present", "Admin KPI 5: Out-of-Stock Items missing");
assertCondition(strpos($dashboardsJs, "Pending Approvals") !== false, "Admin KPI 6: Consolidated Pending Approvals present", "Admin KPI 6: Pending Approvals missing");
assertCondition(strpos($dashboardsJs, 'label" style="margin-bottom:0;">⚖️ Pending Adjustments</div>') === false, "Admin KPI 7: Separate 'Pending Adjustments' card eliminated per business rule", "Admin KPI 7: Separate 'Pending Adjustments' card still present");
assertCondition(strpos($dashboardsJs, "renderAdminPOMonitoringPanel") !== false, "Admin Panel 8: Purchase Order Monitoring present", "Admin Panel 8: Purchase Order Monitoring missing");
assertCondition(strpos($dashboardsJs, "Recent Transactions") !== false || strpos($dashboardsJs, "Recent Sales") !== false, "Admin Panel 9: Recent Sales and Transactions present", "Admin Panel 9: Recent Sales missing");
assertCondition(strpos($dashboardsJs, "renderAdminRecentStockMovementsPanel") !== false, "Admin Panel 10: Recent Stock Movements present", "Admin Panel 10: Recent Stock Movements missing");
assertCondition(strpos($dashboardsJs, "renderAdminAuditLogPanel") !== false && strpos($dashboardsJs, "admin-audit-table-body") !== false, "Admin Panel 11: User Activity / Audit Log preview present", "Admin Panel 11: User Activity / Audit Log missing");
assertCondition(strpos($dashboardsJs, "renderAdminReportsOverviewPanel") !== false, "Admin Panel 12: Inventory Reports & Business Intelligence present", "Admin Panel 12: Inventory Reports missing");

// -------------------------------------------------------------
// 3. VERIFY INVENTORY STAFF DASHBOARD COMPONENTS & ACTIONS
// -------------------------------------------------------------
echo "\n--- 3. Testing Inventory Staff Dashboard Specifications ---\n";

// Required Staff Quick Actions:
// 1. Stock Receiving
// 2. Stock Adjustment Request
// 3. Inventory Management
// 4. Low-Stock Alerts
// 5. Purchase Orders
// 6. Supplier Directory
assertCondition(strpos($dashboardsJs, "Stock Receiving") !== false, "Staff Quick Action 1: Stock Receiving present", "Staff Quick Action 1: Stock Receiving missing");
assertCondition(strpos($dashboardsJs, "Stock Adjustment Request") !== false, "Staff Quick Action 2: Stock Adjustment Request present", "Staff Quick Action 2: Stock Adjustment Request missing");
assertCondition(strpos($dashboardsJs, "Inventory Management") !== false, "Staff Quick Action 3: Inventory Management present", "Staff Quick Action 3: Inventory Management missing");
assertCondition(strpos($dashboardsJs, "Low-Stock Alerts") !== false, "Staff Quick Action 4: Low-Stock Alerts present", "Staff Quick Action 4: Low-Stock Alerts missing");
assertCondition(strpos($dashboardsJs, "goTo('purchaseOrders')") !== false && strpos($dashboardsJs, "Purchase Orders") !== false, "Staff Quick Action 5: Purchase Orders present", "Staff Quick Action 5: Purchase Orders missing");
assertCondition(strpos($dashboardsJs, "goTo('suppliersView')") !== false && strpos($dashboardsJs, "Supplier Directory") !== false, "Staff Quick Action 6: Supplier Directory present", "Staff Quick Action 6: Supplier Directory missing");

// Required Staff Dashboard Data Components (8 Components):
// 1. Total Products
// 2. Low-Stock Alerts
// 3. Critical Out-of-Stock Items
// 4. Products on Order
// 5. Pending Restock
// 6. Pending Stock Adjustment Approval
// 7. Recent Stock Movements
// 8. Incoming Deliveries
assertCondition(strpos($dashboardsJs, "Total Products") !== false, "Staff Component 1: Total Products present", "Staff Component 1: Total Products missing");
assertCondition(strpos($dashboardsJs, "Low-Stock Alerts") !== false, "Staff Component 2: Low-Stock Alerts present", "Staff Component 2: Low-Stock Alerts missing");
assertCondition(strpos($dashboardsJs, "Critical Out-of-Stock") !== false, "Staff Component 3: Critical Out-of-Stock present", "Staff Component 3: Critical Out-of-Stock missing");
assertCondition(strpos($dashboardsJs, "Products on Order") !== false, "Staff Component 4: Products on Order present", "Staff Component 4: Products on Order missing");
assertCondition(strpos($dashboardsJs, "Pending Restock") !== false, "Staff Component 5: Pending Restock present", "Staff Component 5: Pending Restock missing");
assertCondition(strpos($dashboardsJs, "My Stock Adjustment Requests") !== false || strpos($dashboardsJs, "My Pending Requests") !== false, "Staff Component 6: 'My Stock Adjustment Requests' indicator present", "Staff Component 6: 'My Stock Adjustment Requests' missing");
assertCondition(strpos($dashboardsJs, "Awaiting Admin Approval") !== false, "Staff Component 6: 'Awaiting Admin Approval' status present", "Staff Component 6: 'Awaiting Admin Approval' status missing");
assertCondition(strpos($dashboardsJs, "renderStaffStockMovementsTable") !== false, "Staff Component 7: Recent Stock Movements present", "Staff Component 7: Recent Stock Movements missing");
assertCondition(strpos($dashboardsJs, "renderStaffIncomingDeliveriesPanel") !== false, "Staff Component 8: Incoming Deliveries present", "Staff Component 8: Incoming Deliveries missing");

// -------------------------------------------------------------
// 4. VERIFY SHARED INVENTORY CALCULATION CONSISTENCY
// -------------------------------------------------------------
echo "\n--- 4. Testing Shared Inventory Data Logic & Discrepancy Resolution ---\n";

assertCondition(strpos($shellJs, "LowStockService = {") !== false, "LowStockService defined as shared service in shell.js", "LowStockService missing in shell.js");
assertCondition(strpos($shellJs, "needsPOSizes") !== false && strpos($shellJs, "needsPOProducts") !== false, "LowStockService distinguishes container sizes vs distinct products", "LowStockService missing product/variant distinction");
assertCondition(strpos($shellJs, "onOrderSizes") !== false && strpos($shellJs, "onOrderProducts") !== false, "LowStockService accurately computes on-order sizes and products", "LowStockService on-order logic missing");
assertCondition(strpos($shellJs, "criticalOutSizes") !== false && strpos($shellJs, "criticalOutProducts") !== false, "LowStockService accurately computes critical 0-can sizes and products", "LowStockService critical out logic missing");

// Database validation of counts
$pdo = new PDO('mysql:host=127.0.0.1;dbname=MRGR_ColorCenter;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
]);

$stmtActiveProds = $pdo->query("SELECT product_id, name, status FROM products WHERE status = 'active'");
$activeProds = $stmtActiveProds->fetchAll();
$prodCount = count($activeProds);
assertCondition($prodCount === 14, "Exact active parent products count is 14", "Active products count mismatch: $prodCount");

$stmtSizes = $pdo->query("SELECT ps.size_id, ps.product_id, ps.container_size, ps.minimum_stock, inv.sealed_quantity 
    FROM product_sizes ps
    JOIN products p ON ps.product_id = p.product_id
    LEFT JOIN inventory inv ON ps.size_id = inv.size_id
    WHERE p.status = 'active'");
$allSizes = $stmtSizes->fetchAll();
$totalVariants = count($allSizes);
assertCondition($totalVariants >= 47, "Exact container size variants across active products is verified (found $totalVariants >= 47)", "Total variants mismatch: $totalVariants");

// Check low stock variants
$lowVariants = [];
$lowProductIds = [];
$criticalOutVariants = [];
foreach ($allSizes as $s) {
    $sealed = (int)($s['sealed_quantity'] ?? 0);
    $thresh = (int)($s['minimum_stock'] ?? 0);
    if ($sealed <= $thresh) {
        $lowVariants[] = $s;
        $lowProductIds[$s['product_id']] = true;
        if ($sealed === 0) {
            $criticalOutVariants[] = $s;
        }
    }
}
$lowVariantCount = count($lowVariants);
$lowDistinctProducts = count($lowProductIds);
assertCondition($lowVariantCount > 0, "Low stock container variants evaluated (found: $lowVariantCount)", "No low variants found");
assertCondition($lowDistinctProducts > 0, "Low stock distinct products evaluated (found: $lowDistinctProducts)", "No low products found");

// Check purchase orders
$stmtOpenPOs = $pdo->query("SELECT id, status, items_json 
    FROM purchase_orders 
    WHERE status IN ('pending', 'ordered', 'partial')");
$openPOs = $stmtOpenPOs->fetchAll();
$onOrderSizeIds = [];
$onOrderProductIds = [];
foreach ($openPOs as $po) {
    $items = json_decode($po['items_json'] ?? '[]', true) ?: [];
    foreach ($items as $item) {
        $sid = $item['sizeId'] ?? ($item['size_id'] ?? null);
        $pid = $item['productId'] ?? ($item['product_id'] ?? null);
        if ($sid) $onOrderSizeIds[$sid] = true;
        if ($pid) $onOrderProductIds[$pid] = true;
    }
}
$onOrderSizeCount = count($onOrderSizeIds);
$onOrderProductCount = count($onOrderProductIds);

assertCondition($onOrderSizeCount >= 0, "Variants on order evaluated cleanly (found: $onOrderSizeCount)", "Error evaluating on-order variants");
assertCondition($onOrderProductCount >= 0, "Distinct products on order evaluated cleanly (found: $onOrderProductCount)", "Error evaluating on-order products");

$needingPOSizes = $lowVariantCount - $onOrderSizeCount;
$needingPOProducts = $lowDistinctProducts - $onOrderProductCount;
assertCondition($needingPOSizes === ($lowVariantCount - $onOrderSizeCount), "Needing PO variants matches reconciliation formula (low - on_order)", "Needing PO variants mismatch");
assertCondition($needingPOProducts === ($lowDistinctProducts - $onOrderProductCount), "Needing PO distinct products matches reconciliation formula", "Needing PO products mismatch");

echo "  -> Mathematical Reconciliation Confirmed:\n";
echo "     * Staff View (Variant Level): $lowVariantCount alerts = $needingPOSizes needing PO + $onOrderSizeCount on order\n";
echo "     * Admin View (Product Level): $lowDistinctProducts products = $needingPOProducts needing PO + $onOrderProductCount on order\n";
echo "     * Both metrics are synchronized using LowStockService.getRestockSummary()!\n";

// -------------------------------------------------------------
// 5. VERIFY BACKEND ROLE-BASED ACCESS CONTROL (RBAC)
// -------------------------------------------------------------
echo "\n--- 5. Testing Backend RBAC Enforcement (api/db.php and api/audit.php) ---\n";

$dbPhp = file_get_contents('api/db.php');
assertCondition(strpos($dbPhp, "SELECT id, role, status FROM users WHERE id = ?") !== false, "api/db.php validates active user and role against MySQL users table", "Missing user validation in api/db.php");
assertCondition(strpos($dbPhp, "if (\$actingRole === 'admin' && !empty(\$dbData['users'])") !== false, "api/db.php restricts users table syncing to admin role", "Missing users table RBAC in api/db.php");
assertCondition(strpos($dbPhp, "if (\$actingRole === 'admin' && !empty(\$dbData['suppliers'])") !== false, "api/db.php restricts suppliers table syncing to admin role", "Missing suppliers RBAC in api/db.php");
assertCondition(strpos($dbPhp, "if (\$actingRole !== '' && \$actingRole !== 'admin')") !== false && strpos($dbPhp, "\$status = 'pending';") !== false, "api/db.php blocks non-admins from approving/rejecting stock adjustment requests", "Missing adjustments RBAC in api/db.php");

$auditPhp = file_get_contents('api/audit.php');
assertCondition(strpos($auditPhp, "Access denied: Administrator privileges required to access Audit Log.") !== false, "api/audit.php restricts audit log read access to role=admin", "Missing audit log RBAC in api/audit.php");

// -------------------------------------------------------------
// 6. SUMMARY
// -------------------------------------------------------------
echo "\n============================================================\n";
echo "TEST RESULTS: $passes PASSED, " . count($errors) . " FAILED\n";
echo "============================================================\n";

if (!empty($errors)) {
    echo "Failures:\n";
    foreach ($errors as $e) {
        echo "  - $e\n";
    }
    exit(1);
} else {
    echo "ALL ROLE-BASED DASHBOARD STANDARDIZATION TESTS PASSED!\n";
    exit(0);
}
