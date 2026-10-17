<?php
/**
 * Fast path: rebuild trusted HTTPS materials for :5017 (Let's Encrypt fullchain).
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

function fetch_le_intermediate() {
  return sh('curl -fsSL https://letsencrypt.org/certs/2024/yR1.pem')
    ?: sh('curl -fsSL https://letsencrypt.org/certs/2024/r11.pem')
    ?: sh('curl -fsSL https://letsencrypt.org/certs/lets-encrypt-r3.pem');
}

$docRoot = rtrim(str_replace('\\', '/', (string) ($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');
$home = getenv('HOME') ?: ('/home/' . get_current_user());
$certDir = rtrim($home, '/') . '/ssl/certs';
$keyDir = rtrim($home, '/') . '/ssl/keys';

// 1) Prefer on-disk Let's Encrypt leaf for ohoebazar.com (skip self-signed *alphawizzserver* host certs).
$leaf = null;
$leafFile = null;
if (is_dir($certDir)) {
  foreach (scandir($certDir) ?: [] as $name) {
    if (!preg_match('/\.crt$/i', $name)) continue;
    if (stripos($name, 'ohoebazar') === false) continue;
    if (stripos($name, 'alphawizzserver') !== false) continue;
    $full = $certDir . '/' . $name;
    $iss = sh('openssl x509 -noout -issuer -in ' . escapeshellarg($full));
    $sub = sh('openssl x509 -noout -subject -in ' . escapeshellarg($full));
    if ($iss && stripos($iss, "Let's Encrypt") !== false && $sub && stripos($sub, 'CN = ohoebazar.com') !== false) {
      $leaf = (string) @file_get_contents($full);
      $leafFile = $full;
      break;
    }
  }
}

// 2) Fallback: pull leaf from live :443
if (!$leaf) {
  $show = sh('echo | openssl s_client -connect 127.0.0.1:443 -servername ohoebazar.com -showcerts');
  if ($show && preg_match('/-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----/s', $show, $m)) {
    $leaf = $m[0];
  }
}

if (!$leaf) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'message' => 'Could not find Let\'s Encrypt leaf for ohoebazar.com']);
  exit;
}

$intermediate = fetch_le_intermediate();
$fullchain = rtrim($leaf) . "\n" . ($intermediate ? (trim($intermediate) . "\n") : '');

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
    'message' => 'No private key matches the Let\'s Encrypt leaf',
    'subject' => $subject,
    'issuer' => $issuer,
    'leafFile' => $leafFile,
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
  'leafFile' => $leafFile ? basename($leafFile) : null,
  'key' => basename($keyPath),
  'chainCerts' => substr_count($fullchain, 'BEGIN CERTIFICATE'),
  'hasIntermediate' => (bool) $intermediate,
  'message' => 'Trusted LE fullchain written — restart Node from Hostinger panel now',
], JSON_PRETTY_PRINT);
