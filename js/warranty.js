/**
 * warranty.js
 * Stránka reklamacni-rad.html - vykreslí obsah content.warranty a spustí
 * sdílenou interaktivitu (hlavička, menu, cookies) z site-common.js.
 */
(function () {
  "use strict";

  async function init() {
    SiteCommon.initInteractions();

    try {
      const content = await SiteCommon.fetchJSON("data/content.json");
      if (content.warranty) {
        SiteCommon.renderLegalPage(content.warranty);
        if (content.meta) {
          document.title = content.warranty.pageTitle + " | " + content.meta.title;
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
