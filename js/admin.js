/**
 * admin.js
 * Logika administrace: přihlášení, editace obsahu/vzhledu, upload obrázků,
 * živý náhled přes iframe (postMessage) a ukládání do GitHub (přes /api/save).
 */
(function () {
  "use strict";

  /* ==================== Stav aplikace ==================== */

  let state = { content: null, theme: null };
  let isDirty = false;

  /* ==================== Obecné pomocné funkce ==================== */

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* prázdná odpověď */
    }
    if (!res.ok) {
      const err = new Error(data.error || `Chyba požadavku (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function apiGet(url) {
    const res = await fetch(url, { credentials: "same-origin" });
    return res.json();
  }

  function markDirty() {
    isDirty = true;
    setSaveStatus("Neuložené změny", "");
  }

  function setSaveStatus(text, kind) {
    const node = document.getElementById("save-status");
    node.textContent = text;
    node.className = "save-status" + (kind ? " is-" + kind : "");
  }

  /* ==================== Živý náhled ====================
     Odstraněno - admin už neobsahuje iframe s náhledem webu. Tahle funkce
     zůstává jako neškodný no-op, aby nebylo nutné mazat desítky volání
     rozesetých po celém souboru (markDirty + sendPreviewUpdate se dosud
     volají společně u každé změny pole). */

  function sendPreviewUpdate() {}

  /* ==================== Stavební prvky formulářů ==================== */

  function fieldWrap(labelText) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    if (labelText) {
      const label = document.createElement("label");
      label.textContent = labelText;
      wrap.appendChild(label);
    }
    return wrap;
  }

  function textField(labelText, value, onChange, opts = {}) {
    const wrap = fieldWrap(labelText);
    const input = document.createElement(opts.textarea ? "textarea" : "input");
    if (!opts.textarea) input.type = "text";
    else input.rows = opts.rows || 3;
    input.value = value || "";
    input.maxLength = opts.maxlength || 300;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.addEventListener("input", () => {
      onChange(input.value);
      markDirty();
      sendPreviewUpdate();
    });
    wrap.appendChild(input);
    return wrap;
  }

  function colorField(labelText, value, onChange) {
    const wrap = fieldWrap(labelText);
    const row = document.createElement("div");
    row.className = "color-field";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = value || "";
    textInput.maxLength = 20;

    const sync = (val) => {
      onChange(val);
      markDirty();
      sendPreviewUpdate();
    };

    colorInput.addEventListener("input", () => {
      textInput.value = colorInput.value;
      sync(colorInput.value);
    });
    textInput.addEventListener("input", () => {
      if (/^#[0-9a-f]{6}$/i.test(textInput.value)) colorInput.value = textInput.value;
      sync(textInput.value);
    });

    row.appendChild(colorInput);
    row.appendChild(textInput);
    wrap.appendChild(row);
    return wrap;
  }

  function imageField(labelText, currentSrc, onUploaded) {
    const wrap = fieldWrap(labelText);
    const row = document.createElement("div");
    row.className = "image-field";

    const preview = document.createElement("div");
    preview.className = "image-preview";
    updatePreviewThumb(preview, currentSrc);

    const actions = document.createElement("div");
    actions.className = "image-field-actions";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp";
    fileInput.style.display = "none";

    const uploadBtn = document.createElement("button");
    uploadBtn.type = "button";
    uploadBtn.className = "btn btn-ghost btn-sm";
    uploadBtn.textContent = "Nahrát fotografii";

    const progress = document.createElement("div");
    progress.className = "upload-progress";

    uploadBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      uploadBtn.disabled = true;
      progress.textContent = "Zpracovávám a nahrávám…";
      try {
        const processed = await ImageEditor.processImageFile(file);
        const result = await apiPost("/api/upload-image", {
          mimeType: processed.mimeType,
          base64: processed.base64
        });
        onUploaded(result.path);
        updatePreviewThumb(preview, result.path);
        progress.textContent = "Nahráno ✓";
        markDirty();
        sendPreviewUpdate();
        setTimeout(() => (progress.textContent = ""), 2500);
      } catch (err) {
        progress.textContent = "Chyba: " + err.message;
      } finally {
        uploadBtn.disabled = false;
        fileInput.value = "";
      }
    });

    actions.appendChild(uploadBtn);
    actions.appendChild(progress);
    row.appendChild(preview);
    row.appendChild(actions);
    wrap.appendChild(row);
    return wrap;
  }

  function updatePreviewThumb(node, src) {
    if (src) {
      node.style.backgroundImage = `url("${src}")`;
      node.textContent = "";
    } else {
      node.style.backgroundImage = "none";
      node.textContent = "Bez fotky";
    }
  }

  function fieldsCard() {
    const card = document.createElement("div");
    card.className = "section-card";
    return card;
  }

  function smallBtn(label, onClick, danger) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm " + (danger ? "btn-danger" : "btn-ghost");
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  /* ==================== Jednotlivé sekce obsahu ==================== */

  function renderMetaSection() {
    const c = state.content;
    const block = fieldsCard();
    block.appendChild(
      textField("Titulek stránky (title)", c.meta.title, (v) => (c.meta.title = v))
    );
    block.appendChild(
      textField("Meta popis (description)", c.meta.description, (v) => (c.meta.description = v), {
        textarea: true
      })
    );
    return block;
  }

  function renderHeaderSection() {
    const header = state.content.header;
    const block = fieldsCard();
    block.appendChild(textField("Název firmy v hlavičce", header.logoText, (v) => (header.logoText = v)));
    block.appendChild(textField("Podtitulek v hlavičce", header.logoSub, (v) => (header.logoSub = v)));
    block.appendChild(
      textField("Text tlačítka poptávky (hlavička)", header.ctaLabel, (v) => (header.ctaLabel = v))
    );
    return block;
  }

  function renderHeroSection() {
    const h = state.content.hero;
    const block = fieldsCard();

    block.appendChild(textField("Hlavní titulek — 1. řádek", h.titleLine1, (v) => (h.titleLine1 = v)));
    block.appendChild(
      textField("Hlavní titulek — 2. řádek (zvýrazněný)", h.titleLine2, (v) => (h.titleLine2 = v))
    );
    block.appendChild(textField("Podtext", h.text, (v) => (h.text = v), { textarea: true }));

    const row = document.createElement("div");
    row.className = "field-row";
    row.appendChild(
      textField("Tlačítko 1 (primární)", h.ctaPrimary.label, (v) => (h.ctaPrimary.label = v))
    );
    row.appendChild(
      textField("Tlačítko 2 (výchozí)", h.ctaSecondary.label, (v) => (h.ctaSecondary.label = v))
    );
    block.appendChild(row);

    block.appendChild(textField("Štítek na fotce (např. EST. 2007)", h.scaleLabel, (v) => (h.scaleLabel = v)));

    block.appendChild(
      imageField("Hlavní fotografie (hero)", h.image.src, (path) => (h.image.src = path))
    );
    block.appendChild(
      textField("Popisek fotografie (alt text)", h.image.alt, (v) => (h.image.alt = v))
    );

    return block;
  }

  function renderAboutSection() {
    const a = state.content.about;
    const block = fieldsCard();

    block.appendChild(textField("Nadpis nad titulkem", a.eyebrow, (v) => (a.eyebrow = v)));
    block.appendChild(textField("Titulek", a.title, (v) => (a.title = v)));
    block.appendChild(textField("Text", a.text, (v) => (a.text = v), { textarea: true, rows: 4 }));

    block.appendChild(imageField("Fotografie", a.image.src, (path) => (a.image.src = path)));
    block.appendChild(textField("Popisek fotografie (alt text)", a.image.alt, (v) => (a.image.alt = v)));

    const statsHead = document.createElement("div");
    statsHead.className = "hint";
    statsHead.textContent = "Statistiky (3 čísla pod textem)";
    block.appendChild(statsHead);

    a.stats.forEach((stat, i) => {
      const row = document.createElement("div");
      row.className = "field-row";
      row.style.marginTop = "0.6rem";
      row.appendChild(textField(`Hodnota #${i + 1}`, stat.value, (v) => (stat.value = v)));
      row.appendChild(textField(`Jednotka #${i + 1}`, stat.unit, (v) => (stat.unit = v)));
      block.appendChild(row);
      block.appendChild(textField(`Popisek #${i + 1}`, stat.label, (v) => (stat.label = v)));
    });

    return block;
  }

  const SERVICE_ICONS = [
    { value: "roofFrame", label: "Krov / konstrukce" },
    { value: "roofTiles", label: "Střešní krytina" },
    { value: "woodPlank", label: "Dřevěné prvky" },
    { value: "church", label: "Historická stavba" }
  ];

  function renderServicesSection() {
    const s = state.content.services;
    const block = fieldsCard();

    block.appendChild(textField("Nadpis nad titulkem", s.eyebrow, (v) => (s.eyebrow = v)));
    block.appendChild(textField("Titulek sekce", s.title, (v) => (s.title = v)));

    s.items.forEach((service, index) => {
      const item = document.createElement("div");
      item.className = "list-item";

      const head = document.createElement("div");
      head.className = "list-item-head";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Karta " + (index + 1);
      head.appendChild(tag);
      head.appendChild(
        smallBtn("Odebrat kartu", () => {
          s.items.splice(index, 1);
          markDirty();
          renderActiveSection();
          sendPreviewUpdate();
        }, true)
      );
      item.appendChild(head);

      const iconSelect = fieldWrap("Ikona");
      const select = document.createElement("select");
      SERVICE_ICONS.forEach((opt) => {
        const optionEl = document.createElement("option");
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        if (service.icon === opt.value) optionEl.selected = true;
        select.appendChild(optionEl);
      });
      select.addEventListener("change", () => {
        service.icon = select.value;
        markDirty();
        sendPreviewUpdate();
      });
      iconSelect.appendChild(select);
      item.appendChild(iconSelect);

      item.appendChild(textField("Název karty", service.title, (v) => (service.title = v)));

      const linesLabel = document.createElement("div");
      linesLabel.className = "hint";
      linesLabel.textContent = "Položky v kartě";
      item.appendChild(linesLabel);

      service.items.forEach((line, lineIndex) => {
        const row = document.createElement("div");
        row.className = "subitem-row";
        const input = document.createElement("input");
        input.type = "text";
        input.value = line;
        input.addEventListener("input", () => {
          service.items[lineIndex] = input.value;
          markDirty();
          sendPreviewUpdate();
        });
        row.appendChild(input);
        row.appendChild(
          smallBtn("✕", () => {
            service.items.splice(lineIndex, 1);
            markDirty();
            renderActiveSection();
            sendPreviewUpdate();
          }, true)
        );
        item.appendChild(row);
      });

      item.appendChild(
        smallBtn("+ Přidat položku", () => {
          service.items.push("Nová položka");
          markDirty();
          renderActiveSection();
          sendPreviewUpdate();
        })
      );

      block.appendChild(item);
    });

    block.appendChild(
      smallBtn("+ Přidat kartu služby", () => {
        s.items.push({ icon: "woodPlank", title: "Nová služba", items: ["Položka"] });
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      })
    );

    return block;
  }

  function renderGallerySection() {
    const g = state.content.gallery;
    const block = fieldsCard();

    block.appendChild(textField("Nadpis nad titulkem", g.eyebrow, (v) => (g.eyebrow = v)));
    block.appendChild(textField("Titulek sekce", g.title, (v) => (g.title = v)));

    g.items.forEach((item, index) => {
      const wrap = document.createElement("div");
      wrap.className = "list-item";

      const head = document.createElement("div");
      head.className = "list-item-head";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Fotografie " + (index + 1);
      head.appendChild(tag);
      head.appendChild(
        smallBtn("Odebrat", () => {
          g.items.splice(index, 1);
          markDirty();
          renderActiveSection();
          sendPreviewUpdate();
        }, true)
      );
      wrap.appendChild(head);

      wrap.appendChild(imageField("Fotografie", item.image, (path) => (item.image = path)));
      wrap.appendChild(textField("Název realizace", item.title, (v) => (item.title = v)));
      wrap.appendChild(
        textField("Krátký popis", item.description, (v) => (item.description = v))
      );

      block.appendChild(wrap);
    });

    block.appendChild(
      smallBtn("+ Přidat fotografii", () => {
        g.items.push({ image: "", title: "Nová realizace", description: "Popis realizace" });
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      })
    );

    return block;
  }

  function renderScaffoldingSection() {
    const sc = state.content.scaffolding;
    const block = fieldsCard();
    block.appendChild(textField("Titulek", sc.title, (v) => (sc.title = v)));
    block.appendChild(textField("Text", sc.text, (v) => (sc.text = v), { textarea: true }));
    block.appendChild(textField("Text tlačítka", sc.ctaLabel, (v) => (sc.ctaLabel = v)));
    return block;
  }

  function renderContactSection() {
    const c = state.content.contact;
    const block = fieldsCard();

    block.appendChild(textField("Nadpis nad titulkem", c.eyebrow, (v) => (c.eyebrow = v)));
    block.appendChild(textField("Titulek sekce", c.title, (v) => (c.title = v)));
    block.appendChild(textField("Text", c.text, (v) => (c.text = v), { textarea: true }));
    block.appendChild(textField("Text tlačítka", c.ctaLabel, (v) => (c.ctaLabel = v)));

    c.persons.forEach((person, index) => {
      const wrap = document.createElement("div");
      wrap.className = "list-item";

      const head = document.createElement("div");
      head.className = "list-item-head";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Kontakt " + (index + 1);
      head.appendChild(tag);
      head.appendChild(
        smallBtn("Odebrat", () => {
          c.persons.splice(index, 1);
          markDirty();
          renderActiveSection();
          sendPreviewUpdate();
        }, true)
      );
      wrap.appendChild(head);

      wrap.appendChild(textField("Jméno", person.name, (v) => (person.name = v)));
      wrap.appendChild(textField("Adresa", person.address, (v) => (person.address = v)));
      const row = document.createElement("div");
      row.className = "field-row";
      row.appendChild(textField("IČ", person.ic, (v) => (person.ic = v)));
      row.appendChild(textField("Telefon", person.phone, (v) => (person.phone = v)));
      wrap.appendChild(row);

      block.appendChild(wrap);
    });

    block.appendChild(
      smallBtn("+ Přidat kontaktní osobu", () => {
        c.persons.push({ name: "Jméno Příjmení", address: "", ic: "", phone: "" });
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      })
    );

    return block;
  }

  function renderFooterSection() {
    const f = state.content.footer;
    const block = fieldsCard();
    block.appendChild(textField("Text v patičce", f.text, (v) => (f.text = v)));
    block.appendChild(textField("Copyright řádek", f.copyright, (v) => (f.copyright = v)));
    return block;
  }

  function renderCookieSection() {
    const cc = state.content.cookieConsent;
    const block = fieldsCard();
    block.appendChild(textField("Text lišty", cc.text, (v) => (cc.text = v), { textarea: true }));
    block.appendChild(textField("Text tlačítka", cc.acceptLabel, (v) => (cc.acceptLabel = v)));
    return block;
  }

  function renderLegalSection() {
    const l = state.content.legal;
    const block = fieldsCard();

    block.appendChild(textField("Titulek stránky", l.pageTitle, (v) => (l.pageTitle = v)));
    block.appendChild(
      textField("Naposledy aktualizováno", l.lastUpdated, (v) => (l.lastUpdated = v), {
        placeholder: "např. srpen 2026"
      })
    );
    block.appendChild(
      textField("Úvodní text", l.intro, (v) => (l.intro = v), { textarea: true, rows: 4, maxlength: 600 })
    );

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Jednotlivé právní odstavce (nadpis + text)";
    block.appendChild(hint);

    l.sections.forEach((item, index) => {
      const wrap = document.createElement("div");
      wrap.className = "list-item";

      const head = document.createElement("div");
      head.className = "list-item-head";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Odstavec " + (index + 1);
      head.appendChild(tag);
      head.appendChild(
        smallBtn(
          "Odebrat",
          () => {
            l.sections.splice(index, 1);
            markDirty();
            renderActiveSection();
            sendPreviewUpdate();
          },
          true
        )
      );
      wrap.appendChild(head);

      wrap.appendChild(textField("Nadpis", item.heading, (v) => (item.heading = v)));
      wrap.appendChild(
        textField("Text", item.text, (v) => (item.text = v), { textarea: true, rows: 3, maxlength: 1000 })
      );

      block.appendChild(wrap);
    });

    block.appendChild(
      smallBtn("+ Přidat odstavec", () => {
        l.sections.push({ heading: "Nový nadpis", text: "Text odstavce." });
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      })
    );

    block.appendChild(
      textField("Kontaktní poznámka na konci stránky", l.contactNote, (v) => (l.contactNote = v), {
        textarea: true
      })
    );

    return block;
  }

  /* ==================== Sekce: Vzhled ==================== */

  const COLOR_LABELS = {
    primary: "Primární (tmavé dřevo)",
    secondary: "Sekundární",
    background: "Pozadí",
    backgroundAlt: "Pozadí — alternativní pás",
    accent: "Akcent (teplá dřevěná barva)",
    accentLight: "Akcent — světlejší (hover)",
    textMuted: "Text — tlumený",
    border: "Barva linek / ohraničení",
    white: "Bílá"
  };

  function renderThemeSection() {
    const block = fieldsCard();
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.style.marginBottom = "1rem";
    hint.textContent = "Změny barev se ihned promítnou do náhledu vpravo.";
    block.appendChild(hint);

    Object.keys(state.theme.colors).forEach((key) => {
      block.appendChild(
        colorField(COLOR_LABELS[key] || key, state.theme.colors[key], (v) => {
          state.theme.colors[key] = v;
        })
      );
    });

    return block;
  }

  /* ==================== Postranní navigace sekcí ==================== */

  const SECTIONS = [
    {
      id: "hero",
      group: "Textový obsah",
      label: "Hero",
      description: "Úvodní sekce webu s hlavním nadpisem, podtextem, tlačítky a hlavní fotografií.",
      anchor: null,
      render: renderHeroSection
    },
    {
      id: "about",
      group: "Textový obsah",
      label: "O firmě",
      description: "Sekce O firmě s textem, fotografií a třemi statistikami pod textem.",
      anchor: "o-nas",
      render: renderAboutSection
    },
    {
      id: "services",
      group: "Textový obsah",
      label: "Služby",
      description: "Karty nabízených služeb - u každé ikona, název a seznam položek.",
      anchor: "sluzby",
      render: renderServicesSection
    },
    {
      id: "gallery",
      group: "Textový obsah",
      label: "Realizace",
      description: "Galerie fotografií dokončených realizací s názvem a krátkým popisem u každé.",
      anchor: "realizace",
      render: renderGallerySection
    },
    {
      id: "scaffolding",
      group: "Textový obsah",
      label: "Lešení",
      description: "Krátká samostatná sekce s nabídkou pronájmu lešení.",
      anchor: "leseni",
      render: renderScaffoldingSection
    },
    {
      id: "contact",
      group: "Textový obsah",
      label: "Kontakt",
      description: "Kontaktní údaje - jméno, adresa, IČ a telefon u každé kontaktní osoby.",
      anchor: "kontakt",
      render: renderContactSection
    },
    {
      id: "theme",
      group: "Vzhled",
      label: "Barvy",
      description: "Barevná paleta webu - změny se projeví po uložení a redeployi.",
      anchor: null,
      render: renderThemeSection
    },
    {
      id: "header",
      group: "Pokročilé nastavení",
      label: "Hlavička",
      description: "Název firmy, podtitulek a text tlačítka poptávky v horní navigaci webu.",
      anchor: null,
      render: renderHeaderSection
    },
    {
      id: "footer",
      group: "Pokročilé nastavení",
      label: "Patička",
      description: "Text a copyright řádek v patičce webu.",
      anchor: null,
      render: renderFooterSection
    },
    {
      id: "seo",
      group: "Pokročilé nastavení",
      label: "SEO a metadata",
      description: "Titulek stránky a popis, který se zobrazuje ve výsledcích vyhledávání a při sdílení na sítích.",
      anchor: null,
      render: renderMetaSection
    },
    {
      id: "cookie",
      group: "Pokročilé nastavení",
      subgroup: "Právní",
      label: "Cookie lišta",
      description: "Legislativní text a tlačítko cookie lišty, která se zobrazí novým návštěvníkům webu.",
      anchor: null,
      render: renderCookieSection
    },
    {
      id: "legal",
      group: "Pokročilé nastavení",
      subgroup: "Právní",
      label: "GDPR",
      description: "Text stránky Ochrana osobních údajů - kdo zpracovává data, za jakým účelem a jaká máte práva.",
      previewUrl: "ochrana-udaju.html",
      render: renderLegalSection
    }
  ];

  let activeSectionId = SECTIONS[0].id;

  function renderSidebar() {
    const nav = document.getElementById("section-nav");
    nav.innerHTML = "";
    let lastGroup = null;
    let lastSubgroup = null;
    SECTIONS.forEach((s) => {
      if (s.group !== lastGroup) {
        const label = document.createElement("div");
        label.className = "nav-group-label";
        label.textContent = s.group;
        nav.appendChild(label);
        lastGroup = s.group;
        lastSubgroup = null;
      }
      if (s.subgroup && s.subgroup !== lastSubgroup) {
        const subLabel = document.createElement("div");
        subLabel.className = "nav-subgroup-label";
        subLabel.textContent = s.subgroup;
        nav.appendChild(subLabel);
        lastSubgroup = s.subgroup;
      } else if (!s.subgroup) {
        lastSubgroup = null;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "nav-item" +
        (s.subgroup ? " nav-item-nested" : "") +
        (s.id === activeSectionId ? " is-active" : "");
      btn.textContent = s.label;
      btn.addEventListener("click", () => selectSection(s.id));
      nav.appendChild(btn);
    });
  }

  function selectSection(id) {
    activeSectionId = id;
    renderSidebar();
    renderActiveSection();
  }

  function renderActiveSection() {
    const section = SECTIONS.find((s) => s.id === activeSectionId);
    if (!section) return;

    document.getElementById("section-title").textContent = section.label;

    const previewLink = document.getElementById("preview-link");
    previewLink.href =
      section.previewUrl || "index.html" + (section.anchor ? "#" + section.anchor : "");

    const root = document.getElementById("editor-pane");
    root.innerHTML = "";

    const desc = document.createElement("p");
    desc.className = "section-description";
    desc.textContent = section.description;
    root.appendChild(desc);

    root.appendChild(section.render());
    root.scrollTop = 0;
  }

  /* ==================== Ukládání ==================== */

  async function saveAll() {
    const saveBtn = document.getElementById("save-btn");
    saveBtn.disabled = true;
    setSaveStatus("Ukládám…", "");
    try {
      await apiPost("/api/save", { file: "content", data: state.content });
      await apiPost("/api/save", { file: "theme", data: state.theme });
      isDirty = false;
      setSaveStatus("Uloženo ✓ (nasazení může trvat ~1 minutu)", "success");
    } catch (err) {
      setSaveStatus("Chyba: " + err.message, "error");
    } finally {
      saveBtn.disabled = false;
    }
  }

  /* ==================== Přihlášení ==================== */

  async function loadContentAndTheme() {
    const [content, theme] = await Promise.all([
      fetch("data/content.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("data/theme.json", { cache: "no-store" }).then((r) => r.json())
    ]);
    state.content = clone(content);
    state.theme = clone(theme);
  }

  function showApp() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app").classList.add("is-active");
  }

  function showLogin() {
    document.getElementById("app").classList.remove("is-active");
    document.getElementById("login-screen").style.display = "flex";
  }

  async function bootApp() {
    await loadContentAndTheme();
    renderSidebar();
    renderActiveSection();
    showApp();
  }

  function initPasswordToggle() {
    const toggle = document.getElementById("password-toggle");
    const input = document.getElementById("login-password");
    if (!toggle || !input) return;

    toggle.addEventListener("click", () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.classList.toggle("is-visible", !showing);
      toggle.setAttribute("aria-pressed", String(!showing));
      toggle.setAttribute("aria-label", showing ? "Zobrazit heslo" : "Skrýt heslo");
      input.focus();
    });
  }

  function initLoginForm() {
    const form = document.getElementById("login-form");
    const errorBox = document.getElementById("login-error");
    const submitBtn = document.getElementById("login-submit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.classList.remove("is-visible");
      submitBtn.disabled = true;
      submitBtn.textContent = "Přihlašuji…";

      const password = document.getElementById("login-password").value;
      try {
        await apiPost("/api/login", { password });
        document.getElementById("login-password").value = "";
        await bootApp();
      } catch (err) {
        errorBox.textContent = err.message || "Přihlášení se nezdařilo.";
        errorBox.classList.add("is-visible");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Přihlásit se";
      }
    });
  }

  function initLogout() {
    document.getElementById("logout-btn").addEventListener("click", async () => {
      if (isDirty && !confirm("Máte neuložené změny. Opravdu se chcete odhlásit?")) return;
      try {
        await apiPost("/api/logout");
      } catch {
        /* i při chybě uživatele odhlásíme lokálně */
      }
      showLogin();
    });
  }

  function initSaveButton() {
    document.getElementById("save-btn").addEventListener("click", saveAll);
  }

  window.addEventListener("beforeunload", (e) => {
    if (!isDirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  async function init() {
    initLoginForm();
    initPasswordToggle();
    initLogout();
    initSaveButton();

    // Vždy se ukáže přihlašovací obrazovka, i když by ještě platila
    // předchozí session cookie - po každém novém načtení stránky (F5,
    // zavření a znovu otevření) je potřeba heslo zadat znovu.
    showLogin();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
