[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$MsiPath,[Parameter(Mandatory=$true)][string]$ToolsDirectory)
$ErrorActionPreference='Stop'
if ((Split-Path -Leaf $MsiPath) -ne 'mongodb-database-tools-windows-x86_64-100.17.0.msi') { throw 'Unexpected MongoDB Database Tools MSI filename.' }
$signature=Get-AuthenticodeSignature -FilePath $MsiPath
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'MongoDB, Inc') { throw 'MongoDB MSI Authenticode validation failed.' }
$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $MsiPath).Hash.ToLowerInvariant()
New-Item -ItemType Directory -Force -Path $ToolsDirectory | Out-Null
Start-Process msiexec.exe -Wait -NoNewWindow -ArgumentList @('/a',('"{0}"' -f $MsiPath),('/qn'),('TARGETDIR="{0}"' -f $ToolsDirectory))
if (-not (Get-ChildItem -LiteralPath $ToolsDirectory -Recurse -Filter mongorestore.exe | Select-Object -First 1)) { throw 'Verified MSI did not provide mongorestore.exe.' }
[ordered]@{ok=$true;sha256=$hash;subject=$signature.SignerCertificate.Subject;toolsDirectory=$ToolsDirectory}|ConvertTo-Json -Depth 3
