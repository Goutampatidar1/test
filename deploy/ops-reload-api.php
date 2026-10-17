<?php
/**
 * Fast API reload: copy fixed Backend into Node cwd for :5017, signal process.
 * GET /ops-reload-api.php?token=oho-reload-2026-10-17
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
@set_time_limit(20);

$expected = 'oho-reload-2026-10-17';
$token = isset($_GET['token']) ? (string) $_GET['token'] : '';
if (!hash_equals($expected, $token)) {
  http_response_code(403);
  echo json_encode(['ok' => false, 'message' => 'Forbidden']);
  exit;
}

function oho_sh($cmd) {
  if (!function_exists('shell_exec')) {
    return null;
  }
  $out = @shell_exec($cmd . ' 2>/dev/null');
  return is_string($out) ? trim($out) : null;
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

$home = '/home/alphawizzserver';
$docRoot = rtrim(str_replace('\\', '/', (string) ($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');
$src = $docRoot . '/Backend';
if (!is_file($src . '/controllers/vendorControllers/vendorMobileAuth.js')) {
  $src = $home . '/public_html/ohoebazar.com/Backend';
}

$result = [
  'ok' => false,
  'time' => gmdate('c'),
  'src' => $src,
  'discover' => [],
  'targets' => [],
  'actions' => [],
];

if (!is_file($src . '/controllers/vendorControllers/vendorMobileAuth.js')) {
  http_response_code(500);
  $result['message'] = 'Backend source missing';
  echo json_encode($result, JSON_PRETTY_PRINT);
  exit;
}

$ss = oho_sh('ss -ltnp | grep 5017 || true');
$lsof = oho_sh('lsof -nP -iTCP:5017 -sTCP:LISTEN || true');
$result['discover']['ss'] = $ss;
$result['discover']['lsof'] = $lsof;

$pid = null;
if ($lsof && preg_match('/\b(?:LISTEN)\s+(\d+)\b/', $lsof, $m)) {
  $pid = $m[1];
}
if (!$pid && $ss && preg_match('/pid=(\d+)/', $ss, $m)) {
  $pid = $m[1];
}
if (!$pid) {
  $pid = oho_sh("lsof -t -iTCP:5017 -sTCP:LISTEN | head -1");
}

$cwd = null;
if ($pid) {
  $cwd = oho_sh('readlink -f /proc/' . preg_replace('/\D/', '', $pid) . '/cwd');
}
$result['discover']['pid'] = $pid;
$result['discover']['cwd'] = $cwd;

$targets = [$src];
if ($cwd && is_file($cwd . '/server.js')) {
  $targets[] = $cwd;
} elseif ($cwd && is_file($cwd . '/Backend/server.js')) {
  $targets[] = $cwd . '/Backend';
}

// Common Hostinger / custom paths (no recursive find — stays fast)
foreach ([
  $home . '/ohoebazar-api/Backend',
  $home . '/apps/ohoebazar/Backend',
  $home . '/nodejs/ohoebazar/Backend',
  $home . '/domains/ohoebazar.com/public_html/Backend',
  $home . '/public_html/ohoebazar.com/Backend',
] as $cand) {
  if (is_file($cand . '/server.js')) {
    $targets[] = $cand;
  }
}

$targets = array_values(array_unique($targets));
$parts = ['controllers', 'utils', 'routes', 'models', 'middleware'];

foreach ($targets as $target) {
  $entry = ['path' => $target, 'copied' => []];
  foreach ($parts as $part) {
    $from = $src . '/' . $part;
    $to = $target . '/' . $part;
    if (is_dir($from)) {
      $entry['copied'][$part] = oho_copy_tree($from, $to);
    }
  }
  $auth = $target . '/controllers/vendorControllers/vendorMobileAuth.js';
  $body = is_file($auth) ? (string) @file_get_contents($auth) : '';
  $entry['hasBuildTag'] = strpos($body, 'service-login-2026-10-17') !== false;
  foreach ([$target . '/tmp', dirname($target) . '/tmp'] as $tmp) {
    if (!is_dir($tmp)) {
      @mkdir($tmp, 0755, true);
    }
    @file_put_contents($tmp . '/restart.txt', (string) time());
  }
  $result['targets'][] = $entry;
}

// Prefer hard restart of the listener so Hostinger/supervisor respawns with new files
$sig = oho_sh(
  'PID=$(lsof -t -iTCP:5017 -sTCP:LISTEN 2>/dev/null | head -1); '
  . 'echo "pid=$PID"; '
  . 'if [ -n "$PID" ]; then kill "$PID"; sleep 1; '
  . '  if kill -0 "$PID" 2>/dev/null; then kill -9 "$PID"; echo killed-9; else echo killed; fi; '
  . 'else echo none; fi'
);
$result['actions'][] = ['kill5017' => $sig];

usleep(2000000);
$verify = oho_sh(
  'curl -s -m 5 -X POST "http://127.0.0.1:5017/api/vendor/auth/check-phone" '
  . '-H "Content-Type: application/json" '
  . '-d \'{"phone":"9650555555","purpose":"vendor_login"}\' || echo CURL_FAIL'
);
$result['verifyCheckPhone'] = $verify;
$result['listeningAfter'] = oho_sh('ss -ltnp | grep 5017 || lsof -nP -iTCP:5017 -sTCP:LISTEN || echo down');
$result['ok'] = true;
$result['message'] = 'Reload attempted';

@file_put_contents($docRoot . '/api-reload-status.json', json_encode($result, JSON_PRETTY_PRINT));
echo json_encode($result, JSON_PRETTY_PRINT);
