param(
    [switch]$AllUsers,
    [switch]$RunTest,
    [string]$InstallDir
)

$ErrorActionPreference = 'Stop'

$ProtocolScheme = 'sitebuilder-open'
$FriendlyName = 'URL:Site Builder File Opener'
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceHandler = Join-Path $SourceDir 'sitebuilder-file-opener.ps1'

if (-not (Test-Path -LiteralPath $SourceHandler -PathType Leaf)) {
    throw "Handler script was not found: $SourceHandler"
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    if ($AllUsers) {
        $InstallDir = Join-Path $env:ProgramData 'SiteBuilder\FileOpener'
    } else {
        $InstallDir = Join-Path $env:LOCALAPPDATA 'SiteBuilder\FileOpener'
    }
}

function ConvertTo-Base64Url {
    param([string]$Value)

    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null
$HandlerPath = Join-Path $InstallDir 'sitebuilder-file-opener.ps1'
Copy-Item -LiteralPath $SourceHandler -Destination $HandlerPath -Force

$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $powershellPath -PathType Leaf)) {
    $powershellPath = 'powershell.exe'
}

$registryRoot = if ($AllUsers) {
    'Registry::HKEY_LOCAL_MACHINE\Software\Classes'
} else {
    'Registry::HKEY_CURRENT_USER\Software\Classes'
}

$protocolKey = Join-Path $registryRoot $ProtocolScheme
$iconKey = Join-Path $protocolKey 'DefaultIcon'
$shellKey = Join-Path $protocolKey 'shell'
$openKey = Join-Path $shellKey 'open'
$commandKey = Join-Path $openKey 'command'
$commandValue = "`"$powershellPath`" -NoProfile -ExecutionPolicy Bypass -File `"$HandlerPath`" `"%1`""

New-Item -Path $protocolKey -Force | Out-Null
Set-Item -Path $protocolKey -Value $FriendlyName
New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -PropertyType String -Value '' -Force | Out-Null

New-Item -Path $iconKey -Force | Out-Null
Set-Item -Path $iconKey -Value "$env:SystemRoot\explorer.exe,0"

New-Item -Path $shellKey -Force | Out-Null
New-Item -Path $openKey -Force | Out-Null
New-Item -Path $commandKey -Force | Out-Null
Set-Item -Path $commandKey -Value $commandValue

Write-Host "Installed $ProtocolScheme protocol handler."
Write-Host "Handler: $HandlerPath"
Write-Host "Registry: $protocolKey"

$testPath = if ($env:USERPROFILE) {
    Join-Path $env:USERPROFILE 'Documents'
} else {
    "$env:SystemDrive\"
}
$testUri = "$ProtocolScheme://open?target=$(ConvertTo-Base64Url $testPath)"
Write-Host "Test URI: $testUri"

if ($RunTest) {
    Start-Process $testUri
}
