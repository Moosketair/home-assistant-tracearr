# Historique des versions

Les changements sont classés par version publique. Les préversions et les anciennes notes restent consultables ci-dessous. Les [GitHub Releases](https://github.com/Moosketair/home-assistant-tracearr/releases) permettent de télécharger une version précise.

## Non publié

- Les badges des pistes transcodées n’affichent plus de caractéristiques source comme des destinations confirmées. La comparaison regroupe format et codec audio quand les deux sont visibles (par ex. ATMOS → AAC), et le style Technique utilise des libellés secondaires plus courts.

## 0.1.18-beta.1 — Préversion de test

Cette bêta est destinée aux essais volontaires. **La version stable recommandée reste `v0.1.17`.**

- Les deux cartes gardent le temps restant à gauche et affichent « En pause » à droite à la place de l’heure de fin, recalculée à la reprise.
- La couleur normale des badges du bandeau peut être réglée badge par badge, indépendamment de la couleur à zéro, avec retour possible à la palette d’origine.
- Les panneaux proposent cinq styles de badges techniques : **Classique**, **Premium**, **Cinéma**, **Minimaliste** et **Technique**. Le style **Classique reste le défaut** pour préserver l’apparence des configurations existantes.
- L’éditeur permet de prévisualiser la disposition compacte ou séparée et de régler les couleurs par format, la visibilité et l’ordre des informations. Pour un transcodage, affichez la destination seule ou la comparaison source → destination, selon les données disponibles.
- Dans Sections, les cartes s’ajustent désormais à leur contenu par défaut. Un bandeau seul tient sur une ligne native quand son contenu le permet, sans modifier les tailles de carte enregistrées.
- Le style Technique ajoute de courtes descriptions de formats. Si la destination est inconnue, la valeur source est affichée sans suffixe ni flèche ; la précision reste disponible dans l’infobulle.
- Le README et le guide utilisateur sont réorganisés : aperçus des cartes, installation, compatibilité et exemples de configuration plus faciles à retrouver.

### Installer la bêta ou revenir à la stable

1. Faites une sauvegarde Home Assistant. Dans **HACS → Tracearr HA**, actualisez les informations du dépôt si la bêta n’apparaît pas et activez l’affichage des préversions si l’option est proposée.
2. Choisissez **Télécharger** ou **Retélécharger**, puis sélectionnez exactement `v0.1.18-beta.1`. Redémarrez Home Assistant et actualisez le tableau de bord ; ne recréez ni l’entrée ni les cartes. En stockage, la ressource Lovelace existante est actualisée automatiquement. En mode ressources YAML, remplacez son URL par `/tracearr_ha/tracearr-card.js?v=0.1.18-beta.1`.
3. Pour revenir à **`v0.1.17`**, retéléchargez cette version depuis le même sélecteur, redémarrez Home Assistant, puis actualisez le tableau de bord. En YAML, restaurez `?v=0.1.17`. Désactivez l’affichage des préversions si vous ne souhaitez plus les tester.

## 0.1.17 — 2026-11-26

- Les cartes reçoivent à nouveau les mises à jour WebSocket après le rechargement d’une entrée. Le flux SSE tolère les trames atypiques et la récupération REST prend le relais si le flux cesse de fonctionner.
- Un rafraîchissement REST préserve les changements SSE reçus en parallèle. Une réponse REST inexploitable ne remplace pas le dernier état fiable. Le proxy d’images attend le contenu complet avant de le servir.
- En cas de refus de la clé API, Home Assistant permet de la remplacer sans recréer l’intégration, ni perdre ses entités ou options. La nouvelle clé est vérifiée avant d’être enregistrée.
- Lors d’une panne complète de Tracearr, les cartes signalent les données périmées et figent les temps de lecture jusqu’au prochain snapshot fiable.
- Les en-têtes et les panneaux affichent des débits LAN/WAN cohérents, sans déplacer le carrousel. L’éditeur JSON conserve les règles « Non classé ».
- Les badges sont plus lisibles sur les cartes étroites et leur clignotement ne redémarre plus à chaque mise à jour. Le carrousel se pilote au clavier ; les cartes nettoient les abonnements et horloges inutilisés.
- La documentation précise les routes de l’API Tracearr nécessaires et le ciblage d’un compte dans la carte individuelle.

**Mise à jour :** installez `v0.1.17` via HACS, puis redémarrez Home Assistant et actualisez le dashboard. Ne recréez ni l’entrée ni les cartes. En mode Lovelace stockage, la ressource existante est actualisée automatiquement ; en mode YAML, utilisez `/tracearr_ha/tracearr-card.js?v=0.1.17`, y compris si vous venez de la bêta.

## 0.1.17-beta.1 — Préversion de test

Cette bêta est destinée à valider l’installation et la mise à niveau via HACS. **La version recommandée hors test reste `v0.1.16`.**

### Ce qui change depuis `v0.1.16`

- **Connexions plus fiables :** les cartes continuent de recevoir les mises à jour WebSocket après rechargement d’une entrée. Les trames SSE atypiques ne coupent plus le flux ; si le flux cesse de fonctionner, la récupération REST continue.
- **Données REST/SSE cohérentes :** un rafraîchissement REST n’écrase plus les changements SSE reçus pendant ce rafraîchissement. Une réponse REST inexploitable ne remplace pas les données valides.
- **Images :** le proxy attend l’image complète avant de la servir, au lieu de livrer un contenu tronqué.
- **Réauthentification native :** si la clé API est refusée, Home Assistant permet de la remplacer sans recréer l’intégration ni perdre ses entités ou options. La clé de remplacement est vérifiée sur un snapshot exploitable avant son enregistrement.
- **Panne complète de Tracearr :** les cartes signalent que les données sont périmées et figent les temps de lecture, puis reprennent à partir du prochain snapshot fiable.
- **Débits LAN/WAN :** en-têtes et panneaux se mettent à jour ensemble, sans déplacer le carrousel. L’éditeur JSON conserve les règles « Non classé ».
- **Cartes et badges :** meilleure adaptation aux cartes étroites, navigation du carrousel au clavier, clignotement continu pendant les mises à jour et nettoyage des horloges et abonnements inutilisés.
- **Documentation :** routes requises de l’API Tracearr et sélection d’un compte dans une carte individuelle clarifiées.

### Installer ou revenir à la stable

1. Faites une sauvegarde Home Assistant. Dans **HACS → Tracearr HA**, ouvrez le menu **⋮** et sélectionnez **Mettre à jour les informations** si la bêta n’apparaît pas. Activez l’affichage des versions bêta sur cette fiche si l’option est proposée.
2. Choisissez **Télécharger** ou **Retélécharger**, puis sélectionnez précisément `v0.1.17-beta.1` dans le sélecteur de versions. Redémarrez Home Assistant, puis actualisez le tableau de bord. En mode ressources Lovelace YAML, remplacez manuellement la clé de cache par `?v=0.1.17-beta.1`. En mode stockage, la ressource existante est actualisée automatiquement.
3. Pour **revenir à `v0.1.16`**, retéléchargez cette version via le même sélecteur, sans supprimer l’entrée Tracearr. Redémarrez Home Assistant et actualisez le tableau de bord ; en mode ressources YAML, restaurez `?v=0.1.16`. Désactivez ensuite l’affichage des bêtas si vous ne souhaitez plus les tester.

## 0.1.16 — 2026-11-05

- Badge centré à largeur intrinsèque : la colonne du centre utilise `max-content` plutôt qu'un tiers fixe de l'en-tête ; les deux colonnes latérales se partagent le reste, conservant le badge au milieu.
- Suppression du passage systématique du groupe central sur une seconde ligne sous 440 px. Sur les cartes très étroites (moins de 260 px), un retour à la ligne reste possible pour conserver la lisibilité.
- Aucun changement des réglages enregistrés ; tests de régression responsive ajoutés.

## 0.1.15 — 2026-11-05

- Correction de l'alignement central des badges : trois colonnes de largeur égale lorsque le centre est utilisé, avec badge central étiré et contenu centré.
- Sur les écrans étroits, le groupe central dispose d'une ligne centrée tandis que les groupes gauche/droite conservent leur disposition compacte.
- Aucun changement des réglages enregistrés ; les personnalisations et anciennes cartes restent compatibles.

## 0.1.14 — 2026-11-05

### Affichage et personnalisation

- Fond « cinéma » utilisant l'affiche floutée derrière chaque lecture, avec intensité et assombrissement réglables. Repli vers un fond sombre si l'affiche manque.
- Liseré coloré suivant les angles arrondis de la sous-carte, avec épaisseur réglable, ancien trait droit ou masquage.
- Taille des affiches configurable entre 50 et 200 % dans les cartes groupées et individuelles, mode compact inclus.
- Alignement indépendant **gauche, centre ou droite** de chaque badge Tracearr et Home Assistant ; aucun espace réservé aux groupes vides sur mobile.
- Personnalisation de chaque statistique Tracearr (nom, icône, affichage à zéro, clignotement, durée et couleur), en complément des paramètres globaux.

### Images et fiabilité

- Application immédiate des URL signées aux affiches, sans reconstruire le carrousel.
- Jusqu'à trois nouvelles tentatives après un échec de chargement (2 s, 5 s, 15 s), avec élément de remplacement.
- Proxy d'images amélioré : négociation des formats, délai porté à 20 s, taille maximale de 8 Mo et contrôle du type de contenu.
- Configurations existantes conservées par défaut et ajout de tests de non-régression.

## Préversions de 0.1.14 — historique conservé

### 0.1.14b4 — 2026-11-05

- Préversion validée avec l'alignement mobile corrigé et toutes les options de personnalisation de b2.
- Nouvelle branche/tag créés pour éviter la mauvaise cible Git du tag b3.

### 0.1.14b3 — 2026-11-05

- Correction prévue : supprimer les colonnes de badges vides et éviter deux lignes inutiles sur mobile.
- **Incident de publication :** le tag Git publié `v0.1.14b3` pointait par erreur vers le code de b1. La correction effective a été publiée dans b4.

### 0.1.14b2 — 2026-11-05

- Alignement par badge (statistique ou entité HA), séparément à gauche, au centre ou à droite.
- Nouveaux réglages par statistique : nom, icône, masquage si valeur nulle, clignotement et couleur à zéro.

### 0.1.14b1 / préparation initiale de 0.1.14 — 2026-11-05

- Fond cinéma flouté, liseré arrondi, taille des affiches et renforcement de leur chargement.
- Alignement automatique des badges à gauche lorsque le titre est masqué.

## 0.1.13 Alpha (2026-11-04)

- Déplacement du choix Liste/Carrousel dans « Affichage général » pour la carte groupée ; suppression de la catégorie autonome « Disposition ».
- Dans « En-tête et badges → Statistiques Tracearr », retour à de simples cases à cocher pour chaque compteur, sans sous-panneau individuel.
- Aucune modification des valeurs sauvegardées, des autres sections, des capteurs ou de l’icône existante.

## 0.1.12 Alpha (2026-11-04)

- Sélection visuelle du flux de la carte individuelle : session active, utilisateur, serveur, ou lecture la plus récente. La sélection utilisateur reste valable pour les prochaines lectures.
- Suppression du mode grille adaptative (migration automatique des cartes existantes vers la liste verticale).
- Suppression des réglages de taille dans l'éditeur : largeur/hauteur pilotées exclusivement par la mise en page native de Home Assistant Sections.
- Formulaires groupés pour les localisations LAN/WAN par appareil et pour les alias utilisateur ; les valeurs précédemment enregistrées sont automatiquement préremplies et conservées.
- Récupération facultative de jusqu'à 500 lectures historiques pour identifier également les appareils inactifs, en plus des appareils actifs et déjà configurés.
- Éditeur Lovelace réorganisé avec une catégorie Affichage général et des panneaux repliables par badge/compteur dans l'en-tête.
- Aucune modification de l'icône validée, des réglages existants d'avatars ni des capteurs API.

## 0.1.11 Alpha (2026-11-04)

- Remplacement de l’icône locale de l’intégration par la variante minimaliste validée : maison cyan, bouton lecture et barre de progression. Précision : les deux fichiers livrés (`icon.png` et `icon@2x.png`) sont identiques et mesurent 1254 × 1254 pixels.
- Pas de reprise du logo officiel Tracearr ni du logo protégé Home Assistant.
- Documentation du problème connu HACS : absence d’icône dans les listes HACS malgré son affichage dans les intégrations Home Assistant.
- Mise à jour de la version et du chargement des ressources. Aucun changement fonctionnel à l’API ni aux cartes.

## 0.1.10 Alpha (2026-11-04)

- Chronomètre : « temps écoulé / temps restant » regroupés à gauche ; « Fin à HH:mm » aligné à droite.
- L'état « En pause » reste visible à côté du temps écoulé ; pas d'heure de fin estimée tant que la lecture est en pause.
- Ajout des validations HACS et hassfest à GitHub Actions, pour préparer une candidature au catalogue HACS.
- Conservation de l'icône indépendante pour le moment : le logo officiel de Tracearr nécessitera une vérification des droits de réutilisation et des marques.

# Historique des versions

## 0.1.8 — Alpha (2026-11-03)

- Horloges écoulée/restante calculées à partir du même nombre entier de secondes, sur une seule mise à jour, pour supprimer les décalages d’arrondi.
- Heure de fin de lecture estimée (HH:mm), masquée lors des pauses et activable indépendamment de la barre.
- Nouvelles icônes originales de clap vidéo et haut-parleur, sans reprendre les fichiers graphiques soumis à attribution.
- Badges d’en-tête : masquage des valeurs à zéro, clignotement au-dessus de zéro avec période réglable, couleur spécifique à zéro et affichage des noms facultatif.
- Par badge d’entité Home Assistant : icône du capteur, nom facultatif, visibilité si valeur positive, animation, durée et couleur à zéro personnalisable.
- Respect de `prefers-reduced-motion` pour ne pas imposer le clignotement.


## 0.1.7 — Alpha (2026-11-03)

- Séparation des interrupteurs « Afficher la saison » et « Afficher le numéro d’épisode », avec maintien de l'ordre personnalisable et des formats `S01E02` / `Saison 1 · Épisode 2`. Compatibilité avec l'ancien réglage `series_show_season_episode`.
- Filtre des badges de débit et du total de débit : Tous, Local ou Distant. La classification s’appuie sur des correspondances explicitement saisies pour les comptes/appareils, car Tracearr v2 ne fournit pas les IP ni le statut LAN/WAN dans `/streams`.
- Badges d’en-tête liés à des entités Home Assistant arbitraires, avec sélecteur natif, nom facultatif, valeur et unité actualisées en direct, jusqu'à 20 badges par carte. Une mise à jour d'un capteur ne reconstruit pas le carrousel.
- Trois comportements en l’absence de flux : message personnalisable, en-tête seul, ou carte complètement masquée. Conservation de l’ancien `hide_empty`.
- Tests JavaScript de migration, affichage et ordre des épisodes, compteurs Home Assistant, réseau non classé, mise à jour du bandeau et états vides.


## 0.1.6 — Alpha (2026-11-03)

- Options séparées pour les titres et les années des films et des séries, le titre de l’épisode et la saison/numéro d’épisode.
- Choix du format de saison/épisode : `S01E02` ou `Saison 1 · Épisode 2`.
- Ordre libre des informations (année incluse) par boutons haut/bas dans l’éditeur graphique, séparément pour films et séries.
- Couleur indépendante des badges de l’en-tête : palette commune, thème Home Assistant, couleurs Plex/Jellyfin/Emby ou couleur personnalisée, avec contraste automatique.
- Correction des changements brusques du carrousel lors de mises à jour SSE des états, débits et métadonnées : mise à jour des cartes en place, sans interrompre le défilement du conteneur.
- Conservation de la lecture affichée si la liste change et que ce flux existe toujours ; intervalle de défilement réinitialisé après les navigations manuelles.
- Nouveaux tests de non-régression pour les ordres, les filtres de visibilité, la palette des badges et la stabilité du carrousel.

## 0.1.5 — Alpha (2026-11-03)

- Correction des oscillations des temps de lecture et du temps restant observées dans les cartes : les positions SSE légèrement en retard ne réinitialisent plus l’horloge toutes les deux secondes.
- Horloge monotone locale pour l’animation à 250 ms, avec synchronisation douce (200 ms maximum par nouvel échantillon), sans retour en arrière durant une lecture normale.
- Détection des déplacements volontaires dans le film (avance/retour de plusieurs secondes) : synchronisation immédiate de la nouvelle position.
- Les reconstructions de la carte préservent l’horloge de chaque session ; mise en pause fige les compteurs et reprise les relance.
- Tests de non-régression avec échantillons SSE irréguliers, mise en pause/reprise et sauts volontaires.


## 0.1.4 — Alpha (2026-11-03)

- Restauration du cadre extérieur natif `ha-card` : fond, bordure, rayon et ombre pilotés par le thème Home Assistant. Les panneaux intérieurs conservent un fond légèrement contrasté, ou transparent au choix.
- Bandeau d’en-tête entièrement désactivable, titre personnalisable et statistiques activables séparément : total des flux, débit total, lectures directes, en pause, transcodage vidéo seul/audio seul/les deux, total des transcodages et nombre de flux par serveur.
- Les statistiques d’en-tête correspondent aux flux réellement affichés après application des filtres, y compris pour les vues d’un seul utilisateur.
- Couleur commune pour la progression, les badges de résolution/débit et les statistiques : thème HA, couleur Plex/Jellyfin/Emby ou couleur hexadécimale personnalisée. Choix automatique de l’écriture blanche ou noire pour maximiser le contraste.
- Affiches centrées verticalement même lorsque le pied d’informations occupe plusieurs lignes ; correction d’une puce de séparation inutile si les codecs sont absents.
- Éditeur visuel regroupé dans des catégories repliables : En-tête et statistiques, Disposition et dimensions, Navigation et carrousel, Contenu de la lecture, Bandeau d’informations du flux, Apparence et couleurs, Filtres et tri, Noms et avatars.
- Migration des anciens réglages `show_counter`, `show_transcodes`, `progress_color_mode`, `progress_custom_color` pour préserver les dashboards existants.
- Nouveaux tests sur le contraste, les métriques, les anciennes configurations, le style de la carte et le regroupement de l’éditeur.

## 0.1.3 — Alpha (2026-11-03)

- Barre de défilement horizontale masquée de façon permanente dans le carrousel.
- Boutons de navigation affichables ou masquables, sans désactiver le glissement tactile.
- Navigation au cliquer-glisser à la souris et au clavier ; option pour désactiver le glissement souris.
- Deux icônes séparées (vidéo et audio) : vert pour lecture directe, orange pour transcodage, gris si indéterminé. Les anciens badges textuels de transcodage par flux disparaissent.
- Lecture en pause : symbole de pause sur l'affiche, « En pause » orange à la place du temps restant, sans assombrir toute la carte.
- Fond des cartes transparent, informations en blanc, taille des polices personnalisable (10 à 28 px).
- Couleur de progression au choix : thème Home Assistant, couleur de serveur ou couleur personnalisée (validation hexadécimale).
- Mise à disposition d'une hauteur explicite et de limites de taille pour permettre le redimensionnement vertical natif dans les dashboards Sections ; la grille native est prioritaire sur la hauteur CSS.
- Tests supplémentaires sur les couleurs, états de pause, dimensionnement et navigation.

## 0.1.2 — Alpha (2026-11-03)

- Correction du défilement automatique : les flux avancent dans l'ordre et reviennent au premier après le dernier, même en cas de mises à jour SSE fréquentes.
- Conservation de la position du carrousel quand seule la progression d'un média change.
- Ajout d'une durée de transition réglable (100 à 3000 ms).
- Ajout de cinq effets : glissement, fondu, zoom, retournement 3D et sans animation.
- Ajout d'un réglage pour masquer la barre de défilement horizontale du carrousel.
- Liseré de couleur adapté au serveur : Plex (jaune/orange), Jellyfin (violet), Emby (vert).
- Documentation GitHub entièrement en français.
- Nouveaux tests JavaScript de navigation, d'animation, de couleurs et d'affichage.

## 0.1.1 — Alpha (2026-11-03)

- Correction du démarrage sur les versions récentes de Home Assistant (`LovelaceData.resource_mode` au lieu de `mode`).
- Maintien de la compatibilité avec les anciennes versions.
- Actualisation de la ressource Lovelace et ajout de tests de non-régression.

## 0.1.0 — Alpha (2026-11-03)

- Première intégration Home Assistant de l'API publique Tracearr v2.
- Connexion SSE unique et synchronisation REST de secours.
- Capteurs de flux actifs, transcodages séparés et disponibilité des serveurs.
- Deux cartes Lovelace : regroupée et individuelle ; liste, grille et carrousel.
- Éditeur visuel, filtres, progression, images, alias et avatars.

**Version Alpha : validation complète sur plusieurs installations Home Assistant encore nécessaire.**
