# Recette 4.2 — installation et dashboard

**Statut : PARTIEL.** Installation neuve et mise à niveau locales validées dans le vrai frontend ; circuit HACS/Marketplace du candidat différé.

**Candidat local : `v0.1.17-beta.1`.** Manifeste, bandeau JavaScript et clé de cache : `0.1.17-beta.1`. La stable publique reste `v0.1.16` (`443ce3859d09b67ccfd589d326d032753dc11d64`). Base fonctionnelle : `41403f51b665a7e839fe7474ed7edd274fb04b0d`, verdict indépendant 4.1.4 **VALIDÉ**, 14 anomalies sur 14 et réserves acceptées par le mainteneur. Aucun audit antérieur rouvert.

## Installation et distribution

- Home Assistant Core **2026.11.3**, Python **3.14.10**, frontend **20261028.8**, Chromium **152** avec un profil jetable. Un Core à la fois, deux configurations distinctes, serveur Tracearr simulé local. Ni `default_config` ni onboarding des intégrations par défaut : seul le compte de test est créé par HA ; les autres étapes d’onboarding sont marquées terminées hors ligne.
- **Mise à niveau locale :** installation de la stable par extraction de son dossier distribué ; création par les API HA d’une entrée, de deux règles LAN/WAN, de 17 entités et de quatre appareils, personnalisation du nom de l’entrée et d’un capteur, stockage d’un dashboard Sections avec trois cartes et badges personnalisés. Après remplacement du seul dossier distribué et redémarrage sur les données de la stable, les registres de l’entrée, des entités et des appareils sont identiques octet pour octet. Le contenu du dashboard est identique ; le déplacement de `lovelace` à `lovelace.lovelace` est propre à Core et a été observé dès le redémarrage sur la stable. La ressource unique garde le même identifiant et seul `?v=` change.
- **Installation neuve locale :** répertoire sans intégration enregistrée, sans entités Tracearr et sans ressources Lovelace ; seul le paramétrage loopback préparé est fourni. Ajout par le vrai config flow HA et création automatique d’une seule ressource Module JavaScript ; les trois cartes se chargent dans le dashboard synthétique.
- **HACS :** aucun téléchargement ni mise à niveau HACS du candidat. La [distribution HACS historique](https://www.hacs.xyz/docs/use/configuration/basic/) requiert un compte GitHub sur les Core antérieurs ; sur Core 2026.11, [Marketplace remplace HACS](https://www.hacs.xyz/docs/marketplace/). Le catalogue Marketplace peut servir des versions publiques sans jeton, mais ne connaît pas ce candidat non publié : pas d’essai d’installation Marketplace de la stable non plus. La substitution par `git archive` simule uniquement le remplacement des fichiers distribués et le redémarrage HA, pas la sélection de version, le téléchargement, l’intégrité des archives amont ni les statuts du gestionnaire. Différer les essais de bout en bout jusqu’à une éventuelle prépublication explicitement autorisée.
- **Structure et versions :** un seul composant, 18 fichiers suivis dans `custom_components/tracearr_ha`, dont le module sans build, les traductions et les icônes locales. `hacs.json`, seuil HA `2025.6.0`, licence MIT et icônes inchangés ; champs obligatoires contrôlés selon les [règles HACS](https://www.hacs.xyz/docs/publish/integration/). Pas de job HACS, GitHub, tag ou publication. L’ancienne notation `0.1.17b1` passe hassfest mais le comparateur `AwesomeVersion` du Core testé ne la classe pas avant la finale ; `0.1.16 < 0.1.17-beta.1 < 0.1.17` vérifié.

## Résultats dans le véritable frontend

| Contrôle | Résultat |
|---|---|
| Module réellement chargé | Chromium : HTTP 200, URL `?v=0.1.17-beta.1`, bandeau correspondant, SHA-256 `845937e2f9d61ed47b1444287e0dc0d04475ae8e2331418ed4864b3b2499ac24` identique au fichier livré. La stable avait chargé `?v=0.1.16`, avec le SHA-256 distinct `0c2dafa7eeae5f3b028ec36c4a31570714360ac1f298224f71b9d14938b2c7f5`. Profil Chromium réutilisé pour la mise à niveau. |
| Lovelace | Sections : liste, carrousel avec navigation réelle, carte ciblant Alice. Mode ressources stockage et mode ressources YAML avec déclaration manuelle et dashboard YAML (`/tracearr-yaml/recette`), sans écriture en mode YAML dans le registre des ressources de stockage. |
| Débits et badges | En-têtes et panneaux cohérents : LAN 8 Mb/s pour Alice, WAN 2,5 Mb/s pour Bob. Le même badge et la même animation CSS restent en place après l’actualisation. Centrage exact pour un en-tête de 470 px ; décalage d’environ 35 px à 384 px avec badges voisins, sans débordement ni recouvrement. |
| Éditeurs | Modifié, enregistré, rouvert et remis à la valeur d’origine le mode compact pour les deux types. Disposition, sélection de compte, source, débit, badges et clés de dimensionnement conservés. |
| Lecture et panne | Chronomètre actif, gel à la pause, reprise ; coupure du SSE et des deux routes REST : avertissement et gel ; snapshot de retour : avertissement retiré, reprise depuis `0:12`. |
| Réauthentification | Une vraie révocation déclenche le flow natif ; clé erronée refusée, clé de remplacement acceptée, REST/SSE restaurés sur le même ID. Titres, refus et confirmations vus dans les dialogues natifs FR et EN après bascule de langue dans le profil HA. L’automatisation contrôle également le flow et les traductions via les API HA. |
| Console | Aucun événement d’erreur navigateur sur les essais du candidat final. Le journal Core signale l’absence de l’accélération caméra `libturbojpeg`, hors périmètre, et les 503 injectés. Aucun défaut bloquant Tracearr observé. |

Captures uniquement synthétiques : [Sections](../recette/preuves/4.2/sections.png), [panne](../recette/preuves/4.2/panne.png), [éditeur](../recette/preuves/4.2/editeur.png), réauthentification [FR](../recette/preuves/4.2/reauth-fr.png) et [EN](../recette/preuves/4.2/reauth-en.png). [Preuves réseau et mesures](../recette/preuves/4.2/resultats.json).

**Contrôles ciblés :** `pytest -q -p no:cacheprovider tests/test_frontend_registration.py tests/test_translations.py` (7 réussis), `node --check custom_components/tracearr_ha/frontend/tracearr-card.js`, `git diff --check`, et hassfest local avec le script de Core 2026.11.3 (`--action validate --integration-path …/custom_components/tracearr_ha`, 1 intégration, 0 invalide). Campagne antérieure sur `f2db1a5` réutilisée : 22 Python, 81 JS, 106 sur chacun des deux Core, hassfest réussi, aucun échec, skip ni xfail ; correctifs ultérieurs couverts par les contre-audits. Pas de seconde instance/version Core concurrente, de Firefox rejoué (preuves antérieures réutilisées), de nouvelle matrice responsive/thèmes, ni de lecteur physique ou de proxy réel.

## Essais personnels, sans toucher à la production

Depuis l’ordinateur qui héberge ce dépôt, ouvrir **<http://127.0.0.1:18424/lovelace/recette>**. Compte fictif : `recette` / `Tracearr-fixture-only-42!`. Sur un autre ordinateur, accès seulement par transfert local sur une connexion SSH **déjà autorisée** vers l’hôte (ne pas créer de service, de proxy inverse ni d’écoute publique) : `ssh -N -L 127.0.0.1:18424:127.0.0.1:18424 utilisateur@hote`. Utiliser ensuite la même adresse dans Chromium. Le pilotage du simulateur se fait dans un terminal **sur l’hôte**.

Avant de démarrer, `ss -lntp '( sport = :18424 or sport = :18425 )'` doit montrer les deux ports libres. Ne pas arrêter un service étranger au banc. Exécuter **un seul Core de recette à la fois**. Dans deux terminaux, depuis la racine de ce dépôt :

```bash
R=/tmp/opencode/tracearr-42
# Terminal 1 : simulateur
PYTHONDONTWRITEBYTECODE=1 "$R/venv/bin/python" recette/dashboard_sim.py --rotated
```

```bash
R=/tmp/opencode/tracearr-42
# Terminal 2 : Home Assistant
env HOME="$R/home" PYTHONDONTWRITEBYTECODE=1 \
  "$R/venv/bin/hass" --skip-pip -c "$R/final-upgrade"
```

Les deux services doivent écouter uniquement sur `127.0.0.1` (`18424` HA, `18425` simulateur). Arrêt : `Ctrl+C` dans le terminal Core puis dans celui du simulateur, puis revérifier les ports. **À la livraison, les deux processus ont été arrêtés et les ports vérifiés libres.** Le répertoire `/tmp/opencode/tracearr-42` (~1,3 Gio) contient venv, configs fictives, profils Chromium, journaux et preuves ; ce n’est pas une sauvegarde à importer en production. Une purge de `/tmp` peut l’effacer.

Variantes, **Core arrêté** : pour le mode YAML, copier `$R/config-yaml-final.yaml` vers `$R/final-upgrade/configuration.yaml`, démarrer puis ouvrir `/tracearr-yaml/recette` ; restaurer `$R/config-storage.yaml` au même emplacement pour revenir au stockage. Pour l’installation neuve déjà préparée, démarrer avec `-c "$R/fresh"` et ouvrir `/tracearr-recette/recette` ; lancer le simulateur sans `--rotated` pour cette configuration.

Depuis l’hôte, `curl -fsS -X POST http://127.0.0.1:18425/scenario/SCENARIO` :

| Scénario | À observer |
|---|---|
| `reset` | Deux lectures directes : Alice (« Orbite de recette », Plex LAN 8 Mb/s), Bob (« Voyage fictif », Jellyfin WAN 2,5 Mb/s) ; Emby déclaré, inactif. Comparer liste et carrousel, sélection d’Alice, en-tête/panneaux et badges. |
| `progress`, `pause`, `play` | Le badge positif pulse sans recommencer à chaque événement. Progression, gel en pause et reprise. Utiliser les flèches du carrousel et réduire la fenêtre. |
| `down`, puis `recover` | Coupure SSE et HTTP 503 sur REST/SSE ; attendre jusqu’à environ 80 s pour le poll/backoff. Les cartes affichent « données non actualisées » et figent les temps. Après `recover`, le snapshot fiable rétablit les lectures et Alice repart de `0:12`. |
| `revoke` | Inverse les deux clés fictives. Attendre le refus REST, puis ouvrir **Paramètres → Appareils et services → Tracearr HA → Attention requise → Reconfigurer**. Utiliser l’autre clé fictive (`trr_pub_fixture_only` ou `trr_pub_fixture_only_rotated`), jamais une clé réelle. Après l’essai, refaire `revoke` et remettre la clé de départ pour éviter un décalage au redémarrage. Si la clé enregistrée se termine par `_rotated`, démarrer le simulateur avec `--rotated` ; `reset` revient toujours à la clé de démarrage du simulateur. |

En édition du dashboard, ouvrir une carte groupée et l’individuelle. Basculer *Mode compact*, enregistrer, rouvrir et vérifier que le mode de liste/carrousel ou la sélection de compte n’a pas changé. En cas de difficulté de clic sur le contrôle de Sections, lui donner le focus et appuyer sur Entrée. Pour la version, ouvrir **Réseau** dans les outils Chromium puis actualiser : le module doit être `/tracearr_ha/tracearr-card.js?v=0.1.17-beta.1`.

Les scripts de banc (`recette/dashboard_seed.py`, `recette/dashboard_browser.py`, `recette/dashboard_sim.py`) ne sont pas distribués. Pour rejouer le contrôle Chromium non destructif avec le banc démarré :

```bash
R=/tmp/opencode/tracearr-42
env HOME="$R/home" PYTHONDONTWRITEBYTECODE=1 \
  "$R/venv/bin/python" recette/dashboard_browser.py "$R" 0.1.17-beta.1
```
