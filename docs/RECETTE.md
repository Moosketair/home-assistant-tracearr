# Recette locale de fiabilité

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

1. Comparer les largeurs **de carte** 250/320/768/1200 px. Deux colonnes demandées donnent **1/1/2/2**. Relever l’écart de centrage court et le débordement des bords des badges longs ; les pixels exacts dépendent de la police. Sur cette page à 320 px, débordement droit mesuré : **137 px Chromium / 138 px Firefox 140.15.0esr**.
2. Basculer groupée/individuelle, liste/carrousel ; avancer avec les flèches. Observer le compteur puis mettre en pause/reprendre : l’écoulé de la première session doit se figer/repartir. Basculer le libellé et la largeur sans recharger la page.
3. Démonter/remonter plusieurs fois ; vérifier visuellement l’absence de panneaux dupliqués, le retour du flux et, dans les outils de développement du navigateur, le nombre de timers/écouteurs si cette partie est modifiée. La page ne constitue pas une assertion automatique sur la mémoire.

**Limites.** Les preuves P1 portent sur le code publié avec un vrai backend Core et un réseau local simulé. Le banc ne valide pas d’installation HACS, de vrai dashboard HA, de lecteur physique Plex/Jellyfin/Emby, de débit Internet, de proxy inverse, de permissions multi-utilisateurs en production, ni d’iOS/Android. Il n’implémente pas l’ensemble de l’API Tracearr, ni son stockage, sa cadence de heartbeat ou ses quotas réels. La sonde frontend ne charge pas le sélecteur d’entités de HA. Pour la suite, garder ces essais rapides, puis compléter par un environnement de prépublication distinct selon les changements.
