#!/usr/bin/env bash
# Installe le binaire Rust StreamTV et bascule hors PM2/Next.
# À lancer en root depuis la racine du dépôt sur le VPS : bash deploy/install-rust.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer en root." >&2
  exit 1
fi

export PATH="${HOME}/.cargo/bin:/usr/local/cargo/bin:${PATH}"

if [ ! -f "$ROOT/.env" ]; then
  echo "Fichier .env manquant dans $ROOT" >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust/cargo introuvable. Installez rustup puis relancez." >&2
  exit 1
fi

# Charge .env sans source bash-only
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|\#*) continue ;;
  esac
  key="${line%%=*}"
  val="${line#*=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  export "$key=$val"
done < "$ROOT/.env"

if [ -z "${JWT_SECRET:-}" ]; then
  echo "JWT_SECRET manquant dans .env" >&2
  exit 1
fi

echo "==> Build release"
cd "$ROOT/server"
cargo build --release
install -m 755 target/release/streamtv /usr/local/bin/streamtv

echo "==> systemd"
install -m 644 "$ROOT/deploy/streamtv.service" /etc/systemd/system/streamtv.service
install -m 644 "$ROOT/deploy/streamtv-cron.service" /etc/systemd/system/streamtv-cron.service
install -m 644 "$ROOT/deploy/streamtv-cron.timer" /etc/systemd/system/streamtv-cron.timer
systemctl daemon-reload

echo "==> Arrêt PM2 (si présent)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop streamtv 2>/dev/null || true
  pm2 delete streamtv 2>/dev/null || true
  pm2 save 2>/dev/null || true
fi

# Libérer le port 3001 au besoin
if command -v ss >/dev/null 2>&1 && ss -ltnp 2>/dev/null | grep -q ':3001'; then
  echo "Le port 3001 est encore pris — arrêt forcé…"
  fuser -k 3001/tcp 2>/dev/null || true
  sleep 1
fi

echo "==> Démarrage streamtv"
systemctl enable --now streamtv.service
systemctl enable --now streamtv-cron.timer

sleep 1
if curl -sf http://127.0.0.1:3001/healthz >/dev/null; then
  echo "OK — StreamTV Rust écoute 127.0.0.1:3001"
else
  echo "Échec healthz — journal :" >&2
  journalctl -u streamtv -n 40 --no-pager >&2
  exit 1
fi
