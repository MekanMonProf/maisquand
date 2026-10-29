/* Génère le site publié dans _site/ :
   - une copie de tous les fichiers du dépôt ;
   - une vraie page par article (/a/<id>/), par vérification (/v/<id>/) et par date (/d/<id>/),
     avec son titre, son résumé et son image pour Google, WhatsApp et Facebook ;
   - le plan du site (sitemap.xml) avec toutes ces adresses.
   Lancé automatiquement à chaque mise à jour par .github/workflows/pages.yml.
   Sans dépendance : node outils/pages.mjs */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SORTIE = path.join(RACINE, "_site");
const SITE = "https://maisquand.com";
const IGNORES = new Set([".git", ".github", "outils", "_site", "node_modules"]);

const modele = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");

/* Lit une liste « const NOM = [ … ]; » d'index.html. */
function liste(marque){
  const i = modele.indexOf(marque);
  if (i < 0) throw new Error(`liste introuvable : ${marque}`);
  const debut = modele.indexOf("[", i), fin = modele.indexOf("\n];", debut);
  return vm.runInNewContext("(" + modele.slice(debut, fin + 2) + ")");
}
/* Un article masqué n'a ni page ni place dans le plan du site. */
const ARTICLES = liste("const ARTICLES = [").filter(a => !a.masque);
const VERIFS = liste("const VERIFS=[");
const ATTENTES = liste("const ATTENTES=[");
const VERDICTS = { faux: "Faux", vrai: "Vrai", trompeur: "Trompeur", nonverifie: "Non vérifié" };
const NOTES = { faux: 1, trompeur: 2, vrai: 5 };   // échelle des fact-checks pour Google (ClaimReview)

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const court = (s, n = 200) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const dateFr = d => new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const image = p => p ? `${SITE}/${p.replace(/^\//, "")}` : null;

/* Remplace une balise du <head> du modèle ; échoue bruyamment si elle a disparu. */
function remplacer(html, motif, valeur){
  if (!motif.test(html)) throw new Error(`balise introuvable dans index.html : ${motif}`);
  return html.replace(motif, valeur);
}

/* Construit une page : le site complet (le même code l'affiche), avec un en-tête propre à la page
   et le contenu déjà écrit dans <main>, pour les robots qui n'exécutent pas JavaScript. */
function page({ url, titre, description, img, type = "article", contenu, jsonld }){
  let h = modele;
  const t = `${titre} · Mais quand ?`;
  h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">');
  h = remplacer(h, /<title>[^<]*<\/title>/, `<title>${esc(t)}</title>`);
  h = remplacer(h, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`);
  h = remplacer(h, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  h = remplacer(h, /<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${type}">`);
  h = remplacer(h, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(titre)}">`);
  h = remplacer(h, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`);
  h = remplacer(h, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  if (img) {
    /* Les dimensions de l'image de partage par défaut ne valent pas pour une photo d'article. */
    h = h.replace(/<meta property="og:image:width" content="[^"]*">\n?/, "").replace(/<meta property="og:image:height" content="[^"]*">\n?/, "");
    h = remplacer(h, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(img)}">`);
    h = remplacer(h, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(img)}">`);
  }
  if (jsonld) h = h.replace("</head>", `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>\n</head>`);
  h = remplacer(h, /<main id="app"><\/main>/, `<main id="app">${contenu}</main>`);
  return h;
}

function ecrire(rel, contenu){
  const f = path.join(SORTIE, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, contenu);
}
function copier(dossier){
  for (const nom of fs.readdirSync(path.join(RACINE, dossier))) {
    if (IGNORES.has(nom)) continue;
    const rel = path.join(dossier, nom), src = path.join(RACINE, rel);
    if (fs.statSync(src).isDirectory()) copier(rel);
    else { fs.mkdirSync(path.join(SORTIE, dossier), { recursive: true }); fs.copyFileSync(src, path.join(SORTIE, rel)); }
  }
}

fs.rmSync(SORTIE, { recursive: true, force: true });
copier("");
const plan = [{ loc: `${SITE}/`, lastmod: null, freq: "daily" }];

