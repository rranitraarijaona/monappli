/* ============ 0. RÉGLAGES ============ */

/* Le mot de passe se change dans le fichier api.php (ligne MOT_DE_PASSE). */

/* ============ 1. LES DONNÉES DES LISTES ============ */

const DEMANDES = [
  "ABROGATION","AFFECTATION","ALLOCATION FAMILIALE","ANNULATION DE SOLDE",
  "ATTESTATION DE SOLVABILITE","AVANCEMENT AU CONTRAT","AVANCEMENT DE CLASSE",
  "AVANCEMENT D'ECHELON","AVENANT","AVENANT DE RECLASSEMENT","AVENANT AU CONTRAT",
  "BON DE CAISSE EN RETOUR","BONIFICATION","CHANGEMENT D'ASSIGNATION",
  "CHANGEMENT DE LOCALITE","CHANGEMENT DE MODE/COMPTE DE PAIEMENT",
  "CHANGEMENT DE VIREMENT BANCAIRE","CODE RUBRIQUE","COMPENSATRICE",
  "COMPLEMENT D'INSTALLATION","CONCESSION AGENT","CONCESSION ORPHELIN",
  "CONCESSION VEUF/VEUVE","CREATION IM/SOLDE",
  "CREATION ORDRE NATIONAL.BONIFICATION D'ANCIENNETE","DEMANDE MPE","DERNIER ARRERAGE",
  "DOSSIER","DOSSIER MERE","ENVELOPPE","INDEMNITE DE RISQUE","INSTALLATION","INTEGRATION","LIQUIDATION",
  "LIQUIDATION DES PENSIONS DE RETRAITE","MAJORATION DE SALAIRE",
  "MAJORATION D'INDICE","MANDATEMENT","MANDATEMENT D'AVENANT",
  "MANDATEMENT DE MAJORATION","MANDATEMENT DE RECLASSEMENT",
  "MANDATEMENT DE SOLDE","MANDATEMENT DERNIER ARRETE","MODIFICATION INDICE",
  "NOMINATION","NOTE DE SERVICE","PAIEMENT DE PENSIONS EXPIRES","PENSION ALIMENTAIRE",
  "PENSIONS PRESCRITES","PRIME EXCEPTIONNEL","RAPPEL","RAPPEL DE SOLDE",
  "RAPPEL DIFFERENTIEL MOINS PERCU","RAPPEL DIFFERENTIEL TROPPERCU",
  "RAPPEL D'INSTALLATION","RECLASSEMENT EFA","RECTIFICATION NOM/PRENOM/CIN",
  "REGULARISATION","REMANDATEMENT","RENOUVELLEMENT DE CONTRAT","REVERSION ON",
  "REVERSION ORPHELIN","REVERSION VEUF/VEUVE","REVISION BONIFICATION",
  "REVISION INDICE","REVISION MPE","REVISION PENSION","REVISION POURCENTAGE",
  "SECOURS AUX DECES","TITULARISATION","VALIDATION","VIREMENT BANCAIRE"
];

// Demandes pour lesquelles Nom + IM sont facultatifs
const SANS_AGENT = ["RAPPEL", "NOTE DE SERVICE", "ENVELOPPE", "DOSSIER", "DOSSIER MERE"];

const DIVISIONS = ["COORDO","VALIDATION","VISA","SOLDE","SECOURS AUX DECES","PENSIONS","CHEF DE SERVICE"];
const COULEURS_DIV = ["#00f0ff","#ff2bd6","#39ff88","#fff200","#ff8a3d","#8a5cff","#3d9bff"];

const RESPONSABLES = [
  { nom: "COORDO",         division: "COORDO" },
  { nom: "Mr ANDRY",       division: "VALIDATION" },
  { nom: "Mr ARNAUD",      division: "VISA" },
  { nom: "Mme Valisoa",    division: "VISA" },
  { nom: "Mr ROMARIO",     division: "VISA" },
  { nom: "Mr Tsialofana",  division: "VISA" },
  { nom: "Mme Bakoly",     division: "SOLDE" },
  { nom: "Mr Safidy",      division: "SOLDE" },
  { nom: "Mme Viviane",    division: "SOLDE" },
  { nom: "Mme Olivia",     division: "SOLDE" },
  { nom: "Mme Irène",      division: "SECOURS AUX DECES" },
  { nom: "Mr Jaona",        division: "PENSIONS" },
  { nom: "Mr Sitraka",     division: "PENSIONS" },
  { nom: "Mr Herizo",      division: "PENSIONS" },
  { nom: "Mme Fara",       division: "VISA" },
  { nom: "Chef de service", division: "CHEF DE SERVICE" },
  { nom: "Mme Rollandina",       division: "PENSIONS" },
  { nom: "Mme Manantena",       division: "PENSIONS" }
];

