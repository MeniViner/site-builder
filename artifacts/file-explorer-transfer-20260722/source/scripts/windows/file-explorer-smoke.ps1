[CmdletBinding()]
param(
  [string]$RepositoryPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$EnvPath = '',
  [string]$ApiBaseUrl = '',
  [string]$FrontendUrl = '',
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
  $settings = Read-DotEnv $EnvPath
  $root = $settings['SITE_BUILDER_FILE_EXPLORER_ROOTS']
  if (!$root -or $root.Contains(';') -or $root.StartsWith('[')) { throw 'This smoke script requires exactly one SITE_BUILDER_FILE_EXPLORER_ROOTS UNC root.' }
  if (!$root.StartsWith('\\')) { throw "Configured root is not a UNC path: $root" }
  if (!$ApiBaseUrl) { $ApiBaseUrl = $settings['SITE_BUILDER_FILE_EXPLORER_API_ORIGIN'] }
  if (!$FrontendUrl) { $FrontendUrl = $settings['SITE_BUILDER_FILE_EXPLORER_FRONTEND_URL'] }
  if (!$ApiBaseUrl -or !$FrontendUrl) { throw 'SITE_BUILDER_FILE_EXPLORER_API_ORIGIN and SITE_BUILDER_FILE_EXPLORER_FRONTEND_URL are required.' }
  $apiBase = $ApiBaseUrl.TrimEnd('/')
  $frontendOrigin = ([uri]$FrontendUrl).GetLeftPart([System.UriPartial]::Authority)
  $headers = @{ Origin = $frontendOrigin }
  if ($ApiKey) { $headers['X-API-Key'] = $ApiKey }

  Write-Host "Operator identity: $(whoami)"
  if ($BackendServiceName) {
    $service = Get-CimInstance Win32_Service -Filter "Name='$BackendServiceName'"
    Write-Host "Configured backend service identity: $($service.StartName)"
  } else {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server[\\/]index\.js' } | ForEach-Object {
      $owner = Invoke-CimMethod -InputObject $_ -MethodName GetOwner
      Write-Host "Backend Node PID $($_.ProcessId) identity: $($owner.Domain)\$($owner.User)"
    }
  }

  Write-Host "Testing configured UNC root: $root"
  $items = @(Get-ChildItem -LiteralPath $root -Force -ErrorAction Stop)
  Write-Host "UNC root list succeeded: $($items.Count) immediate item(s)."
  if ($StartBackend) {
    Write-Host 'Starting backend with: npm.cmd run server:start'
    Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'server:start' -WorkingDirectory $RepositoryPath | Out-Null
    Start-Sleep -Seconds 3
  }

  $health = Invoke-WebRequest -Uri "$apiBase/healthz" -UseDefaultCredentials -TimeoutSec 30
  if ($health.StatusCode -ne 200) { throw "Readiness endpoint returned HTTP $($health.StatusCode)." }
  $readiness = Invoke-ExplorerRequest "$apiBase/api/file-explorer/readiness" $headers
  if (!$readiness.ok) { throw "Explorer readiness failed: $($readiness.readiness | ConvertTo-Json -Compress)" }
  $token = New-ExplorerToken $root
  $directory = Invoke-ExplorerRequest "$apiBase/api/file-explorer/directory?target=$token" $headers
  $count = @($directory.directory.entries).Count
  if ($count -gt 0) { Write-Host "Directory endpoint succeeded with $count visible entry/entries." } else { Write-Host 'Directory endpoint succeeded; the configured root is empty.' }
  Write-Host "Open in Chrome: $FrontendUrl#/file-explorer?target=$token"
  exit 0
} catch {
  $message = $_.Exception.Message
  if ($message -match 'Access is denied|UnauthorizedAccess|403') { Write-Error "ACCESS DENIED: $message" }
  elseif ($message -match '401|Unauthorized|authentication') { Write-Error "AUTHENTICATION FAILURE: $message" }
  elseif ($message -match 'DNS|name|host|network|unavailable|ENET') { Write-Error "SHARE OR DNS UNAVAILABLE: $message" }
  elseif ($message -match 'UNC|root|invalid') { Write-Error "INVALID ROOT: $message" }
  else { Write-Error "FILE EXPLORER SMOKE FAILED: $message" }
  exit 1
}
