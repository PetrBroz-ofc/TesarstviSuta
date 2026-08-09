/**
 * legal.js
 * Stránka ochrana-udaju.html - vykreslí obsah content.legal a spustí
 * sdílenou interaktivitu (hlavička, menu, cookies) z site-common.js.
 */
(function () {
  "use strict";

  async function init() {
    SiteCommon.initInteractions();

    try {
      const content = await SiteCommon.fetchJSON("data/content.json");
      if (content.legal) {
        SiteCommon.renderLegalPage(content.legal);
        if (content.meta) {
          document.title = content.legal.pageTitle + " | " + content.meta.title;
        }
      }
      SiteCommon.renderFooter(content);
      SiteCommon.syncCookieText(content);
    } catch (err) {
      console.error("Chyba při načítání obsahu stránky:", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
