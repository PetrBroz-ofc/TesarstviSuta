/**
 * image-editor.js
 * Před nahráním na server zmenší a zkomprimuje fotografii v prohlížeči
 * (canvas) — realizace z mobilu mívají klidně 8–15 MB, na web stačí
 * dlouhá strana max. 1920 px. Snižuje to dobu nahrávání i zátěž repozitáře.
 *
 * PDF (např. sken certifikátu) se oproti tomu neupravuje - jen se ověří
 * velikost. Vercel serverless funkce mají tvrdý limit cca 4,5 MB na
 * celý request, proto je PDF omezené na 3 MB (base64 kódování přidá
 * cca +33 % k velikosti, takže i tak zbývá rezerva).
 */
const ImageEditor = (function () {
  "use strict";

  const ALLOWED_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20 MB - obrázek se před uploadem zmenší
  const MAX_PDF_BYTES = 3 * 1024 * 1024; // 3 MB - PDF se neupravuje
  const MAX_DIMENSION = 1920;
  const JPEG_QUALITY = 0.85;

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Soubor se nepodařilo načíst jako obrázek."));
      };
      img.src = url;
    });
  }

  /**
   * @param {File} file
   * @returns {Promise<{ base64: string, mimeType: string, width: number, height: number }>}
   */
  async function processImageFile(file) {
    if (!ALLOWED_INPUT_TYPES.includes(file.type)) {
      throw new Error("Nepodporovaný formát. Použijte prosím JPG, PNG nebo WEBP.");
    }
    if (file.size > MAX_INPUT_BYTES) {
      throw new Error("Soubor je příliš velký (max. 20 MB).");
    }

    const img = await loadImage(file);

    let { width, height } = img;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new Error("Zpracování obrázku selhalo.");

    const base64 = await blobToBase64(blob);
    return { base64, mimeType: "image/jpeg", width, height, bytes: blob.size };
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result; // "data:image/jpeg;base64,AAAA..."
        const base64 = String(result).split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Čtení souboru selhalo."));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Z PDF (např. sken certifikátu) vygeneruje JPEG náhled první strany -
   * na webu se pak certifikát chová úplně stejně jako běžná fotka (karta,
   * zvětšení v náhledu). Vedle náhledu se pošle i originál PDF, aby ho šlo
   * z webu stáhnout/otevřít celý.
   * @param {File} file
   */
  async function processPdfFile(file) {
    if (file.type !== "application/pdf") {
      throw new Error("Očekáván PDF soubor.");
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new Error("PDF je příliš velké (max. 3 MB) - zkuste ho nejdřív zmenšit/zkomprimovat.");
    }
    if (typeof pdfjsLib === "undefined") {
      throw new Error("Knihovna pro čtení PDF se nenačetla. Zkuste stránku obnovit.");
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const baseViewport = page.getViewport({ scale: 1 });
    const scale = MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height);
    const viewport = page.getViewport({ scale: Math.min(scale, 3) });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // PDF strany mivaji na okrajich pruhledne pozadi
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const thumbBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!thumbBlob) throw new Error("Vytvoření náhledu PDF selhalo.");

    const base64 = await blobToBase64(thumbBlob);
    const pdfBase64 = await blobToBase64(file);

    return {
      // Nahled - posila se stejne jako bezna fotka (image pole).
      base64,
      mimeType: "image/jpeg",
      width: canvas.width,
      height: canvas.height,
      bytes: thumbBlob.size,
      // + puvodni PDF k samostatnemu uploadu.
      isPdf: true,
      pdfBase64,
      pdfMimeType: "application/pdf",
      pdfBytes: file.size
    };
  }

  /**
   * Obecné zpracování souboru pro upload - obrázek se zmenší/zkomprimuje,
   * PDF (pokud je povolené) se pošle beze změny.
   * @param {File} file
   * @param {{ allowPdf?: boolean }} [opts]
   */
  async function processFile(file, opts = {}) {
    if (opts.allowPdf && file.type === "application/pdf") {
      return processPdfFile(file);
    }
    return processImageFile(file);
  }

  return { processImageFile, processPdfFile, processFile };
})();
