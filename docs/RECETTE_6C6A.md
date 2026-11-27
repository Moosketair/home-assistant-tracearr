# 6C.6.A — Recette finale avant prépublication v0.1.19

**Verdict : PASS AVEC RÉSERVES.** Aucun nouveau défaut significatif reproduit. Les trois réserves P3 et les limites Tracearr déjà acceptées sont reconduites.

**Code éprouvé :** `e730b6339f738b6573de2c358a6de4d81103246e` (`feature/6c-music-support`), comparé au tag stable `v0.1.18` (`c257ce666f9ca5dcd16b5984f994e5e959861e42`). Le lot ne change ni le code distribué ni la version.

## Validation mainteneur

Les [captures 6C.4](../recette/preuves/6c.4/README.md) et [6C.5](../recette/preuves/6c.5/README.md) sont validées. Pour 6C.5, cela couvre les filtres, l’organisation des métadonnées, l’ordre et la visibilité des badges, les aperçus et les rendus personnalisés. Le codec FLAC et le conteneur FLAC peuvent apparaître séparément si le conteneur est explicitement activé. Il reste masqué par défaut. Une autre distinction visuelle pourra être examinée en 6E, sans changement pendant cette recette.

## Banc et mise à niveau

Vrai Home Assistant Core **2026.11.3**, frontend **20261028.8**, Python **3.14.10**, Chromium **152.0.7977.82**. Copie jetable du [banc 4.2](RECETTE_42.md) déjà réutilisé en [6D.1](RECETTE_6D1.md). Core et simulateur Tracearr exclusivement sur loopback : comptes, médias, clés et images fictifs ; aucun serveur personnel ou de production.

1. Démarrage sur le composant extrait du tag stable, puis redémarrage sur le candidat extrait de Git, même profil Chromium. Seul le composant est substitué. L’intégration est chargée et le SSE confirmé dans les deux cas.
2. **17 entités disponibles et 4 appareils** dans les deux versions, mêmes `entity_id`, `unique_id`, identifiants d’appareils et entrée. Registres, entrée/options, ressource Lovelace et dashboard historiques identiques octet pour octet avant l’édition. Aucun capteur ni compteur musical ajouté.
3. Les anciennes cartes liste LAN, carrousel WAN et individuelle par compte affichent le même rendu vidéo mesuré (textes, classes, géométrie et styles calculés, hors horloge changeante). Les deux types de carte sont chargés. Une ressource `module` sur `?v=0.1.18` ; HTTP 200 et SHA‑256 du corps conformes à chaque archive, y compris le candidat.
4. Le cache HTTP du navigateur est neutralisé pour comparer les octets : avec la même version interne et la même URL, cette simulation **ne valide pas l’invalidation de cache lors de la future bêta** ni la découverte ou l’installation via HACS/Marketplace.

## Lovelace réel

| Contrôle | Résultat de la recette |
|---|---|
| Sections, `rows: auto` | Liste : **56 → 382,91 → 1 556,11 → 56 px** (0 → 1 → 6 → 0). Individuelle ciblée : **56 → 382,91 → 382,91 → 56 px**. Retour à la hauteur de la tuile native ; pas de chevauchement mesuré avec les cartes voisines. Le carrousel s’ajuste au contenu mixte sans modifier le dimensionnement de ses voisins. |
| Dimensions enregistrées | Les cartes de six colonnes fixées à deux lignes (liste) et une ligne (individuelle) gardent respectivement **120 et 56 px**, avec défilement interne. Les dimensions et la cible de session sont conservées par l’éditeur. |
| Masonry | Contrôle à l’arrivée d’une piste : **69,77 → 304,13 px** en groupée et **103,69 → 338,05 px** en individuelle. |
| Cartes et médias | Liste mixte avec film, série, trois pistes et un direct ; liste musique seule, carte individuelle et carrousel mixte navigable. Pochettes 600 × 600 et 400 × 600 rendues en 73 × 73, centrées ; remplacement musical sans image. Affiches vidéo en 73 × 109. |
| Lecture | FLAC direct, FLAC → AAC confirmé, pause (temps restant stable au-delà d’une seconde) puis reprise. Nouveau morceau sous le même ID : position repart de la valeur source, nouvelle illustration chargée par la vraie chaîne d’images HA, piste visible du carrousel conservée. |
| Éditeurs des deux types | Les quatre cases sont cochées par défaut. Filtre Musique seul, visibilité et ordre des métadonnées et des badges, aperçu et rendu enregistrés ; persistance après passage graphique ↔ YAML, enregistrement, rechargement puis réouverture. Le réglage `[]` reste explicitement vide et le filtre Film exclut une session musicale épinglée au lieu de la remplacer. |
| Filtres historiques et carrousel | Le filtre Musique se cumule avec serveur, compte, transcodage audio seul et masquage des pauses : seule la piste attendue passe, puis disparaît à la pause. Carrousel réduit à la musique, navigation possible ; en ne gardant que Série, retrait de la piste active, recalage à l’index 0 et disparition des flèches. Les 17 états HA restent identiques avant/après édition sur le même instantané : 6 lectures, 2 transcodages audio seuls, aucun transcodage vidéo. |
| Ressources et dashboard YAML | Après démarrage avec une déclaration manuelle et une vue YAML, mêmes octets de module que le candidat en stockage. Carte musicale rendue et `[]` respecté par l’individuelle. Aucun changement dans le registre des ressources de stockage. |

