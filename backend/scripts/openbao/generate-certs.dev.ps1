$ErrorActionPreference = "Stop"

# Run from the Vault backend project root.
$PKI = Join-Path (Get-Location) ".docker/openbao/pki"

# Ensure the output directory exists.
New-Item -ItemType Directory -Path $PKI -Force | Out-Null

# Check OpenSSL availability.
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
    throw "OpenSSL is not installed or is not available in PATH."
}

# Prevent accidental overwrites of existing certificates and keys.
$existingFiles = @(
    "ca.key", "ca.crt", "server.key", "server.crt"
) | ForEach-Object {
    Join-Path $PKI $_
} | Where-Object {
    Test-Path $_
}

if ($existingFiles) {
    throw "Existing certificate files found. Back them up or move them before generating a new CA."
}

# Generate local development CA.
openssl req -x509 -newkey rsa:3072 -sha256 -nodes `
    -keyout "$PKI/ca.key" `
    -out "$PKI/ca.crt" `
    -days 3650 `
    -subj "/CN=Vault Local Development CA" `
    -addext "basicConstraints=critical,CA:TRUE" `
    -addext "keyUsage=critical,keyCertSign,cRLSign"

if ($LASTEXITCODE -ne 0) {
    throw "Failed to generate the development CA."
}

# Generate OpenBao server key and CSR.
openssl req -new -newkey rsa:3072 -sha256 -nodes `
    -keyout "$PKI/server.key" `
    -out "$PKI/server.csr" `
    -subj "/CN=openbao"

if ($LASTEXITCODE -ne 0) {
    throw "Failed to generate the OpenBao server CSR."
}

# Server certificate extensions.
@"
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:openbao,DNS:localhost,IP:127.0.0.1
"@ | Set-Content -Path "$PKI/server.ext" -Encoding ascii

# Sign server certificate.
openssl x509 -req -sha256 `
    -in "$PKI/server.csr" `
    -CA "$PKI/ca.crt" `
    -CAkey "$PKI/ca.key" `
    -CAcreateserial `
    -out "$PKI/server.crt" `
    -days 365 `
    -extfile "$PKI/server.ext"

if ($LASTEXITCODE -ne 0) {
    throw "Failed to sign the OpenBao server certificate."
}

# Remove temporary files.
Remove-Item "$PKI/server.csr", "$PKI/server.ext", "$PKI/ca.srl" `
    -Force -ErrorAction SilentlyContinue

# Restrict private-key access to the current Windows user.
# Run this under your normal user account.
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

foreach ($key in @("$PKI/ca.key", "$PKI/server.key")) {
    & icacls $key /inheritance:r /grant:r "${identity}:(R,W)" | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to restrict permissions on $key."
    }
}

# Verify certificate chain and hostnames.
openssl verify -CAfile "$PKI/ca.crt" `
    -verify_hostname openbao "$PKI/server.crt"

if ($LASTEXITCODE -ne 0) {
    throw "Certificate verification failed for hostname openbao."
}

openssl verify -CAfile "$PKI/ca.crt" `
    -verify_hostname localhost "$PKI/server.crt"

if ($LASTEXITCODE -ne 0) {
    throw "Certificate verification failed for hostname localhost."
}

Write-Host "`nOpenBao development certificates generated and verified successfully." -ForegroundColor Green
Write-Host "Certificate directory: $PKI"
