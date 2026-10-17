/* ===== Verrou de l'administration =====
   La clé GitHub n'est jamais gardée en clair sur l'appareil : elle est chiffrée (AES-GCM)
   avec un code d'accès choisi par l'éditeur (dérivé par PBKDF2). Une fois le code saisi,
   la clé déchiffrée vit seulement le temps de la session (sessionStorage) et l'application
   se reverrouille après INACTIVITE minutes sans action, ou à sa fermeture.
   À charger avant tout autre script de la page. Fournit lireCle(), garderCle(), oublierCle(), aCle(). */
(function () {
  const CHIFFREE = "mq-cle-chiffree", SESSION = "mq-cle-session", EXPIRE = "mq-cle-expire", ESSAIS = "mq-cle-essais";
  const ANCIENNE = "mq-redaction-cle";           // ancienne clé en clair, à migrer
  const INACTIVITE = 10 * 60 * 1000, ITERATIONS = 310000, ESSAIS_MAX = 10;
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
               del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
               del: k => { try { sessionStorage.removeItem(k); } catch (e) {} } };

  /* ----- Chiffrement ----- */
  const b64 = o => btoa(String.fromCharCode(...new Uint8Array(o)));
  const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function cleDeCode(code, sel){
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sel, iterations: ITERATIONS, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function chiffrer(texte, code){
    const sel = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const donnees = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cleDeCode(code, sel), new TextEncoder().encode(texte));
    return JSON.stringify({ v: 1, sel: b64(sel), iv: b64(iv), d: b64(donnees) });
  }
  async function dechiffrer(paquet, code){
    const p = JSON.parse(paquet);
    const clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(p.iv) }, await cleDeCode(code, deB64(p.sel)), deB64(p.d));
    return new TextDecoder().decode(clair);
  }

  /* ----- Session ----- */
  const prolonger = () => ss.set(EXPIRE, String(Date.now() + INACTIVITE));
  const expiree = () => !(+ss.get(EXPIRE) > Date.now());
  function verrouiller(){ ss.del(SESSION); ss.del(EXPIRE); location.reload(); }

  window.verrouillerMaintenant = verrouiller;
  window.aCle = () => !!ls.get(CHIFFREE);
  window.lireCle = () => (ls.get(CHIFFREE) && ss.get(SESSION) && !expiree()) ? ss.get(SESSION) : null;
  window.oublierCle = () => { ls.del(CHIFFREE); ls.del(ANCIENNE); ls.del(ESSAIS); ss.del(SESSION); ss.del(EXPIRE); };
  /* Enregistre une clé GitHub validée : demande de choisir un code si elle n'est pas déjà protégée. */
  window.garderCle = async (cle) => {
    if (ls.get(CHIFFREE) && ss.get(SESSION) === cle) { prolonger(); return; }
    const code = await demanderCode("creer");
    if (!code) throw new Error("Choisissez un code d'accès pour protéger votre clé sur cet appareil.");
    ls.set(CHIFFREE, await chiffrer(cle, code)); ls.del(ANCIENNE); ls.del(ESSAIS);
    ss.set(SESSION, cle); prolonger();
  };

  /* ----- Fenêtre du code ----- */
  function demanderCode(mode, erreur){
    return new Promise(ok => {
      const fond = document.createElement("div");
      fond.setAttribute("role", "dialog"); fond.setAttribute("aria-modal", "true");
      fond.style.cssText = "position:fixed;inset:0;z-index:9999;background:var(--bg,#f6f7f9);display:grid;place-items:center;padding:16px";
      const creer = mode === "creer";
      fond.innerHTML = `<form style="width:100%;max-width:380px;background:var(--surface,#fff);border:1px solid var(--line,#dde3e8);border-radius:16px;padding:24px;display:grid;gap:14px;font-family:var(--body,Georgia,serif)">
        <div style="display:flex;gap:12px;align-items:center"><img src="icones/admin-192.png" alt="" width="44" height="44" style="border-radius:10px"><h2 style="margin:0;font-family:var(--display,system-ui);font-size:1.25rem">${creer ? "Choisissez un code d'accès" : "Code d'accès"}</h2></div>
        <p style="margin:0;color:var(--muted,#5b6b78);font-size:.92rem">${creer
          ? "Il protège votre clé GitHub sur cet appareil : sans ce code, personne ne pourra publier depuis ce téléphone. Au moins 6 caractères, différent du code de déverrouillage du téléphone."
          : "L'administration est verrouillée. Saisissez votre code pour continuer."}</p>
        <input type="password" autocomplete="${creer ? "new-password" : "current-password"}" inputmode="text" placeholder="Code" aria-label="Code d'accès" required minlength="${creer ? 6 : 1}" style="font:inherit;font-size:1.1rem;padding:12px;border:1px solid var(--line,#dde3e8);border-radius:10px;background:var(--bg,#f6f7f9);color:inherit">
        ${creer ? `<input type="password" autocomplete="new-password" placeholder="Retapez le code" aria-label="Confirmer le code" required style="font:inherit;font-size:1.1rem;padding:12px;border:1px solid var(--line,#dde3e8);border-radius:10px;background:var(--bg,#f6f7f9);color:inherit">` : ""}
        <p class="err" style="margin:0;color:var(--err,#c8372d);font-size:.92rem" role="alert">${erreur || ""}</p>
        <button type="submit" style="border:0;border-radius:999px;padding:12px 20px;font:600 1rem var(--display,system-ui);background:var(--accent,#1f6b3a);color:#fff;cursor:pointer">${creer ? "Protéger ma clé" : "Déverrouiller"}</button>
        ${creer ? `<button type="button" data-annuler style="border:1px solid var(--line,#dde3e8);border-radius:999px;padding:10px 20px;font:600 .95rem var(--display,system-ui);background:transparent;color:var(--accent,#1f6b3a);cursor:pointer">Annuler</button>`
                : `<button type="button" data-oubli style="border:0;background:none;color:var(--muted,#5b6b78);font:inherit;font-size:.88rem;text-decoration:underline;cursor:pointer">Code oublié ? Effacer la clé de cet appareil</button>`}
      </form>`;
      document.body.appendChild(fond);
      const champs = fond.querySelectorAll("input"), err = fond.querySelector(".err");
      champs[0].focus();
      fond.querySelector("form").onsubmit = e => {
        e.preventDefault();
        if (creer && champs[0].value !== champs[1].value) { err.textContent = "Les deux codes ne sont pas identiques."; return; }
        fond.remove(); ok(champs[0].value);
      };
      const annuler = fond.querySelector("[data-annuler]"); if (annuler) annuler.onclick = () => { fond.remove(); ok(null); };
      const oubli = fond.querySelector("[data-oubli]");
      if (oubli) oubli.onclick = () => {
        if (!confirm("Effacer la clé GitHub de cet appareil ? Vous devrez la coller à nouveau et choisir un nouveau code.")) return;
        oublierCle(); location.reload();
      };
    });
  }

  /* ----- Au chargement ----- */
  async function deverrouiller(erreur){
    const code = await demanderCode("ouvrir", erreur);
    try {
      const cle = await dechiffrer(ls.get(CHIFFREE), code);
      ls.del(ESSAIS); ss.set(SESSION, cle); prolonger(); location.reload();
    } catch (e) {
      const n = (+ls.get(ESSAIS) || 0) + 1; ls.set(ESSAIS, String(n));
      if (n >= ESSAIS_MAX) { oublierCle(); alert("Trop de codes erronés : la clé a été effacée de cet appareil par sécurité. Collez-la à nouveau pour continuer."); location.reload(); return; }
      if (n >= 5) await new Promise(r => setTimeout(r, (n - 4) * 5000));   // ralentit les essais au hasard
      deverrouiller(`Code incorrect (${n} essai${n > 1 ? "s" : ""} sur ${ESSAIS_MAX}).`);
    }
  }
  function demarrer(){
    if (!ls.get(CHIFFREE)) {
      /* Ancienne clé gardée en clair : on la protège tout de suite. */
      const ancienne = ls.get(ANCIENNE);
      if (ancienne) garderCle(ancienne).then(() => location.reload(), () => { oublierCle(); location.reload(); });
      return;
    }
    if (!lireCle()) { ss.del(SESSION); deverrouiller(); return; }
    /* Session ouverte : chaque action la prolonge ; sans action pendant INACTIVITE, on verrouille. */
    ["pointerdown", "keydown", "input"].forEach(t => addEventListener(t, prolonger, { passive: true }));
    const controle = () => { if (ss.get(SESSION) && expiree()) verrouiller(); };
    setInterval(controle, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) controle(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
