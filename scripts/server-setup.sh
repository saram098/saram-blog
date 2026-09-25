#!/usr/bin/env bash
# Run ONCE on the AWS box as the deploy user. Idempotent.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/apps/saram-blog}"
PORT="${PORT:-4321}"

command -v node >/dev/null || { echo "Install Node 20+ first"; exit 1; }
node -e 'process.exit(parseInt(process.versions.node) >= 20 ? 0 : 1)' || { echo "Node 20+ required"; exit 1; }
command -v pm2 >/dev/null || npm install -g pm2

mkdir -p "$APP_DIR"
echo "App dir ready: $APP_DIR"

# make pm2 survive reboots
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 || true
echo
echo "Done. Now:"
echo "  1. Add this box's public IP as DEPLOY_HOST in GitHub secrets"
echo "  2. Add '$USER' as DEPLOY_USER"
echo "  3. Add '$APP_DIR' as DEPLOY_PATH"
echo "  4. Point saram.thebotss.com at 127.0.0.1:$PORT in your reverse proxy"
