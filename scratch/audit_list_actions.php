<?php
$lines = file('api/db.php');
$cases = [];
foreach ($lines as $num => $line) {
    if (preg_match('/case\s+[\'\"]([^\'\"]+)[\'\"]\s*:/', $line, $m)) {
        $cases[] = sprintf("%4d: %s", $num + 1, $m[1]);
    }
}
echo "Total actions in api/db.php: " . count($cases) . "\n";
echo implode("\n", $cases) . "\n";

