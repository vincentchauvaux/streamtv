# Déploiement de StreamTV sur un VPS OVH

Guide complet et copiable pour mettre **StreamTV** en production sur votre VPS OVH.

> **Cible** : VPS OVH « VPS-1 2026 » — 4 vCores, 8 Go RAM
> **IPv4** : `51.178.44.114` · **Hostname** : `vps-e09ed6db.vps.ovh.net`
> **OS supposé** : Ubuntu 24.04 LTS (adaptez `apt` si Debian)

## Résumé technique de l'app

| Élément | Valeur |
|---|---|
| Framework | Next.js 15.3 (App Router) + React 19 |
| Node.js requis | **≥ 20**, recommandé **22 LTS** |
| Gestionnaire de paquets | **npm** (présence de `package-lock.json`) |
| Base de données | **SQLite** via Prisma (fichier `.db` local) |
| Création schéma | `prisma db push` (pas de dossier `migrations/`) |
| `prisma generate` | automatique via `postinstall` |
| Build | `next build` (sortie `.next` standard — **pas** de mode `standalone`) |
| Démarrage prod | `next start` → port **3000** par défaut |
| Variables d'env | `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET` (optionnel) |
| Réseau sortant | **requis** : le proxy de flux (`/api/stream/proxy`) fait des requêtes serveur vers les flux IPTV upstream |

---

## 1. Prérequis & connexion SSH

### Se connecter

```bash
ssh root@51.178.44.114
```

### Mettre le système à jour

```bash
apt update && apt upgrade -y
apt install -y curl git build-essential ufw fail2ban
```

### Créer un utilisateur non-root (recommandé)

```bash
adduser deploy
usermod -aG sudo deploy
# Copier votre clé SSH pour vous connecter directement en tant que 'deploy'
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Reconnectez-vous ensuite avec : `ssh deploy@51.178.44.114`

### Pare-feu (ufw)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

> `ufw` ne bloque **pas** le trafic sortant par défaut → le proxy de flux StreamTV pourra joindre les serveurs IPTV. Ne mettez pas de règle `deny out` sinon les flux ne se chargeront plus.

### fail2ban (optionnel mais conseillé)

```bash
sudo systemctl enable --now fail2ban
sudo systemctl status fail2ban
```

---

## 2. Installer Node.js 22 LTS

Via NodeSource :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # doit afficher v22.x
npm -v
```

