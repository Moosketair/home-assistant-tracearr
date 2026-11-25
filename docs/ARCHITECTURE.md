# Architecture — base v0.1.16 et cycle de vie local 2A.3

```text
Plex / Jellyfin / Emby → Tracearr → API publique v2 (REST + SSE)
                                         ↓ une instance de TracearrCoordinator / config entry
                             cache sessions + serveurs → capteurs HA
                                         ↓ WS Home Assistant
                           carte groupée / carte individuelle
                           ↑ états HA (badges) ; images (voir ci-dessous)
```

## Entrée, transport et cache

Sous `custom_components/tracearr_ha/`, `__init__.py` enregistre deux commandes WS, la ressource statique et la vue image une fois au setup du domaine. Configuration **par UI uniquement**, schéma d’entrée v1 : `config_flow.py` valide une URL HTTP(S) sans credentials, requête ni fragment, teste `/servers`, utilise l’URL en minuscules comme unique ID et stocke URL + clé dans `entry.data`. Pas de client Plex/Jellyfin/Emby ni de commande d’arrêt de lecture. Le domaine est déclaré `local_push`, avec dépendances HA `http`, `frontend`, `lovelace`, `websocket_api` ; pas de paquet Python additionnel au manifeste.

`api.py` construit `<url>/api/v2/public/…`, `Authorization: Bearer …`, sans redirection. `/streams` et `/servers` alimentent le snapshot ; `/users` (50 pages max de 100) et `/history` (5 × 100) ne sont consultés que dans certains formulaires. GET JSON : 15 s par appel ; distinction 401/403, 429 avec `Retry-After` entier borné 1–3600 s (défaut 30), autres HTTP ≥400 et erreurs de transport.

`coordinator.py` effectue un premier refresh avant le chargement des plateformes. Le REST lit séquentiellement streams puis serveurs sous verrou, indexe par `id`/`server_id`, horodate `last_sync`. Deux tâches HA par entrée :

- **SSE** `/events`, sans limite totale, lecture inactive 80 s ; commentaires ignorés, lignes `data:` réunies jusqu’à la ligne vide, `event:` utilisé si le JSON omet `type`. `ready` → nouveau snapshot REST (pas de replay). `server.health` met à jour le serveur connu. `model.apply_event` fusionne `started`/`updated`, applique `progress` à une session connue, supprime sur `stopped`. Protection des positions contre certaines mises à jour complètes tardives. Les événements de violation ne sont pas utilisés.
- **Récupération** : après chaque attente de 60 s si SSE actif, sinon 15 s, refresh REST même sans carte. SSE : délai initial 5 s, doublé sur indisponibilité jusqu’à 60 s, 300 s si refus de clé, `Retry-After` si 429 ; `ready` remet à 5 s. Une fin de flux normale reprend le délai courant ; pas de jitter ni d’exploitation de la directive SSE `retry:`. La disponibilité REST (`connected`) est distincte de `sse_connected`.

`_emit()` notifie le `DataUpdateCoordinator` avec listes, statistiques, états de connexion et dernière synchro. L’entrée est dans `hass.data[DOMAIN][entry_id]`. Changer les options provoque une émission, pas un reload. Au déchargement réussi des plateformes : retrait du coordinateur, notification du retrait, annulation et attente des deux tâches ; les écouteurs des plateformes/options sont rattachés à l’entrée. Routes HTTP/WS et ressource Lovelace sont globales.

## Modèle et sorties

| Portée | Entités | Origine |
|---|---|---|
| Instance Tracearr | 10 `sensor` : total, playing, paused, direct, vidéo seule, audio seul, les deux, transcodes totaux, décision inconnue, Mbit/s | `model.stats`, `sensor.STAT_TYPES` ; somme des débits / 1000 |
| Instance Tracearr | 1 `binary_sensor` Connected | reflète `connected`, disponible même en cas de panne |
| Chaque `server_id` découvert | 1 `sensor` nombre de sessions + 1 `binary_sensor` Online | comptage du cache par ID ; `up`/`down`/autre → vrai/faux/inconnu |

Les décisions audio et vidéo (`transcode`, `copy`, `directplay`, absentes) sont distinguées du drapeau global `is_transcode` : un transcodage sans précision peut compter à la fois dans le total transcodé et la catégorie « inconnue ». Le backend recalcule ses statistiques plutôt que de reprendre `summary` de Tracearr. Les entités par serveur sont ajoutées à la découverte, pas retirées à chaque perte du serveur. Identifiant unique avec préfixe d’entrée, identifiant d’appareil serveur `(DOMAIN, server_id)`. Pas d’entité par session/utilisateur : leurs détails passent par WS.

