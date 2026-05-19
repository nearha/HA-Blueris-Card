/* Blue Iris UI3 Card - multimode Lovelace custom card
 * Modes:
 *   backend: uses custom_components/blueiris_ui3 API/proxy, credentials stay in HA backend.
 *   direct: opens Blue Iris UI3 directly; optional frontend credentials/session attempt.
 */
(function () {
  const CARD_VERSION = "0.2.0";
  const API_ROOT = "blueiris_ui3";

  const DEFAULT_PROFILES = [
    { id: "480p^", name: "480p" },
    { id: "720p^", name: "720p" },
    { id: "1080p^", name: "1080p" },
    { id: "2160p^", name: "4K" },
  ];

  const DEFAULT_GROUPS = [{ id: "index", name: "Todas" }];

  const DEFAULT_CONFIG = {
    title: "Blue Iris UI3",
    mode: "direct", // direct | backend
    backend_entry_id: "",
    host: "10.10.30.20",
    port: 80,
    ssl: false,
    ui3_path: "ui3.htm",
    username: "",
    password: "",
    direct_auth: "none", // none | session | url | auto
    discover_groups: true,
    default_group: "index",
    default_profile: "1080p^",
    manual_groups: DEFAULT_GROUPS,
    profiles: DEFAULT_PROFILES,
    height: "70vh",
    show_header: true,
    show_footer: true,
    show_open_button: true,
    auto_refresh_seconds: 300,
    timeout: 0,
    maximize: true,
  };

  const css = `
    :host { display:block; }
    ha-card.biui3-card { overflow:hidden; border-radius: var(--ha-card-border-radius, 18px); }
    .biui3-shell { display:flex; flex-direction:column; background: var(--ha-card-background, var(--card-background-color)); }
    .biui3-top {
      display:flex; align-items:center; justify-content:space-between; gap:14px;
      padding:15px 16px 12px;
      background:
        radial-gradient(circle at 12% 0%, rgba(41, 121, 255, .22), transparent 35%),
        radial-gradient(circle at 92% 0%, rgba(0, 188, 212, .14), transparent 28%),
        linear-gradient(135deg, rgba(40, 49, 68, .10), rgba(40, 49, 68, 0));
      border-bottom: 1px solid var(--divider-color);
    }
    .biui3-brand { display:flex; align-items:center; gap:12px; min-width:0; }
    .biui3-icon {
      flex:0 0 auto; width:38px; height:38px; border-radius:14px;
      display:grid; place-items:center;
      background: linear-gradient(135deg, var(--primary-color), rgba(0, 188, 212, .85));
      color: var(--text-primary-color, #fff); box-shadow: 0 10px 28px rgba(0,0,0,.18);
    }
    .biui3-title-wrap { min-width:0; display:flex; flex-direction:column; gap:2px; }
    .biui3-title { font-weight:800; font-size:17px; color:var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .biui3-subtitle { font-size:12px; color:var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .biui3-chiprow { display:flex; flex-wrap:wrap; gap:7px; justify-content:flex-end; }
    .biui3-chip {
      display:inline-flex; align-items:center; gap:6px; min-height:26px; padding:0 9px; border-radius:999px;
      font-size:12px; color:var(--primary-text-color); background:rgba(127,127,127,.10);
      box-shadow: inset 0 0 0 1px rgba(127,127,127,.20);
    }
    .biui3-dot { width:8px; height:8px; border-radius:999px; background: var(--success-color, #43a047); box-shadow:0 0 0 3px rgba(67,160,71,.15); }
    .biui3-dot.warn { background: var(--error-color, #db4437); box-shadow:0 0 0 3px rgba(219,68,55,.15); }
    .biui3-dot.idle { background: var(--warning-color, #f9ab00); box-shadow:0 0 0 3px rgba(249,171,0,.15); }
    .biui3-controls {
      display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px;
      padding:12px 16px;
      background: linear-gradient(180deg, rgba(127,127,127,.07), rgba(127,127,127,.03));
      border-bottom: 1px solid var(--divider-color);
    }
    .biui3-control { display:flex; flex-direction:column; gap:5px; min-width: 170px; flex: 1 1 180px; }
    .biui3-control.profile { flex: 0 1 170px; min-width:145px; }
    .biui3-label { font-size:11px; letter-spacing:.045em; text-transform:uppercase; color:var(--secondary-text-color); font-weight:800; }
    select.biui3-select, input.biui3-input {
      width:100%; box-sizing:border-box; border:none; outline:none;
      padding:10px 34px 10px 12px; border-radius:13px;
      color: var(--primary-text-color); background: var(--secondary-background-color);
      box-shadow: inset 0 0 0 1px var(--divider-color);
      font-size:14px; min-height:42px;
    }
    select.biui3-select:focus, input.biui3-input:focus { box-shadow: inset 0 0 0 2px var(--primary-color); }
    .biui3-actions { display:flex; gap:8px; align-items:flex-end; margin-left:auto; }
    button.biui3-btn {
      min-height:42px; border:none; border-radius:13px; padding:0 14px; cursor:pointer;
      background: var(--primary-color); color: var(--text-primary-color, white); font-weight:800;
      box-shadow: 0 8px 18px rgba(0,0,0,.16);
      transition: transform .12s ease, filter .12s ease, opacity .12s ease;
    }
    button.biui3-btn.secondary { background: var(--secondary-background-color); color: var(--primary-text-color); box-shadow: inset 0 0 0 1px var(--divider-color); }
    button.biui3-btn:hover { filter:brightness(1.05); transform: translateY(-1px); }
    button.biui3-btn:disabled { opacity:.55; cursor:not-allowed; transform:none; }
    .biui3-frame-wrap { position:relative; background:#050607; min-height:180px; }
    iframe.biui3-frame { display:block; width:100%; height:100%; border:0; background:#050607; }
    .biui3-overlay {
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      color:white; background:linear-gradient(135deg, rgba(0,0,0,.72), rgba(0,0,0,.42)); padding:20px; text-align:center;
      pointer-events:none;
    }
    .biui3-message {
      max-width:720px; padding:18px 20px; border-radius:17px; background:rgba(30,35,45,.93);
      box-shadow:0 14px 38px rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.10);
    }
    .biui3-message strong { display:block; margin-bottom:6px; font-size:16px; }
    .biui3-message span { color:rgba(255,255,255,.78); font-size:13px; line-height:1.45; }
    .biui3-footer { display:flex; justify-content:space-between; gap:10px; padding:9px 16px 12px; color:var(--secondary-text-color); font-size:12px; }
    .biui3-footer span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    @media (max-width: 720px) {
      .biui3-top { align-items:flex-start; flex-direction:column; }
      .biui3-chiprow { justify-content:flex-start; }
      .biui3-controls { padding:10px; gap:8px; }
      .biui3-control, .biui3-control.profile { min-width: 100%; }
      .biui3-actions { width:100%; margin-left:0; }
      button.biui3-btn { flex:1; }
    }
  `;

  class BlueIrisUi3Card extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = normalizeConfig(DEFAULT_CONFIG);
      this._entries = [];
      this._groups = [...DEFAULT_GROUPS];
      this._profiles = [...DEFAULT_PROFILES];
      this._selectedGroup = "index";
      this._selectedProfile = "1080p^";
      this._iframeUrl = "";
      this._error = "";
      this._notice = "";
      this._loading = false;
      this._directSession = "";
      this._directSessionAt = 0;
      this._directAuthFallback = "";
      this._lastGroupCacheAge = null;
      this._refreshTimer = null;
      this._firstRendered = false;
    }

    static getStubConfig() {
      return { ...DEFAULT_CONFIG };
    }

    static async getConfigElement() {
      return document.createElement("blueiris-ui3-card-editor");
    }

    setConfig(config) {
      if (!config) throw new Error("Configuração inválida");
      this._config = normalizeConfig({ ...DEFAULT_CONFIG, ...config });
      this._selectedGroup = this._config.default_group || "index";
      this._selectedProfile = this._config.default_profile || "1080p^";
      this._groups = normalizeItems(this._config.manual_groups, DEFAULT_GROUPS);
      this._profiles = normalizeItems(this._config.profiles, DEFAULT_PROFILES);
      this._scheduleAutoRefresh();
      this._render();
      this._loadAll(false);
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._didInitialLoad) {
        this._didInitialLoad = true;
        this._loadAll(false);
      }
    }

    connectedCallback() {
      this._scheduleAutoRefresh();
    }

    disconnectedCallback() {
      if (this._refreshTimer) window.clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }

    getCardSize() { return 8; }

    async _loadAll(refreshGroups) {
      if (this._loading) return;
      this._loading = true;
      this._error = "";
      this._notice = "";
      this._render();
      try {
        if (this._config.mode === "backend") await this._loadBackend(refreshGroups);
        else await this._loadDirect(refreshGroups);
      } catch (err) {
        this._error = errorMessage(err);
      } finally {
        this._loading = false;
        this._render();
      }
    }

    async _loadBackend(refreshGroups) {
      if (!this._hass) return;
      const entriesPayload = await this._hass.callApi("GET", `${API_ROOT}/entries`);
      this._entries = entriesPayload.entries || [];
      const entryId = this._entryId();
      if (!entryId) {
        this._groups = normalizeItems(this._config.manual_groups, DEFAULT_GROUPS);
        this._profiles = normalizeItems(this._config.profiles, DEFAULT_PROFILES);
        this._error = this._entries.length
          ? "Escolha a instância backend Blue Iris UI3 no editor do card."
          : "Modo backend selecionado, mas nenhuma integração Blue Iris UI3 foi encontrada.";
        return;
      }
      await Promise.all([this._loadBackendGroups(entryId, refreshGroups), this._loadBackendProfiles(entryId)]);
      await this._loadBackendProxyUrl(entryId);
    }

    async _loadBackendGroups(entryId, refresh) {
      const suffix = refresh ? "?refresh=1" : "";
      const payload = await this._hass.callApi("GET", `${API_ROOT}/${entryId}/groups${suffix}`);
      this._groups = normalizeItems(payload.groups, DEFAULT_GROUPS);
      this._lastGroupCacheAge = payload.cache_age;
      this._ensureSelectedValues();
    }

    async _loadBackendProfiles(entryId) {
      const payload = await this._hass.callApi("GET", `${API_ROOT}/${entryId}/profiles`);
      this._profiles = normalizeItems(payload.profiles, normalizeItems(this._config.profiles, DEFAULT_PROFILES));
      this._ensureSelectedValues(payload.default_profile);
    }

    async _loadBackendProxyUrl(entryId) {
      const query = new URLSearchParams({
        group: this._selectedGroup || "index",
        profile: this._selectedProfile || "1080p^",
        timeout: String(this._config.timeout ?? 0),
      });
      const payload = await this._hass.callApi("GET", `${API_ROOT}/${entryId}/proxy_url?${query.toString()}`);
      this._iframeUrl = payload.url;
    }

    _entryId() {
      if (this._config.backend_entry_id) return this._config.backend_entry_id;
      if (this._config.entry_id) return this._config.entry_id; // backward compatibility
      if (this._entries.length === 1) return this._entries[0].entry_id;
      return "";
    }

    async _loadDirect(refreshGroups) {
      this._entries = [];
      this._lastGroupCacheAge = null;
      this._profiles = normalizeItems(this._config.profiles, DEFAULT_PROFILES);
      this._groups = normalizeItems(this._config.manual_groups, DEFAULT_GROUPS);
      this._ensureSelectedValues();

      if (this._config.discover_groups !== false && (refreshGroups || !this._directTriedDiscovery)) {
        this._directTriedDiscovery = true;
        try {
          const camlist = await this._directCamlist();
          const normalized = normalizeCamlist(camlist);
          if (normalized.groups.length) {
            this._groups = normalized.groups;
            this._notice = "Grupos carregados pela API direta";
          }
          this._ensureSelectedValues();
        } catch (err) {
          this._notice = `Usando grupos manuais (${errorMessage(err)})`;
        }
      }
      await this._buildDirectUrl();
    }

    async _buildDirectUrl() {
      const base = this._directBaseUrl();
      const path = normalizePath(this._config.ui3_path || "ui3.htm");
      const url = new URL(path, base);
      if (this._config.maximize !== false) url.searchParams.set("maximize", "1");
      url.searchParams.set("timeout", String(this._config.timeout ?? 0));
      if (this._selectedGroup) url.searchParams.set("group", this._selectedGroup);
      if (this._selectedProfile) url.searchParams.set("p", this._selectedProfile);

      const authMode = this._config.direct_auth || "none";
      this._directAuthFallback = "";
      if (authMode === "session" || authMode === "auto") {
        try {
          const session = await this._ensureDirectSession();
          if (session) url.searchParams.set("session", session);
        } catch (err) {
          if (authMode === "session") {
            this._notice = `Não consegui criar sessão direta: ${errorMessage(err)}`;
          } else {
            this._directAuthFallback = "url";
            this._notice = `Sessão direta falhou; tentando user/pw na URL (${errorMessage(err)})`;
          }
        }
      }
      if ((authMode === "url" || this._directAuthFallback === "url") && this._config.username && this._config.password) {
        url.searchParams.set("user", this._config.username);
        url.searchParams.set("pw", this._config.password);
      }
      url.searchParams.set("_ha", `${Date.now()}`);
      this._iframeUrl = url.toString();
    }

    _directBaseUrl() {
      const scheme = this._config.ssl ? "https" : "http";
      const host = String(this._config.host || "").trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
      const port = Number(this._config.port || (this._config.ssl ? 443 : 80));
      if (!host) throw new Error("Configure o IP/host do Blue Iris no card.");
      const defaultPort = this._config.ssl ? 443 : 80;
      return `${scheme}://${host}${port && port !== defaultPort ? `:${port}` : ""}/`;
    }

    async _directCamlist() {
      const authMode = this._config.direct_auth || "none";
      if (authMode === "session" || authMode === "auto") await this._ensureDirectSession();
      return this._directJson("camlist", {});
    }

    async _ensureDirectSession() {
      if (!this._config.username && !this._config.password) return "";
      const now = Date.now();
      if (this._directSession && now - this._directSessionAt < 20 * 60 * 1000) return this._directSession;
      const challenge = await this._directJson("login", {}, { noSession: true });
      const session = extractSession(challenge);
      if (challenge.result === "success" && session) {
        this._directSession = session;
        this._directSessionAt = now;
        return session;
      }
      if (!session) throw new Error("Blue Iris não retornou session no login");
      const response = md5(`${this._config.username}:${session}:${this._config.password}`);
      const auth = await this._directJson("login", { session, response }, { noSession: true });
      if (auth.result !== "success") throw new Error(auth.reason || auth.data || "login falhou");
      this._directSession = extractSession(auth) || session;
      this._directSessionAt = now;
      return this._directSession;
    }

    async _directJson(cmd, payload = {}, opts = {}) {
      const base = this._directBaseUrl();
      const url = new URL(`json?_${encodeURIComponent(cmd)}`, base);
      const body = { cmd, ...payload };
      if (!opts.noSession && this._directSession) body.session = this._directSession;
      const resp = await fetch(url.toString(), {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data && data.result === "fail" && /session|login|auth/i.test(`${data.reason || ""} ${data.data || ""}`) && !opts.noRetry) {
        this._directSession = "";
        if (this._config.username || this._config.password) {
          await this._ensureDirectSession();
          return this._directJson(cmd, payload, { ...opts, noRetry: true });
        }
      }
      return data;
    }

    _ensureSelectedValues(defaultProfile) {
      if (!this._groups.find((g) => g.id === this._selectedGroup)) {
        this._selectedGroup = this._config.default_group || (this._groups[0] && this._groups[0].id) || "index";
      }
      const wanted = this._config.default_profile || defaultProfile || "1080p^";
      if (!this._profiles.find((p) => p.id === this._selectedProfile)) {
        this._selectedProfile = this._profiles.find((p) => p.id === wanted) ? wanted : ((this._profiles[0] && this._profiles[0].id) || wanted);
      }
    }

    _scheduleAutoRefresh() {
      if (this._refreshTimer) window.clearInterval(this._refreshTimer);
      const seconds = Number(this._config.auto_refresh_seconds || 0);
      if (seconds >= 60) {
        this._refreshTimer = window.setInterval(() => this._loadAll(true), seconds * 1000);
      }
    }

    async _changeGroup(value) {
      this._selectedGroup = value;
      this._error = "";
      this._render();
      try {
        if (this._config.mode === "backend") await this._loadBackendProxyUrl(this._entryId());
        else await this._buildDirectUrl();
      } catch (err) { this._error = errorMessage(err); }
      this._render();
    }

    async _changeProfile(value) {
      this._selectedProfile = value;
      this._error = "";
      this._render();
      try {
        if (this._config.mode === "backend") await this._loadBackendProxyUrl(this._entryId());
        else await this._buildDirectUrl();
      } catch (err) { this._error = errorMessage(err); }
      this._render();
    }

    _activeTitle() {
      if (this._config.mode === "backend") {
        const entry = this._entries.find((e) => e.entry_id === this._entryId());
        return entry ? `Backend · ${entry.title}` : "Backend HA";
      }
      const auth = this._config.direct_auth === "none" ? "sem login" : this._config.direct_auth;
      return `Direto · ${this._directBaseLabel()} · ${auth}`;
    }

    _directBaseLabel() {
      try { return this._directBaseUrl().replace(/\/$/, ""); }
      catch (_err) { return "Blue Iris"; }
    }

    _render() {
      const showHeader = this._config.show_header !== false;
      const showFooter = this._config.show_footer !== false;
      const title = this._config.title || "Blue Iris UI3";
      const height = this._config.height || "70vh";
      const activeGroupName = (this._groups.find((g) => g.id === this._selectedGroup) || {}).name || this._selectedGroup || "Todas";
      const activeProfileName = (this._profiles.find((p) => p.id === this._selectedProfile) || {}).name || this._selectedProfile || "1080p";
      const stateClass = this._error ? "warn" : this._loading ? "idle" : "";
      const stateText = this._error ? "Atenção" : this._loading ? "Carregando" : "Online";
      const footerLeft = this._config.mode === "backend"
        ? "Backend/proxy do Home Assistant"
        : (this._notice || "Direto para o Blue Iris");
      const footerRight = `${activeGroupName} · ${activeProfileName}`;

      this.shadowRoot.innerHTML = `
        <style>${css}</style>
        <ha-card class="biui3-card">
          <div class="biui3-shell">
            ${showHeader ? `
              <div class="biui3-top">
                <div class="biui3-brand">
                  <div class="biui3-icon">${cameraSvg()}</div>
                  <div class="biui3-title-wrap">
                    <div class="biui3-title">${escapeHtml(title)}</div>
                    <div class="biui3-subtitle">${escapeHtml(this._activeTitle())}</div>
                  </div>
                </div>
                <div class="biui3-chiprow">
                  <div class="biui3-chip"><span class="biui3-dot ${stateClass}"></span>${escapeHtml(stateText)}</div>
                  <div class="biui3-chip">${escapeHtml(this._config.mode === "backend" ? "Backend" : "Standalone")}</div>
                </div>
              </div>` : ""}

            <div class="biui3-controls">
              <label class="biui3-control">
                <span class="biui3-label">Grupo</span>
                <select class="biui3-select" id="groupSelect" ${this._groups.length ? "" : "disabled"}>
                  ${this._groups.map((g) => `<option value="${escapeAttr(g.id)}" ${g.id === this._selectedGroup ? "selected" : ""}>${escapeHtml(g.name || g.id)}</option>`).join("")}
                </select>
              </label>
              <label class="biui3-control profile">
                <span class="biui3-label">Resolução</span>
                <select class="biui3-select" id="profileSelect" ${this._profiles.length ? "" : "disabled"}>
                  ${this._profiles.map((p) => `<option value="${escapeAttr(p.id)}" ${p.id === this._selectedProfile ? "selected" : ""}>${escapeHtml(p.name || p.id)}</option>`).join("")}
                </select>
              </label>
              <div class="biui3-actions">
                <button class="biui3-btn secondary" id="reloadBtn" title="Atualizar grupos e recarregar UI3">Atualizar</button>
                ${this._config.show_open_button !== false ? `<button class="biui3-btn" id="openBtn" title="Abrir em nova aba">Abrir</button>` : ""}
              </div>
            </div>

            <div class="biui3-frame-wrap" style="height:${escapeAttr(height)}">
              ${this._iframeUrl ? `<iframe class="biui3-frame" src="${escapeAttr(this._iframeUrl)}" allow="fullscreen; autoplay" referrerpolicy="same-origin"></iframe>` : ""}
              ${this._error || (!this._iframeUrl && this._loading) ? `
                <div class="biui3-overlay"><div class="biui3-message">
                  <strong>${this._error ? "Não foi possível carregar" : "Preparando UI3"}</strong>
                  <span>${escapeHtml(this._error || "Montando URL, buscando grupos e preparando o player...")}</span>
                </div></div>` : ""}
            </div>

            ${showFooter ? `<div class="biui3-footer"><span>${escapeHtml(footerLeft)}</span><span>${escapeHtml(footerRight)}</span></div>` : ""}
          </div>
        </ha-card>
      `;

      this.shadowRoot.getElementById("groupSelect")?.addEventListener("change", (ev) => this._changeGroup(ev.target.value));
      this.shadowRoot.getElementById("profileSelect")?.addEventListener("change", (ev) => this._changeProfile(ev.target.value));
      this.shadowRoot.getElementById("reloadBtn")?.addEventListener("click", () => this._loadAll(true));
      this.shadowRoot.getElementById("openBtn")?.addEventListener("click", () => {
        if (this._iframeUrl) window.open(this._iframeUrl, "_blank", "noopener,noreferrer");
      });
    }
  }

  class BlueIrisUi3CardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = normalizeConfig(DEFAULT_CONFIG);
      this._entries = [];
      this._error = "";
    }

    setConfig(config) {
      this._config = normalizeConfig({ ...DEFAULT_CONFIG, ...(config || {}) });
      this._render();
      this._loadBackendEntries();
    }

    set hass(hass) {
      this._hass = hass;
      this._loadBackendEntries();
    }

    async _loadBackendEntries() {
      if (!this._hass) return;
      try {
        const payload = await this._hass.callApi("GET", `${API_ROOT}/entries`);
        this._entries = payload.entries || [];
        if (!this._config.backend_entry_id && this._entries.length === 1) {
          this._config.backend_entry_id = this._entries[0].entry_id;
          if (this._config.mode === "backend") this._emit();
        }
        this._error = "";
      } catch (err) {
        this._entries = [];
        this._error = "Backend opcional não detectado. O modo direto continua funcionando.";
      }
      this._render();
    }

    _update(key, value) {
      const next = { ...this._config, [key]: value };
      if (["port", "timeout", "auto_refresh_seconds"].includes(key)) next[key] = Number(value || 0);
      if (["ssl", "discover_groups", "show_header", "show_footer", "show_open_button", "maximize"].includes(key)) next[key] = Boolean(value);
      if (key === "mode" && value === "backend" && !next.backend_entry_id && this._entries.length === 1) next.backend_entry_id = this._entries[0].entry_id;
      this._config = normalizeConfig(next);
      this._emit();
      this._render();
    }

    _updateList(key, text, fallback) {
      this._config = normalizeConfig({ ...this._config, [key]: parseListText(text, fallback) });
      this._emit();
      this._render();
    }

    _emit() {
      this.dispatchEvent(new CustomEvent("config-changed", {
        detail: { config: cleanupConfigForSave(this._config) },
        bubbles: true,
        composed: true,
      }));
    }

    _render() {
      const direct = this._config.mode !== "backend";
      const editorCss = `
        :host { display:block; }
        .ed { display:grid; gap:14px; padding:8px 0; }
        .panel { border:1px solid var(--divider-color); border-radius:14px; padding:12px; display:grid; gap:12px; background:rgba(127,127,127,.045); }
        .panel-title { font-weight:800; color:var(--primary-text-color); display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .field { display:flex; flex-direction:column; gap:6px; }
        label { font-size:12px; color:var(--secondary-text-color); font-weight:800; }
        input, select, textarea { box-sizing:border-box; width:100%; min-height:40px; padding:8px 10px; border-radius:10px; border:1px solid var(--divider-color); background:var(--secondary-background-color); color:var(--primary-text-color); font: inherit; }
        textarea { min-height:94px; resize:vertical; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; line-height:1.4; }
        .row { display:grid; gap:12px; grid-template-columns:1fr 1fr; }
        .row3 { display:grid; gap:12px; grid-template-columns:1fr 110px 110px; }
        .check { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--primary-text-color); font-weight:500; }
        .check input { width:auto; min-height:auto; }
        .hint { font-size:12px; color:var(--secondary-text-color); line-height:1.35; }
        .warn { padding:10px 12px; border-radius:10px; background:rgba(249,171,0,.12); color:var(--warning-color, #b06000); font-size:13px; line-height:1.35; }
        .err { padding:10px 12px; border-radius:10px; background:rgba(219,68,55,.12); color:var(--error-color); font-size:13px; }
        @media (max-width:720px){ .row,.row3{grid-template-columns:1fr;} }
      `;
      this.shadowRoot.innerHTML = `
        <style>${editorCss}</style>
        <div class="ed">
          <div class="panel">
            <div class="panel-title">Modo do card</div>
            <div class="field">
              <label>Modo</label>
              <select id="mode">
                <option value="direct" ${this._config.mode !== "backend" ? "selected" : ""}>Standalone / direto no Blue Iris</option>
                <option value="backend" ${this._config.mode === "backend" ? "selected" : ""}>Backend / integração Home Assistant</option>
              </select>
              <div class="hint">Use direto para testar só o card. Depois, troque para backend para esconder credenciais na integração.</div>
            </div>
            ${this._error ? `<div class="warn">${escapeHtml(this._error)}</div>` : ""}
          </div>

          ${direct ? this._renderDirectEditor() : this._renderBackendEditor()}

          <div class="panel">
            <div class="panel-title">Aparência e comportamento</div>
            <div class="field">
              <label>Título</label>
              <input id="title" value="${escapeAttr(this._config.title || "")}" placeholder="Blue Iris UI3" />
            </div>
            <div class="row">
              <div class="field">
                <label>Grupo padrão</label>
                <input id="default_group" value="${escapeAttr(this._config.default_group || "index")}" placeholder="index" />
              </div>
              <div class="field">
                <label>Resolução/perfil padrão</label>
                <input id="default_profile" value="${escapeAttr(this._config.default_profile || "1080p^")}" placeholder="1080p^" />
              </div>
            </div>
            <div class="row">
              <div class="field">
                <label>Altura do player</label>
                <input id="height" value="${escapeAttr(this._config.height || "70vh")}" placeholder="70vh, 560px, 16rem" />
              </div>
              <div class="field">
                <label>Atualizar grupos</label>
                <select id="auto_refresh_seconds">
                  ${[0, 60, 300, 600, 1800].map((s) => `<option value="${s}" ${Number(this._config.auto_refresh_seconds) === s ? "selected" : ""}>${s === 0 ? "Nunca" : `${s}s`}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="row">
              <label class="check"><input id="show_header" type="checkbox" ${this._config.show_header !== false ? "checked" : ""}/> Mostrar cabeçalho</label>
              <label class="check"><input id="show_footer" type="checkbox" ${this._config.show_footer !== false ? "checked" : ""}/> Mostrar rodapé/status</label>
              <label class="check"><input id="show_open_button" type="checkbox" ${this._config.show_open_button !== false ? "checked" : ""}/> Botão abrir</label>
              <label class="check"><input id="maximize" type="checkbox" ${this._config.maximize !== false ? "checked" : ""}/> Abrir UI3 maximizada</label>
            </div>
          </div>

          <div class="panel">
            <div class="panel-title">Listas do seletor</div>
            <div class="row">
              <div class="field">
                <label>Grupos manuais</label>
                <textarea id="manual_groups" spellcheck="false">${escapeHtml(formatListText(this._config.manual_groups || DEFAULT_GROUPS))}</textarea>
                <div class="hint">Um por linha: <code>id|Nome</code>. Exemplo: <code>index|Todas</code>. No modo direto, isso é fallback quando a API é bloqueada.</div>
              </div>
              <div class="field">
                <label>Resoluções/perfis</label>
                <textarea id="profiles" spellcheck="false">${escapeHtml(formatListText(this._config.profiles || DEFAULT_PROFILES))}</textarea>
                <div class="hint">Um por linha: <code>id|Nome</code>. Exemplo: <code>1080p^|1080p</code>.</div>
              </div>
            </div>
          </div>
        </div>
      `;

      const bind = (id, key, prop = "value", event = "change") => {
        this.shadowRoot.getElementById(id)?.addEventListener(event, (ev) => this._update(key, ev.target[prop]));
      };
      bind("mode", "mode");
      bind("backend_entry_id", "backend_entry_id");
      bind("host", "host");
      bind("port", "port");
      bind("ssl", "ssl", "checked");
      bind("ui3_path", "ui3_path");
      bind("username", "username");
      bind("password", "password", "value", "change");
      bind("direct_auth", "direct_auth");
      bind("discover_groups", "discover_groups", "checked");
      bind("timeout", "timeout");
      bind("title", "title");
      bind("default_group", "default_group");
      bind("default_profile", "default_profile");
      bind("height", "height");
      bind("auto_refresh_seconds", "auto_refresh_seconds");
      bind("show_header", "show_header", "checked");
      bind("show_footer", "show_footer", "checked");
      bind("show_open_button", "show_open_button", "checked");
      bind("maximize", "maximize", "checked");
      this.shadowRoot.getElementById("manual_groups")?.addEventListener("change", (ev) => this._updateList("manual_groups", ev.target.value, DEFAULT_GROUPS));
      this.shadowRoot.getElementById("profiles")?.addEventListener("change", (ev) => this._updateList("profiles", ev.target.value, DEFAULT_PROFILES));
    }

    _renderBackendEditor() {
      return `
        <div class="panel">
          <div class="panel-title">Backend Home Assistant</div>
          <div class="field">
            <label>Instância da integração</label>
            <select id="backend_entry_id">
              <option value="">${this._entries.length ? "Selecionar..." : "Nenhuma encontrada"}</option>
              ${this._entries.map((e) => `<option value="${escapeAttr(e.entry_id)}" ${e.entry_id === this._config.backend_entry_id ? "selected" : ""}>${escapeHtml(e.title || e.entry_id)}</option>`).join("")}
            </select>
            <div class="hint">Credenciais ficam na integração. O card usa API/proxy do Home Assistant.</div>
          </div>
        </div>
      `;
    }

    _renderDirectEditor() {
      return `
        <div class="panel">
          <div class="panel-title">Blue Iris direto</div>
          <div class="row3">
            <div class="field">
              <label>IP/Host</label>
              <input id="host" value="${escapeAttr(this._config.host || "")}" placeholder="10.10.30.20" />
            </div>
            <div class="field">
              <label>Porta</label>
              <input id="port" type="number" value="${escapeAttr(this._config.port || 80)}" />
            </div>
            <label class="check" style="align-self:end;"><input id="ssl" type="checkbox" ${this._config.ssl ? "checked" : ""}/> HTTPS</label>
          </div>
          <div class="row">
            <div class="field">
              <label>Caminho UI3</label>
              <input id="ui3_path" value="${escapeAttr(this._config.ui3_path || "ui3.htm")}" placeholder="ui3.htm" />
            </div>
            <div class="field">
              <label>Timeout UI3</label>
              <input id="timeout" type="number" value="${escapeAttr(this._config.timeout ?? 0)}" />
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label>Usuário</label>
              <input id="username" value="${escapeAttr(this._config.username || "")}" autocomplete="off" placeholder="opcional" />
            </div>
            <div class="field">
              <label>Senha</label>
              <input id="password" type="password" value="${escapeAttr(this._config.password || "")}" autocomplete="new-password" placeholder="opcional" />
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label>Autenticação direta</label>
              <select id="direct_auth">
                <option value="none" ${this._config.direct_auth === "none" ? "selected" : ""}>Sem login / liberado na LAN</option>
                <option value="session" ${this._config.direct_auth === "session" ? "selected" : ""}>Sessão via API do Blue Iris</option>
                <option value="url" ${this._config.direct_auth === "url" ? "selected" : ""}>user/pw na URL da UI3</option>
                <option value="auto" ${this._config.direct_auth === "auto" ? "selected" : ""}>Auto: sessão, depois URL</option>
              </select>
              <div class="hint">No modo direto, usuário/senha ficam no frontend do dashboard. Use usuário limitado.</div>
            </div>
            <label class="check" style="align-self:end;"><input id="discover_groups" type="checkbox" ${this._config.discover_groups !== false ? "checked" : ""}/> Tentar buscar grupos via API</label>
          </div>
          <div class="warn">Modo direto é ótimo para testar só o card. Se a API for bloqueada por CORS, o player ainda abre e os grupos vêm da lista manual.</div>
        </div>
      `;
    }
  }

  function normalizeConfig(config) {
    const out = { ...config };
    if (out.entry_id && !out.backend_entry_id) out.backend_entry_id = out.entry_id;
    out.mode = out.mode === "backend" ? "backend" : "direct";
    out.direct_auth = ["none", "session", "url", "auto"].includes(out.direct_auth) ? out.direct_auth : "none";
    out.port = Number(out.port || (out.ssl ? 443 : 80));
    out.timeout = Number(out.timeout ?? 0);
    out.auto_refresh_seconds = Number(out.auto_refresh_seconds || 0);
    out.manual_groups = normalizeItems(out.manual_groups, DEFAULT_GROUPS);
    out.profiles = normalizeItems(out.profiles, DEFAULT_PROFILES);
    return out;
  }

  function cleanupConfigForSave(config) {
    const out = { ...config };
    delete out.entry_id;
    return out;
  }

  function normalizeItems(value, fallback) {
    if (typeof value === "string") return parseListText(value, fallback);
    if (!Array.isArray(value)) return [...fallback];
    const items = value.map((item) => {
      if (typeof item === "string") return { id: item, name: item };
      const id = String(item?.id ?? item?.optionValue ?? item?.value ?? "").trim();
      const name = String(item?.name ?? item?.optionDisplay ?? id).trim();
      return id ? { id, name } : null;
    }).filter(Boolean);
    return items.length ? dedupeItems(items) : [...fallback];
  }

  function parseListText(text, fallback) {
    const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = lines.map((line) => {
      const [idRaw, ...nameParts] = line.split("|");
      const id = String(idRaw || "").trim();
      const name = String(nameParts.join("|") || id).trim();
      return id ? { id, name } : null;
    }).filter(Boolean);
    return items.length ? dedupeItems(items) : [...fallback];
  }

  function formatListText(items) {
    return normalizeItems(items, []).map((item) => `${item.id}|${item.name || item.id}`).join("\n");
  }

  function dedupeItems(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      const key = String(item.id).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  function normalizeCamlist(raw) {
    const data = Array.isArray(raw?.data) ? raw.data : [];
    const cameras = [];
    const groups = [];
    const seenGroups = new Set();
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.optionValue || item.id || "").trim();
      if (!id) continue;
      const name = cleanName(String(item.optionDisplay || item.name || id));
      if (Array.isArray(item.group)) {
        groups.push({ id, name: name || id });
        seenGroups.add(id.toLowerCase());
      } else if (!id.startsWith("@")) {
        cameras.push({ id, name });
      }
    }
    if (!seenGroups.has("index")) groups.unshift({ id: "index", name: "Todas" });
    return { groups: dedupeItems(groups), cameras };
  }

  function cleanName(name) {
    let value = String(name || "").trim();
    if (value.startsWith("+")) value = value.slice(1).trim();
    return value;
  }

  function normalizePath(path) {
    const p = String(path || "ui3.htm").trim().replace(/^\/+/, "");
    return p || "ui3.htm";
  }

  function extractSession(payload) {
    if (payload && typeof payload.session === "string") return payload.session;
    if (payload?.data && typeof payload.data.session === "string") return payload.data.session;
    return "";
  }

  function errorMessage(err) {
    if (!err) return "Erro desconhecido";
    if (err.message) return err.message;
    return String(err);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  }
  function escapeAttr(value) { return escapeHtml(value); }

  function cameraSvg() {
    return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 7.5A2.5 2.5 0 0 1 6.5 5h7A2.5 2.5 0 0 1 16 7.5v.65l3.37-1.93A1.1 1.1 0 0 1 21 7.18v9.64a1.1 1.1 0 0 1-1.63.96L16 15.85v.65A2.5 2.5 0 0 1 13.5 19h-7A2.5 2.5 0 0 1 4 16.5v-9Z"/></svg>`;
  }

  // Compact MD5 implementation for Blue Iris challenge login in direct frontend mode.
  function md5(str) {
    function cmn(q, a, b, x, s, t) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
    function md5cycle(x, k) {
      let [a, b, c, d] = x;
      a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586); c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
      a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426); c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
      a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417); c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
      a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101); c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
      a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632); c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
      a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083); c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
      a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690); c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
      a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784); c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
      a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463); c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
      a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353); c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
      a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222); c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
      a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835); c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
      a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415); c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
      a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606); c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
      a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744); c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
      a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379); c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
      x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
    }
    function md5blk(s) { const md5blks = []; for (let i = 0; i < 64; i += 4) md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24); return md5blks; }
    function md51(s) { let n = s.length; const state = [1732584193, -271733879, -1732584194, 271733878]; let i; for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i))); s = s.substring(i - 64); const tail = Array(16).fill(0); for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3); tail[i >> 2] |= 0x80 << ((i % 4) << 3); if (i > 55) { md5cycle(state, tail); tail.fill(0); } tail[14] = n * 8; md5cycle(state, tail); return state; }
    function rhex(n) { let s = ""; for (let j = 0; j < 4; j++) s += ((n >> (j * 8 + 4)) & 0x0f).toString(16) + ((n >> (j * 8)) & 0x0f).toString(16); return s; }
    function hex(x) { return x.map(rhex).join(""); }
    function add32(a, b) { return (a + b) & 0xffffffff; }
    return hex(md51(unescape(encodeURIComponent(str))));
  }

  if (!customElements.get("blueiris-ui3-card")) customElements.define("blueiris-ui3-card", BlueIrisUi3Card);
  if (!customElements.get("blueiris-ui3-card-editor")) customElements.define("blueiris-ui3-card-editor", BlueIrisUi3CardEditor);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "blueiris-ui3-card",
    name: "Blue Iris UI3",
    description: "Card UI3 multifunção: direto ou backend, grupos e resolução dinâmicos",
    preview: false,
  });

  console.info(`%c BLUEIRIS-UI3-CARD %c v${CARD_VERSION} `, "color:white;background:#1565c0;font-weight:700", "color:#1565c0;background:white;font-weight:700");
})();
