/* ============ BORDEREAU EN FICHIER PDF ============ */
/* Fabrique un vrai fichier PDF (sans aucune bibliothèque) : il s'ouvre sur tous les appareils. */

const PDF_L = { " ":278,"!":278,'"':355,"#":556,"$":556,"%":889,"&":667,"'":191,"(":333,")":333,"*":389,"+":584,",":278,"-":333,".":278,"/":278,
  ":":278,";":278,"<":584,"=":584,">":584,"?":556,"@":1015,"[":278,"\\":278,"]":278,"^":469,"_":556,"`":333,"{":334,"|":260,"}":334,"~":584 };
"0123456789".split("").forEach(c => PDF_L[c] = 556);
[667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611]
  .forEach((w, i) => PDF_L[String.fromCharCode(65 + i)] = w);
[556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500]
  .forEach((w, i) => PDF_L[String.fromCharCode(97 + i)] = w);

// largeur approximative d'un texte (en points)
function pdfLargeur(t, gras, taille) {
  let s = 0;
  for (const c of String(t)) {
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    s += PDF_L[base] || 556;
  }
  return s * taille / 1000 * (gras ? 1.06 : 1);
}

// texte -> octets Windows-1252 (accents français OK), échappé pour le PDF
function pdfTexte(t) {
  const spec = { 8364: 128, 338: 140, 339: 156, 8230: 133, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151, 338: 140, 339: 156, 352: 138, 353: 154, 376: 159, 381: 142, 382: 158 };
  let o = "";
  for (const ch of String(t)) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c < 127) o += ch;
    else if (c >= 160 && c <= 255) o += String.fromCharCode(c);
    else if (spec[c]) o += String.fromCharCode(spec[c]);
    else o += c < 32 ? " " : "?";
  }
  return o.replace(/[\\()]/g, "\\$&");
}

// coupe un texte en lignes qui tiennent dans une largeur donnée
function pdfLignes(t, larg, gras, taille) {
  const out = [];
  let ligne = "";
  String(t).split(/\s+/).filter(Boolean).forEach(mot => {
    while (pdfLargeur(mot, gras, taille) > larg) {          // mot trop long : on le coupe
      let k = mot.length - 1;
      while (k > 1 && pdfLargeur(mot.slice(0, k), gras, taille) > larg) k--;
      if (ligne) { out.push(ligne); ligne = ""; }
      out.push(mot.slice(0, k)); mot = mot.slice(k);
    }
    const essai = ligne ? ligne + " " + mot : mot;
    if (ligne && pdfLargeur(essai, gras, taille) > larg) { out.push(ligne); ligne = mot; } else ligne = essai;
  });
  if (ligne) out.push(ligne);
  return out.length ? out : [""];
}

