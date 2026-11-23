<?php
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($uri) || $uri === '') {
    $uri = '/';
}

function serveAllowedStaticOrPhp($baseDir, $relPath, $mimes) {
    $relPath = '/' . ltrim($relPath, '/');
    $baseReal = realpath($baseDir);
    $targetReal = realpath($baseDir . $relPath);
    if ($baseReal === false || $targetReal === false || strpos($targetReal, $baseReal . DIRECTORY_SEPARATOR) !== 0) {
        return false;
    }
    if (is_dir($targetReal)) {
        return false;
    }
    $normRel = str_replace('\\', '/', substr($targetReal, strlen($baseReal)));
    if (substr($normRel, -4) === '.php') {
        // Only allow root entry PHP files and api/*.php
        if (!preg_match('#^/(index|login|admin)\.php$#', $normRel) && !preg_match('#^/api/[a-zA-Z0-9_-]+\.php$#', $normRel)) {
            http_response_code(403);
            exit;
        }
        require $targetReal;
        exit;
    }
    // Only allow static assets and favicons
    if (strpos($normRel, '/assets/') !== 0 && $normRel !== '/favicon.ico' && $normRel !== '/favicon.png') {
        http_response_code(403);
        exit;
    }
    if (php_sapi_name() === 'cli-server') {
        return false;
    }
    $ext = strtolower(pathinfo($targetReal, PATHINFO_EXTENSION));
    if (isset($mimes[$ext])) {
        header('Content-Type: ' . $mimes[$ext]);
    }
    if (!empty($_GET['v']) || in_array($ext, ['woff', 'woff2', 'ttf', 'png', 'jpg', 'jpeg', 'svg', 'ico'], true)) {
        header('Cache-Control: public, max-age=604800');
    }
    readfile($targetReal);
    exit;
}

// Force logout / fresh login screen when launched via start-app.vbs (?login=1) or /login.php
if (isset($_GET['login']) || $uri === '/login.php' || $uri === '/sales&inventory/login.php') {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            $params['secure'],
            $params['httponly']
        );
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
}

// Support both root requests (http://localhost/ or http://MRGR_ColorCenter/)
// and subfolder requests (http://localhost/sales&inventory/)
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

if (strpos($uri, '/sales&inventory') === 0) {
    $sub = substr($uri, strlen('/sales&inventory'));
    if ($sub === '' || $sub === '/' || $sub === '/index.html' || $sub === '/index.php') {
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        readfile(__DIR__ . '/index.html');
        exit;
    }
    $handled = serveAllowedStaticOrPhp(__DIR__, $sub, $mimes);
    if ($handled === false && php_sapi_name() === 'cli-server') {
        return false;
    }
} elseif ($uri !== '/' && $uri !== '/index.html' && $uri !== '/index.php' && $uri !== '/login.php') {
    $handled = serveAllowedStaticOrPhp(__DIR__, $uri, $mimes);
    if ($handled === false && php_sapi_name() === 'cli-server') {
        return false;
    }
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
readfile(__DIR__ . '/index.html');
exit;
