#!/usr/bin/env bash
# Deploy both POCs to the VPS behind nginx:
#   http://<host>/document-assembly/   HelmDocs (static)
#   http://<host>/genai-learning/      HelmLearn (vite preview service)
# Usage:  HOST=173.208.162.243 USER=administrator ./deploy/deploy.sh
# Needs: ssh access for $USER (password prompt, or SSHPASS=… with sshpass), sudo on the server, rsync.
set -euo pipefail
HOST="${HOST:?set HOST}"; USER="${USER:-administrator}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SSH="ssh -o StrictHostKeyChecking=no $USER@$HOST"
RSYNC="rsync -az --delete -e 'ssh -o StrictHostKeyChecking=no'"
if [ -n "${SSHPASS:-}" ]; then SSH="sshpass -e $SSH"; RSYNC="sshpass -e $RSYNC"; fi

echo "▸ building HelmDocs for /document-assembly/"
(cd "$HERE/helmdocs" && BASE_PATH=/document-assembly/ npm run build >/dev/null)

echo "▸ server prerequisites (nginx, node 22)"
$SSH 'set -e
  command -v nginx >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq nginx; }
  if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null && sudo apt-get install -y -qq nodejs; fi
  sudo mkdir -p /var/www/asmi-poc/document-assembly /opt/asmi-poc/helmlearn
  sudo chown -R '"$USER"' /var/www/asmi-poc /opt/asmi-poc'

echo "▸ uploading HelmDocs build + landing page"
eval $RSYNC "$HERE/helmdocs/dist/" "$USER@$HOST:/var/www/asmi-poc/document-assembly/"
eval $RSYNC "$HERE/deploy/index.html" "$USER@$HOST:/var/www/asmi-poc/index.html"

echo "▸ uploading HelmLearn source and building it on the server"
eval $RSYNC --exclude node_modules --exclude dist --exclude test-results --exclude playwright-report "$HERE/helmlearn/" "$USER@$HOST:/opt/asmi-poc/helmlearn/"
$SSH 'set -e; cd /opt/asmi-poc/helmlearn && npm ci --silent && BASE_PATH=/genai-learning/ npm run build >/dev/null && sudo chown -R www-data /opt/asmi-poc/helmlearn'

echo "▸ nginx + systemd"
eval $RSYNC "$HERE/deploy/nginx-asmi-poc.conf" "$USER@$HOST:/tmp/nginx-asmi-poc.conf"
eval $RSYNC "$HERE/deploy/helmlearn-preview.service" "$USER@$HOST:/tmp/helmlearn-preview.service"
$SSH 'set -e
  sudo mv /tmp/nginx-asmi-poc.conf /etc/nginx/sites-available/asmi-poc.conf
  sudo ln -sf /etc/nginx/sites-available/asmi-poc.conf /etc/nginx/sites-enabled/asmi-poc.conf
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo mv /tmp/helmlearn-preview.service /etc/systemd/system/helmlearn-preview.service
  sudo systemctl daemon-reload && sudo systemctl enable --now helmlearn-preview && sudo systemctl restart helmlearn-preview
  sudo nginx -t && sudo systemctl reload nginx
  sleep 2; curl -s -o /dev/null -w "document-assembly: %{http_code}\n" http://127.0.0.1/document-assembly/
  curl -s -o /dev/null -w "genai-learning: %{http_code}\n" http://127.0.0.1/genai-learning/'
echo "✓ done — http://$HOST/document-assembly/  ·  http://$HOST/genai-learning/"
