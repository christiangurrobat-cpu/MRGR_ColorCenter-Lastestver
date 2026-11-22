<?php
/**
 * Full Verification Suite: Automatically Generate Inventory Products from Base Color Library
 *
 * Verifies:
 * 1. All 83 existing Base Colors have exactly 1 corresponding Pigment / Colorant inventory product.
 * 2. All 14 pre-existing regular paint products (PRD-001..PRD-014) remain completely preserved.
 * 3. Newly generated Base Color products start with 0 stock, 0 sealed, 0 opened, 0 fabricated batches/movements.
 * 4. Idempotent reconciliation creates 0 duplicates.
 * 5. Adding a new test Base Color auto-creates "<Color Name> Pigment" with 0 stock.
 * 6. Duplicate name & HEX prevention works cleanly.
 * 7. HEX, color name, and classification changes sync cleanly without modifying stock.
 * 8. Stock Receiving updates stock accurately & survives subsequent Color Library edits.
 * 9. Mixed Color Catalog formulas never auto-create inventory products.
 * 10. Linked pigment products expose exact fields consumed by Color Mixing Studio.
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../api/color_library_lib.php';
require_once __DIR__ . '/../api/color_inventory_sync.php';

$conn = getDBConnection();
colorSyncEnsureSchema($conn);

$passed = 0;
$failed = 0;

function check($cond, string $label, string $detail = ''): void {
    global $passed, $failed;
    if ($cond) {
        $passed++;
        echo "[PASS] {$label}\n";
    } else {
        $failed++;
        echo "[FAIL] {$label}" . ($detail ? " -- {$detail}" : '') . "\n";
    }
}

$adminActor = ['id' => 'u_admin', 'name' => 'Verification Admin', 'role' => 'admin'];
$cleanupProductIds = [];
$cleanupColorIds = [];
$cleanupBatchIds = [];
$cleanupMovementIds = [];
$cleanupFormulaIds = [];

echo "=== Base Color Library -> Inventory Verification ===\n\n";

try {
    // 1. Verify all 83 existing Base Colors
    $baseColorsRes = $conn->query("SELECT * FROM color_library WHERE COALESCE(is_archived, 0) = 0 ORDER BY id ASC");
    $baseColors = [];
    while ($r = $baseColorsRes->fetch_assoc()) $baseColors[] = $r;

    check(count($baseColors) === 83, 'V1a: Exactly 83 active Base Colors present in color_library', 'Found: ' . count($baseColors));

    $missingLinks = 0;
    $badNames = 0;
    $badCategories = 0;
    $badHex = 0;
    $badCls = 0;
    $nonZeroInit = 0;
    $fabricatedBatches = 0;
    $fabricatedMovements = 0;
    $missingSizeInv = 0;
    $missingMap = 0;
    $seenLinkedPids = [];
    $dupLinkedPids = 0;

    foreach ($baseColors as $bc) {
        $cid = $bc['id'];
        $lpid = trim((string)($bc['linked_product_id'] ?? ''));
        if ($lpid === '') {
            $missingLinks++;
            continue;
        }
        if (isset($seenLinkedPids[$lpid])) {
            $dupLinkedPids++;
        }
        $seenLinkedPids[$lpid] = true;

        $p = $conn->query("SELECT * FROM products WHERE id = '{$conn->real_escape_string($lpid)}'")->fetch_assoc();
        if (!$p || $p['color_id'] !== $cid) {
            $missingLinks++;
            continue;
        }
        $expectedName = colorSyncFormatPigmentProductName($bc['name']);
        if ($p['name'] !== $expectedName) $badNames++;
        if ($p['category'] !== 'Pigment / Colorant' || $p['type'] !== 'Pigment / Colorant' || (int)$p['is_color_pigment'] !== 1) $badCategories++;
        if (strtoupper((string)$p['color_hex']) !== strtoupper((string)$bc['hex'])) $badHex++;
        if ((string)$p['color_classification'] !== (string)$bc['classification']) $badCls++;
        if ((float)$p['stock'] !== 0.0 || (float)$p['opened_stock'] !== 0.0) $nonZeroInit++;

        // Check product_sizes + inventory
        $sz = $conn->query("SELECT ps.size_id, inv.sealed_quantity, inv.opened_quantity, inv.remaining_volume FROM product_sizes ps JOIN inventory inv ON inv.size_id = ps.size_id WHERE ps.product_id = '{$conn->real_escape_string($lpid)}'")->fetch_assoc();
        if (!$sz || (int)$sz['sealed_quantity'] !== 0 || (int)$sz['opened_quantity'] !== 0 || (float)$sz['remaining_volume'] !== 0.0) {
            $missingSizeInv++;
        }

        // Check mapping table
        $mp = $conn->query("SELECT id FROM color_inventory_sync_map WHERE color_id = '{$conn->real_escape_string($cid)}' AND product_id = '{$conn->real_escape_string($lpid)}'")->fetch_assoc();
        if (!$mp) $missingMap++;

        // Check zero fabricated batches & movements
        $bCnt = (int)$conn->query("SELECT COUNT(*) AS c FROM inventory_batches WHERE product_id = '{$conn->real_escape_string($lpid)}'")->fetch_assoc()['c'];
        $mCnt = (int)$conn->query("SELECT COUNT(*) AS c FROM movements WHERE product_id = '{$conn->real_escape_string($lpid)}'")->fetch_assoc()['c'];
        if ($bCnt > 0) $fabricatedBatches++;
        if ($mCnt > 0) $fabricatedMovements++;
    }

    check($missingLinks === 0 && $dupLinkedPids === 0, 'V1b: Every one of the 83 Base Colors has 1 unique linked Inventory product', "missing={$missingLinks}, dup={$dupLinkedPids}");
    check($badNames === 0, 'V1c: All 83 pigment products named "<Color Name> Pigment"', "badNames={$badNames}");
    check($badCategories === 0, 'V1d: All 83 pigment products have category "Pigment / Colorant" and is_color_pigment=1', "badCat={$badCategories}");
    check($badHex === 0 && $badCls === 0, 'V1e: All 83 pigment products match Base Color HEX and Classification', "badHex={$badHex}, badCls={$badCls}");
    check($nonZeroInit === 0 && $missingSizeInv === 0, 'V1f: All 83 pigment products initialized to 0 stock (0 sealed, 0 opened, 0.00 remaining)', "nonZero={$nonZeroInit}, badSizeInv={$missingSizeInv}");
    check($fabricatedBatches === 0 && $fabricatedMovements === 0, 'V1g: Zero fabricated batches or receiving movements for generated pigment products', "batches={$fabricatedBatches}, movements={$fabricatedMovements}");
    check($missingMap === 0, 'V1h: All 83 Base Colors have mapping rows in color_inventory_sync_map', "missingMap={$missingMap}");

    // 2. Verify all 14 existing regular paint products remain preserved
    $regCount = (int)$conn->query("SELECT COUNT(*) AS c FROM products WHERE id IN ('PRD-001','PRD-002','PRD-003','PRD-004','PRD-005','PRD-006','PRD-007','PRD-008','PRD-009','PRD-010','PRD-011','PRD-012','PRD-013','PRD-014') AND is_color_pigment = 0")->fetch_assoc()['c'];
    $totalProdCount = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
    check($regCount === 14 && $totalProdCount === 97, 'V2: All 14 existing regular paint products preserved (total products = 14 + 83 = 97)', "reg={$regCount}, total={$totalProdCount}");

    // 3. Verify idempotency (re-running reconciliation creates 0 duplicates)
    $reRun = colorSyncEnsureAllBaseColorsHaveProducts($conn, $adminActor);
    $totalProdAfterReRun = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
    check($reRun['created'] === 0 && $reRun['alreadyLinked'] === 83 && $totalProdAfterReRun === 97, 'V3: Re-running Base Color sync is idempotent (0 duplicates created)');

    // 4. Add a new test Base Color -> verify automatic "<Color Name> Pigment" creation
    $addRes = colorLibrarySaveColor($conn, [
        'name' => 'Cerulean Spark',
        'hex' => '#0095B6',
        'category' => 'Blue',
        'classification' => 'Cool Colors',
        'colorFamily' => 'Blue',
        'variation' => 'Base',
        'notes' => 'Verification test base color',
    ], $adminActor);
    $testCid = (string)($addRes['color']['id'] ?? '');
    $testPid = (string)($addRes['syncedProductId'] ?? '');
    if ($testCid) $cleanupColorIds[] = $testCid;
    if ($testPid) $cleanupProductIds[] = $testPid;

    $testProd = $addRes['syncedProduct'] ?? null;
    check(!empty($addRes['success']) && ($addRes['syncAction'] ?? '') === 'created_product', 'V4a: New Base Color auto-created linked Inventory product');
    check(
        $testProd
        && $testProd['name'] === 'Cerulean Spark Pigment'
        && $testProd['category'] === 'Pigment / Colorant'
        && $testProd['colorId'] === $testCid
        && $testProd['colorHex'] === '#0095B6'
        && $testProd['colorClassification'] === 'Cool Colors'
        && (float)$testProd['stock'] === 0.0
        && !empty($testProd['isColorPigment']),
        'V4b: Auto-created product populated Name (+ Pigment), HEX, Classification, Category, Color Library ID, and 0 stock'
    );

    // 5. Duplicate prevention on new test Base Color
    $dup1 = colorLibrarySaveColor($conn, ['name' => 'cerulean spark', 'hex' => '#113355', 'category' => 'Blue'], $adminActor);
    $dup2 = colorLibrarySaveColor($conn, ['name' => 'Another Unique Blue', 'hex' => '#0095b6', 'category' => 'Blue'], $adminActor);
    check(empty($dup1['success']) && $dup1['status'] === 409 && empty($dup2['success']) && $dup2['status'] === 409, 'V5: Duplicate Base Color name and HEX strictly rejected (409)');

    // 6. Stock Receiving on auto-created product + HEX & Name Sync verification
    $testSizeId = $testProd['sizesData'][0]['sizeId'] ?? '';
    $batId = 'BAT-VTEST-' . bin2hex(random_bytes(3));
    $mvId = 'mv_vtest_' . bin2hex(random_bytes(3));
    $cleanupBatchIds[] = $batId;
    $cleanupMovementIds[] = $mvId;
    $nowSql = date('Y-m-d H:i:s');

    $conn->begin_transaction();
    $conn->query("UPDATE inventory SET sealed_quantity = sealed_quantity + 8 WHERE size_id = '{$conn->real_escape_string($testSizeId)}'");
    $conn->query("UPDATE products SET stock = 8.00, can_stock = '{\"1\":8}' WHERE id = '{$conn->real_escape_string($testPid)}'");
    $stB = $conn->prepare("INSERT INTO inventory_batches (batch_id, size_id, product_id, product_name, brand, container_size, batch_number, date_received, original_qty, remaining_qty, source, created_by) VALUES (?, ?, ?, 'Cerulean Spark Pigment', 'Custom Pigment', 1.00, 'RCV-VTEST-01', ?, 8, 8, 'receiving', 'Verification Admin')");
    $stB->bind_param('ssss', $batId, $testSizeId, $testPid, $nowSql);
    $stB->execute();
    $stB->close();
    $stM = $conn->prepare("INSERT INTO movements (id, date, type, product_id, size_id, container_size, product_name, color_hex, qty_change, staff_name, note) VALUES (?, ?, 'stock_in', ?, ?, 1.00, 'Cerulean Spark Pigment', '#0095B6', 8.00, 'Verification Admin', 'Stock Receiving verification')");
    $stM->bind_param('ssss', $mvId, $nowSql, $testPid, $testSizeId);
    $stM->execute();
    $stM->close();
    $conn->commit();

    // Edit Base Color name, HEX, and classification -> verify product updates AND stock remains 8.00 L
    $editRes = colorLibrarySaveColor($conn, [
        'id' => $testCid,
        'name' => 'Cerulean Glow',
        'hex' => '#00A8CC',
        'category' => 'Blue',
        'classification' => 'Specialty Colors',
        'colorFamily' => 'Turquoise',
        'variation' => 'Tint',
    ], $adminActor);

    $afterEditPayload = colorSyncFetchProductPayload($conn, $testPid);
    check(
        !empty($editRes['success'])
        && $afterEditPayload['name'] === 'Cerulean Glow Pigment'
        && $afterEditPayload['color'] === 'Cerulean Glow'
        && $afterEditPayload['colorHex'] === '#00A8CC'
        && $afterEditPayload['colorClassification'] === 'Specialty Colors',
        'V6: Editing Base Color synced Name (+ Pigment), HEX, and Classification to Inventory product'
    );
    check(
        (float)$afterEditPayload['stock'] === 8.0
        && (int)$afterEditPayload['sizesData'][0]['sealedQuantity'] === 8,
        'V7: Stock Receiving updated inventory to 8.00 L / 8 cans and Color Library edit did NOT alter stock'
    );

    // 7. Mixed Color Catalog Protection (85 presets + custom formulas never auto-create inventory products)
    $pBeforeMix = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
    $fRes = colorLibrarySaveFormula($conn, [
        'name' => 'Verification Mixed Pastel Formula',
        'hexReference' => '#DCEEF3',
        'baseType' => 'House Paint',
        'pigmentFormula' => [
            ['name' => 'Pure White Pigment', 'pct' => 85, 'hint' => 'white', 'colorId' => 'clr_bi_pure_white'],
            ['name' => 'Cerulean Glow Pigment', 'pct' => 15, 'hint' => 'cerulean glow', 'colorId' => $testCid],
        ],
    ], $adminActor);
    if (!empty($fRes['formulaId'])) $cleanupFormulaIds[] = $fRes['formulaId'];
    $pAfterMix = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
    check(!empty($fRes['success']) && $pAfterMix === $pBeforeMix, 'V8: Mixed Color Catalog formula did NOT auto-create any Inventory product');

    // 8. Color Mixing Studio Compatibility Check
    // Confirm linked pigment product exposes active status, colorId, colorHex, isColorPigment, and usable stock
    check(
        $afterEditPayload['status'] === 'active'
        && $afterEditPayload['colorId'] === $testCid
        && $afterEditPayload['colorHex'] === '#00A8CC'
        && $afterEditPayload['isColorPigment'] === true
        && (float)$afterEditPayload['stock'] > 0,
        'V9: Color Mixing Studio can identify and use linked pigment product by colorId, name/hint, HEX, and live stock'
    );

} finally {
    echo "\n--- Cleaning up temporary test records (keeping all 83 Base Colors & their 83 linked pigments intact) ---\n";
    foreach ($cleanupBatchIds as $bid) {
        $conn->query("DELETE FROM inventory_batches WHERE batch_id = '{$conn->real_escape_string($bid)}'");
    }
    foreach ($cleanupMovementIds as $mid) {
        $conn->query("DELETE FROM movements WHERE id = '{$conn->real_escape_string($mid)}'");
    }
    foreach ($cleanupFormulaIds as $fid) {
        $conn->query("DELETE FROM color_formulas WHERE id = '{$conn->real_escape_string($fid)}'");
    }
    foreach ($cleanupProductIds as $pid) {
        $conn->query("DELETE FROM color_inventory_sync_map WHERE product_id = '{$conn->real_escape_string($pid)}'");
        $conn->query("DELETE FROM products WHERE id = '{$conn->real_escape_string($pid)}'");
    }
    foreach ($cleanupColorIds as $cid) {
        $conn->query("DELETE FROM color_library WHERE id = '{$conn->real_escape_string($cid)}'");
    }
    $conn->query("DELETE FROM audit_logs WHERE user_id = 'u_admin' AND user_name = 'Verification Admin'");

    $finalBase = (int)$conn->query("SELECT COUNT(*) AS c FROM color_library WHERE COALESCE(is_archived,0)=0")->fetch_assoc()['c'];
    $finalProds = (int)$conn->query("SELECT COUNT(*) AS c FROM products")->fetch_assoc()['c'];
    $finalPigments = (int)$conn->query("SELECT COUNT(*) AS c FROM products WHERE is_color_pigment = 1")->fetch_assoc()['c'];
    check($finalBase === 83 && $finalPigments === 83 && $finalProds === 97, 'Cleanup: 83 Base Colors, 83 linked Pigment products, and 14 regular paint products intact');
}

echo "\n========================================\n";
echo "TOTAL PASSED: {$passed}\n";
echo "TOTAL FAILED: {$failed}\n";
echo "========================================\n";
exit($failed > 0 ? 1 : 0);
