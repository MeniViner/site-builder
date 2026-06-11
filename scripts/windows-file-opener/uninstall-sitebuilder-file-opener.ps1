param(
    [switch]$AllUsers,
    [switch]$RemoveFiles,
    [string]$InstallDir
)

$ErrorActionPreference = 'Stop'

$ProtocolScheme = 'sitebuilder-open'

$registryRoot = if ($AllUsers) {
    'Registry::HKEY_LOCAL_MACHINE\Software\Classes'
} else {
    'Registry::HKEY_CURRENT_USER\Software\Classes'
}

$protocolKey = Join-Path $registryRoot $ProtocolScheme
if (Test-Path -LiteralPath $protocolKey) {
    Remove-Item -LiteralPath $protocolKey -Recurse -Force
    Write-Host "Removed protocol registration: $protocolKey"
} else {
    Write-Host "Protocol registration was not found: $protocolKey"
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    if ($AllUsers) {
        $InstallDir = Join-Path $env:ProgramData 'SiteBuilder\FileOpener'
    } else {
        $InstallDir = Join-Path $env:LOCALAPPDATA 'SiteBuilder\FileOpener'
    }
}

if ($RemoveFiles -and (Test-Path -LiteralPath $InstallDir)) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
    Write-Host "Removed helper files: $InstallDir"
}
