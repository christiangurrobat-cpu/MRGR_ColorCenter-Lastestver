<?php
require_once 'config/database.php';
$c = getDBConnection();

$q1 = "UPDATE movements m JOIN product_sizes ps ON m.size_id = ps.size_id SET m.product_id = ps.product_id WHERE m.product_id != ps.product_id OR m.product_id IS NULL OR m.product_id = ''";
$c->query($q1);
$aff1 = $c->affected_rows;

$q2 = "UPDATE movements m JOIN products p ON (m.product_id = p.id OR m.product_id = p.product_id) SET m.product_name = p.name WHERE (m.product_name = 'Unknown product' OR m.product_name = '' OR m.product_name = '0') AND m.type != 'colormix'";
$c->query($q2);
$aff2 = $c->affected_rows;

echo "Healed movements: $aff1 product_id fixes, $aff2 product_name fixes.\n";

