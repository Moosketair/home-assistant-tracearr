# Feuille de route — propositions à arbitrer

## Livré en v0.1.16

Lecture REST et SSE par entrée, capteurs globaux et par serveur, listes et carrousel groupés, carte individuelle et éditeur partagé, images/signatures et fonds cinéma, horloge locale, couleurs et ordre des badges, ciblage et règles LAN/WAN manuelles, alias/avatars, ressources storage/YAML, publication HACS. Le détail et les limites sont dans [ARCHITECTURE](ARCHITECTURE.md) et les preuves dans [AUDIT_INITIAL](AUDIT_INITIAL.md). Ces fonctions ne sont pas des travaux futurs.

## Décisions explicites

Les phases 0 et 1.1 sont validées. **2A** est définitivement validée sur `942de6f` après correction du reliquat de rollback. **2B** est définitivement clôturée après le verdict indépendant **VALIDÉ** de 2B.4 sur `f918150` (fusion et états de connexion corrigés ; limites d’ordre acceptées). **2C.1** est livrée localement, exclusivement pour A3/A4 et la méthode de reprise. Voir [l’état de reprise](DEVELOPMENT_STATUS.md) pour les SHA complets et [RECETTE](RECETTE.md) pour les preuves. Aucune publication ni migration approuvée ; la stable reste v0.1.16 (`443ce38`).

## Ordre proposé après validation

| Ordre | Lot proposé | Critère de sortie avant livraison |
|---|---|---|
| 1 | **Options et compatibilité** (A6–A8, A13) : invalidation visuelle des règles, aller-retour JSON, précisions sur version Tracearr et clé de compte. | En-tête et panneaux cohérents sur changement LAN/WAN ; `unknown` explicite conservé ; anciens YAML toujours lisibles sans migration obligatoire. |
| 2 | **Autres propositions de l’audit** (A9, A10), à arbitrer séparément. | Accord de périmètre avant modification. |
| 3 | **Contenir le coût des dashboards et les régressions d’affichage** (A5, A11, A12) : purge des caches, mesure du trafic WS et des ticks, interactions clavier et largeur de badge. | Caches proportionnés aux sessions utiles ; comparer avant/après (abonnés, octets, temps de rendu, mémoire longue durée). Vérifier centrage court **et** libellés longs, thème clair/sombre et navigation tactile/clavier dans un vrai navigateur. |
| 4 | **Consolider validation et maintenance** : matrice Core minimum/stable, fixtures anonymes Plex/Jellyfin/Emby, smoke HA et navigateur dans la CI selon coût, traduction progressive, précision sur l’icône (A14). | Contrats de ressource, flows, options et entités testés sans production ; contrôles reproductibles sur le SHA candidat. Pas de réécriture globale du JS proposée sans mesures et tests d’équivalence. |
| 5 | **Étudier la musique**, [demande #2](https://github.com/Moosketair/home-assistant-tracearr/issues/2). L’amont fournit des champs artiste/album/année ; la carte actuelle n’a pas de présentation musicale dédiée. | Soumettre au mainteneur une proposition de pochette carrée et de métadonnées, préciser repli si absentes et compatibilité des cartes existantes. Confirmation du périmètre avant développement. |

La priorité d’un lot n’est pas une promesse de publication. Garder les issues comme suivi opérationnel et le changelog pour ce qui a effectivement été livré.
