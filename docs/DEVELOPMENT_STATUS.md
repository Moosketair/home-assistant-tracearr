# État de reprise — fin de phase 0, 25 novembre 2026

**Prochaine action : présenter les constats au mainteneur et attendre son arbitrage.** Pour reprendre sans historique de conversation : lire [AGENTS.md](../AGENTS.md), puis les anomalies A1–A14 et les limites des tests dans [AUDIT_INITIAL.md](AUDIT_INITIAL.md). Ne pas déduire de la [roadmap](ROADMAP.md) une autorisation de correction.

| Repère | Valeur |
|---|---|
| Dépôt | `Moosketair/home-assistant-tracearr`, copie de travail `/media/fat/proton_drive/dev/home-assistant-tracearr` lors de l’audit |
| Référence fonctionnelle | `main` = tag `v0.1.16` = `443ce3859d09b67ccfd589d326d032753dc11d64` à la date de l’audit |
| Travail local | `audit/reprise-developpement`, un commit documentaire au-dessus de la référence ; retrouver son SHA par `git log -1 --oneline audit/reprise-developpement` |
| Environnement | Debian 13.2 ; suite : Python 3.13.5, Node 22.23.5 ; Core minimum et stable essayés en environnements temporaires séparés |
| Déploiement du mainteneur | HA Container géré par Dockge Enhanced, **non utilisé** ; aucune action distante de publication dans cette phase |
| GitHub à la date de revue | Stable vérifiée sur le bon SHA, deux workflows verts sur ce SHA, une issue musique ouverte, aucune PR ouverte |

**Ce qui est vérifié.** 21 tests Python et 72 JS réussis ; syntaxe Python, manifeste, HACS JSON et JS valides. Contrat Tracearr v3.2.1 lu à la source. Sondes locales sur HA Core 2025.6.0 et 2026.11.3, Chromium et Firefox ESR headless. Premier refresh, `ready` et arrêt nominal des deux tâches fonctionnent. Les premiers correctifs à discuter concernent les abonnés au reload et la perte d’un événement lors d’un refresh concurrent ; le proxy peut aussi servir une image partielle avec HTTP 200. Ne pas confondre ces observations avec des incidents utilisateurs.

**Ce qui reste à établir.** Installation HACS/HA complète, comportement avec de vraies sessions des trois serveurs, performances longue durée, mobile tactile, Safari et thèmes. La compatibilité pré-SSE annoncée n’est pas générale : `/servers` est obligatoire et absent de Tracearr 2.6.0. Les options historiques ne doivent pas être réécrites pour résoudre les problèmes de lecture ou d’édition.

**Où intervenir si un lot est approuvé :** [ARCHITECTURE](ARCHITECTURE.md) pour le flux de données et les fichiers ; [DEVELOPMENT](DEVELOPMENT.md) pour reproduire la base de tests ; [CONFIGURATION](CONFIGURATION.md) pour les réglages publics ; [MAINTENANCE](MAINTENANCE.md) pour une éventuelle publication ultérieure. Avant toute suite, recontrôler `git status --short --branch`, le SHA et l’état distant en lecture seule : cet état est une photographie, pas une référence permanente au dernier upstream.
