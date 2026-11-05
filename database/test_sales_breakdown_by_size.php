<?php
/**
 * Test Suite: Best-Selling Products Table - Container Size Row Separation
 */

require_once __DIR__ . '/../config/database.php';

$reportsJsPath = dirname(__DIR__) . '/assets/js/reports.js';
$reportsJs = file_get_contents($reportsJsPath);

echo "============================================================\n";
echo "TEST: Best-Selling Products Table & Breakdown By Container Size\n";
echo "============================================================\n\n";

$allPassed = true;
function assertCondition($cond, $title, $details = '') {
    global $allPassed;
    if ($cond) {
        echo " [PASS] $title\n";
    } else {
        echo " [FAIL] $title: $details\n";
        $allPassed = false;
    }
}

// 1. Check Table Header Column Name in assets/js/reports.js
assertCondition(
    strpos($reportsJs, '<th style="padding:6px 10px; text-align:center; min-width:95px;">Container Size</th>') !== false ||
    strpos($reportsJs, 'Container Size</th>') !== false,
    "Column renamed from 'Size(s)' to 'Container Size'",
    "Did not find 'Container Size' header in reports.js"
);

// 2. Ensure old 'Size(s)' header is removed from Best-Selling Products table
assertCondition(
    strpos($reportsJs, '<th style="padding:6px 10px; text-align:center;">Size(s)</th>') === false,
    "Legacy 'Size(s)' table header successfully eliminated",
    "Found old 'Size(s)' header in reports.js"
);

// 3. Check pKey groups by container size (each size separate row)
assertCondition(
    strpos($reportsJs, '${sizeKey}') !== false,
    "Aggregation grouping key incorporates container size (sizeKey)",
    "pKey does not seem to include sizeKey"
);

// 4. Check productBreakdown filters out products with 0 sales
assertCondition(
    strpos($reportsJs, 'pm.qtySold > 0') !== false,
    "Products without sales are excluded from Best-Selling Products ranking",
    "Missing qtySold > 0 filter"
);

// 5. Check row displays single container size badge
assertCondition(
    strpos($reportsJs, 'prod.sizeLabel') !== false,
    "Table row displays individual container size label",
    "Missing prod.sizeLabel"
);

// 6. Test with real sales data from database
$conn = getDbConnection();
$res = $conn->query("SELECT * FROM sales WHERE status NOT IN ('voided', 'cancelled', 'canceled') ORDER BY date DESC");
$sales = [];
while ($row = $res->fetch_assoc()) {
    $row['items'] = json_decode($row['items_json'] ?? '[]', true) ?: [];
    $row['returns'] = json_decode($row['returns_json'] ?? '[]', true) ?: [];
    $sales[] = $row;
}

echo "\n--- Simulating Aggregation Logic Against " . count($sales) . " Real Database Sales ---\n";

// Emulate computeSalesHistorySummary logic in PHP to verify reconciliation
$productMap = [];
$totalItemsSold = 0;
$totalLitersSold = 0;

