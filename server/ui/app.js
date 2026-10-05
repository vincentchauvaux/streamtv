const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const VIEWS = ["home", "channels", "favorites", "guide", "settings", "admin"];

const state = {
  view: "home",
  channels: [],
  hls: null,
  current: null,
  sourceUrl: null,
  stallTimer: null,
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

function showView(name) {
  state.view = name;
  $$(".nav nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  VIEWS.forEach((v) => {
    const el = $(`#view-${v}`);
    if (el) el.hidden = v !== name;
  });
  if (name === "channels") loadChannels();
  if (name === "favorites") loadFavorites();
  if (name === "settings") loadPlaylists();
  if (name === "home") loadHome();
  if (name === "guide") loadGuide();
  if (name === "admin") loadAdmin();
}

function card(ch) {
  const el = document.createElement("article");
  el.className = "ch";
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", ch.name);
  el.innerHTML = `
    ${ch.logo ? `<img src="${ch.logo}" alt="" loading="lazy">` : ""}
    <span class="name">${escapeHtml(ch.name)}</span>
    <span class="meta">${escapeHtml(ch.group || "")}</span>
    <button class="heart ${ch.isFavorite ? "on" : ""}" type="button" title="Favori">${ch.isFavorite ? "♥" : "♡"}</button>
  `;
  el.onclick = (e) => {
    if (e.target.closest(".heart")) {
      toggleFav(ch);
      return;
    }
    play(ch);
  };
  el.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      play(ch);
    }
  };
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderGrid(id, list) {
  const root = $(id);
  root.replaceChildren();
  if (!list.length) {
    root.innerHTML = `<p class="muted">Rien ici pour le moment.</p>`;
    return;
  }
  list.forEach((ch) => root.append(card(ch)));
}

