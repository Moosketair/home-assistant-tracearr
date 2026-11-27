# Visuels Tracearr HA — 6D.10

Le module JavaScript est celui du tag `v0.1.18` (`c257ce666f9ca5dcd16b5984f994e5e959861e42`). Les vrais composants de carte sont montés dans un banc de démonstration : données fictives, faux abonnement Home Assistant, surface `ha-card` simulée et palette appliquée par variables de thème. Aucune retouche du contenu des cartes. Les textes configurables et les badges techniques sont en anglais ; les textes fixes français de la stable (« En pause », « lectures ») restent tels quels.

| Capture | Dimensions | Octets | Présentation |
| --- | ---: | ---: | --- |
| [Aperçu sombre standard](overview-dark.webp) | 1000 × 796 | 41 910 | Trois lectures, fond sombre uni. |
| [Aperçu cinéma](overview-cinema.webp) | 1000 × 796 | 51 528 | Même composition, thème plus profond et flou des affiches natif. |
| [Individuelle sombre standard](individual-dark.webp) | 740 × 470 | 23 444 | Style Technique, détails du transcodage faciles à comparer. |
| [Individuelle cinéma](individual-cinema.webp) | 740 × 470 | 25 996 | Même carte, ambiance violette tirée de l’affiche. |
| [Carrousel](carousel.webp) | 1000 × 410 | 32 852 | Deux panneaux visibles après un clic réel sur Suivant. |
| [Cinq styles](badge-styles.webp) | 740 × 987 | 30 522 | Même lecture et même palette de thème pour isoler les styles. |

**Choix validé pour le README :** aperçu cinéma directement visible ; aperçu sombre standard, carte individuelle sombre et carrousel en sections repliables. Les cinq styles sont sous Personnalisation. L’individuelle cinéma reste une alternative non intégrée au README principal.

## Reproduire

Lancer `python recette/readme_showcase.py` avec Playwright, Chromium et ImageMagick. Le banc ne démarre aucun serveur : Playwright fournit uniquement le module, la page et les illustrations vectorielles originales sur une origine simulée de loopback, et bloque les autres requêtes. Les captures sont cadrées sur la zone de présentation, puis converties en WebP qualité 92 sans métadonnées. Les preuves historiques sous `recette/preuves/` ne sont pas modifiées.