/* ============ 2. ÉTAT ET STOCKAGE ============ */
/* Un bordereau (BE) = { id, da, na, be, division, paraphe, resp, demandes: [ { id, demande, agents: [ {nom, im} ] } ] } */

let bordereaux = [];          // copie des données du serveur
let dernierSrv = 0;           // dernier N° Arrivée utilisé (mémorisé par le serveur)
let derniereEmpreinte = "";   // pour savoir si les données du serveur ont changé
let minuteur = null;
let occupe = false;           // évite un double clic sur ENREGISTRER
let demandesEnCours = [];     // demandes du bordereau en cours de saisie
let agentsEnCours = [];       // agents de la demande en cours de saisie
let idEnModification = null;
let demandeEnEdition = null;  // demande retirée du tableau pour être corrigée
let divisionFiltre = null;    // null = tous les dossiers
let selection = new Set();    // bordereaux cochés dans la liste (par id)
let clesVisibles = [];        // bordereaux actuellement affichés dans la liste

/* ----- Dialogue avec le serveur (api.php) ----- */

async function api(action, corps) {
  let rep;
  try {
    rep = await fetch("api.php?action=" + action, {
      method: corps === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "GeCo" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      cache: "no-store", credentials: "same-origin"
    });
  } catch (e) { throw new Error("Serveur injoignable. Vérifiez la connexion internet / réseau."); }
  let j = null;
  try { j = await rep.json(); } catch (e) {}
  if (rep.status === 401 && action !== "login") { retourConnexion("Session expirée : reconnectez-vous."); throw new Error("Session expirée : reconnectez-vous."); }
  if (!rep.ok || !j) throw new Error((j && j.erreur) || "Erreur du serveur (" + rep.status + "). Le serveur gère-t-il bien PHP ?");
  return j;
}

// écrit sur le serveur ; en cas de problème : message + on relit les données du serveur
async function ecrire(action, corps) {
  try { return await api(action, corps); }
  catch (e) { alert(e.message); chargerDonnees().catch(() => {}); return null; }
}

// lit toutes les données du serveur
async function chargerDonnees() {
  const j = await api("charger");
  const empreinte = JSON.stringify(j);
  const change = empreinte !== derniereEmpreinte;
  derniereEmpreinte = empreinte;
  if (!change) return;
  bordereaux = (j.bordereaux || []).map(migrerParaphe);
  dernierSrv = parseInt(j.dernier, 10) || 0;
  const ouvertEnSaisie = document.activeElement && document.activeElement.closest && document.activeElement.closest("#corps");
  if (document.getElementById("vue-liste").classList.contains("active") && !ouvertEnSaisie) afficherListe();
}

function majBadge(ok) {
  const etiquette = document.getElementById("badge-mode");
  etiquette.textContent = ok ? "☁ Données partagées (serveur)" : "⚠ Serveur injoignable";
  etiquette.className = "badge-mode " + (ok ? "ok" : "local");
}

function demarrerSynchro() {            // relit le serveur toutes les 15 secondes
  arreterSynchro();
  minuteur = setInterval(synchroniser, 15000);
}
function arreterSynchro() { if (minuteur) clearInterval(minuteur); minuteur = null; }
async function synchroniser() {
  if (document.hidden || !document.body.classList.contains("connecte")) return;
  try { await chargerDonnees(); majBadge(true); } catch (e) { majBadge(false); }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) synchroniser(); });

/* ----- N° Arrivée automatique : 0001 à 9999, puis retour à 0001 ----- */

function dernierNumero() {
  if (dernierSrv > 0) return dernierSrv;
  // Première utilisation : on repart du plus grand numéro déjà saisi
  let max = 0;
  bordereaux.forEach(b => {
    if (/^\d{1,4}$/.test(b.na.trim())) max = Math.max(max, parseInt(b.na, 10));
  });
  return max;
}

function prochainNumero() {
  const n = (dernierNumero() % 9999) + 1;      // après 9999 on revient à 1
  return String(n).padStart(4, "0");
}

/* ============ 3. NAVIGATION ============ */

