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
  [int]$Port = 3001
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Fail([string]$Message) { throw "Builder IIS rollback refused: $Message" }
function Assert-SafeName([string]$Value, [string]$Label) { if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch '^[A-Za-z0-9_-]+$') { Fail "$Label contains unsupported characters." } }
function Is-LoopbackAddress([string]$Address) { return $Address -eq '127.0.0.1' -or $Address -eq '::1' }

Assert-SafeName $SiteName 'SiteName'
Assert-SafeName $AppPoolName 'AppPoolName'
if (-not (Is-LoopbackAddress $ListenAddress)) { Fail 'ListenAddress must be loopback.' }
if ([string]::IsNullOrWhiteSpace($DeploymentRoot)) { Fail 'DeploymentRoot is required to prove rollback scope.' }
if ($Mode -eq 'Apply' -and $Confirm -cne 'SITEBUILDER_IIS_ROLLBACK') { Fail 'Apply requires -Confirm SITEBUILDER_IIS_ROLLBACK.' }

$root = [System.IO.Path]::GetFullPath($DeploymentRoot)
$expectedBinding = "${ListenAddress}:$Port:"
if ($Mode -eq 'DryRun') {
  [ordered]@{ mode = 'DryRun'; siteName = $SiteName; appPoolName = $AppPoolName; deploymentRoot = $root; action = 'Would remove only the dedicated IIS site and unused app pool. Deployment files and MongoDB are preserved.'; modifiesHub = $false } | ConvertTo-Json -Depth 3
  exit 0
}

Import-Module WebAdministration -ErrorAction Stop
if (-not (Test-Path "IIS:\\Sites\\$SiteName")) { Fail "IIS site does not exist: $SiteName" }
$site = Get-Item "IIS:\\Sites\\$SiteName"
if ([System.IO.Path]::GetFullPath($site.physicalPath) -ine $root) { Fail 'IIS site physical path does not match DeploymentRoot.' }
if ($site.applicationPool -ne $AppPoolName) { Fail 'IIS site application pool does not match AppPoolName.' }
$bindings = @(Get-WebBinding -Name $SiteName -Protocol 'http')
if ($bindings.Count -ne 1 -or $bindings[0].bindingInformation -ne $expectedBinding) { Fail 'IIS site binding does not match the expected loopback binding.' }
$otherSites = @(Get-Website | Where-Object { $_.Name -ne $SiteName -and $_.applicationPool -eq $AppPoolName })
if ($otherSites.Count -gt 0) { Fail 'Application pool is used by another IIS site.' }

Stop-Website -Name $SiteName -ErrorAction SilentlyContinue
Remove-Website -Name $SiteName
if (Test-Path "IIS:\\AppPools\\$AppPoolName") { Remove-WebAppPool -Name $AppPoolName }
[ordered]@{ ok = $true; action = 'iis-binding-removed'; siteName = $SiteName; appPoolName = $AppPoolName; deploymentFilesPreserved = $true; mongodbPreserved = $true; modifiesHub = $false } | ConvertTo-Json -Depth 3
