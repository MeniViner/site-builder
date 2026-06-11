param(
    [Parameter(Position = 0)]
    [string]$Uri
)

$ErrorActionPreference = 'Stop'

$ProtocolScheme = 'sitebuilder-open'
$ProtocolHost = 'open'
$LogDir = Join-Path $env:LOCALAPPDATA 'SiteBuilder\FileOpener'
$LogPath = Join-Path $LogDir 'sitebuilder-file-opener.log'

function Write-HelperLog {
    param([string]$Message)

    try {
        if (-not (Test-Path -LiteralPath $LogDir)) {
            New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
        }

        $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -LiteralPath $LogPath -Value "[$timestamp] $Message" -Encoding UTF8
    } catch {
        # Logging must never block Explorer launch.
    }
}

function Show-HelperError {
    param([string]$Message)

    Write-HelperLog "ERROR: $Message"

    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction Stop
        [System.Windows.MessageBox]::Show(
            $Message,
            'Site Builder File Opener',
            [System.Windows.MessageBoxButton]::OK,
            [System.Windows.MessageBoxImage]::Warning
        ) | Out-Null
    } catch {
        Write-Host $Message
    }
}

function ConvertFrom-Base64Url {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw 'Missing target value.'
    }

    $base64 = $Value.Replace('-', '+').Replace('_', '/')
    switch ($base64.Length % 4) {
        0 { }
        2 { $base64 += '==' }
        3 { $base64 += '=' }
        default { throw 'Invalid base64url target length.' }
    }

    $bytes = [Convert]::FromBase64String($base64)
    return [Text.Encoding]::UTF8.GetString($bytes)
}

function Get-QueryValue {
    param(
        [Uri]$ParsedUri,
        [string]$Name
    )

    $query = $ParsedUri.Query.TrimStart('?')
    if ([string]::IsNullOrWhiteSpace($query)) {
        return ''
    }

    foreach ($part in $query.Split('&')) {
        if ([string]::IsNullOrWhiteSpace($part)) {
            continue
        }

        $pair = $part.Split([char[]]'=', 2)
        $key = [Uri]::UnescapeDataString($pair[0])
        if ($key -ne $Name) {
            continue
        }

        if ($pair.Count -lt 2) {
            return ''
        }

        return [Uri]::UnescapeDataString($pair[1])
    }

    return ''
}

function Test-AllowedExplorerPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    if ($Path.IndexOfAny([char[]]@('"', '<', '>', '|')) -ge 0) {
        return $false
    }

    if ($Path -match '^[A-Za-z]:\\') {
        return $true
    }

    if ($Path -match '^\\\\[^\\\/]+\\[^\\\/]+') {
        return $true
    }

    return $false
}

function Format-ExplorerPathArgument {
    param([string]$Path)

    return "`"$Path`""
}

function Open-ExplorerTarget {
    param([string]$TargetPath)

    $cleanPath = $TargetPath.Trim()
    if (-not (Test-AllowedExplorerPath $cleanPath)) {
        throw "Blocked unsupported path: $cleanPath"
    }

    $explorerPath = Join-Path $env:WINDIR 'explorer.exe'

    if (Test-Path -LiteralPath $cleanPath -PathType Container) {
        Start-Process -FilePath $explorerPath -ArgumentList (Format-ExplorerPathArgument $cleanPath)
        return
    }

    if (Test-Path -LiteralPath $cleanPath -PathType Leaf) {
        Start-Process -FilePath $explorerPath -ArgumentList "/select,`"$cleanPath`""
        return
    }

    $parentPath = Split-Path -LiteralPath $cleanPath -Parent
    if ($parentPath -and (Test-Path -LiteralPath $parentPath -PathType Container)) {
        Start-Process -FilePath $explorerPath -ArgumentList (Format-ExplorerPathArgument $parentPath)
        return
    }

    Start-Process -FilePath $explorerPath -ArgumentList (Format-ExplorerPathArgument $cleanPath)
}

try {
    if ([string]::IsNullOrWhiteSpace($Uri)) {
        throw 'No URI was supplied.'
    }

    $parsedUri = [Uri]$Uri
    if ($parsedUri.Scheme -ne $ProtocolScheme -or $parsedUri.Host -ne $ProtocolHost) {
        throw "Unsupported URI: $Uri"
    }

    $encodedTarget = Get-QueryValue -ParsedUri $parsedUri -Name 'target'
    $targetPath = ConvertFrom-Base64Url $encodedTarget

    Write-HelperLog "Opening Explorer target: $targetPath"
    Open-ExplorerTarget $targetPath
    exit 0
} catch {
    Show-HelperError $_.Exception.Message
    exit 1
}
