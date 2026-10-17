<?php
/**
 * Copy fixed Backend code into the Node app root (document root) and touch restart.
 * Hostinger Node Application root = public_html/ohoebazar.com (NOT .../Backend).
 * Writes .oho-ssl.json from cPanel certs so Node can serve https://ohoebazar.com:5017
 * while keeping HTTP on 127.0.0.1:5017 for Apache + health checks.
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

function oho_pick_ssl_pair($home, $domain = 'ohoebazar.com') {
  $needle = strtolower(str_replace('.', '_', $domain));
  $certDir = rtrim($home, '/') . '/ssl/certs';
  $keyDir = rtrim($home, '/') . '/ssl/keys';
  if (!is_dir($certDir) || !is_dir($keyDir)) {
    return null;
  }
  $certs = [];
  $bundles = [];
  foreach (scandir($certDir) ?: [] as $name) {
    if ($name === '.' || $name === '..') continue;
    $full = $certDir . '/' . $name;
    if (!is_file($full)) continue;
    $lower = strtolower($name);
    if (preg_match('/\.(cabundle|ca-bundle)$/', $lower) || strpos($lower, 'bundle') !== false) {
      $bundles[] = $full;
      continue;
    }
    if (preg_match('/\.(crt|pem)$/', $lower)) {
      $certs[] = $full;
    }
  }
  $keys = [];
  foreach (scandir($keyDir) ?: [] as $name) {
    if ($name === '.' || $name === '..') continue;
    $full = $keyDir . '/' . $name;
    if (is_file($full) && preg_match('/\.(key|pem)$/i', $name)) {
      $keys[] = $full;
    }
  }
  if (!$certs || !$keys) {
    return null;
  }
  $cert = null;
  foreach ($certs as $c) {
    if (stripos(basename($c), $needle) !== false) {
      $cert = $c;
      break;
    }
  }
  if (!$cert) {
    $cert = $certs[0];
  }
  $base = preg_replace('/\.(crt|pem)$/i', '', basename($cert));
  $key = null;
  foreach ($keys as $k) {
    if (strpos(basename($k), $base) === 0) {
      $key = $k;
      break;
    }
  }
  if (!$key) {
    foreach ($keys as $k) {
      if (stripos(basename($k), $needle) !== false) {
        $key = $k;
        break;
      }
    }
  }
  if (!$key) {
    $key = $keys[0];
  }
  $ca = null;
  foreach ($bundles as $b) {
    if (strpos(basename($b), $base) === 0 || stripos(basename($b), $needle) !== false) {
      $ca = $b;
      break;
    }
  }
  if (!$ca && $bundles) {
    $ca = $bundles[0];
  }
  return ['cert' => $cert, 'key' => $key, 'ca' => $ca];
}

function oho_set_apache_proxy_port($htaccessPath, $port) {
  if (!is_file($htaccessPath)) {
    return false;
  }
  $body = (string) @file_get_contents($htaccessPath);
  if ($body === '') {
    return false;
  }
  $updated = preg_replace(
    '#http://127\.0\.0\.1:\d+#',
    'http://127.0.0.1:' . (int) $port,
    $body
  );
  if (!is_string($updated)) {
    return false;
  }
  if ($updated === $body) {
    return (bool) preg_match('#http://127\.0\.0\.1:' . (int) $port . '#', $body);
  }
  return (bool) @file_put_contents($htaccessPath, $updated);
}

$docRoot = rtrim(str_replace('\\', '/', (string) ($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');
$src = $docRoot . '/Backend';
if (!is_file($src . '/controllers/vendorControllers/vendorMobileAuth.js')) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'message' => 'Backend source missing', 'src' => $src]);
  exit;
}

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

$home = getenv('HOME') ?: ('/home/' . get_current_user());
$sslPair = oho_pick_ssl_pair($home, 'ohoebazar.com');
$sslJson = null;
$apachePort = 5017;
if ($sslPair) {
  $sslJson = [
    'cert' => $sslPair['cert'],
    'key' => $sslPair['key'],
    'ca' => $sslPair['ca'],
  ];
  @file_put_contents($nodeRoot . '/.oho-ssl.json', json_encode($sslJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
  @file_put_contents($src . '/.oho-ssl.json', json_encode($sslJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}
// Always keep Apache on 5017 (Node serves HTTP on 127.0.0.1:5017 + HTTPS on public IP:5017).
oho_set_apache_proxy_port($docRoot . '/.htaccess', $apachePort);

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
  'ssl' => $sslJson ? [
    'written' => true,
    'cert' => basename((string) $sslJson['cert']),
    'key' => basename((string) $sslJson['key']),
    'ca' => $sslJson['ca'] ? basename((string) $sslJson['ca']) : null,
    'apachePort' => $apachePort,
  ] : ['written' => false, 'home' => $home, 'apachePort' => $apachePort],
  'rootHasHttpsBuild' => strpos($serverBody, 'https-5017-2026-10-17') !== false,
  'rootHasSslListen' => is_file($nodeRoot . '/utils/sslListen.js'),
  'actions' => [
    ['signal' => 'skipped — restart Node once from Hostinger panel to enable HTTPS :5017'],
  ],
];

usleep(300000);
$result['verifyHttp5017'] = oho_sh('curl -s -m 5 http://127.0.0.1:5017/api/__build || echo FAIL');
$result['verifyHttps5017'] = oho_sh('curl -sk -m 5 https://127.0.0.1:5017/api/__build || echo FAIL');
$result['verifyVia443'] = oho_sh('curl -s -m 5 https://ohoebazar.com/api/__build || echo FAIL');

@file_put_contents($docRoot . '/api-reload-status.json', json_encode($result, JSON_PRETTY_PRINT));
echo json_encode($result, JSON_PRETTY_PRINT);