`websocket.py` : `tracearr_ha/get` renvoie toutes les entrées chargées ; `tracearr_ha/subscribe` envoie immédiatement un snapshot puis un snapshot complet à chaque notification. L’enveloppe contient ID, titre, options d’affichage et données du coordinateur ; ni clé API ni `entry.data` dans l’enveloppe. Le navigateur choisit `entry_id`, sinon la première entrée. Il n’y a pas de filtrage backend par utilisateur HA ou par carte.

### Qui possède les listeners WS

Dans la stable, `subscribe` enregistrait son callback sur les seuls coordinateurs présents à la réception de la commande. La socket survivait au reload mais ses listeners restaient sur l’ancienne génération. Le correctif utilise le dispatcher natif HA avec le signal de domaine `EVENT_SIGNAL` :

- **Une config entry possède un relais.** Après le premier REST réussi, l’entrée publie son coordinateur et signale l’ajout. Elle installe le relais après le chargement réussi des plateformes, juste avant de lancer SSE/poll. REST, SSE, options et changements de disponibilité empruntent alors le chemin de notification du coordinateur. Les entités continuent de l’écouter directement. Un échec du premier REST ne publie rien ; un échec pendant le chargement des plateformes retire le coordinateur provisoire déjà visible, sans listener de relais à libérer.
- **Une demande `subscribe` possède un listener de domaine**, même avec zéro entrée. Son désabonneur est dans `connection.subscriptions[id]` : HA le libère pour cet ID sur `unsubscribe_events`, ou pour tous les ID de cette socket à sa fermeture. Le dispatcher ne conserve ni snapshot ni liste de clients propre à Tracearr. Chaque callback relit les seules sources présentes ; l’acquittement et l’événement initial n’ont pas changé.
- **Le retrait précède l’arrêt des tâches.** Lorsqu’une source est retirée, tous les abonnés voient le snapshot restant (`entries: []` si c’était la dernière). Le relais vérifie l’identité du coordinateur encore publié : la dernière émission du `finally` SSE, ou une émission tardive, ne produit pas de nouvelle notification après retrait. La génération retire explicitement son relais. Le nouveau coordinateur crée son propre relais ; les sockets ne se réabonnent pas.

Un retrait, un ajout après première synchro, le refresh de `ready` et le passage de `sse_connected` à vrai sont des notifications légitimes distinctes. Le contrat n’est pas « un seul événement par reload », ni une déduplication des snapshots identiques : **une notification du coordinateur courant donne un événement par ID d’abonnement actif**. Voir les contrôles sur le fil et le comptage des listeners dans [RECETTE](RECETTE.md).

### Génération de chargement et rollback (2A.3)

`entry.runtime_data` contient une `EntryGeneration` (`lifecycle.py`) ; `hass.data[DOMAIN][entry_id]` reste le coordinateur publié. Il n’y a pas de second registre de clients WS. Le relais et le callback d’options appartiennent à cette génération ; les découvertes de serveurs sont détachables par plateforme. Les listeners des **entités** sont libérés par HA lors du déchargement réel de la plateforme.

1. Première synchro puis publication. Forwarding **séquentiel** de `sensor`, puis `binary_sensor`. Le `finally` de chaque forward identifie, via `entity_platform.async_get_platforms`, l’objet nouvellement alloué pour cette entrée et ce domaine (même si le forward n’aboutit pas). Un retour de `async_forward_entry_setups` seul ne prouve pas que le hook Tracearr a réussi : certaines erreurs sont interceptées dans Core. La dernière opération de chaque hook enregistre son listener de découverte ; sa présence confirme que le hook est arrivé à son terme.
2. Installation du relais, création des deux tâches, installation du callback d’options : toute cette séquence est dans le même périmètre de rollback. Si la fabrique de tâche refuse une coroutine, celle-ci est fermée ; seules les tâches effectivement créées sont annulées et attendues.
3. **Unload ordinaire** : chaque plateforme libérée est retirée de l’inventaire. Si HA refuse une plateforme, la réponse reste `False` et la source reste publiée. **Suppression définitive** : les deux Core appellent `async_remove_entry` après la suppression du registre, même si l’unload a échoué. Le hook ferme la génération restante ; si le déchargement nominal l’a déjà fermée, il n’y a rien à faire.
4. **Fermeture** : retirer et signaler seulement le coordinateur encore publié sous cette identité ; détacher relais/options ; arrêter les producteurs et le coordinateur ; détacher les découvertes ; décharger les plateformes restantes de cette génération et oublier son `runtime_data`. Un ancien finaliseur ne peut pas décharger les plateformes du remplaçant. Le registre d’entités et les options utilisateur ne sont pas effacés par ce rollback.
5. Le nettoyage asynchrone est exécuté sous la protection de `asyncio.shield` **et attendu jusqu’à la fin**, avant de rendre le verrou d’entrée à HA. Une annulation du demandeur est ensuite propagée. Les actions de libération restantes sont tentées même après erreur ; une panne secondaire du rollback est journalisée et ne se substitue pas silencieusement à l’exception du setup.

