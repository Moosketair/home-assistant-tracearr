# Tracearr HA — Intégration HACS pour Home Assistant

[![Validation](https://github.com/Moosketair/home-assistant-tracearr/actions/workflows/validate.yml/badge.svg)](https://github.com/Moosketair/home-assistant-tracearr/actions/workflows/validate.yml)

**Retrouvez les lectures en cours de Plex, Jellyfin et Emby directement dans votre tableau de bord Home Assistant.** Tracearr HA est une intégration HACS qui fournit des capteurs et deux cartes Lovelace personnalisables, avec suivi en temps réel via l'API publique Tracearr v2.

**Version actuelle : 0.1.2 Alpha.** Le projet est en cours de test sur de vraies installations. Évitez encore d'utiliser ses informations pour des automatismes critiques.

## Fonctionnalités

- Connexion à l'API publique **Tracearr v2**, avec clé API configurée depuis l'interface Home Assistant.
- **Temps réel SSE** via une connexion unique pour tous les serveurs, avec synchronisation REST initiale, reconnexion automatique et interrogation périodique de secours.
- **Capteurs Home Assistant** : nombre de flux actifs, lecture directe, transcodage vidéo seul, audio seul, vidéo + audio, transcodages inconnus, débit estimé et disponibilité des serveurs.
- **Deux cartes Lovelace** : tous les flux dans une seule carte, ou une lecture individuelle.
- **Trois modes** : liste verticale, grille adaptative et carrousel (1 à 4 flux visibles).
- **Carrousel personnalisable** : défilement automatique, intervalle entre les flux, vitesse de transition, cinq effets et option pour masquer la barre horizontale.
- **Liseré selon le serveur** : Plex orange, Jellyfin violet, Emby vert.
- **Affichage adaptable** : dimensions Home Assistant *Sections*, hauteur personnalisée et mode compact.
- **Éditeur visuel** : choix des informations visibles, tri, filtre par serveur/utilisateur/transcodage, alias et avatars personnalisés.
- **Détails de lecture** : affiche, utilisateur, film ou épisode, progression, temps restant, résolution, codecs, débit, lecteur et état pause.

## Nouveautés de la version 0.1.2

Le carrousel conserve désormais son **index courant** pendant les mises à jour SSE. Quand plusieurs lectures sont disponibles, il passe bien à la suivante, puis revient à la première **après la dernière**. La progression des médias peut se mettre à jour sans reconstruire tout le carrousel.

| Réglage | Valeurs |
|---|---|
| `mode` | `list`, `grid`, `carousel` |
| `carousel_visible` | de 1 à 4 lectures affichées |
| `carousel_autoplay` | `true` / `false` |
| `carousel_interval` | 3 à 120 secondes entre deux changements |
| `carousel_transition` | `slide` (glissement), `fade` (fondu), `zoom`, `flip` (retournement 3D), `none` |
| `carousel_transition_speed` | 100 à 3000 millisecondes pour l'animation |
| `carousel_hide_scrollbar` | masquer ou afficher la barre horizontale |
| `carousel_pause_on_hover` | suspendre au survol de la souris, désactivé par défaut |

Le carrousel suspend le défilement automatique quand la page est masquée ou que la réduction des mouvements est activée au niveau du système. La pause au survol reste facultative. **L'intervalle** contrôle le temps entre deux flux ; **la vitesse** contrôle la durée de l'effet.

## Installer l'intégration avec HACS

1. Dans **HACS → ⋮ → Dépôts personnalisés**, ajoutez `https://github.com/Moosketair/home-assistant-tracearr` en tant qu'**Intégration**.
2. Installez **Tracearr HA**, puis redémarrez Home Assistant.
3. Ouvrez **Paramètres → Appareils et services → Ajouter une intégration → Tracearr HA**.
4. Renseignez l'adresse de votre instance Tracearr et votre clé `trr_pub_...` générée dans **Tracearr → Paramètres → Données et API → API**.
5. Dans votre dashboard, choisissez **Modifier → Ajouter une carte → Tracearr** ou utilisez un exemple YAML ci-dessous.

Si la carte n'apparaît pas, allez dans **Paramètres → Tableaux de bord → ⋮ → Ressources** et vérifiez qu'une seule ressource de type **Module JavaScript** pointe vers :

```text
/tracearr_ha/tracearr-card.js?v=0.1.2
```

Modifiez l'ancienne ressource au lieu d'en ajouter une deuxième, puis rechargez le navigateur (`Ctrl + F5`). La version est également gérée automatiquement par l'intégration lorsque les ressources Lovelace sont en mode stockage.

### Installation manuelle

Copiez `custom_components/tracearr_ha/` dans `/config/custom_components/tracearr_ha/` et redémarrez Home Assistant.

## Exemples Lovelace

**Grille adaptative :**

```yaml
type: custom:tracearr-streams-card
mode: grid
columns: auto
show_transcodes: true
show_progress: true
show_quality: true
```

**Carrousel automatique (2 flux, zoom, 800 ms, barre masquée) :**

```yaml
type: custom:tracearr-streams-card
mode: carousel
carousel_visible: 2
carousel_autoplay: true
carousel_interval: 8
carousel_transition: zoom
carousel_transition_speed: 800
carousel_hide_scrollbar: true
show_transcodes: true
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

**Carte d'une seule lecture :**

```yaml
type: custom:tracearr-stream-card
filter_user: alice
selection: recent
show_poster: true
```

Tous ces paramètres sont également disponibles dans l'**éditeur graphique** des cartes.

## Noms et avatars personnalisés

Dans **Paramètres → Appareils et services → Tracearr HA → Configurer**, vous pouvez associer un alias à un compte. Pour une carte particulière, entrez une correspondance par ligne dans le champ *Alias* :

```text
alice=Alice maison
plex:alice=Alice Plex
<identifiant_serveur>:alice=Alice salon
```

Les avatars acceptent le même format avec des URL HTTPS disponibles dans le navigateur. Cela ne modifie jamais les comptes Plex, Jellyfin ou Emby.

## Fonctionnement et sécurité

- La clé API Tracearr **reste sur le serveur Home Assistant**. Elle ne doit pas être placée dans le YAML Lovelace.
- Les cartes utilisent le WebSocket **authentifié** de Home Assistant et ne se connectent pas directement à Tracearr.
- Les affiches provenant du proxy d'images Tracearr sont exposées par une route d'images Home Assistant avec URL temporairement signée.
- L'intégration utilise **une seule connexion SSE**, avec rechargement de l'état lors de chaque événement `ready`. En cas d'indisponibilité, elle interroge périodiquement l'API REST.
- Les informations de transcodage non renseignées sont considérées comme **inconnues**, et non devinées.

### Limites connues

Le schéma `/streams` de Tracearr v2 n'expose ni la distinction réseau local/WAN ni un identifiant utilisateur unique stable par session. La carte n'invente pas ces valeurs. L'arrêt à distance des flux n'est pas proposé. Si l'option « Masquer si aucune lecture » est activée, une cellule *Sections* Home Assistant peut malgré tout conserver son emplacement.

## Compatibilité et dépannage

- Home Assistant **2025.6+** (cible de développement, non validée exhaustivement sur toutes les versions).
- Tracearr **API publique v2**, SSE à partir de **Tracearr 2.7.0** ; sinon interrogation REST.
- Chromium, Firefox ou Safari récents.

Si la carte n'apparaît pas, contrôlez la ressource JavaScript ci-dessus. Si les capteurs sont absents, consultez **Paramètres → Système → Journaux**. En cas de reconnexions SSE fréquentes, désactivez le buffering du reverse proxy sur `text/event-stream` et augmentez son timeout de lecture au-delà de 30 secondes. Si le carrousel ne bouge pas, assurez-vous qu'il existe plus de flux que de cartes visibles et que l'onglet est actif.

## Développement

```bash
python -m compileall -q custom_components
python -m pytest -q tests
node --check custom_components/tracearr_ha/frontend/tracearr-card.js
node --test tests/test_carousel.cjs
```

Les tests couvrent les données Tracearr, la compatibilité Lovelace, la navigation, la durée des transitions, les effets et les couleurs des serveurs. Un test complet sur plusieurs installations Home Assistant réelles reste nécessaire avant une version stable.

**Licence MIT.** Projet indépendant, sans affiliation avec Tracearr, Home Assistant, Plex, Jellyfin ou Emby.
