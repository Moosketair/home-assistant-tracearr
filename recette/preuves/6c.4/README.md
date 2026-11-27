# Recette visuelle 6C.4 — Lectures musicales

Chromium 152, véritable module `custom_components/tracearr_ha/frontend/tracearr-card.js`. Le banc fournit une surface de thème HA, des sessions fictives et des réponses d’images locales ; les panneaux, badges et styles sont ceux du module livré. Aucun lecteur, compte ni serveur personnel.

| Capture | Vue |
|---|---|
| [Mixte](mixte.webp) | Carte groupée : film, épisode et piste |
| [Musique](musique.webp) | Carte groupée : trois pistes |
| [Direct](direct.webp) | Carte individuelle : FLAC, 44,1 kHz, stéréo |
| [Transcodage](transcodage.webp) | Carte individuelle : FLAC → AAC, débit audio et débit global distincts |
| [Pause](pause.webp) | Temps restant et statut orange |
| [Carrousel](carousel.webp) | Carte groupée mixte, sur le panneau suivant |
| [Styles](styles.webp) | Les cinq styles de badges sur une piste |
| [Clair](clair.webp) | Carte musicale en thème clair |
| [Pochettes](pochettes.webp) | Original carré, découpe verticale du même original, rendu des deux, source horizontale, source absente et réponse 404 |

Reproduction : `python -B recette/music_showcase.py --chromium /usr/bin/chromium` dans un environnement de recette avec Playwright et Pillow. Le même script vérifie les dimensions, les pixels du recadrage, le débordement, deux changements d’illustration en carrousel et 16 combinaisons de largeur, densité et disposition des badges. Voir [la recette 6C.4](../../../docs/RECETTE.md#6c4--présentation-musicale).
