# Feuille de route — propositions à arbitrer

## Livré en v0.1.16

Lecture REST et SSE par entrée, capteurs globaux et par serveur, listes et carrousel groupés, carte individuelle et éditeur partagé, images/signatures et fonds cinéma, horloge locale, couleurs et ordre des badges, ciblage et règles LAN/WAN manuelles, alias/avatars, ressources storage/YAML, publication HACS. Le détail et les limites sont dans [ARCHITECTURE](ARCHITECTURE.md) et les preuves dans [AUDIT_INITIAL](AUDIT_INITIAL.md). Ces fonctions ne sont pas des travaux futurs.

## Décisions explicites

Les phases 0 et 1.1 sont validées. **2A** est définitivement validée sur `942de6f` après correction du reliquat de rollback. **2B** est définitivement clôturée après le verdict indépendant **VALIDÉ** de 2B.4 sur `f918150` (fusion et états de connexion corrigés ; limites d’ordre acceptées). **2C** est définitivement clôturée (A3/A4). **2D** est définitivement clôturée sur `28bef59` (A6), sans contre-audit supplémentaire, par décision du mainteneur. **2E** est définitivement clôturée sur `b9c5880` (A11/A12), sans contre-audit supplémentaire, par décision du mainteneur. Voir [l’état de reprise](DEVELOPMENT_STATUS.md) pour les SHA complets et [RECETTE](RECETTE.md) pour les preuves.

## Ordre proposé après validation