`build-essential` (installé à l'étape 1) couvre les dépendances natives éventuelles.

---

## 3. Cloner le dépôt depuis GitHub

Choisissez l'utilisateur applicatif (`deploy`) et un dossier, p. ex. `/home/deploy/streamtv`.

### Cas A — Dépôt **public** (HTTPS, le plus simple)

```bash
cd ~
git clone https://github.com/vincentchauvaux/streamtv.git
cd streamtv
```

### Cas B — Dépôt **privé** via clé de déploiement SSH (recommandé pour privé)

```bash
# Sur le VPS, générer une clé dédiée
ssh-keygen -t ed25519 -C "vps-streamtv" -f ~/.ssh/id_streamtv -N ""
cat ~/.ssh/id_streamtv.pub
```

Ajoutez la clé publique affichée dans **GitHub → repo streamtv → Settings → Deploy keys → Add deploy key** (lecture seule suffit).

Puis configurez SSH et clonez :

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-streamtv
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_streamtv
EOF

git clone git@github-streamtv:vincentchauvaux/streamtv.git
cd streamtv
```

### Cas C — Dépôt privé via token (PAT)

Créez un *Personal Access Token* (scope `repo`) sur GitHub, puis :

```bash
git clone https://<VOTRE_PAT>@github.com/vincentchauvaux/streamtv.git
cd streamtv
```

> Le PAT apparaît dans `git remote -v`. Préférez la clé de déploiement (Cas B) pour la sécurité.

---

## 4. Variables d'environnement

Créez le fichier `.env` à la racine du projet à partir de l'exemple :

```bash
cp .env.example .env
```

Générez un secret JWT solide :

```bash
openssl rand -base64 48
```

Éditez `.env` (`nano .env`) :

```env
DATABASE_URL="file:./prod.db"
JWT_SECRET="<collez-le-secret-généré-ci-dessus>"
CRON_SECRET="<un-autre-secret-aléatoire>"
NODE_ENV="production"
```

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Chemin du fichier SQLite (relatif au projet). `file:./prod.db` crée `prod.db` à la racine. |
| `JWT_SECRET` | Secret de signature des sessions JWT (**indispensable** en prod). |
| `CRON_SECRET` | Protège `GET /api/cron/scan` (rescan auto 24 h + refresh EPG). |
| `NODE_ENV` | `production`. |

> ⚠️ Le `.env` ne doit **jamais** être commité (vérifiez qu'il est dans `.gitignore`).

---

## 5. Base de données Prisma (SQLite)

StreamTV utilise `prisma db push` (pas de migrations versionnées).

```bash
npm ci                 # installe deps + lance 'prisma generate' (postinstall)
npx prisma db push     # crée le fichier SQLite + le schéma
```

### (Optionnel) Remplir avec des playlists de démo

```bash
npm run seed:playlists
# Crée le compte démo demo@streamtv.local / demo123456 si absent
```

---

## 6. Build de production

```bash
npm ci            # si pas déjà fait à l'étape 5
npm run build     # next build → dossier .next
```

Test rapide du démarrage :

```bash
npm run start     # écoute sur http://localhost:3000
# Ctrl+C pour arrêter, puis passez au gestionnaire de process (étape 7)
```

> L'app n'est **pas** en mode `output: "standalone"` : on lance donc bien `next start`, pas un `server.js` autonome.

---

## 7. Gestionnaire de process

Deux options. **PM2 est recommandé** (le plus simple). systemd est l'alternative « sans dépendance ».

### Option A — PM2 (recommandé)

```bash
sudo npm install -g pm2
```

Un fichier `ecosystem.config.js` est fourni à la racine du repo :

```bash
pm2 start ecosystem.config.js
pm2 save                    # sauvegarde la liste des process
pm2 startup systemd         # affiche une commande à copier/coller (lance PM2 au boot)
# … exécutez la commande 'sudo env PATH=... pm2 startup' indiquée
pm2 save
```

Commandes utiles :

```bash
pm2 status
pm2 logs streamtv
pm2 restart streamtv
pm2 stop streamtv
```

### Option B — systemd (alternative)

Créez le service (adaptez `User`, chemins et `which node`) :

```bash
sudo nano /etc/systemd/system/streamtv.service
```

```ini
[Unit]
Description=StreamTV (Next.js)
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/streamtv
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
# Mémoire : 8 Go dispo, on plafonne le tas Node si besoin
# Environment=NODE_OPTIONS=--max-old-space-size=2048

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now streamtv
sudo systemctl status streamtv
journalctl -u streamtv -f      # logs en direct
```

---

## 8. Reverse proxy Nginx

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/streamtv
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name vps-e09ed6db.vps.ovh.net 51.178.44.114;

    # Flux HLS proxifiés : timeouts généreux + buffering désactivé
    proxy_read_timeout 300;
    proxy_send_timeout 300;
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;     # important pour le streaming HLS
    }
}
```

Activez et rechargez :

```bash
sudo ln -s /etc/nginx/sites-available/streamtv /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

L'app est alors accessible sur `http://vps-e09ed6db.vps.ovh.net` (ou `http://51.178.44.114`).

---

## 9. HTTPS avec Let's Encrypt (certbot)

Let's Encrypt **exige un nom de domaine** ; il ne délivre pas de certificat pour une IP brute.

Vous avez deux possibilités :

### Cas 1 — Vous avez un domaine (recommandé)

1. Chez votre registrar (OVH ou autre), créez un enregistrement **A** pointant vers `51.178.44.114` (et un **AAAA** vers votre IPv6 si vous voulez l'IPv6), p. ex. `streamtv.mondomaine.com`.
2. Mettez ce domaine dans `server_name` du bloc Nginx (étape 8), puis `sudo systemctl reload nginx`.
3. Installez et lancez certbot :

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d streamtv.mondomaine.com
```

Certbot configure le HTTPS et le renouvellement auto. Vérifiez le timer :

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

### Cas 2 — Utiliser le hostname OVH `vps-e09ed6db.vps.ovh.net`

Ce hostname résout déjà vers votre IP, donc certbot **peut** émettre un certificat pour lui :

```bash
sudo certbot --nginx -d vps-e09ed6db.vps.ovh.net
```

> C'est fonctionnel mais peu lisible pour des utilisateurs. Un vrai domaine est préférable. Tant que vous restez en HTTP, l'app fonctionne, mais les cookies de session (httpOnly) sont plus sûrs en HTTPS.

---

## 10. Mises à jour / redéploiement

Un script `scripts/deploy.sh` est fourni dans le repo. Sur le VPS, depuis la racine du projet :

```bash
chmod +x scripts/deploy.sh   # une seule fois
./scripts/deploy.sh
```

Il enchaîne : `git pull` → `npm ci` → `prisma generate` + `db push` → `npm run build` → redémarrage PM2.

Manuellement, l'équivalent est :

```bash
git pull
npm ci
npx prisma generate
npx prisma db push
npm run build
pm2 restart streamtv     # ou: sudo systemctl restart streamtv
```

---

## 11. Notes spécifiques à StreamTV

- **Proxy de flux (sortant)** : `/api/stream/proxy` télécharge côté serveur les manifestes/segments HLS depuis les serveurs IPTV (iptv-org, jmp2.uk…). Le VPS doit pouvoir **sortir** en HTTP/HTTPS (ufw autorise le sortant par défaut — ne le bloquez pas). Le proxy bloque déjà les IP privées (anti-SSRF).
- **Runtime Node obligatoire** : les routes proxy déclarent `runtime = "nodejs"` → ne fonctionnent pas sur de l'edge/serverless. Un VPS Node classique est parfait.
- **Persistance SQLite** : la base est un simple fichier (`prod.db`). Il survit aux redéploiements **tant que vous ne le supprimez pas** et qu'il n'est pas dans le dossier de build. Sauvegardez-le régulièrement :

```bash
# Sauvegarde simple (à mettre en cron)
cp ~/streamtv/prod.db ~/backups/prod-$(date +%F).db
```

- **Mémoire** : 8 Go suffisent largement. Le build Next peut être gourmand ; en cas de besoin, limitez le tas : `NODE_OPTIONS=--max-old-space-size=2048 npm run build`.
- **Logs** : `pm2 logs streamtv` (PM2) ou `journalctl -u streamtv -f` (systemd).
- **Cache & queue in-memory** : le cache et la file de jobs sont en mémoire → réinitialisés à chaque redémarrage (rate limit du proxy inclus). Normal pour un seul process.
- **CRON_SECRET** : si vous voulez le rescan automatique, appelez périodiquement `GET /api/cron/scan` avec le secret (cron système + `curl`).

---

## 12. Dépannage rapide

| Problème | Cause probable | Solution |
|---|---|---|
| `EADDRINUSE :3000` | Un process écoute déjà sur 3000 | `pm2 delete streamtv` puis relancer, ou `lsof -i :3000` → `kill <pid>` |
| Build tué (OOM) | Mémoire insuffisante pendant `next build` | `NODE_OPTIONS=--max-old-space-size=2048 npm run build` |
| `@prisma/client did not initialize` | `prisma generate` non exécuté | `npx prisma generate` (lancé par `npm ci` via postinstall) |
| `Environment variable not found: DATABASE_URL` | `.env` absent/mal chargé | Vérifiez la présence et le contenu de `.env` à la racine |
| Permission denied sur `prod.db` | Mauvais propriétaire du fichier | `sudo chown deploy:deploy prod.db` |
| Flux ne se chargent pas | Sortant bloqué, ou flux upstream mort | Vérifier ufw (pas de `deny out`), tester l'URL dans VLC, rescan playlist |
| 502 Bad Gateway (Nginx) | App non démarrée sur 3000 | `pm2 status` / `systemctl status streamtv` ; `pm2 logs` |
| Page blanche après déploiement | Build pas refait après `git pull` | Relancer `npm run build` puis redémarrer le process |

---

## Récapitulatif express

```bash
# 1. SSH + sécurité + Node 22
ssh root@51.178.44.114
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

# 2. Cloner
git clone https://github.com/vincentchauvaux/streamtv.git && cd streamtv

# 3. Config
cp .env.example .env && nano .env       # JWT_SECRET = openssl rand -base64 48

# 4. DB + build
npm ci && npx prisma db push && npm run build

# 5. Lancer + proxy
pm2 start ecosystem.config.js && pm2 save && pm2 startup
sudo apt install -y nginx   # puis bloc server (étape 8)

# 6. HTTPS (avec un domaine pointé sur l'IP)
sudo certbot --nginx -d streamtv.mondomaine.com
```
