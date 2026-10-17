<?php
/**
 * Rebuild :5017 TLS using the EXACT certificate chain Apache serves on :443
 * (already trusted by browsers/Flutter). Then match the private key by modulus.
 *
 * GET /ops-fix-ssl5017.php?token=oho-reload-2026-10-17
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
@set_time_limit(40);

$expected = 'oho-reload-2026-10-17';
$token = isset($_GET['token']) ? (string) $_GET['token'] : '';
if (!hash_equals($expected, $token)) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'message' => 'Forbidden']);
  exit;
}

function sh($cmd) {
  if (!function_exists('shell_exec')) return null;
  $out = @shell_exec($cmd . ' 2>/dev/null');
  return is_string($out) ? trim($out) : null;
}

function modulus_pem($pem, $type) {
  $tmp = tempnam(sys_get_temp_dir(), 'm');
  @file_put_contents($tmp, $pem);
  $f = escapeshellarg($tmp);
  $out = $type === 'cert'
    ? sh("openssl x509 -noout -modulus -in $f")
    : (sh("openssl rsa -noout -modulus -in $f") ?: sh("openssl pkey -noout -modulus -in $f"));
  @unlink($tmp);
  if (!$out || stripos($out, 'Modulus=') === false) return null;
  return strtoupper(preg_replace('/^Modulus=/i', '', trim($out)));
}

function modulus_file($path, $type) {
  $f = escapeshellarg($path);
  $out = $type === 'cert'
    ? sh("openssl x509 -noout -modulus -in $f")
    : (sh("openssl rsa -noout -modulus -in $f") ?: sh("openssl pkey -noout -modulus -in $f"));
  if (!$out || stripos($out, 'Modulus=') === false) return null;
  return strtoupper(preg_replace('/^Modulus=/i', '', trim($out)));
}

$docRoot = rtrim(str_replace('\\', '/', (string) ($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');
$home = getenv('HOME') ?: ('/home/' . get_current_user());
$keyDir = rtrim($home, '/') . '/ssl/keys';

// Exact trusted chain from public :443 (same one Flutter/browsers already accept).
$show = sh('echo | openssl s_client -connect ohoebazar.com:443 -servername ohoebazar.com -showcerts');
if (!$show || !preg_match_all('/-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----/s', $show, $m)) {
  $show = sh('echo | openssl s_client -connect 127.0.0.1:443 -servername ohoebazar.com -showcerts');
}
if (!$show || !preg_match_all('/-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----/s', $show, $m)) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'message' => 'Could not read certificate chain from :443']);
  exit;
}

$pems = $m[0];
$leaf = $pems[0];
$fullchain = implode("\n", $pems) . "\n";

// If Apache only returned leaf, append official YR1 + Root YR cross-chain intermediates.
if (count($pems) < 2) {
  $yr1 = sh('curl -fsSL https://letsencrypt.org/certs/gen-y/int-yr1.pem');
  $rootYrX1 = sh('curl -fsSL https://letsencrypt.org/certs/gen-y/root-yr-cross-signed-x1.pem')
    ?: sh('curl -fsSL https://letsencrypt.org/certs/gen-y/root-yr.pem');
  $extra = '';
  if ($yr1) $extra .= trim($yr1) . "\n";
  if ($rootYrX1) $extra .= trim($rootYrX1) . "\n";
  if ($extra !== '') $fullchain = rtrim($leaf) . "\n" . $extra;
}

$modLeaf = modulus_pem($leaf, 'cert');
$keyPath = null;
if ($modLeaf && is_dir($keyDir)) {
  foreach (scandir($keyDir) ?: [] as $name) {
    if ($name === '.' || $name === '..') continue;
    if (!preg_match('/\.(key|pem)$/i', $name)) continue;
    $full = $keyDir . '/' . $name;
    $modKey = modulus_file($full, 'key');
    if ($modKey && hash_equals($modLeaf, $modKey)) {
      $keyPath = $full;
      break;
    }
  }
}

$tmpLeaf = tempnam(sys_get_temp_dir(), 'leaf');
@file_put_contents($tmpLeaf, $leaf);
$subject = sh('openssl x509 -noout -subject -in ' . escapeshellarg($tmpLeaf));
$issuer = sh('openssl x509 -noout -issuer -in ' . escapeshellarg($tmpLeaf));
@unlink($tmpLeaf);

if (!$keyPath) {
  http_response_code(500);
  echo json_encode([
    'ok' => false,
    'message' => 'No private key matches the live :443 leaf certificate',
    'subject' => $subject,
    'issuer' => $issuer,
  ], JSON_PRETTY_PRINT);
  exit;
}

$fullchainPath = $docRoot . '/.oho-fullchain.pem';
@file_put_contents($fullchainPath, $fullchain);
@file_put_contents($docRoot . '/Backend/.oho-fullchain.pem', $fullchain);

$sslJson = [
  'cert' => $fullchainPath,
  'key' => $keyPath,
  'fullchain' => $fullchainPath,
];
@file_put_contents($docRoot . '/.oho-ssl.json', json_encode($sslJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
@file_put_contents($docRoot . '/Backend/.oho-ssl.json', json_encode($sslJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

foreach ([$docRoot . '/tmp', $docRoot . '/Backend/tmp'] as $tmp) {
  if (!is_dir($tmp)) @mkdir($tmp, 0755, true);
  @file_put_contents($tmp . '/restart.txt', (string) time());
}

echo json_encode([
  'ok' => true,
  'time' => gmdate('c'),
  'subject' => $subject,
  'issuer' => $issuer,
  'key' => basename($keyPath),
  'chainCerts' => substr_count($fullchain, 'BEGIN CERTIFICATE'),
  'message' => 'Copied trusted :443 chain to :5017 materials — restart Node from Hostinger now',
], JSON_PRETTY_PRINT);
