<?php
$lines = file('api/db.php');
$actions = [];
foreach ($lines as $num => $line) {
    if (preg_match('/if\s*\(\$action\s*===\s*[\'\"]([^\'\"]+)[\'\"]\)/', $line, $m)) {
        $actions[] = sprintf("%4d: %s", $num + 1, $m[1]);
    }
}
echo "Total actions in api/db.php: " . count($actions) . "\n";
echo implode("\n", $actions) . "\n";

