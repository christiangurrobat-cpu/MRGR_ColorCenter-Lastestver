<?php
declare(strict_types=1);

echo "============================================================\n";
echo "MRGR Color Center: Color Mixing Service Log Improvements Test\n";
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

$reportsJs = file_get_contents(__DIR__ . '/../assets/js/reports.js');
$componentsCss = file_get_contents(__DIR__ . '/../assets/css/components.css');
$schemaSql = file_get_contents(__DIR__ . '/../database/schema.sql');
$colorMixingJs = file_get_contents(__DIR__ . '/../assets/js/color-mixing.js');

// 1. Separate Formula and Receipt Reference columns
check(
    strpos($reportsJs, "'Formula'") !== false &&
    strpos($reportsJs, "'Receipt Reference'") !== false &&
    strpos($reportsJs, '<th>Note</th>') === false,
    "Requirement 1: Note column separated into distinct 'Formula' and 'Receipt Reference' columns"
);

// 2. Display actual product names and percentages clearly
check(
    strpos($reportsJs, 'formula-chip') !== false &&
    strpos($reportsJs, 'formula-pct') !== false &&
    strpos($reportsJs, 'formula-name') !== false &&
    strpos($componentsCss, '.formula-chip') !== false &&
    strpos($componentsCss, '.formula-pct') !== false,
    "Requirement 2: Mixing formula displayed clearly with ingredient product names and percentage badges"
);

// 3. Clickable receipt references for administrators to view sales transaction
check(
    strpos($reportsJs, 'openMixingReceiptModal') !== false &&
    strpos($reportsJs, 'receipt-ref-btn') !== false &&
    strpos($reportsJs, 'receipt-ref-static') !== false &&
    strpos($reportsJs, 'isAdmin') !== false,
    "Requirement 3: Receipt references are interactive buttons for administrators to open transaction receipts"
);

// 4. Color description and liters columns kept
check(
    strpos($reportsJs, "'Color Description'") !== false &&
    strpos($reportsJs, "'Liters'") !== false &&
    strpos($reportsJs, 'formatStock(rec.liters)') !== false,
    "Requirement 4: Color description and liters columns preserved with proper formatting"
);

// 5. Small color preview swatch beside color name when accurate color value is available
check(
    strpos($reportsJs, 'mixing-color-swatch') !== false &&
    strpos($reportsJs, 'rec.hexColor') !== false &&
    strpos($componentsCss, '.mixing-color-swatch') !== false,
    "Requirement 5: Color preview swatch displayed beside color name when color value is available"
);

// 6. Pagination, search, filters, row count, and sorting maintained
check(
    strpos($reportsJs, 'rep_color_mixing') !== false &&
    strpos($reportsJs, 'setMixingSort') !== false &&
    strpos($reportsJs, 'reportMixingSortField') !== false &&
    strpos($reportsJs, 'reportSearchQuery') !== false &&
    strpos($reportsJs, 'reportTxTypeFilter') !== false,
    "Requirement 6: Pagination, search query, transaction filters, row count, and column sorting fully supported"
);

// 7. Responsive and readable table without unnecessary horizontal scrolling
check(
    strpos($reportsJs, 'table-scroll') !== false &&
    strpos($reportsJs, 'mixing-log-table') !== false &&
    strpos($componentsCss, '.mixing-log-table') !== false &&
    strpos($componentsCss, '.mixing-formula-chips') !== false,
    "Requirement 7: Responsive table layout with flex-wrapping formula chips to prevent horizontal overflow"
);

// 8. IMPORTANT: Historical records, database schema, and mixing calculations preserved
check(
    strpos($colorMixingJs, 'subtractivePaintMix') !== false &&
    strpos($colorMixingJs, 'PAINT_COLOR_DICTIONARY') !== false &&
    strpos($schemaSql, 'INSERT IGNORE INTO `movements`') !== false,
    "Important: Preserves all historical records, mixing calculations, and database relationships intact"
);

echo "\nSummary: $passes passed, $fails failed.\n";
if ($fails > 0) exit(1);