**Données techniques.** Format seul (repli sur le codec) puis codec seul testés séparément. Avec le conteneur activé, deux badges FLAC distincts sont visibles en lecture directe ; absence de conteneur et de débit détaillé par défaut. En direct, **44,1 kHz**, **902 kb/s** audio et **1,2 Mb/s** global ; en comparaison, les mesures sources sans destination fiable sont qualifiées dans l’infobulle. Même lorsque la fixture fournit des valeurs de sortie ambiguës, le mode Destination ne montre ni fréquence ni débit audio détaillé non confirmés. Le FLAC répété en sortie n’est pas retenu comme destination, contrairement à AAC confirmé. Pas d’heure de fin musicale, d’icône de transcodage vidéo ni de mention Hi‑Res, profondeur de bits ou garantie lossless déduite.

## Contrôles, preuves et limites

- **Nouveaux :** parcours Core/Chromium intégré, **12 tests Python** ciblés (enregistrement du module et traductions : `test_frontend_registration.py` et `test_translations.py`), **10 tests Node** ciblés (`6C.4`, `6C.5`, `6D.6`), compilation Python du paquet, syntaxe JavaScript, JSON et `git diff --check`. **Hassfest Core 2026.11.3 : 1 intégration, 0 invalide.**
- **Packaging :** archive Git de **18 fichiers** pour le composant ; domaine, manifeste, deux icônes identiques, trois fichiers de textes, `hacs.json`, borne Core 2025.6.0 et absence de dépendance additionnelle inchangés. Manifeste, cache JS, bandeau JS et déclaration YAML de la stable cohérents à `0.1.18`. Pas de job HACS distant.
- **Réutilisés, non recomptés :** 49 tests Python de 6C.3.B ; 128 tests ciblés par Core de 6C.3.D ; contre-audit indépendant 6C.3.E **PASS AVEC RÉSERVES** ; 123 tests Node de 6C.5 ; matrices Chromium et captures déjà validées de 6C.4 et 6C.5. Pas de nouvelle matrice multi-Core, REST/SSE, proxy ou concurrence.
- **Réserves acceptées et inchangées :** position en pause potentiellement plafonnée après une durée incohérente ; 404 amont pouvant ne pas porter `no-store` si la révision expire en vol ; ancienne URL non révisée pouvant finir par une réponse vidéo cacheable après transition musicale. Les [limites du protocole](ARCHITECTURE.md#réconciliation-restsse--2b1-et-2b3) restent acceptées. Pas d’essai sur un lecteur ou serveur réel.
- **Bruit du banc :** aucun échec de commande Tracearr ; les seuls `unknown_command` concernent `recorder/info` et `brands/access_token`, modules non chargés dans ce Core minimal. Les rejets génériques `Object` du navigateur n’ont pas affecté les parcours vérifiés. Avertissements de démarrage du banc (intégration personnalisée, `--skip-pip`, bibliothèques d’accélération optionnelles), sans erreur d’intégration Tracearr.

**Preuves :** [captures Lovelace et résultats mesurés](../recette/preuves/6c.6a/README.md).

**Rejeu isolé uniquement :** depuis la racine, sur la machine du banc 4.2, avec les ports 18424/18425 libres :

```sh
/tmp/opencode/tracearr-42/venv/bin/python -B recette/dashboard_music.py \
  --output /tmp/opencode/tracearr-6c6-rejeu
```

Le dossier de sortie doit être neuf. Le script n’écrit pas dans le banc d’origine et arrête les processus qu’il démarre. À la livraison, Core, simulateur et Chromium sont arrêtés, ports 18424/18425 libres. Ne pas exporter `.storage`, les journaux bruts du banc ou les URL d’images signées.

## Nouveautés proposées pour v0.1.19 — brouillon, non publié

- Les deux cartes existantes affichent les lectures musicales : titre, artiste, album, année et, sur option, piste et disque. Pochettes carrées et remplacement dédié ; affiches vidéo toujours verticales. Progression et temps restant, pause explicite, pas d’heure de fin musicale.
- Quatre catégories de médias par carte dans l’éditeur ou en YAML. Toutes sont incluses par défaut ; une liste vide n’en affiche aucune. Métadonnées et badges musicaux ont des réglages indépendants de visibilité et d’ordre. Les entités et statistiques globales restent inchangées.
- Badges audio prudents : transcodage audio lorsqu’il est confirmé, fréquence et débit audio détaillé distincts du débit du flux, conteneur facultatif ; pas de propriétés Hi‑Res ou lossless déduites. Les mises à jour de morceau et d’illustration tiennent compte de l’identité de la piste sans changer le contrat des cartes vidéo.

La [démarche obligatoire 6E](ROADMAP.md#lot-6e--ergonomie-de-léditeur-graphique-des-cartes) reste audit, discussion, maquettes validées, développement après accord, puis recette. Les [demandes amont Tracearr](ROADMAP.md#évolutions-amont-envisagées--non-soumises) restent documentées et non soumises.

## Recommandation

Préparer **`v0.1.19-beta.1` après accord explicite du mainteneur**. Aligner les références de version et la clé de cache conformément à [MAINTENANCE](MAINTENANCE.md), puis vérifier la validation, HACS et hassfest sur le SHA retenu avant toute publication autorisée. L’essai HACS réel du mainteneur restera requis avant une promotion stable. Aucun changement de version, push, merge, tag, publication ou déploiement dans 6C.6.A.
