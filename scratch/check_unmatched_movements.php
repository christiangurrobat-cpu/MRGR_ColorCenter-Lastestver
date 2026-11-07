<?php
require_once 'config/database.php';
$c = getDBConnection();
$r = $c->query("SELECT m.id, m.product_id, m.size_id, m.type, m.product_name, m.note FROM movements m LEFT JOIN products p ON m.product_id = p.id OR m.product_id = p.product_id WHERE p.id IS NULL AND m.product_id IS NOT NULL AND m.product_id != '' AND m.product_id != '0'")->fetch_all(MYSQLI_ASSOC);
echo "Total movements with unmatched product_id: " . count($r) . "\n";
print_r($r);

