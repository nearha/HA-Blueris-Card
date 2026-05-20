(() => {
  const VERSION = "0.7.0";
  const API = "blueiris_ui3";

  const DEFAULT_GROUPS = [{ id: "index", name: "Todas" }];

  const DEFAULT_PROFILES = [
    { id: "1080p VBR^", name: "1080p VBR" },
    { id: "2160p VBR^", name: "4K VBR" },
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
    entry_id: "",
    default_group: "index",
    default_profile: "1080p VBR^",
    height: "70vh",
    timeout: 0,
    maximize: true,
    show_header: true,
    show_footer: true,
    show_open_button: true,
    reload_on_resume: false,
    resume_reload_delay: 1200,
  };

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[char]));

  const normalizeItems = (items, fallback) => {
    if (!Array.isArray(items)) return [...fallback];

    const seen = new Set();
    const normalized = items
      .map((item) => ({
        id: String(item?.id ?? item?.optionValue ?? item ?? "").trim(),
        name: String(item?.name ?? item?.optionDisplay ?? item?.id ?? item ?? "").trim(),
      }))
      .filter((item) => item.id)
      .filter((item) => {
        const key = item.id.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return normalized.length ? normalized : [...fallback];
  };

  const errorMessage = (error) => error?.message || String(error || "Erro desconhecido");

  class BlueIrisUi3Card extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });

      this._config = { ...DEFAULT_CONFIG };
      this._entries = [];
      this._groups = [...DEFAULT_GROUPS];
      this._profiles = [...DEFAULT_PROFILES];

      this._group = "index";
      this._profile = "1080p VBR^";
      this._url = "";
      this._error = "";
      this._notice = "";
      this._loading = false;
      this._nonce = 0;
      this._resumeTimer = null;

      this._onVisibility = () => this._handleResume();
      this._onFocus = () => this._handleResume();
    }

    static getStubConfig() {
      return { ...DEFAULT_CONFIG };
    }

    static getConfigElement() {
      return document.createElement("blueiris-ui3-card-editor");
    }

    getCardSize() {
      return 8;
    }

    connectedCallback() {
      document.addEventListener("visibilitychange", this._onVisibility);
      window.addEventListener("focus", this._onFocus);
      window.addEventListener("pageshow", this._onFocus);
    }

    disconnectedCallback() {
      document.removeEventListener("visibilitychange", this._onVisibility);
      window.removeEventListener("focus", this._onFocus);
      window.removeEventListener("pageshow", this._onFocus);
      clearTimeout(this._resumeTimer);
    }

    setConfig(config) {
      this._config = { ...DEFAULT_CONFIG, ...(config || {}) };
      this._group = this._config.default_group || "index";
      this._profile = this._config.default_profile || "1080p VBR^";
      this._render();
      this._load();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._loadedOnce) {
        this._loadedOnce = true;
        this._load();
      }
    }

    _entryId() {
      return this._config.entry_id || (this._entries.length === 1 ? this._entries[0].entry_id : "");
    }

    async _load() {
      if (!this._hass || this._loading) return;

      this._loading = true;
      this._error = "";
      this._notice = "Carregando backend";
      this._render();

      try {
        const entriesPayload = await this._hass.callApi("GET", `${API}/entries`);
        this._entries = entriesPayload.entries || [];

        const entryId = this._entryId();
        if (!entryId) {
          this._url = "";
          this._error = this._entries.length
            ? "Selecione uma instância no editor do card."
            : "Integração Blue Iris UI3 Backend não encontrada.";
          return;
        }

        try {
          const [groupsPayload, profilesPayload] = await Promise.all([
            this._hass.callApi("GET", `${API}/${entryId}/groups`),
            this._hass.callApi("GET", `${API}/${entryId}/profiles`),
          ]);

          this._groups = normalizeItems(groupsPayload.groups, DEFAULT_GROUPS);
          this._profiles = normalizeItems(profilesPayload.profiles, DEFAULT_PROFILES);
        } catch (_) {
          this._groups = [...DEFAULT_GROUPS];
          this._profiles = [...DEFAULT_PROFILES];
        }

        this._ensureSelections();
        this._makeUrl();
        this._notice = "UI3 autenticada pelo backend";
      } catch (error) {
        this._url = "";
        this._error = errorMessage(error);
      } finally {
        this._loading = false;
        this._render();
      }
    }

    _ensureSelections() {
      if (!this._groups.some((group) => group.id === this._group)) {
        this._group = this._config.default_group || this._groups[0]?.id || "index";
      }

      if (!this._profiles.some((profile) => profile.id === this._profile)) {
        this._profile =
          this._config.default_profile ||
          this._profiles.find((profile) => profile.id === "1080p VBR^")?.id ||
          this._profiles[0]?.id ||
          "1080p VBR^";
      }
    }

    _makeUrl() {
      const entryId = this._entryId();
      if (!entryId) {
        this._url = "";
        return;
      }

      const params = new URLSearchParams({
        group: this._group || "index",
        profile: this._profile || "1080p VBR^",
        timeout: String(this._config.timeout ?? 0),
        maximize: this._config.maximize === false ? "0" : "1",
        ha_card_nonce: `${Date.now()}_${++this._nonce}`,
      });

      this._url = `/api/${API}/${entryId}/direct_ui3?${params}`;
    }

    async _refreshFrame() {
      try {
        this._makeUrl();
        this._error = "";
      } catch (error) {
        this._error = errorMessage(error);
      }
      this._render();
    }

    _handleResume() {
      if (this._config.reload_on_resume !== true || document.hidden) return;

      clearTimeout(this._resumeTimer);
      this._resumeTimer = setTimeout(
        () => this._refreshFrame(),
        Number(this._config.resume_reload_delay ?? 1200)
      );
    }

    async _setGroup(value) {
      this._group = value;
      await this._refreshFrame();
    }

    async _setProfile(value) {
      this._profile = value;
      await this._refreshFrame();
    }

    _render() {
      const selectedGroup = this._groups.find((group) => group.id === this._group)?.name || this._group;
      const selectedProfile =
        this._profiles.find((profile) => profile.id === this._profile)?.name || this._profile;

      const entry = this._entries.find((item) => item.entry_id === this._entryId());
      const status = this._error ? "Erro" : this._loading ? "Carregando" : this._notice || "Pronto";
      const subtitle = entry
        ? `Autenticado · ${entry.title || "Blue Iris UI3"}`
        : "Autenticado pelo backend";

      this.shadowRoot.innerHTML = `
        <style>${cardStyles()}</style>
        <ha-card class="bi-card">
          ${
            this._config.show_header !== false
              ? `
                <div class="top">
                  <div>
                    <div class="title">${escapeHtml(this._config.title || "Blue Iris UI3")}</div>
                    <div class="sub">${escapeHtml(subtitle)}</div>
                  </div>
                  <span class="pill" title="${escapeHtml(status)}">${escapeHtml(status)}</span>
                </div>
              `
              : ""
          }

          <div class="controls">
            <label>
              <span>Grupo</span>
              <select id="group">
                ${this._groups
                  .map(
                    (group) => `
                      <option value="${escapeHtml(group.id)}" ${
                      group.id === this._group ? "selected" : ""
                    }>${escapeHtml(group.name || group.id)}</option>
                    `
                  )
                  .join("")}
              </select>
            </label>

            <label>
              <span>Resolução</span>
              <select id="profile">
                ${this._profiles
                  .map(
                    (profile) => `
                      <option value="${escapeHtml(profile.id)}" ${
                      profile.id === this._profile ? "selected" : ""
                    }>${escapeHtml(profile.name || profile.id)}</option>
                    `
                  )
                  .join("")}
              </select>
            </label>

            <button id="refresh">Atualizar</button>

            ${
              this._config.show_open_button !== false
                ? `<button id="open">Abrir</button>`
                : ""
            }
          </div>

          <div class="frame" style="height:${escapeHtml(this._config.height || "70vh")}">
            ${
              this._url
                ? `<iframe src="${escapeHtml(this._url)}" allow="autoplay; fullscreen" referrerpolicy="same-origin" scrolling="no"></iframe>`
                : ""
            }

            ${
              this._error || (!this._url && this._loading)
                ? `
                  <div class="overlay">
                    <b>${this._error ? "Não carregou" : "Preparando UI3"}</b>
                    <span>${escapeHtml(this._error || "Chamando backend...")}</span>
                  </div>
                `
                : ""
            }
          </div>

          ${
            this._config.show_footer !== false
              ? `
                <div class="foot">
                  <span>${escapeHtml(selectedGroup)} · ${escapeHtml(selectedProfile)}</span>
                  <span>v${VERSION}</span>
                </div>
              `
              : ""
          }
        </ha-card>
      `;

      this.shadowRoot.getElementById("group")?.addEventListener("change", (event) => {
        this._setGroup(event.target.value);
      });

      this.shadowRoot.getElementById("profile")?.addEventListener("change", (event) => {
        this._setProfile(event.target.value);
      });

      this.shadowRoot.getElementById("refresh")?.addEventListener("click", () => {
        this._load();
      });

      this.shadowRoot.getElementById("open")?.addEventListener("click", () => {
        if (this._url) {
          window.open(this._url, "_blank", "noopener,noreferrer");
        }
      });
    }
  }

  class BlueIrisUi3CardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });

      this._config = { ...DEFAULT_CONFIG };
      this._entries = [];
      this._groups = [...DEFAULT_GROUPS];
      this._profiles = [...DEFAULT_PROFILES];
      this._loadedEntry = "";
      this._error = "";
    }

    setConfig(config) {
      this._config = { ...DEFAULT_CONFIG, ...(config || {}) };
      this._render();
      this._load();
    }

    set hass(hass) {
      this._hass = hass;
      this._load();
    }

    _entryId() {
      return this._config.entry_id || (this._entries.length === 1 ? this._entries[0].entry_id : "");
    }

    async _load() {
      if (!this._hass) return;

      try {
        const entriesPayload = await this._hass.callApi("GET", `${API}/entries`);
        this._entries = entriesPayload.entries || [];
        this._error = "";

        if (!this._config.entry_id && this._entries.length === 1) {
          this._config.entry_id = this._entries[0].entry_id;
          this._emit();
        }

        await this._loadLists();
      } catch (error) {
        this._entries = [];
        this._groups = [...DEFAULT_GROUPS];
        this._profiles = [...DEFAULT_PROFILES];
        this._error = "Instale e configure a integração Blue Iris UI3 Backend primeiro.";
      }

      this._render();
    }

    async _loadLists(force = false) {
      const entryId = this._entryId();
      if (!this._hass || !entryId || (!force && this._loadedEntry === entryId)) return;

      const [groupsPayload, profilesPayload] = await Promise.all([
        this._hass.callApi("GET", `${API}/${entryId}/groups`),
        this._hass.callApi("GET", `${API}/${entryId}/profiles`),
      ]);

      this._groups = normalizeItems(groupsPayload.groups, DEFAULT_GROUPS);
      this._profiles = normalizeItems(profilesPayload.profiles, DEFAULT_PROFILES);

      if (
        !this._config.default_group ||
        !this._groups.some((group) => group.id === this._config.default_group)
      ) {
        this._config.default_group = this._groups[0]?.id || "index";
      }

      if (
        !this._config.default_profile ||
        !this._profiles.some((profile) => profile.id === this._config.default_profile)
      ) {
        this._config.default_profile =
          profilesPayload.default_profile ||
          this._profiles.find((profile) => profile.id === "1080p VBR^")?.id ||
          this._profiles[0]?.id ||
          "1080p VBR^";
      }

      this._loadedEntry = entryId;
      this._emit();
    }

    async _setConfigValue(key, value) {
      const next = { ...this._config, [key]: value };

      if (["timeout", "resume_reload_delay"].includes(key)) {
        next[key] = Number(value || 0);
      }

      if (
        [
          "maximize",
          "show_header",
          "show_footer",
          "show_open_button",
          "reload_on_resume",
        ].includes(key)
      ) {
        next[key] = Boolean(value);
      }

      if (key === "entry_id") {
        this._loadedEntry = "";
      }

      this._config = next;
      this._emit();

      if (key === "entry_id") {
        try {
          await this._loadLists(true);
        } catch (error) {
          this._error = errorMessage(error);
        }
      }

      this._render();
    }

    _emit() {
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true,
        })
      );
    }

    _render() {
      const config = this._config;

      this.shadowRoot.innerHTML = `
        <style>${editorStyles()}</style>

        <div class="editor">
          <section>
            <h3>Backend</h3>

            <label>
              Instância Blue Iris
              <select id="entry_id">
                <option value="">${this._entries.length ? "Selecionar" : "Nenhuma encontrada"}</option>
                ${this._entries
                  .map(
                    (entry) => `
                      <option value="${escapeHtml(entry.entry_id)}" ${
                      entry.entry_id === config.entry_id ? "selected" : ""
                    }>${escapeHtml(entry.title || "Blue Iris UI3")}</option>
                    `
                  )
                  .join("")}
              </select>
            </label>

            ${
              this._error
                ? `<p class="err">${escapeHtml(this._error)}</p>`
                : ""
            }

            <p>
              O backend autentica no Blue Iris e redireciona a UI3 com sessão temporária.
              A senha não fica no card.
            </p>
          </section>

          <section>
            <h3>Card</h3>

            <div class="grid">
              <label>
                Título
                <input id="title" value="${escapeHtml(config.title)}">
              </label>

              <label>
                Altura
                <input id="height" value="${escapeHtml(config.height)}">
              </label>

              <label>
                Grupo padrão
                <select id="default_group">
                  ${this._groups
                    .map(
                      (group) => `
                        <option value="${escapeHtml(group.id)}" ${
                        group.id === config.default_group ? "selected" : ""
                      }>${escapeHtml(group.name || group.id)}</option>
                      `
                    )
                    .join("")}
                </select>
              </label>

              <label>
                Resolução padrão
                <select id="default_profile">
                  ${this._profiles
                    .map(
                      (profile) => `
                        <option value="${escapeHtml(profile.id)}" ${
                        profile.id === config.default_profile ? "selected" : ""
                      }>${escapeHtml(profile.name || profile.id)}</option>
                      `
                    )
                    .join("")}
                </select>
              </label>

              <label>
                Timeout UI3
                <input id="timeout" type="number" value="${escapeHtml(config.timeout)}">
              </label>

              <label>
                Delay ao voltar
                <input id="resume_reload_delay" type="number" value="${escapeHtml(
                  config.resume_reload_delay ?? 1200
                )}">
              </label>
            </div>

            <div class="checks">
              <label>
                <input id="maximize" type="checkbox" ${
                  config.maximize !== false ? "checked" : ""
                }>
                UI3 maximizada
              </label>

              <label>
                <input id="reload_on_resume" type="checkbox" ${
                  config.reload_on_resume === true ? "checked" : ""
                }>
                Recarregar ao voltar
              </label>

              <label>
                <input id="show_header" type="checkbox" ${
                  config.show_header !== false ? "checked" : ""
                }>
                Cabeçalho
              </label>

              <label>
                <input id="show_footer" type="checkbox" ${
                  config.show_footer !== false ? "checked" : ""
                }>
                Rodapé
              </label>

              <label>
                <input id="show_open_button" type="checkbox" ${
                  config.show_open_button !== false ? "checked" : ""
                }>
                Botão abrir
              </label>
            </div>
          </section>
        </div>
      `;

      const bindValue = (id, key) => {
        this.shadowRoot.getElementById(id)?.addEventListener("change", (event) => {
          this._setConfigValue(key, event.target.value);
        });
      };

      const bindChecked = (id, key) => {
        this.shadowRoot.getElementById(id)?.addEventListener("change", (event) => {
          this._setConfigValue(key, event.target.checked);
        });
      };

      [
        "entry_id",
        "title",
        "height",
        "default_group",
        "default_profile",
        "timeout",
        "resume_reload_delay",
      ].forEach((id) => bindValue(id, id));

      [
        "maximize",
        "show_header",
        "show_footer",
        "show_open_button",
        "reload_on_resume",
      ].forEach((id) => bindChecked(id, id));
    }
  }

  function cardStyles() {
    return `
      ha-card.bi-card {
        overflow: hidden;
        border-radius: 18px;
      }

      .top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding: 14px 16px;
        border-bottom: 1px solid var(--divider-color);
        background: linear-gradient(135deg, rgba(21,101,192,.16), rgba(0,188,212,.08));
      }

      .title {
        font-weight: 800;
        font-size: 17px;
      }

      .sub {
        font-size: 12px;
        color: var(--secondary-text-color);
      }

      .pill {
        border-radius: 999px;
        padding: 5px 10px;
        background: rgba(127,127,127,.14);
        font-size: 12px;
        max-width: 45%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .controls {
        display: flex;
        gap: 10px;
        align-items: end;
        padding: 12px 16px;
        border-bottom: 1px solid var(--divider-color);
        flex-wrap: wrap;
      }

      .controls label {
        flex: 1;
        min-width: 170px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .controls span {
        font-size: 11px;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        font-weight: 800;
      }

      select,
      input {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        padding: 9px 11px;
        font: inherit;
      }

      button {
        border: 0;
        border-radius: 12px;
        padding: 10px 14px;
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        font-weight: 800;
        cursor: pointer;
      }

      .frame {
        position: relative;
        background: #050607;
        min-height: 180px;
        overflow: hidden;
      }

      .frame iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
        background: #050607;
      }

      .overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: rgba(0,0,0,.65);
        color: white;
        padding: 18px;
        text-align: center;
      }

      .foot {
        display: flex;
        justify-content: space-between;
        padding: 8px 16px;
        color: var(--secondary-text-color);
        font-size: 12px;
      }

      @media (max-width: 700px) {
        .controls label {
          min-width: 100%;
        }

        .controls button {
          flex: 1;
        }

        .pill {
          max-width: 100%;
        }
      }
    `;
  }

  function editorStyles() {
    return `
      .editor {
        display: grid;
        gap: 12px;
      }

      section {
        border: 1px solid var(--divider-color);
        border-radius: 14px;
        padding: 12px;
        background: rgba(127,127,127,.05);
        display: grid;
        gap: 10px;
      }

      h3 {
        margin: 0;
        font-size: 15px;
      }

      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      label {
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 12px;
        color: var(--secondary-text-color);
        font-weight: 800;
      }

      .checks {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .checks label {
        flex-direction: row;
        align-items: center;
        color: var(--primary-text-color);
        font-weight: 500;
      }

      input,
      select {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color);
        border-radius: 10px;
        padding: 8px;
        font: inherit;
      }

      p {
        margin: 0;
        color: var(--secondary-text-color);
        font-size: 12px;
        line-height: 1.35;
      }

      .err {
        color: var(--error-color);
      }

      @media (max-width: 700px) {
        .grid,
        .checks {
          grid-template-columns: 1fr;
        }
      }
    `;
  }

  if (!customElements.get("blueiris-ui3-card")) {
    customElements.define("blueiris-ui3-card", BlueIrisUi3Card);
  }

  if (!customElements.get("blueiris-ui3-card-editor")) {
    customElements.define("blueiris-ui3-card-editor", BlueIrisUi3CardEditor);
  }

  window.customCards = window.customCards || [];
  if (!window.customCards.some((card) => card.type === "blueiris-ui3-card")) {
    window.customCards.push({
      type: "blueiris-ui3-card",
      name: "Blue Iris UI3",
      description: "Blue Iris UI3 autenticado pelo backend",
      preview: false,
    });
  }

  console.info(
    `%c HA-BLUERIS-CARD %c v${VERSION} authenticated-direct loaded `,
    "color:white;background:#1565c0;font-weight:700",
    "color:#1565c0;background:white;font-weight:700"
  );
})();