**3.1 clôturée** après le contre-audit 3.2 (validé avec réserve non bloquante) sur `fcd3c83`. **3B.1 validée** par le mainteneur : A7/A9 corrigées, A8/A13/A14 rectifiées dans les guides ou l’historique. **A10 corrigée en 3B.2** selon la décision du mainteneur : avertissement et gel par source sans données fiables, reprise uniquement sur un snapshot effectivement intégré. Voir [le bilan après clôture du lot 4.1](DEVELOPMENT_STATUS.md#état-des-14-anomalies-après-clôture-du-lot-41).

**4.1 :** douze anomalies validées par le mainteneur (A1–A8, A11–A14) ; refus de validation pour les défauts résiduels A9/A10. **4.1.1 :** correctifs locaux livrés, verdict indépendant attendu sur ces deux points. Le versionnement et l’invalidation du cache JS sont réservés à 4.2.

**4.1.2** confirme les deux correctifs et valide définitivement A10. **4.1.3** traite exclusivement la course résiduelle A9 entre vérification de la clé et suppression HA ; **4.1.4** la valide et clôt définitivement les 14 anomalies. Après la recette 4.2 et les essais HACS de la bêta, le mainteneur a autorisé la stable `v0.1.17` (5C.1), sans ouvrir les lots 6A/6B/6C.

| Ordre | Lot proposé | Critère de sortie avant livraison |
|---|---|---|
| 4 | **Validation globale** : 4.1 définitivement clôturé (14/14), puis [candidat et dashboard isolé 4.2](RECETTE_42.md). | Les essais personnels du mainteneur et son accord explicite précèdent toute publication. Une mise à niveau locale ne vaut pas un test du circuit HACS. |
| Ultérieur | **Coût des dashboards** : étudier si nécessaire le trafic WS et les performances longue durée ; A5 est clôturée en 3.1. | Comparer abonnés, octets, temps de rendu et mémoire avant d’envisager d’autres optimisations. Pas de refonte globale sans mesures et tests d’équivalence. |
| 6A | [**Affichage en pause et couleurs des badges du bandeau**](#lot-6a--affichage-en-pause-et-couleurs-des-badges) | Conserver les options de masquage et l’apparence des anciennes configurations par défaut. |
| 6B | [**Badges techniques personnalisables**](#lot-6b--badges-techniques-personnalisables) : identité visuelle propre à Tracearr HA pour les panneaux de lecture. | Cinq styles avec aperçu dans l’éditeur ; rendu compact, lisible en thèmes clair et sombre ; style classique conservé par défaut. |
| 6C | [**Lectures musicales**](#lot-6c--lectures-musicales), [demande #2](https://github.com/Moosketair/home-assistant-tracearr/issues/2). | Définir le repli si les métadonnées manquent et préserver la compatibilité des cartes et des lectures vidéo. Confirmation du périmètre avant développement. |
| 6E | [**Ergonomie de l’éditeur graphique des cartes**](#lot-6e--ergonomie-de-léditeur-graphique-des-cartes). | Audit en lecture seule, discussion, maquettes validées avant développement, puis recette de compatibilité. |

La priorité d’un lot n’est pas une promesse de publication. Garder les issues comme suivi opérationnel et le changelog pour ce qui a effectivement été livré.

### Lot 6E — Ergonomie de l’éditeur graphique des cartes

Lot futur, ni audité ni commencé en 6D.6 :

1. Auditer en lecture seule la pertinence des réglages, les doublons et l’organisation actuelle des menus et sous-menus.
2. Discuter des constats et des organisations possibles avec le mainteneur.
3. Préparer des maquettes et obtenir une validation explicite de la nouvelle ergonomie.
4. Développer uniquement après cette validation.
5. Effectuer la recette et vérifier la compatibilité des configurations existantes.

Pistes à discuter, non retenues à ce stade : catégories, onglets, sous-pages, affichage conditionnel, recherche, réglages avancés et composants natifs Home Assistant. Le lot musical 6C reste distinct.

### Lot 6A — Affichage en pause et couleurs des badges

**6A.1 validé et inclus dans `v0.1.18-beta.1`.** En pause, conserver le temps restant à gauche ; afficher le message orange « En pause » à droite à la place de l’heure de fin, même si celle-ci est masquée. Recalculer l’heure de fin à la reprise et préserver les options de masquage existantes.

Les badges du bandeau général ont une couleur normale configurable par badge, indépendamment de leur couleur à zéro. Sans nouveau réglage, l’apparence des configurations existantes est préservée. Voir [la configuration](CONFIGURATION.md) et [la recette 6A.1](RECETTE.md#6a1--pause-et-couleurs-des-badges).

**Réserve 3.2 examinée en 6A.1 et conservée :** une session entièrement absente d’un snapshot puis revenue avec une position source ancienne peut présenter un recul temporaire du compteur. Les sessions simplement filtrées ne sont pas concernées. Même avec une conservation bornée, un snapshot sans motif de retrait ni révision de la position ne distingue pas un échantillon ancien d’un véritable seek après réapparition. La purge immédiate est conservée ; aucun retour arrière n’est masqué par une nouvelle heuristique.

### Lot 6B — Badges techniques personnalisables

**Décision du mainteneur — 6B.1 autorisé** à partir de `b526cdf9` (6A.1 définitivement validé). Le lot concerne les panneaux de lecture, pas les badges de statistiques et de capteurs du bandeau général.

Les cinq styles seront proposés dans l’éditeur graphique :

| Style | Présentation |
|---|---|
| Classique | Présentation textuelle actuelle, conservée par défaut pour préserver les configurations existantes. |
| Premium | Fond légèrement teinté, bordure et texte colorés. |
| Cinéma | Fond de couleur pleine avec texte contrasté. |
| Minimaliste | Fond neutre avec trait latéral coloré. |
| Technique | Deux niveaux : format principal et information complémentaire. |

**Personnalisation dans l’éditeur partagé :** un style par carte, dispositions compacte ou séparée, visibilité et ordre par catégorie, couleurs automatiques désactivables, personnalisations par format avec réinitialisation individuelle ou globale, et aperçu en direct. **Aucune nouvelle option manuelle de taille, d’arrondi ou d’espacement** : chaque style s’adapte au contenu et à la largeur disponible. Les réglages historiques restent disponibles.

**Palette indicative, à affiner pendant le lot 6B :**

| Couleur | Formats ou familles |
|---|---|
| Doré | 4K UHD |
| Violet | Dolby Vision et Dolby Atmos |
| Orange | HDR10 et HDR10+ |
| Bleu | Full HD |
| Cyan | Famille DTS |
| Vert émeraude | Audio lossless |
| Turquoise | HEVC et codecs vidéo modernes |
| Gris | Formats standards |

Le rendu doit être réalisé en HTML/CSS, sans fichier image, sans logo officiel et sans téléchargement de ressources graphiques externes. Les couleurs et les formes doivent permettre de reconnaître rapidement les caractéristiques du média tout en maintenant un design homogène entre formats. L’affichage doit rester compact et s’adapter à la largeur disponible, avec un contraste et une lisibilité suffisants en thèmes clair et sombre.

N’afficher que les formats réellement identifiables ; les inconnus restent neutres. Proposer **Destination uniquement** et **Source → destination** pour les valeurs fiables ; si la destination manque, garder la valeur source sans flèche. Sans choix explicite, préserver la sémantique historique ; Classique sans personnalisation conserve aussi la présentation historique. Moteur commun aux deux cartes et à l’aperçu, réutilisable en 6C sans ouvrir ce lot. Aucun changement backend ni de version.

Voir [les réglages et limites du contrat](CONFIGURATION.md#badges-techniques-des-panneaux-de-lecture) et [la recette 6B.1](RECETTE.md#6b1--badges-techniques).

**6B.2 — Dimensionnement Lovelace et finitions.** Les cinq styles de 6B.1 sont conservés. En Sections, utiliser la hauteur automatique par défaut ; un en-tête seul qui tient occupe une ligne native, et le contenu plus grand s’ajuste sans forcer de multiples de lignes. Les tailles enregistrées restent prioritaires. Le style Technique reçoit des descriptions compactes de formats, sans inventer de propriétés de lecture. Quand la sortie est inconnue, plus de mention « source » visible : l’infobulle et le libellé accessible portent la précision. Aucun réglage supplémentaire, aucune préparation de publication ni ouverture de 6C.

**Clôture de 6A et 6B.** Le mainteneur confirme 6A.1, 6B.1 et 6B.2 sur la base commune `bb1ef7f`, sans nouvel audit indépendant. Après validation de la [recette commune 6D.1](RECETTE_6D1.md) et de la présentation 6D.2, la prépublication de `v0.1.18-beta.1` est autorisée en 6D.3 pour ses essais personnels. Aucune promotion stable n’est autorisée.

### Lot 6C — Lectures musicales

Préparation documentaire uniquement, en réponse à la [demande #2](https://github.com/Moosketair/home-assistant-tracearr/issues/2). Prévoir le titre du morceau, l’artiste, l’album, une pochette carrée, le codec et les informations audio, le débit et la progression, avec coexistence des lectures musicales et vidéo. Étudier les métadonnées réellement fournies par Tracearr pour Plex, Jellyfin et Emby et définir les replis si elles sont absentes. Réutiliser le moteur de rendu des badges techniques vidéo lorsque c’est pertinent.
