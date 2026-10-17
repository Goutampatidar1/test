<?php
/**
 * Sync Backend → Node app root + wire trusted HTTPS for :5017.
 * Uses the same Let's Encrypt chain Apache serves on :443, plus matching private key.
 * GET /ops-reload-api.php?token=oho-reload-2026-10-17
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
@set_time_limit(45);

$expected = 'oho-reload-2026-10-17';
$token = isset($_GET['token']) ? (string) $_GET['token'] : '';
if (!hash_equals($expected, $token)) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'message' => 'Forbidden']);
  exit;
}

function oho_copy_tree($from, $to) {
  if (!is_dir($from)) return false;
  if (!is_dir($to) && !@mkdir($to, 0755, true)) return false;
  $it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($from, RecursiveDirectoryIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST
  );
  foreach ($it as $item) {
    $dest = $to . DIRECTORY_SEPARATOR . $it->getSubPathName();
    if ($item->isDir()) {
      if (!is_dir($dest)) @mkdir($dest, 0755, true);
    } else {
      @copy($item->getPathname(), $dest);
    }
  }
  return true;
}

function oho_sh($cmd) {
  if (!function_exists('shell_exec')) return null;
  $out = @shell_exec($cmd . ' 2>/dev/null');
  return is_string($out) ? trim($out) : null;
}

function oho_ssl_modulus_from_pem($pem, $type) {
  $tmp = tempnam(sys_get_temp_dir(), 'oho');
  if ($tmp === false) return null;
  @file_put_contents($tmp, $pem);
  $file = escapeshellarg($tmp);
  if ($type === 'cert') {
    $out = oho_sh("openssl x509 -noout -modulus -in $file");
  } else {
    $out = oho_sh("openssl rsa -noout -modulus -in $file");
    if (!$out) $out = oho_sh("openssl pkey -noout -modulus -in $file");
  }
  @unlink($tmp);
  if (!$out || stripos($out, 'Modulus=') === false) return null;
  return strtoupper(preg_replace('/^Modulus=/i', '', trim($out)));
}

function oho_ssl_modulus_file($path, $type) {
  $file = escapeshellarg($path);
  if ($type === 'cert') {
    $out = oho_sh("openssl x509 -noout -modulus -in $file");
  } else {
    $out = oho_sh("openssl rsa -noout -modulus -in $file");
    if (!$out) $out = oho_sh("openssl pkey -noout -modulus -in $file");
  }
  if (!$out || stripos($out, 'Modulus=') === false) return null;
  return strtoupper(preg_replace('/^Modulus=/i', '', trim($out)));
}

/**
 * Pull live trusted chain from Apache :443 and find matching private key.
 */
function oho_build_ssl_from_443($home, $domain = 'ohoebazar.com') {
  $show = oho_sh(
    'echo | openssl s_client -connect 127.0.0.1:443 -servername ' . escapeshellarg($domain) . ' -showcerts'
  );
  if (!$show || !preg_match_all('/-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----/s', $show, $m)) {
    $show = oho_sh(
      'echo | openssl s_client -connect ' . escapeshellarg($domain . ':443') . ' -servername ' . escapeshellarg($domain) . ' -showcerts'
    );
  }
  if (!$show || !preg_match_all('/-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----/s', $show, $m)) {
    return null;
  }
  $pems = $m[0];
  $leaf = $pems[0];
  $fullchain = implode("\n", $pems) . "\n";
  $modLeaf = oho_ssl_modulus_from_pem($leaf, 'cert');
  if (!$modLeaf) return null;

  $keyDir = rtrim($home, '/') . '/ssl/keys';
  if (!is_dir($keyDir)) return null;
  $keyPath = null;
  foreach (scandir($keyDir) ?: [] as $name) {
    if ($name === '.' || $name === '..') continue;
    if (!preg_match('/\.(key|pem)$/i', $name)) continue;
    $full = $keyDir . '/' . $name;
    $modKey = oho_ssl_modulus_file($full, 'key');
    if ($modKey && hash_equals($modLeaf, $modKey)) {
      $keyPath = $full;
      break;
    }
  }
  $tmpLeaf = tempnam(sys_get_temp_dir(), 'ohoLeaf');
  @file_put_contents($tmpLeaf, $leaf);
  $leafSubject = oho_sh('openssl x509 -noout -subject -in ' . escapeshellarg($tmpLeaf));
  $leafIssuer = oho_sh('openssl x509 -noout -issuer -in ' . escapeshellarg($tmpLeaf));
  @unlink($tmpLeaf);

  if (!$keyPath) {
    return [
      'error' => 'no_matching_private_key',
      'leafSubject' => $leafSubject,
      'leafIssuer' => $leafIssuer,
    ];
  }

  return [
    'fullchainPem' => $fullchain,
    'key' => $keyPath,
    'leafSubject' => $leafSubject,
    'leafIssuer' => $leafIssuer,
  ];
}

