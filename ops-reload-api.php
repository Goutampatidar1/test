<?php
/**
 * One-shot API reload helper for hosts where Node runs outside public_html.
 * Call: /ops-reload-api.php?token=oho-reload-2026-10-17
 *
 * - Copies Backend controllers/utils/routes into the live Node cwd (if discoverable)
 * - Touches tmp/restart.txt (Passenger / some Node panels)
 * - Tries pm2 restart when shell_exec is allowed
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

$home = isset($_SERVER['HOME']) ? $_SERVER['HOME'] : (getenv('HOME') ?: '');
if ($home === '' && function_exists('posix_getpwuid')) {
  $pw = @posix_getpwuid(@posix_geteuid());
  if (is_array($pw) && !empty($pw['dir'])) {
    $home = $pw['dir'];
  }
}

$docRoot = rtrim(str_replace('\\', '/', (string) ($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');
$srcCandidates = array_values(array_unique(array_filter([
  $docRoot !== '' ? $docRoot . '/Backend' : null,
  $home !== '' ? $home . '/public_html/ohoebazar.com/Backend' : null,
  __DIR__ . '/Backend',
  dirname(__DIR__) . '/Backend',
])));

$src = null;
foreach ($srcCandidates as $cand) {
  if (is_file($cand . '/controllers/vendorControllers/vendorMobileAuth.js')) {
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
  'targets' => [],
  'actions' => [],
];

if ($src === null) {
  http_response_code(500);
  $result['message'] = 'Backend source with vendorMobileAuth.js not found';
  echo json_encode($result, JSON_PRETTY_PRINT);
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

$targets = [];
// Always refresh the public_html Backend itself (src)
$targets[] = $src;

// Discover process cwd for :5017 when /proc is readable
$pid = null;
if (is_readable('/proc')) {
  foreach (glob('/proc/[0-9]*') as $proc) {
    $cmdline = @file_get_contents($proc . '/cmdline');
    if ($cmdline === false) {
      continue;
    }
    // rough filter: node server
    if (strpos($cmdline, 'node') === false) {
      continue;
    }
    $fds = @scandir($proc . '/fd');
    // Can't easily see ports from PHP; collect node cwds that look like Backend
    $cwd = @readlink($proc . '/cwd');
    if (is_string($cwd) && is_file($cwd . '/server.js') && is_dir($cwd . '/controllers')) {
      $targets[] = $cwd;
    }
  }
}

foreach ([
  $home . '/ohoebazar-api/Backend',
  $home . '/apps/ohoebazar/Backend',
  $home . '/nodejs/ohoebazar/Backend',
  $home . '/domains/ohoebazar.com/public_html/Backend',
  $docRoot . '/Backend',
] as $cand) {
  if ($cand && is_file($cand . '/server.js')) {
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
  $entry['hasBuildTag'] = is_file($auth) && strpos((string) @file_get_contents($auth), 'service-login-2026-10-17') !== false;
  $tmp = $target . '/tmp';
  if (!is_dir($tmp)) {
    @mkdir($tmp, 0755, true);
  }
  $entry['restartTxt'] = @file_put_contents($tmp . '/restart.txt', (string) time()) !== false;
  $result['targets'][] = $entry;
}

if (function_exists('shell_exec')) {
  $pm2 = @shell_exec('command -v pm2 2>/dev/null');
  if (is_string($pm2) && trim($pm2) !== '') {
    $out = @shell_exec('pm2 restart oho-backend --update-env 2>&1 || pm2 restart all --update-env 2>&1');
    $result['actions'][] = ['pm2' => is_string($out) ? trim($out) : ''];
  } else {
    $result['actions'][] = ['pm2' => 'not available'];
  }
} else {
  $result['actions'][] = ['shell_exec' => 'disabled'];
}

// Local verification against 5017 if curl exists
if (function_exists('shell_exec')) {
  $verify = @shell_exec(
    'curl -s -X POST "http://127.0.0.1:5017/api/vendor/auth/check-phone" '
    . '-H "Content-Type: application/json" '
    . '-d \'{"phone":"9650555555","purpose":"vendor_login"}\' 2>/dev/null'
  );
  $result['verifyCheckPhone'] = is_string($verify) ? $verify : null;
}

$result['ok'] = true;
$result['message'] = 'Reload attempted';
@file_put_contents(
  ($docRoot !== '' ? $docRoot : dirname($src)) . '/api-reload-status.json',
  json_encode($result, JSON_PRETTY_PRINT)
);

echo json_encode($result, JSON_PRETTY_PRINT);
