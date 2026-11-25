# Développer et valider localement

Lire [AGENTS.md](../AGENTS.md) pour les règles, [ARCHITECTURE](ARCHITECTURE.md) pour les frontières du code et [AUDIT_INITIAL](AUDIT_INITIAL.md) pour les résultats datés. Le projet livre directement `custom_components/tracearr_ha/`, sans build npm. Les dépendances de recette sous `recette/` sont distinctes du `requirements: []` du manifeste.

## Reproduire les contrôles du dépôt

Pour exécuter les versions épinglées, la matrice de vrais Core, le simulateur REST/SSE et les reproductions strictes des P1, suivre [RECETTE](RECETTE.md). Les commandes ci-dessous restent le chemin court pour les seuls tests historiques.

Depuis la racine, sur une branche de travail, avec Python 3.13 et Node 22 :

```bash
git status --short --branch
git rev-parse HEAD
work=$(mktemp -d)
python3 -m venv "$work/venv"
"$work/venv/bin/python" -m pip install pytest aiohttp
PYTHONPYCACHEPREFIX="$work/pycache" "$work/venv/bin/python" -m compileall -q custom_components
"$work/venv/bin/python" -m json.tool custom_components/tracearr_ha/manifest.json >/dev/null
"$work/venv/bin/python" -m json.tool hacs.json >/dev/null
PYTHONDONTWRITEBYTECODE=1 "$work/venv/bin/python" -m pytest -q -p no:cacheprovider tests
node --check custom_components/tracearr_ha/frontend/tracearr-card.js
node --test tests/test_carousel.cjs
git diff --check
git status --short --branch
```

Si `venv` ne fournit pas `pip`, un `uv` déjà disponible peut créer le même environnement (`uv venv --python /usr/bin/python3 "$work/venv"` dans un répertoire neuf, puis `uv pip install --python "$work/venv/bin/python" pytest aiohttp`). Pour retrouver la mesure de phase 0 : pytest **9.2.0**, aiohttp **3.14.5**. Les tests HTTP utilisent un port libre sur `127.0.0.1` ; une sandbox qui interdit les sockets ne permet pas de conclure qu’ils échouent dans HA.

## Valider selon ce qui change

| Changement | Vérification utile en plus de la suite |
|---|---|
| REST, SSE, auth | Servir `/api/v2/public/{streams,servers,events}` sur loopback avec des données factices. Intercaler démarrage/arrêt entre les **deux** GET du snapshot. Tester indisponibilité, `ready` répété, EOF, attente sans données, `Retry-After`, trame sans type, reprise et annulation en cours de lecture. Compter les connexions/tâches après reload. |
| Cycle HA, WS, entités | Utiliser des environnements distincts pour le minimum HACS et la stable HA ciblée, chacun avec un Python supporté et un dossier de config vide. Charger une entrée, souscrire **avant** son reload ; conserver la même connexion logique, vérifier une notification venant du nouveau coordinateur puis le désabonnement. Contrôler ID et nombre d’entités avec deux entrées/deux serveurs. |
| Images | Vérifier accès HA signé et expiration, images absentes et externes, format/type autorisés, corps réparti en plusieurs écritures avec et sans taille annoncée, dépassement en cours de lecture. Avec trois délais de retry, vérifier également la disparition de la session pendant un retry. |
| Options / cartes YAML | Rejouer les configurations précédentes : grille/dimensions, ancienne palette/compteurs, année/saison, `hide_empty`, compte ou appareil hors ligne, `unknown` explicite. Éditer/réouvrir, comparer clés étrangères, options des autres serveurs, alias/avatars et `grid_options`. Distinguer règles par carte des options d’instance. |
| UI / CSS | Dans une page jetable, charger le JS distribué et monter les vrais custom elements avec un payload fictif ; dans un HA de test, vérifier aussi le vrai éditeur, les `ha-entity-picker`, l’enregistrement storage et le YAML manuel. Varier largeur **de carte** (250, 320, 768, 1200 px), un/plusieurs groupes et libellés longs, texte agrandi, thèmes, pause/seek, flux ajoutés/retirés, onglet masqué, navigation clavier avec/sans drag, tactile et mouvement réduit. Comparer les rectangles DOM et vérifier le focus, pas seulement les règles CSS. |
| Traductions | Comparer chemins et placeholders des trois fichiers, ouvrir les flows en français et anglais. Distinguer les textes de l’intégration des textes encore codés en dur dans le frontend. |

**Repère de test, pas environnement de production :** en phase 0, imports et cycle de coordinateur avec Core 2025.6.0 sur CPython isolé 3.13.18 (`pycares<5` pour l’ancien `aiodns`) et Core 2026.11.3 sur CPython isolé 3.14.10. Les essais complémentaires n’appartiennent pas à `pytest`/`node:test`. Utiliser des données synthétiques ; aucun export de `.storage` ni de sauvegarde de production nécessaire.

Pour une évolution validée, noter versions, commandes, résultats et cas non exercés ; examiner les jobs `static`, `validate-hacs` et `hassfest` sur le **SHA concerné**. Pour la distribution, la procédure de référence est [MAINTENANCE](MAINTENANCE.md).
