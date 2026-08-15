/**
 * _github.js
 * Ukládání obsahu (data/content.json, data/theme.json) a nahraných obrázků
 * probíhá zápisem přímo do GitHub repozitáře přes Contents API — stejný
 * princip jako u projektu Elrevmont. Vercel je napojený na tento repozitář,
 * takže po commitu proběhne automatický redeploy a změny se objeví na webu.
 *
 * Výhoda: žádná databáze navíc, verze obsahu jsou vidět v historii Gitu
 * (lze se kdykoliv vrátit k předchozí verzi obsahu webu).
 *
 * Potřebné proměnné prostředí:
 *   GITHUB_TOKEN   - fine-grained personal access token JEN s právem
 *                    "Contents: read and write" pro tento jeden repozitář
 *   GITHUB_REPO    - "uzivatel/nazev-repozitare"
 *   GITHUB_BRANCH  - větev, do které se commituje (např. "main")
 */

const API_BASE = "https://api.github.com";

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) {
    throw new Error("Chybí GITHUB_TOKEN nebo GITHUB_REPO v proměnných prostředí.");
  }
  return { token, repo, branch };
}

async function githubRequest(path, options = {}) {
  const { token } = getConfig();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`GitHub API chyba (${res.status}): ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Načte soubor z repozitáře. Vrátí { content: string, sha } nebo null, pokud neexistuje. */
async function getFile(filePath) {
  const { repo, branch } = getConfig();
  try {
    const data = await githubRequest(
      `/repos/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`
    );
    const content = Buffer.from(data.content, "base64").toString("utf8");
    return { content, sha: data.sha };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Zapíše (vytvoří nebo aktualizuje) soubor v repozitáři.
 * @param {string} filePath - cesta v repozitáři, např. "data/content.json"
 * @param {string} contentUtf8OrBase64 - obsah souboru
 * @param {string} message - text commitu
 * @param {string|null} sha - sha aktuální verze (pro update); null pro nový soubor
 * @param {boolean} isBase64 - true pokud contentUtf8OrBase64 je již base64 (obrázky)
 */
async function putFile(filePath, contentUtf8OrBase64, message, sha, isBase64 = false) {
  const { repo, branch } = getConfig();
  const encoded = isBase64
    ? contentUtf8OrBase64
    : Buffer.from(contentUtf8OrBase64, "utf8").toString("base64");

  const payload = {
    message,
    content: encoded,
    branch
  };
  if (sha) payload.sha = sha;

  return githubRequest(`/repos/${repo}/contents/${encodeURIComponent(filePath)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

/**
 * Zapíše VÍC souborů v JEDNOM atomickém commitu (Git Data API) - důležité
 * pro hromadné nahrávání fotek: bez tohohle by každá fotka spustila
 * samostatné nasazení, a při nahrávání víc fotek najednou by mohlo dojít
 * k závodu mezi rychle po sobě jdoucími nasazeními (CDN pak umí na chvíli
 * zaseknout chybnou odpověď pro soubor, který se objevil "mezi" nasazeními).
 * @param {{path: string, base64: string}[]} files
 * @param {string} message
 * @returns {Promise<{ path: string, shaCommit: string }>}
 */
async function putFilesBatch(files, message) {
  const { repo, branch } = getConfig();

  // 1) Aktuální stav větve (poslední commit + jeho strom)
  const ref = await githubRequest(`/repos/${repo}/git/ref/heads/${branch}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await githubRequest(`/repos/${repo}/git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree.sha;

  // 2) Blob pro každý soubor (samotné nahrání obsahu, ještě nic nemění)
  const treeItems = [];
  for (const file of files) {
    const blob = await githubRequest(`/repos/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: file.base64, encoding: "base64" })
    });
    treeItems.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha
    });
  }

  // 3) Nový strom (base_tree + nové/změněné soubory)
  const newTree = await githubRequest(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems })
  });

  // 4) Nový commit ukazující na nový strom
  const newCommit = await githubRequest(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [baseCommitSha]
    })
  });

  // 5) Posun větve na nový commit (JEDINÝ trigger nasazení pro celou dávku)
  await githubRequest(`/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha })
  });

  return { shaCommit: newCommit.sha, count: files.length };
}

module.exports = { getFile, putFile, putFilesBatch };
