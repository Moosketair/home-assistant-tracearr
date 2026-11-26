# 6D.1 — Recette commune de `v0.1.18-beta.1`

**Statut : TERMINÉ pour le périmètre local.** Aucun défaut significatif du candidat reproduit. Prépublication bêta recommandée après autorisation explicite et contrôles de publication sur le SHA retenu ; installation réelle via HACS/Marketplace à vérifier ensuite par le mainteneur.

La stable publique reste `v0.1.17` (`3587f832532b4e0285699c76df6d30110ac619ad`). Le mainteneur a clôturé 6A.1, 6B.1 et 6B.2 sans nouvel audit indépendant. Base validée : `bb1ef7f32a5d16560a4792d22223e71e14d93368`. Branche locale : `release/v0.1.18`. Notes et retour arrière : [CHANGELOG](../CHANGELOG.md#0118-beta1--candidat-local-non-publié).

## Mise à niveau locale

- Core **2026.11.3**, frontend **20261028.8**, Python **3.14.10**, Chromium **152.0.7977.82**, même profil de navigateur. Copie du banc [4.2](RECETTE_42.md), avec un simulateur et uniquement des données fictives, sur loopback.
- Démarrage sur le dossier distribué extrait du tag stable, puis remplacement du seul dossier `custom_components/tracearr_ha` et redémarrage. Entrée, options globales, 17 entités, quatre appareils, noms personnalisés et dashboard (liste, carrousel et carte individuelle) conservés : registres et configuration du dashboard identiques octet pour octet avant toute édition.
- En mode stockage, une seule ressource de type `module`, même ID, avec pour seul changement `?v=0.1.17` → `?v=0.1.18-beta.1`. Chromium a reçu HTTP 200 pour cette dernière URL ; SHA-256 du corps identique au JS distribué : `5ac377166aceaf581be5ff45693057641b28fbcd57ce0dcb98cdd0e1ae53e099` (stable : `711a94ccd899ea7e791ab40c3c4e4a01a10587bbfc0074ee0b3fb456caec1acb`).
- Apparence historique : égalité des mesures sur les trois cartes pendant la lecture, à paramètres et thème identiques (texte statique, classes, géométrie et styles calculés du bandeau, des badges, des métadonnées et de la ligne de temps). Les changements voulus de pause et de dimensionnement ne sont pas une promesse d’identité visuelle dans ces états.
- En ressources YAML, Chromium charge le même module (HTTP 200 et même SHA-256) dans un dashboard YAML. L’exemple documenté rend le style Technique séparé, HEVC → H.264, sans badge conteneur et avec la couleur HEVC spécifiée. Le registre des ressources de stockage reste identique octet pour octet.
- Simulation locale uniquement : pas de découverte, téléchargement, installation ni mise à niveau via HACS/Marketplace. Ce circuit reste à vérifier par le mainteneur après une éventuelle prépublication autorisée.

## Fonctions et persistance dans le vrai éditeur Lovelace

| Contrôle | Résultat |
|---|---|
| Pause / reprise | Restant figé à `-1:33`, « En pause » à droite, pas d’estimation en pause ; en décalant l’horloge civile du navigateur de trois minutes, l’estimation passe de `12:01` à `12:04` à la reprise. La même animation CSS du badge reste montée et son temps avance à travers les événements. |
| Couleurs du bandeau | Couleur normale propre au compteur (`#224466`), sans changement au badge débit ; couleur à zéro distincte (`#663322`). Retour à la palette normale par l’éditeur sans réinitialiser la couleur à zéro. |
| Badges techniques | Cinq styles sélectionnés dans le vrai éditeur ; aperçu Classique historique et aperçu distinct pour les quatre nouveaux styles. Les deux dispositions et les deux modes de transcodage ont été exercés. En Technique, ordre modifié et catégories masquées, descriptions HEVC/H.265 et H.264/AVC avec traitement typographique homogène. Aperçu et carte enregistrée concordent pour les mêmes catégories et valeurs, couleur et proportions ; le rendu peut suivre une taille de texte différente dans l’éditeur. HDR source affiché sans suffixe, destination inconnue indiquée dans l’infobulle. Réinitialisation par format et globale vérifiées. |
| Persistance | Enregistrement par la boîte de dialogue native, rechargement complet du dashboard, puis réouverture des **deux** éditeurs : groupée (Technique/séparée/source → destination, ordre, visibilités, couleurs du bandeau et HEVC) et individuelle (Cinéma/compacte/destination uniquement). Sélection de compte, débit, source et tailles restent préservés. Le carrousel non édité conserve sa configuration. |

## Dimensionnement dans Sections

Contrôle rejoué sur Core 2026.11.3 avec le script de 6B.2 : **56 → 337,08 → 679,39 → 56 px** pour 0 → 1 → 3 → 0 lecture, 56 px étant la hauteur de la tuile native. La taille fixe reste à **56 px** (une ligne) ou **120 px** (deux lignes), avec défilement interne plutôt que débordement. Le bandeau long se replie dans sa carte à 375 px de viewport. L’avertissement est conservé en panne même sur la carte normalement masquée ; la carte automatique atteint **148,98 px** avec avertissement et revient à 56 px après rétablissement. Configurations enregistrées inchangées ; carrousel stable pendant la navigation. Contrôle Masonry du même script : **67,92 → 265,08 px** à l’arrivée d’une lecture.

Le banc minimal ne charge pas Recorder : la sonde de grille a corrélé deux exceptions génériques du frontend HA à ses appels `recorder/info`, sans commande Tracearr inconnue. Les 503 injectés et l’absence de l’accélération caméra `libturbojpeg` ne sont pas des défauts du candidat.

## Contrôles ciblés et preuves antérieures

- Exécutés : 9 tests Python de versionnement, ressource et traductions ; 23 tests Node ciblés (pause, badges et rendu commun) ; syntaxe JavaScript ; `git diff --check` ; ordre `0.1.17 < 0.1.18-beta.1 < 0.1.18` avec `AwesomeVersion` ; hassfest de Core 2026.11.3 (1 intégration, 0 invalide).
- Distribution contrôlée sur `git archive` : un composant de 18 fichiers, dont le module sans build, les trois fichiers de chaînes/traductions et les deux icônes ; `hacs.json`, nom, domaine, seuil Core `2025.6.0` et absence de dépendances Python supplémentaires conservés. Aucun job HACS distant lancé.
- Réutilisés sans rejouer les campagnes : 92 tests JavaScript, 480 cas navigateur 6B.1, mesures Sections/Masonry sur deux Core en 6B.2 et validations backend de la stable. Depuis `v0.1.17`, les seuls changements Python/manifeste distribués sont les deux références de version.
- Preuves locales : `/tmp/opencode/tracearr-6d1.fFPnZ2aI/preuves/{stable,candidate,yaml}.json`, captures `pause.png` et `editeur.png` dans le même dossier, mesures `grid.json` et captures `grid/`. Seules des données fictives ont été utilisées. Core, simulateur et Chromium arrêtés ; ports 18424/18425 libres à la livraison. Le banc 4.2 d’origine reste intact.

## Rejouer sur le banc isolé

Cloner le répertoire fictif `final-upgrade` du banc 4.2, utiliser sa configuration stockage et son venv, démarrer le simulateur avec `--rotated`. Ne jamais exécuter ces scripts sur un HA existant. Core arrêté entre les substitutions de fichiers :

1. Extraire la stable avec `git archive v0.1.17 custom_components/tracearr_ha` et lancer `recette/dashboard_candidate.py <racine-du-banc> stable <module-stable>`.
2. Copier le composant candidat, redémarrer, comparer registres et ressources avant édition ; lancer le même script avec l’argument `candidate` et le module candidat. Il sauvegarde de vrais réglages Lovelace : restaurer le dashboard stable avant un nouveau passage.
3. Exécuter `recette/dashboard_grid.py 6d1-after <module-candidat> <dossier-de-preuves>` pour les mesures du dashboard de dimensionnement distinct.
4. Basculer sur la configuration ressources YAML du banc 4.2 avec la clé de cache candidate, mettre l’[exemple Technique du guide](CONFIGURATION.md#badges-techniques-des-panneaux-de-lecture) dans la vue Sections `/tracearr-yaml/recette`, puis exécuter `dashboard_candidate.py <racine-du-banc> yaml <module-candidat>`. Comparer le registre des ressources de stockage avant/après. Arrêter Core et le simulateur ; vérifier les ports.
