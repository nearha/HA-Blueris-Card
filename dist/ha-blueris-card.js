/* HA-Blueris-Card - backend-only Lovelace card for Blue Iris UI3 */
(() => {
  const VERSION = "0.6.1";
  const API = "blueiris_ui3";
  const DEFAULT_GROUPS = [{ id: "index", name: "Todas" }];
  const DEFAULT_PROFILES = [
    { id: "2160p VBR^", name: "4K VBR" }, { id: "1080p VBR^", name: "1080p VBR" },
    { id: "2160p^", name: "4K" }, { id: "1440p^", name: "1440p" },
    { id: "1080p^", name: "1080p" }, { id: "720p^", name: "720p" },
    { id: "480p", name: "480p" }, { id: "360p", name: "360p" }, { id: "240p", name: "240p" }
  ];
  const DEFAULT_CONFIG = { title: "Blue Iris UI3", entry_id: "", default_group: "index", default_profile: "1080p^", height: "70vh", timeout: 0, maximize: true, show_header: true, show_footer: true, show_open_button: true };

  class BlueIrisUi3Card extends HTMLElement {
    constructor() {
      super(); this.attachShadow({ mode: "open" });
      this._config = { ...DEFAULT_CONFIG }; this._entries = []; this._groups = [...DEFAULT_GROUPS]; this._profiles = [...DEFAULT_PROFILES];
      this._group = "index"; this._profile = "1080p^"; this._url = ""; this._notice = ""; this._error = ""; this._loading = false;
    }
    static getStubConfig() { return { ...DEFAULT_CONFIG }; }
    static getConfigElement() { return document.createElement("blueiris-ui3-card-editor"); }
    getCardSize() { return 8; }
    setConfig(config) { this._config = { ...DEFAULT_CONFIG, ...(config || {}) }; this._group = this._config.default_group || "index"; this._profile = this._config.default_profile || "1080p^"; this._render(); this._loadAll(); }
    set hass(hass) { this._hass = hass; if (!this._didLoad) { this._didLoad = true; this._loadAll(); } }
    _entryId() { return this._config.entry_id || (this._entries.length === 1 ? this._entries[0].entry_id : ""); }
    async _loadAll() {
      if (!this._hass || this._loading) return;
      this._loading = true; this._error = ""; this._notice = "Carregando backend"; this._render();
      try {
        const ep = await this._hass.callApi("GET", `${API}/entries`); this._entries = ep.entries || [];
        const entryId = this._entryId();
        if (!entryId) { this._url = ""; this._error = this._entries.length ? "Selecione uma instância Blue Iris no editor do card." : "Integração Blue Iris UI3 Backend não encontrada."; return; }
        const [gp, pp] = await Promise.all([this._hass.callApi("GET", `${API}/${entryId}/groups`), this._hass.callApi("GET", `${API}/${entryId}/profiles`)]);
        this._groups = normalizeItems(gp.groups, DEFAULT_GROUPS); this._profiles = normalizeItems(pp.profiles, DEFAULT_PROFILES); this._ensure(); await this._refreshUrl(); this._notice = `Backend conectado · ${this._groups.length} grupos`;
      } catch (err) { this._error = message(err); }
      finally { this._loading = false; this._render(); }
    }
    _ensure() { if (!this._groups.some(g => g.id === this._group)) this._group = this._config.default_group || this._groups[0]?.id || "index"; if (!this._profiles.some(p => p.id === this._profile)) this._profile = this._config.default_profile || this._profiles[0]?.id || "1080p^"; }
    async _refreshUrl() { const entryId = this._entryId(); if (!entryId) return; const q = new URLSearchParams({ group: this._group || "index", profile: this._profile || "1080p^", timeout: String(this._config.timeout ?? 0), maximize: this._config.maximize === false ? "0" : "1" }); const p = await this._hass.callApi("GET", `${API}/${entryId}/ui3_url?${q.toString()}`); this._url = p.url; }
    async _setGroup(v) { this._group = v; try { await this._refreshUrl(); this._error = ""; } catch (err) { this._error = message(err); } this._render(); }
    async _setProfile(v) { this._profile = v; try { await this._refreshUrl(); this._error = ""; } catch (err) { this._error = message(err); } this._render(); }
    _render() {
      const entry = this._entries.find(e => e.entry_id === this._entryId()); const status = this._error ? "Erro" : (this._loading ? "Carregando" : this._notice || "Pronto");
      const groupName = this._groups.find(g => g.id === this._group)?.name || this._group;
      const profileName = this._profiles.find(p => p.id === this._profile)?.name || this._profile;
      this.shadowRoot.innerHTML = `
        <style>${styles()}</style>
        <ha-card class="bi-card">
          ${this._config.show_header !== false ? `<div class="top"><div><div class="title">${escapeHtml(this._config.title || "Blue Iris UI3")}</div><div class="sub">${escapeHtml(entry ? `Backend · ${entry.title || "Blue Iris UI3"}` : "Backend Home Assistant")}</div></div><span class="pill" title="${escapeAttr(status)}">${escapeHtml(status)}</span></div>` : ""}
          <div class="controls">
            <label><span>Grupo</span><select id="group">${this._groups.map(g => `<option value="${escapeAttr(g.id)}" ${g.id === this._group ? "selected" : ""}>${escapeHtml(g.name || g.id)}</option>`).join("")}</select></label>
            <label><span>Resolução</span><select id="profile">${this._profiles.map(p => `<option value="${escapeAttr(p.id)}" ${p.id === this._profile ? "selected" : ""}>${escapeHtml(p.name || p.id)}</option>`).join("")}</select></label>
            <button id="refresh">Atualizar</button>${this._config.show_open_button !== false ? `<button id="open">Abrir</button>` : ""}
          </div>
          <div class="frame" style="height:${escapeAttr(this._config.height || "70vh")}">
            ${this._url ? `<iframe src="${escapeAttr(this._url)}" allow="fullscreen; autoplay" referrerpolicy="same-origin"></iframe>` : ""}
            ${this._error || (!this._url && this._loading) ? `<div class="overlay"><b>${this._error ? "Não carregou" : "Preparando UI3"}</b><span>${escapeHtml(this._error || "Chamando API do backend...")}</span></div>` : ""}
          </div>
          ${this._config.show_footer !== false ? `<div class="foot"><span>${escapeHtml(groupName)} · ${escapeHtml(profileName)}</span><span>v${VERSION}</span></div>` : ""}
        </ha-card>`;
      this.shadowRoot.getElementById("group")?.addEventListener("change", e => this._setGroup(e.target.value));
      this.shadowRoot.getElementById("profile")?.addEventListener("change", e => this._setProfile(e.target.value));
      this.shadowRoot.getElementById("refresh")?.addEventListener("click", () => this._loadAll());
      this.shadowRoot.getElementById("open")?.addEventListener("click", () => this._url && window.open(this._url, "_blank", "noopener,noreferrer"));
    }
  }

  class BlueIrisUi3CardEditor extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: "open" }); this._config = { ...DEFAULT_CONFIG }; this._entries = []; this._error = ""; }
    set hass(hass) { this._hass = hass; this._loadEntries(); }
    setConfig(config) { this._config = { ...DEFAULT_CONFIG, ...(config || {}) }; this._render(); this._loadEntries(); }
    async _loadEntries() {
      if (!this._hass) return;
      try {
        const payload = await this._hass.callApi("GET", `${API}/entries`);
        this._entries = payload.entries || [];
        this._error = "";
        if (!this._config.entry_id && this._entries.length === 1) {
          this._config.entry_id = this._entries[0].entry_id;
          this._emit();
        }
      } catch (err) {
        this._entries = [];
        this._error = "Instale e configure a integração Blue Iris UI3 Backend primeiro.";
      }
      this._render();
    }
    _set(key, value) {
      const next = { ...this._config, [key]: value };
      if (key === "timeout") next[key] = Number(value || 0);
      if (["maximize", "show_header", "show_footer", "show_open_button"].includes(key)) next[key] = !!value;
      this._config = next;
      this._emit();
      this._render();
    }
    _emit() {
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    _render() {
      const c = this._config;
      this.shadowRoot.innerHTML = `<style>${editorStyles()}</style><div class="ed">
        <section><h3>Backend</h3><label>Instância Blue Iris<select id="entry_id"><option value="">${this._entries.length ? "Selecionar" : "Nenhuma encontrada"}</option>${this._entries.map(e => `<option value="${escapeAttr(e.entry_id)}" ${e.entry_id === c.entry_id ? "selected" : ""}>${escapeHtml(e.title || "Blue Iris UI3")}</option>`).join("")}</select></label>${this._error ? `<p class="err">${escapeHtml(this._error)}</p>` : ""}<p>O card não guarda senha e não autentica direto. Ele usa somente a API da integração.</p></section>
        <section><h3>Card</h3><div class="grid2"><label>Título<input id="title" value="${escapeAttr(c.title)}"></label><label>Altura<input id="height" value="${escapeAttr(c.height)}"></label><label>Grupo padrão<input id="default_group" value="${escapeAttr(c.default_group)}"></label><label>Perfil padrão<input id="default_profile" value="${escapeAttr(c.default_profile)}"></label><label>Timeout UI3<input id="timeout" type="number" value="${escapeAttr(c.timeout)}"></label></div><div class="checks"><label><input id="maximize" type="checkbox" ${c.maximize !== false ? "checked" : ""}> UI3 maximizada</label><label><input id="show_header" type="checkbox" ${c.show_header !== false ? "checked" : ""}> Cabeçalho</label><label><input id="show_footer" type="checkbox" ${c.show_footer !== false ? "checked" : ""}> Rodapé</label><label><input id="show_open_button" type="checkbox" ${c.show_open_button !== false ? "checked" : ""}> Botão abrir</label></div></section>
      </div>`;
      const bind = (id, key, prop = "value") => this.shadowRoot.getElementById(id)?.addEventListener("change", e => this._set(key, e.target[prop]));
      ["entry_id", "title", "height", "default_group", "default_profile", "timeout"].forEach(id => bind(id, id));
      ["maximize", "show_header", "show_footer", "show_open_button"].forEach(id => bind(id, id, "checked"));
    }
  }

  function normalizeItems(value, fallback) {
    if (!Array.isArray(value)) return [...fallback];
    const out = value.map(item => ({ id: String(item?.id || item?.optionValue || "").trim(), name: String(item?.name || item?.optionDisplay || item?.id || "").trim() })).filter(item => item.id);
    return out.length ? out : [...fallback];
  }
  function message(err) { return err?.message || String(err || "Erro desconhecido"); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
  function escapeAttr(value) { return escapeHtml(value); }
  function styles() { return `ha-card.bi-card{overflow:hidden;border-radius:18px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--divider-color);background:linear-gradient(135deg,rgba(21,101,192,.16),rgba(0,188,212,.08))}.title{font-weight:800;font-size:17px}.sub{font-size:12px;color:var(--secondary-text-color)}.pill{border-radius:999px;padding:5px 10px;background:rgba(127,127,127,.14);font-size:12px;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.controls{display:flex;gap:10px;align-items:end;padding:12px 16px;border-bottom:1px solid var(--divider-color);flex-wrap:wrap}.controls label{flex:1;min-width:170px;display:flex;flex-direction:column;gap:5px}.controls span{font-size:11px;text-transform:uppercase;color:var(--secondary-text-color);font-weight:800}select,input{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:12px;padding:9px 11px;font:inherit}button{border:0;border-radius:12px;padding:10px 14px;background:var(--primary-color);color:var(--text-primary-color,#fff);font-weight:800;cursor:pointer}.frame{position:relative;background:#050607;min-height:180px}.frame iframe{width:100%;height:100%;border:0;display:block;background:#050607}.overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:rgba(0,0,0,.65);color:white;padding:18px;text-align:center}.foot{display:flex;justify-content:space-between;padding:8px 16px;color:var(--secondary-text-color);font-size:12px}@media(max-width:700px){.controls label{min-width:100%}.controls button{flex:1}.pill{max-width:100%}}`; }
  function editorStyles() { return `.ed{display:grid;gap:12px}section{border:1px solid var(--divider-color);border-radius:14px;padding:12px;background:rgba(127,127,127,.05);display:grid;gap:10px}h3{margin:0;font-size:15px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--secondary-text-color);font-weight:800}.checks{display:grid;grid-template-columns:1fr 1fr;gap:8px}.checks label{flex-direction:row;align-items:center;color:var(--primary-text-color);font-weight:500}input,select{background:var(--secondary-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:10px;padding:8px;font:inherit}p{margin:0;color:var(--secondary-text-color);font-size:12px;line-height:1.35}.err{color:var(--error-color)}@media(max-width:700px){.grid2,.checks{grid-template-columns:1fr}}`; }

  if (!customElements.get("blueiris-ui3-card")) customElements.define("blueiris-ui3-card", BlueIrisUi3Card);
  if (!customElements.get("blueiris-ui3-card-editor")) customElements.define("blueiris-ui3-card-editor", BlueIrisUi3CardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === "blueiris-ui3-card")) window.customCards.push({ type: "blueiris-ui3-card", name: "Blue Iris UI3", description: "Blue Iris UI3 backend card", preview: false });
  console.info(`%c HA-BLUERIS-CARD %c v${VERSION} backend-only loaded `, "color:white;background:#1565c0;font-weight:700", "color:#1565c0;background:white;font-weight:700");
})();
