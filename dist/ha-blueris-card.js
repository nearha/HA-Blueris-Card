/* HA-Blueris-Card - standalone Lovelace card for Blue Iris UI3 */
(() => {
  const VERSION = "0.4.2";
  const DEFAULT_GROUPS = [{ id: "index", name: "Todas" }];
  const DEFAULT_PROFILES = [
    { id: "2160p VBR^", name: "4K VBR" },
    { id: "1080p VBR^", name: "1080p VBR" },
    { id: "2160p^", name: "4K" },
    { id: "1440p^", name: "1440p" },
    { id: "1080p^", name: "1080p" },
    { id: "720p^", name: "720p" },
    { id: "480p", name: "480p" },
    { id: "360p", name: "360p" },
    { id: "240p", name: "240p" },
  ];
  const DEFAULT_CONFIG = {
    title: "Blue Iris UI3",
    host: "10.10.30.20",
    port: 80,
    ssl: false,
    ui3_path: "ui3.htm",
    username: "",
    password: "",
    direct_auth: "auto", // none | session | url | auto
    discover_groups: true,
    refresh_groups_on_open: true,
    default_group: "index",
    default_profile: "1080p^",
    manual_groups: DEFAULT_GROUPS,
    profiles: DEFAULT_PROFILES,
    height: "70vh",
    maximize: true,
    timeout: 0,
    show_header: true,
    show_footer: true,
    show_open_button: true,
  };

  class BlueIrisUi3Card extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = { ...DEFAULT_CONFIG };
      this._groups = [...DEFAULT_GROUPS];
      this._profiles = [...DEFAULT_PROFILES];
      this._group = "index";
      this._profile = "1080p^";
      this._url = "";
      this._notice = "";
      this._error = "";
      this._session = "";
      this._sessionAt = 0;
    }

    static getStubConfig() { return { ...DEFAULT_CONFIG }; }
    static getConfigElement() { return document.createElement("blueiris-ui3-card-editor"); }
    set hass(hass) { this._hass = hass; }

    setConfig(config) {
      this._config = normalizeConfig({ ...DEFAULT_CONFIG, ...(config || {}) });
      this._groups = normalizeItems(this._config.manual_groups, DEFAULT_GROUPS);
      this._profiles = normalizeItems(this._config.profiles, DEFAULT_PROFILES);
      this._group = this._config.default_group || "index";
      this._profile = this._config.default_profile || "1080p^";
      this._render();
      this._load(this._config.refresh_groups_on_open !== false);
    }

    getCardSize() { return 8; }

    async _load(refreshGroups) {
      this._error = "";
      this._notice = "Carregando...";
      this._render();
      try {
        this._groups = normalizeItems(this._config.manual_groups, DEFAULT_GROUPS);
        this._profiles = normalizeItems(this._config.profiles, DEFAULT_PROFILES);

        if (this._config.discover_groups !== false && refreshGroups) {
          try {
            const camlist = await this._camlist();
            const groups = groupsFromCamlist(camlist);
            if (groups.length) {
              this._groups = groups;
              this._notice = `Grupos carregados pela API camlist (${groups.length})`;
            }
          } catch (err) {
            this._notice = `API camlist indisponível; usando grupos manuais (${msg(err)})`;
            console.warn("HA-Blueris-Card camlist failed", err);
          }
        }

        this._ensureSelections();
        this._url = await this._buildUrl();
      } catch (err) {
        this._error = msg(err);
      }
      this._render();
    }

    _ensureSelections() {
      if (!this._groups.some(g => g.id === this._group)) this._group = this._config.default_group || this._groups[0]?.id || "index";
      if (!this._profiles.some(p => p.id === this._profile)) this._profile = this._config.default_profile || this._profiles[0]?.id || "1080p^";
    }

    _base() {
      const host = String(this._config.host || "").replace(/^https?:\/\//i, "").replace(/\/$/, "").trim();
      if (!host) throw new Error("Configure o host/IP do Blue Iris");
      const ssl = !!this._config.ssl;
      const port = Number(this._config.port || (ssl ? 443 : 80));
      const def = ssl ? 443 : 80;
      return `${ssl ? "https" : "http"}://${host}${port && port !== def ? `:${port}` : ""}/`;
    }

    async _buildUrl() {
      const url = new URL(cleanPath(this._config.ui3_path || "ui3.htm"), this._base());
      if (this._config.maximize !== false) url.searchParams.set("maximize", "1");
      url.searchParams.set("timeout", String(this._config.timeout ?? 0));
      if (this._group) url.searchParams.set("group", this._group);
      if (this._profile) url.searchParams.set("p", this._profile);

      const auth = this._config.direct_auth || "none";
      if ((auth === "session" || auth === "auto") && hasCreds(this._config)) {
        try {
          const session = await this._ensureSession();
          if (session) url.searchParams.set("session", session);
        } catch (err) {
          if (auth === "session") this._notice = `Login por sessão falhou: ${msg(err)}`;
          if (auth === "auto") this._addUrlCreds(url, `Sessão falhou; usando user/pw na URL (${msg(err)})`);
        }
      } else if (auth === "url" && hasCreds(this._config)) {
        this._addUrlCreds(url);
      }

      url.searchParams.set("_ha", Date.now().toString());
      return url.toString();
    }

    _addUrlCreds(url, notice) {
      url.searchParams.set("user", this._config.username);
      url.searchParams.set("pw", this._config.password);
      if (notice) this._notice = notice;
    }

    async _camlist() {
      const auth = this._config.direct_auth || "none";
      const payload = {};
      if ((auth === "session" || auth === "auto") && hasCreds(this._config)) {
        payload.session = await this._ensureSession();
      }
      try {
        return await this._json("camlist", payload);
      } catch (err) {
        if (auth === "auto" && hasCreds(this._config)) {
          // Fallback for Blue Iris configs that accept user/pw in JSON body.
          return await this._json("camlist", { user: this._config.username, pw: this._config.password });
        }
        throw err;
      }
    }

    async _ensureSession() {
      if (!hasCreds(this._config)) return "";
      if (this._session && Date.now() - this._sessionAt < 20 * 60 * 1000) return this._session;

      const challenge = await this._json("login", {});
      const session = extractSession(challenge);
      if (!session) throw new Error("Blue Iris não retornou session no login");

      const response = md5(`${this._config.username}:${session}:${this._config.password}`);
      const auth = await this._json("login", { session, response });
      if (auth.result !== "success") throw new Error(auth.reason || auth.data || "login falhou");

      this._session = extractSession(auth) || session;
      this._sessionAt = Date.now();
      return this._session;
    }

    async _json(cmd, payload = {}) {
      const url = new URL(`json?_${encodeURIComponent(cmd)}`, this._base());
      const r = await fetch(url.toString(), {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ cmd, ...payload }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (data && data.result === "fail") throw new Error(data.reason || data.data || `${cmd} retornou fail`);
      return data;
    }

    async _setGroup(v) { this._group = v; this._url = await this._buildUrl(); this._render(); }
    async _setProfile(v) { this._profile = v; this._url = await this._buildUrl(); this._render(); }

    _render() {
      const cfg = this._config;
      const status = this._error ? "Erro" : this._notice || "Pronto";
      const groupName = this._groups.find(g => g.id === this._group)?.name || this._group;
      const profileName = this._profiles.find(p => p.id === this._profile)?.name || this._profile;
      this.shadowRoot.innerHTML = `
        <style>${styles()}</style>
        <ha-card class="bi-card">
          ${cfg.show_header !== false ? `<div class="top"><div><div class="title">${esc(cfg.title || "Blue Iris UI3")}</div><div class="sub">${esc(this._baseLabel())}</div></div><span class="pill" title="${ea(status)}">${esc(status)}</span></div>` : ""}
          <div class="controls">
            <label><span>Grupo</span><select id="group">${this._groups.map(g => `<option value="${ea(g.id)}" ${g.id === this._group ? "selected" : ""}>${esc(g.name || g.id)}</option>`).join("")}</select></label>
            <label><span>Resolução</span><select id="profile">${this._profiles.map(p => `<option value="${ea(p.id)}" ${p.id === this._profile ? "selected" : ""}>${esc(p.name || p.id)}</option>`).join("")}</select></label>
            <button id="refresh">Atualizar</button>${cfg.show_open_button !== false ? `<button id="open">Abrir</button>` : ""}
          </div>
          <div class="frame" style="height:${ea(cfg.height || "70vh")}">${this._url ? `<iframe src="${ea(this._url)}" allow="fullscreen; autoplay" referrerpolicy="same-origin"></iframe>` : ""}${this._error ? `<div class="overlay"><b>Não carregou</b><span>${esc(this._error)}</span></div>` : ""}</div>
          ${cfg.show_footer !== false ? `<div class="foot"><span>${esc(groupName)} · ${esc(profileName)}</span><span>v${VERSION}</span></div>` : ""}
        </ha-card>`;
      this.shadowRoot.getElementById("group")?.addEventListener("change", e => this._setGroup(e.target.value));
      this.shadowRoot.getElementById("profile")?.addEventListener("change", e => this._setProfile(e.target.value));
      this.shadowRoot.getElementById("refresh")?.addEventListener("click", () => this._load(true));
      this.shadowRoot.getElementById("open")?.addEventListener("click", () => this._url && window.open(this._url, "_blank", "noopener,noreferrer"));
    }

    _baseLabel() { try { return this._base().replace(/\/$/, ""); } catch { return "Blue Iris"; } }
  }

  class BlueIrisUi3CardEditor extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: "open" }); this._config = { ...DEFAULT_CONFIG }; }
    setConfig(config) { this._config = normalizeConfig({ ...DEFAULT_CONFIG, ...(config || {}) }); this._render(); }
    _set(k, v) {
      const c = { ...this._config, [k]: v };
      if (["port", "timeout"].includes(k)) c[k] = Number(v || 0);
      if (["ssl", "discover_groups", "refresh_groups_on_open", "maximize", "show_header", "show_footer", "show_open_button"].includes(k)) c[k] = !!v;
      this._config = normalizeConfig(c);
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      this._render();
    }
    _setList(k, v, fb) {
      this._config = normalizeConfig({ ...this._config, [k]: parseList(v, fb) });
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      this._render();
    }
    _render() {
      const c = this._config;
      this.shadowRoot.innerHTML = `<style>${editorStyles()}</style><div class="ed">
        <section><h3>Blue Iris</h3><div class="grid3"><label>Host/IP<input id="host" value="${ea(c.host)}"></label><label>Porta<input id="port" type="number" value="${ea(c.port)}"></label><label class="chk"><input id="ssl" type="checkbox" ${c.ssl ? "checked" : ""}> HTTPS</label></div><div class="grid2"><label>Usuário<input id="username" value="${ea(c.username)}" autocomplete="off"></label><label>Senha<input id="password" type="password" value="${ea(c.password)}" autocomplete="new-password"></label></div><label>Autenticação<select id="direct_auth"><option value="none" ${c.direct_auth === "none" ? "selected" : ""}>Sem login / liberado na LAN</option><option value="session" ${c.direct_auth === "session" ? "selected" : ""}>Sessão segura via API</option><option value="url" ${c.direct_auth === "url" ? "selected" : ""}>user/pw na URL</option><option value="auto" ${c.direct_auth === "auto" ? "selected" : ""}>Auto: sessão, depois URL</option></select></label></section>
        <section><h3>Card</h3><div class="grid2"><label>Título<input id="title" value="${ea(c.title)}"></label><label>Altura<input id="height" value="${ea(c.height)}"></label><label>Grupo padrão<input id="default_group" value="${ea(c.default_group)}"></label><label>Perfil padrão<input id="default_profile" value="${ea(c.default_profile)}"></label></div><div class="checks"><label><input id="discover_groups" type="checkbox" ${c.discover_groups !== false ? "checked" : ""}> Buscar grupos via camlist</label><label><input id="refresh_groups_on_open" type="checkbox" ${c.refresh_groups_on_open !== false ? "checked" : ""}> Buscar ao abrir</label><label><input id="maximize" type="checkbox" ${c.maximize !== false ? "checked" : ""}> UI3 maximizada</label><label><input id="show_open_button" type="checkbox" ${c.show_open_button !== false ? "checked" : ""}> Botão abrir</label></div></section>
        <section><h3>Listas</h3><div class="grid2"><label>Grupos manuais<textarea id="manual_groups">${esc(formatList(c.manual_groups))}</textarea></label><label>Perfis<textarea id="profiles">${esc(formatList(c.profiles))}</textarea></label></div><p>Formato: <code>id|Nome</code>, um por linha. Para 480p use <code>480p</code>, sem <code>^</code>.</p></section>
      </div>`;
      const b = (id, k, prop = "value") => this.shadowRoot.getElementById(id)?.addEventListener("change", e => this._set(k, e.target[prop]));
      ["host", "port", "username", "password", "direct_auth", "title", "height", "default_group", "default_profile"].forEach(id => b(id, id));
      ["ssl", "discover_groups", "refresh_groups_on_open", "maximize", "show_open_button"].forEach(id => b(id, id, "checked"));
      this.shadowRoot.getElementById("manual_groups")?.addEventListener("change", e => this._setList("manual_groups", e.target.value, DEFAULT_GROUPS));
      this.shadowRoot.getElementById("profiles")?.addEventListener("change", e => this._setList("profiles", e.target.value, DEFAULT_PROFILES));
    }
  }

  function hasCreds(c) { return !!(c.username || c.password); }
  function extractSession(data) { return data?.session || data?.data?.session || ""; }
  function normalizeConfig(c) { c.port = Number(c.port || 80); c.timeout = Number(c.timeout || 0); c.direct_auth = ["none", "session", "url", "auto"].includes(c.direct_auth) ? c.direct_auth : "auto"; c.manual_groups = normalizeItems(c.manual_groups, DEFAULT_GROUPS); c.profiles = normalizeItems(c.profiles, DEFAULT_PROFILES); return c; }
  function normalizeItems(v, fb) { if (typeof v === "string") return parseList(v, fb); if (!Array.isArray(v)) return [...fb]; const out = v.map(x => typeof x === "string" ? { id: x, name: x } : { id: String(x?.id || x?.optionValue || "").trim(), name: String(x?.name || x?.optionDisplay || x?.id || "").trim() }).filter(x => x.id); return out.length ? dedupe(out) : [...fb]; }
  function parseList(t, fb) { const out = String(t || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => { const [id, ...name] = l.split("|"); return { id: id.trim(), name: (name.join("|") || id).trim() }; }).filter(x => x.id); return out.length ? dedupe(out) : [...fb]; }
  function formatList(items) { return normalizeItems(items, []).map(x => `${x.id}|${x.name || x.id}`).join("\n"); }
  function dedupe(a) { const s = new Set(); return a.filter(x => { const k = x.id.toLowerCase(); if (s.has(k)) return false; s.add(k); return true; }); }
  function groupsFromCamlist(raw) { const data = Array.isArray(raw?.data) ? raw.data : []; const groups = []; let hasIndex = false; for (const x of data) { const id = String(x?.optionValue || x?.id || "").trim(); if (!id) continue; if (Array.isArray(x.group)) { if (id.toLowerCase() === "index") hasIndex = true; groups.push({ id, name: cleanName(x.optionDisplay || x.name || id) }); } } if (!hasIndex) groups.unshift({ id: "index", name: "Todas" }); return dedupe(groups); }
  function cleanName(v) { v = String(v || "").trim(); return v.startsWith("+") ? v.slice(1).trim() : v; }
  function cleanPath(v) { return String(v || "ui3.htm").replace(/^\/+/, "") || "ui3.htm"; }
  function msg(e) { return e?.message || String(e || "Erro desconhecido"); }
  function esc(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
  function ea(v) { return esc(v); }
  function styles() { return `ha-card.bi-card{overflow:hidden;border-radius:18px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--divider-color);background:linear-gradient(135deg,rgba(21,101,192,.16),rgba(0,188,212,.08))}.title{font-weight:800;font-size:17px}.sub{font-size:12px;color:var(--secondary-text-color)}.pill{border-radius:999px;padding:5px 10px;background:rgba(127,127,127,.14);font-size:12px;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.controls{display:flex;gap:10px;align-items:end;padding:12px 16px;border-bottom:1px solid var(--divider-color);flex-wrap:wrap}.controls label{flex:1;min-width:170px;display:flex;flex-direction:column;gap:5px}.controls span{font-size:11px;text-transform:uppercase;color:var(--secondary-text-color);font-weight:800}select,input,textarea{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:12px;padding:9px 11px;font:inherit}button{border:0;border-radius:12px;padding:10px 14px;background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:800;cursor:pointer}.frame{position:relative;background:#050607;min-height:180px}.frame iframe{width:100%;height:100%;border:0;display:block;background:#050607}.overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:rgba(0,0,0,.65);color:white;padding:18px;text-align:center}.foot{display:flex;justify-content:space-between;padding:8px 16px;color:var(--secondary-text-color);font-size:12px}@media(max-width:700px){.controls label{min-width:100%}.controls button{flex:1}.pill{max-width:100%}}`; }
  function editorStyles() { return `.ed{display:grid;gap:12px}section{border:1px solid var(--divider-color);border-radius:14px;padding:12px;background:rgba(127,127,127,.05);display:grid;gap:10px}h3{margin:0;font-size:15px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid3{display:grid;grid-template-columns:1fr 100px 100px;gap:10px}label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--secondary-text-color);font-weight:800}.chk{align-self:end;flex-direction:row;align-items:center}.checks{display:grid;grid-template-columns:1fr 1fr;gap:8px}.checks label{flex-direction:row;align-items:center;color:var(--primary-text-color);font-weight:500}input,select,textarea{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:10px;padding:8px;font:inherit}textarea{min-height:100px;font-family:monospace;font-size:12px}p{margin:0;color:var(--secondary-text-color);font-size:12px}@media(max-width:700px){.grid2,.grid3,.checks{grid-template-columns:1fr}}`; }

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
    function md5blk(s) { const blocks = []; for (let i = 0; i < 64; i += 4) blocks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24); return blocks; }
    function md51(s) { let n = s.length; const state = [1732584193, -271733879, -1732584194, 271733878]; let i; for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i))); s = s.substring(i - 64); const tail = Array(16).fill(0); for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3); tail[i >> 2] |= 0x80 << ((i % 4) << 3); if (i > 55) { md5cycle(state, tail); tail.fill(0); } tail[14] = n * 8; md5cycle(state, tail); return state; }
    function rhex(n) { let s = ""; for (let j = 0; j < 4; j++) s += ((n >> (j * 8 + 4)) & 0x0f).toString(16) + ((n >> (j * 8)) & 0x0f).toString(16); return s; }
    function add32(a, b) { return (a + b) & 0xffffffff; }
    return md51(unescape(encodeURIComponent(str))).map(rhex).join("");
  }

  if (!customElements.get("blueiris-ui3-card")) customElements.define("blueiris-ui3-card", BlueIrisUi3Card);
  if (!customElements.get("blueiris-ui3-card-editor")) customElements.define("blueiris-ui3-card-editor", BlueIrisUi3CardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === "blueiris-ui3-card")) window.customCards.push({ type: "blueiris-ui3-card", name: "Blue Iris UI3", description: "Blue Iris UI3 card", preview: false });
  console.info(`%c HA-BLUERIS-CARD %c v${VERSION} loaded `, "color:white;background:#1565c0;font-weight:700", "color:#1565c0;background:white;font-weight:700");
})();
