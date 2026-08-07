# Tesařství a pokrývačství Jakub Šuta — web + administrace

Statický web (vanilla HTML/CSS/JS) s obsahem v JSON souborech a admin
rozhraním, které ukládá změny přímo do tohoto GitHub repozitáře. Stejná
architektura jako u projektu Elrevmont.

## Jak to funguje

- **Web** (`index.html`) je jen kostra. Veškerý text a obrázky se
  načítají za běhu z `data/content.json` a barvy z `data/theme.json`.
- **Administrace** (`admin.html`) umožňuje obsah i barvy upravovat
  přes formulář s živým náhledem, bez nutnosti umět kódovat.
- Uložení v administraci provede **commit do tohoto repozitáře** přes
  GitHub API. Vercel je na repozitář napojený, takže po uložení
  proběhne automatický redeploy (obvykle do 1 minuty se změna objeví
  na ostrém webu).
- Žádná databáze navíc není potřeba — historii obsahu tak vidíte
  přímo v historii commitů na GitHubu a lze se kdykoliv vrátit zpět.

## Nasazení (poprvé)

### 1. Repozitář a Vercel

1. Nahrajte tento projekt do vlastního GitHub repozitáře.
2. V [Vercelu](https://vercel.com) vytvořte nový projekt a napojte ho
   na tento repozitář (framework preset: "Other" / statický web).

### 2. GitHub token pro ukládání obsahu

1. Na GitHubu: **Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
2. Nastavte přístup **jen na tento jeden repozitář** a oprávnění
   **Contents: Read and write** (nic víc není potřeba).
3. Zkopírovaný token vložte na Vercelu do proměnné `GITHUB_TOKEN`.

### 3. Heslo do administrace

Žádný krok navíc — heslo si prostě zvolíte a v dalším kroku ho rovnou
vložíte jako proměnnou prostředí `ADMIN_PASSWORD` na Vercelu. Kdykoliv
si ho tam sami změníte (Project Settings → Environment Variables →
Redeploy), nic se nemusí přepočítávat.

### 4. Proměnné prostředí na Vercelu

V **Project Settings → Environment Variables** nastavte (viz také
`.env.example`):

| Proměnná              | Popis                                                        |
|------------------------|---------------------------------------------------------------|
| `ADMIN_PASSWORD`       | Heslo do administrace (obyčejný text, měňte si ho kdykoliv)   |
| `SESSION_SECRET`       | Náhodný řetězec min. 32 znaků, např. `openssl rand -hex 32`   |
| `ALLOWED_ORIGIN`       | `https://vase-domena.cz` (doména, odkud běží administrace)    |
| `GITHUB_TOKEN`         | Token z kroku 2                                               |
| `GITHUB_REPO`          | `uzivatel/nazev-repozitare`                                   |
| `GITHUB_BRANCH`        | Obvykle `main`                                                |

Po uložení proměnných proveďte na Vercelu **Redeploy**.

### 5. Vlastní doména

V nastavení projektu na Vercelu přidejte doménu a nasměrujte DNS
podle instrukcí Vercelu. Adresy `https://tesarstvi-suta.cz` v
`index.html`, `vercel.json` a `data/content.json` (`meta.siteUrl`)
upravte na skutečnou doménu.

## Použití administrace

1. Otevřete `https://vase-domena.cz/admin.html`.
2. Přihlaste se heslem, které jste nastavili v kroku 3.
3. V levém panelu upravujte texty, fotky (záložka **Obsah**) nebo
   barvy webu (záložka **Vzhled**) — vpravo se změny hned promítají
   do živého náhledu.
4. Fotky se při nahrání v prohlížeči automaticky zmenší a
   zkomprimují, není třeba je předem upravovat.
5. Klikněte na **Uložit změny**. Změna se zapíše do repozitáře a do
   ~1 minuty se objeví na ostrém webu.

Administrace je na produkci dostupná pouze přes HTTPS a přihlášení
je chráněné proti automatizovaným pokusům o uhodnutí hesla
(rate limiting) — víc v sekci Bezpečnost níže.

## Doplnění reálných fotografií

Web je připravený s ukázkovými popisky realizací, ale bez skutečných
fotek (nechtěl jsem používat cizí/stock fotky za reálné zakázky).
Nejjednodušší cesta k doplnění:

- V administraci u každé sekce (Hero, O firmě, Realizace) použijte
  tlačítko **Nahrát fotografii** a nahrajte vlastní snímky.
- Fotky se ukládají do `images/uploads/` v repozitáři.

## Struktura projektu

```
index.html              Kostra webu (SEO, OG, schema.org)
admin.html               Administrace
css/style.css             Styl webu
css/admin.css              Styl administrace
js/main.js                Vykreslení webu z JSON
js/admin.js                 Logika administrace
js/icons.js                  Knihovna SVG ikon
js/image-editor.js            Zmenšení/komprese fotek v prohlížeči
data/content.json          Veškerý textový obsah webu
data/theme.json              Barvy a fonty
api/login.js, logout.js, session.js   Přihlašování
api/save.js                 Ukládání obsahu/barev do GitHubu
api/upload-image.js          Nahrávání fotografií
api/_auth.js, _cors.js,        Sdílené bezpečnostní pomocníky
    _rate-limit.js, _github.js
scripts/test-render.js       Automatický test vykreslení webu
vercel.json                 Bezpečnostní hlavičky (CSP, HSTS, ...)
```

## Bezpečnost — přehled opatření

- **Heslo**: nastavuje se přímo jako proměnná prostředí `ADMIN_PASSWORD`
  na Vercelu, takže si ho kdykoliv sami změníte bez přepočítávání.
  Porovnávání přesto probíhá v konstantním čase (ochrana proti timing
  útokům), takže i takhle uložené heslo nejde uhodnout podle rychlosti
  odpovědi serveru.
- **Session**: podepsaný token (HMAC-SHA256) v `HttpOnly` + `Secure` +
  `SameSite=Strict` cookie — nejde ukrást přes JavaScript ani poslat
  z cizí domény.
- **Rate limiting**: přihlášení (5 pokusů/min), ukládání a upload
  obrázků mají limity proti zneužití/spamu.
- **CORS**: API odpovídá jen doménám v `ALLOWED_ORIGIN`, ne komukoliv.
- **Upload obrázků**: kontrola typu podle skutečného obsahu souboru
  (magic bytes), ne jen podle přípony; limit velikosti; bezpečně
  generovaný název souboru (žádný path traversal); SVG upload není
  povolen (mohlo by obsahovat spustitelný kód).
- **CSP a další hlavičky** (`vercel.json`): striktní Content-Security-
  -Policy bez `unsafe-inline`, `X-Frame-Options: DENY` proti
  clickjackingu, `Strict-Transport-Security` vynucující HTTPS.
- **Validace vstupů**: `/api/save` odmítne data, která neodpovídají
  očekávané struktuře webu, takže omylem nejde web "rozbít" uložením
  poškozeného JSONu.

### Pokud v budoucnu upravíte JSON-LD blok v `index.html`

CSP hlavička v `vercel.json` povoluje tento jeden konkrétní inline
`<script type="application/ld+json">` pomocí otisku (hash), ne
plošným `unsafe-inline`. Pokud obsah tohoto bloku změníte, přepočítejte
hash a aktualizujte `script-src` ve `vercel.json`:

```bash
node -e "
const fs=require('fs'),crypto=require('crypto');
const html=fs.readFileSync('index.html','utf8');
const s='<script type=\"application/ld+json\">', e='</script>';
const i=html.indexOf(s)+s.length, j=html.indexOf(e,i);
const h=crypto.createHash('sha256').update(html.slice(i,j)).digest('base64');
console.log('sha256-'+h);
"
```

## Vývoj a testování

```bash
npm install                 # jen pro testovací skripty (jsdom)
python3 -m http.server 8123  # lokální náhled statického webu
node scripts/test-render.js   # automatický test vykreslení
```

API funkce (`/api/*`) běží jako Vercel serverless funkce — lokálně je
lze zkoušet přes `vercel dev` (Vercel CLI) po nastavení proměnných
prostředí ze souboru `.env.example`.
