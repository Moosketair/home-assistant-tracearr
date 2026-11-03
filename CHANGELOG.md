# Historique des versions

## 0.1.5 — Alpha (2026-11-03)

- Correction des temps déjà lu et restant qui avançaient ou reculaient par à-coups lors des mises à jour SSE.
- Horloge monotone locale et actualisation visuelle à 250 ms ; correction douce des petites divergences.
- Conservation de l'horloge lors des rafraîchissements de la carte, de la pause et de la reprise ; les véritables déplacements dans le film restent détectés.
- Quatre nouveaux tests JavaScript couvrant les positions irrégulières, les pauses/reprises, les sauts et la cadence.


## 0.1.4 — Alpha (2026-11-03)

- Restauration du cadre extérieur natif `ha-card` : fond, bordure, rayon et ombre pilotés par le thème Home Assistant. Les panneaux intérieurs conservent un fond légèrement contrasté, ou transparent au choix.
- Bandeau d’en-tête entièrement désactivable, titre personnalisable et statistiques activables séparément : total des flux, débit total, lectures directes, en pause, transcodage vidéo seul/audio seul/les deux, total des transcodages et nombre de flux par serveur.
- Les statistiques d’en-tête correspondent aux flux réellement affichés après application des filtres, y compris pour les vues d’un seul utilisateur.
- Couleur commune pour la progression, les badges de résolution/débit et les statistiques : thème HA, couleur Plex/Jellyfin/Emby ou couleur hexadécimale personnalisée. Choix automatique de l’écriture blanche ou noire pour maximiser le contraste.
- Affiches centrées verticalement même lorsque le pied d’informations occupe plusieurs lignes ; correction d’une puce de séparation inutile si les codecs sont absents.
- Éditeur visuel regroupé dans des catégories repliables : En-tête et statistiques, Disposition et dimensions, Navigation et carrousel, Contenu de la lecture, Bandeau d’informations du flux, Apparence et couleurs, Filtres et tri, Noms et avatars.
- Migration des anciens réglages `show_counter`, `show_transcodes`, `progress_color_mode`, `progress_custom_color` pour préserver les dashboards existants.
- Nouveaux tests sur le contraste, les métriques, les anciennes configurations, le style de la carte et le regroupement de l’éditeur.

## 0.1.3 — Alpha (2026-11-03)

- Barre de défilement horizontale masquée de façon permanente dans le carrousel.
- Boutons de navigation affichables ou masquables, sans désactiver le glissement tactile.
- Navigation au cliquer-glisser à la souris et au clavier ; option pour désactiver le glissement souris.
- Deux icônes séparées (vidéo et audio) : vert pour lecture directe, orange pour transcodage, gris si indéterminé. Les anciens badges textuels de transcodage par flux disparaissent.
- Lecture en pause : symbole de pause sur l'affiche, « En pause » orange à la place du temps restant, sans assombrir toute la carte.
- Fond des cartes transparent, informations en blanc, taille des polices personnalisable (10 à 28 px).
- Couleur de progression au choix : thème Home Assistant, couleur de serveur ou couleur personnalisée (validation hexadécimale).
- Mise à disposition d'une hauteur explicite et de limites de taille pour permettre le redimensionnement vertical natif dans les dashboards Sections ; la grille native est prioritaire sur la hauteur CSS.
- Tests supplémentaires sur les couleurs, états de pause, dimensionnement et navigation.

## 0.1.2 — Alpha (2026-11-03)

- Correction du défilement automatique : les flux avancent dans l'ordre et reviennent au premier après le dernier, même en cas de mises à jour SSE fréquentes.
- Conservation de la position du carrousel quand seule la progression d'un média change.
- Ajout d'une durée de transition réglable (100 à 3000 ms).
- Ajout de cinq effets : glissement, fondu, zoom, retournement 3D et sans animation.
- Ajout d'un réglage pour masquer la barre de défilement horizontale du carrousel.
- Liseré de couleur adapté au serveur : Plex (jaune/orange), Jellyfin (violet), Emby (vert).
- Documentation GitHub entièrement en français.
- Nouveaux tests JavaScript de navigation, d'animation, de couleurs et d'affichage.

## 0.1.1 — Alpha (2026-11-03)

- Correction du démarrage sur les versions récentes de Home Assistant (`LovelaceData.resource_mode` au lieu de `mode`).
- Maintien de la compatibilité avec les anciennes versions.
- Actualisation de la ressource Lovelace et ajout de tests de non-régression.

## 0.1.0 — Alpha (2026-11-03)

- Première intégration Home Assistant de l'API publique Tracearr v2.
- Connexion SSE unique et synchronisation REST de secours.
- Capteurs de flux actifs, transcodages séparés et disponibilité des serveurs.
- Deux cartes Lovelace : regroupée et individuelle ; liste, grille et carrousel.
- Éditeur visuel, filtres, progression, images, alias et avatars.

**Version Alpha : validation complète sur plusieurs installations Home Assistant encore nécessaire.**
