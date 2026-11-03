# Tracearr HA — Intégration HACS pour Home Assistant

[![Validation](https://github.com/Moosketair/home-assistant-tracearr/actions/workflows/validate.yml/badge.svg)](https://github.com/Moosketair/home-assistant-tracearr/actions/workflows/validate.yml)

**Suivez en temps réel les lectures Plex, Jellyfin et Emby directement dans votre tableau de bord Home Assistant.** Une intégration HACS, des capteurs et deux cartes Lovelace entièrement personnalisables : liste verticale, grille adaptative ou carrousel.

**Version 0.1.3 Alpha.** Ce projet est en cours de test sur de vraies installations Home Assistant. N'utilisez pas encore ses capteurs pour des automatismes critiques.

## Fonctionnalités

- **API publique Tracearr v2 :** récupération des lectures actives et de l'état des serveurs.
- **Temps réel :** une seule connexion SSE pour toute l'instance Home Assistant, avec reconnexion automatique et interrogation REST de secours (~15 s hors connexion SSE, vérification ~60 s en temps réel). Après chaque événement `ready`, les données sont resynchronisées, car Tracearr ne rejoue pas les événements manqués.
- **Capteurs :** flux actifs, lectures directes, transcodages vidéo seulement, audio seulement, vidéo + audio, transcodages non classés, débit estimé et disponibilité des serveurs.
- **Deux cartes Lovelace :** carte *Lectures en cours* (tous les flux) et carte *Lecture individuelle* (un flux filtré ou choisi).
- **Trois dispositions :** liste verticale, grille adaptative et carrousel avec un à quatre flux visibles.
- **Carrousel personnalisable :** défilement automatique, intervalle, durée de transition, cinq effets, barre de défilement horizontale toujours cachée, flèches activables/désactivables et navigation au cliquer-glisser avec la souris, au doigt ou au clavier. La pause au survol de la souris est facultative.
- **Couleurs par serveur :** liseré latéral jaune/orange pour Plex, violet pour Jellyfin et vert pour Emby.
- **Affichage adaptable :** redimensionnement natif en largeur ET en hauteur dans les dashboards Home Assistant *Sections* ; hauteur CSS facultative pour les autres dashboards et mode compact.
- **Éditeur visuel :** filtres (utilisateur, serveur, transcodage), tri, informations affichées/masquées, noms et avatars personnalisés.
- **Informations par lecture :** affiche, utilisateur, titre, épisode, progression, durée restante, lecteur, résolution, codecs et débit. Icônes vidéo/audio indépendantes (vert = direct/copie, orange = transcodage, gris = inconnu), masquables. En pause : symbole sur l’affiche et « En pause » orange en remplacement du temps restant.

### Nouveautés de la version 0.1.3

Le carrousel se pilote désormais au **cliquer-glisser**, comme sur une interface tactile, en plus des flèches masquables. Sa barre de défilement horizontale est **toujours invisible**. Les cartes ont un fond transparent et le texte est blanc, avec une taille de police paramétrable. La barre de progression utilise au choix la couleur du thème Home Assistant, celle du serveur (Plex/Jellyfin/Emby) ou une couleur personnalisée.

| Réglage | Valeurs proposées |
|---|---|
| Mode d'affichage | `list`, `grid`, `carousel` |
| Nombre de flux dans le carrousel | `carousel_visible: 1` à `4` |
| Défilement automatique | `carousel_autoplay: true` / `false` |
| Intervalle avant changement de flux | `carousel_interval: 3` à `120` secondes |
| Effet de transition | `slide` (glissement), `fade` (fondu), `zoom`, `flip` (retournement 3D), `none` (aucun) |
| Durée d'une transition | `carousel_transition_speed: 100` à `3000` millisecondes |
| Barre horizontale | Toujours masquée, y compris avec une ancienne configuration |
| Afficher les flèches | `carousel_show_arrows: true` / `false` |
| Cliquer-glisser à la souris | `carousel_mouse_drag: true` / `false` |
| Icônes vidéo/audio | `show_transcode_icons: true` / `false` |
| Taille des polices | `font_size: 10` à `28` (pixels) |
| Couleur de progression | `progress_color_mode: theme`, `server` ou `custom` |
| Couleur personnalisée | `progress_custom_color: "#00BCD4"` |
| Arrêter au survol de la souris | `carousel_pause_on_hover: true` / `false` |

L'animation automatique se suspend lorsque la page est masquée ou que le navigateur demande une réduction des mouvements. La pause au survol de la souris peut être activée séparément (désactivée par défaut). Le **temps entre deux changements** (`carousel_interval`) est distinct de la **durée de l'animation** (`carousel_transition_speed`).

## Installation avec HACS

1. Dans **HACS → ⋮ → Dépôts personnalisés**, ajoutez `https://github.com/Moosketair/home-assistant-tracearr` comme **Intégration**.
2. Installez **Tracearr HA**, puis **redémarrez Home Assistant**.
3. Allez dans **Paramètres → Appareils et services → Ajouter une intégration → Tracearr HA**.
4. Entrez l'adresse de Tracearr (accessible depuis Home Assistant) et votre clé API `trr_pub_...`, créée dans **Tracearr → Paramètres → Données et API → API**.
5. Ouvrez votre tableau de bord → **Modifier → Ajouter une carte** et cherchez « Tracearr ». Les cartes sont également disponibles depuis l'éditeur manuel (exemples ci-dessous).

**Si les cartes ne figurent pas dans le sélecteur :** ouvrez **Paramètres → Tableaux de bord → ⋮ → Ressources** et vérifiez qu'une seule ressource de type **Module JavaScript** pointe vers `/tracearr_ha/tracearr-card.js?v=0.1.3`. Si une ancienne ressource (`?v=0.1.0` ou `?v=0.1.1`) existe, modifiez-la plutôt que d'en créer une seconde. Rechargez ensuite le navigateur avec `Ctrl + F5`.

**Installation manuelle :** copiez le dossier `custom_components/tracearr_ha` dans `/config/custom_components/tracearr_ha/`, puis redémarrez Home Assistant.

## Exemples de cartes Lovelace

**Grille adaptative :**

```yaml
type: custom:tracearr-streams-card
mode: grid
columns: auto
show_transcodes: true
show_progress: true
show_quality: true
show_paused: true
```

**Carrousel automatique, deux lectures visibles, avec zoom et navigation à la souris :**

```yaml
type: custom:tracearr-streams-card
mode: carousel
carousel_visible: 2
carousel_autoplay: true
carousel_interval: 8
carousel_transition: zoom
carousel_transition_speed: 800
carousel_show_arrows: true
carousel_mouse_drag: true
show_transcodes: true
show_transcode_icons: true
progress_color_mode: server
font_size: 15
```

**Liste compacte :**

```yaml
type: custom:tracearr-streams-card
mode: list
compact: true
show_poster: false
show_bitrate: true
show_codecs: true
```

**Lecture individuelle pour un utilisateur :**

```yaml
type: custom:tracearr-stream-card
filter_user: alice
selection: recent
show_poster: true
```

Les mêmes réglages sont accessibles depuis **l'éditeur graphique Lovelace**.

### Redimensionnement et personnalisation

Dans un tableau de bord **Sections**, utilisez la **poignée de redimensionnement** fournie par Home Assistant pour augmenter la hauteur ou la largeur. La carte déclare désormais une hauteur initiale de 4 lignes, un minimum de 2 et un maximum de 30 lignes ; contrairement à l'ancienne hauteur « auto », le redimensionnement vertical est permis. Les réglages `grid_rows` et `grid_columns` correspondent à la taille **initiale**, et la taille personnalisée par Home Assistant (`grid_options`) est prioritaire sur la hauteur CSS. Pour les vues hors Sections, utilisez `height` (pixels).

Dans l'éditeur, le réglage **Couleur de la barre de lecture** accepte `theme`, `server` ou `custom` (dans ce dernier cas, choisir aussi la couleur dans le sélecteur). Le réglage **Taille de police** s'applique à tous les textes des lectures, à l'exception des icônes de statut. L'affichage de la paire d'icônes vidéo et audio se contrôle séparément avec `show_transcode_icons`; les compteurs agrégés en en-tête conservent leur réglage `show_transcodes`.

La barre de défilement horizontale ne s'affiche plus jamais. **Le glissement tactile est toujours disponible** ; le cliquer-glisser à la souris et les boutons précédent/suivant sont désactivables séparément. Le clavier (flèches gauche/droite, lorsque le carrousel a le focus) fonctionne aussi. Les cartes n'ont pas de fond ajouté ; elles suivent le fond du dashboard et affichent leur texte en blanc, à l'exception des indicateurs de statut colorés.

## Personnaliser les utilisateurs

Dans **Paramètres → Appareils et services → Tracearr HA → Configurer**, sélectionnez un compte et définissez son nom d'affichage. Les identifiants Plex et Jellyfin ne sont pas modifiés.

Pour personnaliser uniquement une carte, utilisez le champ *Alias*, une ligne par correspondance :

```text
alice=Alice maison
plex:alice=Alice Plex
<identifiant_serveur>:alice=Alice salon
```

Les avatars peuvent être remplacés de la même façon avec des URL d'images HTTPS accessibles depuis le navigateur.

## Fonctionnement et sécurité

- Les données des sessions transitent par le **WebSocket authentifié de Home Assistant** : les cartes ne se connectent pas directement à l'API Tracearr.
- La clé API reste dans la configuration Home Assistant. **Ne la mettez jamais dans un YAML Lovelace.**
- Un proxy d'images côté Home Assistant est prévu pour les affiches Tracearr ; seules les images liées à une lecture active peuvent être récupérées via son endpoint dédié.
- Les noms d'utilisateurs et les médias visibles dans Lovelace sont accessibles aux personnes autorisées à consulter le tableau de bord.
- Tracearr ferme normalement une connexion SSE après environ 30 minutes. L'intégration se reconnecte, respecte `Retry-After` sur HTTP 429 et réessaie avec temporisation lors des erreurs 503.
- Les valeurs de transcodage ambiguës sont classées **inconnues**, sans estimation arbitraire.

### Limites connues

L'API `/streams` v2 ne fournit pas la distinction réseau local/WAN ni un identifiant d'utilisateur stable par session. La carte n'invente donc pas ces informations. Les lectures individuelles peuvent être choisies par utilisateur, serveur ou ID de session. L'arrêt à distance d'un flux n'est pas implémenté. L'option « Masquer si aucune lecture » masque le contenu de la carte ; une cellule de la mise en page Home Assistant peut rester réservée.

## Compatibilité

- Home Assistant **2025.6+** (cible de développement ; les versions récentes utilisent `resource_mode` pour les ressources Lovelace).
- Tracearr **API publique v2** ; SSE disponible à partir de **Tracearr 2.7.0**, sinon synchronisation REST périodique.
- Navigateurs récents Chromium, Firefox et Safari prenant en charge les fonctionnalités CSS utilisées dans les cartes.

## Dépannage

1. **Aucun capteur :** consultez **Paramètres → Système → Journaux** et vérifiez l'URL et la clé API Tracearr.
2. **Le SSE se reconnecte souvent :** désactivez le buffering du proxy inverse pour `text/event-stream` et augmentez le délai d'inactivité au-delà de 30 secondes (un ping arrive environ toutes les 25 secondes).
3. **La carte est introuvable :** vérifiez la ressource `/tracearr_ha/tracearr-card.js?v=0.1.3` dans Lovelace, redémarrez HA et rechargez votre navigateur.
4. **Les images sont absentes :** vérifiez que les URL `poster_url` sont bien servies par le proxy d'images de Tracearr et qu'aucune erreur n'apparaît dans les journaux réseau du navigateur.
5. **Transcodage « Inconnu » :** Tracearr ou le serveur média n'a pas fourni assez de détails pour classer la lecture.
6. **Le carrousel ne défile pas automatiquement :** vérifiez qu'il y a plus de flux que de cartes visibles, que la page est au premier plan, que la pause au survol est désactivée ou que la souris est sortie de la carte, et que la réduction des animations n'est pas activée dans le système.

## Développement et tests

```bash
python -m compileall -q custom_components
python -m pytest -q tests
node --check custom_components/tracearr_ha/frontend/tracearr-card.js
node --test tests/test_carousel.cjs
```

La suite de tests couvre notamment la classification des transcodages, les événements SSE, la compatibilité Lovelace, la navigation dans le carrousel, les effets et les couleurs Plex/Jellyfin/Emby. Un test complet sur plusieurs versions de Home Assistant et sur un véritable serveur Tracearr reste nécessaire avant de qualifier cette version de stable.

## Évolutions envisagées

- Sélection graphique des utilisateurs hors ligne dans les filtres.
- Davantage de tests des affiches et avatars sur différentes installations Tracearr.
- Statistiques utilisateur détaillées et diagnostics.
- Traduction complète de l'éditeur et amélioration de l'accessibilité.
- Captures de référence et tests d'affichage sur mobile et sur les tableaux de bord *Sections*.

**Licence MIT.** Projet communautaire indépendant, sans affiliation avec Tracearr, Home Assistant, Plex, Jellyfin ou Emby.
