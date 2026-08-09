/**
 * terms.js
 * Stránka obchodni-podminky.html - vykreslí obsah content.terms a spustí
 * sdílenou interaktivitu (hlavička, menu, cookies) z site-common.js.
 */
(function () {
  "use strict";

  async function init() {
    SiteCommon.initInteractions();

    try {
      const content = await SiteCommon.fetchJSON("data/content.json");
      if (content.terms) {
        SiteCommon.renderLegalPage(content.terms);
        if (content.meta) {
          document.title = content.terms.pageTitle + " | " + content.meta.title;
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
