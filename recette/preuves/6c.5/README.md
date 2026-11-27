# Recette visuelle 6C.5 — Filtres et personnalisation

Captures du véritable module Tracearr HA sous Chromium 152, avec thèmes et lectures fictives. Aucune donnée personnelle.

| Capture | Vue |
|---|---|
| [Filtres](filtres.webp) | Quatre types de médias, tous sélectionnés par défaut |
| [Métadonnées](metadonnees.webp) | Ordre personnalisé, année masquée et numéros activés |
| [Badges](badges.webp) | Visibilité et ordre musicaux, exemple FLAC → AAC |
| [Carte mixte](mixte.webp) | Film, épisode et pistes sans filtre |
| [Même carte, musique seule](musique-seule.webp) | Types vidéo exclus, total limité aux sessions visibles |
| [Rendu personnalisé](personnalisation.webp) | Artiste en premier, numéros visibles, fréquence masquée, conteneur et débit détaillé activés |

Reproduction : `python -B recette/music_editor.py` dans le banc isolé (Chromium, Playwright, Pillow et PyYAML). Voir la [recette](../../../docs/RECETTE.md#6c5--filtres-et-personnalisation-musicale).
