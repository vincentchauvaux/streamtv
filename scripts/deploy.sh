#!/usr/bin/env bash
# Redéploiement de StreamTV sur le VPS.
# Usage : depuis la racine du projet -> ./scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> git pull"
git pull

echo "==> npm ci (installe deps + prisma generate via postinstall)"
npm ci

echo "==> prisma generate"
npx prisma generate

echo "==> prisma db push (synchronise le schéma SQLite)"
npx prisma db push

echo "==> build production"
npm run build

echo "==> redémarrage du process"
if command -v pm2 >/dev/null 2>&1 && pm2 describe streamtv >/dev/null 2>&1; then
  pm2 restart streamtv
elif systemctl list-units --type=service 2>/dev/null | grep -q streamtv; then
  sudo systemctl restart streamtv
else
  echo "Aucun process 'streamtv' (PM2 ou systemd) trouvé."
  echo "Premier lancement : 'pm2 start ecosystem.config.js' ou configurez systemd (voir DEPLOIEMENT.md)."
fi

echo "==> Déploiement terminé."
