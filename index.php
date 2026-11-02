<?php
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Support both root requests (http://localhost/ or http://MRGR_ColorCenter/)
// and subfolder requests (http://localhost/sales&inventory/)
if (strpos($uri, '/sales&inventory') === 0) {
    $sub = substr($uri, strlen('/sales&inventory'));
    if ($sub === '' || $sub === '/' || $sub === '/index.html' || $sub === '/index.php') {
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        readfile(__DIR__ . '/index.html');
        exit;
    }
    $file = __DIR__ . $sub;
    if (file_exists($file) && !is_dir($file)) {
        if (substr($file, -4) === '.php') {
            require $file;
            exit;
        }
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $mimes = [
            'js' => 'application/javascript; charset=utf-8',
            'css' => 'text/css; charset=utf-8',
            'html' => 'text/html; charset=utf-8',
            'json' => 'application/json; charset=utf-8',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'svg' => 'image/svg+xml',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'ttf' => 'font/ttf',
            'ico' => 'image/x-icon'
        ];
        if (isset($mimes[$ext])) {
            header('Content-Type: ' . $mimes[$ext]);
        }
        readfile($file);
        exit;
    }
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
readfile(__DIR__ . '/index.html');
exit;
