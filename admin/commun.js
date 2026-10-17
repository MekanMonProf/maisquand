/* ===== Outils communs aux pages de l'administration =====
   Connexion avec la clé GitHub, lecture et écriture d'index.html, petites aides. */
const DEPOT = "MekanMonProf/maisquand", BRANCHE = "main", SITE = "https://maisquand.com/";
const API = `https://api.github.com/repos/${DEPOT}`;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const aujourdhui = () => new Date().toLocaleDateString("sv-SE");   // AAAA-MM-JJ, à la date locale
const dateLisible = d => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const lignes = t => t.split("\n").map(l => l.trim()).filter(Boolean);
function message(el, type, html){ el.innerHTML = html ? `<div class="msg ${type}">${html}</div>` : ""; }
function slug(t, n = 6){
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, n).join("-");
}
/* « Nom de la source https://lien » ↔ {n, u}. Le lien est facultatif. */
function lireSource(l){
  const m = l.match(/^(.*?)[\s:—–-]*\b(https?:\/\/[^\s"<>]+)\s*$/);
  return m ? { n: m[1].trim() || m[2], u: m[2] } : { n: l };
}
const ecrireSource = s => s.u ? `${s.n} ${s.u}` : s.n;

let cle = null;
cle = lireCle();   // clé déchiffrée par le code d'accès (verrou.js), ou null

/* ===== Accès à GitHub ===== */
async function gh(chemin, options = {}){
  const r = await fetch(API + chemin, {...options, headers: {
    "Accept":"application/vnd.github+json", "Authorization":`Bearer ${cle}`,
    "X-GitHub-Api-Version":"2022-11-28", ...(options.headers||{})}});
  if (!r.ok) {
    let detail = ""; try { detail = (await r.json()).message || ""; } catch (e) {}
    const err = new Error(detail || `Erreur ${r.status}`); err.status = r.status; throw err;
  }
  return r.status === 204 ? null : r.json();
}
/* Le contenu des fichiers circule en base64 ; on passe par UTF-8 pour garder les accents. */
const b64VersTexte = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), c => c.charCodeAt(0)));
function octetsVersB64(o){ let s = ""; for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000)); return btoa(s); }
const texteVersB64 = t => octetsVersB64(new TextEncoder().encode(t));

async function lireIndex(){
  const f = await gh(`/contents/index.html?ref=${BRANCHE}`);
  return { sha: f.sha, texte: b64VersTexte(f.content) };
}
async function ecrireFichier(chemin, contenuB64, messageCommit, sha){
  return gh(`/contents/${chemin}`, { method:"PUT", body: JSON.stringify({
    message: messageCommit, content: contenuB64, branch: BRANCHE, ...(sha ? {sha} : {}) }) });
}
/* Applique une transformation aux lignes d'index.html et enregistre, en recommençant
   si le fichier a changé entre-temps (409). */
async function modifierIndex(transformer, messageCommit){
  for (let essai = 0; ; essai++) {
    const { sha, texte } = await lireIndex();
    const lignesIdx = texte.split("\n");
    transformer(lignesIdx);
    try { await ecrireFichier("index.html", texteVersB64(lignesIdx.join("\n")), messageCommit, sha); return; }
    catch (err) { if (err.status !== 409 || essai >= 2) throw err; }
  }
}

/* ===== Listes d'index.html : un élément par ligne =====
   Entre « const NOM=[ » et la ligne « ]; ». Chaque ligne commence par la même clé JSON
   (prefixe), ce qui évite toute confusion avec les autres listes du site. */
function zone(lignesIdx, marque){
  const i0 = lignesIdx.findIndex(l => l.startsWith(marque));
  const fin = lignesIdx.findIndex((l, i) => i > i0 && /^\];/.test(l));
  if (i0 < 0 || fin < 0) throw new Error(`La liste « ${marque} » est introuvable dans index.html. Rien n'a été modifié.`);
  return { i0, fin };
}
const ligneDe = o => " " + JSON.stringify(o).replace(/</g, "\\u003c") + ",";
const lireLigne = l => JSON.parse(l.slice(1, -1));
function elements(lignesIdx, marque, prefixe){
  const { i0, fin } = zone(lignesIdx, marque), items = [];
  for (let i = i0 + 1; i < fin; i++) if (lignesIdx[i].startsWith(prefixe)) { try { items.push({ i, x: lireLigne(lignesIdx[i]) }); } catch (e) {} }
  return items;
}

/* ===== Connexion ===== */
function initConnexion(quandConnecte){
  async function connecter(nouvelle){
    cle = nouvelle;
    try {
      const d = await gh("");
      if (!d.permissions || !d.permissions.push) throw Object.assign(new Error("Cette clé ne permet pas d'écrire dans le dépôt."), {status:403});
      await garderCle(cle);   // chiffrée avec le code d'accès (verrou.js)
      $("#v-connexion").hidden = true; $("#v-redaction").hidden = false;
      quandConnecte();
    } catch (e) {
      cle = null;
      message($("#msg-connexion"), "err", e.status === 401 ? "Clé refusée par GitHub : vérifiez qu'elle est complète et qu'elle n'a pas expiré."
        : e.status === 403 || e.status === 404 ? "Cette clé n'a pas accès au dépôt maisquand en écriture. Revoyez ses autorisations (LISEZ-MOI.txt)."
        : esc(e.message));
    }
  }
  $("#connecter").onclick = () => { const v = $("#cle").value.trim(); if (v) connecter(v); };
  $("#deconnecter").onclick = () => { oublierCle(); location.reload(); };
  if (cle) connecter(cle);
}
