
set -eu

PKI=".docker/openbao/pki"
umask 077

# Generate local development CA
openssl req -x509 -newkey rsa:3072 -sha256 -nodes \
  -keyout "$PKI/ca.key" \
  -out "$PKI/ca.crt" \
  -days 3650 \
  -subj "/CN=Vault Local Development CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

# Generate OpenBao server key and CSR
openssl req -new -newkey rsa:3072 -sha256 -nodes \
  -keyout "$PKI/server.key" \
  -out "$PKI/server.csr" \
  -subj "/CN=openbao"

# Server certificate extensions
cat > "$PKI/server.ext" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:openbao,DNS:localhost,IP:127.0.0.1
EOF

# Sign server certificate
openssl x509 -req -sha256 \
  -in "$PKI/server.csr" \
  -CA "$PKI/ca.crt" \
  -CAkey "$PKI/ca.key" \
  -CAcreateserial \
  -out "$PKI/server.crt" \
  -days 365 \
  -extfile "$PKI/server.ext"

# Remove temporary files
rm -f "$PKI/server.csr" "$PKI/server.ext" "$PKI/ca.srl"

chmod 600 "$PKI/ca.key" "$PKI/server.key"
chmod 644 "$PKI/ca.crt" "$PKI/server.crt"

# Verify certificate chain and hostnames
openssl verify -CAfile "$PKI/ca.crt" \
  -verify_hostname openbao "$PKI/server.crt"

openssl verify -CAfile "$PKI/ca.crt" \
  -verify_hostname localhost "$PKI/server.crt"
