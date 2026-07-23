[CmdletBinding()]
param(
  [string]$RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$EnvPath = '',
  [string]$PortalOrigin = '',
  [string]$FrontendUrl = '',
  [string]$DirectNodeBaseUrl = '',
  [string]$BackendServiceName = '',
  [string]$ApiKey = '',
  [switch]$StartBackend
)

$ErrorActionPreference = 'Stop'

function Read-DotEnv([string]$Path) {
  $values = @{}
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith('#')) { return }
    $pair = $line.Split('=', 2)
    if ($pair.Count -eq 2) { $values[$pair[0].Trim()] = $pair[1].Trim() }
  }
  return $values
}

function New-ExplorerToken([string]$Path) {
  $json = (@{ p = $Path; v = 1 } | ConvertTo-Json -Compress)
  return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Invoke-ExplorerRequest([string]$Url, [hashtable]$Headers) {
  Invoke-RestMethod -Uri $Url -UseDefaultCredentials -Headers $Headers -TimeoutSec 30
}

try {
  if (!$EnvPath) { $EnvPath = Join-Path $RepositoryPath 'server\.env' }
  if (!(Test-Path -LiteralPath $EnvPath)) { throw "Environment file not found: $EnvPath" }
  if (!$ApiKey) { throw 'ApiKey is required for the retained direct-loopback administrator diagnostic.' }
  $settings = Read-DotEnv $EnvPath
  $root = $settings['SITE_BUILDER_FILE_EXPLORER_ROOTS']
  if (!$root -or $root.Contains(';') -or $root.StartsWith('[')) { throw 'This smoke script requires exactly one SITE_BUILDER_FILE_EXPLORER_ROOTS UNC root.' }
  if (!$root.StartsWith('\\')) { throw "Configured root is not a UNC path: $root" }
  if (!$FrontendUrl) { $FrontendUrl = $settings['SITE_BUILDER_FILE_EXPLORER_FRONTEND_URL'] }
  if (!$PortalOrigin) { $PortalOrigin = ([uri]$FrontendUrl).GetLeftPart([System.UriPartial]::Authority) }
  $bridgePath = ($settings['SITE_BUILDER_FILE_EXPLORER_BRIDGE_PATH'] ?? '/_site-builder/file-explorer').TrimEnd('/')
  if (!$PortalOrigin -or !$bridgePath.StartsWith('/')) { throw 'SITE_BUILDER_FILE_EXPLORER_FRONTEND_URL and SITE_BUILDER_FILE_EXPLORER_BRIDGE_PATH are required.' }
  if (!$DirectNodeBaseUrl) { $DirectNodeBaseUrl = "http://127.0.0.1:$($settings['SERVER_PORT'] ?? '3001')" }
  $portalBase = "$($PortalOrigin.TrimEnd('/'))$bridgePath"
  $directBase = $DirectNodeBaseUrl.TrimEnd('/')
  $spoofedIdentity = 'SPOOFED\\untrusted-client'

  Write-Host "Operator identity: $(whoami)"
  if ($BackendServiceName) {
    $service = Get-CimInstance Win32_Service -Filter "Name='$BackendServiceName'"
    Write-Host "Configured backend service identity: $($service.StartName)"
  }

  Write-Host "Testing service-identity access to configured UNC root: $root"
  $items = @(Get-ChildItem -LiteralPath $root -Force -ErrorAction Stop)
  Write-Host "UNC root list succeeded: $($items.Count) immediate item(s)."
  if ($StartBackend) {
    Write-Host 'Starting backend with: npm.cmd run server:start'
    Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'server:start' -WorkingDirectory $RepositoryPath | Out-Null
    Start-Sleep -Seconds 3
  }

  $portalHeaders = @{ Referer = $FrontendUrl; 'X-Site-Builder-User' = $spoofedIdentity }
  $portalReadiness = Invoke-ExplorerRequest "$portalBase/readiness" $portalHeaders
  if (!$portalReadiness.ok -or !$portalReadiness.readiness.bridge.routeAvailable -or !$portalReadiness.readiness.authentication.trustedProxyVerified) { throw "Same-origin IIS bridge readiness failed: $($portalReadiness | ConvertTo-Json -Compress)" }
  if ($portalReadiness.readiness.authentication.actor -eq $spoofedIdentity) { throw 'IIS accepted a client-supplied trusted-user header instead of replacing it.' }
  if ($portalReadiness.readiness.accessModel -ne 'service-identity') { throw "Unexpected filesystem access model: $($portalReadiness.readiness.accessModel)" }
  Write-Host "Same-origin IIS route succeeded as $($portalReadiness.readiness.authentication.actor); spoofed header was not accepted."

  $token = New-ExplorerToken $root
  $directory = Invoke-ExplorerRequest "$portalBase/directory?target=$token" $portalHeaders
  $count = @($directory.directory.entries).Count
  Write-Host "IIS proxy returned a real directory listing with $count visible entry/entries."

  $directHeaders = @{ 'X-API-Key' = $ApiKey }
  $loopbackReadiness = Invoke-ExplorerRequest "$directBase/api/file-explorer/readiness" $directHeaders
  if (!$loopbackReadiness.ok) { throw "Direct loopback diagnostic readiness failed: $($loopbackReadiness | ConvertTo-Json -Compress)" }
  $nativeDiagnostic = Invoke-ExplorerRequest "$directBase/api/file-explorer/diagnostic/native-url?target=$token" $directHeaders
  Write-Host "Direct loopback administrator diagnostic succeeded. Copy manually into Chrome only: $($nativeDiagnostic.nativeChromeUrl)"
  Write-Host "Open the Site Builder UI: $FrontendUrl#/file-explorer?target=$token"
  exit 0
} catch {
  $message = $_.Exception.Message
  if ($message -match 'Access is denied|UnauthorizedAccess|403') { Write-Error "ACCESS DENIED: $message" }
  elseif ($message -match '401|Unauthorized|authentication|trusted-user') { Write-Error "AUTHENTICATION FAILURE: $message" }
  elseif ($message -match 'DNS|name|host|network|unavailable|ENET') { Write-Error "SHARE OR DNS UNAVAILABLE: $message" }
  elseif ($message -match 'UNC|root|bridge|proxy|IIS') { Write-Error "BRIDGE OR ROOT CONFIGURATION FAILURE: $message" }
  else { Write-Error "FILE EXPLORER SMOKE FAILED: $message" }
  exit 1
}
