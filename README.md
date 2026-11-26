# Tracearr HA

[![Validation GitHub Actions](https://github.com/Moosketair/home-assistant-tracearr/actions/workflows/validate.yml/badge.svg)](https://github.com/Moosketair/home-assistant-tracearr/actions/workflows/validate.yml)
[![HACS](https://img.shields.io/badge/HACS-Catalogue%20officiel-41BDF5)](https://github.com/hacs/default/pull/13306)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

**Surveillez les lectures Plex, Jellyfin et Emby dans Home Assistant avec les données de Tracearr.** L'intégration comprend des capteurs, une connexion temps réel et deux cartes Lovelace personnalisables (lectures groupées ou lecture individuelle).

**Version stable : 0.1.17** · Disponible via le catalogue officiel HACS. Le projet reste communautaire et évolutif ; testez les capteurs avant de les utiliser pour des automatismes critiques.

Le candidat local [0.1.18-beta.1](CHANGELOG.md#0118-beta1--candidat-local-non-publié) n’est pas disponible via HACS.

## Nouveautés de la 0.1.17

- Connexions et affichage des lectures plus fiables, y compris après rechargement et panne de Tracearr.
- Remplacement de la clé API directement dans Home Assistant sans recréer l’intégration.
- Chargement des images, cohérence des débits LAN/WAN et lisibilité des badges améliorés.

Consultez le [journal complet des versions](CHANGELOG.md) pour retrouver toutes les améliorations et corrections précédentes.

## Installation avec HACS

1. Dans **HACS**, recherchez **Tracearr HA** puis cliquez sur **Télécharger**.
2. **Redémarrez Home Assistant** après l'installation ou la mise à jour.
3. Ouvrez **Paramètres → Appareils et services → Ajouter une intégration → Tracearr HA**.
4. Renseignez l'adresse de votre serveur Tracearr et la clé API publique `trr_pub_...` obtenue dans **Tracearr → Paramètres → Données et API → API**.
5. Dans votre tableau de bord, utilisez **Modifier → Ajouter une carte**, puis recherchez **Tracearr**.

L'intégration conserve les réglages des cartes et les entrées de configuration Home Assistant lors des mises à jour normales. Après une mise à jour, rechargez aussi le navigateur avec `Ctrl + F5` (ou actualisez la page sur mobile).

**Carte non proposée dans Lovelace ?** Vérifiez dans **Paramètres → Tableaux de bord → Ressources** qu'il n'existe qu'une seule ressource Module JavaScript pour `/tracearr_ha/tracearr-card.js`, avec `?v=` suivi de la version installée (`?v=0.1.17` pour cette stable). En mode YAML, [mettez à jour la ressource manuellement](docs/CONFIGURATION.md#ressource-lovelace-en-mode-yaml).

## Ce que propose Tracearr HA

- **Suivi en direct** des lectures, avec synchronisation SSE et interrogation REST de secours.
- **Capteurs** : flux en cours, lectures directes, types de transcodages, débit estimé et disponibilité des serveurs.
- **Deux cartes** : `custom:tracearr-streams-card` (liste ou carrousel) et `custom:tracearr-stream-card` (une lecture).
- **Carrousel** : défilement automatique facultatif, effets de transition, flèches, navigation tactile, au clavier et à la souris.
- **Personnalisation** : titres et épisodes, jaquettes, avatars, progression, durée restante, heure de fin estimée, badges, couleurs par serveur et mode compact.
- **Appareils locaux/distants** : classement manuel par utilisateur ou appareil, avec filtrage des débits.
- **Affichage natif Home Assistant** : dimensions pilotées par la mise en page *Sections*, sans imposer une taille de carte.

## Exemples rapides

**Lectures groupées avec fond flouté et badges :**

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

**Une lecture individuelle (dernière session active) :**

```yaml
type: custom:tracearr-stream-card
selection: recent
show_poster: true
poster_size: 110
show_end_time: true
```

Pour sélectionner l'utilisateur et le serveur sans saisir d'identifiants, utilisez l'éditeur visuel. Les réglages existants restent compatibles.

## Personnalisation et documentation

Tous les paramètres principaux sont disponibles dans l'éditeur graphique. Pour les valeurs YAML, les exemples complets et les comportements spécifiques :

- [Guide complet des cartes et options](docs/CONFIGURATION.md)
- [Historique des versions et améliorations](CHANGELOG.md)
- [Maintenance, publication HACS et notes sur les marques/icônes](docs/MAINTENANCE.md)

## Compatibilité et limites

- Home Assistant **2025.6+**. Tracearr doit fournir les routes de l’API publique v2 **`/streams` et `/servers`**. Tracearr **2.6.0** ne fournit pas `/servers` et n’est pas compatible, même sans SSE ; **2.7.0** expose les deux routes REST et `/events`. Si `/events` est indisponible, l’intégration continue à interroger les deux routes REST.
- Navigateurs récents Chromium, Firefox et Safari.
- L'API publique utilisée ne permet pas de détecter automatiquement si un flux est local ou distant : les correspondances doivent être configurées manuellement.
- L'arrêt à distance d'une lecture n'est pas implémenté.
- L'intégration affiche les informations transmises par Tracearr ; elles peuvent être incomplètes ou différées.

## Dépannage rapide

- **Aucun capteur :** contrôlez l'URL, la clé API et **Paramètres → Système → Journaux**.
- **Clé API refusée sur une intégration déjà configurée :** utilisez la demande de réauthentification de Home Assistant pour saisir une nouvelle clé. Ne supprimez pas l’intégration : ses entités et réglages sont conservés.
- **Carte manquante ou ancienne interface :** vérifiez l'unique ressource JavaScript ci-dessus, redémarrez Home Assistant et rechargez le cache du navigateur.
- **Affiche absente :** vérifiez que Tracearr fournit `poster_url` et consultez les erreurs réseau/journaux. Le fond cinéma reste sombre sans affiche.
- **Carrousel immobile :** vérifiez le nombre de flux visibles, la lecture automatique, les préférences d'animation et la pause au survol.

**Licence MIT.** Projet communautaire indépendant, sans affiliation ou approbation officielle de Tracearr, Home Assistant, Plex, Jellyfin ou Emby. Son icône est une création distincte.
