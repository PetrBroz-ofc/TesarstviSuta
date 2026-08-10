/**
 * icons.js
 * Lehká knihovna inline SVG ikon ve stylu technického/architektonického výkresu
 * (tenké linky, žádné vyplněné plochy) — odpovídá řemeslnému charakteru webu.
 * Použití: ICONS.roofFrame -> vrátí SVG markup jako string.
 */
const ICONS = {
  roofFrame: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 34 24 10 42 34"/><path d="M13 34V24l11-14 11 14v10"/><path d="M6 34h36"/></svg>`,

  roofTiles: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20 24 8l18 12"/><path d="M9 20v18h30V20"/><path d="M9 27h30M9 34h30M17 20v18M31 20v18"/></svg>`,

  woodPlank: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="12" width="36" height="7" rx="1"/><rect x="6" y="21" width="36" height="7" rx="1"/><rect x="6" y="30" width="36" height="7" rx="1"/><path d="M14 12v7M31 21v7M20 30v7"/></svg>`,

  church: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6v6M20 9h8"/><path d="M24 12 36 24v18H12V24z"/><path d="M20 42V30h8v12"/><path d="M12 24H6l18-18 18 18h-6"/></svg>`,

  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2C9.5 21 3 14.5 3 6a2 2 0 0 1 1-2z"/></svg>`,

  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.6 7-12a7 7 0 1 0-14 0c0 5.4 7 12 7 12z"/><circle cx="12" cy="9" r="2.3"/></svg>`,

  idCard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="8.5" cy="11" r="2"/><path d="M6 16c.6-1.5 1.8-2.2 2.5-2.2s1.9.7 2.5 2.2M14 9.5h5M14 13h5"/></svg>`,

  pdfDoc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8.5 17v-4h1.2a1.3 1.3 0 0 1 0 2.6H8.5M12.5 17v-4h1a1.5 1.5 0 0 1 0 4h-1zM17.5 13h-1.2v4M16.3 15h1"/></svg>`,

  arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,

  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,

  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,

  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ICONS;
}
