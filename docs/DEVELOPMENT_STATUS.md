# État de reprise — recette locale 4.2

**Lot 4.1 définitivement clôturé.** Verdict indépendant 4.1.4 **VALIDÉ** sur `41403f51b665a7e839fe7474ed7edd274fb04b0d`, confirmé par le mainteneur : **14 anomalies sur 14 validées**, dont A9. Les réserves déjà documentées sont acceptées. Le mainteneur a autorisé le lot 4.2 uniquement : candidat local et recette, sans publication.

**2A définitivement validée** sur `942de6ffa8d33b0ee10319fa39938c3f587f35aa`. **2B définitivement clôturée** : verdict indépendant 2B.4 **VALIDÉ** sur `f918150fd8fc6fa6f44d309aac3d4387d063d83b`, confirmé par le mainteneur. Les deux régressions relevées par 2B.2 sont corrigées ; les limites d’ordre faute de révision commune REST/SSE sont acceptées. Résultats indépendants : 21 Python, 72 JS, 61 sur chacun des Core 2025.6.0 et 2026.11.3, aucun échec, skip ou xfail. Aucun nouvel audit 2B requis.

**2C définitivement clôturée** sur `8e63524a972e739d4ad0c92527e8ed2d962526bc` (`fix/sse-image-robustness`) : le contre-audit 2C.2 a conclu **VALIDÉ AVEC RÉSERVES NON BLOQUANTES**, verdict accepté par le mainteneur. L’exception interne SSE non journalisée a depuis été traitée en 3.1. Restent l’arrondi accepté du timeout aiohttp et l’absence d’incompatibilité concrète démontrée avec une éventuelle compression imposée par un proxy inverse.

**2D définitivement clôturée** : le mainteneur valide 2D.1 sur `28bef59afbceffe6364c3e508037af6cf935d08d` (`fix/lan-wan-consistency`), sans contre-audit supplémentaire. A6 corrigé dans les deux cartes, sans changement backend ni modification de la priorité LAN/WAN.

**2E définitivement clôturée** sur `b9c5880fe6ed2f2ad6f1b23acb4a5a7c3261e4dd` (`fix/frontend-responsive`), sans contre-audit supplémentaire, par décision du mainteneur. Référence 2E.1 : syntaxe JS valide, 75 tests Node réussis et 78 mesures par exécution sous Chromium et Firefox, en clair et en sombre (largeurs de carte 250, 320, 768, 1200 px). Aucun débordement ni chevauchement après correction, clavier du carrousel corrigé, cohérence LAN/WAN préservée, backend inchangé. Ces résultats sont repris de [RECETTE](RECETTE.md), pas rejoués pour la clôture.

