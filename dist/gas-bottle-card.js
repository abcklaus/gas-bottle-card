/**
 * Gas Bottle Card – Lovelace card for Home Assistant
 *
 * Shows a gas bottle with its fill level. The entity provides the level in
 * percent; the remaining amount in kg is computed from the configured
 * bottle capacity.
 *
 * https://github.com/abcklaus/gas-bottle-card
 */
(() => {
  const CARD_VERSION = "1.0.0";
  const CARD_TYPE = "gas-bottle-card";
  const EDITOR_TYPE = "gas-bottle-card-editor";

  const DEFAULTS = {
    capacity: 11,
    warning: 30,
    critical: 15,
  };

  const TRANSLATIONS = {
    de: {
      of: "von",
      unavailable: "Nicht verfügbar",
      no_entity: "Bitte eine Entität auswählen.",
      not_found: "Entität nicht gefunden",
      entity: "Entität (Füllstand in %)",
      name: "Name",
      capacity: "Gesamtvolumen der Flasche",
      warning: "Warnschwelle",
      critical: "Kritische Schwelle",
      description: "Zeigt den Füllstand einer Gasflasche in % und kg an.",
    },
    en: {
      of: "of",
      unavailable: "Unavailable",
      no_entity: "Please select an entity.",
      not_found: "Entity not found",
      entity: "Entity (fill level in %)",
      name: "Name",
      capacity: "Bottle capacity",
      warning: "Warning threshold",
      critical: "Critical threshold",
      description: "Shows the fill level of a gas bottle in % and kg.",
    },
  };

  const language = (hass) =>
    (hass?.locale?.language || hass?.language || navigator.language || "en").toLowerCase();

  const t = (hass, key) => {
    const lang = language(hass).split("-")[0];
    return (TRANSLATIONS[lang] || TRANSLATIONS.en)[key] ?? TRANSLATIONS.en[key] ?? key;
  };

  const toNumber = (value, fallback) => {
    const n = Number(value);
    return value === undefined || value === null || value === "" || Number.isNaN(n) ? fallback : n;
  };

  // Bottle geometry (SVG viewBox 0 0 100 200)
  const BODY_TOP = 40;
  const BODY_BOTTOM = 186;
  const BODY_HEIGHT = BODY_BOTTOM - BODY_TOP;
  const BODY_PATH =
    "M18 64 Q18 40 42 40 L58 40 Q82 40 82 64 L82 177 Q82 186 73 186 L27 186 Q18 186 18 177 Z";

  const STYLE = `
    :host {
      --gbc-shell: var(--secondary-background-color, #ececec);
      --gbc-metal: var(--secondary-text-color, #727272);
      --gbc-level-color: var(--success-color, #43a047);
      display: block;
    }
    ha-card {
      height: 100%;
      box-sizing: border-box;
      padding: 16px;
      display: flex;
      flex-direction: column;
      cursor: pointer;
      outline: none;
    }
    ha-card:focus-visible {
      box-shadow: 0 0 0 2px var(--primary-color, #03a9f4);
    }
    .header {
      color: var(--primary-text-color);
      font-size: 1.1em;
      font-weight: 500;
      line-height: 1.4;
      margin-bottom: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header:empty {
      display: none;
    }
    .content {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 20px;
      min-height: 0;
    }
    svg.bottle {
      flex: none;
      width: 70px;
      height: 140px;
      color: var(--primary-text-color);
      overflow: visible;
    }
    .shell { fill: var(--gbc-shell); }
    .outline {
      fill: none;
      stroke: currentColor;
      stroke-opacity: 0.55;
      stroke-width: 2;
    }
    .collar {
      fill: none;
      stroke: var(--gbc-metal);
      stroke-width: 5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .metal { fill: var(--gbc-metal); }
    .level {
      fill: var(--gbc-level-color);
      transform-box: fill-box;
      transform-origin: 50% 100%;
      transform: scaleY(0);
      transition: transform 0.8s ease, fill 0.4s ease;
    }
    .highlight { fill: #fff; fill-opacity: 0.18; }
    .tick {
      stroke: currentColor;
      stroke-opacity: 0.35;
      stroke-width: 1.5;
    }
    .info {
      min-width: 0;
      color: var(--primary-text-color);
    }
    .percent {
      font-size: 2.2em;
      font-weight: 500;
      line-height: 1.1;
      white-space: nowrap;
    }
    .percent .unit {
      font-size: 0.55em;
      font-weight: 400;
      margin-left: 2px;
      color: var(--secondary-text-color);
    }
    .kg {
      margin-top: 6px;
      font-size: 1.25em;
      white-space: nowrap;
    }
    .capacity {
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
    .percent .message {
      display: block;
      color: var(--secondary-text-color);
      font-size: 0.5em;
      font-weight: 400;
      line-height: 1.3;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    ha-card.unavailable .percent,
    ha-card.unavailable .kg {
      color: var(--disabled-text-color, var(--secondary-text-color));
    }
    @media (prefers-reduced-motion: reduce) {
      .level { transition: none; }
    }
  `;

  class GasBottleCard extends HTMLElement {
    static getConfigElement() {
      return document.createElement(EDITOR_TYPE);
    }

    static getStubConfig(hass) {
      const states = hass?.states ?? {};
      const entity =
        Object.keys(states).find(
          (id) => id.startsWith("sensor.") && states[id].attributes?.unit_of_measurement === "%" &&
            /gas|propan|butan|flasche|bottle|tank/i.test(id)
        ) ||
        Object.keys(states).find(
          (id) => id.startsWith("sensor.") && states[id].attributes?.unit_of_measurement === "%"
        ) ||
        "";
      return { entity, capacity: DEFAULTS.capacity };
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._uid = Math.random().toString(36).slice(2, 10);
    }

    setConfig(config) {
      if (!config || typeof config !== "object") {
        throw new Error("Invalid configuration");
      }
      const capacity = toNumber(config.capacity, DEFAULTS.capacity);
      if (!(capacity > 0)) {
        throw new Error("capacity must be a number greater than 0");
      }
      this._config = {
        ...config,
        capacity,
        warning: toNumber(config.warning, DEFAULTS.warning),
        critical: toNumber(config.critical, DEFAULTS.critical),
      };
      this._build();
      this._update();
    }

    set hass(hass) {
      const prev = this._hass;
      this._hass = hass;
      const id = this._config?.entity;
      if (prev && id && prev.states[id] === hass.states[id] && language(prev) === language(hass)) {
        return;
      }
      this._update();
    }

    get hass() {
      return this._hass;
    }

    getCardSize() {
      return 4;
    }

    getGridOptions() {
      return { columns: 6, rows: 4, min_columns: 4, min_rows: 4 };
    }

    _build() {
      const clipId = `gbc-clip-${this._uid}`;
      const ticks = [0.25, 0.5, 0.75]
        .map((f) => {
          const y = BODY_BOTTOM - BODY_HEIGHT * f;
          return `<line class="tick" x1="72" x2="82" y1="${y}" y2="${y}"></line>`;
        })
        .join("");

      this.shadowRoot.innerHTML = `
        <style>${STYLE}</style>
        <ha-card tabindex="0">
          <div class="header"></div>
          <div class="content">
            <svg class="bottle" viewBox="0 0 100 200" aria-hidden="true">
              <defs>
                <clipPath id="${clipId}"><path d="${BODY_PATH}"></path></clipPath>
              </defs>
              <path class="collar" d="M27 52 V15 Q27 5 37 5 H63 Q73 5 73 15 V52"></path>
              <rect class="metal" x="44" y="30" width="12" height="12"></rect>
              <rect class="metal" x="41" y="20" width="18" height="12" rx="2"></rect>
              <rect class="metal" x="36" y="14" width="28" height="5" rx="2.5"></rect>
              <path class="shell" d="${BODY_PATH}"></path>
              <g clip-path="url(#${clipId})">
                <rect class="level" x="18" y="${BODY_TOP}" width="64" height="${BODY_HEIGHT}"></rect>
                <rect class="highlight" x="27" y="60" width="7" height="112" rx="3.5"></rect>
                ${ticks}
              </g>
              <path class="outline" d="${BODY_PATH}"></path>
              <rect class="metal" x="25" y="187" width="50" height="9" rx="2"></rect>
            </svg>
            <div class="info">
              <div class="percent"><span class="value"></span><span class="unit">%</span></div>
              <div class="kg"></div>
              <div class="capacity"></div>
            </div>
          </div>
        </ha-card>
      `;

      const card = this.shadowRoot.querySelector("ha-card");
      card.addEventListener("click", () => this._showMoreInfo());
      card.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          this._showMoreInfo();
        }
      });

      this._els = {
        card,
        header: this.shadowRoot.querySelector(".header"),
        level: this.shadowRoot.querySelector(".level"),
        percent: this.shadowRoot.querySelector(".percent"),
        value: this.shadowRoot.querySelector(".percent .value"),
        unit: this.shadowRoot.querySelector(".percent .unit"),
        kg: this.shadowRoot.querySelector(".kg"),
        capacity: this.shadowRoot.querySelector(".capacity"),
      };
    }

    _format(value, minDigits, maxDigits = minDigits) {
      try {
        return new Intl.NumberFormat(language(this._hass), {
          minimumFractionDigits: minDigits,
          maximumFractionDigits: maxDigits,
        }).format(value);
      } catch (_err) {
        return value.toFixed(maxDigits);
      }
    }

    _update() {
      if (!this._config || !this._els) return;
      const { card, header, level, value, unit, kg, capacity } = this._els;
      const cfg = this._config;
      const stateObj = cfg.entity ? this._hass?.states?.[cfg.entity] : undefined;

      header.textContent = cfg.name ?? stateObj?.attributes?.friendly_name ?? "";
      capacity.textContent = `${t(this._hass, "of")} ${this._format(cfg.capacity, 0, 1)} kg`;

      const raw = stateObj ? parseFloat(stateObj.state) : NaN;
      if (!cfg.entity || !stateObj || Number.isNaN(raw)) {
        card.classList.add("unavailable");
        level.style.transform = "scaleY(0)";
        unit.style.display = "none";
        value.className = "value message";
        value.textContent = !cfg.entity
          ? t(this._hass, "no_entity")
          : !stateObj
            ? `${t(this._hass, "not_found")}: ${cfg.entity}`
            : t(this._hass, "unavailable");
        kg.textContent = "– kg";
        card.setAttribute("aria-label", `${header.textContent}: ${value.textContent}`);
        return;
      }

      const pct = Math.min(100, Math.max(0, raw));
      const remaining = (pct / 100) * cfg.capacity;
      const color =
        pct <= cfg.critical
          ? "var(--error-color, #db4437)"
          : pct <= cfg.warning
            ? "var(--warning-color, #ffa600)"
            : "var(--success-color, #43a047)";

      card.classList.remove("unavailable");
      this.style.setProperty("--gbc-level-color", color);
      level.style.transform = `scaleY(${pct / 100})`;
      unit.style.display = "";
      value.className = "value";
      value.textContent = this._format(pct, 0);
      kg.textContent = `${this._format(remaining, 1)} kg`;
      card.setAttribute(
        "aria-label",
        `${header.textContent}: ${value.textContent} %, ${kg.textContent} ${capacity.textContent}`
      );
    }

    _showMoreInfo() {
      if (!this._config?.entity) return;
      const ev = new Event("hass-more-info", { bubbles: true, composed: true });
      ev.detail = { entityId: this._config.entity };
      this.dispatchEvent(ev);
    }
  }

  const editorSchema = [
    {
      name: "entity",
      required: true,
      selector: { entity: { filter: { domain: ["sensor", "input_number", "number"] } } },
    },
    { name: "name", selector: { text: {} } },
    {
      name: "capacity",
      required: true,
      selector: { number: { min: 0.1, max: 1000, step: 0.1, mode: "box", unit_of_measurement: "kg" } },
    },
    {
      type: "grid",
      name: "",
      schema: [
        {
          name: "warning",
          selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } },
        },
        {
          name: "critical",
          selector: { number: { min: 0, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } },
        },
      ],
    },
  ];

  class GasBottleCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = { ...config };
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    async connectedCallback() {
      // ha-form is lazy-loaded by Home Assistant; loading a built-in card
      // editor makes sure it is registered.
      if (!customElements.get("ha-form")) {
        try {
          await customElements.get("hui-entities-card")?.getConfigElement?.();
        } catch (_err) {
          // ignore – ha-form is usually available anyway
        }
      }
      this._render();
    }

    _render() {
      if (!this._config || !this._hass) return;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (schema) => t(this._hass, schema.name);
        this._form.addEventListener("value-changed", (ev) => {
          ev.stopPropagation();
          const config = { ...this._config, ...ev.detail.value };
          if (!config.name) delete config.name;
          this._config = config;
          this.dispatchEvent(
            new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true })
          );
        });
        this.appendChild(this._form);
      }
      this._form.hass = this._hass;
      this._form.schema = editorSchema;
      this._form.data = { ...DEFAULTS, ...this._config };
    }
  }

  if (!customElements.get(CARD_TYPE)) {
    customElements.define(CARD_TYPE, GasBottleCard);
  }
  if (!customElements.get(EDITOR_TYPE)) {
    customElements.define(EDITOR_TYPE, GasBottleCardEditor);
  }

  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === CARD_TYPE)) {
    window.customCards.push({
      type: CARD_TYPE,
      name: "Gas Bottle Card",
      description: t(document.querySelector("home-assistant")?.hass, "description"),
      preview: true,
      documentationURL: "https://github.com/abcklaus/gas-bottle-card",
    });
  }

  console.info(
    `%c GAS-BOTTLE-CARD %c v${CARD_VERSION} `,
    "color: white; background: #555; font-weight: 700;",
    "color: #555; background: #eee; font-weight: 700;"
  );
})();
