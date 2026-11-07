<?php
$files = glob(__DIR__ . '/../assets/js/*.js');
foreach ($files as $f) {
    $content = file_get_contents($f);
    $escapes = substr_count($content, 'escapeHtml');
    $innerHtmls = substr_count($content, 'innerHTML');
    echo basename($f) . ": escapeHtml=$escapes, innerHTML=$innerHtmls\n";
}