**3.1 définitivement clôturée** sur `fcd3c836e7e3a6b5f9c787c03979a7a400d7a95a` (`fix/frontend-lifecycle-performance`). Le contre-audit 3.2 **VALIDÉ AVEC RÉSERVE NON BLOQUANTE** confirme le nettoyage des horloges et des ressources, l’absence d’accumulation au remontage, la continuité du clignotement et la préservation de la progression, de la pause et du carrousel. Il confirme aussi le diagnostic des exceptions internes SSE, la fermeture du flux et la poursuite du polling REST. Réserve acceptée : si une session disparaît entièrement d’un snapshot puis revient avec une position source ancienne, le compteur peut reculer temporairement. Une session simplement filtrée n’est pas concernée. Examen futur en [6A](ROADMAP.md#lot-6a--affichage-en-pause-et-couleurs-des-badges) ; aucun changement en 3B.1.

**3B.1 validée par le mainteneur** sur `112ce00d517bd9c5b9efb1bf60b7a7fb70d1a7c3` (voir les [preuves 3B.1](RECETTE.md#3b1--consolidation-finale)). La validation finale d’A7, A8, A13 et A14 est acquise depuis l’audit 4.1.

**3B.2 livré localement** sur `f2db1a5dded2a2a2bbc41c6d08646bcaf974a0e7`. La décision sur le gel et la reprise des cartes est inchangée (voir les [preuves 3B.2](RECETTE.md#3b2--indisponibilité-des-lectures-a10)).

**Historique 4.1.** L’audit initial avait refusé la validation pour A9/A10 ; 4.1.2 a validé A10 sur `b8908c2aacc6d22b6708af7e9c9c12014c6dbd1d` et isolé une dernière course A9. Corrigée en 4.1.3, celle-ci a été validée en 4.1.4. Voir la [recette 4.1.3](RECETTE.md#413--course-entre-réauthentification-et-suppression-a9).

| Repère | Valeur |
|---|---|
| Dépôt | `Moosketair/home-assistant-tracearr`, copie de travail `/media/fat/proton_drive/dev/home-assistant-tracearr` lors de l’audit |
| Référence fonctionnelle | `main` = tag `v0.1.16` = `443ce3859d09b67ccfd589d326d032753dc11d64` à la date de l’audit |
| Travail local | `release/v0.1.17`, issue du SHA 4.1.4 validé ; candidat `v0.1.17-beta.1` (`0.1.17-beta.1` dans HA) |
| Environnement | 4.1.3 : Debian, CPython 3.13.5 hors HA, banc isolé Core 2025.6.0 (3.13.18) et 2026.11.3 (3.14.10) ; aucun HA de production. |
| Déploiement du mainteneur | HA Container géré par Dockge Enhanced, **non utilisé** ; aucune action distante de publication dans cette phase |
| GitHub à la date de revue | Stable vérifiée sur le bon SHA, deux workflows verts sur ce SHA, une issue musique ouverte, aucune PR ouverte |

**Historique 2B.3.** Mutations normalisées par champ, placeholders SSE de la jointure exclus, remplacement de l'incarnation après stop/start. Un 503 REST ne baisse pas la confirmation d'un flux SSE ouvert ni ne devient un succès HA lors d'une notification. **Six tests discriminants : 6 échecs sur le parent → 6 succès sur chaque Core.** Détails dans [RECETTE](RECETTE.md) ; [ARCHITECTURE](ARCHITECTURE.md) documente la fusion, les états et les limites d'ordre/saturation. Version publique v0.1.16 inchangée.

**Historique 2B.1 (parent validé `942de6f`).** P1-B corrigé par superpositions de mutations limitées au refresh en cours ; SSE reste immédiat et le producteur REST traite polling et demandes `ready`. Requêtes en vol annulées/attendues au retrait. Les six défauts ont été reproduits avant correction sur chaque Core ; 20 tests discriminants échouent sur le parent, les quatre contrôles comparés restent verts. Résultat : **21 Python + 72 JS ; 55 réussites sur Core 2025.6.0 et 55 sur Core 2026.11.3**, sans xfail/skip. Capteurs HA, snapshots WS, deux entrées, reconnexion, annulation, reload et nettoyage éprouvés.

**Livraison locale 2A.5 (parent `d51ce475`).** Un rollback refusé conserve sous l’entrée la génération inactive et les seuls domaines non confirmés. Avant un nouveau setup ou à la suppression définitive, Tracearr retente ce nettoyage sous le verrou HA. Le dispatcher et le contrat WS ne changent pas. Les six tests discriminants échouent sur le parent et passent après correction sur les deux Core. Les trois réserves hors périmètre sont consignées dans [RECETTE](RECETTE.md). Aucune publication.

**Livraison locale 2A.3 (parent `20b2901`).** Le dispatcher est conservé. `EntryGeneration` centralise retrait, callbacks, plateformes réellement allouées et arrêt des producteurs. B1 : `async_remove_entry` clôt la génération si HA retire l’entrée malgré un refus d’unload. B2 : première synchro, publication, forwarding, démarrage et options partagent un rollback attendu malgré l’annulation. B3 : forwarding par plateforme et déchargement public de la plateforme partielle ; le capteur garde ses identifiants et reflète à nouveau le total WS. Les trois familles ont été reproduites sur les deux Core avant correction. **21 tests Python + 72 JS historiques réussis ; 23 réussis et les mêmes 6 xfail A2 sur chaque Core**. Voir [RECETTE](RECETTE.md) pour les injections, limites de Core en cas de refus/erreur et avertissements. Aucune publication.

**Résultat 1.1.** 21 tests Python et 72 JS de référence réussis. Suite dédiée : sur chacun des Core 2025.6.0 et 2026.11.3, **3 passés, 9 xfail stricts, aucun échec inattendu**. A1 reproduit via socket HA authentifiée et vrai reload de config entry (y compris deux entrées/deux clients, rétention du listener) ; A2 reproduit pour start, stop, progression, pause, reprise et séquence multi-session. Passage de la reconnexion normale avec `ready` et des contrôles de désabonnement/suppression. Page de mesure disponible pour Chromium/Firefox. Aucun changement du code distribué, de la version, du rapport d’audit initial ni des workflows.

**Changement 2A.1.** Un abonné WS écoute désormais le domaine. Un relais par entrée alimente ce signal à partir des notifications existantes ; retrait et remplacement d’entrée sont visibles même sans trafic d’une autre entrée. Le code des producteurs REST/SSE, les entités, le JS et les configurations restent ceux de la stable. Le contre-audit doit notamment vérifier les notifications aux frontières du reload, le rejet des sources retirées et la libération des listeners sur déconnexion. Les trois xfail A1 sont devenus des tests ordinaires et six scénarios ont été ajoutés. Résultat final : **21 Python et 72 JS historiques réussis ; 12 réussis et 6 xfail stricts A2 sur chaque Core**, sans échec inattendu.

## État des 14 anomalies après clôture du lot 4.1

| Anomalie | État | Preuve ou décision |
|---|---|---|
| A1 — abonnement WS perdu au reload | Corrigée et validée | 2A, socket existante et remplacement de génération. |
| A2 — écrasement d’une mutation SSE par REST | Corrigée et validée | 2B, contre-audit 2B.4 ; limites d’ordre et de saturation dans [ARCHITECTURE](ARCHITECTURE.md). |
| A3 — réponse image tronquée | Corrigée et validée | 2C, lecture bornée jusqu’à EOF. |
| A4 — tâche SSE arrêtée par une trame atypique | Corrigée et validée | 2C, filtrage ; diagnostic des pannes internes résiduelles validé en 3.1. |
| A5 — rétention des ressources et horloges | Corrigée et validée | 3.2, réserve non bloquante sur disparition puis retour d’une session. |
| A6 — débit périmé après changement des règles réseau | Corrigée et validée | 2D, cohérence des deux cartes sans reload. |
| A7 — JSON refusant `unknown` | Corrigée et validée | 3B.1 puis 4.1 ; aucune migration. |
| A8 — compatibilité REST annoncée trop largement | Corrigée en documentation et validée | 4.1 : `/streams` et `/servers` requis ; Tracearr 2.6.0 exclu, sans revendication de test runtime sur 2.7.0. |
| A9 — clé révoquée non remplaçable en place | Corrigée et définitivement validée | 4.1.4 : aucun enregistrement sur snapshot inexploitable, flow interrompu ou suppression concurrente ; si l’entrée subsiste après un unload refusé, la nouvelle clé validée est sauvegardée pour le prochain redémarrage. |
| A10 — lecture périmée encore présentée comme active | Corrigée et définitivement validée | 4.1.2 : données SSE récentes, WS multi-entrées et états périmés préservés ; aucun changement en 4.1.3. |
| A11 — débordement de badges | Corrigée et validée | 2E, matrice de largeurs, thèmes et moteurs. |
| A12 — clavier dépendant du glissement souris | Corrigée et validée | 2E, flèches clavier en focus indépendantes du drag. |
| A13 — exemple de compte individuel trompeur | Corrigée en documentation et validée | 4.1 : `server_id:username` ; aucune réécriture YAML. |
| A14 — dimensions d’icône historiques inexactes | Corrigée en documentation et validée | 4.1 : deux PNG identiques de 1254 × 1254 ; aucun défaut HACS établi ni changement de marque. |

Aucune des six anomalies reprises n’a disparu indirectement. Les réserves 2A (durée du nettoyage, annulation d’un unload ordinaire, rétention temporaire par l’ancien Core) restent dans [RECETTE](RECETTE.md). Les réserves 2B, 2C et 3.2 restent tracées, sans réouverture des lots validés.

**Suite :** essais personnels du mainteneur après la [recette 4.2](RECETTE_42.md), puis décision explicite avant toute publication ou évolution 6A/6B/6C.

**Où intervenir si un lot est approuvé :** [ARCHITECTURE](ARCHITECTURE.md) pour le flux de données et les fichiers ; [DEVELOPMENT](DEVELOPMENT.md) pour reproduire la base de tests ; [CONFIGURATION](CONFIGURATION.md) pour les réglages publics ; [MAINTENANCE](MAINTENANCE.md) pour une éventuelle publication ultérieure. Avant toute suite, recontrôler `git status --short --branch`, le SHA et l’état distant en lecture seule : cet état est une photographie, pas une référence permanente au dernier upstream.
