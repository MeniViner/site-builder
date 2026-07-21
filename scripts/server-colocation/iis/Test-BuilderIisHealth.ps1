[CmdletBinding()]
param(
  [string]$ListenAddress = '127.0.0.1',
  [ValidateRange(1, 65535)]
  [int]$Port = 3001,
  [ValidateRange(1, 120)]
  [int]$TimeoutSeconds = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($ListenAddress -ne '127.0.0.1' -and $ListenAddress -ne '::1') { throw 'Health smoke check refuses non-loopback addresses.' }
$hostPart = if ($ListenAddress -eq '::1') { '[::1]' } else { $ListenAddress }
$uri = "http://$hostPart`:$Port/healthz"

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec $TimeoutSeconds
  $body = $response.Content | ConvertFrom-Json
  if ($response.StatusCode -ne 200 -or $body.ok -ne $true -or $body.service -ne 'site-builder-api') { throw 'Unexpected health response.' }
  [ordered]@{ ok = $true; uri = $uri; statusCode = $response.StatusCode; service = $body.service } | ConvertTo-Json -Depth 3
} catch {
  throw "Builder health smoke check failed without disclosing configuration: $($_.Exception.Message)"
}
