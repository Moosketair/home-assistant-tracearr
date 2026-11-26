# Feuille de route — propositions à arbitrer

## Livré en v0.1.16

Lecture REST et SSE par entrée, capteurs globaux et par serveur, listes et carrousel groupés, carte individuelle et éditeur partagé, images/signatures et fonds cinéma, horloge locale, couleurs et ordre des badges, ciblage et règles LAN/WAN manuelles, alias/avatars, ressources storage/YAML, publication HACS. Le détail et les limites sont dans [ARCHITECTURE](ARCHITECTURE.md) et les preuves dans [AUDIT_INITIAL](AUDIT_INITIAL.md). Ces fonctions ne sont pas des travaux futurs.

## Décisions explicites

Les phases 0 et 1.1 sont validées. **2A** est définitivement validée sur `942de6f` après correction du reliquat de rollback. **2B** est définitivement clôturée après le verdict indépendant **VALIDÉ** de 2B.4 sur `f918150` (fusion et états de connexion corrigés ; limites d’ordre acceptées). **2C** est définitivement clôturée (A3/A4). **2D** est définitivement clôturée sur `28bef59` (A6), sans contre-audit supplémentaire, par décision du mainteneur. **2E.1** corrige localement A11 et A12. Voir [l’état de reprise](DEVELOPMENT_STATUS.md) pour les SHA complets et [RECETTE](RECETTE.md) pour les preuves. Aucune publication ni migration approuvée ; la stable reste v0.1.16 (`443ce38`).

## Ordre proposé après validation

| Ordre | Lot proposé | Critère de sortie avant livraison |
|---|---|---|
| 1 | **Options et compatibilité** (A7, A8, A13) : aller-retour JSON et précisions sur la version de Tracearr et la clé de compte ; ni défaut de géométrie ni interaction visuelle. | `unknown` explicite conservé ; anciens YAML toujours lisibles sans migration obligatoire. A6 est déjà clôturée en 2D. |
| 2 | **Autres propositions de l’audit** (A9, A10) : réauthentification et présentation des données périmées, qui exige une décision sur les états de disponibilité et le gel de l’horloge. | Accord de périmètre avant modification ; pas de changement de sémantique implicite dans un lot visuel. |
| 3 | **Contenir le coût des dashboards** (A5) : mémoire, caches, timers, trafic WS, performances longue durée et cycle de vie, hors 2E.1. | Caches proportionnés aux sessions utiles ; comparer avant/après (abonnés, octets, temps de rendu, mémoire longue durée). Les correctifs A11/A12 sont livrés en 2E.1 ; tactile et vrais thèmes HA restent à éprouver. |
| 4 | **Consolider validation et maintenance** : matrice Core minimum/stable, fixtures anonymes Plex/Jellyfin/Emby, smoke HA et navigateur dans la CI selon coût, traduction progressive, précision sur les dimensions de l’icône (A14, documentation historique sans panne avérée). | Contrats de ressource, flows, options et entités testés sans production ; contrôles reproductibles sur le SHA candidat. Pas de réécriture globale du JS proposée sans mesures et tests d’équivalence. |
| 5 | **Étudier la musique**, [demande #2](https://github.com/Moosketair/home-assistant-tracearr/issues/2). L’amont fournit des champs artiste/album/année ; la carte actuelle n’a pas de présentation musicale dédiée. | Soumettre au mainteneur une proposition de pochette carrée et de métadonnées, préciser repli si absentes et compatibilité des cartes existantes. Confirmation du périmètre avant développement. |

La priorité d’un lot n’est pas une promesse de publication. Garder les issues comme suivi opérationnel et le changelog pour ce qui a effectivement été livré.
