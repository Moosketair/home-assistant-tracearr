# Configuration et personnalisation des cartes

Retour au [README](../README.md) · [Historique des versions](../CHANGELOG.md)

Ce guide rassemble les réglages détaillés. Les nouveautés et les anciennes versions sont documentées dans `CHANGELOG.md` ; les options ci-dessous décrivent l'usage courant.

## Compatibilité Tracearr

Tracearr HA a besoin des routes REST `/streams` et `/servers` de l’API publique v2 (`/api/v2/public/`). La route `/events` fournit le flux temps réel SSE. Si ce flux est indisponible, Home Assistant continue de récupérer périodiquement les lectures et les serveurs via les deux routes REST ; le repli ne dispense donc pas de disposer de `/servers`.

Tracearr `2.6.0` ne fournit pas `/servers` et n’est pas compatible, même sans SSE. Les routes nécessaires et `/events` sont présentes dans le code source de Tracearr `2.7.0`, mais cette vérification en lecture de code ne vaut pas essai sur une instance réelle. Elle ne garantit pas non plus la compatibilité de toutes les versions ultérieures. Voir [les sources amont examinées dans l’audit](AUDIT_INITIAL.md#compatibilité-et-vérifications-officielles).

### Ressource Lovelace en mode YAML

En mode stockage, redémarrez Home Assistant après le remplacement de l’intégration : la ressource existante est actualisée automatiquement. En mode YAML, conservez une seule déclaration et adaptez `?v=` à la version du manifeste installé. Pour `v0.1.18` :

```yaml
lovelace:
  resource_mode: yaml
  resources:
    - url: /tracearr_ha/tracearr-card.js?v=0.1.18
      type: module
```

Sur les anciens Core qui n’ont pas `resource_mode`, utilisez le `mode: yaml` déjà en place plutôt que d’ajouter cette clé. Rechargez le dashboard après la mise à jour de la ressource ; ne recréez ni l’entrée Tracearr ni les cartes.

Si vous venez d’une préversion, remplacez son `?v=` par `?v=0.1.18` dans cette même déclaration, sans ajouter de seconde ressource.

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

### Types de médias et réglages musicaux

> Réglages du candidat 6C.5 ; ils ne sont pas inclus dans la stable publiée `v0.1.18`.

Dans **Choix des lectures et filtres → Types de médias**, cochez les catégories à afficher. Les films (`movie`), séries (`episode`) et pistes (`track`) sont classés d’après le type public de Tracearr. **Autres médias** regroupe notamment le direct (`live`), les photos (`photo`), les bandes-annonces (`trailer`), les types inconnus ou futurs, et les sessions dont le type manque.

Le filtre s’applique avant le choix de la lecture individuelle. Si une session précise est exclue, la carte ne la remplace pas par une autre. Les sélections par compte ou par serveur restent limitées à leur cible. Les badges Tracearr du bandeau comptent les sessions visibles après filtrage ; les capteurs globaux Home Assistant et les badges d’entités ne changent pas.

| Clé YAML facultative | Format et défaut |
|---|---|
| `filter_media_types` | Liste de `movie`, `episode`, `track`, `other`. Absente : toutes les lectures. Liste explicitement vide `[]` : aucune lecture ; la carte suit `empty_mode`. |
| `music_field_order` | Chaîne séparée par des virgules. Défaut : `title,artist,album,year,track_number,disc_number`. |
| `music_field_visibility` | Objet de booléens : `title`, `artist`, `album`, `year` activés ; `track_number`, `disc_number` désactivés par défaut. |
| `music_badge_order` | Chaîne séparée par des virgules. Défaut : `audio_format,audio_codec,sample_rate,channels,audio_bitrate,container`. |
| `music_badge_visibility` | Objet de booléens : `audio_format`, `audio_codec`, `sample_rate`, `channels` activés ; `audio_bitrate`, `container` désactivés par défaut. |

Une valeur de filtre de mauvais type ou une liste non vide entièrement inconnue utilise le défaut « tous ». Les catégories reconnues sont dédupliquées ; dans les ordres, les valeurs inconnues ou répétées sont ignorées et les champs omis sont ajoutés dans leur ordre par défaut. Les valeurs de visibilité non booléennes sont ignorées. Une ancienne carte sans ces clés conserve toutes ses lectures et ses réglages vidéo.

**Titres, saisons et années → Informations musicales** permet de déplacer et masquer les champs. Le premier champ visible et renseigné occupe la ligne principale ; par défaut, titre, artiste, puis album et année. Le champ artiste vient de Tracearr et peut désigner l’artiste de l’album. **Badges techniques → Badges musicaux** règle seulement les catégories musicales. Le format spécifique est prioritaire et se replie sur le codec ; désactiver le format permet d’afficher uniquement le codec. `audio_bitrate` désigne la mesure audio détaillée, distincte du débit du flux réglé par `show_bitrate` et `bitrate_scope`. Le conteneur est une information distincte, même s’il porte le même nom que le codec. Les cinq styles, leur disposition, les couleurs et le mode de transcodage restent communs. Une mesure de source n’est pas affichée comme destination confirmée.

Exemple pour une carte groupée dédiée à la musique :

```yaml
type: custom:tracearr-streams-card
filter_media_types: [track]
music_field_order: "artist,title,album,year,track_number,disc_number"
music_field_visibility:
  year: false
  track_number: true
music_badge_visibility:
  audio_bitrate: true
  container: true
```


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
selected_account: "00000000-0000-4000-8000-000000000001:alice"
show_poster: true
```

Remplacez l’identifiant serveur fictif par le `server_id` Tracearr du compte : `selected_account` attend `server_id:username`, pas `type:username`. `plex:alice` reste utilisable comme clé pour les alias et règles, mais ne sélectionne pas le compte dans cet exemple. Pour éviter de saisir l’identifiant à la main, choisissez **Lecture d’un utilisateur** puis le compte dans **l’éditeur graphique Lovelace → Choix des lectures et filtres**.

**Dernière lecture active avec affiche et heure de fin :**

```yaml
type: custom:tracearr-stream-card
selection: recent
show_poster: true
poster_size: 110
show_end_time: true
```

**Liste avec fond cinéma et deux badges alignés :**

```yaml
type: custom:tracearr-streams-card
mode: list
stream_surface: blur
stream_blur: 26
stream_overlay: 72
stream_accent_style: rounded
show_header: true
header_show_streams: true
header_show_transcodes_total: true
header_metric_settings:
  streams:
    align: left
  transcodes_total:
    align: right
```

### Redimensionnement et personnalisation

Dans un tableau de bord **Sections**, réglez hauteur et largeur dans **Modifier le tableau de bord → Carte → Mise en page**, à l’aide des contrôles natifs de Home Assistant. La taille de la jaquette se règle indépendamment dans **Affichage général → Taille de l'affiche (%)** (`poster_size`, de 50 à 200 %, 100 % par défaut), y compris pour les cartes individuelles et en mode compact. Les anciens champs `grid_columns`, `grid_rows` et `height` ne sont plus proposés et sont ignorés par le moteur de rendu. Les anciennes cartes en `mode: grid` sont automatiquement affichées en liste verticale. Dans les autres types de tableaux de bord, la taille dépend de la disposition HA et de ses conteneurs, sans taille CSS forcée par Tracearr.

Sur les deux cartes, la hauteur Sections est **automatique par défaut**. Choisissez **Affichage général → En l’absence de lecture → En-tête uniquement** pour obtenir un bandeau centré d’une ligne native (56 px avec le thème standard) si le titre et les badges tiennent. La carte s’agrandit si les badges se replient, si un message ou un avertissement doit être affiché, ou si une lecture démarre ; elle se réduit quand la dernière lecture se termine. Home Assistant ne fournit pas de mode public qui arrondit automatiquement le contenu à un nombre entier de lignes. En **hauteur fixe** (`grid_options.rows` entier dans la configuration Lovelace), celle-ci est conservée ; le contenu peut défiler à l’intérieur de la carte si nécessaire. Pour passer une carte déjà réglée en hauteur fixe à l’ajustement naturel, utilisez la mise en page native ou renseignez `grid_options.rows: auto`. Tracearr ne modifie pas les tailles enregistrées.

### Personnalisation de l'en-tête

Les options de la section **En-tête et badges** permettent de masquer entièrement le bandeau (`show_header: false`), d'afficher un titre personnel (`title`) ou de ne garder que certains indicateurs. Chaque badge (statistique Tracearr ou entité HA) possède une option **Alignement** : automatique, gauche, centre ou droite. Quand un groupe central existe, sa colonne utilise la largeur exacte de ses badges ; les deux colonnes latérales se partagent équitablement l'espace restant pour préserver un centrage exact. Sur téléphone et tablette, les badges peuvent rester sur une seule ligne lorsque la largeur suffit. Si une carte est extrêmement étroite, le groupe central peut passer sur une autre ligne. Les badges sont regroupés dans des zones qui ne sont créées que lorsqu'elles contiennent des badges visibles : en l'absence de badge au centre, aucune colonne centrale n'est réservée. Sur téléphone, les groupes gauche et droite restent côte à côte lorsque leur largeur le permet et reviennent à la ligne seulement si nécessaire. Les groupes conservent leur ordre défini par `header_badge_order`. Sous **Statistiques Tracearr**, les interrupteurs de visibilité restent accessibles, et chaque statistique peut être ouverte pour régler son nom, son icône MDI, le masquage à zéro, l'animation, sa durée et sa couleur à zéro. Ces valeurs sont enregistrées dans `header_metric_settings` ; les anciennes cartes gardent leurs réglages précédents. Vous pouvez afficher, indépendamment les uns des autres :

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

### Badges techniques des panneaux de lecture

Dans l’éditeur Lovelace des deux cartes, ouvrez **Badges techniques**. Les réglages sont propres à chaque carte, indépendants des badges de statistiques et de capteurs de l’en-tête. **Classique** est le rendu historique : résolution et débit avec la palette globale, codecs en texte combiné. **Premium** utilise un fond teinté et une bordure colorée ; **Cinéma**, un fond de couleur pleine ; **Minimaliste**, un fond neutre avec un trait latéral ; **Technique**, un second niveau quand une précision est disponible (dimensions, profil, disposition des canaux), ou une description du format reconnu (p. ex. Matroska pour MKV). La taille, l’arrondi et l’espacement s’adaptent sans réglage supplémentaire.

| Clé YAML | Valeurs et comportement par défaut |
|---|---|
| `technical_badge_style` | `classic` (par défaut), `premium`, `cinema`, `minimal`, `technical`. |
| `technical_badge_layout` | `compact` (par défaut) regroupe les catégories avec retour à la ligne ; `separate` crée un groupe vidéo, audio et général (conteneur/débit), seulement si le groupe contient une information visible. |
| `technical_transcode_mode` | `destination` (Destination uniquement), `source_to_destination` (Source → destination). **Omettre** la clé pour conserver la sémantique historique : résolution source et priorité aux codecs du flux. |
| `technical_badge_order` | Liste séparée par des virgules : `resolution,hdr,video_codec,audio_format,audio_codec,channels,container,bitrate` par défaut dans le nouveau rendu. Les catégories omises sont ajoutées à la fin. En disposition séparée, la première catégorie visible de chaque groupe détermine sa place ; l’ordre s’applique ensuite à l’intérieur de chaque groupe. |
| `technical_badge_visibility` | Dictionnaire de booléens par catégorie de la liste ci-dessus, sauf `bitrate`, qui reste contrôlé par `show_bitrate`. Une clé absente hérite de `show_quality` pour `resolution` (défaut `true`), de `show_codecs` pour les deux codecs (défaut `false`). HDR, format audio, canaux et conteneur sont proposés par défaut dans les styles non classiques. |
| `technical_badge_colors` | `true` par défaut pour les nouveaux styles, `false` pour un rendu neutre. Le style Classique n’utilise pas la palette par format. |
| `technical_badge_custom_colors` | Dictionnaire facultatif `identifiant: "#RRGGBB"` ; seules les couleurs hexadécimales sur six chiffres sont admises. Dans **Couleurs avancées**, réinitialisez un format ou toute la palette. Désactiver les couleurs ou revenir à Classique conserve les valeurs personnalisées. |

En Classique, sans réglage de disposition séparée, de transcodage, d’ordre ou de visibilité propre aux catégories, `footer_field_order`, `show_quality`, `show_codecs` et `show_bitrate` conservent exactement leur rôle initial. Avec le nouveau rendu, le bloc technique prend la première position technique de `footer_field_order` (parmi `quality`, `bitrate` et `codecs`). Serveur, appareil et santé restent dans leur bandeau historique ; le filtrage LAN/WAN du débit et les icônes direct/transcodage ne changent pas.

```yaml
type: custom:tracearr-stream-card
technical_badge_style: technical
technical_badge_layout: separate
technical_transcode_mode: source_to_destination
show_codecs: true
technical_badge_order: resolution,video_codec,hdr,audio_format,audio_codec,channels,container,bitrate
technical_badge_visibility:
  container: false
technical_badge_custom_colors:
  4k: "#dca83b"
  hevc: "#399e92"
```

**Identifiants de couleurs disponibles :**

- Résolutions : `8k`, `4k`, `1440p`, `1080p`, `720p`, `480p`, `sd`.
- Plage dynamique : `dv`, `hdr10plus`, `hdr10`, `hdr`, `hlg`, `sdr`.
- Vidéo : `h264`, `hevc`, `av1`, `vp9`, `vp8`, `mpeg1`, `mpeg2`, `mpeg4`, `vc1`.
- Formats et codecs audio : `atmos`, `dtsx`, `truehd`, `eac3`, `ac3`, `dts`, `dtshd`, `dtshd_ma`, `dtshd_hra`, `flac`, `alac`, `pcm`, `aac`, `opus`, `mp3`, `vorbis`.
- Canaux et conteneurs : `mono`, `stereo`, `"5.1"`, `"7.1"`, `mkv`, `mp4`, `mpegts`, `webm`, `avi`, `mov`, `m2ts`, `flv`. Le débit et les autres valeurs fournies restent neutres.

**Ce que Tracearr permet d’identifier.** Les résolutions viennent du libellé source ou des dimensions disponibles. Le type HDR provient de la plage dynamique publiée : un HDR générique reste HDR. Une version de Plex qui ne distingue pas HDR10+ dans ces données ne permet pas de l’afficher comme tel. Atmos nécessite un indicateur ou un nom explicite, jamais un simple TrueHD ou E‑AC‑3 ; DTS:X nécessite également un profil ou un nom explicite. Pour les canaux, une disposition exploitable prime ; à défaut, `5.1` et `7.1` suivent la convention Tracearr pour 6 et 8 canaux. Les conteneurs sont ceux de `transcode_info`, quand renseignés.

**En transcodage**, les dimensions vidéo et le nombre de canaux de sortie ne sont affichés comme tels que si Tracearr les fournit, de même que le conteneur. Plex, Jellyfin et Emby peuvent renvoyer le codec source en guise de repli : si le codec est égal et que la piste est transcodée, sa destination est considérée comme inconnue, même si d’autres caractéristiques de sortie sont connues. Les adaptateurs reprennent ou supposent la plage dynamique de sortie (notamment SDR sur Jellyfin/Emby) : elle n’est pas présentée comme confirmée sur une piste transcodée. Les adaptateurs n’exposent pas non plus de profil audio de sortie indépendant ; un libellé Atmos/DTS:X explicite et distinct peut être utilisé s’il figure dans le codec diffusé.

- **Destination uniquement** : une caractéristique transcodée à destination inconnue est omise. Une piste explicitement copiée ou lue directement conserve ses caractéristiques ; le changement de conteneur est indépendant.
- **Source → destination** : la flèche n’apparaît qu’entre deux valeurs connues et différentes, avec leurs couleurs respectives. Si la destination est inconnue, la source est affichée seule, sans suffixe visible ; l’infobulle et le libellé accessible en précisent l’origine.
- **Format audio** privilégie le format spécifique (par ex. Atmos). À défaut, il affiche le codec, même si **Codec audio** est désactivé : AAC en lecture directe, **ATMOS → AAC** en comparaison, **AAC** en destination uniquement. Le choix se fait indépendamment pour chaque côté et ne confirme pas une destination ambiguë.
- **Codec audio** seul affiche les codecs sans le format spécifique : **E-AC-3 → AAC** dans cet exemple. Avec les deux catégories activées dans un mode de transcodage explicite, un seul badge occupe la position de **Format audio**. En style Technique, le codec complémentaire peut apparaître sous le format (par ex. **E-AC-3** sous **ATMOS**), avec le détail disponible dans l’infobulle. Les deux catégories désactivées masquent ces badges mais pas les canaux audio. Le bandeau Classique historique sans personnalisation reste inchangé.

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

Les règles de la carte ont priorité sur celles de l’intégration. À chaque niveau, une règle d’appareil, de lecteur ou de compte propre au serveur prime sur le défaut `server:identifiantServeur`, qui prime sur une règle générique. Dans les options de l’intégration, l’action groupée **Tous les appareils** remplace les choix individuels des appareils détectés sur ce serveur. Le filtre ne masque aucune lecture et ne change pas le capteur HA de débit total ni les compteurs de sessions.

Dans les **options de l’intégration → Options avancées → Règles LAN/WAN (JSON)**, la valeur `"unknown"` force un appareil à rester non classé. Supprimer la clé de l’appareil laisse les règles de repli s’appliquer, par exemple le défaut du serveur. Ce formulaire JSON n’est pas le YAML de la carte.

### Comportement sans lecture

Dans **Comportement sans lecture**, choisissez entre **Afficher un message**, **En-tête uniquement** ou **Masquer complètement la carte**. En mode **Afficher un message**, `empty_message` personnalise le texte en l’absence de lecture visible tant que la source peut encore être actualisée.

Si ni le polling REST ni le flux direct SSE ne fournissent de données suffisamment fiables, la carte affiche **« Tracearr indisponible — données non actualisées »** avec le nom de l’instance, même sans lecture visible ou avec l’en-tête masqué. Les panneaux, compteurs et débits conservés sont ceux des dernières lectures connues. Les temps affichés se figent, la barre devient grise et « Non actualisé » remplace l’heure de fin si celle-ci est activée et si la durée est connue. Une vraie pause reste identifiable. Un snapshot fiable retire l’avertissement, recale la progression sur la position reçue et retire les sessions terminées. Une panne d’un seul des deux transports ne déclenche pas cet avertissement si l’autre maintient les lectures à jour.

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

Dans les deux cartes, **temps écoulé / temps restant** apparaît à gauche ; le temps restant suit `show_progress` et `show_remaining`. L’option `show_end_time: true` affiche **« Fin à HH:mm »** à droite pendant la lecture. En pause, la progression et les temps se figent ; le message orange **« En pause »** prend la place de l’heure de fin à droite, même si l’estimation est désactivée. Masquer la progression ou le temps restant ne les réaffiche pas en pause. À la reprise, l’heure de fin est recalculée. Une lecture périmée n’affiche pas d’estimation ; « Non actualisé » reste distinct de la dernière pause connue. Les heures peuvent rester approximatives si Tracearr remonte tardivement une mise en tampon.

Les badges d'en-tête peuvent utiliser `header_positive_only`, `header_blink_positive`, `header_blink_seconds`, `header_show_names`, `header_zero_color_mode` et `header_zero_custom_color`. Chaque badge d'entité dans `header_entity_badges` ou statistique dans `header_metric_settings` peut surcharger son comportement avec `align`, `show_name`, `show_icon`, `only_positive`, `blink_positive`, `blink_seconds`, `normal_custom_color`, `zero_color_mode` et `zero_custom_color`. Les statistiques acceptent en plus un nom et une icône MDI personnalisés. Le réglage de la statistique `server_counts` s’applique à tous les compteurs par serveur.

Dans **En-tête et badges**, ouvrez la statistique ou le badge d’entité souhaité, puis **Couleur normale → Couleur particulière**. **Palette par défaut** efface la couleur particulière et rétablit la palette historique. La couleur spécifique à zéro, individuelle ou globale, garde la priorité quand elle s’applique. Si le réglage à zéro est **Palette normale**, le badge conserve sa couleur normale, personnalisée ou non. Sans `normal_custom_color`, aucun changement pour les anciennes cartes.

```yaml
header_metric_settings:
  streams:
    normal_custom_color: "#d8f6ba"
    zero_color_mode: custom
    zero_custom_color: "#333344"
header_entity_badges:
  - id: requests
    entity: counter.requests
    normal_custom_color: "#efcb87"
```

Les animations de clignotement sont désactivées lorsque le système demande une réduction des mouvements.
