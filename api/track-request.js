// Příjem požadavku na dráhu z formuláře na webu: uloží ho jako issue do soukromého repozitáře
// (fotky do zvláštní větve). Bez závislostí, jen Node 22+ (fetch, FormData, Response).

const API = "https://api.github.com";
const MAX_PHOTOS = 8;
const MAX_ONE = 1500000;
const MAX_SUM = 4000000;

function odpoved(status, data) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}
const chyba = (status, error, extra) => odpoved(status, { ok: false, error, ...extra });

function puvodOk(origin) {
  if (!origin) return false;
  return (
    origin === "https://onroadrc.cz" ||
    origin === "https://www.onroadrc.cz" ||
    /^https:\/\/onroad-rc-simulator(-[a-z0-9-]+)?\.vercel\.app$/.test(origin)
  );
}

// Řídicí znaky pryč, NFC, ořez; jednořádková pole mají bílé znaky sloučené.
function cisti(v, jednoradek) {
  let s = typeof v === "string" ? v : "";
  s = s.normalize("NFC").replace(/\r\n?/g, "\n");
  s = jednoradek
    ? s.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ")
    : s.replace(/[^\P{Cc}\n]|[\p{Zl}\p{Zp}]/gu, "");
  return s.trim();
}

function ohrazeni(text) {
  let nejdelsi = 0;
  for (const m of text.match(/`+/g) || []) nejdelsi = Math.max(nejdelsi, m.length);
  return "`".repeat(Math.max(3, nejdelsi + 1));
}

function idPozadavku() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const cas = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  const nahoda = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => p(b.toString(16))).join("");
  return `${cas}-${nahoda}`;
}

class GhChyba extends Error {
  constructor(status, popis) {
    super(popis);
    this.status = status;
  }
}

