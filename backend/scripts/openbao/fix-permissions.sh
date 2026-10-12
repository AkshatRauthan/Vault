
#!/usr/bin/env bash
set -euo pipefail

# Resolve the backend root from this script's location.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKI="$ROOT/.docker/openbao/pki"

if [[ ! -f "$PKI/server.key" || ! -f "$PKI/server.crt" || ! -f "$PKI/ca.crt" ]]; then
    echo "Error: OpenBao TLS files are missing in $PKI" >&2
    exit 1
fi

echo "Configuring OpenBao TLS file permissions..."

# Allow the container user to traverse the certificate directory.
sudo chmod 755 "$PKI"

# Keep public certificates readable.
sudo chmod 644 "$PKI/server.crt" "$PKI/ca.crt"

# Keep the host developer as owner, while granting OpenBao's
# container group (GID 1000) read access to the server key.
sudo chown "$(id -u):1000" "$PKI/server.key"
sudo chmod 440 "$PKI/server.key"

echo "Permissions configured."
echo "Server key: host owner + OpenBao group can read it."
echo "CA private key: unchanged."