function afficher(nom) {
  document.querySelectorAll(".vue").forEach(v => v.classList.remove("active"));
  document.getElementById("vue-" + nom).classList.add("active");
  document.body.classList.toggle("impression", nom === "bordereau");
  document.getElementById("btn-liste").classList.toggle("actif", nom === "liste" && divisionFiltre === null);
  document.getElementById("btn-form").classList.toggle("actif", nom === "form");
  DIVISIONS.forEach((d, i) => {
    document.getElementById("btn-div-" + i).classList.toggle("actif", nom === "liste" && divisionFiltre === d);
  });
  if (nom === "liste") afficherListe();
  window.scrollTo(0, 0);
}

// Affiche la liste de tous les dossiers (null) ou ceux d'une division
function voirListe(division) {
  divisionFiltre = division;
  selection.clear();
  document.getElementById("recherche").value = "";
  afficher("liste");
}

async function quitter() {
  if (!confirm("Fermer l'application GeCo SRSP ?")) return;
  arreterSynchro();
  try { await api("logout"); } catch (e) {}
  window.close();   // certains navigateurs refusent de fermer l'onglet
  document.body.innerHTML = "<div class='fin'><h2>Application fermée</h2><p>Vous pouvez fermer cet onglet.</p>" +
    "<button class='b' onclick='location.reload()'>Rouvrir</button></div>";
}

/* ============ 4. OUTILS ============ */