function formatWhen(ms) {
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadHome() {
  const [{ stats }, hist, reco] = await Promise.all([
    api("/api/stats"),
    api("/api/watch-history").catch(() => ({ history: [] })),
    api("/api/recommendations").catch(() => ({ channels: [] })),
  ]);
  $("#stats").innerHTML = [
    ["Chaînes", stats.channelCount],
    ["Playlists", stats.playlistCount],
    ["Favoris", stats.favoriteCount],
    ["Programme", stats.programsToday],
  ].map(([k, v]) => `<div class="stat"><b>${v}</b><span class="muted">${k}</span></div>`).join("");
  renderGrid("#reco", reco.channels || []);
  renderGrid("#history", hist.history || []);
}

async function loadChannels() {
  const q = $("#q").value.trim();
  const group = $("#group").value;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (group) params.set("group", group);
  const data = await api(`/api/channels?${params}`);
  state.channels = data.channels || [];
  renderGrid("#channels", state.channels);
}

async function loadGroups() {
  const data = await api("/api/channels/groups");
  const sel = $("#group");
  const current = sel.value;
  sel.innerHTML = `<option value="">Tous les groupes</option>` +
    (data.groups || []).map((g) => `<option>${escapeHtml(g)}</option>`).join("");
  sel.value = current;
}

async function loadFavorites() {
  const data = await api("/api/favorites");
  renderGrid("#favorites", data.favorites || []);
}

async function loadGuide() {
  const status = $("#epg-status");
  status.textContent = "Chargement…";
  try {
    const data = await api("/api/epg");
    const root = $("#guide");
    root.replaceChildren();
    const programs = data.programs || [];
    if (!programs.length) {
      root.innerHTML = `<p class="muted">Aucun programme. Importez une playlist avec URL EPG, puis rafraîchissez.</p>`;
      status.textContent = "";
      return;
    }
    programs.forEach((p) => {
      const row = document.createElement("div");
      row.className = "guide-row";
      row.innerHTML = `
        <div class="guide-when">${escapeHtml(formatWhen(p.start))} – ${escapeHtml(formatWhen(p.end))}</div>
        <div>
          <strong>${escapeHtml(p.title)}</strong>
          <div class="muted">${escapeHtml(p.channelName)}${p.category ? " · " + escapeHtml(p.category) : ""}</div>
          ${p.description ? `<p class="guide-desc">${escapeHtml(p.description)}</p>` : ""}
        </div>`;
      root.append(row);
    });
    status.textContent = `${programs.length} programmes`;
  } catch (e) {
    status.textContent = e.message;
  }
}

async function loadAdmin() {
  const root = $("#admin");
  root.innerHTML = `<p class="muted">Chargement…</p>`;
  try {
    const { health } = await api("/api/admin");
    const errs = (health.recentErrors || [])
      .map((e) => `<li><strong>${escapeHtml(e.playlistName)}</strong> — ${escapeHtml(e.errors || "erreur")}</li>`)
      .join("") || "<li class=\"muted\">Aucune erreur récente</li>";
    const pls = (health.playlists || [])
      .map((p) => `<li>${escapeHtml(p.name)} · ${p.channelCount} chaînes · ${escapeHtml(p.scanStatus)}</li>`)
      .join("") || "<li class=\"muted\">Aucune playlist</li>";
    root.innerHTML = `
      <h2>Santé</h2>
      <div class="stats">
        <div class="stat"><b>${health.channelCount}</b><span class="muted">Chaînes</span></div>
        <div class="stat"><b>${health.offlineCount}</b><span class="muted">Hors ligne</span></div>
        <div class="stat"><b>${health.lastImportDurationMs ?? "—"}</b><span class="muted">Dernier scan (ms)</span></div>
        <div class="stat"><b>${health.lastScanAt ? formatWhen(health.lastScanAt) : "—"}</b><span class="muted">Dernier scan</span></div>
      </div>
      <h3>Playlists</h3>
      <ul class="plain">${pls}</ul>
      <h3>Erreurs récentes</h3>
      <ul class="plain">${errs}</ul>`;
  } catch (e) {
    root.innerHTML = `<p class="err">${escapeHtml(e.message)}</p>`;
  }
}

async function loadPlaylists() {
  const data = await api("/api/playlists");
  const root = $("#playlists");
  root.replaceChildren();
  (data.playlists || []).forEach((p) => {
    const row = document.createElement("div");
    row.className = "playlist-row";
    row.innerHTML = `<div><strong>${escapeHtml(p.name)}</strong><div class="muted">${p.channelCount} chaînes · ${escapeHtml(p.scanStatus)}${p.epgUrl ? " · EPG" : ""}</div></div>`;
    const actions = document.createElement("div");
    actions.className = "playlist-actions";
    if (p.url) {
      const scan = document.createElement("button");
      scan.className = "btn ghost";
      scan.textContent = "Rescanner";
      scan.onclick = async () => {
        scan.disabled = true;
        scan.textContent = "…";
        try {
          await api(`/api/playlists/scan?id=${encodeURIComponent(p.id)}`, { method: "POST", body: "{}" });
          loadPlaylists();
          loadHome();
        } catch (ex) {
          alert(ex.message);
        } finally {
          scan.disabled = false;
          scan.textContent = "Rescanner";
        }
      };
      actions.append(scan);
    }
    const del = document.createElement("button");
    del.className = "btn ghost";
    del.textContent = "Supprimer";
    del.onclick = async () => {
      if (!confirm(`Supprimer « ${p.name} » ?`)) return;
      await api(`/api/playlists?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
      loadPlaylists();
      loadHome();
    };
    actions.append(del);
    row.append(actions);
    root.append(row);
  });
}

async function toggleFav(ch) {
  if (ch.isFavorite) {
    await api(`/api/favorites?channelId=${encodeURIComponent(ch.id)}`, { method: "DELETE" });
    ch.isFavorite = false;
  } else {
    await api("/api/favorites", { method: "POST", body: JSON.stringify({ channelId: ch.id }) });
    ch.isFavorite = true;
  }
  if (state.view === "channels") loadChannels();
  else if (state.view === "favorites") loadFavorites();
  else loadHome();
}

function isProxyPath(url) {
  try {
    const u = new URL(url, location.origin);
    return /^\/api\/stream\/proxy\/[A-Za-z0-9_-]+$/.test(u.pathname);
  } catch {
    return /^\/api\/stream\/proxy\/[A-Za-z0-9_-]+$/.test(url);
  }
}

async function registerProxy(url) {
  const { path } = await api("/api/stream/proxy/register", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  return path;
}

function createProxyLoader(BaseLoader) {
  return class ProxyLoader {
    constructor(config) {
      this.hlsConfig = config;
      this.activeLoader = null;
      this.stats = null;
      this.context = null;
      this._retried = false;
    }
    destroy() {
      this.activeLoader?.destroy();
      this.activeLoader = null;
    }
    abort() {
      this.activeLoader?.abort();
    }
    load(context, config, callbacks) {
      this.activeLoader?.destroy();
      const inner = new BaseLoader(this.hlsConfig);
      this.activeLoader = inner;
      this.context = context;
      this._retried = false;

      let loadUrl = context.url;
      const type = context.type;
      if (isProxyPath(loadUrl)) {
        const u = new URL(loadUrl, location.origin);
        if (type === "manifest" || type === "level") {
          u.searchParams.set("contextType", type === "level" ? "level" : "manifest");
          if (type === "level") u.searchParams.set("_", String(Date.now()));
          loadUrl = u.pathname + u.search;
        }
      }
      context.url = loadUrl;

      const self = this;
      inner.load(context, config, {
        onSuccess(response, stats, ctx, networkDetails) {
          self.stats = stats;
          self.context = ctx;
          callbacks.onSuccess(response, stats, ctx, networkDetails);
        },
        onError(response, ctx, networkDetails, stats) {
          self.stats = stats;
          const status = response?.code;
          const retryAuth =
            !self._retried &&
            state.sourceUrl &&
            isProxyPath(ctx.url) &&
            (status === 401 || status === 403 || (status === 404 && (ctx.type === "manifest" || ctx.type === "level")));
          if (retryAuth) {
            self._retried = true;
            registerProxy(state.sourceUrl)
              .then((fresh) => {
                inner.destroy();
                self.activeLoader = null;
                const next = { ...ctx, url: fresh };
                self.load(next, config, callbacks);
              })
              .catch(() => callbacks.onError(response, ctx, networkDetails, stats));
            return;
          }
          callbacks.onError(response, ctx, networkDetails, stats);
        },
        onTimeout(stats, ctx, networkDetails) {
          self.stats = stats;
          callbacks.onTimeout(stats, ctx, networkDetails);
        },
        onProgress: callbacks.onProgress
          ? (stats, ctx, data, networkDetails) => callbacks.onProgress(stats, ctx, data, networkDetails)
          : undefined,
      });
    }
  };
}

function recoverLiveStall(hls, video) {
  if (!hls || !video) return;
  clearTimeout(state.stallTimer);
  if (video.readyState >= 3 && !video.paused) return;
  try {
    video.currentTime = Math.max(0, video.currentTime + 0.05);
  } catch (_) { /* ignore */ }
  state.stallTimer = setTimeout(() => {
    try {
      hls.startLoad(-1);
    } catch (_) { /* ignore */ }
  }, 600);
}

async function play(ch) {
  state.current = ch;
  state.sourceUrl = ch.url;
  $("#player-empty").hidden = true;
  $("#player-err").hidden = true;
  const video = $("#video");
  destroyHls();
  try {
    const path = await registerProxy(ch.url);
    await api("/api/watch-history", { method: "POST", body: JSON.stringify({ channelId: ch.id }) });
    const native = video.canPlayType("application/vnd.apple.mpegurl");
    if (native && !window.Hls) {
      video.src = path;
      await video.play().catch(() => {});
      return;
    }
    if (window.Hls && Hls.isSupported()) {
      const Base = Hls.DefaultConfig.loader;
      const hls = new Hls({
        startLevel: 0,
        ignorePlaylistParsingErrors: true,
        testBandwidth: false,
        maxBufferLength: 60,
        maxMaxBufferLength: 90,
        backBufferLength: 30,
        lowLatencyMode: false,
        enableWebVTT: false,
        manifestLoadingMaxRetry: 25,
        levelLoadingMaxRetry: 25,
        fragLoadingMaxRetry: 15,
        loader: createProxyLoader(Base),
      });
      state.hls = hls;
      const hideErr = () => { $("#player-err").hidden = true; };
      video.addEventListener("playing", hideErr);
      video.addEventListener("waiting", () => recoverLiveStall(hls, video));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.details === "bufferStalledError") {
          recoverLiveStall(hls, video);
          return;
        }
        if (!data.fatal) return;
        if (video.readyState >= 2) return;
        if (data.type === "networkError") {
          hls.startLoad(-1);
          return;
        }
        $("#player-err").hidden = false;
        $("#player-err").textContent = "Flux inaccessible (CORS ou hors ligne)";
      });
      hls.loadSource(path);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else {
      video.src = path;
      await video.play().catch(() => {});
    }
  } catch (e) {
    $("#player-err").hidden = false;
    $("#player-err").textContent = e.message || "Flux inaccessible";
  }
}

function destroyHls() {
  clearTimeout(state.stallTimer);
  if (state.hls) {
    state.hls.destroy();
    state.hls = null;
  }
  const video = $("#video");
  video.pause();
  video.removeAttribute("src");
  video.load();
}

async function boot() {
  const me = await api("/api/auth/me");
  if (!me.user) {
    location.href = "/";
    return;
  }
  $("#who").textContent = me.user.email;
  $$(".nav nav button").forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $("#logout").onclick = async () => {
    await api("/api/auth/logout", { method: "POST" });
    location.href = "/";
  };
  let t;
  $("#q").oninput = () => { clearTimeout(t); t = setTimeout(loadChannels, 200); };
  $("#group").onchange = loadChannels;
  $("#epg-refresh").onclick = async () => {
    $("#epg-status").textContent = "Rafraîchissement…";
    try {
      const { results } = await api("/api/epg", { method: "POST", body: "{}" });
      const total = (results || []).reduce((s, r) => s + (r.count || 0), 0);
      $("#epg-status").textContent = `${total} programmes synchronisés`;
      loadGuide();
    } catch (e) {
      $("#epg-status").textContent = e.message;
    }
  };
  $("#import-form").onsubmit = async (e) => {
    e.preventDefault();
    const err = $("#import-err");
    err.hidden = true;
    const fd = new FormData(e.target);
    try {
      await api("/api/playlists/import", {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          url: fd.get("url"),
          epgUrl: fd.get("epgUrl") || undefined,
        }),
      });
      e.target.reset();
      loadPlaylists();
      loadHome();
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
    }
  };
  $("#import-demo").onclick = async () => {
    $("#import-demo").disabled = true;
    try {
      await api("/api/playlists/import-demo", { method: "POST", body: "{}" });
      loadPlaylists();
      loadHome();
    } catch (ex) {
      alert(ex.message);
    } finally {
      $("#import-demo").disabled = false;
    }
  };
  await Promise.all([loadHome(), loadGroups()]);
}

boot().catch((e) => { console.error(e); location.href = "/"; });
