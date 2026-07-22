[CmdletBinding()]
param(
  [ValidateSet('DryRun', 'Apply')]
  [string]$Mode = 'DryRun',
  [string]$Confirm = '',
  [string]$SiteName = 'SiteBuilderDataApi',
  [string]$AppPoolName = 'SiteBuilderDataApiPool',
  [string]$DeploymentRoot,
  [string]$ListenAddress = '127.0.0.1',
  [ValidateRange(1, 65535)]
  [int]$Port = 3001,
  [string]$NodeEntry = 'app\server\index.js'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string]$Message) { throw "Builder IIS install refused: $Message" }
function Is-LoopbackAddress([string]$Address) { return $Address -eq '127.0.0.1' -or $Address -eq '::1' }
function Assert-SafeName([string]$Value, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch '^[A-Za-z0-9_-]+$') { Fail "$Label contains unsupported characters." }
}
function Get-NormalizedPath([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) { Fail 'DeploymentRoot is required.' }
  return [System.IO.Path]::GetFullPath($PathValue)
}

Assert-SafeName $SiteName 'SiteName'
Assert-SafeName $AppPoolName 'AppPoolName'
if (-not (Is-LoopbackAddress $ListenAddress)) { Fail 'ListenAddress must be 127.0.0.1 or ::1; public or LAN exposure is not supported.' }
if ($Mode -eq 'Apply' -and $Confirm -cne 'SITEBUILDER_IIS_INSTALL') { Fail 'Apply requires -Confirm SITEBUILDER_IIS_INSTALL.' }

$root = Get-NormalizedPath $DeploymentRoot
$entryPath = [System.IO.Path]::GetFullPath((Join-Path $root $NodeEntry))
$webConfig = Join-Path $root 'web.config'
$bindingInformation = "${ListenAddress}:$Port:"

if (-not (Test-Path -LiteralPath $root -PathType Container)) { Fail "DeploymentRoot does not exist: $root" }
if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) { Fail "Node entry is missing: $NodeEntry" }
if (-not (Test-Path -LiteralPath $webConfig -PathType Leaf)) { Fail 'Rendered web.config is missing.' }
if ((Get-Content -LiteralPath $webConfig -Raw) -match '__NODE_ENTRY__') { Fail 'web.config still has an unresolved __NODE_ENTRY__ token.' }
if ((Get-Content -LiteralPath $webConfig -Raw) -notmatch 'modules="iisnode"') { Fail 'web.config does not declare the iisnode handler.' }

$plan = [ordered]@{
  mode = $Mode; siteName = $SiteName; appPoolName = $AppPoolName; deploymentRoot = $root
  nodeEntry = $NodeEntry; binding = "http://$ListenAddress`:$Port/"; modifiesHub = $false
}

if ($Mode -eq 'DryRun') {
  $plan.checks = @('Deployment root and rendered iisnode web.config exist.', 'Binding is loopback-only.', 'Apply will require IIS, iisnode, a new site, and a new dedicated pool.')
  $plan | ConvertTo-Json -Depth 4
  exit 0
}

Import-Module WebAdministration -ErrorAction Stop
if (-not (Get-WebGlobalModule -Name 'iisnode' -ErrorAction SilentlyContinue)) { Fail 'iisnode IIS module is not installed.' }
if (Test-Path "IIS:\\Sites\\$SiteName") { Fail "IIS site already exists: $SiteName. Refusing to alter it." }
if (Test-Path "IIS:\\AppPools\\$AppPoolName") { Fail "IIS application pool already exists: $AppPoolName. Refusing to alter it." }
if (Get-WebBinding -Protocol 'http' | Where-Object { $_.bindingInformation -eq $bindingInformation }) { Fail "HTTP binding already exists: $bindingInformation" }

New-WebAppPool -Name $AppPoolName | Out-Null
Set-ItemProperty "IIS:\\AppPools\\$AppPoolName" -Name managedRuntimeVersion -Value ''
Set-ItemProperty "IIS:\\AppPools\\$AppPoolName" -Name processModel.identityType -Value 'ApplicationPoolIdentity'
New-Website -Name $SiteName -PhysicalPath $root -Port $Port -IPAddress $ListenAddress -ApplicationPool $AppPoolName | Out-Null
Start-Website -Name $SiteName

[ordered]@{ ok = $true; action = 'installed'; siteName = $SiteName; appPoolName = $AppPoolName; binding = "http://$ListenAddress`:$Port/"; modifiesHub = $false } | ConvertTo-Json -Depth 3
