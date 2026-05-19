/* HA-Blueris-Card - standalone Lovelace card for Blue Iris UI3 */
(() => {
  const VERSION = "0.4.1";
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
    direct_auth: "none",
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
              this._notice = "Grupos carregados pela API camlist";
            }
          } catch (err) {
            this._notice = `API camlist indisponível; usando grupos manuais (${msg(err)})`;
          }
        }
        this._ensureSelections();
        this._url = this._buildUrl();
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
    _buildUrl() {
      const url = new URL(cleanPath(this._config.ui3_path || "ui3.htm"), this._base());
      if (this._config.maximize !== false) url.searchParams.set("maximize", "1");
      url.searchParams.set("timeout", String(this._config.timeout ?? 0));
      if (this._group) url.searchParams.set("group", this._group);
      if (this._profile) url.searchParams.set("p", this._profile);
      const auth = this._config.direct_auth || "none";
      if ((auth === "url" || auth === "auto") && this._config.username && this._config.password) {
        url.searchParams.set("user", this._config.username);
        url.searchParams.set("pw", this._config.password);
      }
      url.searchParams.set("_ha", Date.now().toString());
      return url.toString();
    }
    async _camlist() { return this._json("camlist", {}); }
    async _json(cmd, payload = {}) {
      const url = new URL(`json?_${encodeURIComponent(cmd)}`, this._base());
      const body = { cmd, ...payload };
      if ((this._config.direct_auth === "url" || this._config.direct_auth === "auto") && this._config.username && this._config.password) {
        body.user = this._config.username;
        body.pw = this._config.password;
      }
      const r = await fetch(url.toString(), { method: "POST", mode: "cors", credentials: "omit", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }
    _setGroup(v) { this._group = v; this._url = this._buildUrl(); this._render(); }
    _setProfile(v) { this._profile = v; this._url = this._buildUrl(); this._render(); }
    _render() {
      const cfg = this._config;
      const status = this._error ? "Erro" : this._notice || "Pronto";
      const groupName = this._groups.find(g => g.id === this._group)?.name || this._group;
      const profileName = this._profiles.find(p => p.id === this._profile)?.name || this._profile;
      this.shadowRoot.innerHTML = `
        <style>${styles()}</style>
        <ha-card class="bi-card">
          ${cfg.show_header !== false ? `<div class="top"><div><div class="title">${esc(cfg.title || "Blue Iris UI3")}</div><div class="sub">${esc(this._baseLabel())}</div></div><span class="pill">${esc(status)}</span></div>` : ""}
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
    _setList(k, v, fb) { this._config = normalizeConfig({ ...this._config, [k]: parseList(v, fb) }); this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true })); this._render(); }
    _render() {
      const c = this._config;
      this.shadowRoot.innerHTML = `<style>${editorStyles()}</style><div class="ed">
        <section><h3>Blue Iris</h3><div class="grid3"><label>Host/IP<input id="host" value="${ea(c.host)}"></label><label>Porta<input id="port" type="number" value="${ea(c.port)}"></label><label class="chk"><input id="ssl" type="checkbox" ${c.ssl ? "checked" : ""}> HTTPS</label></div><div class="grid2"><label>Usuário<input id="username" value="${ea(c.username)}" autocomplete="off"></label><label>Senha<input id="password" type="password" value="${ea(c.password)}" autocomplete="new-password"></label></div><label>Autenticação<select id="direct_auth"><option value="none" ${c.direct_auth === "none" ? "selected" : ""}>Sem login / liberado na LAN</option><option value="url" ${c.direct_auth === "url" ? "selected" : ""}>user/pw na URL</option><option value="auto" ${c.direct_auth === "auto" ? "selected" : ""}>Auto</option></select></label></section>
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

  function normalizeConfig(c) { c.port = Number(c.port || 80); c.timeout = Number(c.timeout || 0); c.direct_auth = ["none", "url", "auto"].includes(c.direct_auth) ? c.direct_auth : "none"; c.manual_groups = normalizeItems(c.manual_groups, DEFAULT_GROUPS); c.profiles = normalizeItems(c.profiles, DEFAULT_PROFILES); return c; }
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
  function styles() { return `ha-card.bi-card{overflow:hidden;border-radius:18px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--divider-color);background:linear-gradient(135deg,rgba(21,101,192,.16),rgba(0,188,212,.08))}.title{font-weight:800;font-size:17px}.sub{font-size:12px;color:var(--secondary-text-color)}.pill{border-radius:999px;padding:5px 10px;background:rgba(127,127,127,.14);font-size:12px}.controls{display:flex;gap:10px;align-items:end;padding:12px 16px;border-bottom:1px solid var(--divider-color);flex-wrap:wrap}.controls label{flex:1;min-width:170px;display:flex;flex-direction:column;gap:5px}.controls span{font-size:11px;text-transform:uppercase;color:var(--secondary-text-color);font-weight:800}select,input,textarea{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:12px;padding:9px 11px;font:inherit}button{border:0;border-radius:12px;padding:10px 14px;background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:800;cursor:pointer}.frame{position:relative;background:#050607;min-height:180px}.frame iframe{width:100%;height:100%;border:0;display:block;background:#050607}.overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:rgba(0,0,0,.65);color:white;padding:18px;text-align:center}.foot{display:flex;justify-content:space-between;padding:8px 16px;color:var(--secondary-text-color);font-size:12px}@media(max-width:700px){.controls label{min-width:100%}.controls button{flex:1}}`; }
  function editorStyles() { return `.ed{display:grid;gap:12px}section{border:1px solid var(--divider-color);border-radius:14px;padding:12px;background:rgba(127,127,127,.05);display:grid;gap:10px}h3{margin:0;font-size:15px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid3{display:grid;grid-template-columns:1fr 100px 100px;gap:10px}label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--secondary-text-color);font-weight:800}.chk{align-self:end;flex-direction:row;align-items:center}.checks{display:grid;grid-template-columns:1fr 1fr;gap:8px}.checks label{flex-direction:row;align-items:center;color:var(--primary-text-color);font-weight:500}input,select,textarea{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:10px;padding:8px;font:inherit}textarea{min-height:100px;font-family:monospace;font-size:12px}p{margin:0;color:var(--secondary-text-color);font-size:12px}@media(max-width:700px){.grid2,.grid3,.checks{grid-template-columns:1fr}}`; }
  if (!customElements.get("blueiris-ui3-card")) customElements.define("blueiris-ui3-card", BlueIrisUi3Card);
  if (!customElements.get("blueiris-ui3-card-editor")) customElements.define("blueiris-ui3-card-editor", BlueIrisUi3CardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === "blueiris-ui3-card")) window.customCards.push({ type: "blueiris-ui3-card", name: "Blue Iris UI3", description: "Blue Iris UI3 card", preview: false });
  console.info(`%c HA-BLUERIS-CARD %c v${VERSION} loaded `, "color:white;background:#1565c0;font-weight:700", "color:#1565c0;background:white;font-weight:700");
})();
