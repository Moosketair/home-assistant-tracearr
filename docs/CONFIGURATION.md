# Configuration et personnalisation des cartes

Retour au [README](../README.md) · [Historique des versions](../CHANGELOG.md)

Ce guide rassemble les réglages détaillés. Les nouveautés et les anciennes versions sont documentées dans `CHANGELOG.md` ; les options ci-dessous décrivent l'usage courant.

### Réglages du carrousel et de la présentation

Le carrousel se pilote au **cliquer-glisser**, comme sur une interface tactile, en plus des flèches masquables. Sa barre de défilement horizontale est **toujours invisible**. Le cadre extérieur suit désormais le thème natif Home Assistant ; les panneaux de lecture disposent de leur propre fond (léger contraste ou transparent). La couleur de progression et des badges se règle avec une seule palette.

| Réglage | Valeurs proposées |
|---|---|
| Mode d'affichage | `list`, `carousel` |
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
| Fond intérieur | `stream_surface: soft` / `transparent` / `blur` |
| Flou de l'affiche | `stream_blur: 0` à `50` (pixels, défaut 26) |
| Assombrissement de l'affiche | `stream_overlay: 25` à `95` (%, défaut 72) |
| Liseré gauche | `stream_accent_style: rounded` / `straight` / `none` |
| Épaisseur du liseré | `stream_accent_width: 2` à `8` (pixels, défaut 4) |
| Taille de l'affiche | `poster_size: 50` à `200` (% ; défaut `100`) |
| Palette commune (progression et badges) | `accent_color_mode: theme`, `server` ou `custom` |
| Couleur personnalisée | `accent_custom_color: "#00BCD4"` |
| Arrêter au survol de la souris | `carousel_pause_on_hover: true` / `false` |

L'animation automatique se suspend lorsque la page est masquée ou que le navigateur demande une réduction des mouvements. La pause au survol de la souris peut être activée séparément (désactivée par défaut). Le **temps entre deux changements** (`carousel_interval`) est distinct de la **durée de l'animation** (`carousel_transition_speed`).


## Exemples de cartes Lovelace

**Liste verticale :**

```yaml
type: custom:tracearr-streams-card
mode: list
show_header: true
title: Activité multimédia
header_show_streams: true
header_show_bandwidth: true
header_show_video: true
header_show_audio: true
header_show_both: true
header_show_transcodes_total: true
header_show_server_counts: true
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
header_show_server_counts: true
show_transcode_icons: true
accent_color_mode: server
stream_surface: soft
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
selection: account
selected_account: plex:alice
show_poster: true
```

Les mêmes réglages sont accessibles depuis **l'éditeur graphique Lovelace**.

### Redimensionnement et personnalisation

Dans un tableau de bord **Sections**, réglez hauteur et largeur dans **Modifier le tableau de bord → Carte → Mise en page**, à l’aide des contrôles natifs de Home Assistant. La taille de la jaquette se règle indépendamment dans **Affichage général → Taille de l'affiche (%)** (`poster_size`, de 50 à 200 %, 100 % par défaut), y compris pour les cartes individuelles et en mode compact. Les anciens champs `grid_columns`, `grid_rows` et `height` ne sont plus proposés et sont ignorés par le moteur de rendu. Les anciennes cartes en `mode: grid` sont automatiquement affichées en liste verticale. Dans les autres types de tableaux de bord, la taille dépend de la disposition HA et de ses conteneurs, sans taille CSS forcée par Tracearr.

### Personnalisation de l'en-tête

Les options de la section **En-tête et badges** permettent de masquer entièrement le bandeau (`show_header: false`), d'afficher un titre personnel (`title`) ou de ne garder que certains indicateurs. Chaque badge (statistique Tracearr ou entité HA) possède une option **Alignement** : automatique, gauche, centre ou droite. Les badges sont regroupés dans des zones qui ne sont créées que lorsqu'elles contiennent des badges visibles : en l'absence de badge au centre, aucune colonne centrale n'est réservée. Sur téléphone, les groupes gauche et droite restent côte à côte lorsque leur largeur le permet et reviennent à la ligne seulement si nécessaire. Les groupes conservent leur ordre défini par `header_badge_order`. Sous **Statistiques Tracearr**, les interrupteurs de visibilité restent accessibles, et chaque statistique peut être ouverte pour régler son nom, son icône MDI, le masquage à zéro, l'animation, sa durée et sa couleur à zéro. Ces valeurs sont enregistrées dans `header_metric_settings` ; les anciennes cartes gardent leurs réglages précédents. Vous pouvez afficher, indépendamment les uns des autres :

| Réglage | Affichage |
|---|---|
| `header_show_streams` | Nombre total de flux visibles |
| `header_show_bandwidth` | Débit cumulé en Mb/s |
| `header_show_direct` | Lectures directes |
| `header_show_paused` | Flux en pause |
| `header_show_video` | Transcodages vidéo seulement |
| `header_show_audio` | Transcodages audio seulement |
| `header_show_both` | Transcodages vidéo et audio |
| `header_show_transcodes_total` | Total des transcodages |
| `header_show_server_counts` | Un compteur pour chaque serveur Plex/Jellyfin/Emby ayant au moins un flux visible |

