#!/usr/bin/env bash
# Runs ON THE DEPLOYMENT SERVER (installed to /opt/devops-app/deploy.sh by setup-deploy-server.sh).
# Called by Jenkins: deploy.sh <build_number> <app_version>
set -euo pipefail

BUILD="${1:?build number required}"
VERSION="${2:-1.0.$BUILD}"
APP_ROOT=/opt/devops-app
RELEASE_DIR="$APP_ROOT/releases/$BUILD"
ARCHIVE="/tmp/release-$BUILD.tar.gz"

echo "==> Unpacking release $BUILD"
mkdir -p "$RELEASE_DIR"
tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"

echo "==> Installing production dependencies"
( cd "$RELEASE_DIR/backend" && npm ci --omit=dev )

echo "==> Switching 'current' symlink"
PREV="$(readlink -f "$APP_ROOT/current" || true)"
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"

echo "==> Reloading PM2 apps"
cd "$APP_ROOT/current"
export APP_VERSION="$VERSION" BUILD_NUMBER="$BUILD"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

echo "==> Health check"
ok=0
for i in $(seq 1 10); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then ok=1; break; fi
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  echo "!! Health check failed - rolling back"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" "$APP_ROOT/current"
    cd "$APP_ROOT/current" && pm2 startOrReload ecosystem.config.js --update-env
  fi
  exit 1
fi

echo "==> Cleaning up (keep last 5 releases)"
rm -f "$ARCHIVE"
cd "$APP_ROOT/releases" && ls -1dt */ | tail -n +6 | xargs -r rm -rf

echo "==> Deploy of build $BUILD complete"
