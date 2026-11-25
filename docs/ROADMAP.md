# Feuille de route — propositions à arbitrer

## Livré en v0.1.16

Lecture REST et SSE par entrée, capteurs globaux et par serveur, listes et carrousel groupés, carte individuelle et éditeur partagé, images/signatures et fonds cinéma, horloge locale, couleurs et ordre des badges, ciblage et règles LAN/WAN manuelles, alias/avatars, ressources storage/YAML, publication HACS. Le détail et les limites sont dans [ARCHITECTURE](ARCHITECTURE.md) et les preuves dans [AUDIT_INITIAL](AUDIT_INITIAL.md). Ces fonctions ne sont pas des travaux futurs.

## Décisions explicites

Les phases 0 et 1.1 ont été validées. **2A.2 : refus de validation de `20b2901`** malgré le succès du dispatcher sur les reloads nominaux. Le mainteneur a conservé le dispatcher et autorisé **2A.3** : retrait définitif après refus d’unload (B1), rollback du démarrage partiel (B2), plateformes partiellement chargées (B3, hérité). Ces corrections et leur recette sont locales, en attente d’un **nouveau contre-audit indépendant**. Aucune publication, migration ni correction A2 n’est approuvée.

## Ordre proposé après validation

| Ordre | Lot proposé | Critère de sortie avant livraison |
|---|---|---|
| 1 | **Fiabiliser les données en direct** : contre-auditer A1 sur la génération 2A.3, notamment B1–B3, puis décider séparément d’une intervention A2. A4, A9 et A10 restent des propositions. | A1 : [recette](RECETTE.md), contre-audit et décision du mainteneur. A2 : aucun événement neuf perdu entre deux GET ; six xfail stricts en attente. Ensuite : résilience aux trames invalides, reauth, états périmés et limites REST. |
| 2 | **Fiabiliser les images et les options** (A3, A6–A8, A13) : lecture bornée jusqu’à EOF, invalidation visuelle des règles, aller-retour JSON, précisions sur version Tracearr et clé de compte. | Image fragmentée identique à l’original, rejet au-delà de la limite ; en-tête et panneaux cohérents sur changement LAN/WAN ; `unknown` explicite conservé ; anciens YAML toujours lisibles sans migration obligatoire. |
| 3 | **Contenir le coût des dashboards et les régressions d’affichage** (A5, A11, A12) : purge des caches, mesure du trafic WS et des ticks, interactions clavier et largeur de badge. | Caches proportionnés aux sessions utiles ; comparer avant/après (abonnés, octets, temps de rendu, mémoire longue durée). Vérifier centrage court **et** libellés longs, thème clair/sombre et navigation tactile/clavier dans un vrai navigateur. |
| 4 | **Consolider validation et maintenance** : matrice Core minimum/stable, fixtures anonymes Plex/Jellyfin/Emby, smoke HA et navigateur dans la CI selon coût, traduction progressive, précision sur l’icône (A14). | Contrats de ressource, flows, options et entités testés sans production ; contrôles reproductibles sur le SHA candidat. Pas de réécriture globale du JS proposée sans mesures et tests d’équivalence. |
| 5 | **Étudier la musique**, [demande #2](https://github.com/Moosketair/home-assistant-tracearr/issues/2). L’amont fournit des champs artiste/album/année ; la carte actuelle n’a pas de présentation musicale dédiée. | Soumettre au mainteneur une proposition de pochette carrée et de métadonnées, préciser repli si absentes et compatibilité des cartes existantes. Confirmation du périmètre avant développement. |

La priorité d’un lot n’est pas une promesse de publication. Garder les issues comme suivi opérationnel et le changelog pour ce qui a effectivement été livré.
