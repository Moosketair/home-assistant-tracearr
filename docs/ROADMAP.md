# Feuille de route — propositions à arbitrer

## Livré en v0.1.16

Lecture REST et SSE par entrée, capteurs globaux et par serveur, listes et carrousel groupés, carte individuelle et éditeur partagé, images/signatures et fonds cinéma, horloge locale, couleurs et ordre des badges, ciblage et règles LAN/WAN manuelles, alias/avatars, ressources storage/YAML, publication HACS. Le détail et les limites sont dans [ARCHITECTURE](ARCHITECTURE.md) et les preuves dans [AUDIT_INITIAL](AUDIT_INITIAL.md). Ces fonctions ne sont pas des travaux futurs.

## Décisions explicites

Les phases 0 et 1.1 ont été validées. **2A.2 : refus de validation de `20b2901`** malgré le succès du dispatcher sur les reloads nominaux. **2A.3** a consolidé le retrait définitif (B1), le rollback du démarrage (B2) et les plateformes partielles (B3). Le contre-audit de `d51ce475` a confirmé P1-A, B1 et B2 sur les scénarios testés, mais a refusé la validation globale à cause d’un reliquat B3. **2A.5** conserve l’inventaire après refus de rollback et tente sa libération avant remplacement ou suppression. **2A définitivement validée** après contre-audit indépendant de `942de6ffa8d33b0ee10319fa39938c3f587f35aa`, selon la décision du mainteneur du 25 novembre 2026. **2B.2 a refusé 2B.1 (`397f40e8`)** malgré la correction des courses historiques. **2B.3** traite exclusivement les régressions de fusion et d'états de connexion signalées ; livrée localement avec 61 tests réussis par Core. Attendre le contre-audit ciblé 2B.4 ; ne pas commencer 2C. Aucune publication ni migration approuvée ; la stable reste v0.1.16 (`443ce38`).

## Ordre proposé après validation

| Ordre | Lot proposé | Critère de sortie avant livraison |
|---|---|---|
| 1 | **Fiabiliser les données en direct** : contre-audit ciblé 2B.4 de la fusion par champ et des états REST/SSE. 2A est validée. A4, A9 et A10 restent des propositions. | P1-B : six courses historiques passantes ; six nouveaux contrôles de 2B.3 discriminants sur `397f40e8`. Garanties et limites dans [ARCHITECTURE](ARCHITECTURE.md), preuves dans [RECETTE](RECETTE.md). Attendre le contre-audit et la décision du mainteneur. |
| 2 | **Fiabiliser les images et les options** (A3, A6–A8, A13) : lecture bornée jusqu’à EOF, invalidation visuelle des règles, aller-retour JSON, précisions sur version Tracearr et clé de compte. | Image fragmentée identique à l’original, rejet au-delà de la limite ; en-tête et panneaux cohérents sur changement LAN/WAN ; `unknown` explicite conservé ; anciens YAML toujours lisibles sans migration obligatoire. |
| 3 | **Contenir le coût des dashboards et les régressions d’affichage** (A5, A11, A12) : purge des caches, mesure du trafic WS et des ticks, interactions clavier et largeur de badge. | Caches proportionnés aux sessions utiles ; comparer avant/après (abonnés, octets, temps de rendu, mémoire longue durée). Vérifier centrage court **et** libellés longs, thème clair/sombre et navigation tactile/clavier dans un vrai navigateur. |
| 4 | **Consolider validation et maintenance** : matrice Core minimum/stable, fixtures anonymes Plex/Jellyfin/Emby, smoke HA et navigateur dans la CI selon coût, traduction progressive, précision sur l’icône (A14). | Contrats de ressource, flows, options et entités testés sans production ; contrôles reproductibles sur le SHA candidat. Pas de réécriture globale du JS proposée sans mesures et tests d’équivalence. |
| 5 | **Étudier la musique**, [demande #2](https://github.com/Moosketair/home-assistant-tracearr/issues/2). L’amont fournit des champs artiste/album/année ; la carte actuelle n’a pas de présentation musicale dédiée. | Soumettre au mainteneur une proposition de pochette carrée et de métadonnées, préciser repli si absentes et compatibilité des cartes existantes. Confirmation du périmètre avant développement. |

La priorité d’un lot n’est pas une promesse de publication. Garder les issues comme suivi opérationnel et le changelog pour ce qui a effectivement été livré.