function creerPDF(liste) {
  const W = 595, H = 842, M = 50, BAS = 790, LT = W - 2 * M;
  const pages = [];
  let ops, y;
  const f = n => String(Math.round(n * 100) / 100);

  function nouvellePage() { ops = []; pages.push(ops); y = 60; }
  function texte(x, yy, t, gras, taille, gris) {
    ops.push("BT /F" + (gras ? 2 : 1) + " " + taille + " Tf " + (gris || 0) + " g " + f(x) + " " + f(H - yy) + " Td (" + pdfTexte(t) + ") Tj ET");
  }
  function centre(yy, t, gras, taille, gris) { texte((W - pdfLargeur(t, gras, taille)) / 2, yy, t, gras, taille, gris); }
  function droite(xd, yy, t, gras, taille, gris) { texte(xd - pdfLargeur(t, gras, taille), yy, t, gras, taille, gris); }
  function cadre(x, yy, w, h, fond, ep) {
    if (fond !== undefined) ops.push(fond + " g " + f(x) + " " + f(H - yy - h) + " " + f(w) + " " + f(h) + " re f");
    ops.push("0 G " + (ep || 0.6) + " w " + f(x) + " " + f(H - yy - h) + " " + f(w) + " " + f(h) + " re S");
  }
  function trait(x1, y1, x2, y2, ep) { ops.push("0 G " + ep + " w " + f(x1) + " " + f(H - y1) + " m " + f(x2) + " " + f(H - y2) + " l S"); }

  const C = [44, 300, LT - 344];          // largeurs des colonnes : N°, Nom, IM
  function entete() {
    let x = M;
    ["N°", "Nom", "IM"].forEach((t, i) => {
      cadre(x, y, C[i], 20, 0.92);
      texte(x + 6, y + 14, t, true, 10);
      x += C[i];
    });
    y += 20;
  }

  liste.forEach(b => {
    nouvellePage();
    centre(y, "SRSP", false, 10, 0.3);
    centre(y + 28, "BORDEREAU D'ARRIVÉE", true, 18);
    trait(M, y + 42, W - M, y + 42, 1.5);
    y += 62;

    // cadre d'informations
    cadre(M, y, LT, 30);
    [["Date arrivée : ", dateFr(b.da)], ["N° Arrivée : ", b.na], ["N° BE EXP : ", b.be || "—"]].forEach((p, i) => {
      const x = M + 10 + i * 170;
      texte(x, y + 19, p[0], false, 10.5, 0.3);
      texte(x + pdfLargeur(p[0], false, 10.5), y + 19, p[1], true, 11);
    });
    y += 52;

    let total = 0;
    b.demandes.forEach((d, i) => {
      const n = d.agents.length || 1;
      total += n;
      if (y + 20 + 20 + 22 > BAS) nouvellePage();
      const t1 = "Demande (" + (i + 1) + ") : ";
      texte(M, y + 12, t1, false, 11);
      texte(M + pdfLargeur(t1, false, 11), y + 12, d.demande, true, 11);
      droite(W - M, y + 12, n + " dossier(s)", false, 9, 0.3);
      y += 20;
      entete();
      if (!d.agents.length) {
        cadre(M, y, LT, 20);
        centre(y + 14, "—", false, 10, 0.4);
        y += 20;
      }
      d.agents.forEach((a, j) => {
        const ln = pdfLignes(a.nom, C[1] - 12, false, 10), li = pdfLignes(a.im, C[2] - 12, false, 10);
        const h = Math.max(ln.length, li.length) * 13 + 8;
        if (y + h > BAS) { nouvellePage(); entete(); }
        cadre(M, y, C[0], h); cadre(M + C[0], y, C[1], h); cadre(M + C[0] + C[1], y, C[2], h);
        texte(M + (C[0] - pdfLargeur(String(j + 1), false, 10)) / 2, y + 14, String(j + 1), false, 10);
        ln.forEach((s, k) => texte(M + C[0] + 6, y + 14 + k * 13, s, false, 10));
        li.forEach((s, k) => texte(M + C[0] + C[1] + 6, y + 14 + k * 13, s, false, 10));
        y += h;
      });
      y += 18;
    });

    if (y + 28 + 40 > BAS) nouvellePage();
    y += 4;
    cadre(M, y, LT, 28, undefined, 1.4);
    texte(M + 10, y + 18, "Nombre total des dossiers", false, 12);
    droite(W - M - 10, y + 18, String(total), true, 13);
    y += 52;
    texte(M, y, "Division : ", false, 12);
    texte(M + pdfLargeur("Division : ", false, 12), y, b.division, true, 12);
  });

  // ----- assemblage du fichier PDF -----
  const N = 4 + 2 * pages.length;
  const obj = [];
  obj[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  obj[2] = "<< /Type /Pages /Kids [" + pages.map((p, i) => (5 + 2 * i) + " 0 R").join(" ") + "] /Count " + pages.length + " >>";
  obj[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  obj[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((p, i) => {
    const flux = p.join("\n");
    obj[5 + 2 * i] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (6 + 2 * i) + " 0 R >>";
    obj[6 + 2 * i] = "<< /Length " + flux.length + " >>\nstream\n" + flux + "\nendstream";
  });
  let pdf = "%PDF-1.4\n";
  const dec = [];
  for (let k = 1; k <= N; k++) { dec[k] = pdf.length; pdf += k + " 0 obj\n" + obj[k] + "\nendobj\n"; }
  const xref = pdf.length;
  pdf += "xref\n0 " + (N + 1) + "\n0000000000 65535 f \n";
  for (let k = 1; k <= N; k++) pdf += String(dec[k]).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (N + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";

  const octets = new Uint8Array(pdf.length);
  for (let k = 0; k < pdf.length; k++) octets[k] = pdf.charCodeAt(k) & 255;
  return octets;
}

function telechargerPDF(liste, nomFichier) {
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([creerPDF(liste)], { type: "application/pdf" }));
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 2000);
}

/* ----- bouton « Télécharger en PDF » de la page Afficher ----- */

let bordereauAffiche = null;
const afficherBordereauOrigine = afficherBordereau;
afficherBordereau = function (id) {          // on retient quel bordereau est affiché
  bordereauAffiche = id;
  afficherBordereauOrigine(id);
};

function pdfDuBordereau() {
  const b = bordereaux.find(x => x.id === bordereauAffiche);
  if (b) telechargerPDF([b], "bordereau-" + b.na + ".pdf");
}

/* ----- bouton « PDF de la sélection » de la liste ----- */

function pdfSelection() {
  const ids = new Set(selectionVisible());
  const choisis = bordereaux.filter(b => ids.has(b.id));
  if (choisis.length === 0) { alert("Cochez d'abord un ou plusieurs bordereaux dans la liste."); return; }
  telechargerPDF(choisis, choisis.length === 1
    ? "bordereau-" + choisis[0].na + ".pdf"
    : "bordereaux-" + new Date().toISOString().slice(0, 10) + ".pdf");
}
