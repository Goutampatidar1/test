<?php
header('Content-Type: application/json');
$token = $_GET['token'] ?? '';
if ($token !== 'oho-reload-2026-10-17') { http_response_code(403); echo '{"ok":false}'; exit; }
function sh($c){ $o=@shell_exec($c.' 2>/dev/null'); return is_string($o)?trim($o):''; }
$home = getenv('HOME') ?: ('/home/'.get_current_user());
$certDir = $home.'/ssl/certs';
$rows = [];
foreach (scandir($certDir) ?: [] as $name) {
  if ($name==='.'||$name==='..') continue;
  if (!preg_match('/\.(crt|pem)$/i', $name)) continue;
  if (stripos($name,'bundle')!==false) continue;
  $full = $certDir.'/'.$name;
  $sub = sh('openssl x509 -noout -subject -in '.escapeshellarg($full));
  $iss = sh('openssl x509 -noout -issuer -in '.escapeshellarg($full));
  $rows[] = ['file'=>$name,'subject'=>$sub,'issuer'=>$iss];
}
echo json_encode(['ok'=>true,'home'=>$home,'certs'=>$rows], JSON_PRETTY_PRINT);
