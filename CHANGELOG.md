# Historique des versions

## 0.1.2 — Alpha (2026-11-03)

- Correction du défilement automatique : chaque lecture est affichée dans l'ordre, puis retour au début après la dernière.
- Conservation de l'index du carrousel pendant les mises à jour SSE de progression.
- Réglage de la durée de transition (100–3000 ms).
- Cinq effets de transition : glissement, fondu, zoom, retournement 3D, sans animation.
- Barre de défilement horizontale masquable, pause au survol facultative et gestion des cartes étroites.
- Liseré coloré selon le serveur : Plex orange, Jellyfin violet, Emby vert.
- Documentation README entièrement en français.
- Nouveaux tests JavaScript, exécutés également par GitHub Actions.

## 0.1.1 — Alpha (2026-11-03)

- Compatibilité avec les versions récentes de Home Assistant utilisant `LovelaceData.resource_mode`.
- Maintien d'une compatibilité avec les anciennes versions et tests de non-régression.

## 0.1.0 — Alpha (2026-11-03)

- Première intégration de l'API publique Tracearr v2 pour Home Assistant.
- Connexion SSE unique avec synchronisation REST de secours.
- Capteurs de flux, transcodages distincts et disponibilité des serveurs.
- Deux cartes Lovelace, trois dispositions, éditeur visuel, filtres, alias et avatars.

**Version Alpha : tests en environnement Home Assistant réel encore nécessaires.**
