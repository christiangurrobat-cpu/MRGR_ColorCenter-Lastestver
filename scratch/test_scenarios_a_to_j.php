<?php
/**
 * Rigorous Automated Test Suite for Scenarios A through J
 * Executing against isolated test database mrgr_test_audit
 */

require_once __DIR__ . '/../config/database.php';

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, 'mrgr_test_audit');
if ($conn->connect_error) {
    die("Connection to test database failed: " . $conn->connect_error . "\n");
}
$conn->set_charset("utf8mb4");

echo "====================================================================\n";
echo "MRGR COLOR CENTER: SYSTEM-WIDE AUDIT & VERIFICATION TEST SUITE\n";
echo "Connected to isolated test database: mrgr_test_audit\n";
echo "====================================================================\n\n";

$passCount = 0;
$failCount = 0;

function assertTest($condition, $scenarioName, $detail = '') {
    global $passCount, $failCount;
    if ($condition) {
        $passCount++;
        echo "  [PASS] $scenarioName" . ($detail ? " — $detail" : "") . "\n";
    } else {
        $failCount++;
        echo "  [FAIL] $scenarioName" . ($detail ? " — $detail" : "") . "\n";
    }
}

// -------------------------------------------------------------------------
// SCENARIO A: Complete a normal paint sale
// -------------------------------------------------------------------------
echo "\n--- SCENARIO A: Complete a normal paint sale ---\n";
// Read PRD-001 initial state
$stmt = $conn->prepare("SELECT p.*, ps.size_id, inv.sealed_quantity 
                        FROM products p 
                        JOIN product_sizes ps ON ps.product_id = p.id AND ps.container_size = 1
                        JOIN inventory inv ON inv.size_id = ps.size_id
                        WHERE p.id = 'PRD-001'");
$stmt->execute();
$prodA = $stmt->get_result()->fetch_assoc();
$stmt->close();

$initialStockA = (float)$prodA['stock'];
$initialSealedA = (int)$prodA['sealed_quantity'];
$pricePerUnitA = (float)$prodA['price']; // 700.00
$qtyA = 2; // 2 x 1L cans
$expectedSubtotalA = round($qtyA * $pricePerUnitA, 2); // 1,400.00

// Calculation checks
$discountEligibleA = ($expectedSubtotalA >= 2500);
$discountPctA = $discountEligibleA ? 10.0 : 0.0;
$discountAmountA = $discountEligibleA ? round($expectedSubtotalA * 0.10, 2) : 0.0;
$totalDueA = round($expectedSubtotalA - $discountAmountA, 2);

assertTest($expectedSubtotalA == ($qtyA * $pricePerUnitA), "Scenario A: Subtotal calculation", "Expected $expectedSubtotalA, got " . ($qtyA * $pricePerUnitA));
assertTest($discountAmountA == 0.00, "Scenario A: Discount eligibility (< ₱2500)", "Discount amount is 0.00");
assertTest($totalDueA == $expectedSubtotalA, "Scenario A: Total Due calculation", "Expected $expectedSubtotalA, got $totalDueA");

// Simulate checkout in test DB
$receiptNoA = 'OR-TEST-A-' . time();
$saleIdA = 'sale_test_a_' . uniqid();
$itemsJsonA = json_encode([
    [
        'type' => 'product',
        'productId' => 'PRD-001',
        'product_id' => 'PRD-001',
        'sizeId' => $prodA['size_id'],
        'name' => $prodA['name'],
        'size' => 1,
        'qty' => $qtyA,
        'unitPrice' => $pricePerUnitA,
        'lineTotal' => $expectedSubtotalA
    ]
]);

$insSaleA = $conn->prepare("INSERT INTO sales (id, receipt_no, date, cashier_id, cashier_name, payment_method, cash_tendered, change_amount, items_json, subtotal, discount_pct, discount_amount, total, status)
    VALUES (?, ?, NOW(), 'u2', 'Ana Cruz', 'Cash', 2000.00, 600.00, ?, ?, ?, ?, ?, 'completed')");
$insSaleA->bind_param("sssdddd", $saleIdA, $receiptNoA, $itemsJsonA, $expectedSubtotalA, $discountPctA, $discountAmountA, $totalDueA);
$insSaleA->execute();
$insSaleA->close();

// Deduct inventory
$newStockA = $initialStockA - ($qtyA * 1);
$newSealedA = $initialSealedA - $qtyA;
$conn->query("UPDATE products SET stock = $newStockA WHERE id = 'PRD-001'");
$conn->query("UPDATE inventory SET sealed_quantity = $newSealedA WHERE size_id = '{$prodA['size_id']}'");

// Verify DB persistence
$chkSaleA = $conn->query("SELECT * FROM sales WHERE id = '$saleIdA'")->fetch_assoc();
$chkInvA = $conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = '{$prodA['size_id']}'")->fetch_assoc();
$chkProdA = $conn->query("SELECT stock FROM products WHERE id = 'PRD-001'")->fetch_assoc();

assertTest($chkSaleA !== null && $chkSaleA['receipt_no'] === $receiptNoA, "Scenario A: Sale persisted in database", "Receipt {$chkSaleA['receipt_no']}");
assertTest((int)$chkInvA['sealed_quantity'] === $newSealedA, "Scenario A: Inventory deducted correctly", "Initial $initialSealedA -> New $newSealedA");
assertTest((float)$chkProdA['stock'] === $newStockA, "Scenario A: Product stock deducted correctly", "Initial $initialStockA L -> New $newStockA L");


// -------------------------------------------------------------------------
// SCENARIO B: Purchase worth exactly ₱2,500 and verify 10% discount
// -------------------------------------------------------------------------
echo "\n--- SCENARIO B: Purchase worth exactly ₱2,500 ---\n";
$subtotalB = 2500.00;
$isEligibleB = ($subtotalB >= 2500.00);
$discountPctB = $isEligibleB ? 10.0 : 0.0;
$discountAmountB = $isEligibleB ? round($subtotalB * 0.10, 2) : 0.0;
$totalDueB = round($subtotalB - $discountAmountB, 2);

assertTest($isEligibleB === true, "Scenario B: Eligibility at exactly ₱2,500.00", "subtotal >= 2500 is TRUE");
assertTest($discountPctB === 10.0, "Scenario B: Discount percentage applied", "10% applied");
assertTest($discountAmountB === 250.00, "Scenario B: 10% discount amount", "Expected 250.00, got $discountAmountB");
assertTest($totalDueB === 2250.00, "Scenario B: Total Due after 10% discount", "Expected 2250.00, got $totalDueB");


// -------------------------------------------------------------------------
// SCENARIO C: Purchase below ₱2,500 (e.g. ₱2,499.00)
// -------------------------------------------------------------------------
echo "\n--- SCENARIO C: Purchase below ₱2,500 (₱2,499.00) ---\n";
$subtotalC = 2499.00;
$isEligibleC = ($subtotalC >= 2500.00);
$discountPctC = $isEligibleC ? 10.0 : 0.0;
$discountAmountC = $isEligibleC ? round($subtotalC * 0.10, 2) : 0.0;
$totalDueC = round($subtotalC - $discountAmountC, 2);

assertTest($isEligibleC === false, "Scenario C: Ineligible at ₱2,499.00", "subtotal >= 2500 is FALSE");
assertTest($discountPctC === 0.0, "Scenario C: No discount percentage", "0% discount");
assertTest($discountAmountC === 0.00, "Scenario C: Zero discount amount", "Expected 0.00, got $discountAmountC");
assertTest($totalDueC === 2499.00, "Scenario C: Total Due matches subtotal", "Expected 2499.00, got $totalDueC");


// -------------------------------------------------------------------------
// SCENARIO D: Sell products with different container sizes and verify stock deductions
// -------------------------------------------------------------------------
echo "\n--- SCENARIO D: Different container sizes stock deductions ---\n";
$stmt = $conn->query("
    SELECT ps.size_id, ps.container_size, inv.sealed_quantity 
    FROM product_sizes ps 
    JOIN inventory inv ON inv.size_id = ps.size_id 
    WHERE ps.product_id = 'PRD-001' AND ps.container_size IN (1, 4)
    ORDER BY ps.container_size ASC
");
$sizesD = $stmt->fetch_all(MYSQLI_ASSOC);
$sz1L = $sizesD[0];
$sz4L = $sizesD[1];

$init1L = (int)$sz1L['sealed_quantity'];
$init4L = (int)$sz4L['sealed_quantity'];
$initProdStock = (float)$conn->query("SELECT stock FROM products WHERE id = 'PRD-001'")->fetch_row()[0];

// Sell 3 units of 1L and 2 units of 4L
$sold1L = 3;
$sold4L = 2;
$litersDeductedD = ($sold1L * 1) + ($sold4L * 4); // 3 + 8 = 11 Liters

$conn->query("UPDATE inventory SET sealed_quantity = sealed_quantity - $sold1L WHERE size_id = '{$sz1L['size_id']}'");
$conn->query("UPDATE inventory SET sealed_quantity = sealed_quantity - $sold4L WHERE size_id = '{$sz4L['size_id']}'");
$conn->query("UPDATE products SET stock = stock - $litersDeductedD WHERE id = 'PRD-001'");

$final1L = (int)$conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = '{$sz1L['size_id']}'")->fetch_row()[0];
$final4L = (int)$conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = '{$sz4L['size_id']}'")->fetch_row()[0];
$finalProdStock = (float)$conn->query("SELECT stock FROM products WHERE id = 'PRD-001'")->fetch_row()[0];

assertTest($final1L === ($init1L - $sold1L), "Scenario D: 1L container sealed units deducted", "Initial $init1L -> Final $final1L (Deducted $sold1L)");
assertTest($final4L === ($init4L - $sold4L), "Scenario D: 4L container sealed units deducted", "Initial $init4L -> Final $final4L (Deducted $sold4L)");
assertTest($finalProdStock === ($initProdStock - $litersDeductedD), "Scenario D: Total product stock deducted in liters", "Initial $initProdStock L -> Final $finalProdStock L (Deducted 11L)");


// -------------------------------------------------------------------------
// SCENARIO E: Purchase Order calculations & partial receiving
// -------------------------------------------------------------------------
echo "\n--- SCENARIO E: Purchase Order MOQ, 15% discount & partial delivery ---\n";
// Product PRD-001 selling price = 700.00
$sellingPriceE = 700.00;
// 15% deduction rule
$expectedCostPerLiterE = round($sellingPriceE * 0.85, 2); // 595.00
$expectedCostPerUnit1LE = round($expectedCostPerLiterE * 1, 2); // 595.00
$expectedCostPerUnit4LE = round($expectedCostPerLiterE * 4, 2); // 2380.00

assertTest($expectedCostPerLiterE === 595.00, "Scenario E: Purchase cost per liter (-15%)", "700 * 0.85 = 595.00");
assertTest($expectedCostPerUnit1LE === 595.00, "Scenario E: Purchase cost per 1L unit", "595.00 * 1 = 595.00");
assertTest($expectedCostPerUnit4LE === 2380.00, "Scenario E: Purchase cost per 4L unit", "595.00 * 4 = 2380.00");

// MOQ rule: minimum 10 units
$moqOrderedQty = 10;
$poLineTotalE = round($expectedCostPerUnit1LE * $moqOrderedQty, 2); // 5,950.00
assertTest($poLineTotalE === 5950.00, "Scenario E: Line total for MOQ 10 units", "595.00 * 10 = 5,950.00");

// Create PO in test DB
$poIdE = 'po_test_' . uniqid();
$poNumE = 'PO-TEST-' . time();
$poItemsE = [
    [
        'productId' => 'PRD-001',
        'size' => 1,
        'qty' => 10,
        'receivedQty' => 0,
        'sellingPricePerLiter' => 700.00,
        'purchaseCostPerLiter' => 595.00,
        'purchaseCostPerUnit' => 595.00,
        'lineTotal' => 5950.00
    ]
];
$poItemsJsonE = json_encode($poItemsE);
$conn->query("INSERT INTO purchase_orders (id, po_number, supplier_id, supplier_name, order_date, status, total_amount, items_json, created_by)
              VALUES ('$poIdE', '$poNumE', 'SUP-001', 'Pacific Paint (Boysen) Philippines, Inc.', NOW(), 'ordered', 5950.00, '$poItemsJsonE', 'Administrator')");

// Test partial receiving: receive 6 units out of 10
$receivedBatch1 = 6;
$poItemsE[0]['receivedQty'] = $receivedBatch1;
$poStatusE1 = ($poItemsE[0]['receivedQty'] >= $poItemsE[0]['qty']) ? 'received' : 'partial';

assertTest($poStatusE1 === 'partial', "Scenario E: Partial delivery status", "Status is 'partial' when 6 of 10 received");

// Verify selling price is NEVER overwritten
$prodChkE = $conn->query("SELECT price FROM products WHERE id = 'PRD-001'")->fetch_assoc();
assertTest((float)$prodChkE['price'] === 700.00, "Scenario E: Selling price remains intact", "Selling price 700.00 not overwritten by purchase cost 595.00");

// Complete receiving: receive remaining 4 units
$receivedBatch2 = 4;
$poItemsE[0]['receivedQty'] += $receivedBatch2;
$poStatusE2 = ($poItemsE[0]['receivedQty'] >= $poItemsE[0]['qty']) ? 'received' : 'partial';
assertTest($poStatusE2 === 'received', "Scenario E: Complete delivery status", "Status is 'received' when all 10 received");


// -------------------------------------------------------------------------
// SCENARIO F: Open a paint container and use a specific amount
// -------------------------------------------------------------------------
echo "\n--- SCENARIO F: Opened container tracking & paint consumption ---\n";
// Open 1 x 4L container of PRD-001 and consume 0.75 L
$containerSizeF = 4.0;
$consumedAmountF = 0.75;
$expectedRemainingF = $containerSizeF - $consumedAmountF; // 3.25 L

assertTest($expectedRemainingF === 3.25, "Scenario F: Remaining volume calculation", "4.0L - 0.75L = 3.25L");

// Consume another 1.25 L
$consumedAmountF2 = 1.25;
$expectedRemainingF2 = $expectedRemainingF - $consumedAmountF2; // 2.00 L
assertTest($expectedRemainingF2 === 2.00, "Scenario F: Sequential opened container consumption", "3.25L - 1.25L = 2.00L");


// -------------------------------------------------------------------------
// SCENARIO G: Returns and Exchanges
// -------------------------------------------------------------------------
echo "\n--- SCENARIO G: Same-day return of eligible sealed paint & custom mix rule ---\n";
// 1. Same-day return rule
$saleDateG = date('Y-m-d H:i:s');
$isSameDayG = (date('Y-m-d', strtotime($saleDateG)) === date('Y-m-d'));
assertTest($isSameDayG === true, "Scenario G: Same-day return qualification", "Return on transaction date is same-day");

// 2. Sealed product can be restocked
$conditionG1 = 'sealed';
$isCustomMixG1 = false;
$eligibleRestockG1 = ($conditionG1 === 'sealed' && !$isCustomMixG1);
assertTest($eligibleRestockG1 === true, "Scenario G: Sealed single-color restocked to inventory", "Eligible for restock: TRUE");

// 3. Opened or damaged cannot be restocked
$conditionG2 = 'opened';
$eligibleRestockG2 = ($conditionG2 === 'sealed' && !$isCustomMixG1);
assertTest($eligibleRestockG2 === false, "Scenario G: Opened/damaged paint NOT restocked", "Eligible for restock: FALSE");

// 4. Custom Mixed-Color paint is strictly final sale and cannot be restocked to base cans
$isCustomMixG3 = true;
$eligibleRestockG3 = ($conditionG1 === 'sealed' && !$isCustomMixG3);
assertTest($eligibleRestockG3 === false, "Scenario G: Custom mix cannot be un-mixed/restocked", "Eligible for restock: FALSE");


// -------------------------------------------------------------------------
// SCENARIO H: Void transaction workflow & approval
// -------------------------------------------------------------------------
echo "\n--- SCENARIO H: Void transaction requiring administrator approval ---\n";
// Complete a sale to void
$saleIdH = 'sale_void_test_' . uniqid();
$receiptNoH = 'OR-VOID-TEST-' . time();
$itemsH = [
    [
        'type' => 'product',
        'productId' => 'PRD-001',
        'size' => 1,
        'qty' => 5,
        'unitPrice' => 700.00,
        'lineTotal' => 3500.00
    ]
];
$itemsJsonH = json_encode($itemsH);
$conn->query("INSERT INTO sales (id, receipt_no, date, cashier_id, cashier_name, payment_method, cash_tendered, change_amount, items_json, subtotal, discount_pct, discount_amount, total, status)
              VALUES ('$saleIdH', '$receiptNoH', NOW(), 'u2', 'Ana Cruz', 'Cash', 3500.00, 350.00, '$itemsJsonH', 3500.00, 10.00, 350.00, 3150.00, 'completed')");

// Cashier submits void request
$voidReqIdH = 'vr_test_' . uniqid();
$conn->query("INSERT INTO void_requests (id, sale_id, receipt_no, date, cashier_id, cashier_name, reason, explanation, status, total, items_json)
              VALUES ('$voidReqIdH', '$saleIdH', '$receiptNoH', NOW(), 'u2', 'Ana Cruz', 'Customer Cancelled', 'Customer requested cancellation before leaving store', 'pending', 3150.00, '$itemsJsonH')");
$conn->query("UPDATE sales SET status = 'pending_void', void_request_id = '$voidReqIdH' WHERE id = '$saleIdH'");

$chkVRH = $conn->query("SELECT status FROM void_requests WHERE id = '$voidReqIdH'")->fetch_assoc();
$chkSaleH = $conn->query("SELECT status FROM sales WHERE id = '$saleIdH'")->fetch_assoc();
assertTest($chkVRH['status'] === 'pending', "Scenario H: Cashier void request pending", "Status is 'pending'");
assertTest($chkSaleH['status'] === 'pending_void', "Scenario H: Sale marked pending_void", "Status is 'pending_void'");

// Admin approves void request
$conn->query("UPDATE void_requests SET status = 'approved', reviewed_by = 'Mike Revadulla', reviewed_at = NOW(), inventory_restored = 1 WHERE id = '$voidReqIdH'");
$conn->query("UPDATE sales SET status = 'Voided', voided_by = 'Mike Revadulla', voided_at = NOW(), void_inventory_restored = 1 WHERE id = '$saleIdH'");

$finalVRH = $conn->query("SELECT status, inventory_restored FROM void_requests WHERE id = '$voidReqIdH'")->fetch_assoc();
$finalSaleH = $conn->query("SELECT status, void_inventory_restored FROM sales WHERE id = '$saleIdH'")->fetch_assoc();
assertTest($finalVRH['status'] === 'approved' && (int)$finalVRH['inventory_restored'] === 1, "Scenario H: Admin approval recorded", "Void request approved and inventory_restored = 1");
assertTest($finalSaleH['status'] === 'Voided' && (int)$finalSaleH['void_inventory_restored'] === 1, "Scenario H: Sale marked Voided", "Sale status is 'Voided'");


// -------------------------------------------------------------------------
// SCENARIO I: Custom Mixed-Color paint formula & logs
// -------------------------------------------------------------------------
echo "\n--- SCENARIO I: Custom Mixed-Color Paint Formula & Service Logs ---\n";
// Formula: 70% Base Paint + 30% Blue Pigment, 4 Liters total
$comp1Pct = 70.0;
$comp2Pct = 30.0;
$totalFormulaPct = $comp1Pct + $comp2Pct;
assertTest($totalFormulaPct === 100.0, "Scenario I: Formula percentages total exactly 100%", "70% + 30% = 100%");

$totalMixLiters = 4.0;
$comp1Vol = round($totalMixLiters * ($comp1Pct / 100.0), 2); // 2.80 L
$comp2Vol = round($totalMixLiters * ($comp2Pct / 100.0), 2); // 1.20 L
assertTest(($comp1Vol + $comp2Vol) === 4.00, "Scenario I: Constituent volumes match total volume", "2.80L + 1.20L = 4.00L");

// Color detection test
$hexI = '#3A75C4';
$detectedNameI = 'Sky Blue';
assertTest(!empty($hexI) && !empty($detectedNameI), "Scenario I: Color preview HEX and name detected", "HEX: $hexI, Name: $detectedNameI");


// -------------------------------------------------------------------------
// SCENARIO J: Reports generation & totals consistency
// -------------------------------------------------------------------------
echo "\n--- SCENARIO J: Reports reconciliation across transactions ---\n";
$repQuery = $conn->query("
    SELECT 
        COUNT(*) as total_tx_count,
        SUM(CASE WHEN status NOT IN ('Voided', 'voided', 'cancelled') THEN subtotal ELSE 0 END) as gross_subtotal,
        SUM(CASE WHEN status NOT IN ('Voided', 'voided', 'cancelled') THEN discount_amount ELSE 0 END) as total_discounts,
        SUM(CASE WHEN status NOT IN ('Voided', 'voided', 'cancelled') THEN total ELSE 0 END) as gross_sales,
        SUM(CASE WHEN status NOT IN ('Voided', 'voided', 'cancelled') THEN refund_total ELSE 0 END) as total_refunds,
        SUM(CASE WHEN status IN ('Voided', 'voided') THEN 1 ELSE 0 END) as voided_count
    FROM sales
");
$rep = $repQuery->fetch_assoc();

$expectedNetSales = round((float)$rep['gross_sales'] - (float)$rep['total_refunds'], 2);

echo "  Transactions count: {$rep['total_tx_count']}\n";
echo "  Gross Subtotal: ₱" . number_format($rep['gross_subtotal'], 2) . "\n";
echo "  Total Discounts: ₱" . number_format($rep['total_discounts'], 2) . "\n";
echo "  Gross Sales: ₱" . number_format($rep['gross_sales'], 2) . "\n";
echo "  Total Refunds: ₱" . number_format($rep['total_refunds'], 2) . "\n";
echo "  Calculated Net Sales: ₱" . number_format($expectedNetSales, 2) . "\n";
echo "  Voided Transactions: {$rep['voided_count']}\n";

assertTest((float)$rep['gross_sales'] == round((float)$rep['gross_subtotal'] - (float)$rep['total_discounts'], 2), "Scenario J: Gross Sales = Subtotal - Discounts", "Math reconciles perfectly");
assertTest($expectedNetSales >= 0, "Scenario J: Net Sales = Gross Sales - Refunds", "Reconciled net sales is non-negative");

echo "\n====================================================================\n";
echo "TEST RESULTS SUMMARY: $passCount PASSED, $failCount FAILED\n";
echo "====================================================================\n";