async function gh(token, method, cesta, body) {
  const res = await fetch(API + cesta, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "onroadrc-track-request",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new GhChyba(res.status, `${method} ${cesta.replace(/\/repos\/[^/]+\/[^/]+/, "")}`);
  return res.json();
}

async function zapisFotky(token, repo, branch, id, fotky) {
  const bloby = await Promise.all(
    fotky.map(async (buf) =>
      (await gh(token, "POST", `/repos/${repo}/git/blobs`, { content: buf.toString("base64"), encoding: "base64" })).sha,
    ),
  );
  for (let pokus = 1; pokus <= 3; pokus++) {
    const ref = await gh(token, "GET", `/repos/${repo}/git/ref/heads/${branch}`);
    const hlava = ref.object.sha;
    const commit = await gh(token, "GET", `/repos/${repo}/git/commits/${hlava}`);
    const strom = await gh(token, "POST", `/repos/${repo}/git/trees`, {
      base_tree: commit.tree.sha,
      tree: bloby.map((sha, i) => ({ path: `pozadavky/${id}/${i + 1}.jpg`, mode: "100644", type: "blob", sha })),
    });
    const novy = await gh(token, "POST", `/repos/${repo}/git/commits`, {
      message: `Požadavek na dráhu ${id}`,
      tree: strom.sha,
      parents: [hlava],
    });
    try {
      await gh(token, "PATCH", `/repos/${repo}/git/refs/heads/${branch}`, { sha: novy.sha, force: false });
      return;
    } catch (e) {
      if (!(e instanceof GhChyba && (e.status === 409 || e.status === 422)) || pokus === 3) throw e;
    }
  }
}

function telo(id, p, repo, branch, pocet) {
  const radky = [
    `Dráha: ${p.track}`,
    `Místo: ${p.place}`,
    `Typ: ${p.kind === "hala" ? "hala" : p.kind === "venkovni" ? "venkovní" : "neuvedeno"}`,
    `Jméno: ${p.name}`,
    `E-mail: ${p.email}`,
    `Jazyk: ${p.lang}`,
    "",
    "Poznámka:",
    p.note,
  ].join("\n");
  const o = ohrazeni(radky);
  const fotky = Array.from(
    { length: pocet },
    (_, i) => `![foto ${i + 1}](https://github.com/${repo}/blob/${branch}/pozadavky/${id}/${i + 1}.jpg?raw=true)`,
  );
  return [`Požadavek z formuláře na webu onroadrc.cz, ID \`${id}\`.`, "", o, radky, o, "", "### Fotky", "", ...fotky, ""].join("\n");
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return chyba(405, "method");
    if (!puvodOk(request.headers.get("origin"))) return chyba(403, "origin");
    if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("multipart/form-data")) return chyba(415, "type");

    let form;
    try {
      form = await request.formData();
    } catch {
      return chyba(400, "fields");
    }

    // Past na roboty: vyplněné skryté pole, tiše děkujeme a nic neděláme.
    const text = (k) => (typeof form.get(k) === "string" ? form.get(k) : "");
    if (text("hp").trim() !== "") return odpoved(200, { ok: true });
    // Doba vyplnění měřená v prohlížeči (nezávisí na hodinách).
    const elapsed = Number(text("elapsed"));
    if (!text("elapsed").trim() || !Number.isFinite(elapsed) || elapsed < 3000) return chyba(400, "fast");

    const p = {
      track: cisti(text("track"), true),
      place: cisti(text("place"), true),
      kind: cisti(text("kind"), true),
      email: cisti(text("email"), true),
      name: cisti(text("name"), true),
      note: cisti(text("note"), false),
      lang: cisti(text("lang"), true),
    };
    if (p.kind !== "hala" && p.kind !== "venkovni") p.kind = "";
    if (p.lang !== "cs" && p.lang !== "en") p.lang = "cs";
    const pole = (f) => chyba(400, "fields", { field: f });
    if (p.track.length < 2 || p.track.length > 120) return pole("track");
    if (p.place.length > 120) return pole("place");
    if (p.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return pole("email");
    if (p.name.length > 80) return pole("name");
    if (p.note.length > 3000) return pole("note");

    const soubory = form.getAll("photos").filter((f) => typeof f !== "string");
    if (soubory.length < 1 || soubory.length > MAX_PHOTOS) return chyba(400, "photos");
    const fotky = [];
    let soucet = 0;
    for (const f of soubory) {
      if (f.size > MAX_ONE) return chyba(413, "size");
      const buf = Buffer.from(await f.arrayBuffer());
      if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return chyba(400, "photos");
      soucet += buf.length;
      fotky.push(buf);
    }
    if (soucet > MAX_SUM) return chyba(413, "size");

    const token = process.env.GITHUB_REQUESTS_TOKEN;
    const repo = process.env.REQUESTS_REPO;
    const branch = process.env.REQUESTS_BRANCH;
    const label = process.env.REQUESTS_LABEL;
    if (!token || !repo || !branch) return chyba(503, "config");

    const id = idPozadavku();
    try {
      // Strop proti zahlcení: 10 a více požadavků za poslední hodinu.
      if (label) {
        const od = new Date(Date.now() - 3600000).toISOString();
        const nedavne = await gh(token, "GET", `/repos/${repo}/issues?state=all&labels=${encodeURIComponent(label)}&since=${encodeURIComponent(od)}&per_page=20`);
        if (Array.isArray(nedavne) && nedavne.length >= 10) return chyba(429, "busy");
      }
      await zapisFotky(token, repo, branch, id, fotky);
      await gh(token, "POST", `/repos/${repo}/issues`, {
        title: `Dráha na přání: ${p.track}`,
        body: telo(id, p, repo, branch, fotky.length),
        ...(label ? { labels: [label] } : {}),
      });
    } catch (e) {
      console.error("track-request: chyba GitHubu", e instanceof GhChyba ? `${e.status} ${e.message}` : "neočekávaná chyba");
      return chyba(502, "upstream");
    }
    return odpoved(200, { ok: true });
  },
};
