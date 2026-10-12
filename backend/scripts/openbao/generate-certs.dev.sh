
#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Resolve the backend root regardless of the current directory.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKI="$ROOT/.docker/openbao/pki"

FILES=(
    ca.key
    ca.crt
    server.key
    server.crt
)

mkdir -p "$PKI"

# Never overwrite an existing certificate set.
existing=()
missing=()

for file in "${FILES[@]}"; do
    if [[ -e "$PKI/$file" ]]; then
        existing+=("$file")
    else
        missing+=("$file")
    fi
done

if (( ${#existing[@]} == ${#FILES[@]} )); then
    echo "Certificates already exist. Nothing changed."
    exit 0
fi

if (( ${#existing[@]} > 0 )); then
    echo "ERROR: Partial certificate set detected." >&2
    echo "Existing files: ${existing[*]}" >&2
    echo "Missing files:  ${missing[*]}" >&2
    echo "Refusing to overwrite or regenerate anything." >&2
    exit 1
fi

# Ensure OpenSSL is available.
if ! command -v openssl >/dev/null 2>&1; then
    echo "ERROR: OpenSSL is not installed or not in PATH." >&2
    exit 1
fi

# Generate in a temporary directory. Publish only after verification.
TMP="$(mktemp -d "$PKI/.certgen.XXXXXX")"
trap 'rm -rf -- "$TMP"' EXIT

echo "Generating local development CA..."

openssl req -x509 -newkey rsa:3072 -sha256 -nodes \
    -keyout "$TMP/ca.key" \
    -out "$TMP/ca.crt" \
    -days 3650 \
    -subj "/CN=Vault Local Development CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"

echo "Generating OpenBao server key and CSR..."

openssl req -new -newkey rsa:3072 -sha256 -nodes \
    -keyout "$TMP/server.key" \
    -out "$TMP/server.csr" \
    -subj "/CN=openbao"

cat > "$TMP/server.ext" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:openbao,DNS:localhost,IP:127.0.0.1
EOF

echo "Signing server certificate..."

openssl x509 -req -sha256 \
    -in "$TMP/server.csr" \
    -CA "$TMP/ca.crt" \
    -CAkey "$TMP/ca.key" \
    -CAcreateserial \
    -out "$TMP/server.crt" \
    -days 365 \
    -extfile "$TMP/server.ext"

echo "Verifying certificate chain and hostnames..."

openssl verify -CAfile "$TMP/ca.crt" \
    -verify_hostname openbao "$TMP/server.crt"

openssl verify -CAfile "$TMP/ca.crt" \
    -verify_hostname localhost "$TMP/server.crt"

# Set final permissions before publishing.
chmod 600 "$TMP/ca.key" "$TMP/server.key"
chmod 644 "$TMP/ca.crt" "$TMP/server.crt"

# Recheck before publishing; never replace files created meanwhile.
for file in "${FILES[@]}"; do
    if [[ -e "$PKI/$file" ]]; then
        echo "ERROR: $file appeared during generation. Nothing overwritten." >&2
        exit 1
    fi
done

# Move verified files into place.
for file in "${FILES[@]}"; do
    mv -n -- "$TMP/$file" "$PKI/$file"

    if [[ -e "$TMP/$file" ]]; then
        echo "ERROR: Could not publish $file without overwriting." >&2
        exit 1
    fi
done

echo "Development certificates generated and verified successfully."
echo "Location: $PKI"
echo "Next: run pnpm openbao:permissions"
