# Historique des versions

## 0.1.6 — Alpha (2026-11-03)

- Options séparées pour les titres et les années des films et des séries, le titre de l’épisode et la saison/numéro d’épisode.
- Choix du format de saison/épisode : `S01E02` ou `Saison 1 · Épisode 2`.
- Ordre libre des informations (année incluse) par boutons haut/bas dans l’éditeur graphique, séparément pour films et séries.
- Couleur indépendante des badges de l’en-tête : palette commune, thème Home Assistant, couleurs Plex/Jellyfin/Emby ou couleur personnalisée, avec contraste automatique.
- Correction des changements brusques du carrousel lors de mises à jour SSE des états, débits et métadonnées : mise à jour des cartes en place, sans interrompre le défilement du conteneur.
- Conservation de la lecture affichée si la liste change et que ce flux existe toujours ; intervalle de défilement réinitialisé après les navigations manuelles.
- Nouveaux tests de non-régression pour les ordres, les filtres de visibilité, la palette des badges et la stabilité du carrousel.

## 0.1.5 — Alpha (2026-11-03)

- Correction des oscillations des temps de lecture et du temps restant observées dans les cartes : les positions SSE légèrement en retard ne réinitialisent plus l’horloge toutes les deux secondes.
- Horloge monotone locale pour l’animation à 250 ms, avec synchronisation douce (200 ms maximum par nouvel échantillon), sans retour en arrière durant une lecture normale.
- Détection des déplacements volontaires dans le film (avance/retour de plusieurs secondes) : synchronisation immédiate de la nouvelle position.
- Les reconstructions de la carte préservent l’horloge de chaque session ; mise en pause fige les compteurs et reprise les relance.
- Tests de non-régression avec échantillons SSE irréguliers, mise en pause/reprise et sauts volontaires.


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
