#!/usr/bin/env bash
# Run ONCE on the DEPLOYMENT server (Ubuntu/Debian), as a sudo user.
#   sudo bash setup-deploy-server.sh "<jenkins public ssh key>"
set -euo pipefail

JENKINS_PUBKEY="${1:?usage: setup-deploy-server.sh \"ssh-ed25519 AAAA... jenkins\"}"
APP_ROOT=/opt/devops-app

echo "==> Base packages"
apt-get update
apt-get install -y curl git nginx ca-certificates gnupg ufw

echo "==> Node.js 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> Docker + compose plugin"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> 'deploy' user"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "$JENKINS_PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "==> App directories"
mkdir -p "$APP_ROOT/releases"
chown -R deploy:deploy "$APP_ROOT"

echo "==> PM2 (global) + boot startup for the deploy user"
npm install -g pm2
env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy | tail -n 1 | bash || true

echo "==> Nginx"
cp "$(dirname "$0")/../nginx/devops-app.conf" /etc/nginx/sites-available/devops-app
ln -sf /etc/nginx/sites-available/devops-app /etc/nginx/sites-enabled/devops-app
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 3001/tcp   # Grafana
ufw allow 9090/tcp   # Prometheus
ufw --force enable

echo
echo "Done. Next: copy scripts/deploy.sh to $APP_ROOT/deploy.sh, then start monitoring (see README)."
