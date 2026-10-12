
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$PKI = Join-Path $Root ".docker/openbao/pki"

$RequiredFiles = @(
    "server.key",
    "server.crt",
    "ca.crt"
)

foreach ($File in $RequiredFiles) {
    if (-not (Test-Path (Join-Path $PKI $File))) {
        throw "Missing TLS file: $File"
    }
}

# Restrict the server key to the current user, SYSTEM,
# and local Administrators.
$Key = Join-Path $PKI "server.key"
$User = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

& icacls $Key /inheritance:r `
    /grant:r "${User}:(R)" `
    "*S-1-5-18:(F)" `
    "*S-1-5-32-544:(F)"

if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure server.key permissions."
}

Write-Host "Windows ACLs configured for server.key."
Write-Host "Verify that your Docker Desktop Linux container can read the key."
