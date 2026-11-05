# Maintenance de Tracearr HA

Retour au [README](../README.md) · [CHANGELOG](../CHANGELOG.md)

## Publier une mise à jour

Tracearr HA figure dans le catalogue HACS depuis la fusion de [hacs/default#13306](https://github.com/hacs/default/pull/13306). **Aucune nouvelle demande d'ajout au catalogue n'est nécessaire pour publier une mise à jour.**

1. Préparer et tester les modifications sur une branche de développement, avec une version cohérente dans `custom_components/tracearr_ha/manifest.json`, dans le cache de la ressource Lovelace (`frontend.py`) et dans le bandeau du fichier JavaScript.
2. Mettre à jour les notes de version dans `CHANGELOG.md` ; conserver les sections historiques. Résumer seulement les changements principaux dans `README.md`.
3. Faire passer les tests Python, JavaScript, HACS et hassfest via [GitHub Actions](https://github.com/Moosketair/home-assistant-tracearr/actions).
4. Pour publier une version publique, fusionner le code vérifié dans `main` avec un commit intitulé exactement `release: vX.Y.Z`. Le workflow `publish-release.yml` valide à nouveau le dépôt, puis crée le tag et la GitHub Release au même commit.
5. **Vérifier après publication** que le tag et la Release désignent le bon SHA. C'est le tag (et non seulement le champ « Target » de la Release) qui détermine le code téléchargé par HACS.
6. HACS peut mettre un peu de temps à proposer la nouvelle version après la synchronisation des Releases. Redémarrer HA après installation et actualiser la page pour recharger le JS.

Pour une **préversion**, utiliser une branche et un manifeste distincts (ex. `0.1.15b1`), créer le tag sur le bon commit, publier une Release cochée **Pre-release**, puis vérifier le tag avant installation. Les préversions ne remplacent pas automatiquement les Releases stables pour les utilisateurs ne les ayant pas activées.

### Commandes de vérification locale

```bash
python -m compileall -q custom_components
python -m pytest -q tests
node --check custom_components/tracearr_ha/frontend/tracearr-card.js
node --test tests/test_carousel.cjs
```

## Marque, licence et affiliation

Ce projet est sous [licence MIT](../LICENSE), mais n'est ni maintenu ni approuvé par Tracearr, Home Assistant, Plex, Jellyfin ou Emby. Le dépôt Tracearr annonce une licence AGPL-3.0 pour son logiciel : **cette licence ne donne pas automatiquement une autorisation d'utiliser son logo comme identité d'un projet tiers**.

Par prudence, Tracearr HA conserve une icône propre (maison cyan, lecture et progression) dans `custom_components/tracearr_ha/brand/icon.png` et `icon@2x.png`. Aucune utilisation du logo officiel de Tracearr ou Home Assistant n'est revendiquée.

## Icône et affichage dans HACS

Sur les versions de Home Assistant prenant en charge les icônes locales (notamment 2026.3+), l'icône de l'intégration apparaît dans **Paramètres → Appareils et services**. Certaines versions de HACS affichent encore « icon not available », car leur affichage utilise d'autres sources de marques que les icônes locales. Suivi du problème : [hacs/integration#5223](https://github.com/hacs/integration/issues/5223) et [hacs/integration#5402](https://github.com/hacs/integration/issues/5402).

Ne pas ajouter des fichiers ou modifier le nom du domaine dans le seul but de masquer ce symptôme sans comprendre la cause et les exigences officielles de HACS.

## Suivi des évolutions

Les modifications livrées sont consignées dans [CHANGELOG.md](../CHANGELOG.md) et dans les [GitHub Releases](https://github.com/Moosketair/home-assistant-tracearr/releases). Les améliorations futures et les anomalies doivent plutôt être suivies comme [issues GitHub](https://github.com/Moosketair/home-assistant-tracearr/issues) : le README reste un guide d'installation et d'utilisation, pas une liste de tâches.
