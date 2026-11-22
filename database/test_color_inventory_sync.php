<?php
/**
 * Comprehensive Automated Verification Suite for Two-Way Synchronization
 * Between Inventory and Color Library.
 *
 * Tests all 10 required scenarios + RBAC + Non-color exclusion + Archive/Unlink protection,
 * then cleans up all test fixtures so production data remains untouched.
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../api/color_library_lib.php';
require_once __DIR__ . '/../api/color_inventory_sync.php';

$conn = getDBConnection();
colorSyncEnsureSchema($conn, true);

$passed = 0;
$failed = 0;
$createdProductIds = [];
$createdColorIds = [];
$createdFormulaIds = [];
$createdMovementIds = [];
$createdBatchIds = [];

function assertTrue($cond, string $label, string $detail = ''): void {
    global $passed, $failed;
    if ($cond) {
        $passed++;
        echo "[PASS] {$label}\n";
    } else {
        $failed++;
        echo "[FAIL] {$label}" . ($detail ? " -- {$detail}" : '') . "\n";
    }
}

$adminActor = ['id' => 'u_admin', 'name' => 'Test Admin', 'role' => 'admin'];
$staffActor = ['id' => 'u_staff', 'name' => 'Test Staff', 'role' => 'staff'];

// Snapshot pre-existing counts for Scenario 10 integrity check
$origSalesCount = (int)$conn->query("SELECT COUNT(*) AS c FROM sales")->fetch_assoc()['c'];
$origProductsCount = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
$origColorLibCount = (int)$conn->query("SELECT COUNT(*) AS c FROM color_library")->fetch_assoc()['c'];
$origFormulasCount = (int)$conn->query("SELECT COUNT(*) AS c FROM color_formulas")->fetch_assoc()['c'];
$origPoCount = (int)$conn->query("SELECT COUNT(*) AS c FROM purchase_orders")->fetch_assoc()['c'];

echo "=== Starting Color Library <-> Inventory Two-Way Sync Verification ===\n";
echo "Baseline: products={$origProductsCount}, color_library={$origColorLibCount}, sales={$origSalesCount}, formulas={$origFormulasCount}, pos={$origPoCount}\n\n";

try {
    // =========================================================================
    // SCENARIO 1 & 2: Add a new color-related product in Inventory -> Auto-create in Color Library
    //                 + Verify regular paint & non-color items do NOT auto-create
    // =========================================================================
    echo "--- Scenario 1 & 2: Inventory -> Color Library ---\n";
    $pigmentPid = colorSyncNextProductId($conn);
    $createdProductIds[] = $pigmentPid;

    $conn->begin_transaction();
    $insP = $conn->prepare("INSERT INTO products (id, product_id, product_name, name, brand, type, category, tax_classification, color, color_id, color_classification, color_hex, is_color_pigment, price, stock, can_stock, opened_stock, opened_can_size, opened_by_size, sizes, pending_sizes, threshold, threshold_by_size, status, updated_by)
        VALUES (?, ?, 'Cobalt Teal Pigment', 'Cobalt Teal Pigment', 'TintPro', 'Pigment / Colorant', 'Pigment / Colorant', 'vatable', 'Cobalt Teal Test', NULL, 'Cool Colors', '#0F9D9A', 1, 250.00, 0.00, '{\"1\":0}', 0.00, 0, '{}', '[1]', '[]', 5.00, '{\"1\":5}', 'active', 'Test Admin')");
    $insP->bind_param('ss', $pigmentPid, $pigmentPid);
    $insP->execute();
    $insP->close();

    $syncRes1 = colorSyncFromInventoryProduct($conn, [
        'id' => $pigmentPid,
        'name' => 'Cobalt Teal Pigment',
        'type' => 'Pigment / Colorant',
        'category' => 'Pigment / Colorant',
        'color' => 'Cobalt Teal Test',
        'colorHex' => '#0F9D9A',
        'colorClassification' => 'Cool Colors',
        'isColorPigment' => 1,
    ], null, $adminActor);
    $conn->commit();

    assertTrue(!empty($syncRes1['synced']) && $syncRes1['action'] === 'created_color', 'S1: Pigment product auto-created Color Library entry');
    $autoColorId = (string)($syncRes1['colorId'] ?? '');
    if ($autoColorId !== '') $createdColorIds[] = $autoColorId;

    $clCheck = $conn->query("SELECT * FROM color_library WHERE id = '{$conn->real_escape_string($autoColorId)}'")->fetch_assoc();
    $pCheck = $conn->query("SELECT * FROM products WHERE id = '{$conn->real_escape_string($pigmentPid)}'")->fetch_assoc();
    $mCheck = $conn->query("SELECT * FROM color_inventory_sync_map WHERE color_id = '{$conn->real_escape_string($autoColorId)}' AND product_id = '{$conn->real_escape_string($pigmentPid)}'")->fetch_assoc();

    assertTrue($clCheck && $clCheck['name'] === 'Cobalt Teal Test' && $clCheck['hex'] === '#0F9D9A', 'S2: Color Library entry has exact name and HEX');
    assertTrue($clCheck && $clCheck['classification'] === 'Cool Colors' && $clCheck['linked_product_id'] === $pigmentPid, 'S2: Color Library entry has classification and linked_product_id');
    assertTrue($pCheck && $pCheck['color_id'] === $autoColorId && (int)$pCheck['is_color_pigment'] === 1, 'S2: Inventory product linked back to Color Library ID');
    assertTrue(!empty($mCheck), 'S2: Mapping table row created in color_inventory_sync_map');

    // Non-color & regular paint exclusion check
    $regPaintRes = colorSyncFromInventoryProduct($conn, [
        'id' => 'PRD-TMP-REG',
        'name' => 'Boysen Regular Paint',
        'type' => 'House Paint',
        'category' => 'House Paint',
        'color' => 'Unlisted Wall Shade',
        'colorHex' => '#ABCDEF',
        'isColorPigment' => 0,
    ], null, $adminActor);
    assertTrue(empty($regPaintRes['synced']) && ($regPaintRes['reason'] ?? '') === 'not_color_pigment', 'S2b: Regular paint product does NOT auto-create Color Library entry');

    $toolRes = colorSyncFromInventoryProduct($conn, [
        'id' => 'PRD-TMP-TOOL',
        'name' => '2-inch Paint Brush',
        'type' => 'Accessories',
        'category' => 'Tools & Accessories',
        'color' => 'Black',
        'colorHex' => '#111111',
        'isColorPigment' => 1, // Even if flag erroneously passed, non-color category blocks it
    ], null, $adminActor);
    assertTrue(empty($toolRes['synced']) && ($toolRes['reason'] ?? '') === 'not_color_pigment', 'S2c: Tools/Accessories NEVER auto-create Color Library entries');

    // =========================================================================
    // SCENARIO 3 & 4: Add a new Custom Color in Color Library -> Auto-create in Inventory
    // =========================================================================
    echo "\n--- Scenario 3 & 4: Color Library -> Inventory ---\n";
    $saveRes3 = colorLibrarySaveColor($conn, [
        'name' => 'Sunset Vermilion Test',
        'hex' => '#E64A19',
        'category' => 'Orange',
        'classification' => 'Warm Colors',
        'colorFamily' => 'Coral',
        'variation' => 'Base',
        'notes' => 'Test custom pigment color',
        'productCategory' => 'Pigment / Colorant',
    ], $adminActor);

    assertTrue(!empty($saveRes3['success']) && ($saveRes3['syncAction'] ?? '') === 'created_product', 'S3: Custom Color creation auto-created Inventory product');
    $customColorId = (string)($saveRes3['color']['id'] ?? '');
    $autoProdId = (string)($saveRes3['syncedProductId'] ?? '');
    if ($customColorId !== '') $createdColorIds[] = $customColorId;
    if ($autoProdId !== '') $createdProductIds[] = $autoProdId;

    $autoProd = $conn->query("SELECT * FROM products WHERE id = '{$conn->real_escape_string($autoProdId)}'")->fetch_assoc();
    $autoSize = $conn->query("SELECT ps.*, inv.inventory_id, inv.sealed_quantity, inv.opened_quantity, inv.remaining_volume FROM product_sizes ps LEFT JOIN inventory inv ON inv.size_id = ps.size_id WHERE ps.product_id = '{$conn->real_escape_string($autoProdId)}'")->fetch_assoc();
    $poCountAfter = (int)$conn->query("SELECT COUNT(*) AS c FROM purchase_orders")->fetch_assoc()['c'];

    assertTrue($autoProd && $autoProd['name'] === 'Sunset Vermilion Test Pigment' && $autoProd['color_hex'] === '#E64A19', 'S4: Auto-created product uses Custom Color name + Pigment and HEX');
    assertTrue($autoProd && $autoProd['category'] === 'Pigment / Colorant' && $autoProd['color_id'] === $customColorId, 'S4: Auto-created product has Pigment / Colorant category and color_id link');
    assertTrue($autoProd && (float)$autoProd['stock'] === 0.0 && $autoSize && (int)$autoSize['sealed_quantity'] === 0 && (float)$autoSize['remaining_volume'] === 0.0, 'S4: Stock initialized strictly to 0.00 (sealed=0, opened=0)');
    assertTrue($poCountAfter === $origPoCount, 'S4: Zero artificial purchase order records created');

    // =========================================================================
    // SCENARIO 5: Duplicate Prevention (Color Library + Inventory linking)
    // =========================================================================
    echo "\n--- Scenario 5: Duplicate Prevention ---\n";
    $dupNameRes = colorLibrarySaveColor($conn, [
        'name' => 'sunset vermilion test', // case-insensitive duplicate
        'hex' => '#123456',
        'category' => 'Orange',
        'classification' => 'Warm Colors',
    ], $adminActor);
    assertTrue(empty($dupNameRes['success']) && ($dupNameRes['status'] ?? 0) === 409, 'S5a: Duplicate color name rejected with 409');

    $dupHexRes = colorLibrarySaveColor($conn, [
        'name' => 'Unique Name Different',
        'hex' => '#e64a19', // duplicate HEX
        'category' => 'Orange',
        'classification' => 'Warm Colors',
    ], $adminActor);
    assertTrue(empty($dupHexRes['success']) && ($dupHexRes['status'] ?? 0) === 409, 'S5b: Duplicate HEX code rejected with 409');

    // Adding a second pigment product with same color links to existing Color Library entry instead of duplicating
    $secondPigmentPid = colorSyncNextProductId($conn);
    $createdProductIds[] = $secondPigmentPid;
    $conn->begin_transaction();
    $insP2 = $conn->prepare("INSERT INTO products (id, product_id, product_name, name, brand, type, category, tax_classification, color, color_id, color_classification, color_hex, is_color_pigment, price, stock, can_stock, opened_stock, opened_can_size, opened_by_size, sizes, pending_sizes, threshold, threshold_by_size, status, updated_by)
        VALUES (?, ?, 'Cobalt Teal Alt', 'Cobalt Teal Alt', 'OtherBrand', 'Pigment / Colorant', 'Pigment / Colorant', 'vatable', 'Cobalt Teal Test', NULL, 'Cool Colors', '#0F9D9A', 1, 260.00, 0.00, '{\"1\":0}', 0.00, 0, '{}', '[1]', '[]', 5.00, '{\"1\":5}', 'active', 'Test Admin')");
    $insP2->bind_param('ss', $secondPigmentPid, $secondPigmentPid);
    $insP2->execute();
    $insP2->close();
    $syncResDup = colorSyncFromInventoryProduct($conn, [
        'id' => $secondPigmentPid,
        'name' => 'Cobalt Teal Alt',
        'type' => 'Pigment / Colorant',
        'category' => 'Pigment / Colorant',
        'color' => 'Cobalt Teal Test',
        'colorHex' => '#0F9D9A',
        'isColorPigment' => 1,
    ], null, $adminActor);
    $conn->commit();
    assertTrue(!empty($syncResDup['synced']) && $syncResDup['action'] === 'linked_existing_color' && $syncResDup['colorId'] === $autoColorId, 'S5c: Second pigment product linked to existing Color Library entry without duplicating');

    // =========================================================================
    // SCENARIO 6: Two-Way Edit Sync (Color Name, HEX, Classification)
    // =========================================================================
    echo "\n--- Scenario 6: Two-Way Edit Sync ---\n";
    // 6a. Edit from Color Library -> verify Inventory updates
    $editClRes = colorLibrarySaveColor($conn, [
        'id' => $customColorId,
        'name' => 'Sunset Vermilion Pro',
        'hex' => '#D84315',
        'category' => 'Orange',
        'classification' => 'Tertiary Colors',
        'colorFamily' => 'Red-Orange',
        'variation' => 'Tone',
        'notes' => 'Updated custom pigment',
        'productCategory' => 'Tinting Color',
    ], $adminActor);
    assertTrue(!empty($editClRes['success']), 'S6a: Color Library edit succeeded');
    $autoProdEdited = $conn->query("SELECT * FROM products WHERE id = '{$conn->real_escape_string($autoProdId)}'")->fetch_assoc();
    assertTrue(
        $autoProdEdited['name'] === 'Sunset Vermilion Pro Pigment'
        && $autoProdEdited['color'] === 'Sunset Vermilion Pro'
        && $autoProdEdited['color_hex'] === '#D84315'
        && $autoProdEdited['color_classification'] === 'Tertiary Colors'
        && $autoProdEdited['category'] === 'Tinting Color',
        'S6a: Color Library edit synced Name (+ Pigment), HEX, Classification, and Category to Inventory'
    );

    // 6b. Edit from Inventory -> verify Color Library updates
    $conn->begin_transaction();
    $existingPigmentRow = $conn->query("SELECT * FROM products WHERE id = '{$conn->real_escape_string($pigmentPid)}'")->fetch_assoc();
    $syncEditInv = colorSyncFromInventoryProduct($conn, [
        'id' => $pigmentPid,
        'name' => 'Cobalt Teal Pigment',
        'type' => 'Pigment / Colorant',
        'category' => 'Pigment / Colorant',
        'color' => 'Deep Cobalt Teal',
        'colorId' => $autoColorId,
        'colorHex' => '#0A7E7B',
        'colorClassification' => 'Specialty Colors',
        'isColorPigment' => 1,
    ], $existingPigmentRow, $adminActor);
    $conn->commit();
    $clAfterInvEdit = $conn->query("SELECT * FROM color_library WHERE id = '{$conn->real_escape_string($autoColorId)}'")->fetch_assoc();
    assertTrue(
        !empty($syncEditInv['synced'])
        && $syncEditInv['action'] === 'updated_color'
        && $clAfterInvEdit['name'] === 'Deep Cobalt Teal'
        && $clAfterInvEdit['hex'] === '#0A7E7B'
        && $clAfterInvEdit['classification'] === 'Specialty Colors',
        'S6b: Inventory edit synced Name, HEX, and Classification back to Color Library'
    );

    // =========================================================================
    // SCENARIO 7 & 8: Receive Actual Stock for Auto-Created Product & Verify Stock Protection
    // =========================================================================
    echo "\n--- Scenario 7 & 8: Stock Receiving & Stock Accuracy ---\n";
    $sizeIdForAuto = (string)$autoSize['size_id'];
    $receivedCans = 12;
    $receivedLiters = 12.00;
    $batchId = 'BAT-TEST-' . bin2hex(random_bytes(3));
    $mvId = 'mv_test_' . bin2hex(random_bytes(3));
    $createdBatchIds[] = $batchId;
    $createdMovementIds[] = $mvId;

    $conn->begin_transaction();
    $conn->query("UPDATE inventory SET sealed_quantity = sealed_quantity + {$receivedCans} WHERE size_id = '{$conn->real_escape_string($sizeIdForAuto)}'");
    $conn->query("UPDATE products SET stock = {$receivedLiters}, can_stock = '{\"1\":{$receivedCans}}' WHERE id = '{$conn->real_escape_string($autoProdId)}'");
    $nowSql = date('Y-m-d H:i:s');
    $insBat = $conn->prepare("INSERT INTO inventory_batches (batch_id, size_id, product_id, product_name, brand, container_size, batch_number, date_received, original_qty, remaining_qty, source, created_by) VALUES (?, ?, ?, 'Sunset Vermilion Pro', 'Custom Pigment', 1.00, 'BATCH-SYNC-01', ?, ?, ?, 'receiving', 'Test Admin')");
    $insBat->bind_param('ssssii', $batchId, $sizeIdForAuto, $autoProdId, $nowSql, $receivedCans, $receivedCans);
    $insBat->execute();
    $insBat->close();
    $insMv = $conn->prepare("INSERT INTO movements (id, date, type, product_id, size_id, container_size, product_name, color_hex, qty_change, staff_name, note) VALUES (?, ?, 'stock_in', ?, ?, 1.00, 'Sunset Vermilion Pro', '#D84315', ?, 'Test Admin', 'Stock Receiving test')");
    $insMv->bind_param('ssssd', $mvId, $nowSql, $autoProdId, $sizeIdForAuto, $receivedLiters);
    $insMv->execute();
    $insMv->close();
    $conn->commit();

    // Now edit the Color Library entry again and confirm stock is 100% untouched!
    $editAfterStock = colorLibrarySaveColor($conn, [
        'id' => $customColorId,
        'name' => 'Sunset Vermilion Max',
        'hex' => '#BF360C',
        'category' => 'Orange',
        'classification' => 'Warm Colors',
        'colorFamily' => 'Coral',
        'variation' => 'Shade',
    ], $adminActor);

    $prodAfterStockEdit = $conn->query("SELECT stock, can_stock, name, color_hex FROM products WHERE id = '{$conn->real_escape_string($autoProdId)}'")->fetch_assoc();
    $invAfterStockEdit = $conn->query("SELECT sealed_quantity FROM inventory WHERE size_id = '{$conn->real_escape_string($sizeIdForAuto)}'")->fetch_assoc();
    assertTrue(!empty($editAfterStock['success']) && $prodAfterStockEdit['name'] === 'Sunset Vermilion Max Pigment' && $prodAfterStockEdit['color_hex'] === '#BF360C', 'S7/S8: Color edit after receiving updated display name & HEX');
    assertTrue((float)$prodAfterStockEdit['stock'] === 12.00 && (int)$invAfterStockEdit['sealed_quantity'] === 12, 'S8: Stock quantity remained strictly 12.00 L / 12 sealed cans (never altered by Color Library)');

    // =========================================================================
    // SCENARIO 9: Synchronization Failure & Database Rollback
    // =========================================================================
    echo "\n--- Scenario 9: Failure & Database Rollback ---\n";
    // 9a. Color Library -> Inventory simulated failure
    $clCountBeforeFail = (int)$conn->query("SELECT COUNT(*) AS c FROM color_library")->fetch_assoc()['c'];
    $pCountBeforeFail = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
    $failRes1 = colorLibrarySaveColor($conn, [
        'name' => 'Rollback Test Color',
        'hex' => '#445566',
        'category' => 'Blue',
        'classification' => 'Cool Colors',
    ], $adminActor, ['simulateFailure' => true]);

    $clCountAfterFail = (int)$conn->query("SELECT COUNT(*) AS c FROM color_library")->fetch_assoc()['c'];
    $pCountAfterFail = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
    assertTrue(empty($failRes1['success']) && $clCountAfterFail === $clCountBeforeFail && $pCountAfterFail === $pCountBeforeFail, 'S9a: Color Library -> Inventory failure rolled back BOTH color and product atomically');

    // 9b. Inventory -> Color Library simulated failure
    $failPid = colorSyncNextProductId($conn);
    $rolledBackInv = false;
    $conn->begin_transaction();
    try {
        $insFail = $conn->prepare("INSERT INTO products (id, product_id, product_name, name, brand, type, category, tax_classification, color, color_hex, is_color_pigment, price, stock, status) VALUES (?, ?, 'Rollback Pigment', 'Rollback Pigment', 'Test', 'Pigment / Colorant', 'Pigment / Colorant', 'vatable', 'Rollback Pigment Color', '#778899', 1, 100.00, 0.00, 'active')");
        $insFail->bind_param('ss', $failPid, $failPid);
        $insFail->execute();
        $insFail->close();

        colorSyncFromInventoryProduct($conn, [
            'id' => $failPid,
            'name' => 'Rollback Pigment',
            'type' => 'Pigment / Colorant',
            'category' => 'Pigment / Colorant',
            'color' => 'Rollback Pigment Color',
            'colorHex' => '#778899',
            'isColorPigment' => 1,
        ], null, $adminActor, ['simulateFailure' => true]);
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        $rolledBackInv = true;
    }
    $failProdExists = $conn->query("SELECT id FROM products WHERE id = '{$conn->real_escape_string($failPid)}'")->num_rows;
    $failClExists = $conn->query("SELECT id FROM color_library WHERE name = 'Rollback Pigment Color'")->num_rows;
    assertTrue($rolledBackInv && $failProdExists === 0 && $failClExists === 0, 'S9b: Inventory -> Color Library failure rolled back BOTH product and color atomically');

    // =========================================================================
    // SCENARIO 10: Mixed Color Catalog Protection, RBAC, & Archive/Unlink Protection
    // =========================================================================
    echo "\n--- Scenario 10: Mixed Catalog, RBAC, Archive/Unlink & Historical Protection ---\n";
    // 10a. Mixed Color Catalog formula must NEVER auto-create an inventory product
    $pCountBeforeFormula = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
    $formRes = colorLibrarySaveFormula($conn, [
        'name' => 'Test Mixed Sage Formula',
        'hexReference' => '#8FA89B',
        'baseType' => 'House Paint',
        'pigmentFormula' => [
            ['name' => 'White Paint', 'pct' => 70, 'hint' => 'white'],
            ['name' => 'Green Paint', 'pct' => 30, 'hint' => 'green'],
        ],
    ], $adminActor);
    if (!empty($formRes['formulaId'])) $createdFormulaIds[] = $formRes['formulaId'];
    $pCountAfterFormula = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
    assertTrue(!empty($formRes['success']) && $pCountAfterFormula === $pCountBeforeFormula, 'S10a: Mixed Color Catalog formula did NOT auto-create any inventory product');

    // 10b. RBAC: Non-admin (staff) cannot create Custom Color or trigger Inventory -> Color Library sync
    $staffClRes = colorLibrarySaveColor($conn, [
        'name' => 'Unauthorized Staff Color',
        'hex' => '#112233',
        'category' => 'Blue',
    ], $staffActor);
    $staffSyncRes = colorSyncFromInventoryProduct($conn, [
        'id' => 'PRD-STAFF-TEST',
        'name' => 'Staff Pigment',
        'type' => 'Pigment / Colorant',
        'category' => 'Pigment / Colorant',
        'color' => 'Staff Pigment Color',
        'colorHex' => '#112233',
        'isColorPigment' => 1,
    ], null, $staffActor);
    assertTrue(empty($staffClRes['success']) && ($staffClRes['status'] ?? 0) === 403 && empty($staffSyncRes['synced']), 'S10b: RBAC enforced (non-admin blocked from creating/syncing colors)');

    // 10c. Archive Custom Color must preserve linked inventory product & its stock!
    $archRes = colorLibraryDeleteColor($conn, $customColorId, $adminActor, '', 'archive');
    $prodStillExists = $conn->query("SELECT id, stock, color_id, color FROM products WHERE id = '{$conn->real_escape_string($autoProdId)}'")->fetch_assoc();
    $clArchived = $conn->query("SELECT is_archived, linked_product_id FROM color_library WHERE id = '{$conn->real_escape_string($customColorId)}'")->fetch_assoc();
    assertTrue(
        !empty($archRes['success'])
        && $prodStillExists
        && (float)$prodStillExists['stock'] === 12.00
        && $prodStillExists['color_id'] === null
        && (int)$clArchived['is_archived'] === 1
        && $clArchived['linked_product_id'] === null,
        'S10c: Archiving Custom Color preserved linked Inventory product and its 12.00 L stock'
    );

    // 10d. Historical sales unchanged
    $finalSalesCount = (int)$conn->query("SELECT COUNT(*) AS c FROM sales")->fetch_assoc()['c'];
    assertTrue($finalSalesCount === $origSalesCount, 'S10d: Historical sales records completely unchanged');

} finally {
    // Cleanup all test fixtures cleanly
    echo "\n--- Cleaning up test fixtures ---\n";
    foreach ($createdBatchIds as $bid) {
        $conn->query("DELETE FROM inventory_batches WHERE batch_id = '{$conn->real_escape_string($bid)}'");
    }
    foreach ($createdMovementIds as $mid) {
        $conn->query("DELETE FROM movements WHERE id = '{$conn->real_escape_string($mid)}'");
    }
    foreach ($createdFormulaIds as $fid) {
        $conn->query("DELETE FROM color_formulas WHERE id = '{$conn->real_escape_string($fid)}'");
    }
    foreach ($createdProductIds as $pid) {
        $conn->query("DELETE FROM color_inventory_sync_map WHERE product_id = '{$conn->real_escape_string($pid)}'");
        $conn->query("DELETE FROM products WHERE id = '{$conn->real_escape_string($pid)}'");
    }
    foreach ($createdColorIds as $cid) {
        $conn->query("DELETE FROM color_library WHERE id = '{$conn->real_escape_string($cid)}'");
    }
    $conn->query("DELETE FROM audit_logs WHERE user_id = 'u_admin' AND user_name = 'Test Admin'");

    $cleanProducts = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
    $cleanColors = (int)$conn->query("SELECT COUNT(*) AS c FROM color_library")->fetch_assoc()['c'];
    $cleanFormulas = (int)$conn->query("SELECT COUNT(*) AS c FROM color_formulas")->fetch_assoc()['c'];
    assertTrue($cleanProducts === $origProductsCount && $cleanColors === $origColorLibCount && $cleanFormulas === $origFormulasCount, 'Cleanup: Database restored to exact baseline counts');
}

echo "\n========================================\n";
echo "TOTAL PASSED: {$passed}\n";
echo "TOTAL FAILED: {$failed}\n";
echo "========================================\n";
exit($failed > 0 ? 1 : 0);
