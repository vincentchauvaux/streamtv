# StreamTV — Agent

Application IPTV full-stack : playlists M3U, guide EPG, favoris synchronisés, reprise de lecture et recommandations.

## Stack

- **Frontend** : Next.js 15 (App Router), React 19, Tailwind CSS 4
- **Backend** : API Routes Next.js
- **Base de données** : SQLite via Prisma
- **Validation** : Zod (schémas centralisés)
- **Auth** : JWT en cookie httpOnly (bcrypt + jose)
- **Lecteur** : hls.js pour flux HLS (.m3u8), détection type de flux
- **UI** : Lucide icons, design system custom, `@tanstack/react-virtual` pour listes longues

## Couches (architecture)

```
API Route → Validation (Zod) → Service métier → Repository → Prisma → SQLite
```

| Couche | Rôle | Emplacement |
|---|---|---|
| **API** | Auth, parse requête, réponse JSON | `src/app/api/**/route.ts` |
| **Validation** | Schémas Zod partagés | `src/lib/schemas/` + `src/lib/validate.ts` |
| **Service** | Logique métier, orchestration | `src/lib/services/` |
| **Repository** | Accès données, requêtes Prisma | `src/lib/repositories/` |
| **Parser** | M3U, XMLTV | `src/lib/parsers/` |
| **Infra** | Logger, cache, queue jobs | `src/lib/logger.ts`, `cache.ts`, `queue.ts` |
| **Types** | Interfaces partagées front/back | `src/types/` |
| **Providers** | État global React | `src/providers/` |

## Structure

```
streamtv/
├── prisma/schema.prisma
├── src/
│   ├── types/                 # channel, playlist, epg, stream, search, import…
│   ├── providers/             # Auth, Player, Playlist, Settings, Theme, Recommendation
│   ├── app/
│   │   ├── page.tsx           # Landing + auth
│   │   ├── globals.css
│   │   ├── app/
│   │   │   ├── layout.tsx     # Auth + AppProviders
│   │   │   ├── page.tsx       # Dashboard (stats + lecteur + reco)
│   │   │   ├── admin/         # Monitoring / santé système
│   │   │   ├── channels/      # Liste virtualisée, filtres avancés
│   │   │   ├── guide/         # Guide TV (EPG cache BDD)
│   │   │   ├── favorites/     # Favoris groupés par catégorie
│   │   │   └── settings/      # Sections : App, Lecture, EPG, Playlists, Sync, Apparence, Raccourcis
│   │   └── api/               # REST API (+ /stats, /admin, /stream/proxy)
│   ├── components/
│   │   ├── app-shell.tsx      # Shell persistant (sidebar + monte le lecteur global)
│   │   ├── persistent-player.tsx  # Lecteur global (monté 1× dans le shell, portail vers l'emplacement in-page)
│   │   ├── player-slot.tsx    # Emplacement in-page du lecteur (cible de portail + empty state)
│   │   ├── video-player/      # index, controls, overlay, volume, timeline, hooks, context
│   │   ├── channel-card.tsx
│   │   └── ui/
│   └── lib/
│       ├── schemas/           # Zod : auth, playlist, favorite, search, history, epg, stream
│       ├── logger.ts          # INFO, WARN, ERROR
│       ├── cache.ts           # Map + TTL (prêt Redis)
│       ├── queue.ts           # JobQueue in-memory : SCAN, IMPORT, REFRESH_EPG, HEALTH_CHECK
│       ├── validate.ts
│       ├── parsers/
│       ├── demo-playlists.ts  # URLs playlists légales (seed + import démo)
│       ├── normalize.ts       # normalisation noms/groupes/langues/pays
│       ├── repositories/
│       └── services/
└── agent.md
```

## Modèle de données (Prisma)

| Modèle | Rôle |
|---|---|
| **User** | Compte utilisateur |
| **Playlist** | Source M3U, `lastScanAt`, `channelCount`, `scanStatus` |
| **ScanLog** | Historique scans : counts (chaînes, radios, groupes, logos, EPG), `durationMs`, erreurs |
| **Channel** | Métadonnées + `normalizedName`, `logoSource`, `logoEtag`, `logoWidth/Height`, `logoLastUpdate` |
| **Stream** | URL flux, `quality`, `codec`, `streamType`, `online` |
| **Program** | EPG en cache BDD |
| **Favorite** | Favori + `category` (NEWS/SPORTS/MOVIES/KIDS) |
| **WatchHistory** | Reprise lecture enrichie |

## Fonctionnalités

| Fonctionnalité | Route / API | État |
|---|---|---|
| Inscription / Connexion | `/api/auth/*` + Zod | ✅ |
| Import playlist M3U (async via queue) | `POST /api/playlists/import` | ✅ |
| Rescan playlist | `POST /api/playlists/scan?id=` | ✅ |
| Résumé import (ScanLog) | Modal Paramètres après scan OK | ✅ |
| Scan auto 24h + EPG refresh | `GET /api/cron/scan` | ✅ |
| Stats dashboard | `GET /api/stats` + cards UI | ✅ |
| Monitoring admin | `/app/admin` + `GET /api/admin` | ✅ |
| Recherche filtres unifiés | `SearchQuery` + `GET /api/channels` | ✅ |
| Favoris sync + catégories | `GET /api/favorites?grouped=true` | ✅ |
| Guide TV (EPG cache + cache TTL) | `GET /api/epg` | ✅ |
| Lecteur refactoré (composants) | `src/components/video-player/` | ✅ |
| Lecteur global persistant (navigation) | `persistent-player.tsx` + `PlayerProvider` | ✅ |
| Providers globaux | `AppProviders` dans layout `/app` | ✅ |
| Import playlists démo (légales) | `POST /api/playlists/import-demo` + UI empty state | ✅ |
| Seed CLI playlists | `npm run seed:playlists` | ✅ |
| Logo enrichi (etag, skip re-fetch) | Scan service | ✅ |
| Logger structuré | services scan/epg/import | ✅ |

## Roadmap

```
v0.2 ✓ M3U, EPG, Favoris, Historique, Services/Repositories, Scan async
v0.3 ✓ Lecteur persistant (portail inline + fallback docké, lecture continue navigation) │ □ Multi profils, Contrôle parental, PiP natif, Multi lecteur, Chromecast, AirPlay
v0.4 □ Timeshift, DVR, Multi écrans, Notifications
v1.0 □ Android TV, PWA, Electron, Tauri
```

## Démarrage

```bash
cd ~/streamtv
npm install
npm run db:push
npm run dev        # http://localhost:3000
```

Production :

```bash
npm run build
npm run start
```

Variables d'environnement (voir `.env.example`) :
- `DATABASE_URL` — chemin SQLite
- `JWT_SECRET` — secret JWT
- `CRON_SECRET` — protège `/api/cron/scan`

## Déploiement (VPS OVH)

**Production en ligne** : **https://vps-e09ed6db.vps.ovh.net** (HTTP → HTTPS redirigé)

| Élément | Valeur |
|---|---|
| VPS | OVH VPS-1 2026 — 4 vCores, 8 Go RAM, 75 Go |
| OS | Ubuntu 24.04 (kernel 6.14) |
| IPv4 | `51.178.44.114` |
| Chemin app | `/root/streamtv` |
| Port interne | **3001** (Canopée utilise 3000) |
| Process | PM2 (`streamtv` + `canopee` sur le même VPS) |
| Reverse proxy | Nginx — routage par `server_name` |
| Canopée | https://canopée.be → port 3000 (`/var/www/canopee`) |
| StreamTV | https://vps-e09ed6db.vps.ovh.net → port 3001 |
| BDD prod | `/root/streamtv/prod.db` (SQLite) |
| Accès SSH | clé `~/.ssh/id_ed25519` (root) — pas de mot de passe |