Les compteurs correspondent aux lectures visibles après application des filtres de la carte ; ils ne prétendent donc pas représenter d'autres flux cachés par les réglages. Le titre reste optionnel (`show_title`) ; quand il est masqué, les badges sont alignés à gauche automatiquement.

### Titres, saisons, épisodes et années

La nouvelle catégorie de l'éditeur **Titres, saisons et années** sépare totalement les films des séries :

- **Films** : afficher ou cacher le titre (`movie_show_title`) et l'année (`movie_show_year`), choisir leur ordre (`movie_field_order`).
- **Séries** : afficher ou cacher le **titre de série** (`series_show_title`), le **nom de l'épisode** (`series_show_episode_title`), la **saison** (`series_show_season`) et le **numéro d’épisode** (`series_show_episode_number`) indépendamment et l'**année** (`series_show_year`).
- **Format de saison/épisode** : `series_episode_style: short` donne `S01E02` ; `long` donne `Saison 1 · Épisode 2`.
- **Ordre libre** : dans l'éditeur visuel, utilisez les boutons ↑ et ↓ pour réorganiser chaque champ. Le premier champ affiché occupe la ligne de titre en caractères plus gros ; les suivants sont affichés en dessous, dans l'ordre choisi. L'ordre fonctionne également si certains éléments sont masqués.

Exemple YAML (tous les réglages sont aussi disponibles dans l'éditeur) :

```yaml
type: custom:tracearr-streams-card
mode: carousel
movie_show_title: true
movie_show_year: false
movie_field_order: title,year
series_show_title: true
series_show_episode_title: true
series_show_season: true
series_show_episode_number: true
series_show_year: true
series_episode_style: long
series_field_order: series,season,episode_number,episode,year
```

**Important** : l'année provient du champ `year` fourni par Tracearr ; selon le serveur, ce champ peut correspondre à l'année de l'épisode plutôt qu'à la première année de diffusion de toute la série.

### Badges Home Assistant en en-tête

Dans **En-tête et badges → Badges d'entités Home Assistant**, cliquez sur **Ajouter un badge**, puis choisissez une entité grâce à la recherche native Home Assistant. Vous pouvez ajouter un nom personnalisé ou laisser le nom de l'entité. Sa valeur et son unité sont actualisées à chaque changement d'état, sans reconstruire le carrousel.

Vous pouvez sélectionner **n'importe quelle entité Home Assistant** : par exemple `counter.overseer_demande`, `sensor.temperature_salon` ou un `input_number`. Les entités indisponibles affichent « Indisponible ». La couleur suit le réglage existant des badges d'en-tête. Il est possible d'ajouter jusqu'à 20 badges.

Exemple YAML facultatif :

```yaml
header_entity_badges:
  - entity: counter.overseer_demande
    label: Demandes Seerr
  - entity: sensor.temperature_salon
    label: Salon
```

### Débits locaux et distants

Dans **Débit et localisation des flux**, choisissez l'affichage du débit pour **Tous les flux**, **Local uniquement**, ou **Distant uniquement**. Ce réglage affecte à la fois les badges de débit individuels et le débit agrégé de l'en-tête.

**Limitation importante :** l'API publique Tracearr v2 utilisée par cette intégration ne fournit pas l'adresse IP du client ni le statut LAN/WAN. On ne peut donc pas détecter automatiquement les flux locaux ou distants depuis cette API. La carte utilise des correspondances **manuelles**, saisies une par ligne :

```yaml
bitrate_scope: remote
network_locations: |
  plex:alice=remote
  device:Apple TV=local
  player:Plex for Android=remote
```

Les règles peuvent utiliser `identifiantServeur:utilisateur`, `plex:utilisateur`, `jellyfin:utilisateur`, `device:Nom`, `player:Nom` ou seulement le nom d'utilisateur. Indiquez `local` ou `remote`. Une règle par utilisateur/appareil est indicative et ne suit pas automatiquement les déplacements de l'appareil. En mode « Local » ou « Distant », les flux non classés **ne sont pas comptés** ; le mode « Tous » n'utilise pas les correspondances.

### Comportement sans lecture

Dans **Comportement sans lecture**, choisissez entre **Afficher un message**, **En-tête uniquement** ou **Masquer complètement la carte**. Le champ `empty_message` personnalise le texte lorsque personne ne regarde ; si Tracearr est déconnecté, le message « Tracearr indisponible » reste prioritaire.

```yaml
empty_mode: header_only  # message, header_only, hide
empty_message: Rien à regarder en ce moment
```

`hide_empty: true` reste interprété comme `empty_mode: hide` pour les anciennes cartes, sauf si le nouveau mode est déjà défini.


### Fond natif et palette de couleurs

L'enveloppe de la carte utilise les couleurs, les bordures et les ombres natives de Home Assistant. Pour les panneaux des lectures, le champ `stream_surface` accepte `soft` (léger contraste avec le fond), `transparent` ou `blur` (fond cinéma flouté issu de l'affiche déjà fournie par Tracearr). L'intensité (`stream_blur`) et l'assombrissement (`stream_overlay`) se règlent dans **Affichage général**, de même que le style et l'épaisseur du liseré gauche. Par défaut, les anciennes cartes restent avec leur fond contrasté et un liseré arrondi. Une affiche indisponible donne un fond sombre sans image ; aucune nouvelle source externe n'est contactée.