/* Articles */
for (const a of ARTICLES) {
  const url = `${SITE}/a/${a.id}/`, img = image(a.photo);
  const texte = Array.isArray(a.texte) ? a.texte : a.rap && a.rap.texte ? [a.rap.texte] : [];
  const description = court(a.chapo || texte[0] || a.titre);
  ecrire(`a/${a.id}/index.html`, page({
    url, titre: a.titre, description, img,
    contenu: `<article><span class="cat">${esc(a.cat || "")}</span><h1>${esc(a.titre)}</h1>${a.chapo ? `<p class="chapo">${esc(a.chapo)}</p>` : ""}<p class="meta">${esc(dateFr(a.date))}</p>${img ? `<img src="${esc(img)}" alt="">` : ""}${texte.map(p => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`).join("")}${a.rappelEncadre ? `<aside><strong>Le rappel</strong><blockquote>${esc(a.rappelEncadre.texte)}</blockquote><cite>${esc([a.rappelEncadre.ref, a.rappelEncadre.degre].filter(Boolean).join(" · "))}</cite>${a.rappelEncadre.sens ? `<p>${esc(a.rappelEncadre.sens)}</p>` : ""}</aside>` : ""}</article>`,
    jsonld: { "@context": "https://schema.org", "@type": "NewsArticle", headline: court(a.titre, 110), description,
      datePublished: a.date, dateModified: a.maj || a.date, inLanguage: "fr", mainEntityOfPage: url,
      ...(img ? { image: [img] } : {}), articleSection: a.cat,
      publisher: { "@type": "Organization", name: "Mais quand ?", url: `${SITE}/` } },
  }));
  plan.push({ loc: url, lastmod: a.maj || a.date, freq: "weekly" });
}

/* Vérifications « Vrai ou faux ? » */
for (const v of VERIFS) {
  const url = `${SITE}/v/${v.id}/`, verdict = VERDICTS[v.verdict] || v.verdict;
  ecrire(`v/${v.id}/index.html`, page({
    url, titre: `${verdict} : ${v.claim}`, description: court(v.conclusion),
    contenu: `<article><span class="cat">Vrai ou faux ? · ${esc(v.cat)}</span><h1>${esc(v.claim)}</h1><p><strong>${esc(verdict)}.</strong> ${esc(v.conclusion)}</p><h2>Ce qui circule</h2><p>${esc(v.circule)}</p><h2>Ce que nous avons vérifié</h2><ul>${(v.preuves || []).map(p => `<li>${esc(p)}</li>`).join("")}</ul></article>`,
    jsonld: { "@context": "https://schema.org", "@type": "ClaimReview", url, datePublished: v.d, inLanguage: "fr",
      claimReviewed: v.claim, author: { "@type": "Organization", name: "Mais quand ?", url: `${SITE}/` },
      reviewRating: { "@type": "Rating", alternateName: verdict,
        ...(NOTES[v.verdict] ? { ratingValue: NOTES[v.verdict], bestRating: 5, worstRating: 1 } : {}) } },
  }));
  plan.push({ loc: url, lastmod: v.d, freq: "monthly" });
}

/* Dates « Mais quand ? » */
for (const x of ATTENTES) {
  const url = `${SITE}/d/${x.id}/`, quand = dateFr(x.d);
  ecrire(`d/${x.id}/index.html`, page({
    url, titre: x.q, type: "website", description: court(`${quand.charAt(0).toUpperCase() + quand.slice(1)}${x.note ? " · " + x.note : ""} (${x.fd})`),
    contenu: `<article><span class="cat">${esc(x.c)} · Mais quand ?</span><h1>${esc(x.q)}</h1><p>${esc(quand)}</p>${x.note ? `<p>${esc(x.note)}</p>` : ""}${x.obs ? `<p>${esc(x.obs)}</p>` : ""}<p>Fiabilité : ${esc(x.fd)}</p></article>`,
  }));
  plan.push({ loc: url, lastmod: (x.hist && x.hist[0] && x.hist[0][0]) || null, freq: "weekly" });
}

/* Adresse inconnue : le site s'affiche quand même (page d'accueil). Remplace le 404.html de secours du dépôt. */
ecrire("404.html", modele.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">'));

ecrire("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${plan.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<changefreq>${u.freq}</changefreq></url>`).join("\n")}
</urlset>
`);

console.log(`Pages générées : ${ARTICLES.length} articles, ${VERIFS.length} vérifications, ${ATTENTES.length} dates ; plan du site : ${plan.length} adresses.`);
