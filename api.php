<?php
/* ============ GeCo SRSP : serveur (PHP) ============
   Les données sont gardées dans le fichier geco-donnees.php (créé tout seul à côté de ce fichier).
   Toutes les personnes qui ouvrent l'application voient donc les mêmes données. */

// >>> MOT DE PASSE DE L'APPLICATION (à changer ici, entre les guillemets) <<<
const MOT_DE_PASSE = 'Geco@2026';

const FICHIER = __DIR__ . '/geco-donnees.php';

session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function repondre($donnees, int $code = 200): void {
    http_response_code($code);
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function lireCorps(): array {
    $brut = file_get_contents('php://input', false, null, 0, 20000000);
    $j = json_decode($brut ?: '{}', true);
    return is_array($j) ? $j : [];
}

/* Ouvre le fichier de données, le verrouille, exécute $travail($donnees) puis réécrit si $ecriture.
   Le verrou évite que deux personnes qui enregistrent en même temps abîment le fichier. */
function avecDonnees(callable $travail, bool $ecriture) {
    $fp = @fopen(FICHIER, 'c+');
    if (!$fp) repondre(['erreur' => "Impossible d'écrire dans le dossier du serveur (droits d'écriture manquants)."], 500);
    flock($fp, $ecriture ? LOCK_EX : LOCK_SH);
    $texte = stream_get_contents($fp);
    $json = ($texte !== '' && strpos($texte, "\n") !== false) ? substr($texte, strpos($texte, "\n") + 1) : '';
    $donnees = json_decode($json, true);
    if (!is_array($donnees) || !isset($donnees['bordereaux'])) $donnees = ['bordereaux' => [], 'dernier' => 0];
    $resultat = $travail($donnees);
    if ($ecriture) {
        ftruncate($fp, 0);
        rewind($fp);
        // 1re ligne = verrou PHP : personne ne peut lire le fichier depuis un navigateur
        fwrite($fp, "<?php http_response_code(403); exit; ?>\n" . json_encode($donnees, JSON_UNESCAPED_UNICODE));
        fflush($fp);
    }
    flock($fp, LOCK_UN);
    fclose($fp);
    return $resultat;
}

function bordereauValide($b): bool {
    if (!is_array($b) || !isset($b['id']) || !is_int($b['id']) || !isset($b['na']) || !is_string($b['na'])) return false;
    if (!isset($b['demandes']) || !is_array($b['demandes'])) return false;
    foreach ($b['demandes'] as $d) if (!is_array($d) || !isset($d['agents']) || !is_array($d['agents'])) return false;
    return true;
}

$action = $_GET['action'] ?? '';

/* ----- actions sans mot de passe ----- */
if ($action === 'session') repondre(['connecte' => !empty($_SESSION['geco'])]);

if ($action === 'login') {
    $mdp = (string)(lireCorps()['mdp'] ?? '');
    if (hash_equals(MOT_DE_PASSE, $mdp)) {
        session_regenerate_id(true);
        $_SESSION['geco'] = true;
        repondre(['ok' => true]);
    }
    usleep(800000);                                  // freine les essais au hasard
    repondre(['ok' => false, 'erreur' => 'Mot de passe incorrect.'], 401);
}

if ($action === 'logout') { $_SESSION = []; session_destroy(); repondre(['ok' => true]); }

/* ----- à partir d'ici : il faut être connecté ----- */
if (empty($_SESSION['geco'])) repondre(['erreur' => 'Non connecté.'], 401);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'GeCo')
    repondre(['erreur' => 'Requête refusée.'], 403);

switch ($action) {

    case 'charger':                                   // tout lire
        repondre(avecDonnees(fn($d) => $d, false));

    case 'enregistrer': {                             // ajouter ou remplacer un bordereau
        $b = lireCorps()['bordereau'] ?? null;
        if (!bordereauValide($b)) repondre(['erreur' => 'Bordereau invalide.'], 400);
        avecDonnees(function (&$d) use ($b) {
            foreach ($d['bordereaux'] as $i => $x) if ($x['id'] === $b['id']) { $d['bordereaux'][$i] = $b; return; }
            $d['bordereaux'][] = $b;
        }, true);
        repondre(['ok' => true]);
    }

    case 'champ': {                                   // paraphe / responsable d'un bordereau
        $c = lireCorps();
        avecDonnees(function (&$d) use ($c) {
            foreach ($d['bordereaux'] as $i => $x) {
                if ($x['id'] !== ($c['id'] ?? null)) continue;
                if (isset($c['paraphe'])) $d['bordereaux'][$i]['paraphe'] = (bool)$c['paraphe'];
                if (isset($c['resp']) && is_string($c['resp'])) $d['bordereaux'][$i]['resp'] = $c['resp'];
            }
        }, true);
        repondre(['ok' => true]);
    }

    case 'supprimer': {
        $ids = lireCorps()['ids'] ?? [];
        if (!is_array($ids)) repondre(['erreur' => 'Liste invalide.'], 400);
        avecDonnees(function (&$d) use ($ids) {
            $d['bordereaux'] = array_values(array_filter($d['bordereaux'], fn($x) => !in_array($x['id'], $ids, true)));
        }, true);
        repondre(['ok' => true]);
    }

    case 'compteur': {                                // dernier N° Arrivée utilisé
        $n = lireCorps()['dernier'] ?? null;
        if (!is_int($n)) repondre(['erreur' => 'Nombre invalide.'], 400);
        avecDonnees(function (&$d) use ($n) { $d['dernier'] = $n; }, true);
        repondre(['ok' => true]);
    }

    case 'remplacer': {                               // restauration d'une sauvegarde
        $c = lireCorps();
        $liste = $c['bordereaux'] ?? null;
        if (!is_array($liste)) repondre(['erreur' => 'Sauvegarde invalide.'], 400);
        foreach ($liste as $b) if (!bordereauValide($b)) repondre(['erreur' => 'Sauvegarde invalide.'], 400);
        avecDonnees(function (&$d) use ($liste, $c) {
            $d['bordereaux'] = array_values($liste);
            if (isset($c['dernier']) && is_int($c['dernier'])) $d['dernier'] = $c['dernier'];
        }, true);
        repondre(['ok' => true]);
    }

    default:
        repondre(['erreur' => 'Action inconnue.'], 404);
}
