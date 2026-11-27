# Recette locale de fiabilité

Pour l’installation et le véritable dashboard Home Assistant : [recette 4.2](RECETTE_42.md). Le banc ci-dessous reste celui des validations historiques du backend.

Depuis la racine du dépôt, sur Debian 13.2 x86-64 :

```bash
TMPDIR=/tmp/opencode bash recette/lancer.sh base
TMPDIR=/tmp/opencode bash recette/lancer.sh min
TMPDIR=/tmp/opencode bash recette/lancer.sh current
```

`base` exécute les tests historiques ; `min` et `current` lancent **le backend HA réel et les simulateurs le temps des tests**. Aucun serveur à installer ou à maintenir. `current` est une cible **figée**, pas la dernière version téléchargée automatiquement.

## Installation, arrêt et périmètre

| Cible | Interpréteur, dépendances | Sélection |
|---|---|---|
| `base` | `/usr/bin/python3` (ici 3.13.5), pytest 9.2.0, aiohttp 3.14.5 ; Node 22.23.5 | `tests/` Python, syntaxe JS, `tests/test_carousel.cjs` |
| `min` | CPython géré 3.13.18 ; HA Core 2025.6.0, aiohttp 3.12.12, `pycares==4.11.0` pour son ancien `aiodns` | `recette/spec_*.py` |
| `current` | CPython géré 3.14.10 ; HA Core 2026.11.3, aiohttp 3.14.5 | mêmes scénarios |

