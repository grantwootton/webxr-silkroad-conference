#!/usr/bin/env bash
# Generate self-signed cert with SAN for localhost + current LAN IP (Quest HTTPS).
set -euo pipefail
cd "$(dirname "$0")/.."
LAN_IP="${1:-}"
if [[ -z "$LAN_IP" ]]; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || true)
  LAN_IP="${LAN_IP:-$(ipconfig getifaddr en1 2>/dev/null || true)}"
  LAN_IP="${LAN_IP:-127.0.0.1}"
fi
echo "Generating cert.key / cert.crt for localhost + $LAN_IP"
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout cert.key -out cert.crt -days 365 \
  -subj "/CN=localhost/O=SilkRoad WebXR/C=GB" \
  -addext "subjectAltName=DNS:localhost,DNS:*.local,IP:127.0.0.1,IP:${LAN_IP}"
echo "Done. Run: npm run https"
