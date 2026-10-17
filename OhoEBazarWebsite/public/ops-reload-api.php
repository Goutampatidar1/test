<?php
/**
 * Sync fixed Backend code into the live Node app and force reload.
 * GET /ops-reload-api.php?token=oho-reload-2026-10-17
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

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

$home = oho_sh('printf %s "$HOME"');
if (!$home) {
  $home = '/home/alphawizzserver';
}
$docRoot = rtrim(str_replace('\\', '/', (string) ($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');

$src = null;
foreach ([
  $docRoot . '/Backend',
  $home . '/public_html/ohoebazar.com/Backend',
  __DIR__ . '/Backend',
] as $cand) {
  if ($cand && is_file($cand . '/controllers/vendorControllers/vendorMobileAuth.js')) {
    $src = $cand;
    break;
  }
}

$result = [
  'ok' => false,
  'time' => gmdate('c'),
  'home' => $home,
  'docRoot' => $docRoot,
  'src' => $src,
  'discover' => [],
  'targets' => [],
  'actions' => [],
];

if ($src === null) {
  http_response_code(500);
  $result['message'] = 'Backend source not found';
  echo json_encode($result, JSON_PRETTY_PRINT);
  exit;
}

// Discover Backend/server.js locations and process listening on 5017
$result['discover']['findServerJs'] = oho_sh(
  'find "$HOME" /home/alphawizzserver -type f -path "*/Backend/server.js" 2>/dev/null | head -40'
);
$result['discover']['ss5017'] = oho_sh('ss -ltnp 2>/dev/null | grep 5017 || netstat -ltnp 2>/dev/null | grep 5017');
$result['discover']['lsof5017'] = oho_sh('lsof -nP -iTCP:5017 -sTCP:LISTEN 2>/dev/null');
$result['discover']['pgrepNode'] = oho_sh('pgrep -af "node|server.js" 2>/dev/null | head -30');
$result['discover']['cloudlinux'] = oho_sh('ls -d $HOME/nodevenv/* $HOME/nodes/* $HOME/applications/* 2>/dev/null | head -40');

$targets = [$src];

if (!empty($result['discover']['findServerJs'])) {
  foreach (preg_split('/\r\n|\r|\n/', $result['discover']['findServerJs']) as $line) {
    $line = trim($line);
    if ($line !== '' && is_file($line)) {
      $targets[] = dirname($line);
    }
  }
}

// Resolve cwd from PID in ss/lsof output
$pid = null;
if (!empty($result['discover']['lsof5017']) && preg_match('/\b(\d+)\b/', $result['discover']['lsof5017'], $m)) {
  // Prefer PID column carefully — take last number-like from node line
  if (preg_match('/node\s+(\d+)/i', $result['discover']['lsof5017'], $m2)) {
    $pid = $m2[1];
  } elseif (preg_match_all('/\b(\d{2,})\b/', $result['discover']['lsof5017'], $mm)) {
    $pid = end($mm[1]);
  }
}
if (!$pid && !empty($result['discover']['ss5017']) && preg_match('/pid=(\d+)/', $result['discover']['ss5017'], $m)) {
  $pid = $m[1];
}
if ($pid) {
  $cwd = oho_sh('readlink -f /proc/' . escapeshellarg($pid) . '/cwd');
  $result['discover']['pid'] = $pid;
  $result['discover']['cwd'] = $cwd;
  if ($cwd && is_file($cwd . '/server.js')) {
    $targets[] = $cwd;
  } elseif ($cwd && is_file($cwd . '/Backend/server.js')) {
    $targets[] = $cwd . '/Backend';
  }
}

$targets = array_values(array_unique(array_filter($targets)));
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
  $tmp = $target . '/tmp';
  if (!is_dir($tmp)) {
    @mkdir($tmp, 0755, true);
  }
  $entry['restartTxt'] = @file_put_contents($tmp . '/restart.txt', (string) time()) !== false;
  // Parent app roots sometimes want restart.txt too
  $parentTmp = dirname($target) . '/tmp';
  if (is_dir(dirname($target))) {
    if (!is_dir($parentTmp)) {
      @mkdir($parentTmp, 0755, true);
    }
    @file_put_contents($parentTmp . '/restart.txt', (string) time());
  }
  $result['targets'][] = $entry;
}

// Hostinger / Passenger style restarts
$result['actions'][] = [
  'touchRestart' => oho_sh(
    'mkdir -p "$HOME/tmp" "' . $src . '/tmp" && touch "$HOME/tmp/restart.txt" "' . $src . '/tmp/restart.txt" && echo ok'
  ),
];

// Try killing node on 5017 so the panel process manager respawns it with new files
$killOut = oho_sh(
  'PID=$(lsof -t -iTCP:5017 -sTCP:LISTEN 2>/dev/null | head -1); '
  . 'if [ -n "$PID" ]; then kill -HUP "$PID" 2>/dev/null || kill "$PID" 2>/dev/null; echo "signaled $PID"; '
  . 'else echo "no listener pid"; fi'
);
$result['actions'][] = ['signal5017' => $killOut];

// Give supervisor a moment, then verify
usleep(1500000);
$verify = oho_sh(
  'curl -s -X POST "http://127.0.0.1:5017/api/vendor/auth/check-phone" '
  . '-H "Content-Type: application/json" '
  . '-d \'{"phone":"9650555555","purpose":"vendor_login"}\''
);
$result['verifyCheckPhone'] = $verify;
$result['ok'] = true;
$result['message'] = 'Reload attempted';

$statusPath = ($docRoot !== '' ? $docRoot : dirname($src)) . '/api-reload-status.json';
@file_put_contents($statusPath, json_encode($result, JSON_PRETTY_PRINT));

echo json_encode($result, JSON_PRETTY_PRINT);
