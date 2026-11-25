# État de reprise — fin de l’étape 1.1, 25 novembre 2026

**Prochaine action : attendre la validation du mainteneur avant toute correction P1.** La phase 0 est validée ; l’étape 1.1 a livré les outils, pas les correctifs. Pour reprendre : lire [AGENTS.md](../AGENTS.md), [RECETTE](RECETTE.md) pour reproduire les tests, puis [l’audit historique](AUDIT_INITIAL.md) pour les A1–A14. La [roadmap](ROADMAP.md) distingue livraison et propositions.

| Repère | Valeur |
|---|---|
| Dépôt | `Moosketair/home-assistant-tracearr`, copie de travail `/media/fat/proton_drive/dev/home-assistant-tracearr` lors de l’audit |
| Référence fonctionnelle | `main` = tag `v0.1.16` = `443ce3859d09b67ccfd589d326d032753dc11d64` à la date de l’audit |
| Travail local | `test/recette-fiabilite`, issue du commit documentaire `659ea79` (`audit/reprise-developpement`) ; SHA de l’étape : `git log -1 --oneline test/recette-fiabilite` |
| Environnement | Debian 13.2 ; suite : Python 3.13.5, Node 22.23.5 ; Core minimum et stable essayés en environnements temporaires séparés |
| Déploiement du mainteneur | HA Container géré par Dockge Enhanced, **non utilisé** ; aucune action distante de publication dans cette phase |
| GitHub à la date de revue | Stable vérifiée sur le bon SHA, deux workflows verts sur ce SHA, une issue musique ouverte, aucune PR ouverte |

**Résultat 1.1.** 21 tests Python et 72 JS de référence réussis. Suite dédiée : sur chacun des Core 2025.6.0 et 2026.11.3, **3 passés, 9 xfail stricts, aucun échec inattendu**. A1 reproduit via socket HA authentifiée et vrai reload de config entry (y compris deux entrées/deux clients, rétention du listener) ; A2 reproduit pour start, stop, progression, pause, reprise et séquence multi-session. Passage de la reconnexion normale avec `ready` et des contrôles de désabonnement/suppression. Page de mesure disponible pour Chromium/Firefox. Aucun changement du code distribué, de la version, du rapport d’audit initial ni des workflows.

**Ce qui reste à établir.** Installation HACS/HA complète, comportement avec de vraies sessions des trois serveurs, performances longue durée, mobile tactile, Safari et thèmes. La compatibilité pré-SSE annoncée n’est pas générale : `/servers` est obligatoire et absent de Tracearr 2.6.0. Les options historiques ne doivent pas être réécrites pour résoudre les problèmes de lecture ou d’édition.

**Où intervenir si un lot est approuvé :** [ARCHITECTURE](ARCHITECTURE.md) pour le flux de données et les fichiers ; [DEVELOPMENT](DEVELOPMENT.md) pour reproduire la base de tests ; [CONFIGURATION](CONFIGURATION.md) pour les réglages publics ; [MAINTENANCE](MAINTENANCE.md) pour une éventuelle publication ultérieure. Avant toute suite, recontrôler `git status --short --branch`, le SHA et l’état distant en lecture seule : cet état est une photographie, pas une référence permanente au dernier upstream.
