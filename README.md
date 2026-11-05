# Tracearr HA — Intégration HACS pour Home Assistant

[![Validation](https://github.com/Moosketair/home-assistant-tracearr/actions/workflows/validate.yml/badge.svg)](https://github.com/Moosketair/home-assistant-tracearr/actions/workflows/validate.yml)

**Suivez en temps réel les lectures Plex, Jellyfin et Emby directement dans votre tableau de bord Home Assistant.** Une intégration HACS, des capteurs et deux cartes Lovelace entièrement personnalisables : liste verticale ou carrousel.

**Version de test 0.1.14b2 (bêta).** La dernière version stable publiée reste v0.1.13. Ce projet est en cours de test sur de vraies installations Home Assistant. N'utilisez pas encore ses capteurs pour des automatismes critiques.

## Nouveautés de la version 0.1.14

- **Taille des affiches réglable** de 50 à 200 % dans « Affichage général », pour les cartes groupées et individuelles ; le mode compact conserve ses proportions.
- **Badges alignés à gauche** automatiquement lorsque le titre de l'en-tête est masqué.
- **Affiches plus fiables** : chargement dès l'arrivée des liens signés, sans attendre une nouvelle lecture, jusqu'à trois nouvelles tentatives en cas d'échec (2, 5 puis 15 secondes), et affichage de remplacement si l'image reste indisponible.
- **Nouveau fond cinéma** : affiche floutée derrière chaque lecture, avec intensité et assombrissement réglables. Le liseré coloré suit désormais les coins arrondis ; ancien trait droit ou masquage disponibles en options.
- **Badges d'en-tête personnalisés individuellement** : chaque statistique Tracearr et entité Home Assistant peut être alignée à gauche, au centre ou à droite, indépendamment de l'ordre global. Les statistiques disposent des mêmes options de visibilité du nom/de l'icône, masquage à zéro, clignotement, période et couleur à zéro que les entités, avec un nom et une icône MDI personnalisables.

## Améliorations récentes

- **Carte « Lecture individuelle » :** sélection d’une session active dans une liste déroulante, d’un utilisateur (suivi de ses prochaines lectures), d’un serveur ou de la dernière session. Une session spécifique disparaît de la carte lorsqu’elle se termine.
- **Plus de grille adaptative :** seules les dispositions *liste* et *carrousel* sont proposées. Les anciens dashboards en grille sont convertis automatiquement en liste.
- **Dimensions natives :** les champs de largeur Sections, hauteur Sections et hauteur CSS ont disparu. Utilisez **Mise en page** dans le tableau de bord Home Assistant.
- **Configuration groupée :** dans la configuration de l’intégration, un formulaire prérempli liste tous les appareils détectés (lectures en cours + jusqu’à 500 lectures récentes de l’historique + anciens appareils enregistrés), avec le choix **Local / Distant / Non classé**. Les noms personnalisés des utilisateurs se modifient également en une fois, un champ par compte.
- **En-tête simplifié :** chaque compteur et chaque entité dispose de son propre panneau repliable. Les réglages globaux d’affichage et de couleurs sont regroupés, avec toujours des exceptions possibles pour les badges.
- **Rétrocompatibilité :** les classifications LAN/WAN, alias, avatars, badges et filtres existants sont conservés ; la nouvelle interface préremplit les valeurs enregistrées.

## Fonctionnalités

- **API publique Tracearr v2 :** récupération des lectures actives et de l'état des serveurs.
- **Temps réel :** une seule connexion SSE pour toute l'instance Home Assistant, avec reconnexion automatique et interrogation REST de secours (~15 s hors connexion SSE, vérification ~60 s en temps réel). Après chaque événement `ready`, les données sont resynchronisées, car Tracearr ne rejoue pas les événements manqués.
- **Capteurs :** flux actifs, lectures directes, transcodages vidéo seulement, audio seulement, vidéo + audio, transcodages non classés, débit estimé et disponibilité des serveurs.
- **Deux cartes Lovelace :** carte *Lectures en cours* (tous les flux) et carte *Lecture individuelle* (un flux filtré ou choisi).
- **Deux dispositions :** liste verticale et carrousel avec un à quatre flux visibles.
- **Carrousel personnalisable :** défilement automatique, intervalle, durée de transition, cinq effets, barre de défilement horizontale toujours cachée, flèches activables/désactivables et navigation au cliquer-glisser avec la souris, au doigt ou au clavier. La pause au survol de la souris est facultative.
- **Couleurs par serveur :** liseré latéral jaune/orange pour Plex, violet pour Jellyfin et vert pour Emby. Son style et son épaisseur sont réglables (arrondi, ancien trait droit ou masqué).
- **Affichage adaptable :** redimensionnement par l’onglet **Mise en page** de Home Assistant (dashboards *Sections*) et mode compact. Les anciennes dimensions CSS de la carte ont été supprimées.
- **Éditeur visuel simplifié :** affichage général, choix des lectures, en-tête avec sous-menus par badge, médias, bandeau inférieur, carrousel et réglages avancés.
- **En-tête personnalisable :** masquer le bandeau, changer son titre et sélectionner individuellement les compteurs (flux, débit cumulé, transcodages vidéo/audio/mixtes/total, direct, pause et flux par serveur). Ajouter autant de badges d’entités Home Assistant (capteurs, compteurs, etc.) que souhaité, jusqu’à 20, avec nom facultatif et valeur mise à jour en direct.
- **Couleurs partagées :** même palette pour barres de progression, bulles de qualité/débit et compteurs, avec choix automatique de la couleur du texte (noir ou blanc).
- **Aspect Home Assistant natif :** carte extérieure `ha-card` avec le fond, les bordures et l'ombre du thème ; sous-cartes légèrement contrastées, transparentes ou avec l'affiche floutée en arrière-plan. Affiches centrées verticalement lorsque les détails se répartissent sur plusieurs lignes.
- **Informations par lecture :** affiche, utilisateur, titre, épisode, saison et numéro d’épisode indépendamment masquables, progression, durée restante, lecteur, résolution, codecs et débit. Les affiches passent par le proxy sécurisé de Home Assistant lorsque Tracearr fournit une URL de son proxy d'images ; les erreurs temporaires sont retentées sans réinitialiser le carrousel. Icônes vidéo/audio indépendantes (vert = direct/copie, orange = transcodage, gris = inconnu), masquables. En pause : symbole sur l’affiche et « En pause » orange en remplacement du temps restant.

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

## Installation avec HACS

1. Dans **HACS**, recherchez **Tracearr HA** dans le catalogue officiel puis cliquez sur **Télécharger**.
2. Installez **Tracearr HA**, puis **redémarrez Home Assistant**.
3. Allez dans **Paramètres → Appareils et services → Ajouter une intégration → Tracearr HA**.
4. Entrez l'adresse de Tracearr (accessible depuis Home Assistant) et votre clé API `trr_pub_...`, créée dans **Tracearr → Paramètres → Données et API → API**.
5. Ouvrez votre tableau de bord → **Modifier → Ajouter une carte** et cherchez « Tracearr ». Les cartes sont également disponibles depuis l'éditeur manuel (exemples ci-dessous).

**Si les cartes ne figurent pas dans le sélecteur :** ouvrez **Paramètres → Tableaux de bord → ⋮ → Ressources** et vérifiez qu'une seule ressource de type **Module JavaScript** pointe vers `/tracearr_ha/tracearr-card.js?v=0.1.14`. Si une ancienne ressource (`?v=0.1.0` ou `?v=0.1.1`) existe, modifiez-la plutôt que d'en créer une seconde. Rechargez ensuite le navigateur avec `Ctrl + F5`.

**Installation manuelle :** copiez le dossier `custom_components/tracearr_ha` dans `/config/custom_components/tracearr_ha/`, puis redémarrez Home Assistant.

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
filter_user: alice
selection: recent
show_poster: true
```

Les mêmes réglages sont accessibles depuis **l'éditeur graphique Lovelace**.

### Redimensionnement et personnalisation

Dans un tableau de bord **Sections**, réglez hauteur et largeur dans **Modifier le tableau de bord → Carte → Mise en page**, à l’aide des contrôles natifs de Home Assistant. La taille de la jaquette se règle indépendamment dans **Affichage général → Taille de l'affiche (%)** (`poster_size`, de 50 à 200 %, 100 % par défaut), y compris pour les cartes individuelles et en mode compact. Les anciens champs `grid_columns`, `grid_rows` et `height` ne sont plus proposés et sont ignorés par le moteur de rendu. Les anciennes cartes en `mode: grid` sont automatiquement affichées en liste verticale. Dans les autres types de tableaux de bord, la taille dépend de la disposition HA et de ses conteneurs, sans taille CSS forcée par Tracearr.

### Personnalisation de l'en-tête

Les options de la section **En-tête et badges** permettent de masquer entièrement le bandeau (`show_header: false`), d'afficher un titre personnel (`title`) ou de ne garder que certains indicateurs. Chaque badge (statistique Tracearr ou entité HA) possède une option **Alignement** : automatique, gauche, centre ou droite. Les groupes conservent leur ordre défini par `header_badge_order`. Sous **Statistiques Tracearr**, les interrupteurs de visibilité restent accessibles, et chaque statistique peut être ouverte pour régler son nom, son icône MDI, le masquage à zéro, l'animation, sa durée et sa couleur à zéro. Ces valeurs sont enregistrées dans `header_metric_settings` ; les anciennes cartes gardent leurs réglages précédents. Vous pouvez afficher, indépendamment les uns des autres :

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

### Titres, saisons, épisodes et années (0.1.7)

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

### Badges Home Assistant en en-tête (0.1.7)

Dans **En-tête et statistiques → Badges d'entités Home Assistant**, cliquez sur **Ajouter un badge**, puis choisissez une entité grâce à la recherche native Home Assistant. Vous pouvez ajouter un nom personnalisé ou laisser le nom de l'entité. Sa valeur et son unité sont actualisées à chaque changement d'état, sans reconstruire le carrousel.

Vous pouvez sélectionner **n'importe quelle entité Home Assistant** : par exemple `counter.overseer_demande`, `sensor.temperature_salon` ou un `input_number`. Les entités indisponibles affichent « Indisponible ». La couleur suit le réglage existant des badges d'en-tête. Il est possible d'ajouter jusqu'à 20 badges.

Exemple YAML facultatif :

```yaml
header_entity_badges:
  - entity: counter.overseer_demande
    label: Demandes Seerr
  - entity: sensor.temperature_salon
    label: Salon
```

### Débits locaux et distants (0.1.7)

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

### Comportement sans lecture (0.1.7)

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

## Fonctionnement et sécurité

- Les données des sessions transitent par le **WebSocket authentifié de Home Assistant** : les cartes ne se connectent pas directement à l'API Tracearr.
- La clé API reste dans la configuration Home Assistant. **Ne la mettez jamais dans un YAML Lovelace.**
- Un proxy d'images côté Home Assistant est prévu pour les affiches Tracearr ; seules les images liées à une lecture active peuvent être récupérées via son endpoint dédié.
- Les noms d'utilisateurs et les médias visibles dans Lovelace sont accessibles aux personnes autorisées à consulter le tableau de bord.
- Tracearr ferme normalement une connexion SSE après environ 30 minutes. L'intégration se reconnecte, respecte `Retry-After` sur HTTP 429 et réessaie avec temporisation lors des erreurs 503.
- Les valeurs de transcodage ambiguës sont classées **inconnues**, sans estimation arbitraire.

### Limites connues

L'API `/streams` v2 ne fournit pas la distinction réseau local/WAN ni un identifiant d'utilisateur stable par session. La carte ne classe les flux locaux ou distants que si vous ajoutez une correspondance manuelle ; elle n'invente pas ces informations. Les lectures individuelles peuvent être choisies par utilisateur, serveur ou ID de session. L'arrêt à distance d'un flux n'est pas implémenté. L'option « Masquer complètement la carte » masque le contenu de la carte ; une cellule de la mise en page Home Assistant peut rester réservée.

## Compatibilité

- Home Assistant **2025.6+** (cible de développement ; les versions récentes utilisent `resource_mode` pour les ressources Lovelace).
- Tracearr **API publique v2** ; SSE disponible à partir de **Tracearr 2.7.0**, sinon synchronisation REST périodique.
- Navigateurs récents Chromium, Firefox et Safari prenant en charge les fonctionnalités CSS utilisées dans les cartes.

## Dépannage

1. **Aucun capteur :** consultez **Paramètres → Système → Journaux** et vérifiez l'URL et la clé API Tracearr.
2. **Le SSE se reconnecte souvent :** désactivez le buffering du proxy inverse pour `text/event-stream` et augmentez le délai d'inactivité au-delà de 30 secondes (un ping arrive environ toutes les 25 secondes).
3. **La carte est introuvable :** vérifiez la ressource `/tracearr_ha/tracearr-card.js?v=0.1.14` dans Lovelace, redémarrez HA et rechargez votre navigateur.
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

- Liste exhaustive des appareils de l’historique au-delà des 500 lectures récentes interrogées (les appareils déjà enregistrés restent disponibles).
- Davantage de tests des affiches et avatars sur différentes installations Tracearr.
- Statistiques utilisateur détaillées et diagnostics.
- Traduction complète de l'éditeur et amélioration de l'accessibilité.
- Captures de référence et tests d'affichage sur mobile et sur les tableaux de bord *Sections*.

**Licence MIT.** Projet communautaire indépendant, sans affiliation avec Tracearr, Home Assistant, Plex, Jellyfin ou Emby.

### Chronomètres et temps de lecture

Les temps « déjà lu » et « restant » sont calculés localement à partir d’une horloge monotone. Les petits décalages des mises à jour SSE de Tracearr sont corrigés progressivement sans faire reculer le chronomètre. Un vrai saut dans la lecture (avance ou retour volontaire) reste pris en compte. En pause, le temps est figé. Les temps restent indicatifs et peuvent être décalés si le serveur signale tardivement une mise en tampon.

### Chronomètres, heure de fin et badges (0.1.8)

- **Heure de fin estimée** : option `show_end_time: true` dans « Contenu de la lecture ». L’estimation est calculée à partir de la durée restante et de l’heure locale du navigateur. Elle disparaît en pause : aucun horaire de fin fiable n’existe tant que la lecture est interrompue.
- **Temps synchronisés** : temps écoulé et restant sont dérivés d’une même valeur entière de secondes, donc ils basculent ensemble. Un seek peut toujours modifier les temps.
- **Badges d’en-tête** : `header_positive_only` masque les statistiques à zéro, `header_blink_positive` active l’animation au-dessus de zéro, `header_blink_seconds` règle la durée du cycle (0,5 à 20 s), `header_show_names` masque les intitulés, `header_zero_color_mode: custom` et `header_zero_custom_color` définissent le fond des badges nuls.
- **Badges d’entités** : chaque ligne de `header_entity_badges` peut définir `show_name`, `show_icon`, `only_positive`, `blink_positive`, `blink_seconds`, `zero_color_mode` et `zero_custom_color`. Les icônes utilisent d’abord l’attribut `icon` de l’entité Home Assistant ; un pictogramme MDI adapté sert de secours.
- Les réglages existants des dashboards sont conservés par défaut ; sans activer les nouvelles options, les couleurs et affichages restent inchangés. Le clignotement s’efface si les préférences du système réduisent les animations.
- Les deux pictogrammes de transcodage vidéo/audio sont des tracés SVG originaux inspirés d’icônes multimédias courantes, sans intégrer d’assets Flaticon nécessitant une attribution.


## Publication au catalogue HACS (pour les mainteneurs)

Le dépôt figure dans le **catalogue officiel HACS** depuis la fusion de la [PR #13306](https://github.com/hacs/default/pull/13306). Cela ne signifie pas une affiliation avec Tracearr ou Home Assistant : l'intégration est un projet communautaire indépendant.

Pour chaque mise à jour, incrémentez la version dans `manifest.json`, vérifiez les workflows HACS et hassfest dans **GitHub Actions**, puis publiez une **GitHub Release** correspondant au commit validé. HACS détectera la nouvelle version après synchronisation ; un simple commit ou tag sans Release ne suffit pas.

### Droit des marques et logo

Le dépôt Tracearr annonce une licence AGPL-3.0 pour son logiciel ; cette mention ne permet pas, à elle seule, de conclure que son logo et l'usage de sa marque comme emblème tiers sont librement autorisés. Tant qu'une autorisation de réutilisation du logo n'est pas établie, cette intégration conserve sa propre icône. Éviter toute présentation laissant croire à une affiliation ou approbation officielle.

### Présentation des temps

Dans chaque lecture, l'affichage regroupe **temps écoulé / temps restant** à gauche et, si activé, **« Fin à HH:mm »** à droite. En pause, l'heure de fin est retirée et « En pause » reste visible.


### Icône et limites d’affichage dans HACS

L'icône du projet est une création indépendante (maison cyan, lecture et progression). Elle est distribuée dans `custom_components/tracearr_ha/brand/icon.png` et `icon@2x.png`. Aucune marque ni aucun logo officiel Tracearr ou Home Assistant n’est reproduit.

Sur Home Assistant 2026.3+, l'icône locale est utilisée dans **Paramètres → Appareils et services**. Dans certaines versions de HACS, la liste des téléchargements affiche encore « icon not available » : le frontend HACS utilise l'ancien serveur de marques et ne retrouve pas les icônes locales. Ce problème est suivi en amont : https://github.com/hacs/integration/issues/5223 et https://github.com/hacs/integration/issues/5402. Il ne se corrige pas simplement avec un réglage HACS ou un fichier supplémentaire dans ce dépôt.
