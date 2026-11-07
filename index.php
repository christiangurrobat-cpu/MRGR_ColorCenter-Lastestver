<?php
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

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
    $file = __DIR__ . $sub;
    if (file_exists($file) && !is_dir($file)) {
        if (substr($file, -4) === '.php') {
            require $file;
            exit;
        }
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if (isset($mimes[$ext])) {
            header('Content-Type: ' . $mimes[$ext]);
        }
        readfile($file);
        exit;
    }
} elseif ($uri !== '/' && $uri !== '/index.html' && $uri !== '/index.php' && $uri !== '/login.php') {
    $rootFile = __DIR__ . $uri;
    if (file_exists($rootFile) && !is_dir($rootFile)) {
        if (php_sapi_name() === 'cli-server') {
            return false;
        }
        if (substr($rootFile, -4) === '.php') {
            require $rootFile;
            exit;
        }
        $ext = strtolower(pathinfo($rootFile, PATHINFO_EXTENSION));
        if (isset($mimes[$ext])) {
            header('Content-Type: ' . $mimes[$ext]);
        }
        readfile($rootFile);
        exit;
    }
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
readfile(__DIR__ . '/index.html');
exit;
