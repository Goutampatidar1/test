# Builds production frontends and creates OHO-E-BAZAR-live-deploy.zip for IT.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$OutZip = Join-Path $Root "OHO-E-BAZAR-live-deploy.zip"
$Stage = Join-Path $Root "deploy-staging"

Write-Host "==> Building Admin Panel..."
Push-Location (Join-Path $Root "AdminPannel")
npm run build
Pop-Location

Write-Host "==> Building Vendor Panel..."
Push-Location (Join-Path $Root "VenueVendorPanel")
npm run build
Pop-Location

Write-Host "==> Merging vendor build into admin dist/vendor/..."
$AdminDist = Join-Path $Root "AdminPannel\dist"
$VendorDist = Join-Path $Root "VenueVendorPanel\dist"
$VendorTarget = Join-Path $AdminDist "vendor"
if (Test-Path $VendorTarget) { Remove-Item $VendorTarget -Recurse -Force }
New-Item -ItemType Directory -Path $VendorTarget -Force | Out-Null
Copy-Item -Path (Join-Path $VendorDist "*") -Destination $VendorTarget -Recurse -Force

Write-Host "==> Staging deploy files..."
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Path $Stage | Out-Null

$Include = @(
  "DEPLOY-IT-HANDOFF.md",
  "docs",
  "deploy",
  "Backend",
  "AdminPannel\dist",
  "AdminPannel\.env.production.example",
  "AdminPannel\package.json",
  "AdminPannel\package-lock.json",
  "AdminPannel\vite.config.js",
  "VenueVendorPanel\.env.production.example",
  "VenueVendorPanel\package.json",
  "VenueVendorPanel\package-lock.json",
  "VenueVendorPanel\vite.config.js",
  "VenueVendorPanel\src",
  "VenueVendorPanel\public",
  "VenueVendorPanel\index.html",
  "AdminPannel\src",
  "AdminPannel\public",
  "AdminPannel\index.html"
)

foreach ($rel in $Include) {
  $src = Join-Path $Root $rel
  if (-not (Test-Path $src)) {
    Write-Warning "Skip missing: $rel"
    continue
  }
  $dest = Join-Path $Stage $rel
  $destParent = Split-Path $dest -Parent
  if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
  Copy-Item -Path $src -Destination $dest -Recurse -Force
}

# Remove secrets and dev-only files from staging
@(
  (Join-Path $Stage "Backend\.env"),
  (Join-Path $Stage "Backend\node_modules")
) | ForEach-Object {
  if (Test-Path $_) { Remove-Item $_ -Recurse -Force }
}

Write-Host "==> Creating zip: $OutZip"
if (Test-Path $OutZip) { Remove-Item $OutZip -Force }
Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $OutZip -CompressionLevel Optimal

Remove-Item $Stage -Recurse -Force

$sizeMb = [math]::Round((Get-Item $OutZip).Length / 1MB, 2)
Write-Host "Done. Zip size: ${sizeMb} MB"
Write-Host $OutZip