function oho_set_apache_proxy_port($htaccessPath, $port) {
  if (!is_file($htaccessPath)) return false;
  $body = (string) @file_get_contents($htaccessPath);
  if ($body === '') return false;
  $updated = preg_replace('#http://127\.0\.0\.1:\d+#', 'http://127.0.0.1:' . (int) $port, $body);
  if (!is_string($updated)) return false;
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
  if (is_dir($from)) $copied[$part] = oho_copy_tree($from, $to);
}

$fileCopy = [];
foreach (['server.js', 'package.json', 'package-lock.json'] as $file) {
  $from = $src . '/' . $file;
  $to = $nodeRoot . '/' . $file;
  if (is_file($from)) $fileCopy[$file] = @copy($from, $to);
}

$home = getenv('HOME') ?: ('/home/' . get_current_user());
$apachePort = 5017;
oho_set_apache_proxy_port($docRoot . '/.htaccess', $apachePort);

$sslFrom443 = oho_build_ssl_from_443($home, 'ohoebazar.com');
$sslJson = null;
$sslMeta = ['written' => false];

if (is_array($sslFrom443) && !empty($sslFrom443['fullchainPem']) && !empty($sslFrom443['key'])) {
  $fullchainPath = $nodeRoot . '/.oho-fullchain.pem';
  @file_put_contents($fullchainPath, $sslFrom443['fullchainPem']);
  @file_put_contents($src . '/.oho-fullchain.pem', $sslFrom443['fullchainPem']);
  $sslJson = [
    'cert' => $fullchainPath,
    'key' => $sslFrom443['key'],
    'fullchain' => $fullchainPath,
  ];
  @file_put_contents($nodeRoot . '/.oho-ssl.json', json_encode($sslJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
  @file_put_contents($src . '/.oho-ssl.json', json_encode($sslJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
  $sslMeta = [
    'written' => true,
    'source' => 'apache-443-chain',
    'cert' => basename($fullchainPath),
    'key' => basename($sslFrom443['key']),
    'subject' => $sslFrom443['leafSubject'] ?? null,
    'issuer' => $sslFrom443['leafIssuer'] ?? null,
    'apachePort' => $apachePort,
  ];
} else {
  foreach ([$nodeRoot . '/.oho-ssl.json', $src . '/.oho-ssl.json'] as $bad) {
    if (is_file($bad)) @unlink($bad);
  }
  $sslMeta = [
    'written' => false,
    'source' => 'apache-443-chain',
    'detail' => $sslFrom443,
    'apachePort' => $apachePort,
  ];
}

$serverBody = is_file($nodeRoot . '/server.js') ? (string) @file_get_contents($nodeRoot . '/server.js') : '';

foreach ([$nodeRoot . '/tmp', $src . '/tmp'] as $tmp) {
  if (!is_dir($tmp)) @mkdir($tmp, 0755, true);
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
  'ssl' => $sslMeta,
  'rootHasHttpsBuild' => strpos($serverBody, 'https-5017-fullchain-2026-10-17') !== false
    || strpos($serverBody, 'https-5017-restored-2026-10-17') !== false,
  'rootHasSslListen' => is_file($nodeRoot . '/utils/sslListen.js'),
  'actions' => [
    ['signal' => 'skipped — restart Node from Hostinger panel after this sync'],
  ],
];

usleep(300000);
$result['verifyHttp5017'] = oho_sh('curl -s -m 5 http://127.0.0.1:5017/api/__build || echo FAIL');
$result['verifyHttps5017'] = oho_sh('curl -sk -m 5 https://127.0.0.1:5017/api/__build || echo FAIL');
$result['verifyVia443'] = oho_sh('curl -s -m 5 https://ohoebazar.com/api/__build || echo FAIL');

@file_put_contents($docRoot . '/api-reload-status.json', json_encode($result, JSON_PRETTY_PRINT));
echo json_encode($result, JSON_PRETTY_PRINT);
