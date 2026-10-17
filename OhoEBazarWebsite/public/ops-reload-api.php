<?php
/**
 * Copy fixed Backend code into the Node app root (document root) and touch restart.
 * Hostinger Node Application root = public_html/ohoebazar.com (NOT .../Backend).
 * GET /ops-reload-api.php?token=oho-reload-2026-10-17
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
@set_time_limit(30);

$expected = 'oho-reload-2026-10-17';
$token = isset($_GET['token']) ? (string) $_GET['token'] : '';
if (!hash_equals($expected, $token)) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'message' => 'Forbidden']);
  exit;
}

function oho_copy_tree($from, $to) {
  if (!is_dir($from)) {
    return false;
  }
  if (!is_dir($to) && !@mkdir($to, 0755, true)) {
    return false;
  }
  $it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($from, RecursiveDirectoryIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST
  );
  foreach ($it as $item) {
    $dest = $to . DIRECTORY_SEPARATOR . $it->getSubPathName();
    if ($item->isDir()) {
      if (!is_dir($dest)) {
        @mkdir($dest, 0755, true);
      }
    } else {
      @copy($item->getPathname(), $dest);
    }
  }
  return true;
}

function oho_sh($cmd) {
  if (!function_exists('shell_exec')) {
    return null;
  }
  $out = @shell_exec($cmd . ' 2>/dev/null');
  return is_string($out) ? trim($out) : null;
}

$docRoot = rtrim(str_replace('\\', '/', (string) ($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');
$src = $docRoot . '/Backend';
if (!is_file($src . '/controllers/vendorControllers/vendorMobileAuth.js')) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'message' => 'Backend source missing', 'src' => $src]);
  exit;
}

// Node app root on this host is the document root (server.js + controllers/ sit next to Backend/)
$nodeRoot = $docRoot;
$parts = ['controllers', 'utils', 'routes', 'models', 'middleware', 'config', 'scripts'];
$copied = [];
foreach ($parts as $part) {
  $from = $src . '/' . $part;
  $to = $nodeRoot . '/' . $part;
  if (is_dir($from)) {
    $copied[$part] = oho_copy_tree($from, $to);
  }
}

$files = ['server.js', 'package.json', 'package-lock.json'];
$fileCopy = [];
foreach ($files as $file) {
  $from = $src . '/' . $file;
  $to = $nodeRoot . '/' . $file;
  if (is_file($from)) {
    $fileCopy[$file] = @copy($from, $to);
  }
}

$authRoot = $nodeRoot . '/controllers/vendorControllers/vendorMobileAuth.js';
$authBody = is_file($authRoot) ? (string) @file_get_contents($authRoot) : '';
$serverBody = is_file($nodeRoot . '/server.js') ? (string) @file_get_contents($nodeRoot . '/server.js') : '';

foreach ([$nodeRoot . '/tmp', $src . '/tmp'] as $tmp) {
  if (!is_dir($tmp)) {
    @mkdir($tmp, 0755, true);
  }
  @file_put_contents($tmp . '/restart.txt', (string) time());
}

$result = [
  'ok' => true,
  'time' => gmdate('c'),
  'message' => 'Synced Backend -> document root (Node app root)',
  'src' => $src,
  'nodeRoot' => $nodeRoot,
  'copiedDirs' => $copied,
  'copiedFiles' => $fileCopy,
  'rootHasBuildTag' => strpos($authBody, 'service-login-2026-10-17') !== false,
  'rootHasApiBuildRoute' => strpos($serverBody, '/api/__build') !== false,
  'actions' => [],
];

// Do NOT kill the Node process — Hostinger may wrap :5017 with TLS; killing breaks https://host:5017.
$result['actions'][] = ['signal' => 'skipped (avoid breaking Hostinger TLS wrapper)'];

usleep(500000);
$result['verifyBuild'] = oho_sh('curl -s -m 5 http://127.0.0.1:5017/api/__build || echo FAIL');
$result['verifyCheckPhone'] = oho_sh(
  'curl -s -m 5 -X POST http://127.0.0.1:5017/api/vendor/auth/check-phone '
  . '-H "Content-Type: application/json" '
  . '-d \'{"phone":"9650555555","purpose":"vendor_login"}\' || echo FAIL'
);
$result['verifyVia443'] = oho_sh(
  'curl -s -m 5 https://127.0.0.1/api/__build -k || curl -s -m 5 https://ohoebazar.com/api/__build || echo FAIL'
);

@file_put_contents($docRoot . '/api-reload-status.json', json_encode($result, JSON_PRETTY_PRINT));
echo json_encode($result, JSON_PRETTY_PRINT);