Une sélection **Palette commune** détermine la couleur de la barre de lecture et des badges de qualité et de débit. Par défaut, les badges de l'en-tête reprennent cette palette :

- `accent_color_mode: theme` : couleur d'accent du thème HA ;
- `accent_color_mode: server` : Plex orange, Jellyfin violet, Emby vert ; les statistiques générales conservent la couleur d'accent du thème, alors que les compteurs par serveur portent chacun sa couleur ;
- `accent_color_mode: custom` : couleur `accent_custom_color` au format `#RRGGBB`.

Une option **Couleur des badges d'en-tête** (dans **En-tête et badges**) permet désormais d'appliquer **une couleur indépendante** : `header_badge_color_mode: inherit` (palette commune), `theme`, `server` (couleur dédiée aux compteurs de chaque serveur, thème pour les métriques générales) ou `custom` avec `header_badge_custom_color: "#223344"`.

Le texte de chaque badge coloré est noir ou blanc suivant le meilleur contraste. Les icônes de statut vidéo/audio (vert direct, orange transcodage) et le message « En pause » gardent leurs couleurs de statut.

L'éditeur visuel contient des **sections repliables** : En-tête et statistiques, Disposition et dimensions, Navigation et carrousel, Contenu de la lecture, Titres/saisons/années, Bandeau d'informations du flux, Apparence/couleurs/typographie, Filtres et tri, et Noms et avatars. Chaque instance de la carte possède ses propres paramètres.

Les réglages enregistrés avec les anciennes versions restent pris en charge (`show_counter`, `show_transcodes`, `progress_color_mode`, `progress_custom_color`) et sont convertis lors du chargement. Le réglage hérité `show_year` est automatiquement appliqué aux deux nouveaux interrupteurs d'année, sauf si l'un d'eux a déjà été personnalisé. À partir de 0.1.6, utilisez les réglages séparés.

La barre horizontale du carrousel reste masquée ; navigation par flèches facultatives, glissement tactile, glissement souris facultatif et clavier. **Les événements SSE de progression, de pause, de transcodage, de débit ou de santé serveur ne reconstruisent plus le conteneur du carrousel**, ce qui préserve la transition en cours. Une arrivée ou disparition de flux nécessite une actualisation de la liste, mais conserve le flux visible s'il existe encore. Après une navigation manuelle, l'intervalle de défilement automatique recommence au début. Le texte et les panneaux intérieurs s'adaptent au thème.


## Personnaliser les utilisateurs

Dans **Paramètres → Appareils et services → Tracearr HA → Configurer → Modifier les noms de tous les utilisateurs**, un champ est proposé par compte détecté (Plex, Jellyfin et Emby). Les noms déjà enregistrés sont **préremplis** : vous pouvez modifier plusieurs comptes puis enregistrer en une fois. Les identifiants d’origine ne sont pas modifiés. Un éditeur avancé permet toujours de régler individuellement les avatars.

Pour personnaliser uniquement une carte, utilisez le champ *Alias*, une ligne par correspondance :

```text
alice=Alice maison
plex:alice=Alice Plex
<identifiant_serveur>:alice=Alice salon
```

Les avatars peuvent être remplacés de la même façon avec des URL d'images HTTPS accessibles depuis le navigateur.


## Chronomètres et temps de lecture

Les temps écoulé et restant sont calculés localement à partir d'une horloge monotone, sur une même valeur de secondes pour éviter des changements désynchronisés. Les petits décalages des mises à jour SSE sont corrigés progressivement sans faire reculer le chronomètre ; les sauts volontaires dans la lecture sont pris en compte. En pause, le temps est figé.

Dans la carte, **temps écoulé / temps restant** apparaît à gauche ; l'option `show_end_time: true` affiche **« Fin à HH:mm »** à droite. En pause, cette estimation disparaît et « En pause » est affiché. Les heures peuvent rester approximatives si Tracearr remonte tardivement une mise en tampon.

Les badges d'en-tête peuvent utiliser `header_positive_only`, `header_blink_positive`, `header_blink_seconds`, `header_show_names`, `header_zero_color_mode` et `header_zero_custom_color`. Chaque badge d'entité dans `header_entity_badges` ou statistique dans `header_metric_settings` peut surcharger son comportement avec `align`, `show_name`, `show_icon`, `only_positive`, `blink_positive`, `blink_seconds`, `zero_color_mode` et `zero_custom_color`. Les statistiques acceptent en plus un nom et une icône MDI personnalisés.

Les animations de clignotement sont désactivées lorsque le système demande une réduction des mouvements.
