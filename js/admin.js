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

  async function apiPost(url, body, opts = {}) {
    const maxAttempts = (opts.retries || 0) + 1;
    let lastErr;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
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
      } catch (err) {
        lastErr = err;
        // Opakujeme jen dočasné chyby (výpadek sítě = žádný status, 429 rate
        // limit, 5xx server) - NIKDY přihlašovací/validační chyby (4xx),
        // ty by opakování stejně nevyřešilo.
        const isRetryable = err.status === undefined || err.status === 429 || err.status >= 500;
        if (attempt < maxAttempts && isRetryable) {
          await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
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

  function autoGrow(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }

  function textField(labelText, value, onChange, opts = {}) {
    const wrap = fieldWrap(labelText);
    const input = document.createElement(opts.textarea ? "textarea" : "input");
    if (!opts.textarea) {
      input.type = "text";
    } else {
      input.rows = opts.rows || 3;
      input.style.overflow = "hidden";
      input.style.resize = "none";
    }
    input.value = value || "";
    if (opts.maxlength) input.maxLength = opts.maxlength;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.addEventListener("input", () => {
      onChange(input.value);
      markDirty();
      sendPreviewUpdate();
      if (opts.textarea) autoGrow(input);
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

  function imageField(labelText, currentSrc, onUploaded, opts = {}) {
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
    fileInput.accept = opts.allowPdf
      ? "image/jpeg,image/png,image/webp,application/pdf"
      : "image/jpeg,image/png,image/webp";
    fileInput.style.display = "none";

    const uploadBtn = document.createElement("button");
    uploadBtn.type = "button";
    uploadBtn.className = "btn btn-ghost btn-sm";
    uploadBtn.textContent = opts.allowPdf ? "Nahrát fotografii nebo PDF" : "Nahrát fotografii";

    const progress = document.createElement("div");
    progress.className = "upload-progress";

    uploadBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      uploadBtn.disabled = true;
      progress.textContent = file.type === "application/pdf" ? "Čtu PDF a dělám náhled…" : "Zpracovávám a nahrávám…";
      try {
        const processed = await ImageEditor.processFile(file, { allowPdf: opts.allowPdf });
        const result = await apiPost(
          "/api/upload-image",
          { mimeType: processed.mimeType, base64: processed.base64 },
          { retries: 2 }
        );
        if (processed.previewUrl) localPreviewUrls.set(result.path, processed.previewUrl);
        onUploaded(result.path);
        updatePreviewThumb(preview, result.path);

        if (processed.isPdf && processed.pdfBase64 && opts.onPdfUploaded) {
          progress.textContent = "Nahrávám originál PDF…";
          const pdfResult = await apiPost(
            "/api/upload-image",
            { mimeType: processed.pdfMimeType, base64: processed.pdfBase64 },
            { retries: 2 }
          );
          opts.onPdfUploaded(pdfResult.path);
        }

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

  // Cesta na serveru -> lokální (blob) adresa nahrané fotky v TÉTO session.
  // Živá URL adresa (images/uploads/...) se stane skutečně dostupnou až po
  // dokončení nasazení nové verze webu (~1 minuta) - do té doby admin
  // zobrazuje náhled přímo z fotky v prohlížeči, aby nebyl prázdný.
  const localPreviewUrls = new Map();

  function updatePreviewThumb(node, src) {
    const isPdf = !!src && /\.pdf($|\?)/i.test(src);
    node.classList.toggle("is-pdf", isPdf);

    if (isPdf) {
      node.style.backgroundImage = "none";
      node.textContent = "PDF";
      return;
    }
    if (src) {
      const localUrl = localPreviewUrls.get(src);
      node.style.backgroundImage = `url("${localUrl || src}")`;
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

  const TRASH_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/><path d="M10 11v6M14 11v6"/></svg>';
  const PLUS_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';

  function smallBtn(label, onClick, danger) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm " + (danger ? "btn-danger" : "btn-ghost");
    const isAdd = label.trim().startsWith("+");
    const cleanLabel = isAdd ? label.replace(/^\+\s*/, "") : label;
    btn.innerHTML = (danger ? TRASH_ICON : isAdd ? PLUS_ICON : "") + `<span>${cleanLabel}</span>`;
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

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.style.marginBottom = "1rem";
    hint.textContent =
      "Logo v hlavičce je teď pevný obrázek (images/logo.png), nemění se textem. " +
      "Pro výměnu loga pošlete nový soubor napřímo.";
    block.appendChild(hint);

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

    const typeWrap = fieldWrap("Typ hlavního média");
    const typeSelect = document.createElement("select");
    [
      { value: "image", label: "Fotografie" },
      { value: "video", label: "Video (přes URL odkaz)" }
    ].forEach((opt) => {
      const optionEl = document.createElement("option");
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      if (h.media.type === opt.value) optionEl.selected = true;
      typeSelect.appendChild(optionEl);
    });
    typeSelect.addEventListener("change", () => {
      h.media.type = typeSelect.value;
      markDirty();
      renderActiveSection();
      sendPreviewUpdate();
    });
    typeWrap.appendChild(typeSelect);
    block.appendChild(typeWrap);

    if (h.media.type === "video") {
      block.appendChild(
        textField("URL adresa videa (přímý odkaz na .mp4)", h.media.src, (v) => (h.media.src = v), {
          placeholder: "https://..."
        })
      );
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.style.marginBottom = "1rem";
      hint.textContent =
        "Video se přes administraci nenahrává jako soubor (videa jsou příliš velká pro přímý upload) - " +
        "nahrajte ho nejdřív někam jinam (např. vlastní úložiště nebo videoplatformu s přímým odkazem na .mp4) " +
        "a sem vložte jen odkaz. Video se přehrává potichu, automaticky a ve smyčce.";
      block.appendChild(hint);
    } else {
      block.appendChild(
        imageField("Hlavní fotografie (hero)", h.media.src, (path) => (h.media.src = path))
      );
    }

    block.appendChild(textField("Popisek (alt text)", h.media.alt, (v) => (h.media.alt = v)));

    return block;
  }

  function renderAboutSection() {
    const a = state.content.about;
    const block = fieldsCard();

    block.appendChild(textField("Nadpis nad titulkem", a.eyebrow, (v) => (a.eyebrow = v)));
    block.appendChild(textField("Titulek", a.title, (v) => (a.title = v)));
    block.appendChild(textField("Text", a.text, (v) => (a.text = v), { textarea: true, rows: 4 }));

    if (!a.media) a.media = { type: "image", src: "", alt: "" };

    const typeWrap = fieldWrap("Typ média");
    const typeSelect = document.createElement("select");
    [
      { value: "image", label: "Fotografie" },
      { value: "video", label: "Video (přes URL odkaz)" }
    ].forEach((opt) => {
      const optionEl = document.createElement("option");
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      if (a.media.type === opt.value) optionEl.selected = true;
      typeSelect.appendChild(optionEl);
    });
    typeSelect.addEventListener("change", () => {
      a.media.type = typeSelect.value;
      markDirty();
      renderActiveSection();
      sendPreviewUpdate();
    });
    typeWrap.appendChild(typeSelect);
    block.appendChild(typeWrap);

    if (a.media.type === "video") {
      block.appendChild(
        textField("URL adresa videa (přímý odkaz na .mp4)", a.media.src, (v) => (a.media.src = v), {
          placeholder: "https://..."
        })
      );
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent =
        "Video se přes administraci nenahrává jako soubor (videa jsou příliš velká pro přímý upload) - " +
        "nahrajte ho nejdřív někam jinam (např. vlastní úložiště nebo videoplatformu s přímým odkazem na .mp4) " +
        "a sem vložte jen odkaz. Video se přehrává potichu, automaticky a ve smyčce.";
      block.appendChild(hint);
    } else {
      block.appendChild(
        imageField("Fotografie", a.media.src, (path) => (a.media.src = path))
      );
    }

    block.appendChild(textField("Popisek (alt text)", a.media.alt, (v) => (a.media.alt = v)));

    return block;
  }

  function renderServicesSection() {
    const s = state.content.services;
    const block = fieldsCard();

    block.appendChild(textField("Nadpis nad titulkem", s.eyebrow, (v) => (s.eyebrow = v)));
    block.appendChild(textField("Titulek sekce", s.title, (v) => (s.title = v)));

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Jednoduchý seznam služeb (jeden sloupec na webu) - šipkami jde přeskládat pořadí.";
    block.appendChild(hint);

    s.items.forEach((service, index) => {
      const row = document.createElement("div");
      row.className = "list-item";

      const head = document.createElement("div");
      head.className = "list-item-head";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Položka " + (index + 1);
      head.appendChild(tag);

      const headActions = document.createElement("div");
      headActions.className = "list-item-head-actions";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "reorder-btn";
      upBtn.setAttribute("aria-label", "Posunout výš");
      upBtn.textContent = "↑";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", () => {
        [s.items[index - 1], s.items[index]] = [s.items[index], s.items[index - 1]];
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      });
      headActions.appendChild(upBtn);

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "reorder-btn";
      downBtn.setAttribute("aria-label", "Posunout níž");
      downBtn.textContent = "↓";
      downBtn.disabled = index === s.items.length - 1;
      downBtn.addEventListener("click", () => {
        [s.items[index], s.items[index + 1]] = [s.items[index + 1], s.items[index]];
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      });
      headActions.appendChild(downBtn);

      headActions.appendChild(
        smallBtn(
          "Odebrat",
          () => {
            s.items.splice(index, 1);
            markDirty();
            renderActiveSection();
            sendPreviewUpdate();
          },
          true
        )
      );
      head.appendChild(headActions);
      row.appendChild(head);

      row.appendChild(
        textField("Text položky", service, (v) => (s.items[index] = v), { textarea: true, rows: 2 })
      );

      block.appendChild(row);
    });

    block.appendChild(
      smallBtn("+ Přidat položku", () => {
        s.items.push("Nová služba");
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      })
    );

    return block;
  }

  function renderAlbumPhotosList(item, container) {
    container.innerHTML = "";
    if (!item.images.length) return;

    item.images.forEach((imgSrc, photoIndex) => {
      const row = document.createElement("div");
      row.className = "album-photo-row";

      const thumb = document.createElement("div");
      thumb.className = "image-preview";
      updatePreviewThumb(thumb, imgSrc);
      row.appendChild(thumb);

      const info = document.createElement("div");
      info.className = "album-photo-info";

      if (photoIndex === 0) {
        const coverTag = document.createElement("span");
        coverTag.className = "cover-tag";
        coverTag.textContent = "★ Úvodní fotka";
        info.appendChild(coverTag);
      } else {
        info.appendChild(
          smallBtn("Nastavit jako úvodní", () => {
            const [moved] = item.images.splice(photoIndex, 1);
            item.images.unshift(moved);
            markDirty();
            renderAlbumPhotosList(item, container);
            sendPreviewUpdate();
          })
        );
      }
      row.appendChild(info);

      const moveBtns = document.createElement("div");
      moveBtns.className = "reorder-btns";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "reorder-btn";
      upBtn.setAttribute("aria-label", "Posunout fotku výš");
      upBtn.textContent = "↑";
      upBtn.disabled = photoIndex === 0;
      upBtn.addEventListener("click", () => {
        [item.images[photoIndex - 1], item.images[photoIndex]] = [
          item.images[photoIndex],
          item.images[photoIndex - 1]
        ];
        markDirty();
        renderAlbumPhotosList(item, container);
        sendPreviewUpdate();
      });
      moveBtns.appendChild(upBtn);

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "reorder-btn";
      downBtn.setAttribute("aria-label", "Posunout fotku níž");
      downBtn.textContent = "↓";
      downBtn.disabled = photoIndex === item.images.length - 1;
      downBtn.addEventListener("click", () => {
        [item.images[photoIndex], item.images[photoIndex + 1]] = [
          item.images[photoIndex + 1],
          item.images[photoIndex]
        ];
        markDirty();
        renderAlbumPhotosList(item, container);
        sendPreviewUpdate();
      });
      moveBtns.appendChild(downBtn);
      row.appendChild(moveBtns);

      row.appendChild(
        smallBtn(
          "Odebrat",
          () => {
            item.images.splice(photoIndex, 1);
            markDirty();
            renderAlbumPhotosList(item, container);
            sendPreviewUpdate();
          },
          true
        )
      );

      container.appendChild(row);
    });
  }

  function multiImageField(onEachUploaded) {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp";
    fileInput.multiple = true;
    fileInput.style.display = "none";

    const uploadBtn = document.createElement("button");
    uploadBtn.type = "button";
    uploadBtn.className = "btn btn-ghost btn-sm";
    uploadBtn.textContent = "+ Přidat fotky (lze vybrat víc najednou)";

    const progress = document.createElement("div");
    progress.className = "upload-progress";

    uploadBtn.addEventListener("click", () => fileInput.click());

    // Bezpečný strop na jednu dávku (request) - držíme rezervu pod limitem
    // Vercel serverless funkcí (~4,5 MB na request včetně base64 režie).
    const MAX_BATCH_BYTES = 2.5 * 1024 * 1024;
    const MAX_BATCH_FILES = 10;

    fileInput.addEventListener("change", async () => {
      const files = Array.from(fileInput.files || []);
      if (!files.length) return;
      uploadBtn.disabled = true;
      let successCount = 0;

      try {
        // 1) Všechny fotky nejdřív lokálně zmenšíme/zkomprimujeme.
        const processed = [];
        for (let i = 0; i < files.length; i++) {
          progress.textContent = `Zpracovávám fotku ${i + 1} / ${files.length}…`;
          try {
            const p = await ImageEditor.processFile(files[i], {});
            processed.push(p);
          } catch (err) {
            progress.textContent = `Chyba u "${files[i].name}": ${err.message}`;
            await new Promise((resolve) => setTimeout(resolve, 1800));
          }
        }

        // 2) Rozdělíme do dávek podle velikosti, ať se vejdeme do limitu
        //    jednoho requestu - každá dávka je pak JEDEN atomický commit.
        const batches = [];
        let current = [];
        let currentBytes = 0;
        for (const p of processed) {
          const wouldExceed =
            current.length >= MAX_BATCH_FILES || currentBytes + p.bytes > MAX_BATCH_BYTES;
          if (wouldExceed && current.length) {
            batches.push(current);
            current = [];
            currentBytes = 0;
          }
          current.push(p);
          currentBytes += p.bytes;
        }
        if (current.length) batches.push(current);

        // 3) Každou dávku nahrajeme jedním requestem (1 dávka = 1 commit = 1 nasazení).
        for (let b = 0; b < batches.length; b++) {
          progress.textContent =
            batches.length > 1
              ? `Nahrávám dávku ${b + 1} / ${batches.length}…`
              : `Nahrávám ${batches[b].length} ${batches[b].length === 1 ? "fotku" : "fotek"}…`;
          const result = await apiPost(
            "/api/upload-images-batch",
            { files: batches[b].map((p) => ({ mimeType: p.mimeType, base64: p.base64 })) },
            { retries: 2 }
          );
          result.paths.forEach((path, i) => {
            if (batches[b][i] && batches[b][i].previewUrl) {
              localPreviewUrls.set(path, batches[b][i].previewUrl);
            }
            onEachUploaded(path);
            successCount++;
          });
        }
      } catch (err) {
        progress.textContent = "Chyba: " + err.message;
        await new Promise((resolve) => setTimeout(resolve, 1800));
      }

      progress.textContent = successCount ? `Nahráno ${successCount} z ${files.length} ✓` : "";
      setTimeout(() => (progress.textContent = ""), 2500);
      uploadBtn.disabled = false;
      fileInput.value = "";
    });

    wrap.appendChild(uploadBtn);
    wrap.appendChild(progress);
    wrap.appendChild(fileInput);
    return wrap;
  }

  function renderGallerySection() {
    const g = state.content.gallery;
    const block = fieldsCard();

    block.appendChild(textField("Nadpis nad titulkem", g.eyebrow, (v) => (g.eyebrow = v)));
    block.appendChild(textField("Titulek sekce", g.title, (v) => (g.title = v)));

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent =
      "Každá realizace je album - může mít víc fotek najednou, mezi kterými se na webu listuje šipkami. Šipkami ↑↓ jde přeskládat pořadí alb i fotek v albu, tlačítkem u fotky jde nastavit, která bude úvodní (zobrazí se jako náhled na webu).";
    block.appendChild(hint);

    g.items.forEach((item, albumIndex) => {
      if (!Array.isArray(item.images)) item.images = [];

      const wrap = document.createElement("div");
      wrap.className = "list-item";

      const head = document.createElement("div");
      head.className = "list-item-head";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Album " + (albumIndex + 1);
      head.appendChild(tag);

      const headActions = document.createElement("div");
      headActions.className = "list-item-head-actions";

      const albumUpBtn = document.createElement("button");
      albumUpBtn.type = "button";
      albumUpBtn.className = "reorder-btn";
      albumUpBtn.setAttribute("aria-label", "Posunout album výš");
      albumUpBtn.textContent = "↑";
      albumUpBtn.disabled = albumIndex === 0;
      albumUpBtn.addEventListener("click", () => {
        [g.items[albumIndex - 1], g.items[albumIndex]] = [g.items[albumIndex], g.items[albumIndex - 1]];
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      });
      headActions.appendChild(albumUpBtn);

      const albumDownBtn = document.createElement("button");
      albumDownBtn.type = "button";
      albumDownBtn.className = "reorder-btn";
      albumDownBtn.setAttribute("aria-label", "Posunout album níž");
      albumDownBtn.textContent = "↓";
      albumDownBtn.disabled = albumIndex === g.items.length - 1;
      albumDownBtn.addEventListener("click", () => {
        [g.items[albumIndex], g.items[albumIndex + 1]] = [g.items[albumIndex + 1], g.items[albumIndex]];
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      });
      headActions.appendChild(albumDownBtn);

      headActions.appendChild(
        smallBtn(
          "Odebrat album",
          () => {
            g.items.splice(albumIndex, 1);
            markDirty();
            renderActiveSection();
            sendPreviewUpdate();
          },
          true
        )
      );
      head.appendChild(headActions);
      wrap.appendChild(head);

      wrap.appendChild(textField("Název realizace", item.title, (v) => (item.title = v)));
      wrap.appendChild(
        textField("Krátký popis", item.description, (v) => (item.description = v))
      );

      const photosHint = document.createElement("div");
      photosHint.className = "hint";
      photosHint.textContent = `Fotky v albu (${item.images.length})`;
      wrap.appendChild(photosHint);

      const photosList = document.createElement("div");
      photosList.className = "album-photos";
      renderAlbumPhotosList(item, photosList);
      wrap.appendChild(photosList);

      wrap.appendChild(
        multiImageField((path) => {
          item.images.push(path);
          markDirty();
          renderAlbumPhotosList(item, photosList);
          photosHint.textContent = `Fotky v albu (${item.images.length})`;
          sendPreviewUpdate();
        })
      );

      block.appendChild(wrap);
    });

    block.appendChild(
      smallBtn("+ Přidat album (novou realizaci)", () => {
        g.items.push({ title: "Nová realizace", description: "Popis realizace", images: [] });
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      })
    );

    return block;
  }

  function renderCertificatesSection() {
    const c = state.content.certificates;
    const block = fieldsCard();

    block.appendChild(textField("Nadpis nad titulkem", c.eyebrow, (v) => (c.eyebrow = v)));
    block.appendChild(textField("Titulek sekce", c.title, (v) => (c.title = v)));
    block.appendChild(textField("Úvodní text", c.intro, (v) => (c.intro = v), { textarea: true }));

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = c.items.length
      ? "Sekce se na webu zobrazí automaticky, dokud je tu aspoň jeden certifikát."
      : "Sekce se na webu zatím nezobrazuje - objeví se, jakmile přidáte první certifikát.";
    block.appendChild(hint);

    c.items.forEach((item, index) => {
      const wrap = document.createElement("div");
      wrap.className = "list-item";

      const head = document.createElement("div");
      head.className = "list-item-head";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Certifikát " + (index + 1);
      head.appendChild(tag);

      const headActions = document.createElement("div");
      headActions.className = "list-item-head-actions";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "reorder-btn";
      upBtn.setAttribute("aria-label", "Posunout výš");
      upBtn.textContent = "↑";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", () => {
        [c.items[index - 1], c.items[index]] = [c.items[index], c.items[index - 1]];
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      });
      headActions.appendChild(upBtn);

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "reorder-btn";
      downBtn.setAttribute("aria-label", "Posunout níž");
      downBtn.textContent = "↓";
      downBtn.disabled = index === c.items.length - 1;
      downBtn.addEventListener("click", () => {
        [c.items[index], c.items[index + 1]] = [c.items[index + 1], c.items[index]];
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      });
      headActions.appendChild(downBtn);

      headActions.appendChild(
        smallBtn(
          "Odebrat",
          () => {
            c.items.splice(index, 1);
            markDirty();
            renderActiveSection();
            sendPreviewUpdate();
          },
          true
        )
      );
      head.appendChild(headActions);
      wrap.appendChild(head);

      wrap.appendChild(
        imageField("Fotografie / scan certifikátu", item.image, (path) => (item.image = path), {
          allowPdf: true,
          onPdfUploaded: (path) => {
            item.pdfFile = path;
            markDirty();
            renderActiveSection();
            sendPreviewUpdate();
          }
        })
      );

      if (item.pdfFile) {
        const pdfNote = document.createElement("div");
        pdfNote.className = "hint pdf-attached-note";
        pdfNote.textContent = "📎 Připojen originál PDF ke stažení. ";
        const removeLink = document.createElement("button");
        removeLink.type = "button";
        removeLink.className = "link-btn";
        removeLink.textContent = "Odebrat PDF (náhled zůstane)";
        removeLink.addEventListener("click", () => {
          delete item.pdfFile;
          markDirty();
          renderActiveSection();
          sendPreviewUpdate();
        });
        pdfNote.appendChild(removeLink);
        wrap.appendChild(pdfNote);
      }

      wrap.appendChild(textField("Název certifikátu", item.title, (v) => (item.title = v)));
      const row = document.createElement("div");
      row.className = "field-row";
      row.appendChild(textField("Vydavatel", item.issuer, (v) => (item.issuer = v)));
      row.appendChild(textField("Rok", item.year, (v) => (item.year = v)));
      wrap.appendChild(row);

      block.appendChild(wrap);
    });

    block.appendChild(
      smallBtn("+ Přidat certifikát", () => {
        c.items.push({ image: "", title: "Název certifikátu", issuer: "", year: "" });
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      })
    );

    return block;
  }

  function renderFAQSection() {
    const faq = state.content.faq;
    const block = fieldsCard();

    block.appendChild(textField("Nadpis nad titulkem", faq.eyebrow, (v) => (faq.eyebrow = v)));
    block.appendChild(textField("Titulek sekce", faq.title, (v) => (faq.title = v)));

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Otázky se na webu zobrazí jako klikací seznam - klik rozbalí odpověď.";
    block.appendChild(hint);

    faq.items.forEach((item, index) => {
      const wrap = document.createElement("div");
      wrap.className = "list-item";

      const head = document.createElement("div");
      head.className = "list-item-head";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Otázka " + (index + 1);
      head.appendChild(tag);
      head.appendChild(
        smallBtn(
          "Odebrat",
          () => {
            faq.items.splice(index, 1);
            markDirty();
            renderActiveSection();
            sendPreviewUpdate();
          },
          true
        )
      );
      wrap.appendChild(head);

      wrap.appendChild(textField("Otázka", item.question, (v) => (item.question = v)));
      wrap.appendChild(
        textField("Odpověď", item.answer, (v) => (item.answer = v), { textarea: true, rows: 3 })
      );

      block.appendChild(wrap);
    });

    block.appendChild(
      smallBtn("+ Přidat otázku", () => {
        faq.items.push({ question: "Nová otázka", answer: "Odpověď na otázku." });
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

    if (!Array.isArray(sc.items)) sc.items = [];

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Vybavení k pronájmu (zobrazí se jako seznam pod textem)";
    block.appendChild(hint);

    sc.items.forEach((item, index) => {
      const wrap = document.createElement("div");
      wrap.className = "list-item";

      const head = document.createElement("div");
      head.className = "list-item-head";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Položka " + (index + 1);
      head.appendChild(tag);
      head.appendChild(
        smallBtn(
          "Odebrat",
          () => {
            sc.items.splice(index, 1);
            markDirty();
            renderActiveSection();
            sendPreviewUpdate();
          },
          true
        )
      );
      wrap.appendChild(head);

      wrap.appendChild(textField("Název", item.name, (v) => (item.name = v)));
      wrap.appendChild(
        textField("Detail (např. rozměr, kapacita)", item.detail, (v) => (item.detail = v))
      );

      block.appendChild(wrap);
    });

    block.appendChild(
      smallBtn("+ Přidat vybavení", () => {
        sc.items.push({ name: "Nové vybavení", detail: "Detail" });
        markDirty();
        renderActiveSection();
        sendPreviewUpdate();
      })
    );

    return block;
  }

  function renderContactSection() {
    const c = state.content.contact;
    const block = fieldsCard();

    block.appendChild(textField("Nadpis nad titulkem", c.eyebrow, (v) => (c.eyebrow = v)));
    block.appendChild(textField("Titulek sekce", c.title, (v) => (c.title = v)));
    block.appendChild(textField("Text", c.text, (v) => (c.text = v), { textarea: true }));
    block.appendChild(textField("Text tlačítka", c.ctaLabel, (v) => (c.ctaLabel = v)));

    if (!c.company) c.company = { name: "", ico: "", dic: "", address: "", email: "" };

    const companyHint = document.createElement("div");
    companyHint.className = "hint";
    companyHint.textContent = "Firemní údaje (zobrazí se jednou nad kontaktními osobami i v patičce)";
    block.appendChild(companyHint);

    block.appendChild(
      textField("Název společnosti", c.company.name, (v) => (c.company.name = v))
    );
    const companyRow = document.createElement("div");
    companyRow.className = "field-row";
    companyRow.appendChild(textField("IČ", c.company.ico, (v) => (c.company.ico = v)));
    companyRow.appendChild(textField("DIČ", c.company.dic, (v) => (c.company.dic = v)));
    block.appendChild(companyRow);
    block.appendChild(
      textField("Sídlo (adresa)", c.company.address, (v) => (c.company.address = v))
    );
    block.appendChild(
      textField("E-mail", c.company.email, (v) => (c.company.email = v), {
        placeholder: "napr@email.cz"
      })
    );

    const personsHint = document.createElement("div");
    personsHint.className = "hint";
    personsHint.textContent = "Jednatelé / kontaktní osoby";
    block.appendChild(personsHint);

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
        smallBtn(
          "Odebrat",
          () => {
            c.persons.splice(index, 1);
            markDirty();
            renderActiveSection();
            sendPreviewUpdate();
          },
          true
        )
      );
      wrap.appendChild(head);

      const row = document.createElement("div");
      row.className = "field-row";
      row.appendChild(textField("Jméno", person.name, (v) => (person.name = v)));
      row.appendChild(
        textField("Role", person.role, (v) => (person.role = v), { placeholder: "např. Jednatel" })
      );
      wrap.appendChild(row);
      wrap.appendChild(textField("Telefon", person.phone, (v) => (person.phone = v)));

      block.appendChild(wrap);
    });

    block.appendChild(
      smallBtn("+ Přidat kontaktní osobu", () => {
        c.persons.push({ name: "Jméno Příjmení", role: "Jednatel", phone: "" });
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

    if (!f.social) f.social = { facebook: "", instagram: "" };

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Odkazy na sociální sítě (ikony v patičce webu)";
    block.appendChild(hint);

    block.appendChild(
      textField("Facebook - odkaz", f.social.facebook, (v) => (f.social.facebook = v), {
        placeholder: "https://facebook.com/..."
      })
    );
    block.appendChild(
      textField("Instagram - odkaz", f.social.instagram, (v) => (f.social.instagram = v), {
        placeholder: "https://instagram.com/..."
      })
    );

    return block;
  }

  function renderCookieSection() {
    const cc = state.content.cookieConsent;
    const block = fieldsCard();
    block.appendChild(textField("Text lišty", cc.text, (v) => (cc.text = v), { textarea: true }));
    block.appendChild(textField("Text tlačítka", cc.acceptLabel, (v) => (cc.acceptLabel = v)));
    return block;
  }

  function createLegalSectionRenderer(contentKey) {
    return function renderGenericLegalSection() {
      const l = state.content[contentKey];
      const block = fieldsCard();

      block.appendChild(textField("Titulek stránky", l.pageTitle, (v) => (l.pageTitle = v)));
      block.appendChild(
        textField("Naposledy aktualizováno", l.lastUpdated, (v) => (l.lastUpdated = v), {
          placeholder: "např. srpen 2026"
        })
      );
      block.appendChild(
        textField("Úvodní text", l.intro, (v) => (l.intro = v), {
          textarea: true,
          rows: 4
        })
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
          textField("Text", item.text, (v) => (item.text = v), {
            textarea: true,
            rows: 3
          })
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
    };
  }

  const renderLegalSection = createLegalSectionRenderer("legal");
  const renderWarrantySection = createLegalSectionRenderer("warranty");
  const renderTermsSection = createLegalSectionRenderer("terms");

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
      description: "Alba fotografií dokončených realizací - u každé realizace může být víc fotek, mezi kterými se na webu listuje šipkami.",
      anchor: "realizace",
      render: renderGallerySection
    },
    {
      id: "certificates",
      group: "Textový obsah",
      label: "Certifikáty",
      description: "Certifikáty a osvědčení firmy. Sekce se na webu zobrazí automaticky, jakmile přidáte první certifikát.",
      anchor: "certificates-section",
      render: renderCertificatesSection
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
      id: "faq",
      group: "Textový obsah",
      label: "FAQ",
      description: "Časté dotazy - klikací seznam otázek a odpovědí.",
      anchor: "faq",
      render: renderFAQSection
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
    },
    {
      id: "warranty",
      group: "Pokročilé nastavení",
      subgroup: "Právní",
      label: "Reklamační řád",
      description: "Text stránky Reklamační řád - záruční doba, jak reklamaci uplatnit a jaká máte práva z vadného plnění.",
      previewUrl: "reklamacni-rad.html",
      render: renderWarrantySection
    },
    {
      id: "terms",
      group: "Pokročilé nastavení",
      subgroup: "Právní",
      label: "Obchodní podmínky",
      description: "Text stránky Všeobecné obchodní podmínky - platba, termíny, odstoupení od zakázky.",
      previewUrl: "obchodni-podminky.html",
      render: renderTermsSection
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

    const root = document.getElementById("editor-pane");
    root.innerHTML = "";

    const header = document.createElement("div");
    header.className = "content-header";

    const title = document.createElement("h2");
    title.className = "section-title";
    title.id = "section-title";
    title.textContent = section.label;
    header.appendChild(title);

    const previewLink = document.createElement("a");
    previewLink.className = "preview-link-inline";
    previewLink.id = "preview-link";
    previewLink.target = "_blank";
    previewLink.rel = "noopener";
    previewLink.textContent = "Zobrazit náhled ↗";
    previewLink.href =
      section.previewUrl || "index.html" + (section.anchor ? "#" + section.anchor : "");
    header.appendChild(previewLink);

    root.appendChild(header);

    const desc = document.createElement("p");
    desc.className = "section-description";
    desc.textContent = section.description;
    root.appendChild(desc);

    root.appendChild(section.render());
    root.querySelectorAll("textarea").forEach(autoGrow);
    root.scrollTop = 0;

    // Pojistka: i kdyby první přepočet proběhl dřív, než se dogruntuje
    // vlastní písmo, jakmile je jisté, že je načtené, přepočítáme znovu.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        root.querySelectorAll("textarea").forEach(autoGrow);
      });
    }
  }

  /* ==================== Ukládání ==================== */

  async function saveAll() {
    const saveBtn = document.getElementById("save-btn");
    const discardBtn = document.getElementById("discard-btn");
    saveBtn.disabled = true;
    discardBtn.disabled = true;
    setSaveStatus("Kontroluji, jestli mezitím nikdo jiný neuložil změny…", "");

    try {
      // Kontrola konfliktu: porovnáme aktuální stav na serveru s tím, co
      // tahle záložka měla naposledy načtené. Pokud se liší, znamená to,
      // že obsah mezitím (třeba z jiného otevřeného okna/zařízení) změnil
      // někdo jiný - v tom případě NEPŘEPISUJEME a radši vyzveme k
      // obnovení stránky, než abychom tiše ztratili cizí novější změny.
      const [liveContentText, liveThemeText] = await Promise.all([
        fetch("data/content.json", { cache: "no-store" }).then((r) => r.text()),
        fetch("data/theme.json", { cache: "no-store" }).then((r) => r.text())
      ]);

      const contentChanged =
        state.loadedContentSnapshot !== undefined &&
        canonicalJson(liveContentText) !== state.loadedContentSnapshot;
      const themeChanged =
        state.loadedThemeSnapshot !== undefined &&
        canonicalJson(liveThemeText) !== state.loadedThemeSnapshot;

      if (contentChanged || themeChanged) {
        setSaveStatus(
          "⚠️ Obsah mezitím upravil někdo jiný (jiné okno/zařízení) - vaše změny NEBYLY uloženy, aby se nic nepřepsalo. Obnovte prosím stránku (F5) a upravte to znovu.",
          "error"
        );
        return;
      }

      setSaveStatus("Publikuji…", "");
      await apiPost("/api/save", { file: "content", data: state.content });
      await apiPost("/api/save", { file: "theme", data: state.theme });
      isDirty = false;
      setSaveStatus("Publikováno ✓ (nasazení může trvat ~1 minutu)", "success");

      // Po úspěšném uložení si osvěžíme snímek na nově uložený stav, ať
      // případná DALŠÍ kontrola porovnává proti aktuálnímu stavu.
      state.loadedContentSnapshot = canonicalJson(JSON.stringify(state.content));
      state.loadedThemeSnapshot = canonicalJson(JSON.stringify(state.theme));
    } catch (err) {
      setSaveStatus("Chyba: " + err.message, "error");
    } finally {
      saveBtn.disabled = false;
      discardBtn.disabled = false;
    }
  }

  async function discardChanges() {
    if (!isDirty) return;
    if (!confirm("Zahodit všechny neuložené změny a načíst naposledy publikovanou verzi?")) return;

    const discardBtn = document.getElementById("discard-btn");
    discardBtn.disabled = true;
    setSaveStatus("Zahazuji změny…", "");
    try {
      await loadContentAndTheme();
      isDirty = false;
      renderSidebar();
      renderActiveSection();
      setSaveStatus("Vše uloženo", "");
    } catch (err) {
      setSaveStatus("Chyba: " + err.message, "error");
    } finally {
      discardBtn.disabled = false;
    }
  }

  /* ==================== Přihlášení ==================== */

  function canonicalJson(text) {
    // Strukturální otisk obsahu - json.parse+stringify bez odsazení, ať
    // drobné rozdíly ve formátování (koncové odřádkování, mezery) mezi
    // různými cestami uložení (admin vs. přímá úprava souboru) nezpůsobí
    // falešnou detekci konfliktu.
    try {
      return JSON.stringify(JSON.parse(text));
    } catch {
      return text;
    }
  }

  async function loadContentAndTheme() {
    const [contentText, themeText] = await Promise.all([
      fetch("data/content.json", { cache: "no-store" }).then((r) => r.text()),
      fetch("data/theme.json", { cache: "no-store" }).then((r) => r.text())
    ]);
    state.content = clone(JSON.parse(contentText));
    state.theme = clone(JSON.parse(themeText));
    // Snímek přesně toho, co je PRÁVĚ TEĎ na serveru - použije se před uložením
    // ke kontrole, jestli mezitím (např. z jiného otevřeného okna/zařízení)
    // někdo jiný obsah nezměnil. Bez týhle kontroly by "Publikovat" mohlo
    // tiše přepsat cizí novější změny tím starším stavem, co má tahle
    // konkrétní záložka v paměti - přesně tohle se už párkrát stalo.
    state.loadedContentSnapshot = canonicalJson(contentText);
    state.loadedThemeSnapshot = canonicalJson(themeText);
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
    setSaveStatus("Vše uloženo", "");
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
    document.getElementById("discard-btn").addEventListener("click", discardChanges);
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