**Limite de responsabilité :** Tracearr ne peut pas contraindre HA à décharger une plateforme qui continue de refuser. Le refus est signalé, les ressources Tracearr sont néanmoins fermées lors d’une suppression définitive ; la décision `require_restart` appartient à HA. L’inventaire ne modifie aucune structure privée de Core. Les résultats portent sur les deux versions éprouvées, pas sur toutes les versions intermédiaires.

## Lovelace et images

`frontend.py` sert `/tracearr_ha/tracearr-card.js` ; mode `storage` : charge les ressources, crée ou met à jour **la première ressource correspondante**, versionnée par `?v=…`. Pas de dédoublonnage des anciennes copies. Mode `yaml` : déclaration manuelle par l’utilisateur. `resource_mode` puis `mode` en repli.

`frontend/tracearr-card.js` est le livrable lui-même : IIFE, Web Components, Shadow DOM, CSS inclus, sans bundler. Enregistre deux éléments dans `customElements` et `window.customCards` et un `tracearr-card-editor` commun. « Groupée » signifie plusieurs sessions dans `custom:tracearr-streams-card` (liste verticale ou carrousel), pas un troisième mode. `custom:tracearr-stream-card` sélectionne une session : récente par défaut, ID temporaire, compte `server_id:username` ou serveur. Filtres pause, utilisateur, serveur, transcodage et tri avant affichage. L’édition utilise un `get` par connexion, des sections repliables, le sélecteur natif d’entité et `config-changed`.

- Le moteur normalise les anciens réglages en mémoire (JS 292–366) ; grille → liste, dimensions internes retirées au profit de Sections. `show_counter`, `show_transcodes`, palette `progress_*`, `show_year`, `series_show_season_episode`, `hide_empty` alimentent les nouveaux réglages. Une édition peut émettre une configuration normalisée ; un simple chargement de carte ne réécrit pas le dashboard.
- Empreinte structurelle et empreintes par session : mise à jour de l’horloge sans reconstruction sur progression seule ; carrousel mis à jour par panneau sur changement de contenu, ancre préservée si possible lorsque la liste change. En liste, un changement de métadonnées peut reconstruire toute la carte. Horloge `performance.now()` par session, tick 250 ms, correction ≤200 ms par échantillon, pause et seuils de seek. Heure de fin basée sur l’horloge civile. Autoplay, drag, tactile, flèches et transitions par `requestAnimationFrame` ou Web Animations ; prise en compte de `prefers-reduced-motion`.
- La carte utilise le `ha-card` du thème ; styles `soft`, transparent, fond flouté avec voile réglable, liseré, taille de poster, mode compact. L’image de fond réutilise le poster. Le navigateur peut charger directement une URL HTTP(S) externe (p. ex. avatar personnalisé) ; pour le proxy Tracearr, il demande à HA `auth/sign_path` (600 s). La vue HA exige une session active et `poster`/`avatar`, contacte le chemin `/api/v1/images/proxy` sur l’origine configurée avec le Bearer ; pas de redirection, limite visée 8 000 000 octets, délai 20 s, liste de MIME et cache privé. En cas d’échec image : remplacement, tentatives à 2/5/15 s. Voir A3 pour la lecture fragmentée.
- Badges calculés **sur les flux visibles**, plus jusqu’à 20 entités HA ; ordre configurable, style global/par badge, alignements auto/gauche/centre/droite. Sans centre : flex, groupes vides absents. Avec centre et autre groupe : `1fr / max-content / 1fr` dans la zone des badges ; repli flex à ≤260 px. Le carrousel affiche une seule colonne à ≤520 px. Dimensions de la carte et dimensions du viewport ne sont pas interchangeables.
- Alias/avatars : options globales plus substitutions par carte sur clés de compte, type ou nom ; jamais de renommage des comptes source. Les formulaires regroupent les appareils par serveur et par famille Plex/Jellyfin/Emby/autres, conservent les règles enregistrées. LAN/WAN : priorité aux règles de carte puis d’intégration ; dans chaque ensemble, appareil/lecteur et compte spécifiques au serveur avant défaut `server:id`, puis correspondances génériques. Dernier repli éventuel `network_type`/`network` : ces champs ne sont pas dans `/streams` v3.2.1. Le filtre porte **sur le débit**, les inconnus ne comptent pas en local/distant ; pas d’inférence depuis une IP.
- Localisation : chaînes HA de base + traductions en/fr pour les flows ; les noms de capteurs sont en anglais, des choix dynamiques en français. Les textes de carte/éditeur et le format horaire sont français dans le JS, indépendamment de la langue HA.

Pour les paramètres détaillés : [guide utilisateur](CONFIGURATION.md). Pour les écarts entre intention et comportement : [audit](AUDIT_INITIAL.md).