Prérequis : Bash, `uv` (vérifié avec 0.13.6), accès aux distributions Python et PyPI pour l’installation, compilateur C/C++ pour les dépendances natives du Core ancien, espace temporaire inscriptible (prévoir 2 Gio pour une cible à la fois), sockets loopback autorisées. Le lanceur crée un venv neuf puis y installe **toutes les versions épinglées** de `recette/requirements-{base,min,current}.txt` avec `uv pip sync`. Les en-têtes du Python géré servent à compiler `pyspeex-noise`, sans installer de paquet système. Le choix des bornes vient du minimum `2025.6.0` dans `hacs.json` et de la stable HA étudiée en phase 0. Les métadonnées officielles [2025.6.0](https://pypi.org/project/homeassistant/2025.6.0/) et [2026.11.3](https://pypi.org/project/homeassistant/2026.11.3/) exigent respectivement Python ≥3.13.2 et ≥3.14.2. Tester ces deux Core n’atteste pas toutes les versions intermédiaires.

Chaque exécution a son répertoire privé `$TMPDIR/tracearr-recette.XXXXXXXX` (par défaut `/tmp`), contenant `venv/`, cache uv, éventuel Python géré, config HA et stockage d’authentification jetables. Chaque écoute TCP demande à l’OS un port libre sur **127.0.0.1**. Les contextes ferment connexions, entrées et serveurs ; `Ctrl+C` interrompt le lanceur. Le répertoire créé est supprimé à la sortie du script. En cas d’arrêt brutal non interceptable, retirer seulement le répertoire de cette exécution après arrêt du processus. Aucun service système, réseau Docker, volume ou compte HA existant n’est requis.

## Ce que teste le banc

- **Côté Tracearr**, `recette/simulateur.py` sert la partie consommée de [l’API publique v2 au tag v3.2.1](https://github.com/connorgallopo/Tracearr/tree/v3.2.1/apps/server/src/routes/publicV2) : `/streams` → `data` + résumé minimal, `/servers` → identités/états, `/events` → trames `event:`/`data:` avec `ready`, changements de session et santé serveur. `eventsTranslate.ts` est la référence pour les payloads, `streams.ts`/`servers.ts` pour le REST. Bearer de fixture, trois serveurs synthétiques. `users` et `history` renvoient une page vide ; le proxy renvoie un petit PNG en deux écritures. **Pas de routes HTTP de pilotage.** Les tests modifient l’état en mémoire avant de publier une trame.
- **Pilotage** : `sim.change("started"|"updated"|"progress"|"stopped", id, …)` ; pause/reprise via `state` ; `sim.raw(None)` pour fermer les flux, `sim.raw(bytes)` pour une trame inhabituelle, `sim.errors[route] = (statut, en_têtes)` pour une panne. `sim.gates[route] = Gate()` retient le résultat déjà capturé ; attendre `entered` puis ouvrir `release`. Pour `image`, la barrière suit les huit premiers octets. Plusieurs instances du simulateur représentent plusieurs entrées HA indépendantes.
- **Côté HA**, `recette/core.py` utilise le chargeur Core, les registres, le vrai config flow, `ConfigEntries.async_reload`/`async_remove`, les plateformes de capteurs, les middlewares HTTP et la vue `/api/websocket` d’origine. Un utilisateur éphémère s’authentifie par l’échange `auth_required` → `auth` → `auth_ok`. Les tests n’appellent pas directement `ws_subscribe`. L’application HTTP HA est hébergée par `aiohttp.test_utils.TestServer`. Seules les dépendances graphiques `frontend`/`lovelace` sont déclarées chargées sans monter leur UI ; pas de `default_config`, de découverte multicast ni d’onboarding. Les adresses simulées sont numériques ; une demande de résolution DNS HA est une erreur de banc.

### Base historique : résultats sur v0.1.16 avec la recette a77301a

| Fichier, scénario | Observation aux deux bornes |
|---|---|
| `spec_websocket.py` — une entrée, un abonné, un reload | **XFAIL strict A1** : première notification reçue ; après changement de coordinateur, le `get` authentifié contient `after` mais la même socket ne reçoit aucun événement pour l’abonnement existant. |
| Idem — deux entrées, deux sockets, deux reloads de la première | **XFAIL strict A1** : les deux abonnés manquent l’événement de la première entrée ; ils reçoivent chacun **une** notification quand la deuxième change. Les événements de cycle de vie sont drainés avant la mesure. |
| Idem — rétention | **XFAIL strict A1** : un listener reste sur l’ancien coordinateur chargé puis remplacé ; il ne disparaît qu’au désabonnement. Cette vérification de `._listeners` est spécifique aux deux Core ciblés. |
| Idem — désabonnement, réabonnement, suppression, absence de doublons | **Passe** : l’ancien coordinateur ne conserve plus de listeners après désabonnement, la suppression est visible ; seule la socket encore abonnée reçoit une notification pour la lecture de l’entrée restante, aucune après son désabonnement. |
| `spec_race.py` — `start`, `stop`, `progress`, `pause`, `resume`, `sequence` | **6 XFAIL stricts A2** : un changement plus récent traité sur le vrai flux SSE est écrasé par le snapshot REST. `sequence` exerce une progression sur la seconde session puis pause/reprise de la première. Les sessions sont réparties sur plusieurs serveurs. |
| `spec_transport.py` — contrat de transport | **Passe** : 401, 429 et délai, serveurs, pages vides, `ready`, JSON malformé/événement sans type au niveau du **client**, données de session, PNG complet reconstitué par le client de test après libération du second fragment. Ce n’est pas une validation du proxy HA A3 ni de la boucle A4. |
| Idem — déconnexion / reconnexion | **Passe** : EOF, attente de l’indication « SSE déconnecté », nouvelle session pendant la coupure, reconnexion réelle et rattrapage par `ready` ; une seule connexion SSE au retour. |

**Ordonnancement.** Pour A1, une réponse `get` sert de borne dans la file ordonnée des messages de **la même socket** ; pas de conclusion tirée d’un silence de quelques millisecondes. Pour A2, le GET `/servers` bloqué prouve que `/streams` a déjà répondu. Un témoin autour de l’itérateur réel signale le décodage du premier événement et relève l’état après traitement. Il laisse passer les données sans les remplacer. Le test libère le REST sur **réception** plutôt que d’exiger une application sous verrou avant de le libérer : un futur correctif pourrait légitimement différer l’application. Un événement de santé derrière tous les événements de session délimite ensuite la vérification finale. Les timeouts bornent les blocages, ils n’imposent pas l’interleaving.

**À cette référence**, `base` → 21 Python et 72 JS réussis ; chacune des cibles Core → **3 passés, 9 xfail** (12 cas). Les neuf xfail sont des observations sur deux anomalies, pas neuf nouveaux bugs. `strict=True` et `raises=` limitent le résultat attendu à l’exception métier du test : erreur d’auth, timeout, mauvais payload ou doublon doivent rester rouges. Pour voir les assertions échouer normalement sur cette référence :

```bash
TMPDIR=/tmp/opencode bash recette/lancer.sh current -k subscription_survives_reload --runxfail
TMPDIR=/tmp/opencode bash recette/lancer.sh min -k latest_stream_state --runxfail
```

Cette variante doit retourner un code non nul sur la stable. Contrôle supplémentaire effectué sur Core 2026.11.3 : sans les marqueurs (`--runxfail`), les deux fichiers P1 ont produit **9 échecs ciblés et 1 succès** ; pour les six courses, le cache final était exactement l’ancien snapshot. Après correction autorisée, un `XPASS(strict)` est aussi un échec : retirer le marqueur du cas corrigé et garder son assertion de comportement. Aucun plugin pytest-asyncio, workflow distant ni dépendance de test dans le manifeste de l’intégration.

### Correctif local 2A.1 : contrôles ordinaires P1-A

`spec_websocket.py` contient désormais dix cas sans xfail ni skip. Pour les isoler : `TMPDIR=/tmp/opencode bash recette/lancer.sh current -k spec_websocket` (ou `min`). Avant correction, les trois cas marqués en 1.1 ont tous échoué avec `--runxfail` sur les deux Core (1/1 puis 2/2 clients manquent `after`, ancien listener retenu). Avec le fichier de tests final appliqué au backend `a77301a`, **9 échecs, 1 réussite** sur Core 2026.11.3 ; les six nouveaux cas détectent une différence.

| Situation | Preuve demandée |
|---|---|
| Quatre cas repris de 1.1 | Même socket/ID, lectures en cours, une ou deux entrées, reload simple ou double, deuxième socket, snapshots initiaux, une notification par marqueur, retrait et désabonnement. Zéro listener sur l’ancien coordinateur **avant** désabonnement ; nombre de listeners du remplaçant stable. |
| Reload bloqué dans le premier GET `/streams` du remplaçant | La barrière permet de souscrire une seconde fois sur la même socket, modifier l’autre entrée et se désabonner du premier ID pendant que la source est absente. Un événement par ID pour cette modification ; retour de l’entrée sans lecture puis lecture nouvelle ; aucun événement de l’ancien coordinateur forcé à émettre avant ou après retour. |
| Zéro entrée → ajout → retrait de la dernière → nouvel ajout | L’événement initial est vide ; les deux ajouts sont visibles au même abonné. Un seul snapshot vide pour le retrait ; aucune donnée de l’ancienne entrée dans les snapshots suivants. |
| Reload en HTTP 503 puis récupération | Core passe en `SETUP_RETRY`, la socket voit le retrait et ignore l’ancien coordinateur. Après restauration du simulateur et reload HA explicite, le même abonnement retrouve la session créée pendant la panne. |
| Échec de chargement des plateformes après publication | Exception injectée après le premier snapshot valide. Le snapshot provisoire est retiré, l’ancien relais nettoyé et aucune émission tardive ne passe. |
| REST seul et modification d’options après reload | Le refresh REST sans événement SSE, puis le changement d’alias via HA, produisent chacun exactement un événement visible sans recréer l’abonnement. |
| Abandon TCP sans `unsubscribe_events` ni trame de fermeture | Deux abonnements sur la socket coupée, un troisième sur la survivante. Le signal de déconnexion de Core borne le comptage réel : **3 → 1 → 0** listeners de domaine après rupture puis désabonnement explicite. Nombre de listeners du coordinateur inchangé. |

La borne FIFO `get` sépare les notifications de cycle de vie des marqueurs métier ; on ne compte pas les événements d’un reload comme des doublons par principe. Le contrôle interne des registres de listeners et du transport TCP est spécifique aux deux versions épinglées ; les assertions de livraison passent par la vraie API WebSocket. Les six cas de `spec_race.py` restent inchangés et xfail stricts.

**Exécution finale 2A.1** avec `TMPDIR=/tmp/opencode bash recette/lancer.sh` :

| Cible | Résultat |
|---|---|
| `base` | 21 tests Python réussis (0,25 s) ; 72 JS réussis, 0 ignoré, 0 annulé. |
| `min` (2025.6.0) | 12 réussis, 6 xfail stricts A2, 35 avertissements (8,33 s). |
| `current` (2026.11.3) | 12 réussis, 6 xfail stricts A2, 24 avertissements (8,78 s). |

Les 12 succès sont les 10 cas WS et les 2 contrôles de transport. Aucun échec inattendu final, aucun xfail/skip A1. Pendant la mise au point, Core 2025.6.0 conservait un relais installé avant un échec injecté de chargement des plateformes ; l’installation du relais **après** leur réussite résout ce cas sans affaiblir l’assertion. Compilation Python, syntaxe JS, lecture JSON du manifeste et de `hacs.json` et `git diff --check` réussis. Résultats de recette locale, à soumettre au contre-audit.

### 2A.3 — rollback, retrait définitif et récupération

Le contre-audit **a refusé 2A.1** : le reload nominal conservait les abonnements, mais l’échec d’unload suivi d’une suppression (B1) et le démarrage partiel (B2) laissaient des producteurs orphelins ; une plateforme `sensor` déjà chargée pouvait garder les anciens capteurs après annulation (B3, hérité).

Pour cibler les nouveaux cas : `TMPDIR=/tmp/opencode bash recette/lancer.sh min -k spec_generation` (ou `current`). `spec_generation.py` utilise le vrai registre, les plateformes HA, les sockets authentifiées et les serveurs loopback ; les mesures sont prises **avant l’arrêt de Core**. `sim.no_clients` permet d’attendre la fermeture effective du dernier flux côté serveur.

| Cas | Vérification |
|---|---|
| B1, trois variantes | Refus de `binary_sensor`, vrai déchargement de `sensor`. Tant que HA conserve l’entrée, ses mises à jour arrivent. Suppression directe ou ultérieure, avec ou sans seconde entrée : HA répond `require_restart: True`, chaque socket reçoit un seul retrait. Le cache est retiré, les deux tâches terminées, la connexion fermée ; un événement tardif et un second nettoyage ne notifient personne. L’autre source fonctionne encore. |
| B2, trois points d’injection | Refus de création de SSE, refus de poll après création du SSE, exception à l’installation des options après création des deux tâches. `SETUP_ERROR`, snapshot vide, zéro producteur, zéro listener sur l’ancien coordinateur. Après reload : **1 connexion / 2 tâches** ; rappeler le finaliseur de l’ancienne génération ne touche pas la nouvelle. Après suppression : **0 / 0**. |
| B3, deux variantes | Charger réellement `sensor`, puis annuler à la barrière avant `binary_sensor` ou faire échouer son hook **dans** la vraie plateforme binaire. Aucun listener sur la source abandonnée ; mêmes ID de capteur et de registre, même nom personnalisé, état du capteur `1` = total WS `1` après récupération. |
| Nettoyage sous erreur, deux cas | Double annulation pendant que le rollback d’une plateforme attend à une barrière : l’opération ne termine pas avant sa libération. Exception secondaire après l’arrêt réel des tâches : la panne initiale et la panne secondaire sont toutes deux visibles dans les journaux. |
| Contrôle nominal | 8 reloads, 3 abonnements sur 2 sockets, mises à jour de 2 entrées au même tour de boucle : **48 événements attendus** (24 par entrée), aucun doublon. 4 tâches actives, 2 connexions ; les 8 anciens coordinateurs sont collectables. |

**Comparaison.** Avant modification du backend : 7 cas rouges et 1 nominal vert sur chaque Core dans la première reproduction. Puis, sur une archive de `20b2901` avec les 11 cas : **10 échecs / 1 succès** sur chacune des deux versions. Après correction : les 11 sont passants, sans marqueur. La sonde complémentaire de panne à la création du poll mesurait après récupération **3 tâches avant / 2 après**, et après suppression **1 avant / 0 après**, aux deux bornes.

**Suites complètes 2A.3 :** `base` : 21 Python (0,26 s), 72 JS réussis. `min` : **23 réussis, 6 xfail stricts A2, 57 warnings** (8,71 s) ; `current` : **23 réussis, 6 xfail stricts A2, 35 warnings** (9,38 s). Les 12 succès antérieurs sont conservés. L’augmentation de 22 / 11 avertissements correspond aux 11 démarrages de banc supplémentaires (`NotAppKeyWarning` HTTP HA et, sur `min`, CORS) ; pas de nouvelle famille de warnings. Aucune nouvelle dépendance.

**Borne des garanties :** la collectabilité après huit reloads réussis ne signifie pas absence de toute référence interne à Core après une panne. Sur `min`, après une exception générique de démarrage, une référence faible à l’ancien coordinateur, sans listener ni tâche, restait vivante après le setup suivant, puis devenait nulle après l’unload normal. Core enregistre son propre `async_shutdown` sur la config entry. Sur `current`, la référence était déjà nulle après récupération. Le rollback n’édite pas les callbacks privés de HA. Un refus persistant d’une plateforme peut toujours nécessiter le redémarrage demandé par HA ; les tests ne constituent pas une validation HACS ou en production.

### 2A.5 — refus résiduel de déchargement pendant le rollback (B3)

Sur `d51ce475`, la génération arrêtait ses producteurs mais perdait `runtime_data` alors que `sensor` restait chargé. Le prochain setup réessayait le forwarding au lieu du déchargement. L’étape 2A.5 conserve le reliquat jusqu’à confirmation HA (voir [architecture](ARCHITECTURE.md)).

Les six cas de `spec_residual_platforms.py` injectent la faute **après** le forwarding réel et le début du démarrage des producteurs. Pour les cibler : `TMPDIR=/tmp/opencode bash recette/lancer.sh min -k spec_residual_platforms` (ou `current`).

| Cas | Mesure en recette |
|---|---|
| Refus puis exception d’unload (deux cas) | 13 listeners d’entités associés à `sensor` tant que HA refuse, **0** après le premier reload qui peut le décharger. Aucun producteur ni SSE pendant `SETUP_ERROR`. Après reprise : **2 tâches / 1 connexion**, compteur HA et snapshot WS à **1**, nom et identifiants inchangés. Un seul événement pour la nouvelle session ; un ancien finaliseur ne touche pas la nouvelle génération. |
| Refus persistant avec une seconde entrée | Trois reloads refusés, aucune publication pour l’entrée en échec. L’inventaire passe de `binary_sensor` + `sensor` à `sensor`, seule plateforme retentée ensuite. Une tentative par domaine et par reload ; la seconde entrée garde ses 2 tâches, son SSE et ses notifications. Reprise normale dès la levée du refus. |
| Suppression définitive (deux cas) | Une tentative sur le seul domaine restant depuis `SETUP_ERROR`, qu’il accepte ou refuse encore ; aucune notification fantôme ni tâche résiduelle. Un refus permanent reste signalé, sans forcer le déchargement HA. |
| Annulation à la barrière du nouveau nettoyage | Le nettoyage se termine sous le verrou ; une plateforme déjà libérée n’est pas réinscrite et le refus de l’autre n’est pas oublié. Reprise ultérieure sur la même entrée. |

**Avant → après :** **6 échecs → 6 réussites** sur chacun des deux Core, sans skip ni nouveau xfail. Suites complètes : `base` **21 Python** (0,27 s), **72 JS** ; `min` **29 réussis, 6 xfail stricts A2, 69 avertissements** (9,14 s) ; `current` **29 réussis, 6 xfail stricts A2, 41 avertissements** (9,46 s). Les 23 succès précédents et les tests A2 sont conservés. Les avertissements supplémentaires proviennent des six ouvertures de banc HTTP/CORS ; aucun nouveau type.

**Réserves reportées :** `finish_cleanup` n’a pas de durée maximale propre ; une annulation d’un unload **ordinaire** peut laisser Core en `UNLOAD_IN_PROGRESS` ; le Core 2025.6.0 peut conserver temporairement des références à des coordinateurs inactifs. Ces points n’ont pas été modifiés.

**Validation définitive de 2A :** le mainteneur confirme le contre-audit indépendant de `942de6ffa8d33b0ee10319fa39938c3f587f35aa` dans sa demande 2B.1 du 25 novembre 2026. Cette référence conserve les corrections P1-A/B1/B2/B3 ; les réserves ci-dessus restent documentées. La publication demeure v0.1.16 (`443ce38`).

### 2B.1 — cohérence REST/SSE (P1-B)

**Reproduction avant intervention :** sur le backend `942de6f`, `min -k latest_stream_state --runxfail` puis `current` avec la même sélection ont chacun produit **6 échecs ciblés / 29 désélectionnés**. Les six exceptions `StaleSnapshot` confirmaient le retour exact aux données REST antérieures. Les marqueurs xfail ont ensuite été retirés ; les assertions exigent désormais aussi la publication SSE **avant** la libération de la barrière HTTP.

`spec_race.py` compte **26 cas**, utilisant les vrais GET/SSE, plateformes HA et commandes WS authentifiées :

| Cas | Preuve |
|---|---|
| Six reproductions × deux endpoints bloqués (12) | Start, stop, progression, pause, reprise et séquence multi-session ; course dans `/streams` et après sa réponse pendant `/servers`. Cache, `data`, WS, compteurs globaux total/playing/paused/débit et compteurs par serveur concordent avant et après libération. Les notifications abonnées ne régressent pas lors de la publication REST. |
| Plusieurs mutations d'une session (1) | Progression, pause, seek arrière, reprise, session éphémère puis stop final. Le refresh HA demandé via le vrai debouncer récupère ensuite deux sessions REST seules, y compris un ID précédemment supprimé. |
| Ordre snapshot/événement (3) | Mutation antérieure au GET suivie d'un REST plus récent (y compris position moindre), mutation pendant le GET, snapshot contenant déjà la même mutation. Les timestamps factices identiques ne servent pas à trier. |
| Échec / annulation (2) | HTTP 503 sur `/servers` ou annulation pendant `/streams` après événement SSE ; cache vivant conservé, superpositions libérées, refresh ultérieur réussi et session manquée récupérée. |
| Santé et données REST sur session active (1) | Santé reçue avant le GET serveurs remplacée par sa valeur REST plus récente ; santé pendant ce GET conservée. Trois refresh avec progression concurrente acceptent chacun des métadonnées REST nouvelles. |
| `ready` concurrent et reconnexion (2) | `ready` répété pendant son propre refresh ; EOF réel puis nouvelle connexion pendant un refresh manuel. Les trames suivantes sont appliquées avant la réponse REST lente. Le passage suivant récupère la session manquée ; une seule connexion SSE. Le délai réel de reconnexion est conservé. |
| Unload / reload avec deux entrées (2) | Requête externe en vol annulée et attendue avant le retour de HA ; zéro marqueur/demande `ready` sur l'ancien coordinateur, tâches finies. Même ID de session sur la seconde entrée, état différent conservé ; capteurs/WS du remplaçant corrects ; aucun retour tardif de l'ancienne génération. |
| Borne de réconciliation (1) | Borne abaissée à 2 pour provoquer le dépassement avec 5 ID : structure vidée, cache SSE préservé, REST seul suivant supprime les sessions manquées sans marqueur persistant. |
| Lignes découvertes par le REST en vol (1) | Stop et progress pour des sessions absentes localement, santé d'un serveur encore inconnu ; trames bornées par un témoin FIFO de santé connu. Pas de résurrection, progression et découverte des capteurs correctes. |
| Polling périodique + `ready` (1) | Une barrière déclenche exactement un timeout du **vrai producteur poll**, sans raccourcir les autres horloges HA. Une session manquée est capturée par ce GET, une autre après sa capture ; `ready` demande le passage suivant tandis que SSE reste fluide. |

Les délais de 5/12 s bornent une attente de barrière ou de notification, ils ne décident pas de l'interleaving. Le seul remplacement d'horloge cible un timeout du producteur poll. Les six scénarios historiques ont été renforcés, sans suppression de leur invariant.

**Discrimination sur le backend antérieur :** archive temporaire de `942de6f` avec le nouveau `spec_race.py`, sélection `spec_race and not reconciliation_cap and not periodic_poll` : **20 échecs, 4 réussites, 31 désélectionnés**, sur **chacun** des deux Core. Les échecs portent sur données écrasées, ingress bloqué derrière `ready` ou refresh survivant au retrait ; aucun n'est un attribut interne manquant. Les quatre contrôles déjà verts sont les deux ordres sans conflit et les deux récupérations après échec/annulation. Les tests de borne et de réveil du nouveau producteur sont spécifiques à la solution et ne font pas partie de cette comparaison.

**Suites officielles complètes :**

| Commande (`TMPDIR=/tmp/opencode bash recette/lancer.sh …`) | Résultat |
|---|---|
| `base` | **21 Python réussis** (0,25 s), **72 JavaScript réussis**, 0 échec, 0 ignoré, 0 annulé |
| `min` — Core 2025.6.0 | **55 réussis**, 0 xfail, 0 skip, **109 avertissements** (15,75 s) |
| `current` — Core 2026.11.3 | **55 réussis**, 0 xfail, 0 skip, **61 avertissements** (15,17 s) |

Les **29 contrôles antérieurs**, dont toutes les garanties 2A, sont conservés. Les 20 cas supplémentaires expliquent les 40/20 avertissements supplémentaires par rapport à 2A (banc HTTP/CORS), sans nouvelle famille. Voir [architecture](ARCHITECTURE.md) pour la vérification du contrat v3.2.1, les alternatives écartées, la priorité de réception locale et les limites : aucune API testée ne permet de départager absolument un événement retardé et une capture REST concurrente. Cette recette ne revendique pas une validation d'un serveur Tracearr réel, d'un dashboard navigateur ou d'une installation HACS.

Compilation de `custom_components` et `recette` avec cache temporaire isolé, syntaxe JS (suite `base`), lecture JSON du manifeste et de `hacs.json`, et `git diff --check` réussis. Aucun blocage de validation locale. Livraison en attente du contre-audit indépendant ; aucune intervention en production ni action distante de publication.

### 2B.3 — fusion par champ et indépendance des états REST/SSE

Le contre-audit 2B.2 a refusé `397f40e8` malgré la correction des six courses historiques, la réactivité SSE, la sérialisation, les réveils `ready`, la borne de 4096 ID, la convergence après saturation et la non-régression de 2A. Les deux écarts ont été reproduits sur ce SHA **avant** modification du backend, sur chacun des Core.

| Cas ajouté dans `spec_race.py` | Observation avant correction et garantie après |
|---|---|
| Trame `stream.updated` v3.2.1 × trois refresh | Avant : trois positions SSE correctes mais trois couples `library_id`/`genres` à `null`. Après : les trois positions, les trois enrichissements REST distincts et le snapshot HA/WS concordent sans refresh de réparation. La fixture reproduit `formatActiveStream` sans la jointure. |
| Mutations partielles successives | Avant : `updated` avec l'état seul, puis `progress` avec la position seule, recopiaient `1000` du cache. Après : état et position SSE, débit REST `2600`, capteur débit et WS à `2,6` Mbit/s. |
| Mise à jour SSE seule | Avant : les placeholders effaçaient les enrichissements déjà connus. Après : métadonnées conservées dans le cache et la notification WS ; `bitrate: null`, réellement fourni et nullable, efface bien l'ancien débit. |
| Stop/start du même ID pendant un GET | Avant : l'ancien snapshot pouvait réintroduire l'ancienne bibliothèque, les genres et le lecteur. Après : des update/progress tardifs entre stop et start ne recréent pas la session ; le nouveau start et sa progression n'héritent ni du cache arrêté ni du REST en vol. Un REST ultérieur enrichit la nouvelle incarnation. |
| Poll périodique à 503, flux SSE ouvert | Avant : `(connected, sse_connected, last_update_success) = (false, false, true)`. Après : `(false, true, false)`, `last_exception` est un `UpdateFailed`, capteurs de comptage indisponibles, binaire Connected `off`. Une trame live ne masque pas l'erreur mais arrive dans le cache et le WS ; le REST réussi rétablit les capteurs. |
| Rattrapage `ready` à 503, EOF, reconnexion | L'échec sur un flux déjà confirmé conserve sa confirmation et l'échec HA ; l'EOF seul retire la confirmation. Le premier rattrapage sur la nouvelle connexion échoue sans la confirmer ; les trames continuent d'arriver. Un nouveau `ready` réussi confirme le flux et récupère une session manquée. |

La barrière HTTP capture les données avant les mutations ; les témoins de notification et le `get` WebSocket FIFO remplacent les délais arbitraires. Une barrière de test fait expirer le vrai poll périodique ; la reconnexion teste l'EOF et le backoff réels. Les nouveaux tests finaux, appliqués seuls à une archive de `397f40e8` avec `-k 'v321 or partial_changes or live_update_ignores or stop_restart or poll_error or ready_error'`, donnent **6 échecs et 55 désélectionnés sur chaque Core**. Sur la correction, les six sont verts et les 55 existants passent également.

| Suite officielle (`TMPDIR=/tmp/opencode bash recette/lancer.sh …`) | Résultat |
|---|---|
| `base` | **21 Python réussis** (0,26 s), **72 JavaScript réussis**, 0 échec, 0 ignoré, 0 annulé |
| `min` — Core 2025.6.0 | **61 réussis**, 0 skip, 0 xfail, **121 avertissements** (19,84 s) |
| `current` — Core 2026.11.3 | **61 réussis**, 0 skip, 0 xfail, **67 avertissements** (20,24 s) |

Les avertissements supplémentaires proviennent des six ouvertures de banc HTTP/CORS. Le contre-audit indépendant **2B.4** a ensuite validé `f918150fd8fc6fa6f44d309aac3d4387d063d83b` ; le mainteneur a accepté les limites d’ordre documentées et clôturé 2B.

### 2C.1 — trames SSE invalides et images fragmentées

Pour isoler les 27 nouveaux essais : `TMPDIR=/tmp/opencode bash recette/lancer.sh min -k spec_robustness` (ou `current`). Les mêmes essais sur une archive de `f918150` donnent **19 échecs / 8 succès** sur Core 2025.6.0 et **18 échecs / 9 succès** sur Core 2026.11.3 (la très longue ligne invalide seule est déjà ignorée au Core récent). Les cas encore verts sur le parent servent de contrôles.

| Contrôle | Preuve sur le candidat |
|---|---|
| SSE, 16 variantes | Trames invalides, incomplètes, inconnues ou hors bornes suivies d’une progression valide multiligne avec `bitrate: null`. Un seul événement WS métier, cache et stats intacts hors progression, même connexion SSE et état REST, tâches annulées au déchargement. Le test Python de découpage ajoute CR/CRLF séparés, UTF-8 coupé entre deux blocs et fin de flux sans séparateur. |
| Proxy HA, 10 réponses HTTP | Octets identiques avec et sans `Content-Length`, y compris lorsque la signature d’image est fragmentée, et à 8 000 000 octets ; 413 au-delà (taille annoncée ou octets lus). Pas de corps partiel sur rupture, délai dépassé (délai abrégé par le test) ou encodage HTTP refusé ; MIME interdit et redirection rejetés. La session HTTP partagée reste utilisable. |
| Accès au proxy, sur vrai Core | Signature HA jetable acceptée, requête non signée et signature expirée refusées ; image d’une session absente ou arrêtée, type de route invalide, autre origine et autre chemin ne déclenchent aucune requête Tracearr. |

Suites complètes : **22 Python, 72 JavaScript, 88 sur Core 2025.6.0, 88 sur Core 2026.11.3**, sans échec, skip ni xfail. Les avertissements HTTP/CORS de Core restent présents (175 et 96). Syntaxe JS, compilation Python, lecture JSON du manifeste et de `hacs.json`, et `git diff --check` réussis. Serveur Tracearr simulé sur loopback ; aucun essai HACS, navigateur HA, proxy inverse ou déploiement dans ce lot.

### 2D.1 — cohérence du débit après modification LAN/WAN (A6)

**Avant (`8e63524`).** Reproduction de [l’audit initial](AUDIT_INITIAL.md) dans `recette/cartes.html?lan-wan` : trois sessions de 1000 kbit/s, filtre distant, défaut serveur distant → local sans modifier les sessions. Chromium : 3,0 → 0,0 Mb/s dans l’en-tête du carrousel, trois badges à 1,0 Mb/s encore présents ; en liste et sur la carte individuelle, en-tête et panneaux périmés. Les nouveaux tests Node « local » et « distant » échouent ; « tous » passe.

**Après.** Sur les trois rendus, l’en-tête affiche 0,0 Mb/s, les badges disparaissent puis reviennent en rétablissant la règle distante, sans perte de session ni déplacement du carrousel. Sonde DOM réussie sous Chromium 152.0.7977.82 en clair et sombre (`--force-dark-mode`). Reprendre la commande de la section suivante en ajoutant `?lan-wan` à l’URL ; le JSON du `<pre>` doit donner `ok: true`.

| Essais réexécutés sur Debian 13.2 | Résultat |
|---|---|
| `TMPDIR=/tmp/opencode bash recette/lancer.sh base -k 'test_network_options or test_bulk_options or test_model'` | 13 Python 3.13.5 réussis ; syntaxe et 75 tests Node 22.23.5 réussis. Aller-retour par appareil, changement de défaut serveur, priorité historique, scopes local/distant/tous et comptes par serveur avec Plex/Jellyfin/Emby synthétiques. |
| `TMPDIR=/tmp/opencode bash recette/lancer.sh min -k 'spec_network_options or test_rest_and_options_use_replacement_relay'` (et `current`) | 2 réussis sur Core 2025.6.0 / CPython 3.13.18 et 2 sur Core 2026.11.3 / CPython 3.14.10. Socket HA authentifiée conservée ; deux entrées isolées ; capteurs et stats totales non filtrés cohérents. Le snapshot d’options précède la réponse REST retenue ; la mutation SSE suivante puis la publication REST conservent la dernière règle et le bon débit. |

`git diff --check` réussi. Les deux Core émettent des avertissements de leurs dépendances (5 sur `min`, 9 sur `current`), sans échec. Les validations complètes de 2C ci-dessus et les garanties de cycle HA/transport de 2A/2B restent des références antérieures, pas des suites réexécutées. Le correctif ne change pas ces chemins. Aucun vrai dashboard HA, lecteur physique, essai HACS ou déploiement ; le rendu utilise les éléments distribués avec des données fictives.

### 2E.1 — en-tête responsive et clavier du carrousel (A11/A12)

Sur Debian 13.2, comparer le JS de `28bef59` et celui du candidat avec la **même** page `recette/cartes.html` (voir ci-dessous). Dans Chromium **152.0.7977.82** et Firefox **140.15.0esr**, profils jetables sur loopback, en clair et en sombre :

- **A11.** À 320 px, carrousel sans titre, trois groupes et libellé central « Consommation distante des utilisateurs sur le serveur du séjour » : avant, la colonne intrinsèque n’était pas plafonnée ; le banc d’origine mesure un dépassement du bord droit de **137 px sous Chromium / 138 px sous Firefox** (audit initial : 119/128 px, autre fixture). En dessous du point de coupure historique, le repli déplaçait le centre même quand tout tenait et ne limitait pas la largeur du texte. Après, les côtés tiennent ensemble et le libellé intégral occupe sa propre ligne centrée à 250 et 320 px ; à 768 et 1200 px l’ensemble tient sur une ligne. Le badge court se centre sans créer de rangée supplémentaire. La sonde vérifie les rectangles de la zone, des groupes, des badges et du texte, pas simplement le CSS.
- **A12.** Mettre le focus sur la région du carrousel avec `carousel_mouse_drag:false` et `carousel_show_arrows:false`. Avant, `ArrowRight` ne déclenche aucun défilement géré par la carte : le retour anticipé désactive aussi l’installation du listener clavier. Après, les deux flèches font avancer/reculer l’index **et** le défilement, aux quatre largeurs dans les deux moteurs ; une autre touche n’est pas capturée. La sonde utilise le vrai focus Shadow DOM et des événements clavier synthétiques. Le nouveau test Node échoue aussi sur la base (listener manquant).

Ouvrir `recette/cartes.html?responsive` et attendre le JSON de recette (`ok:true`). Les cas couvrent valeurs courte, longue et sans espaces, plusieurs badges centraux, groupes asymétriques/absents, titre personnalisé/masqué, texte agrandi, et un aller-retour 1200 → 250 → 1200 px sans recréer la carte. Le badge HA court → long → court ne change ni la piste ni l’ancre du carrousel. Vérifications complémentaires : ordre, icône sans nom, unité, couleur à zéro, clignotement, masquage à zéro, en-tête masqué, trois présentations vides, affiche à 135 %, repli sans image pour le fond cinéma et nombre de colonnes effectives. `?visual=long` ou `?visual=short` isole le rendu à 320 px pour une capture.

[Comparatif Chromium à 320 px](../recette/preuves/2e1-badges-320px.png), de gauche à droite : badge long avant, même badge après, badge court après en sombre.

| Mesure sur le banc | Parent (Chromium / Firefox) | Candidat (Chromium / Firefox) |
|---|---|---|
| Libellé long, 250 px, dépassement gauche et droite du bord de carte | 87 px de chaque côté, dans les deux moteurs | 0 px |
| Libellé long, 320 px, dépassement droit du bord de carte | 137 / 138 px | 0 px |
| Trois libellés courts qui tiennent, 250 px | 2 lignes (coupure CSS fixe) | 1 ligne, centre à ≤0,25 px du milieu |

Les **78 mesures par moteur et par mode clair/sombre** réussissent après correction : aucun dépassement horizontal ni chevauchement, écart maximal de **0,02 px** par rapport à la meilleure position centrale disponible. Les quatre essais clavier réussissent dans chacune des quatre exécutions.

**Non-régression réexécutée.** `node --check custom_components/tracearr_ha/frontend/tracearr-card.js`, `node --test tests/*.cjs` (Node **22.23.5**, **75 réussites**), `git diff --check`, ainsi que `?lan-wan` (liste groupée, carrousel et carte individuelle) dans les deux moteurs et les deux modes de couleur. **Réutilisé sans relancer :** validations Python/Core, contrat et garanties backend des lots 2A–2D. Éditeur HA réel, installation HACS, lecteurs réels, Safari, tactile et performance longue durée non exercés ; pas de changement du schéma YAML, du backend, du WS ou de la version.

### 3.1 — cycle de vie, clignotement et diagnostic SSE

**Avant/après sur le même banc.** Servir `recette/cartes.html?lifecycle` ou `?blink` comme ci-dessous. Pour reproduire les défauts, remplacer seulement le module JS de la copie isolée par `git show b9c5880:custom_components/tracearr_ha/frontend/tracearr-card.js`. Lire le JSON de la page : `ok:false` sur le parent, `ok:true` sur le candidat. Base essayée en clair sous Chromium 152.0.7977.82 et Firefox 140.15.0esr ; candidat testé dans les deux moteurs en clair et en sombre.

| Mesure frontend (deux cartes, sauf intervalle/observateur de la carte groupée) | Parent `b9c5880` | Candidat |
|---|---:|---:|
| Horloges après 19 lectures courtes, 2 encore actives, puis aucune | 21 puis 21 | 2 puis 0 |
| Signatures, compteurs d’essais, retries après disparition de la dernière lecture courte | 18, 1, 1 | 0, 0, 0 |
| Avant montage : intervalles / abonnements WS | 2 / 2 | 0 / 0 |
| Carte groupée montée, avec 2 lectures ; après 3 remontages et reconfigurations | 2 intervalles / 2 WS / 1 observateur ; tick remplacé à chaque configuration | 2 / 2 / 1 ; même tick si la configuration ne change pas son besoin |
| Cartes montées, aucune lecture : intervalles / abonnements WS | 2 / 2 | 0 / 2 |
| Après retrait des deux cartes : horloges / signatures / compteurs ; timers, observateurs, trames d’animation et abonnements WS | 21 / 18 / 1 ; 0 tâche frontend suivie et 0 WS | 0 / 0 / 0 ; 0 tâche frontend suivie et 0 WS |

`?lifecycle` vérifie aussi l’ancre du carrousel, l’identité d’une horloge active et l’indépendance des cartes, le gel en pause puis la reprise. Node couvre en plus pause filtrée, changement d’entrée avec ID de lecture réutilisé, état vide masqué, callbacks WS tardifs, signatures tardives et annulation des transitions. Les chiffres sont des décomptes d’objets ou de handles ciblés, pas une mesure de la RAM ni une preuve d’absence de fuite globale.

**Clignotement.** Sur la base, le cycle CSS seul est régulier. Une variation de capteur, de débit ou la disparition d’une lecture détruisait les nœuds de l’en-tête : les trois animations testées sautaient de **0,22 à 1** à mi-cycle, contrairement à une progression seule. Sur le candidat, les mêmes mises à jour conservent les nœuds, les animations et l’opacité mesurée (**écart 0**), en liste et carrousel groupés et sur la carte individuelle. Les durées **500 / 900 / 1 400 ms** restent indépendantes. Les passages positif → zéro → positif arrêtent ou masquent seulement le badge concerné, puis permettent sa reprise. Le réordonnancement des compteurs de deux serveurs conserve 0,22. Le banc relève une descente et une montée progressives sur 32 échantillons du cycle court. Aucun nouveau timer d’animation.

**Panne interne SSE.** Sur Core 2025.6.0 avec le backend `b9c5880`, 3 échecs discriminants : `RuntimeError` muette, `TimeoutError` d’application prise pour un timeout réseau, générateur SSE non fermé explicitement à la panne ; le contrôle d’annulation passe déjà. Les quatre cas passent sur le candidat. L’erreur est journalisée une seule fois avec classe et lieu, sans la chaîne contenant une clé, une URL et un corps factices. `sse_connected` devient faux sur le WS, le REST reste disponible et son producteur récupère la progression suivante. Le flux SSE ne se relance pas automatiquement sur cette panne ; le lecteur est fermé et l’unload termine le polling sans fermer la session aiohttp de HA.

| Vérification sur le candidat | Résultat |
|---|---|
| `TMPDIR=/tmp/opencode bash recette/lancer.sh base -k test_api` | 2 tests API sur Python 3.13.5 ; syntaxe du module valide, suite Node complète également exécutée. |
| `node --test tests/test_carousel.cjs` (Node 22.23.5) | 79 passés. |
| `TMPDIR=/tmp/opencode bash recette/lancer.sh min -k 'internal_sse_failure or sse_source_is_closed or bad_sse_frame or reconnect or ready'` (et `current`) | 26 passés sur chacun des Core 2025.6.0 / Python 3.13.18 et 2026.11.3 / Python 3.14.10, sans échec ni skip ; avertissements de dépendances HA/aiohttp. |
| `?lifecycle`, `?blink`, `?responsive`, `?lan-wan` | Passent dans les deux navigateurs et les deux thèmes du banc. Par combinaison, 78 mesures responsive, écart de centrage ≤0,01 px, aucun débordement ni chevauchement, quatre vérifications clavier et trois cas LAN/WAN. |

Les validations officielles 0 à 2E restent acquises ; seules les non-régressions ciblées ci-dessus sont rejouées. Pas d’essai longue durée, de vrai dashboard HA, de Safari, de tactile physique ni de lecteur réel. Le mainteneur peut confirmer le ressenti du clignotement sur son dashboard lors d’une validation ultérieure ; aucune publication n’est engagée.

**Clôture 3.2 (résultats réutilisés, pas rejoués).** Sur `fcd3c836e7e3a6b5f9c787c03979a7a400d7a95a`, le contre-audit indépendant confirme nettoyage, remontages stables, continuité des animations, progression/pause/carrousel, diagnostic et fermeture SSE avec poursuite du REST. Verdict **VALIDÉ AVEC RÉSERVE NON BLOQUANTE**, accepté par le mainteneur. Le recul temporaire du compteur à la réapparition d’une session entièrement absente du snapshot (et non simplement filtrée) est conservé dans la [roadmap 6A](ROADMAP.md#lot-6a--affichage-en-pause-et-couleurs-des-badges).

### 3B.1 — consolidation finale

**A7 avant/après.** Avec le code de `fcd3c83`, traverser la table native puis soumettre le JSON prérempli renvoyait un formulaire d’erreur au lieu de sauvegarder (1 échec discriminant sur chaque Core, 4 rejets invalides déjà verts). Sur le candidat, le round-trip conserve `unknown` et les autres options, et la suppression volontaire de la clé restaure le défaut du serveur. La publication WS après changement d’options reste couverte par la recette 2D.

**A9 avant/après.** Sur le backend de `fcd3c83`, 0 flow de réauthentification au lieu de 1 après un 401 au premier refresh d’une entrée enregistrée ou un 403 REST en cours d’usage (2 échecs par Core ; onboarding invalide et panne 503 sans réauthentification déjà verts). Après correction, HA ouvre un seul flow ; champ mot de passe sans valeur par défaut, clé refusée ou indisponibilité ne modifient pas l’entrée. La clé acceptée est vérifiée sur les deux routes avant reload ; mêmes entrée, entité enregistrée, URL et options, mêmes consommateurs WS, anciens producteurs terminés, REST/SSE rétablis. Aucune clé factice trouvée dans les snapshots et journaux capturés. Un refus REST n’invalide pas à lui seul le SSE déjà confirmé. Si l’entrée est supprimée pendant la validation réseau, la réponse tardive ne sauvegarde rien et ne recharge rien.

**A10 reste ouverte.** Sonde Node ponctuelle sur les deux éléments du banc : avec un film conservé et `connected=false`, `sse_connected=false`, le panneau reste affiché sans message et l’horloge prédit 5 → 8 s en 3 s, tick actif. À vide, le message n’apparaît que dans le mode `message` ; `hide` masque la carte et `header_only` n’affiche pas le message. La recette REST 503 + SSE encore ouvert confirme qu’une panne REST seule ne signifie pas que les données sont périmées. Pas de recette sur durée réelle de panne : arbitrer la sémantique avant publication.

| Vérification | Résultat et portée |
|---|---|
| Deux venv du banc, dépendances épinglées `requirements-{min,current}.txt` ; `pytest -p no:cacheprovider -c recette/pytest.ini -q recette -k 'spec_reauth or spec_network_options or poll_error or ready_error or reload_failure or rest_and_options or internal_sse_failure or disconnect_ready'` | 17 réussites par Core 2025.6.0 / CPython 3.13.18 et Core 2026.11.3 / CPython 3.14.10 ; 85 désélectionnés. REST/SSE factices sur loopback, vrais flows et WS HA ; avertissements du banc et des dépendances. |
| `pytest -p no:cacheprovider -q tests -k 'bulk_options or model'` | 10 réussies, 12 désélectionnées ; CPython 3.13.5, pytest 9.2.0. |
| Node 22.23.5, test existant `durable account/server targeting` et sonde A10 | 1 test et 1 sonde réussis. A13 : le moteur et l’éditeur utilisent déjà `server_id:username`, exemple YAML corrigé sans changer le code. Pas de nouveau rendu dans les navigateurs. |
| A8, contrat Tracearr ; A14, `file` et `sha256sum` ; catalogues HA et syntaxe | Contrat des tags 2.6.0/2.7.0 issu de l’[audit initial](AUDIT_INITIAL.md#compatibilité-et-vérifications-officielles) et prérequis confirmés dans le code local. PNG 1254 × 1254 de contenu identique ; aucun essai de rendu HACS. 65 chemins et leurs placeholders identiques entre `strings.json`, `en.json` et `fr.json`. Compilation Python et syntaxe JS réussies. |

Les preuves des lots 0 à 3.2 restent acquises. Pas de campagne globale, d’installation HACS ni d’essai sur un vrai dashboard ; voir la [préparation du lot 4](DEVELOPMENT_STATUS.md#état-des-14-anomalies-à-lentrée-du-lot-4).

### 3B.2 — indisponibilité des lectures (A10)

**Avant (`112ce00`).** La sonde 3B.1 est reproduite : 5 → 8 s en 3 s sur les deux types de cartes, sans avertissement et avec « Fin à … ». Les deux tests Node A10 échouent sur le parent ; `?outage` à 320 px renvoie `ok:false` en clair sous Chromium et Firefox. Sur chacun des deux Core, le parent confirme à tort un SSE après saturation du rattrapage et considère un objet JSON sans tableau `data` comme un succès.

**Après.** À 320 px, le film en lecture reste à 0:05 / −1:55, la vraie pause reste visible, l’heure de fin cède la place à « Non actualisé », et la barre est grise. L’avertissement orange nomme la source, précède les compteurs et débits désaturés et reste visible à vide même sans en-tête. Une carte ciblant une autre entrée continue à 0:08 au même instant. Les deltas non confirmés ne retirent pas les panneaux ; un échantillon fiable à 0:02 recale la lecture et recalcule la fin. Un snapshot fiable vide retire la session et son horloge. Les coupures successives puis le démontage ne laissent pas de tick, d’état figé ou d’abonnement superflu. L’ancre et le cycle du badge de carrousel restent en place.

| Contrôle exécuté | Résultat |
|---|---|
| `node --check …/tracearr-card.js`, `node --test tests/test_carousel.cjs` (Node 22.23.5) | Syntaxe valide, 81 réussites, dont les deux scénarios A10. |
| Venv isolés avec les versions épinglées du banc ; `pytest -p no:cacheprovider -c recette/pytest.ini -q recette -k 'spec_race or spec_transport or spec_reauth or internal_sse_failure'` | 44 réussites par Core 2025.6.0 / Python 3.13.18 et Core 2026.11.3 / Python 3.14.10, 62 désélectionnés ; avertissements du banc et des dépendances. Transitions REST/SSE et WS HA, rattrapage saturé, snapshot incomplet/invalide, arrêt réel manqué puis retrouvé, réconciliation et réauthentification. |
| `recette/cartes.html?outage`, `?blink`, `?lifecycle`, `?responsive`, `?lan-wan` | Cinq sondes vertes sous Chromium 152.0.7977.82 et Firefox 140.15.0esr, dans les deux thèmes ; 78 mesures responsive par combinaison. `?outage-preview&visual` montre les deux cartes figées pour les captures. |

Les validations antérieures restent acquises ; la campagne globale n’a pas été relancée. Le banc ne vérifie ni l’installation HACS ni le shell d’un vrai dashboard HA. La détection dépend des échecs/confirmations des producteurs, pas du silence SSE ; aucun nouvel indicateur pour une perte du WebSocket HA lui-même, qui reste distincte d’une panne Tracearr.

### 4.1.1 — corrections ciblées A9 et A10

**Référence.** Audit 4.1 sur `f2db1a5dded2a2a2bbc41c6d08646bcaf974a0e7` : refus de validation pour A9/A10 ; douze anomalies restent validées (A1–A8, A11–A14). Résultats communiqués par l’audit, non rejoués : 22 Python, 81 JS, 106 par Core, aucun skip/xfail et hassfest local réussi.

**Avant, sur les deux Core.** Une sonde sur le parent confirme le quadruplet A9 après `/servers` HTTP 200 `{}` : `reauth_successful`, clé écrite, `SETUP_RETRY`, zéro entrée sur le WS. Le test A10 reproduit `unknown_error` sur `tracearr_ha/get` pour deux entrées lorsque le débit du snapshot de reprise est textuel. Un second test reproduit l’échec avec un indicateur de transcodage textuel alors qu’une progression SSE valide est arrivée entre les deux GET. Le reload concurrent pouvait annoncer le succès d’un flow que HA avait déjà annulé. Comparaison avec les deux specs mises à jour : 5 échecs discriminants, 2 contrôles verts et le refus SSE seul désélectionné, par Core.

**Après.** Les enveloppes des deux routes et les lignes indispensables utilisent le même validateur dans le formulaire et le coordinateur. Pas d’écriture de clé ni de reload sur HTTP 200 inexploitable. Une tentative valide préserve l’ID de l’entrée, les options et le nom personnalisé de l’entité. Suppression et reload concurrents empêchent l’écriture tardive ; refus SSE seul sans réauthentification ; aucune clé factice dans les messages WS ou les journaux capturés. Le succès annonce une clé vérifiée et enregistrée, non l’achèvement du reload.

Sur rejet REST, le cache valide, `last_sync` et les statistiques restent cohérents ; `connected=false` et échec HA, `streams_stale=true` si le SSE est coupé, mais `false` s’il reste confirmé. `get` et l’abonnement déjà ouvert renvoient les deux entrées et la progression de la seconde ; son capteur suit le passage à 4 Mbit/s. La progression SSE concurrente et `bitrate:null` restent publiés. Une réponse valide restaure l’état et les capteurs, puis `data:[]` retire la dernière session et remet le compteur à zéro. Aucun masquage d’entrée dans le WS.

| Contrôle exécuté | Résultat |
|---|---|
| `pytest -p no:cacheprovider -q tests/test_api.py tests/test_model.py tests/test_translations.py` | 17 réussites sur CPython 3.13.5, pytest 9.2.0. Parité des 66 chemins et de leurs paramètres vérifiée dans `strings.json`, `en.json` et `fr.json`. |
| `pytest -p no:cacheprovider -c recette/pytest.ini -q recette -k 'spec_snapshot_validation or spec_reauth or spec_transport or spec_race or spec_websocket or spec_network_options or bad_sse_frame'` | 78 réussites, 32 désélectionnées par Core, sans skip ni xfail. Core 2025.6.0 / CPython 3.13.18 et Core 2026.11.3 / CPython 3.14.10, venv épinglés et réseau loopback factice ; avertissements du banc/dépendances. |

Le contrat publié Tracearr v3.2.1 de `/streams` et `/servers` a été relu ; aucun service Tracearr réel, dashboard, HACS, hassfest candidat, ni campagne JS/navigateur rejoués (frontend inchangé). 4.2 et le contre-audit ne font pas partie de cette livraison.

### 4.1.3 — course entre réauthentification et suppression (A9)

**Avant (`b8908c2`, les deux Core).** La vérification de clé retenue sur `/servers` reprend alors que la suppression native HA est bloquée dans le déchargement d’une plateforme. L’entrée est en `UNLOAD_IN_PROGRESS` mais toujours dans le registre et le flow est actif. Résultat : clé modifiée, un reload programmé, `reauth_successful`, puis `UnknownEntry` non récupérée dans la tâche de reload. Aucune persistance après suppression n’est revendiquée. Le second test discriminant montre qu’un unload simplement refusé était suivi d’un succès nominal avec demande de reload, alors que Core interdit le reload d’une entrée `FAILED_UNLOAD`. **2 échecs sur 2 par Core**.

**Après.** Les barrières réseau et déchargement reproduisent le même entrelacement ; le formulaire attend le verrou d’entrée hors I/O HTTP. La suppression retire l’entrée avant l’écriture : données inchangées, `reauth_entry_removed`, zéro reload demandé et zéro `UnknownEntry`. La suppression déjà terminée et le reload concurrent restent couverts. Après un unload refusé avec entrée conservée, une clé invalide est refusée ; une clé valide est enregistrée sur la même entrée, avec nom d’entité et options préservés, sans reload. Le formulaire demande un redémarrage pour appliquer la clé. La réauthentification nominale et les erreurs REST déjà testées conservent leur comportement.

| Contrôle exécuté | Résultat |
|---|---|
| `pytest -p no:cacheprovider -c recette/pytest.ini -q recette -k 'spec_reauth or refused_unload_and_final_remove or residual_platforms or subscription_survives_reload or reload_failure_then_recovery or unsubscribe_after_reload_and_remove'` | **21 réussites, 91 désélectionnées par Core**, aucune erreur ni skip/xfail, avertissements du banc/dépendances. Core 2025.6.0 / CPython 3.13.18 et Core 2026.11.3 / CPython 3.14.10, venv épinglés et Tracearr factice sur loopback. |
| `pytest -p no:cacheprovider -q tests/test_translations.py` | 1 réussite hors HA sur CPython 3.13.5 ; parité des 67 chemins et paramètres vérifiée entre les trois catalogues. |

**Résultats antérieurs non rejoués.** Les 78 tests ciblés par Core de 4.1.2 restent des preuves historiques sur `b8908c2` ; le contre-audit valide définitivement A10 et confirme la correction des deux défauts de 4.1. En 4.1.3, ni l’intégrité du cache A10, ni la campagne globale, le JS, les navigateurs, HACS ou un redémarrage complet de HA n’ont été rejoués. Une suppression indépendante après une réauthentification légitimement terminée reste possible. Seule A9 reste à contre-vérifier.

## Recette visuelle légère

`recette/cartes.html` monte le JS distribué, avec une source WS de carte synthétique. Les métriques sont mesurées sur les éléments réels du Shadow DOM. Sous Chromium (152.0.7977.82 pendant la validation) :

```bash
profil=$(mktemp -d)
chromium --headless --disable-background-networking --disable-sync --no-first-run \
  --user-data-dir="$profil" --dump-dom "file://$PWD/recette/cartes.html"
rm -rf -- "$profil"
```

Lire le JSON dans `<pre id="result">`. Pour une comparaison interactive, servir **uniquement les deux fichiers nécessaires**, puis ouvrir l’adresse loopback indiquée dans un navigateur avec un profil jetable :

```bash
ui=$(mktemp -d)
mkdir -p "$ui/recette" "$ui/custom_components/tracearr_ha/frontend"
cp recette/cartes.html "$ui/recette/"
cp custom_components/tracearr_ha/frontend/tracearr-card.js "$ui/custom_components/tracearr_ha/frontend/"
python3 -m http.server --bind 127.0.0.1 --directory "$ui" 0
# Dans un autre terminal, remplacer PORT par le port affiché :
# profil=$(mktemp -d)
# firefox --no-remote --profile "$profil" "http://127.0.0.1:PORT/recette/cartes.html"
# Fermer ce navigateur puis supprimer son profil jetable.
# Arrêter le serveur par Ctrl+C et, dans son terminal :
rm -rf -- "$ui"
```

Pour la preuve avant correction de 2E.1, servir une deuxième copie isolée de ce dossier et y remplacer **seulement** le JS par `git show 28bef59:custom_components/tracearr_ha/frontend/tracearr-card.js`. Garder la même page de recette et ne pas modifier le fichier de travail.

1. Comparer les largeurs **de carte** 250/320/768/1200 px. Deux colonnes demandées donnent **1/1/2/2**. Attendre la fin de la matrice, ou utiliser `?responsive` pour les assertions. Relever l’écart de centrage et le débordement ; les pixels exacts dépendent de la police. Les valeurs d’avant correction sont conservées dans la section 2E.1.
2. Basculer groupée/individuelle, liste/carrousel ; avancer avec les flèches. Observer le compteur puis mettre en pause/reprendre : l’écoulé de la première session doit se figer/repartir. Basculer le libellé et la largeur sans recharger la page.
3. Démonter/remonter plusieurs fois ; vérifier visuellement l’absence de panneaux dupliqués et le retour du flux. Utiliser `?lifecycle` pour décompter les états, les timers, l’observateur et les abonnements de carte, et `?blink` pour mesurer le cycle natif et les mises à jour. Ces sondes ne remplacent pas un profilage de RAM.

**Limites.** Les preuves P1 portent sur le code publié avec un vrai backend Core et un réseau local simulé. Le banc ne valide pas d’installation HACS, de vrai dashboard HA, de lecteur physique Plex/Jellyfin/Emby, de débit Internet, de proxy inverse, de permissions multi-utilisateurs en production, ni d’iOS/Android. Il n’implémente pas l’ensemble de l’API Tracearr, ni son stockage, sa cadence de heartbeat ou ses quotas réels. La sonde frontend ne charge pas le sélecteur d’entités de HA. Pour la suite, garder ces essais rapides, puis compléter par un environnement de prépublication distinct selon les changements.

## 6A.1 — Pause et couleurs des badges

**Base `3587f832` :** trois assertions Node discriminantes pour la pause et une pour la palette individuelle échouent avant correction. La sonde `?pause-colors` en clair échoue sur les trois dispositions sous Chromium et Firefox : reste absent en pause, palettes individuelles ignorées et commandes absentes de l’éditeur.

**Candidat, Debian 13.2 / Node 22.23.5 :** `node --check custom_components/tracearr_ha/frontend/tracearr-card.js`, `node --test tests/test_carousel.cjs` (83 réussis, aucun saut ni échec), `git diff --check`. Horloges monotone et civile contrôlées dans Node pour vérifier le gel et le recalcul de l’heure de fin à la reprise.

**Navigateur :** servir le dépôt en HTTP sur loopback et ouvrir `recette/cartes.html?pause-colors`. Attendre le JSON `ok:true`. Chromium 152.0.7977.82 et Firefox 140.15.0esr, profils jetables, clair et sombre : 12 mesures DOM par combinaison (250, 320, 768, 1200 px × liste, carrousel et individuelle), transitions de lecture/pause/péremption/reprise, couleurs et phase d’animation, écriture et relecture de l’événement `config-changed` pour les deux types de carte. Les sondes `?responsive` (78 mesures par combinaison), `?blink` et `?outage` passent aussi dans les quatre combinaisons.

**Captures :** `?pause-colors-preview&visual`, à 340 px de largeur de carte ; la carte individuelle masque l’heure de fin. [Chromium clair](../recette/preuves/6a.1/pause-badges-chromium-clair.png) · [Firefox sombre](../recette/preuves/6a.1/pause-badges-firefox-sombre.png).

Backend inchangé : validations Core, vrai dashboard HA et installation HACS reprises comme références de la stable ([état de reprise](DEVELOPMENT_STATUS.md), [recette 4.2](RECETTE_42.md)), pas rejouées sur ce candidat. Le banc ne vérifie pas la persistance storage dans un vrai HA ni un déploiement YAML ; il vérifie la relecture par les composants frontend et la compatibilité des options. Aucune intervention sur la production.

## 6B.1 — Badges techniques

**Référence :** `b526cdf9b8285a151e59e16ceca74150d81ef16f`, arbre initial propre. 83 tests Node au vert. La nouvelle sonde `?technical` en clair, avec le JS de référence, conserve les 12 cas Classique/compact et ne satisfait pas les 108 autres cas, dans chacun des deux navigateurs ; l’éditeur ne contient pas les commandes nouvelles.

**Contrat amont étudié en lecture de code** sur Tracearr v3.2.1 : [générateur `/streams`](https://github.com/connorgallopo/Tracearr/blob/v3.2.1/apps/server/src/routes/publicV2/streams.ts) partagé avec les événements SSE complets, [libellés dérivés](https://github.com/connorgallopo/Tracearr/blob/v3.2.1/apps/server/src/routes/publicV2/shared.ts), [parseur Plex](https://github.com/connorgallopo/Tracearr/blob/v3.2.1/apps/server/src/services/mediaServer/plex/parser.ts) et [extracteur commun Jellyfin/Emby](https://github.com/connorgallopo/Tracearr/blob/v3.2.1/apps/server/src/services/mediaServer/shared/jellyfinEmbyUtils.ts). Les détails sont déjà transmis par HA. Le débit appartient au flux courant, pas à une comparaison source/sortie. Les codecs égaux pendant un transcodage peuvent être des replis ; HDR de sortie repris/supposé, profil audio de sortie généralement absent. Voir [le contrat d’affichage](CONFIGURATION.md#badges-techniques-des-panneaux-de-lecture) pour les replis en vigueur.

**Candidat, Debian 13.2 / Node 22.23.5 :** syntaxe du module valide, `node --test tests/*.cjs` **90 réussis, aucun échec ni saut**, `git diff --check` propre. Les nouveaux tests couvrent le HTML historique exact, les styles, les identifications et replis, les deux dispositions et modes, la normalisation des réglages et l’identité du rendu de l’aperçu.

**Navigateur :** servir le dépôt en HTTP sur loopback, ouvrir `recette/cartes.html?technical` et attendre le JSON `ok:true`. Chromium **152.0.7977.82** et Firefox **140.15.0esr**, profils jetables, clair et sombre : **120 cas par combinaison (480)**, sur 250, 320, 768 et 1200 px de largeur de carte. Cinq styles × deux dispositions × liste, carrousel et individuelle. Aucun débordement ni chevauchement mesuré ; contraste texte/fond des badges au moins **4,98:1** sur les échantillons, y compris couleurs personnalisées extrêmes, fonds transparents et panneaux floutés. Contrôles supplémentaires sur le véritable éditeur des deux cartes à 250 px : sauvegarde par `config-changed`, relecture JSON, édition, visibilité, réordonnancement, désactivation sans perte, réinitialisation par format et globale, rendu identique à la carte. Une modification des métadonnées de transcodage rafraîchit le panneau sans changer l’ancre ni reconstruire le carrousel ; une mise à jour de progression seule ne remplace pas le contenu du panneau.

**Non-régression :** `?pause-colors`, `?responsive`, `?blink`, `?outage` et `?lan-wan` au vert dans les deux moteurs et thèmes. Validations antérieures de la stable et de 6A.1 réutilisées ; aucune campagne Python/Core relancée, aucun changement backend, aucun essai sur des serveurs ou lecteurs Plex/Jellyfin/Emby réels. Persistance Lovelace (storage et YAML), rendu dans le vrai tableau de bord HA et validation graphique du mainteneur encore à faire. Réserve temporelle 3.2 inchangée.

**Captures :** ouvrir `?visual&technical-preview=styles`, `layouts` ou `editor` (ajouter `&theme=light`/`dark` pour forcer le thème du banc). [Cinq styles — Chromium clair](../recette/preuves/6b.1/styles-chromium-clair.png) · [Cinq styles — Firefox sombre](../recette/preuves/6b.1/styles-firefox-sombre.png) · [Dispositions et transcodage](../recette/preuves/6b.1/layouts-firefox-sombre.png) · [Éditeur partagé et aperçu](../recette/preuves/6b.1/editor-chromium-clair.png).

## 6B.2 — Dimensionnement Lovelace et finitions

**Base `75b6960b` :** même tuile native et même configuration Sections sur les deux frontends HA. En hauteur automatique, le bandeau seul vaut **67,92 px** : bordure HA, `14px` de padding de chaque côté et `12px` de marge sous l’en-tête, y compris sans panneau. Sans hauteur enregistrée, Tracearr annonce quatre lignes et le frontend réserve **248 px** ; la borne minimale de deux lignes limite aussi `grid_options.rows: 1` à **120 px**.

**Contrat Sections :** [API des cartes personnalisées](https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/#sizing-in-the-sections-view), sources de la grille [20250531.2](https://github.com/home-assistant/frontend/blob/20250531.2/src/panels/lovelace/sections/hui-grid-section.ts) et [20261028.8](https://github.com/home-assistant/frontend/blob/20261028.8/src/panels/lovelace/sections/hui-grid-section.ts). Les deux versions fusionnent les valeurs de `getGridOptions()` avec les `grid_options` enregistrées, ces dernières étant prioritaires. Une valeur numérique est un nombre de pistes de hauteur fixe ; `auto` suit le contenu dans une piste intrinsèque. Les deux transmettent `layout = "grid"`. `getCardSize()` renseigne l’équilibrage de Masonry par unités estimées de 50 px, pas la hauteur imposée ni le remplacement dynamique des colonnes. La carte ne demande aucun recalcul de la grille : CSS assure une ligne native minimum pour l’en-tête seul et laisse grandir les contenus plus hauts. Aucun arrondi automatique en multiples de lignes n’est exposé.

**Protocole :** Debian 13.2, Chromium 152.0.7977.82, Core 2025.6.0 / frontend 20250531.2 (Python 3.13.18) puis Core 2026.11.3 / frontend 20261028.8 (Python 3.14.10), un Core à la fois, copies jetables du banc 4.2 sur loopback. Utiliser le compte fictif de [4.2](RECETTE_42.md), le simulateur **sans** `--rotated` et `recette/dashboard_grid.py <version-base|version-after> <chemin-du-module-JS> <dossier-de-preuves>`. Le script enregistre un dashboard de test distinct, vérifie le module reçu par SHA-256 et mesure ses cartes réelles avec Playwright. Ne jamais le pointer vers un HA existant. Le protocole `*-base` reproduit le défaut ; `*-after` vérifie démarrage, arrêt, largeurs, hauteur fixe, avertissement de panne, navigation du carrousel, Masonry et configuration inchangée après les transitions.

**Mesures (identiques sur les deux versions, thème standard) :**

| Cas Sections | Avant | Après |
|---|---:|---:|
| Tuile HA de référence | 56 px · 1 ligne | 56 px · 1 ligne |
| Bandeau seul, titre masqué, `rows: auto` | 67,92 px | **56 px**, même haut que la tuile et écart de centrage < 0,01 px |
| Bandeau seul, titre visible, hauteur non enregistrée | 248 px · 4 lignes | **56 px** · auto, équivalent 1 ligne |
| Badges longs, vue large → étroite | 219,30 px en vue large | 191,30 → 227,14 px, repli sans recouvrement |
| Hauteur explicite de 1 / 2 lignes | 120 / 120 px | 56 / 120 px, défilement interne si nécessaire |
| Message visible / carte masquée | 162,08 / 0 px de carte | 162,08 / 0 px de carte |

Sur la carte auto sans titre, **56 → 337,08 → 679,39 → 56 px** pour 0 → 1 → 3 → 0 lecture. La panne sans lecture laisse l’avertissement visible et porte la carte à **148,98 px**, puis elle revient à 56 px. Le carrousel garde la même hauteur pendant la navigation à jeu de panneaux constant ; l’ajout ou le retrait de panneaux peut changer le contenu le plus haut ou afficher les commandes. Masonry grandit de 67,92 à 265,08 px à l’arrivée d’une lecture, sans changer l’estimation initiale ni forcer un recalcul de ses colonnes. Sections et Masonry éprouvés ; panneau, piles et layouts tiers non rejoués. Sur Core 2025.6, les rejets `recorder/info` proviennent du frontend natif lorsque Recorder est absent de ce banc minimal ; ils sont déjà présents sur la base et distingués des erreurs Tracearr.

**Frontend ciblé :** Node 22.23.5, **92 tests réussis**, syntaxe JS et `git diff --check` valides. `recette/cartes.html?technical-finish` : 9 cas par navigateur/thème sous Chromium 152 et Firefox 140.15 ESR, carte à 250, 320 et 768 px, plus aperçu anglais. Aucun recouvrement ou débordement ; contraste minimal **8,39:1** sur ces échantillons. Descriptions réelles ou statiques selon disponibilité, absence de suffixe source visible et d’une flèche fictive, distinction conservée dans le libellé accessible. Les sondes `?pause-colors`, `?blink`, `?lan-wan`, `?responsive` et `?lifecycle` passent dans les deux moteurs et thèmes. Les 480 cas de 6B.1 et les validations Python/Core antérieures sont réutilisés, pas relancés intégralement.

**Captures du vrai tableau de bord Sections**, frontend 20250531.2 : [avant](../recette/preuves/6b.2/sections-avant.png) · [après](../recette/preuves/6b.2/sections-apres.png) · [lectures actives](../recette/preuves/6b.2/sections-lectures.png).

## 6D.1 — Recette commune et candidat bêta

Voir le [rapport 6D.1](RECETTE_6D1.md) pour la mise à niveau locale depuis `v0.1.17`, les essais Lovelace et la distinction entre contrôles exécutés et preuves réutilisées.

## 6D.4 — Badges de transcodage

**Base publiée `0552d6c4bed298b0955be73300edbae21bf19425`.** La bêta utilisait le même repli sur la source dans les deux modes, même lorsque la piste était transcodée. Elle affichait donc Atmos à côté du véritable AAC en mode Destination uniquement, et séparait Atmos de la transition E-AC-3 → AAC en comparaison. Le moteur corrige la sélection pour toutes les catégories, sans modifier les pistes copiées, les visibilités enregistrées, les styles, le dimensionnement ou le débit. Voir [les règles d’affichage](CONFIGURATION.md#badges-techniques-des-panneaux-de-lecture).

**Contrat amont lu dans les sources officielles.** [`formatActiveStream` v3.2.1](https://github.com/connorgallopo/Tracearr/blob/v3.2.1/apps/server/src/routes/publicV2/streams.ts), partagé avec les [événements complets SSE](https://github.com/connorgallopo/Tracearr/blob/v3.2.1/apps/server/src/routes/publicV2/eventsTranslate.ts), expose déjà décisions, codecs, dimensions source/destination, détails audio imbriqués et conteneurs. Les champs techniques existent aussi dans le sérialiseur v2.7.0 et v3.2.0. `source_audio_details.atmos` qualifie la source, pas AAC ; `stream_audio_details.channels` peut confirmer la stéréo. Les débits de piste, lorsqu’ils sont présents, ne remplacent pas `bitrate`. [Plex](https://github.com/connorgallopo/Tracearr/blob/v3.2.1/apps/server/src/services/mediaServer/plex/parser.ts) peut recopier le HDR source en sortie ; [Jellyfin/Emby](https://github.com/connorgallopo/Tracearr/blob/v3.2.1/apps/server/src/services/mediaServer/shared/jellyfinEmbyUtils.ts) peuvent supposer SDR. Un codec de sortie égal à la source peut aussi être un repli. Ni DV → SDR, ni DV → HDR10, ni HDR10+ → HDR10 ne sont affirmés à partir de ces seuls champs ambigus. L’API n’expose pas de provenance indépendante pour lever l’ambiguïté. L’interface native peut composer ses propres libellés et replis.

**Chaîne HA inchangée.** `snapshot_rows` ne réécrit pas les lignes, les événements complets fusionnent les valeurs fournies, les événements de progression ne modifient pas les caractéristiques techniques et le WebSocket remet les lignes du cache aux cartes. Le mainteneur a déjà constaté AAC sur la bêta réelle. Aucun changement backend, appel privé, ni accès à la production.

**Preuves.** Six tests discriminants en échec sur la bêta, puis 20 tests ciblés (`node --test --test-name-pattern='6B|6D.4|LAN|native' tests/test_carousel.cjs`) réussis sur le correctif. Syntaxe JS et `git diff --check` valides. Chromium : `recette/cartes.html?transcoding`, trois assertions sur quatre en échec avant, quatre sur quatre réussies après (audio et vidéo, deux modes, sans recouvrement ni débordement) ; `?technical-finish` : neuf cas plus aperçu anglais dans chaque thème. Utiliser un serveur HTTP loopback ou ouvrir la page locale. Les validations HA/backend, Sections et la matrice générale de la bêta sont réutilisées ; pas de nouvelle recette HACS, de serveur multimédia réel ni de campagne backend.

Captures sur données fictives : [audio avant](../recette/preuves/6d.4/audio-avant.png), [audio après](../recette/preuves/6d.4/audio-apres.png) et [vidéo après](../recette/preuves/6d.4/video-apres.png).
