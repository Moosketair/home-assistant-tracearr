# Feuille de route — propositions à arbitrer

## Livré en v0.1.16

Lecture REST et SSE par entrée, capteurs globaux et par serveur, listes et carrousel groupés, carte individuelle et éditeur partagé, images/signatures et fonds cinéma, horloge locale, couleurs et ordre des badges, ciblage et règles LAN/WAN manuelles, alias/avatars, ressources storage/YAML, publication HACS. Le détail et les limites sont dans [ARCHITECTURE](ARCHITECTURE.md) et les preuves dans [AUDIT_INITIAL](AUDIT_INITIAL.md). Ces fonctions ne sont pas des travaux futurs.

## Décisions explicites

Le mainteneur a demandé la **phase 0 documentaire** sur branche locale, avec audit, tests isolés et commit de documentation. Préservation de la stable et des configurations ; arrêt avant modification fonctionnelle. **Aucun lot ci-dessous, numéro de version, délai, migration ou nouvelle dépendance n’est approuvé.**

## Ordre proposé après validation

| Ordre | Lot proposé | Critère de sortie avant livraison |
|---|---|---|
| 1 | **Fiabiliser les données en direct** (A1, A2, A4, A9, A10) : d’abord figer les scénarios de reload WS et de course SSE/REST dans des tests ; ensuite seulement choisir le correctif. Définir reauth, états périmés et respect des limites REST. | Une carte ouverte reçoit les sessions après reload, aucun événement neuf perdu entre deux GET ; une trame invalide ne tue pas la boucle ; révocation/rétablissement sans perte de config. Tests cycle complet, y compris annulation et plusieurs entrées. |
| 2 | **Fiabiliser les images et les options** (A3, A6–A8, A13) : lecture bornée jusqu’à EOF, invalidation visuelle des règles, aller-retour JSON, précisions sur version Tracearr et clé de compte. | Image fragmentée identique à l’original, rejet au-delà de la limite ; en-tête et panneaux cohérents sur changement LAN/WAN ; `unknown` explicite conservé ; anciens YAML toujours lisibles sans migration obligatoire. |
| 3 | **Contenir le coût des dashboards et les régressions d’affichage** (A5, A11, A12) : purge des caches, mesure du trafic WS et des ticks, interactions clavier et largeur de badge. | Caches proportionnés aux sessions utiles ; comparer avant/après (abonnés, octets, temps de rendu, mémoire longue durée). Vérifier centrage court **et** libellés longs, thème clair/sombre et navigation tactile/clavier dans un vrai navigateur. |
| 4 | **Consolider validation et maintenance** : matrice Core minimum/stable, fixtures anonymes Plex/Jellyfin/Emby, smoke HA et navigateur dans la CI selon coût, traduction progressive, précision sur l’icône (A14). | Contrats de ressource, flows, options et entités testés sans production ; contrôles reproductibles sur le SHA candidat. Pas de réécriture globale du JS proposée sans mesures et tests d’équivalence. |
| 5 | **Étudier la musique**, [demande #2](https://github.com/Moosketair/home-assistant-tracearr/issues/2). L’amont fournit des champs artiste/album/année ; la carte actuelle n’a pas de présentation musicale dédiée. | Soumettre au mainteneur une proposition de pochette carrée et de métadonnées, préciser repli si absentes et compatibilité des cartes existantes. Confirmation du périmètre avant développement. |

La priorité d’un lot n’est pas une promesse de publication. Garder les issues comme suivi opérationnel et le changelog pour ce qui a effectivement été livré.
