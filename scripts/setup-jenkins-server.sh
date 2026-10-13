#!/usr/bin/env bash
# Run ONCE on the JENKINS server (Ubuntu/Debian), as a sudo user.
#   sudo bash setup-jenkins-server.sh
set -euo pipefail

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Build and start Jenkins"
cd "$(dirname "$0")/../jenkins"
docker compose up -d --build

echo "==> Generate the SSH key Jenkins will use to deploy"
docker exec jenkins bash -c '
  mkdir -p /var/jenkins_home/.ssh &&
  [ -f /var/jenkins_home/.ssh/deploy_key ] || ssh-keygen -t ed25519 -N "" -C jenkins-deploy -f /var/jenkins_home/.ssh/deploy_key
'

echo
echo "================ Public key (give this to setup-deploy-server.sh) ================"
docker exec jenkins cat /var/jenkins_home/.ssh/deploy_key.pub
echo "==================================================================================="
echo
echo "Initial admin password:"
sleep 15
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword || echo "(not ready yet - run again in a minute)"
echo
echo "Open http://<this-server-ip>:8080"