function normaliser(t) {   // minuscules, sans accents
  return String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function echapper(t) {     // évite les problèmes avec les apostrophes / balises
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function dateFr(d) {       // 2026-10-10 -> 10/10/2026
  if (!d) return "";
  const p = d.split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

// Colore dans un texte les morceaux qui correspondent à la recherche (sans tenir compte des accents)
function surligner(texte, termes) {
  texte = String(texte);
  if (!termes.length) return echapper(texte);
  let norm = "";
  const map = [];                       // map[i] = position d'origine du caractère norm[i]
  for (let i = 0; i < texte.length; i++) {
    const n = texte[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (let k = 0; k < n.length; k++) map.push(i);
    norm += n;
  }
  const marque = new Array(texte.length).fill(false);
  termes.forEach(t => {
    let pos = norm.indexOf(t);
    while (pos !== -1) {
      for (let k = pos; k < pos + t.length; k++) marque[map[k]] = true;
      pos = norm.indexOf(t, pos + t.length);
    }
  });
  let out = "", ouvert = false;
  for (let i = 0; i < texte.length; i++) {
    if (marque[i] && !ouvert) { out += "<mark>"; ouvert = true; }
    if (!marque[i] && ouvert) { out += "</mark>"; ouvert = false; }
    out += echapper(texte[i]);
  }
  if (ouvert) out += "</mark>";
  return out;
}

const ICO_MODIF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICO_VOIR  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';

/* ============ 5. DEMANDE : PROPOSITIONS PENDANT LA SAISIE ============ */

function trouverDemande(texte) {      // renvoie la demande de la liste (ou null)
  const t = normaliser(texte.trim());
  return DEMANDES.find(d => normaliser(d) === t) || null;
}

function majInfoAgent() {
  const d = trouverDemande(document.getElementById("f-demande").value);
  document.getElementById("info-agent").textContent = (d && SANS_AGENT.includes(d))
    ? "Nom et IM facultatifs pour cette demande (utiles surtout en cas de modification)."
    : "";
}

function proposer() {
  majInfoAgent();
  const saisie = normaliser(document.getElementById("f-demande").value.trim());
  const boite = document.getElementById("suggestions");
  const trouves = DEMANDES.filter(d => normaliser(d).includes(saisie));
  if (trouves.length === 0) { boite.style.display = "none"; return; }
  boite.innerHTML = trouves.map(d =>
    "<div onmousedown=\"choisirDemande(" + DEMANDES.indexOf(d) + ")\">" + echapper(d) + "</div>"
  ).join("");
  boite.style.display = "block";
}

function choisirDemande(index) {
  document.getElementById("f-demande").value = DEMANDES[index];
  document.getElementById("suggestions").style.display = "none";
  majInfoAgent();
}

function cacherSuggestions() {
  setTimeout(() => { document.getElementById("suggestions").style.display = "none"; }, 150);
}

/* ============ 6. AGENTS DE LA DEMANDE EN COURS ============ */

function ajouterAgent() {
  const nom = document.getElementById("a-nom").value.trim();
  const im = document.getElementById("a-im").value.trim();
  if (!nom || !im) { alert("Saisissez le Nom et l'IM."); return; }
  agentsEnCours.push({ nom, im });
  document.getElementById("a-nom").value = "";
  document.getElementById("a-im").value = "";
  document.getElementById("a-nom").focus();
  afficherAgents();
}

function retirerAgent(i) {
  agentsEnCours.splice(i, 1);
  afficherAgents();
}

function afficherAgents() {
  const c = document.getElementById("corps-agents");
  if (agentsEnCours.length === 0) {
    c.innerHTML = "<tr><td colspan='3' class='vide'>Aucun agent ajouté</td></tr>";
    return;
  }
  c.innerHTML = agentsEnCours.map((a, i) =>
    "<tr><td>" + echapper(a.nom) + "</td><td>" + echapper(a.im) + "</td>" +
    "<td><button class='b danger petit' onclick='retirerAgent(" + i + ")'>X</button></td></tr>"
  ).join("");
}

/* ============ 7. DEMANDES DU BORDEREAU EN COURS ============ */

function ajouterDemande() {
  const demande = trouverDemande(document.getElementById("f-demande").value);

  if (!demande) { alert("Choisissez une demande dans la liste proposée."); return; }
  if (agentsEnCours.length === 0 && !SANS_AGENT.includes(demande)) {
    alert("Ajoutez au moins un agent (Nom + IM)."); return;
  }

  const fiche = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    demande,
    agents: agentsEnCours.map(a => ({ ...a }))
  };

  if (demandeEnEdition) {   // on remet la demande corrigée à sa place
    fiche.id = demandeEnEdition.id;
    demandesEnCours.splice(demandeEnEdition.index, 0, fiche);
    demandeEnEdition = null;
  } else {
    demandesEnCours.push(fiche);
  }

  // On vide le sous-formulaire pour la demande suivante
  agentsEnCours = [];
  document.getElementById("f-demande").value = "";
  majInfoAgent();
  afficherAgents();
  afficherDemandes();
}

// Recharge une demande du bordereau dans le sous-formulaire pour la corriger
function editerDemande(i) {
  if (demandeEnEdition) { alert("Validez d'abord la demande en cours de modification."); return; }
  const d = demandesEnCours[i];
  demandeEnEdition = { id: d.id, index: i };
  demandesEnCours.splice(i, 1);
  agentsEnCours = d.agents.map(a => ({ ...a }));
  document.getElementById("f-demande").value = d.demande;
  majInfoAgent();
  afficherAgents();
  afficherDemandes();
}

function retirerDemande(i) {
  demandesEnCours.splice(i, 1);
  afficherDemandes();
}

function afficherDemandes() {
  const c = document.getElementById("corps-demandes");
  if (demandesEnCours.length === 0) {
    c.innerHTML = "<tr><td colspan='3' class='vide'>Aucune demande ajoutée</td></tr>";
    return;
  }
  c.innerHTML = demandesEnCours.map((d, i) =>
    "<tr><td>" + echapper(d.demande) + "</td>" +
    "<td>" + (d.agents.length ? d.agents.map(a => echapper(a.nom) + " — " + echapper(a.im)).join("<br>") : "—") + "</td>" +
    "<td style='white-space:nowrap'><button class='b petit' onclick='editerDemande(" + i + ")'>Modifier</button> " +
    "<button class='b danger petit' onclick='retirerDemande(" + i + ")'>X</button></td></tr>"
  ).join("");
}

/* ============ 8. NOUVEL ENREGISTREMENT / MODIFICATION ============ */

async function nouveau() {
  try { await chargerDonnees(); } catch (e) {}
  idEnModification = null;
  demandeEnEdition = null;
  demandesEnCours = [];
  agentsEnCours = [];
  document.getElementById("titre-form").textContent = "Nouvel enregistrement";
  document.getElementById("f-da").value = new Date().toISOString().slice(0, 10);
  ["f-na", "f-be", "f-demande", "a-nom", "a-im"].forEach(i => document.getElementById(i).value = "");
  document.getElementById("f-na").value = prochainNumero();
  document.getElementById("f-na").readOnly = false;   // modifiable : la suite repart du numéro saisi
  document.getElementById("f-division").value = "";
  majInfoAgent();
  afficherAgents();
  afficherDemandes();
  afficher("form");
}

function chargerPourModifier() {
  const na = prompt("N° Arrivée du bordereau à modifier :");
  if (!na) return;
  const num = /^\d+$/.test(na.trim()) ? parseInt(na, 10) : null;   // "1" retrouve "0001"
  const b = bordereaux.find(x => x.na.trim() === na.trim() ||
    (num !== null && /^\d+$/.test(x.na.trim()) && parseInt(x.na, 10) === num));
  if (!b) { alert("Aucun bordereau avec ce N° Arrivée."); return; }
  chargerBordereau(b.id);
}

// Ouvre un bordereau existant dans le formulaire (icône Modifier de la liste)
function chargerBordereau(id) {
  const b = bordereaux.find(x => x.id === id);
  if (!b) return;
  idEnModification = b.id;
  demandeEnEdition = null;
  demandesEnCours = JSON.parse(JSON.stringify(b.demandes));
  agentsEnCours = [];
  document.getElementById("titre-form").textContent = "Modifier le bordereau " + b.na;
  document.getElementById("f-da").value = b.da;
  document.getElementById("f-na").value = b.na;
  document.getElementById("f-na").readOnly = true;    // on ne change pas le numéro d'un bordereau existant
  document.getElementById("f-be").value = b.be;
  document.getElementById("f-division").value = b.division || "";
  ["f-demande", "a-nom", "a-im"].forEach(i => document.getElementById(i).value = "");
  majInfoAgent();
  afficherAgents();
  afficherDemandes();
  afficher("form");
}

async function enregistrer() {
  if (occupe) return;
  const da = document.getElementById("f-da").value;
  let na = document.getElementById("f-na").value.trim();
  const be = document.getElementById("f-be").value.trim();
  const division = document.getElementById("f-division").value;

  if (demandeEnEdition) { alert("Validez d'abord la demande en cours de modification (bouton « Valider la demande »)."); return; }
  if (!da || !na) { alert("La date d'arrivée et le N° Arrivée sont obligatoires."); return; }
  if (demandesEnCours.length === 0) { alert("Ajoutez au moins une demande au bordereau (bouton « Valider la demande »)."); return; }
  if (!division) { alert("Choisissez la division."); return; }

  // Nouveau bordereau : le N° Arrivée saisi doit être un nombre de 1 à 9999 (mis sur 4 chiffres)
  if (idEnModification === null) {
    const n = parseInt(na, 10);
    if (!/^\d{1,4}$/.test(na) || n < 1) { alert("Le N° Arrivée doit être un nombre de 1 à 9999."); return; }
    na = String(n).padStart(4, "0");
    document.getElementById("f-na").value = na;
    if (bordereaux.some(x => x.na.trim() === na) &&
        !confirm("Le N° Arrivée " + na + " existe déjà. Enregistrer quand même ?")) return;
  }

  // Le paraphe est par bordereau : on conserve celui déjà donné (le responsable doit appartenir à la division)
  const ancien = idEnModification !== null ? bordereaux.find(x => x.id === idEnModification) : null;
  const paraphe = ancien ? !!ancien.paraphe : false;
  let resp = ancien ? (ancien.resp || "") : "";
  if (resp && !RESPONSABLES.some(r => r.nom === resp && r.division === division)) resp = "";

  const fiche = { da, na, be, division, paraphe, resp, demandes: demandesEnCours };
  const complet = { id: idEnModification !== null ? idEnModification : Date.now(), ...fiche };

  occupe = true;
  try {
    if (!(await ecrire("enregistrer", { bordereau: complet }))) return;
    const i = bordereaux.findIndex(x => x.id === complet.id);
    if (i >= 0) bordereaux[i] = complet; else bordereaux.push(complet);
    if (idEnModification === null) {
      dernierSrv = parseInt(na, 10);                       // le numéro est consommé
      await ecrire("compteur", { dernier: dernierSrv });
    }
    derniereEmpreinte = "";                                // forcera une relecture propre
    alert("Enregistré !");
    afficher("liste");
  } finally { occupe = false; }
}

/* ============ 9. LISTES : AFFICHAGE, RECHERCHE, SÉLECTION ============ */

function majParaphe(bid, coche) {          // un paraphe par bordereau
  const b = bordereaux.find(x => x.id === bid);
  b.paraphe = coche;
  if (document.activeElement) document.activeElement.blur();   // la liste pourra se mettre à jour toute seule
  ecrire("champ", { id: bid, paraphe: coche });
}

function majResp(bid, valeur) {
  const b = bordereaux.find(x => x.id === bid);
  b.resp = valeur;
  if (document.activeElement) document.activeElement.blur();
  ecrire("champ", { id: bid, resp: valeur });
}

// Anciennes données : le paraphe était par demande, il est maintenant par bordereau
function migrerParaphe(b) {
  if (typeof b.paraphe === "boolean") return b;
  b.paraphe = b.demandes.length > 0 && b.demandes.every(d => d.paraphe);
  b.resp = (b.demandes.find(d => d.resp) || {}).resp || "";
  return b;
}

function selectionVisible() {            // seuls les bordereaux affichés comptent
  return clesVisibles.filter(c => selection.has(c));
}

function majBoutonSuppression() {
  const n = selectionVisible().length;
  const btn = document.getElementById("btn-suppr-sel");
  btn.disabled = n === 0;
  btn.textContent = "Supprimer la sélection (" + n + ")";
  const tout = document.getElementById("tout-sel");
  tout.checked = clesVisibles.length > 0 && n === clesVisibles.length;
  tout.indeterminate = n > 0 && n < clesVisibles.length;
}

function cocherLigne(id, caseCochee) {
  if (caseCochee.checked) selection.add(id); else selection.delete(id);
  document.querySelectorAll("#corps tr[data-b='" + id + "']").forEach(tr => tr.classList.toggle("sel", caseCochee.checked));
  majBoutonSuppression();
}

function toutSelectionner(coche) {
  clesVisibles.forEach(c => { if (coche) selection.add(c); else selection.delete(c); });
  afficherListe();
}

async function supprimerSelection() {
  const ids = new Set(selectionVisible());
  if (ids.size === 0) return;
  if (!confirm("Supprimer définitivement " + ids.size + " bordereau(x) sélectionné(s), avec toutes leurs demandes ?\nCette action est irréversible.")) return;
  if (!(await ecrire("supprimer", { ids: [...ids] }))) return;
  bordereaux = bordereaux.filter(b => !ids.has(b.id));
  ids.forEach(id => selection.delete(id));
  afficherListe();
}

function afficherListe() {
  const termes = normaliser(document.getElementById("recherche").value.trim()).split(/\s+/).filter(Boolean);
  const H = t => surligner(t, termes);

  // Un bloc par bordereau, avec ses demandes qui correspondent à la recherche
  const groupes = [];
  bordereaux.forEach(b => {
    if (divisionFiltre && b.division !== divisionFiltre) return;
    const ds = b.demandes.filter(d => {
      if (!termes.length) return true;
      const texte = normaliser([
        dateFr(b.da), b.da, b.na, b.be, b.division, d.demande, b.resp,
        d.agents.map(a => a.nom + " " + a.im).join(" ")
      ].join(" "));
      return termes.every(t => texte.includes(t));
    });
    if (ds.length) groupes.push({ b, ds });
  });

  document.getElementById("titre-liste").textContent =
    divisionFiltre ? "Division : " + divisionFiltre : "Tous les dossiers";

  // Statistiques (sur la vue : tous les dossiers ou la division choisie)
  const base = bordereaux.filter(b => !divisionFiltre || b.division === divisionFiltre);
  const nbDem = base.reduce((s, b) => s + b.demandes.length, 0);
  const tuile = (titre, n, c) => "<div class='tuile' style='--c:" + c + "'><small>" + titre + "</small><b>" + n + "</b></div>";
  document.getElementById("stats").innerHTML =
    tuile("Bordereaux", base.length, "var(--cyan)") +
    tuile("Demandes", nbDem, "var(--pink)");

  clesVisibles = groupes.map(g => g.b.id);
  majBoutonSuppression();

  const corps = document.getElementById("corps");
  if (groupes.length === 0) {
    corps.innerHTML = "<tr><td colspan='11' class='vide'>Aucun enregistrement</td></tr>";
    return;
  }

  corps.innerHTML = groupes.map(({ b, ds }, gi) => {
    const cochee = selection.has(b.id);
    const choix = RESPONSABLES.filter(r => r.division === b.division);
    const options = "<option value=''>--</option>" + choix.map(r =>
      "<option" + (r.nom === b.resp ? " selected" : "") + ">" + echapper(r.nom) + "</option>"
    ).join("");
    return ds.map((d, k) => {
      const premiere = k === 0;
      let tr = "<tr data-b='" + b.id + "' class='g" + (gi % 2) + (premiere ? " debut" : "") + (cochee ? " sel" : "") + "'>";
      if (premiere) {      // ces cellules ne s'affichent qu'une fois par bordereau
        const rs = " rowspan='" + ds.length + "'";
        tr += "<td" + rs + " class='centre'><input type='checkbox' " + (cochee ? "checked" : "") +
                " onchange='cocherLigne(" + b.id + ", this)'></td>" +
              "<td" + rs + ">" + H(dateFr(b.da)) + "</td>" +
              "<td" + rs + "><b>" + H(b.na) + "</b></td>" +
              "<td" + rs + ">" + H(b.be) + "</td>";
      }
      tr += "<td>" + (d.agents.length ? d.agents.map(a => H(a.im)).join("<br>") : "<span class='muted'>—</span>") + "</td>" +
            "<td>" + (d.agents.length ? d.agents.map(a => H(a.nom)).join("<br>") : "<span class='muted'>—</span>") + "</td>" +
            "<td>" + H(d.demande) + "</td>";
      if (premiere) {      // division, paraphé et responsable : une seule fois par bordereau
        const rs = " rowspan='" + ds.length + "'";
        tr += "<td" + rs + ">" + H(b.division) + "</td>" +
              "<td" + rs + " class='centre'><input type='checkbox' " + (b.paraphe ? "checked" : "") +
                " onchange='majParaphe(" + b.id + ",this.checked)'></td>" +
              "<td" + rs + "><select onchange='majResp(" + b.id + ",this.value)'>" + options + "</select></td>";
      }
      if (premiere) {
        tr += "<td rowspan='" + ds.length + "'><div class='cellule-actions'>" +
          "<button class='icone modif' title='Modifier' aria-label='Modifier' onclick='chargerBordereau(" + b.id + ")'>" + ICO_MODIF + "</button>" +
          "<button class='icone voir' title='Afficher (bordereau imprimable)' aria-label='Afficher' onclick='afficherBordereau(" + b.id + ")'>" + ICO_VOIR + "</button>" +
          "</div></td>";
      }
      return tr + "</tr>";
    }).join("");
  }).join("");
}

/* ============ 10. BORDEREAU IMPRIMABLE (bouton Afficher) ============ */

function afficherBordereau(id) {
  const b = bordereaux.find(x => x.id === id);
  if (!b) return;
  let total = 0;
  const blocs = b.demandes.map((d, i) => {
    const n = d.agents.length || 1;          // une demande sans agent compte pour 1 dossier
    total += n;
    const lignes = d.agents.length
      ? d.agents.map((a, j) => "<tr><td class='num'>" + (j + 1) + "</td><td>" + echapper(a.nom) + "</td><td>" + echapper(a.im) + "</td></tr>").join("")
      : "<tr><td colspan='3' class='vide'>—</td></tr>";
    return "<div class='bloc'><div class='dem'>Demande (" + (i + 1) + ") : <b>" + echapper(d.demande) + "</b>" +
           "<span class='nb'>" + n + " dossier(s)</span></div>" +
           "<table><thead><tr><th>N°</th><th>Nom</th><th>IM</th></tr></thead><tbody>" + lignes + "</tbody></table></div>";
  }).join("");

  document.getElementById("feuille").innerHTML =
    "<div class='tete'><small>SRSP</small><h2>BORDEREAU D'ARRIVÉE</h2></div>" +
    "<div class='infos'>" +
      "<div><span>Date arrivée :</span> <b>" + echapper(dateFr(b.da)) + "</b></div>" +
      "<div><span>N° Arrivée :</span> <b>" + echapper(b.na) + "</b></div>" +
      "<div><span>N° BE EXP :</span> <b>" + echapper(b.be || "—") + "</b></div>" +
    "</div>" + blocs +
    "<div class='total'><span>Nombre total des dossiers</span><b>" + total + "</b></div>" +
    "<div class='division'>Division : <b>" + echapper(b.division) + "</b></div>";
  afficher("bordereau");
}

/* ============ 11. CONNEXION (mot de passe seulement) ============ */

function voirMdp() {
  const c = document.getElementById("l-mdp");
  c.type = c.type === "password" ? "text" : "password";
}

function erreurLogin(msg) {
  document.getElementById("l-erreur").textContent = msg;
  const boite = document.getElementById("login-boite");
  boite.classList.remove("tremble");
  void boite.offsetWidth;                       // relance l'animation
  if (msg) boite.classList.add("tremble");
}

function etatLogin(texte, classe) {
  const e = document.getElementById("l-etat");
  e.textContent = texte;
  e.className = "etat " + (classe || "");
}

async function ouvrirSession() {
  await chargerDonnees();
  document.getElementById("l-mdp").value = "";
  document.getElementById("l-erreur").textContent = "";
  document.body.classList.add("connecte");
  majBadge(true);
  afficher("liste");
  demarrerSynchro();
}

function retourConnexion(message) {      // affiche à nouveau l'écran du mot de passe
  arreterSynchro();
  document.body.classList.remove("connecte");
  document.getElementById("l-erreur").textContent = message || "";
  document.getElementById("l-mdp").focus();
}

async function seConnecter() {
  const mdp = document.getElementById("l-mdp").value;
  const btn = document.getElementById("l-btn");
  if (!mdp) { erreurLogin("Saisissez le mot de passe."); return; }
  btn.disabled = true;
  try {
    await api("login", { mdp });
    await ouvrirSession();
  } catch (e) {
    erreurLogin(e.message);
  } finally { btn.disabled = false; }
}

/* ============ 11b. SAUVEGARDE SUR LE DISQUE DE L'ORDINATEUR ============ */

function majInfoSauvegarde() {
  let d = null;
  try { d = localStorage.getItem("geco_derniere_sauvegarde"); } catch (e) {}
  document.getElementById("info-sauvegarde").textContent =
    d ? "Dernière sauvegarde : " + dateFr(d) : "Aucune sauvegarde faite sur ce navigateur";
}

// Enregistre tous les bordereaux dans un fichier .json (dossier Téléchargements)
async function sauvegarder() {
  try { await chargerDonnees(); } catch (e) { alert(e.message); return; }
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const contenu = JSON.stringify({
    application: "GeCo SRSP", date: aujourdhui, dernier: dernierNumero(), bordereaux: bordereaux
  }, null, 2);
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([contenu], { type: "application/json" }));
  lien.download = "geco-sauvegarde-" + aujourdhui + ".json";
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 2000);
  try { localStorage.setItem("geco_derniere_sauvegarde", aujourdhui); } catch (e) {}
  majInfoSauvegarde();
}

function sauvegardeValide(liste) {
  return Array.isArray(liste) && liste.every(b =>
    b && typeof b.id === "number" && typeof b.na === "string" && Array.isArray(b.demandes) &&
    b.demandes.every(d => d && Array.isArray(d.agents)));
}

// Recharge les données depuis un fichier de sauvegarde choisi par l'utilisateur
function restaurer(fichier) {
  if (!fichier) return;
  const lecteur = new FileReader();
  lecteur.onload = async () => {
    let contenu = null;
    try { contenu = JSON.parse(lecteur.result); } catch (e) {}
    const liste = contenu && (Array.isArray(contenu) ? contenu : contenu.bordereaux);
    if (!sauvegardeValide(liste)) { alert("Ce fichier n'est pas une sauvegarde GeCo valide."); return; }
    if (!confirm("Remplacer les " + bordereaux.length + " bordereau(x) actuel(s) par les " + liste.length +
                 " du fichier ?\nCette action est irréversible : pensez à faire une sauvegarde avant.")) return;
    const corps = { bordereaux: liste.map(migrerParaphe) };
    if (contenu && Number.isInteger(contenu.dernier)) corps.dernier = contenu.dernier;
    if (!(await ecrire("remplacer", corps))) return;
    derniereEmpreinte = "";
    try { await chargerDonnees(); } catch (e) {}
    selection.clear();
    afficherListe();
    alert("Sauvegarde restaurée : " + bordereaux.length + " bordereau(x).");
  };
  lecteur.readAsText(fichier);
  document.getElementById("fichier-restauration").value = "";   // permet de rechoisir le même fichier
}

/* ============ 12. DÉMARRAGE ============ */

document.getElementById("btn-divisions").innerHTML = DIVISIONS.map((d, i) =>
  "<button class='div' id='btn-div-" + i + "' style='--c:" + COULEURS_DIV[i] + "' onclick='voirListe(DIVISIONS[" + i + "])'>" + d + "</button>"
).join("");

document.getElementById("f-division").innerHTML =
  "<option value=''>-- Choisir la division --</option>" +
  DIVISIONS.map(d => "<option>" + d + "</option>").join("");

afficherAgents();
afficherDemandes();
afficherListe();
majInfoSauvegarde();

// Au démarrage : si on est déjà connecté (même navigateur), on entre directement
(async () => {
  if (location.protocol === "file:") {
    etatLogin("⚠ Ouvrez l'application par l'adresse du serveur, pas en double-cliquant sur le fichier", "ko");
    return;
  }
  try {
    const j = await api("session");
    etatLogin("● Données partagées sur le serveur", "ok");
    if (j.connecte) { await ouvrirSession(); return; }
  } catch (e) {
    etatLogin("⚠ " + e.message, "ko");
  }
  document.getElementById("l-mdp").focus();
})();