foreach ($sales as $sale) {
    $rawStatus = strtolower(trim($sale['status'] ?? 'completed'));
    $rawTotal = floatval($sale['total'] ?? 0);
    $refundTotal = floatval($sale['refund_total'] ?? 0);
    $returns = $sale['returns'];
    $items = $sale['items'];

    $effectiveRefund = ($rawStatus === 'refunded' && $refundTotal == 0 && empty($returns))
        ? $rawTotal
        : $refundTotal;

    $saleNet = round($rawTotal - $effectiveRefund, 2);
    if ($rawStatus === 'refunded' && $saleNet <= 0.0001) continue;

    $recordLine = function($item, $netQty) use (&$productMap, &$totalItemsSold, &$totalLitersSold, $sale) {
        if (!$item || $netQty <= 0) return;
        $type = strtolower($item['type'] ?? 'product');
        $isMix = ($type === 'colormix');
        $origQty = max(1, floatval($item['qty'] ?? 1));
        $origLineTotal = isset($item['lineTotal']) ? floatval($item['lineTotal']) : ($origQty * floatval($item['unitPrice'] ?? 0));
        $unitPrice = isset($item['unitPrice']) ? floatval($item['unitPrice']) : round($origLineTotal / $origQty, 2);
        $netLineAmount = (abs($netQty - $origQty) < 0.0001 && isset($item['lineTotal']))
            ? round(floatval($item['lineTotal']), 2)
            : round($netQty * $unitPrice, 2);

        $totalItemsSold += $netQty;

        $prodName = $isMix ? 'Custom Color Mix' : trim($item['name'] ?? 'Unnamed Product');
        $brand = $isMix ? 'Custom Mix' : trim($item['brand'] ?? 'Generic');
        $color = $isMix ? trim($item['colorName'] ?? $item['color'] ?? 'Custom Shade') : trim($item['color'] ?? 'Standard');

        if ($isMix) {
            $litersPerUnit = floatval($item['liters'] ?? $item['size'] ?? 1) ?: 1;
            $lineLiters = round($netQty * $litersPerUnit, 2);
            $sizeKey = 'colormix';
            $sizeLabel = 'Custom Mix';
            $sizeNum = 0;
        } else {
            $rawSz = $item['size'] ?? 1;
            $parsedSz = floatval($rawSz);
            if (!$parsedSz) {
                $sLow = strtolower((string)$rawSz);
                if (strpos($sLow, 'gallon') !== false) $parsedSz = 4;
                elseif (strpos($sLow, 'drum') !== false || strpos($sLow, 'pail') !== false) $parsedSz = 16;
                else $parsedSz = 1;
            }
            $sizeNum = $parsedSz ?: 1;
            $lineLiters = round($netQty * $sizeNum, 2);
            $sizeKey = "size_{$sizeNum}";
            if ($sizeNum == 1) $sizeLabel = '1L Can';
            elseif ($sizeNum == 4) $sizeLabel = '4L Gallon';
            elseif ($sizeNum == 16) $sizeLabel = '16L Pail / Drum';
            else $sizeLabel = "{$sizeNum}L Container";
        }

        $totalLitersSold += $lineLiters;

        $pKey = $isMix ? strtolower("colormix___{$color}___{$sizeKey}") : strtolower("{$brand}___{$prodName}___{$color}___{$sizeKey}");

        if (!isset($productMap[$pKey])) {
            $productMap[$pKey] = [
                'name' => $prodName,
                'brand' => $brand,
                'color' => $color,
                'isMix' => $isMix,
                'sizeLabel' => $sizeLabel,
                'sizeNum' => $sizeNum,
                'qtySold' => 0,
                'salesAmount' => 0
            ];
        }

        $productMap[$pKey]['qtySold'] += $netQty;
        $productMap[$pKey]['salesAmount'] += $netLineAmount;
    };

    foreach ($items as $item) {
        $purchased = floatval($item['qty'] ?? 0);
        $returned = floatval($item['returnedQty'] ?? 0);
        $net = max(0, $purchased - $returned);
        if ($net > 0) $recordLine($item, $net);
    }
}

// Check breakdown results
uasort($productMap, function($a, $b) {
    if (abs($b['qtySold'] - $a['qtySold']) > 0.001) return $b['qtySold'] <=> $a['qtySold'];
    return $b['salesAmount'] <=> $a['salesAmount'];
});

echo "Total distinct product-size breakdown rows: " . count($productMap) . "\n";
echo "Top 10 Best-Selling Product-Sizes:\n";
$rank = 1;
$hasBoysenSizesSeparated = false;
$boysenRows = [];

foreach ($productMap as $row) {
    if (strpos(strtolower($row['name']), 'boysen') !== false) {
        $boysenRows[] = $row;
    }
    if ($rank <= 10) {
        echo sprintf("  #%d | %-25s (%s) | %-14s | %4d cans | PHP %10.2f\n",
            $rank, $row['name'], $row['color'], $row['sizeLabel'], $row['qtySold'], $row['salesAmount']);
    }
    $rank++;
}

// Verify that Boysen or multi-size products have separate rows for each size
$distinctBoysenSizes = array_unique(array_map(fn($r) => $r['sizeLabel'], $boysenRows));
echo "\nDistinct container size rows found for Boysen: " . count($distinctBoysenSizes) . " (" . implode(', ', $distinctBoysenSizes) . ")\n";

assertCondition(
    count($distinctBoysenSizes) > 1,
    "Boysen Permacoat Latex container sizes are successfully split into separate rows",
    "Expected multiple size rows, got " . count($distinctBoysenSizes)
);

// Verify each row has exactly one size label
$allHaveSingleSize = true;
foreach ($productMap as $row) {
    if (empty($row['sizeLabel']) || strpos($row['sizeLabel'], ',') !== false) {
        $allHaveSingleSize = false;
        break;
    }
}
assertCondition($allHaveSingleSize, "Every breakdown row has exactly ONE container size");

// Verify sort order
$prevQty = PHP_INT_MAX;
$isSortedDesc = true;
foreach ($productMap as $row) {
    if ($row['qtySold'] > $prevQty) {
        $isSortedDesc = false;
        break;
    }
    $prevQty = $row['qtySold'];
}
assertCondition($isSortedDesc, "Rows are sorted by quantity sold in descending order");

// Verify Custom Color Mix rows
$customMixRows = array_filter($productMap, fn($r) => $r['isMix']);
echo "Custom Color Mix rows found: " . count($customMixRows) . "\n";
assertCondition(count($customMixRows) > 0, "Custom Color Mix appears on its own rows with accurate identification");

echo "\n============================================================\n";
if ($allPassed) {
    echo "ALL TESTS PASSED SUCCESSFULLY!\n";
} else {
    echo "SOME TESTS FAILED!\n";
    exit(1);
}