Guide complet pas à pas : **[`DEPLOIEMENT.md`](DEPLOIEMENT.md)** (SSH + sécurité, Node 22, clone GitHub, `.env`, `prisma db push`, build, PM2/systemd, Nginx, HTTPS Let's Encrypt, redéploiement, dépannage).

Points clés :
- Node **≥ 20** (reco 22 LTS), gestionnaire **npm**, port **3000** (`next start`, pas de mode `standalone`).
- BDD SQLite : `npx prisma db push` (pas de migrations versionnées) ; `prisma generate` via `postinstall`.
- Le proxy de flux (`runtime = "nodejs"`) requiert un **accès réseau sortant** → ne pas bloquer le trafic sortant.
- Redéploiement rapide : `scripts/deploy.sh` (git pull → npm ci → db push → build → restart). Config PM2 : `ecosystem.config.js`.
- HTTPS : nécessite un domaine pointé (A record) vers `51.178.44.114`, ou le hostname `vps-e09ed6db.vps.ovh.net` (`certbot --nginx -d vps-e09ed6db.vps.ovh.net`).
- En multi-sites (Canopée + StreamTV) : StreamTV écoute le **port 3001** ; Canopée garde le **3000**.

## Sécurité & légal

| Élément | Détail |
|---|---|
| Pages légales | `/mentions-legales`, `/cgu`, `/confidentialite`, `/cookies` |
| Bannière cookies | `CookieBanner` (session technique uniquement, localStorage consent) |
| Inscription | case à cocher acceptation CGU + confidentialité (`acceptTerms`) |
| Headers HTTP | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS (prod) via `next.config.ts` |
| Auth | JWT httpOnly + Secure (prod) ; `JWT_SECRET` **obligatoire** en prod ; bcrypt cost 12 ; mot de passe min **8** |
| Rate limit | login 10/15 min/IP ; register 5/15 min/IP ; proxy flux 600/min/user |
| Cron | `CRON_SECRET` obligatoire en production (`Bearer`) |

## Architecture détaillée

1. **Auth** : cookie httpOnly `streamtv_session`, layout `/app/*` redirige si non connecté. `AuthProvider` expose la session côté client.
2. **Playlists** : import → playlist PENDING → `jobQueue.enqueue(IMPORT)` → `scan.service` → Channel + Stream + ScanLog enrichi. EPG async si URL fournie.
3. **Queue** : abstraction `JobQueue` — implémentation actuelle `setTimeout` in-memory ; jobs `SCAN`, `IMPORT`, `REFRESH_EPG`, `HEALTH_CHECK`.
4. **Cache** : `get/set/delete` + TTL sur Map — clés stats, groupes, EPG. API identique pour Redis futur.
5. **Logos** : lors du rescan, si URL logo inchangée et etag connu → métadonnées conservées ; sinon HEAD request pour etag.
6. **Recherche** : type `SearchQuery` (name, group, country, language, resolution, online, favorite, playlist, category) → `channelService.search`. La recherche texte matche aussi `normalizedName` (requête normalisée).
7. **Normalisation chaînes** : à l'import/rescan, chaque chaîne reçoit un `normalizedName` + group/language/country normalisés pour compatibilité cross-playlist (voir section ci-dessous).
8. **Lecteur** : composants séparés (controls, overlay, volume, hooks HLS) + `PlayerProvider` pour état global. Chargement sérialisé par token de génération (`loadId`), destruction HLS avant nouveau src, debounce 200 ms sur changement de chaîne, retry auto (×2) sur erreurs réseau, récupération stall **live-safe** sur `bufferStalledError` (gardes buffer/intervalle → nudge → `startLoad(-1)` 600 ms → reload niveau 1,8 s, **jamais `recoverMediaError`** sur live — detach/reattach remet `currentTime` à 0), reset actif (`startLoad(-1)` immédiat), Pluto : `startLevel: 0` + `ignorePlaylistParsingErrors: true` + `testBandwidth: false` (**pas** de re-verrouillage `currentLevel` sur `LEVEL_UPDATED`), config live = défauts hls.js (buffers 60/90), retries manifest/level ×25, frag ×15, logs diagnostic, validation URL flux, `AbortError` ignoré lors des switches rapides.
9. **Cron** : rescan playlists > 24 h + refresh EPG.

## Normalisation des chaînes

**Pourquoi** : deux playlists peuvent nommer la même chaîne différemment (`TF1 HD`, `001. TF1 FHD`, `tf1`). Sans normalisation, recherche, recommandations et détection de doublons ne fonctionnent pas entre playlists.

**Où** : `src/lib/normalize.ts` — appliqué dans `scan.service` à chaque import/rescan.

**Champs calculés** :

| Champ | Règles |
|---|---|
| `normalizedName` | minuscules, sans accents, suffixes qualité retirés (HD, FHD, 1080p, 4K…), préfixes numériques retirés, espaces/ponctuation unifiés |
| `group` | même logique que le nom |
| `language` | alias → ISO 639-1 (`French` → `fr`, `eng` → `en`) |
| `country` | alias → ISO 3166-1 alpha-2 (`France` → `FR`, `uk` → `GB`) |

**Exemples** :

| Entrée M3U | `normalizedName` |
|---|---|
| `TF1 HD` | `tf1` |
| `France 2 FHD` | `france 2` |
| `001. M6 1080p` | `m6` |
| `CANAL+ SPORT 4K` | `canal+ sport` |

**Recherche** : `GET /api/channels?q=tf1` matche `TF1 HD` via `normalizedName`.

**Doublons cross-playlist** : `channelService.findDuplicatesByNormalizedName(userId)` regroupe les chaînes partageant le même `normalizedName` dans plusieurs playlists.

**Recommandations** : dédoublonnage par `normalizedName` + bonus si la chaîne correspond à l'historique normalisé.

**Migration données existantes** : relancer un rescan (`POST /api/playlists/scan?id=…`) — le scan recrée les chaînes avec les champs normalisés.

## Tester

1. **Import + résumé** : Paramètres → Playlists → importer M3U → attendre statut OK → modal résumé (chaînes, radios, groupes, logos, EPG, durée).
2. **Stats** : Accueil → cards Chaînes / Playlists / Favoris / Programmes aujourd'hui.
3. **Admin** : Monitoring → chaînes, offline, dernier scan, durée import, erreurs ScanLog.
4. **Settings sections** : naviguer App, Lecture, Guide TV, Sync, Apparence, Raccourcis.
5. **Filtres** : `GET /api/channels?country=FR&online=true&favorite=true`
6. **Import démo** : Accueil → « Importer des chaînes gratuites » ou `npm run seed:playlists -- --sync`.
7. **Build** : `npm run build` doit passer.

## Limites connues / prochaines étapes

- **Queue Redis** : in-memory pour l'instant ; migrer `JobQueue` vers BullMQ/Redis en prod.
- **Cache Redis** : même API, swap implémentation.
- **Settings** : sections App/Sync partiellement placeholder (pas de persistance localStorage/BDD).
- **Timeline lecteur** : placeholder (flux live sans barre de progression).
- **Thème clair** : toggle UI présent, tokens CSS optimisés pour dark.
- **DASH** : type détecté, pas de dash.js.
- **Health check streams** : séquentiel au rescan (lent sur grosses playlists).
- **Admin** : accessible à tous les utilisateurs connectés (pas de rôle admin).

## Lecteur vidéo

### Types de flux supportés

| Type | Détection | Moteur |
|---|---|---|
| **HLS** (.m3u8) | `streamType` ou extension URL | hls.js (Chrome/Firefox) ; HLS natif Safari |
| **MP4** | extension `.mp4` | `<video>` natif |
| **TS** | extension `.ts` (hors .m3u8) | `<video>` natif |
| **YouTube Live** | URL youtube/youtu.be | Message UI — ouvrir dans navigateur externe |
| **DASH** (.mpd) | extension `.mpd` | Non supporté (pas de dash.js) |

Détection : `src/components/video-player/shortcuts.ts` (`resolveStreamType`, `isHlsStream`).

### Configuration HLS (hls.js)

Config centralisée dans `HLS_CONFIG` (`player-hooks.ts`). Réglée pour une **lecture fluide** sur live IPTV (Pluto / Samsung TV Plus) avant la basse latence.

> ⚠️ **Ne JAMAIS mélanger les deux familles de réglage live** — hls.js lève une erreur « illegal config » et refuse de démarrer :
> - **secondes** : `liveSyncDuration` / `liveMaxLatencyDuration`
> - **segments** : `liveSyncDurationCount` / `liveMaxLatencyDurationCount`
>
> On utilise **uniquement** la version en secondes.

| Option | Valeur | Défaut hls.js | Pourquoi |
|---|---|---|---|
| `startLevel` | `0` | auto (ABR) | Démarre au premier niveau Pluto. **Ne pas** réassigner `currentLevel` sur `LEVEL_UPDATED` — chaque refresh playlist (~5 s) re-déclencherait un reload niveau → coupure vidéo. |
| `ignorePlaylistParsingErrors` | `true` | `false` | Pluto émet des « media sequence mismatch » : hls.js merge la playlist sans `LEVEL_PARSING_ERROR` → pas de penalty box. **Garder pour Pluto.** |
| `testBandwidth` | `false` | `true` | Réduit les bascules ABR agressives sur flux multi-bitrate instables. |
| `maxFragLookUpTolerance` | `3` | `0.25` | Tolérance d'alignement de fragment élargie pour timestamps Pluto imprécis (évite gaps). |
| `maxBufferHole` | `0.5` | `0.1` | Taille de trou de buffer franchissable sans stall (Pluto a des micro-gaps). |
| `maxBufferLength` / `maxMaxBufferLength` | `60` / `90` | `30` / `60` | Buffer modérément élargi pour absorber coupures réseau. |
| `backBufferLength` | `30` | — | Buffer arrière conservé (s). |
| `lowLatencyMode` | `false` | `true` | LL-HLS inadapté aux flux IPTV publics. |
| retries manifest/level ×25, frag ×15 | — | bas | Flux Pluto instables : on insiste avant d'échouer. |

> **Live sync** : on utilise les **défauts hls.js** (`liveSyncDurationCount: 3`, etc.) — pas de surcharge `liveSyncDuration`/`liveMaxLatencyDuration` en secondes qui provoquait des seeks répétés au live edge.

**Mécanismes de récupération** (`player-hooks.ts`) :

| Mécanisme | Déclencheur | Action |
|---|---|---|
| `nudgeToBufferedRange` | stall avec buffer dispo | Repositionne `currentTime` dans une plage bufferisée (saut imperceptible). |
| `recoverLiveBufferStall` | stall sans buffer | `nudge` sinon `startLoad(-1)` (reprise au live edge). **Jamais `recoverMediaError`** : detach/reattach remet `currentTime` à 0 sur live. |
| `handleBufferStalled` | `bufferStalledError` | Gardes startup (< 10 s, niveau -1, manifest non parsé) + buffer ≥ 1 s disponible + intervalle min 8 s → nudge → `startLoad(-1)` à 600 ms → reload niveau à 1,8 s. |
| `detectTimeReset` | `currentTime` chute de > 5 s à < 2 s | `startLoad(-1)` immédiat. |

> Une récupération `startLoad(-1)` trop fréquente peut elle-même causer des micro-sauts : elle est protégée par les gardes startup + un debounce (`stallRecoveryActive`) pour ne pas s'emballer.

**Dépannage rapide** :

| Symptôme | Vérifier |
|---|---|
| **Coupure toutes les ~5 s (Pluto)** | Handler `LEVEL_UPDATED` qui réassigne `currentLevel` → reload playlist chaque segment. **Corrigé** : supprimer le re-lock ; garder `startLevel: 0` seulement. |
| **Lecture saccadée / accélérée** | `maxLiveSyncPlaybackRate` > 1 ou seeks live edge trop fréquents. Utiliser défauts hls.js pour live sync. |
| **`illegal hls.js config` (console)** | Mélange `liveSyncDuration*` (secondes) et `*Count` (segments). N'utiliser qu'**une** famille. Si l'erreur persiste après fix → **cache navigateur** : rechargement forcé `Cmd+Shift+R`. |
| **Sauts vers le live (image qui « rattrape »)** | `liveMaxLatencyDuration` trop bas ou recovery stall trop agressive. |

Doc officielle : <https://github.com/video-dev/hls.js/blob/master/docs/API.md#fine-tuning>.

### Changement de chaîne

1. `PlayerProvider.playChannel()` debounce 200 ms (dernier clic gagne).
2. `useHlsPlayer` incrémente un `loadId` : callbacks obsolètes ignorés.
3. Cleanup : `hls.destroy()`, pause vidéo, `removeAttribute('src')`, `video.load()` pour annuler les requêtes en cours.
4. `play()` via `safePlay()` — `AbortError` silencieux (normal lors d'un switch rapide).

### Lecteur global persistant (navigation entre sections)

**Problème résolu** : auparavant chaque page (`dashboard-client`, `channels`, `favorites`) montait son **propre** `<VideoPlayer>` et rendait elle-même `<AppShell>`. La navigation entre routes démontait tout le sous-arbre de la page → instance hls.js détruite + `<video>` retiré du DOM → la lecture s'arrêtait et l'écran affichait « Sélectionnez une chaîne pour commencer ». En plus, `channels` et `favorites` stockaient la chaîne courante dans un `useState` **local** → sélection perdue à la navigation.

**Architecture** : le lecteur est monté **une seule fois** dans le shell persistant, puis **téléporté (portail React)** vers l'emplacement in-page de la route active.

```
src/app/app/layout.tsx (server)
  └─ AppProviders
       └─ AppShell                 # monté dans le LAYOUT → ne se démonte JAMAIS entre routes
            ├─ <main>{children}</main>   # contenu de page (re-render à la navigation)
            │     └─ <PlayerSlot/>       # emplacement in-page (cible de portail) exposé par la page
            └─ <PersistentPlayer/>       # instance <video>/hls.js UNIQUE → createPortal(slot ?? dock)
```

- `layout.tsx` (App Router) ne se remonte pas lors d'une navigation entre routes enfants → `AppShell` + `PersistentPlayer` restent montés → l'instance hls.js et l'élément `<video>` **survivent** au changement de page.
- Les pages ne rendent **plus** `<AppShell>` ni `<VideoPlayer>` ; elles exposent uniquement un `<PlayerSlot/>` là où le lecteur doit apparaître (emplacement d'origine, in-page).

**Portail inline (clé de la continuité)** :

- `PersistentPlayer` rend **toujours** son contenu via `createPortal(playerNode, target)`. La position du portail dans l'arbre React est **stable** : seul le **conteneur DOM** (`target`) change. React ne re-monte donc pas le sous-arbre, il **re-parente** les nœuds (`appendChild`) → le `<video>` n'est jamais recréé → la lecture continue sans coupure.
- `target = slot ?? dockEl` : l'emplacement in-page (`slot`) s'il existe, sinon l'hôte du **mini-lecteur docké** (`dockEl`, fixe en bas à droite), toujours monté pour servir de cible de portail stable.
- `<PlayerSlot/>` enregistre son `<div>` via `registerSlot(el)` (au montage) / `unregisterSlot(el)` (au démontage). `unregisterSlot` ne nettoie que si l'élément correspond toujours → pas de « trou » lors du swap de page (la nouvelle page enregistre son slot avant/pendant le démontage de l'ancienne).

**Flux de sélection de chaîne** :

1. `PlayerProvider` (`src/providers/player-provider.tsx`) tient l'état global : `current` (chaîne), `resumePosition`, `slot` (+`registerSlot`/`unregisterSlot`), `playChannel(channel, position?)`, `clear()`.
2. Toute page appelle `useAppPlayer().playChannel(channel)` (cartes, touche Entrée sur `/channels`, reprise historique sur l'accueil) — debounce 200 ms (dernier clic gagne).
3. `PersistentPlayer` lit `current` et passe la chaîne au `<VideoPlayer>` unique. La sauvegarde de progression (`POST /api/watch-history`) est centralisée ici (fonctionne quelle que soit la page).
4. `clear()` (bouton ✕ superposé en haut à droite de la vidéo) arrête la lecture et masque le lecteur.

**Emplacements in-page (`<PlayerSlot/>`)** :

| Page | Emplacement | `emptyState` |
|---|---|---|
| **Accueil** (`dashboard-client`) | Après les stats, avant les sections « Reprendre » / « Recommandé » | ✅ « Sélectionnez une chaîne pour commencer » tant que `current === null` |
| **Chaînes** (`channels`) | En tête, sous le `PageHeader`, au-dessus des filtres | ❌ replié (`hidden`) tant que rien ne joue |
| **Favoris** (`favorites`) | En tête, sous le `PageHeader` | ❌ replié tant que rien ne joue |
| **Guide / Paramètres** | *aucun slot* → fallback mini-lecteur docké | — |

- Sans `emptyState`, le slot est `display:none` quand rien ne joue (pas d'espace vide), et redevient visible dès qu'une chaîne joue.

**Fallback — mini-lecteur docké** : sur une route **sans** `<PlayerSlot/>` (Guide, Paramètres), le lecteur s'affiche en carte fixe en bas à droite (`bottom-24 right-3` au-dessus de la nav mobile ; `lg:bottom-6 lg:right-6`, largeur `min(92vw,400px)`, `z-[45]`). L'hôte docké est masqué dès qu'un slot in-page est actif. Le **mode théâtre** a été supprimé (le lecteur s'affiche désormais inline, à sa place d'origine).

**Empty state** : « Sélectionnez une chaîne pour commencer » s'affiche dans le **slot de l'accueil** uniquement quand `current === null`. Une fois une chaîne lancée, le lecteur inline prend la place et persiste sur toutes les sections.

> ⚠️ Contrainte clé : l'élément `<video>` et l'instance hls.js ne doivent **jamais** être **re-montés** par React (cause du reset). Le portail change seulement le **parent DOM** (re-parentage), pas l'identité React du `<video>` → continuité garantie. Tout le travail de stabilité Pluto/HLS de `player-hooks.ts` est **inchangé** — seuls le **lieu de rendu** (portail inline vs docké) et le **flux** de sélection ont été modifiés.

### États UI

- **loading** : spinner overlay pendant chargement manifest / canplay.
- **error** : message rouge (hors ligne, 403, 404, flux inaccessible).
- **playing** : badge « EN DIRECT ».

### Retry automatique

Sur erreur réseau HLS (`NETWORK_ERROR`) ou erreur média récupérable, jusqu'à **2 retries** espacés de 1,5 s. Erreurs loguées via `src/lib/logger.ts`.

### Proxy streams / CORS

Les flux IPTV publics (iptv-org, jmp2.uk, etc.) ne renvoient presque jamais les en-têtes `Access-Control-Allow-Origin`. **hls.js** charge manifestes et segments via XHR → bloqué en navigateur sans proxy.

**Routes proxy** :

| Route | Usage |
|---|---|
| `POST /api/stream/proxy/register` | Body `{ url }` → `{ token, path }` — enregistre l'URL upstream, retourne un token court (~8 chars) |
| `GET /api/stream/proxy/:token` | Fetch via token (URL courte, évite 414) |
| `GET /api/stream/proxy?url=` | Fallback pour URLs courtes (&lt; 1500 chars) |

**Architecture token** : les flux Samsung TV Plus / Pluto (jmp2.uk) ont des URLs avec JWT `authToken` très longs. Passer l'URL complète en query string provoque **414 URI Too Long** (~8 KB limite serveur) quand hls.js charge manifest + playlists variantes.

1. Client : `registerProxyUrl(url)` → `POST /register` → token mis en cache client (Map url→token).
2. Requêtes hls.js → `/api/stream/proxy/TOKEN` (URL courte).
3. Serveur : token mappe vers URL en cache (`lib/cache.ts`, TTL 2h), lié au `userId`.
4. Réécriture m3u8 : chaque URL du manifest → register token → `/api/stream/proxy/TOKEN` (chemins relatifs, pas d'URL encodée). **Pistes sous-titres (`EXT-X-MEDIA TYPE=SUBTITLES`) conservées et proxifiées** comme la vidéo (playlists WebVTT + segments `.vtt`). Variantes vidéo (`.m3u8`), clés AES (`EXT-X-KEY`) et segments inclus.
5. **Base URL manifest** : après `redirect:follow`, utiliser `upstream.url` (URL finale, ex. pluto.tv) — pas l'URL jmp2.uk d'origine — pour résoudre les URLs relatives du manifest. Détection m3u8 renforcée via preview corps (`#EXTM3U`) si Content-Type incorrect.

| Aspect | Détail |
|---|---|
| Auth | Session JWT obligatoire (`getSessionUser`) à register ET fetch |
| Tokens | Liés au `userId` — user A ne peut pas utiliser le token de user B |
| TTL tokens | Manifestes 2 h, segments 4 h ; sliding expiration à chaque fetch token |
| Fetch | Côté serveur Next.js (pas de CORS) |
| SSRF | http/https uniquement ; blocage localhost, IP privées (10.x, 172.16–31.x, 192.168.x, 169.254.x, 127.x) |
| Rate limit | 600 req/min/utilisateur (segments HLS) |
| URL max | 4096 caractères (validation à l'enregistrement) |
| Redirects | Suivis côté serveur (`redirect: "follow"`) — jamais renvoyés au client |
| Manifest .m3u8 | URLs réécrites en chemins token `/api/stream/proxy/TOKEN` ; base = URL finale post-redirect ; **Cache-Control strict** sur playlists **niveau** uniquement (`no-cache, no-store, must-revalidate, max-age=0` + `Pragma`/`Expires`/`Surrogate-Control: no-store`) — détection `contextType=level` (query client), contenu `#EXTINF` sans `#EXT-X-STREAM-INF`, ou URL `level` ; live non-niveau : `no-cache, no-store, must-revalidate` |
| Segments | Relayés tels quels ; **Cache-Control strict** (`no-cache, no-store, must-revalidate` + `Pragma`/`Expires`) — évite cache navigateur sur `.ts` |
| Erreur upstream 414 | Mappée en 502 côté proxy (jamais 414 au client pour token valide) |
| Token introuvable | Log WARN + réponse 404 |

**Intégration lecteur** (`player-hooks.ts`) :

- `buildStreamProxyUrl()` async — enregistre puis retourne `/api/stream/proxy/TOKEN`.
- hls.js utilise un **loader custom** (`createProxyLoader`, pas `xhrSetup`) qui proxifie manifeste + segments via tokens ; **composition** (nouvelle instance XHR/fetch par requête, jamais `super.load()` réutilisé — évite `Loader can only be used once`) ; retry token proxy sur 401/403 (toute requête) et 404 (manifest/level/audio/subtitle uniquement) via `buildStreamProxyUrlFresh` + une seule retentative ; query `contextType=manifest` sur master et `contextType=level` + cache-bust sur niveau ; config Pluto (`ignorePlaylistParsingErrors: true`, `startLevel: 0`, `testBandwidth: false`, buffers 60/90, retries manifest/level ×25, frag ×15) ; **sous-titres lazy** ; **récupération stall live-safe** : `bufferStalledError` → gardes buffer/intervalle → nudge → `startLoad(-1)` 600 ms → reload niveau 1,8 s (**pas de `recoverMediaError`**) ; reset `currentTime` → récupération live edge active ; **`levelParsingError` media sequence mismatch** : ignoré côté hls.js via `ignorePlaylistParsingErrors` (plus de penalty box ABR).
- Safari HLS natif et MP4/TS utilisent aussi le proxy (manifest réécrit côté serveur).
- Message d'erreur générique : « Flux inaccessible (CORS ou hors ligne) ».

**Tester** : `npx tsx scripts/test-stream-proxy.ts` (master → variant → segments + refresh) ; ou importer playlists démo → lancer une chaîne iptv-org ou jmp2.uk (Samsung TV Plus) → Network tab : requêtes vers `/api/stream/proxy/TOKEN`, pas d'erreur 414 ni CORS.

**Limitations** :

- Latence supplémentaire (double hop serveur).
- Pas de cache CDN — chaque segment transite par Next.js (non adapté prod à gros volume sans cache Redis/CDN).
- Rate limit in-memory (reset au redémarrage).
- Pas de validation DNS→IP (SSRF DNS rebinding non couvert).

### Dépannage lecture

#### Sous-titres vs arrêt silencieux

| Cause | Symptôme | Statut |
|---|---|---|
| **Sous-titres DEFAULT auto-chargés** | Coupure ~5 s, erreurs console `SUBTITLE_LOAD_ERROR`, penalty box niveaux vidéo | **Cause partielle (corrigée)** — fix lazy CC |
| **Buffer stall live sans erreur fatale** | Image figée, pas d'erreur UI, logs `buffer stalled` ou `waiting` | **Corrigé** — récupération live-safe : nudge → `startLoad(-1)` → reload niveau ; **jamais `recoverMediaError`** (reset à 0 sur live) |
| **Media sequence mismatch (levelParsingError)** | Coupure ~30–50 s, logs `levelParsingError`, penalty box ABR (`switchLevel`) | **Corrigé** — `ignorePlaylistParsingErrors: true` + `startLevel: 0` (sans re-lock sur `LEVEL_UPDATED`) ; mismatch absorbé par merge hls.js sans penalty box |
| **Re-lock niveau sur LEVEL_UPDATED** | Coupure **exactement toutes les ~5 s** (= durée segment `#EXT-X-TARGETDURATION:5`) | **Corrigé** — `lockPlutoQualityLevel` sur chaque refresh playlist re-déclenchait reload niveau ; supprimé |
| **JWT jmp2.uk / auth Pluto expirée (~2 min)** | 403 upstream sur refresh manifest master, logs `auth upstream expirée` | **Cause probable sur Samsung TV Plus / Pluto** — reload source + retry ; rescan playlist si JWT BDD expiré |
| **Token proxy 404** | Segments/manifest 404, log `token 404` | **Corrigé** — sliding TTL + retry register sur 401/403/404 ; invalidation serveur token manifest sur 404 upstream |
| **Loader can only be used once** | Retry proxy appelle `super.load()` sur même XhrLoader | **Corrigé** — composition : nouvelle instance BaseLoader par requête/retry |
| **manifestLoadError fatal** | Session Pluto expirée, token proxy perdu au refresh | **Corrigé** — récupération complète : destroy HLS + `buildStreamProxyUrlFresh` + réinit (×2 max, délai 800 ms) |
| **React teardown accidentel** | Coupure au changement de page/chaîne | **Peu probable** — `loadId` sérialise ; debounce 200 ms |
| **Visibility / autoplay** | Pause en onglet arrière-plan | **Comportement navigateur normal** — log `visibilité document` |

#### Symptômes → actions

| Symptôme | Cause probable | Action |
|---|---|---|
| `AbortError: play() interrupted by new load` | Switch chaîne trop rapide (corrigé) | Mettre à jour ; le lecteur sérialise désormais load/play |
| Spinner infini | Flux offline ou URL morte | Vérifier statut chaîne (Admin) ; rescan playlist |
| « Accès refusé (403) » | Geo-block ou token expiré | Tester l'URL dans VLC ; rescan playlist pour JWT jmp2.uk frais |
| Safari OK, Chrome non | HLS natif vs hls.js | Normal ; hls.js gère Chrome/Firefox |
| Erreur CORS sur .m3u8 | Pas de headers CORS upstream | Corrigé via `/api/stream/proxy` (session requise) |
| 414 URI Too Long | URL jmp2.uk avec JWT très long en query string | Corrigé via tokens ; si 414 persiste sur URL courte → base manifest post-redirect (fix pluto.tv) |
| Coupure après ~5 s (Pluto / Samsung TV Plus) | hls.js auto-charge pistes subtitle DEFAULT **ou** re-lock `currentLevel` sur `LEVEL_UPDATED` | Corrigé : sous-titres lazy ; **ne plus** réassigner `currentLevel` à chaque refresh playlist (~5 s) |
| **Coupure ~30–50 s (Pluto / Samsung TV Plus)** | Stall buffer ~30 s + `recoverMediaError` reset `currentTime` à 0 ; penalty box ABR sur mismatch | **Corrigé** — `ignorePlaylistParsingErrors` + niveau verrouillé ; récupération live `startLoad(-1)` sans `recoverMediaError` ; buffers élargis (90/120 s) |
| **Coupure silencieuse après 1–3 min (live)** | Stall buffer live ou JWT master manifest expiré | Console : `[WARN] Lecteur: buffer stalled` ou `auth upstream` ; récupération douce auto ; rescan si persiste |
| « Flux interrompu — réessayez » | Stall non récupéré après 3 tentatives | **Supprimé** — plus d'escalade watchdog ; changer de chaîne si persiste |
| « Aucune URL de flux » | Chaîne sans stream en BDD | Rescan playlist |
| YouTube Live | Non intégrable en `<video>` | Lien externe proposé dans l'overlay |

#### Logs diagnostic (console)

Tous les logs passent par `src/lib/logger.ts` — format : `[ISO8601] [LEVEL] message {json}`.

**Erreurs HLS détaillées** (`player-hooks.ts`, handler `Hls.Events.ERROR`) — champs communs : `url`, `details`, `fatal`, `type`, `contextType`, `httpCode`, `responseText`, `responsePreview` (500 premiers chars), `level`, `parent`, `buffer`.

| `details` | Niveau | Message logger |
|---|---|---|
| `levelParsingError` | WARN | `Mismatch Pluto ignoré (normal)` si media sequence mismatch — absorbé par `ignorePlaylistParsingErrors` ; sinon log + `hls.loadLevel` (600 ms) |
| `manifestLoadError` | ERROR/WARN | `Lecteur: erreur hls` ; récupération complète auto (destroy + réinit HLS, ×2 max) via `Lecteur: manifestLoadError — récupération complète` |
| `manifestParsingError` | ERROR/WARN | `Lecteur: erreur hls` — preview manifest |
| `levelLoadError` | ERROR/WARN | `Lecteur: erreur hls` |
| `fragLoadError` | ERROR/WARN | `Lecteur: erreur hls` |
| `bufferStalledError` | WARN | `Lecteur: erreur hls (buffer stalled)` |
| `subtitleTrackLoadError` | WARN | `Lecteur: erreur hls (sous-titres)` — isolée, vidéo continue |
| Autres non-fatales | INFO | `Lecteur: erreur hls non-fatale` |
| Autres fatales | ERROR | `Lecteur: erreur hls` |

**Proxy loader** (`stream-proxy-client.ts`) :

| Log | Signification |
|---|---|
| `[INFO] Proxy loader: succès` | Requête proxy OK — `url` (token), `contextType`, `httpCode`, `durationMs`, `bytes` |
| `[WARN] Proxy loader: erreur` | Échec HTTP/réseau — `httpCode`, `error`, `durationMs` |
| `[WARN] Proxy loader: retry auth token` | 401/403/404 manifest ou playlist → invalidate cache + `buildStreamProxyUrlFresh` + nouvelle instance loader |
| `[ERROR] Proxy loader: échec refresh token` | Impossible de ré-enregistrer l'URL upstream |
| `[ERROR] Proxy loader: échec résolution URL proxy` | `buildStreamProxyUrl` a échoué avant fetch |

**Lecteur / récupération** :

| Log | Signification |
|---|---|
| `[INFO] Lecteur: événement vidéo` + `waiting`/`stalled` | Buffer vide — **log seulement**, hls.js gère ; détection reset si `currentTime` chute |
| `[WARN] Lecteur: buffer stalled — récupération douce` | `bufferStalledError` — nudge buffer puis `startLoad(-1)` / reload niveau |
| `[WARN] Lecteur: buffer stalled ignoré (buffer disponible)` | Stall signalé mais ≥ 1 s de buffer devant — ignoré (pas de reload) |
| `[WARN] Lecteur: buffer stalled ignoré (démarrage)` | Stall < 10 s de lecture — ignoré (faux positif startup) |
| `[WARN] Lecteur: buffer stalled ignoré (startup guard)` | Stall avec `currentLevel === -1` ou manifest non parsé — ignoré |
| `[WARN] Lecteur: reset détecté — récupération live edge` | `currentTime` retombé de > 5 s à < 2 s — `startLoad(-1)` immédiat (plus de cooldown passif) |
| `[WARN] Lecteur: buffer stalled — live edge (startLoad -1)` | Stall persistant 600 ms — reprise chargement au live edge |
| `[WARN] Lecteur: buffer stalled — reload niveau` | Stall persistant 1,8 s — reload playlist niveau verrouillé |
| `[WARN] Proxy stream: auth upstream expirée` | JWT jmp2.uk ou session Pluto expirée côté serveur |
| `[WARN] Proxy stream: token 404` | Token proxy expiré ou invalide |
| `[WARN] Mismatch Pluto ignoré (normal)` | Media sequence mismatch — rare avec `ignorePlaylistParsingErrors` ; handler legacy si erreur échappe |
| `[WARN] Lecteur: levelParsingError (mismatch Pluto)` | Autre erreur parsing niveau — récupération auto `hls.loadLevel = currentLevel` (600 ms) |
| `[WARN] Lecteur: retry flux` | Retry auto frag (×2 max) |
| `[WARN] Lecteur: manifestLoadError — récupération complète` | Destroy HLS + reload source fraîche (×2 max, 800 ms) |

### Tester le lecteur

1. Accueil → cliquer rapidement sur 3–4 chaînes différentes → pas d'erreur console, dernière chaîne joue.
2. Chaînes → Enter / clic Play sur flux HLS et MP4.
3. Chaîne `OFFLINE` → message « Chaîne hors ligne », pas de spinner bloqué.
4. Console : logs `[WARN] Lecteur: retry flux` puis `[ERROR]` si flux vraiment mort.

## Contenu de démarrage

Pour remplir l'application sans chaînes, deux options :

### 1. Interface (1 clic)

Accueil, Chaînes ou **Paramètres → Playlists** affichent un CTA **« Importer des chaînes gratuites »** si aucune playlist est importée. Le bouton appelle `POST /api/playlists/import-demo` et lance le scan via la queue existante.

### 2. Ligne de commande

```bash
npm run seed:playlists
npm run seed:playlists -- --email=user@example.com   # utilisateur existant
npm run seed:playlists -- --sync                     # attend la fin des scans (test)
```

Sans `--email`, crée le compte démo `demo@streamtv.local` (mot de passe `demo123456`) si absent.

### Playlists importées automatiquement

| Nom | URL M3U | EPG |
|---|---|---|
| iptv-org — France | `https://iptv-org.github.io/iptv/countries/fr.m3u` | `https://iptv-epg.org/files/epg-fr.xml` |
| Free-TV — Curatée | `https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8` | — |
| iptv-org — Actualités | `https://iptv-org.github.io/iptv/categories/news.m3u` | — |
| iptv-org — Sport | `https://iptv-org.github.io/iptv/categories/sports.m3u` | — |

Définition centralisée : `src/lib/demo-playlists.ts`.

### Sources documentées

| Source | Lien |
|---|---|
| iptv-org | https://github.com/iptv-org/iptv |
| Free-TV/IPTV | https://github.com/Free-TV/IPTV |
| iptv-epg (XMLTV) | https://iptv-epg.org |

### Avertissement légal

StreamTV **ne fournit aucun flux**. Les playlists ci-dessus sont des index publics open source ; la disponibilité et la légalité des flux varient selon votre pays. **Ne pas utiliser de listes piratées.** Privilégier flux officiels ou abonnement autorisé.

## Playlists M3U (sources légales)

Import manuel via **Paramètres → Playlists** ou URLs ci-dessus.

| Source | URL |
|---|---|
| iptv-org global | `https://iptv-org.github.io/iptv/index.m3u` |
| iptv-org France | `https://iptv-org.github.io/iptv/countries/fr.m3u` |
| Free-TV | `https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8` |

EPG France : `https://iptv-epg.org/files/epg-fr.xml`

### Sous-titres

- **Activer** : bouton CC (icône sous-titres) dans la barre de contrôles du lecteur → menu « Désactivés » / FR / EN (selon pistes du flux).
- **Par défaut** : off — aucune requête subtitle tant que l'utilisateur n'active pas CC (lazy load).
- **Proxy** : playlists subtitle m3u8 et segments WebVTT passent par `/api/stream/proxy/TOKEN` (même base URL post-redirect que la vidéo).
- **Robustesse** : erreurs subtitle (`subtitleTrackLoadError`, context `subtitleTrack`) ignorées — pas de `failStream`, pas de `startLoad()`, pas de retry ; retry limité aux erreurs fatal manifest/frag vidéo ; si CC activé et piste en échec, la vidéo continue.

## Dernière mise à jour

2026-08-05 — **Favicon play** : `src/app/icon.tsx` remplacé (lettre « S ») par une icône triangle play lecteur vidéo sur fond primary `#7c6cf0`.

2026-08-05 — **Redéploiement prod** : VPS sur commit `5ca3807` (branche `cursor/vps-deployment-docs`) — pages légales + sécurité en ligne sur https://vps-e09ed6db.vps.ovh.net (port 3001). Canopée HTTPS OK.

2026-08-05 — **Sécurité & légal** : pages Mentions légales / CGU / Confidentialité / Cookies ; bannière cookies RGPD ; footer + acceptation CGU à l'inscription ; headers HTTP (CSP, HSTS, X-Frame-Options, etc.) ; rate-limit login/register ; JWT_SECRET obligatoire en prod ; mot de passe min 8 ; CRON_SECRET forcé en prod ; `.env.example` enrichi.

2026-07-02 — **Fix multi-sites VPS : Canopée restauré + StreamTV isolé** : StreamTV avait pris le port 3000 (port de Canopée) → canopée.be affichait StreamTV. **Fix** : Canopée relancé sur port **3000** (`/var/www/canopee`, PM2 `canopee`), StreamTV déplacé sur port **3001** (`/root/streamtv`, PM2 `streamtv`). Nginx route par `server_name` : `xn--canope-fva.be` → 3000, `vps-e09ed6db.vps.ovh.net` → 3001. Les deux sites coexistent sur le même VPS. `ecosystem.config.js` mis à jour (PORT 3001).

2026-06-28 — **HTTPS activé + fix connexion/inscription impossible** : symptôme = impossible de se connecter ou créer un compte en prod. Cause racine = le cookie de session est posé avec `secure: process.env.NODE_ENV === "production"` (`src/lib/auth.ts`) → en prod le cookie est `Secure`, donc **rejeté par le navigateur sur HTTP**. L'API `/api/auth/register` renvoyait pourtant 200 (compte créé), mais la session n'était jamais stockée côté client. **Fix** : activation HTTPS via `certbot --nginx -d vps-e09ed6db.vps.ovh.net` (Let's Encrypt, redirect HTTP→HTTPS, renouvellement auto). Connexion/inscription OK sur https://vps-e09ed6db.vps.ovh.net. NB : pour un domaine custom, refaire `certbot --nginx -d <domaine>`.

2026-06-28 — **Déploiement production VPS OVH effectué** : app en ligne sur http://51.178.44.114 (Nginx → PM2 → Next.js 15, Node 22, SQLite `prod.db`). Accès SSH par clé ED25519 (root). Stack installée : git, build-essential, ufw (22/80/443), nginx, pm2. Secrets `.env` générés sur le serveur (`JWT_SECRET`, `CRON_SECRET`). `ecosystem.config.js` créé manuellement sur le VPS (fichier pas encore commité dans le repo). HTTPS disponible via `certbot --nginx -d vps-e09ed6db.vps.ovh.net` ou un domaine custom.

2026-06-28 — **Guide de déploiement VPS OVH** : ajout de `DEPLOIEMENT.md` (guide complet en français : SSH/sécurité, Node 22, clone GitHub public/privé, `.env` + secrets, `prisma db push`, build, PM2/systemd, Nginx reverse proxy, HTTPS Let's Encrypt, redéploiement, dépannage), `scripts/deploy.sh` (redéploiement automatisé) et `ecosystem.config.js` (config PM2). Section « Déploiement (VPS OVH) » ajoutée ci-dessus. Aucune commande de déploiement exécutée (documentation seulement).

2026-06-28 — **Lecteur persistant inline (portail) au lieu du popup docké** : l'utilisateur ne voulait pas du mini-lecteur en popup → le lecteur réapparaît à son **emplacement d'origine in-page** tout en gardant la lecture continue entre sections. **Technique** : l'instance unique `<VideoPlayer>`/hls.js reste montée dans `PersistentPlayer` (shell) mais est rendue via `createPortal(playerNode, target)` ; `target = slot ?? dockEl`. Chaque page expose un `<PlayerSlot/>` (`src/components/player-slot.tsx`) qui enregistre son `<div>` (`registerSlot`/`unregisterSlot` dans `PlayerProvider`) comme cible de portail. Comme la position du portail dans l'arbre React est stable (seul le conteneur DOM change), React **re-parente** le `<video>` au lieu de le re-monter → **aucune coupure**. Slots posés : accueil (avec empty state), chaînes et favoris (en tête, repliés tant que rien ne joue). Routes sans slot (Guide, Paramètres) → **fallback mini-lecteur docké** (bas-droite, `z-[45]`). **Mode théâtre supprimé**, `expanded` retiré du provider. Empty state « Sélectionnez une chaîne » conservé sur l'accueil. `next.config.ts` : `distDir` overridable via `NEXT_DIST_DIR` (build isolé sans toucher au `.next` du dev). Travail HLS/Pluto de `player-hooks.ts` **inchangé**. `npm run build` OK (build isolé `.next-build`). **Hard refresh `Cmd+Shift+R`** requis ; tester navigation Accueil ↔ Chaînes ↔ Favoris ↔ Guide pendant la lecture.

2026-06-28 — **Lecteur global persistant (lecture continue entre sections)** : cause racine du reset = chaque page montait son propre `<VideoPlayer>` + son propre `<AppShell>`, et `channels`/`favorites` gardaient la chaîne en `useState` local → la navigation démontait le sous-arbre, détruisait hls.js + `<video>` et affichait l'empty state. **Fix** : `AppShell` hissé dans `src/app/app/layout.tsx` (ne se démonte jamais entre routes) ; nouveau `src/components/persistent-player.tsx` montant **une instance unique** de `<VideoPlayer>` lisant `PlayerProvider` ; `PlayerProvider` étendu (`expanded` + `setExpanded`) ; pages migrées vers `useAppPlayer().playChannel()` (suppression des `<VideoPlayer>` et `<AppShell>` locaux) ; sauvegarde progression watch-history centralisée dans le lecteur persistant. **UX** : mini-lecteur docké (bas-droite, au-dessus de la nav mobile) + mode théâtre (agrandir), bouton fermer ; empty state « Sélectionnez une chaîne » conservé sur l'accueil uniquement quand `current === null`. Travail HLS/Pluto de `player-hooks.ts` **inchangé**. `npm run build` OK. Tester : lancer une chaîne puis naviguer Accueil ↔ Chaînes ↔ Favoris ↔ Guide — la vidéo continue.

2026-06-28 — **Fix coupure Pluto toutes les ~5 s** : cause racine = handler `Hls.Events.LEVEL_UPDATED` appelait `lockPlutoQualityLevel()` → `hls.currentLevel = 0` à **chaque** refresh de playlist niveau (cycle = `#EXT-X-TARGETDURATION:5` s). hls.js re-déclenchait le chargement du niveau, vidait le buffer et repositionnait la lecture → coupure visible toutes les 5 s. **Fix** : suppression du handler `LEVEL_UPDATED` et de `lockPlutoQualityLevel` ; conservation de `startLevel: 0` + `ignorePlaylistParsingErrors: true` + `testBandwidth: false` (suffisant pour éviter penalty box ABR) ; retour aux défauts hls.js pour live sync (suppression `liveSyncDuration`/`liveMaxLatencyDuration`/`maxLiveSyncPlaybackRate`) ; buffers 60/90 ; stall recovery renforcée (garde buffer ≥ 1 s + intervalle min 8 s avant `startLoad(-1)`). **Hard refresh** `Cmd+Shift+R` requis après déploiement.

2026-06-28 — **Fix lecture saccadée + doc config HLS** : cause racine des saccades = `maxLiveSyncPlaybackRate: 1.5` → hls.js accélérait la lecture (1.5x) pour rattraper le live edge dès que la latence dépassait `liveSyncDuration` → accélérations visibles/audibles. **Fix** : `maxLiveSyncPlaybackRate: 1` (catch-up désactivé) + `liveMaxLatencyDuration` 45→60 (plus de marge avant seek forcé). Config live (`liveSyncDuration`/`liveMaxLatencyDuration` en **secondes uniquement** — jamais mélangée avec `*Count`) déjà correcte ; l'erreur console « illegal config » de l'utilisateur était obsolète (cache navigateur → `Cmd+Shift+R`). Nouvelle section **« Configuration HLS (hls.js) »** : tableau des options + pourquoi, mécanismes de récupération, dépannage saccades/illegal config.

2026-06-28 — **Fix urgent lecture vidéo** : config HLS illégale — hls.js interdit de mélanger `liveSyncDuration`/`liveMaxLatencyDuration` (secondes) avec `liveSyncDurationCount`/`liveMaxLatencyDurationCount` (segments). Suppression des `*Count` ; conservé `liveSyncDuration: 15`, `liveMaxLatencyDuration: 45`.

2026-06-28 — **Fix root cause coupure Pluto ~30 s (reset à 0)** : audit end-to-end hls.js + proxy. **Cause racine** : (1) `recoverMediaError()` fait detach/reattach MediaSource — sur live, la timeline glissante invalide la position sauvegardée → `currentTime` retombe à 0 et la garde reset bloquait toute récupération ; (2) `levelParsingError` media sequence mismatch déclenchait `sendAlternateToPenaltyBox` → `switchLevel` entre 3 niveaux Pluto → buffer vidé et chaos ABR malgré handler non-fatal. **Fix** : `ignorePlaylistParsingErrors: true` (hls.js merge la playlist sans ERROR/penalty box) ; niveau verrouillé `startLevel: 0` + `currentLevel = 0` + `testBandwidth: false` ; récupération stall live-safe (nudge buffer → `startLoad(-1)` 600 ms → reload niveau 1,8 s, **suppression `recoverMediaError`**) ; reset actif via `startLoad(-1)` ; config live élargie (`liveSyncDuration: 15`, `liveMaxLatencyDuration: 45`, buffers 90/120, `maxLiveSyncPlaybackRate: 1.5`). Proxy inchangé (headers no-cache niveau OK).

2026-06-28 — Fix récupération stall agressive Pluto (~30 s reset à 0) : suppression `beginStallRecovery` / watchdog (`startLoad` → `recoverMediaError` → `loadSource`) ; `waiting`/`stalled`/`ended` vidéo = log seulement (plus de récupération) ; `bufferStalledError` → récupération douce (reload niveau 800 ms, `recoverMediaError` 4,2 s si bloqué, sans reload source) ; gardes startup (< 10 s, `currentLevel === -1`, manifest non parsé), reset (`lastKnownGoodTime > 5` → `currentTime < 2`, cooldown 4 s), debounce une récupération active ; config HLS plus tolérante (`liveSyncDurationCount: 4`, `liveMaxLatencyDurationCount: 7`, buffers 60/90, `maxFragLookUpTolerance: 3`) ; `stallThreshold` non supporté par hls.js (on garde `maxBufferHole: 0.5`).

2026-06-28 — Tuning buffer stall Pluto (~28 s) : config HLS rapprochée du live edge (`liveSyncDurationCount: 5`, `liveMaxLatencyDurationCount: 8`, buffers 45/70, `maxFragLookUpTolerance: 2.5`, retries manifest/level ×25, frag ×15 délai 250 ms) ; récupération stall unifiée `beginStallRecovery` — reload niveau debounced 600 ms, `recoverMediaError` 4,5 s si `readyState < 3`, escalade watchdog 2,8 s (×3 : `startLoad` → fallback `recoverMediaError` → reload source) ; événements `waiting`/`stalled`/`ended` partagent le même chemin ; proxy playlists niveau : `Surrogate-Control: no-store` (était `no-cache`).

2026-06-28 — Fix critique Pluto HLS : **Loader can only be used once** — `createProxyLoader` passe en composition (nouvelle instance XHR/fetch par requête/retry, plus d'héritage `extends BaseLoader` + `super.load()` réutilisé) ; retry token proxy affiné (401/403 toute requête, 404 manifest/level/audio/subtitle seulement, une retentative via `buildStreamProxyUrlFresh`) ; query `contextType=manifest` sur master ; invalidation serveur token manifest sur 404 upstream (`invalidateStreamProxyToken`) ; **manifestLoadError** fatal → récupération complète destroy HLS + réinit source fraîche (×2 max, délai 800 ms, reset compteur sur `MANIFEST_PARSED`).

2026-06-28 — Fix buffer stall Pluto (~30 s pause) : config HLS plus agressive (`liveSyncDurationCount: 6`, `liveMaxLatencyDurationCount: 10`, buffers 60/90, `maxFragLookUpTolerance: 3.0`, retries manifest/level ×20, frag ×12 délai 300 ms) ; récupération stall accélérée — immédiat `hls.loadLevel = hls.currentLevel` sur `bufferStalledError`, `recoverMediaError` après 4 s si bloqué, escalade 3 s (×3 : forceLevelReload+startLoad → recoverMediaError → reload source) ; proxy segments headers no-cache strict + timeout upstream 30 s.

2026-06-28 — Stabilisation Pluto HLS (v3) : client envoie `contextType=level` + cache-bust sur requêtes niveau ; serveur applique headers no-cache **exacts** sur playlists niveau (`max-age=0`, `Surrogate-Control`, détection query/contenu/URL) ; config HLS plus tolérante (`liveSyncDurationCount: 10`, `liveMaxLatencyDurationCount: 15`, `maxFragLookUpTolerance: 2.5`, buffers 50/80, retries manifest/level ×15) ; handler `levelParsingError` : **media sequence mismatch ignoré** (`data.fatal = false`, log `Mismatch Pluto ignoré (normal)`, pas de `loadLevel`) — hls.js retry seul ; autres parsing errors conservent récupération `hls.loadLevel` (600 ms).

2026-06-28 — Fix **définitif** `levelParsingError` Pluto/Samsung TV Plus : serveur headers no-cache max sur playlists niveau (`max-age=0`, `Surrogate-Control: no-cache`, détection `#EXTINF` sans `#EXT-X-STREAM-INF`) ; config HLS renforcée (`liveSyncDurationCount: 8`, `liveMaxLatencyDurationCount: 12`, `maxFragLookUpTolerance: 2.0`, buffers 45/80, retries manifest/level ×12, frag ×8) ; handler `levelParsingError` **non-destructif** — `data.fatal = false`, log WARN, récupération silencieuse via setter `hls.loadLevel = hls.currentLevel` (600 ms) ; suppression retry debounced ×4 / fallback `startLoad()` / invalidation token qui provoquaient spirales d'erreurs.

2026-06-28 — Renforcement fix `levelParsingError` Pluto/Samsung TV Plus : serveur `no-cache, no-store, must-revalidate` + `Pragma`/`Expires` sur toutes playlists niveau/live (détection contenu + URL `level`) ; config HLS plus tolérante (`liveSyncDurationCount: 6`, `liveMaxLatencyDurationCount: 10`, `maxFragLookUpTolerance: 1.5`, buffers 40/80, retries manifest/level ×10 délai 300 ms, `abrEwmaDefaultEstimate: 800000`) ; handler `levelParsingError` non-fatal avec retry soft debounced (`hls.loadLevel = currentLevel`, pas `startLoad(-1)`) — évite penalty box et spirale retry ; fallback `startLoad()` après ×4 soft retries.

2026-06-28 — Fix `levelParsingError` media sequence mismatch (Pluto/Samsung TV Plus) : loader client cache-bust `?_=timestamp` sur requêtes `contextType=level` ; serveur `Cache-Control: no-cache, no-store, must-revalidate` sur playlists niveau ; config HLS live renforcée (`liveSyncDurationCount: 5`, `liveMaxLatencyDurationCount: 8`, `maxFragLookUpTolerance: 0.5`, `startFragPrefetch: false`, retries manifest/level ×8, frag ×6) ; retry `levelParsingError` ×4 (800 ms, `startLoad(-1)`, compteur séparé, reset sur `LEVEL_LOADED`).

2026-06-28 — Config live HLS renforcée (Pluto/Samsung TV Plus) : `liveMaxLatencyDurationCount` 10→5, ajout `maxBufferLength: 30`, `maxMaxBufferLength: 60`, `backBufferLength: 30`, `lowLatencyMode: false` ; loader custom `createProxyLoader` inchangé ; sous-titres lazy, stall recovery et retry `levelParsingError` conservés.

2026-06-28 — Fix proxy HLS levels Pluto/jmp2.uk : `rewriteM3u8Manifest` proxifie variantes `.m3u8`, clés AES et segments ; URI `'` / unquoted ; skip double-proxy ; base `upstream.url` post-redirect ; détection m3u8 via preview corps ; retry `levelParsingError` (×2, invalidate token + `startLoad`) ; test script master → variant → segment + refresh.

2026-06-28 — Logging HLS enrichi : handler `Hls.Events.ERROR` logue `url`, `details`, `fatal`, `type`, `contextType`, `httpCode`, `responsePreview` (500 chars) pour `levelParsingError`, `manifestLoadError`, `manifestParsingError`, `levelLoadError`, `fragLoadError`, `bufferStalledError`, `subtitleTrackLoadError` ; proxy loader logue succès/erreur HTTP, durée, bytes, retry auth token.

2026-06-28 — Dépannage arrêt silencieux live : sous-titres = cause partielle (corrigée avant) ; causes probables restantes = buffer stall non-fatal + JWT jmp2.uk expiré sur refresh master manifest. Fix : logs diagnostic (`waiting`/`stalled`/`ended`, `BUFFER_STALLED`, `LEVEL_UPDATED`), récupération stall 3 niveaux, config live HLS améliorée, retry proxy 401/403/404, schema Zod `stream.schema.ts`, validation URL avant lecture.

2026-06-28 — Fix sous-titres lazy Pluto/Samsung TV Plus : hls.js auto-chargeait pistes DEFAULT → `SUBTITLE_LOAD_ERROR` → penalty box niveaux vidéo. Fix : `enableWebVTT: false` + `subtitlePreference` sentinel + loader no-op playlists subtitle + suppression `startLoad()` sur erreur subtitle + retry limité manifest/frag fatal ; CC activé uniquement au clic utilisateur.

2026-06-28 — Support sous-titres HLS : réactivation pistes `EXT-X-MEDIA TYPE=SUBTITLES` dans `rewriteM3u8Manifest` (proxy token) ; bouton CC + menu Off/FR/EN dans `controls.tsx` ; test script vérifie proxy subtitle + variant vidéo.

2026-06-28 — Fix proxy HLS 414 sur URL courte : réécriture m3u8 utilisait l'URL jmp2.uk pré-redirect comme base → URLs relatives résolues vers `jmp2.uk/subtitle/...` (414 upstream). Fix : `upstream.url` post-redirect ; chemins token relatifs ; client ne considère plus `?url=` comme déjà proxifié ; upstream 414 → 502 ; log token expiré ; `app/icon.tsx`.

2026-06-28 — `suppressHydrationWarning` sur `<html>`/`<body>` (root layout) pour ignorer les attributs injectés par extensions navigateur (`cz-shortcut-listen`, ColorZilla, etc.) — pas de mismatch code sur `/app/channels`.

2026-06-28 — Proxy HLS par tokens `/api/stream/proxy/:token` (fix 414 URLs longues jmp2.uk) ; register + cache TTL 2h ; fallback `?url=` pour URLs courtes ; autocomplete auth-form ; `data-scroll-behavior` sur `<html>`.
