
$ErrorActionPreference = "Stop"

# Resolve the backend root relative to this script.
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$PKI = Join-Path $Root ".docker/openbao/pki"

$Files = @(
    "ca.key",
    "ca.crt",
    "server.key",
    "server.crt"
)

New-Item -ItemType Directory -Path $PKI -Force | Out-Null

# Never overwrite an existing certificate set.
$Existing = @(
    $Files | Where-Object {
        Test-Path (Join-Path $PKI $_)
    }
)

$Missing = @(
    $Files | Where-Object {
        -not (Test-Path (Join-Path $PKI $_))
    }
)

if ($Existing.Count -eq $Files.Count) {
    Write-Host "Certificates already exist. Nothing changed."
    exit 0
}

if ($Existing.Count -gt 0) {
    throw @"
Partial certificate set detected.
Existing: $($Existing -join ', ')
Missing:  $($Missing -join ', ')
Nothing was overwritten. Inspect the files before proceeding.
"@
}

if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
    throw "OpenSSL is not installed or is not available in PATH."
}

# Generate in a temporary directory on the same filesystem.
$Temp = Join-Path $PKI (
    ".certgen-" + [guid]::NewGuid().ToString("N")
)

New-Item -ItemType Directory -Path $Temp | Out-Null

function Invoke-OpenSSL {
    param([string[]]$Arguments)

    & openssl @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "OpenSSL failed with exit code $LASTEXITCODE."
    }
}

try {
    Write-Host "Generating local development CA..."

    Invoke-OpenSSL @(
        "req", "-x509", "-newkey", "rsa:3072",
        "-sha256", "-nodes",
        "-keyout", "$Temp/ca.key",
        "-out", "$Temp/ca.crt",
        "-days", "3650",
        "-subj", "/CN=Vault Local Development CA",
        "-addext", "basicConstraints=critical,CA:TRUE",
        "-addext", "keyUsage=critical,keyCertSign,cRLSign"
    )

    Write-Host "Generating OpenBao server key and CSR..."

    Invoke-OpenSSL @(
        "req", "-new", "-newkey", "rsa:3072",
        "-sha256", "-nodes",
        "-keyout", "$Temp/server.key",
        "-out", "$Temp/server.csr",
        "-subj", "/CN=openbao"
    )

    @"
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:openbao,DNS:localhost,IP:127.0.0.1
"@ | Set-Content -Path "$Temp/server.ext" -Encoding ascii

    Write-Host "Signing server certificate..."

    Invoke-OpenSSL @(
        "x509", "-req", "-sha256",
        "-in", "$Temp/server.csr",
        "-CA", "$Temp/ca.crt",
        "-CAkey", "$Temp/ca.key",
        "-CAcreateserial",
        "-out", "$Temp/server.crt",
        "-days", "365",
        "-extfile", "$Temp/server.ext"
    )

    Write-Host "Verifying certificate chain and hostnames..."

    Invoke-OpenSSL @(
        "verify", "-CAfile", "$Temp/ca.crt",
        "-verify_hostname", "openbao", "$Temp/server.crt"
    )

    Invoke-OpenSSL @(
        "verify", "-CAfile", "$Temp/ca.crt",
        "-verify_hostname", "localhost", "$Temp/server.crt"
    )

    # Remove temporary CSR and extension files.
    Remove-Item "$Temp/server.csr", "$Temp/server.ext",
        "$Temp/ca.srl" -Force -ErrorAction SilentlyContinue

    # Recheck before publishing.
    foreach ($File in $Files) {
        if (Test-Path (Join-Path $PKI $File)) {
            throw "File $File appeared during generation. Nothing overwritten."
        }
    }

    # Move only verified outputs. Never use -Force here.
    foreach ($File in $Files) {
        $Source = Join-Path $Temp $File
        $Destination = Join-Path $PKI $File

        Move-Item -LiteralPath $Source -Destination $Destination
    }

    Write-Host "Development certificates generated and verified successfully." `
        -ForegroundColor Green
    Write-Host "Location: $PKI"
    Write-Host "Next: run pnpm openbao:permissions"
}
finally {
    if (Test-Path $Temp) {
        Remove-Item -LiteralPath $Temp -Recurse -Force
    }
}
