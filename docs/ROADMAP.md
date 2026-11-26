# Feuille de route — propositions à arbitrer

## Livré en v0.1.16

Lecture REST et SSE par entrée, capteurs globaux et par serveur, listes et carrousel groupés, carte individuelle et éditeur partagé, images/signatures et fonds cinéma, horloge locale, couleurs et ordre des badges, ciblage et règles LAN/WAN manuelles, alias/avatars, ressources storage/YAML, publication HACS. Le détail et les limites sont dans [ARCHITECTURE](ARCHITECTURE.md) et les preuves dans [AUDIT_INITIAL](AUDIT_INITIAL.md). Ces fonctions ne sont pas des travaux futurs.

## Décisions explicites

Les phases 0 et 1.1 sont validées. **2A** est définitivement validée sur `942de6f` après correction du reliquat de rollback. **2B** est définitivement clôturée après le verdict indépendant **VALIDÉ** de 2B.4 sur `f918150` (fusion et états de connexion corrigés ; limites d’ordre acceptées). **2C** est définitivement clôturée (A3/A4). **2D** est définitivement clôturée sur `28bef59` (A6), sans contre-audit supplémentaire, par décision du mainteneur. **2E** est définitivement clôturée sur `b9c5880` (A11/A12), sans contre-audit supplémentaire, par décision du mainteneur. Voir [l’état de reprise](DEVELOPMENT_STATUS.md) pour les SHA complets et [RECETTE](RECETTE.md) pour les preuves.

## Ordre proposé après validation

**3.1 clôturée** après le contre-audit 3.2 (validé avec réserve non bloquante) sur `fcd3c83`. **3B.1 validée** par le mainteneur : A7/A9 corrigées, A8/A13/A14 rectifiées dans les guides ou l’historique. **A10 corrigée en 3B.2** selon la décision du mainteneur : avertissement et gel par source sans données fiables, reprise uniquement sur un snapshot effectivement intégré. Ces corrections restent à confirmer au lot 4 ; voir [l’état de reprise](DEVELOPMENT_STATUS.md#état-des-14-anomalies-à-lentrée-du-lot-4).

**4.1 :** douze anomalies validées par le mainteneur (A1–A8, A11–A14) ; refus de validation pour les défauts résiduels A9/A10. **4.1.1 :** correctifs locaux livrés, verdict indépendant attendu sur ces deux points. Le versionnement et l’invalidation du cache JS sont réservés à 4.2.

**4.1.2** confirme les deux correctifs et valide définitivement A10. **4.1.3** traite exclusivement la course résiduelle A9 entre vérification de la clé et suppression HA ; **4.1.4** la valide et clôt définitivement les 14 anomalies. Après la recette 4.2 et les essais HACS de la bêta, le mainteneur a autorisé la stable `v0.1.17` (5C.1), sans ouvrir les lots 6A/6B/6C.

| Ordre | Lot proposé | Critère de sortie avant livraison |
|---|---|---|
| 4 | **Validation globale** : 4.1 définitivement clôturé (14/14), puis [candidat et dashboard isolé 4.2](RECETTE_42.md). | Les essais personnels du mainteneur et son accord explicite précèdent toute publication. Une mise à niveau locale ne vaut pas un test du circuit HACS. |
| Ultérieur | **Coût des dashboards** : étudier si nécessaire le trafic WS et les performances longue durée ; A5 est clôturée en 3.1. | Comparer abonnés, octets, temps de rendu et mémoire avant d’envisager d’autres optimisations. Pas de refonte globale sans mesures et tests d’équivalence. |
| 6A | [**Affichage en pause et couleurs des badges du bandeau**](#lot-6a--affichage-en-pause-et-couleurs-des-badges) | Conserver les options de masquage et l’apparence des anciennes configurations par défaut. |
| 6B | [**Badges techniques personnalisables**](#lot-6b--badges-techniques-personnalisables) : identité visuelle propre à Tracearr HA pour les panneaux de lecture. | Cinq styles avec aperçu dans l’éditeur ; rendu compact, lisible en thèmes clair et sombre ; style classique conservé par défaut. |
| 6C | [**Lectures musicales**](#lot-6c--lectures-musicales), [demande #2](https://github.com/Moosketair/home-assistant-tracearr/issues/2). | Définir le repli si les métadonnées manquent et préserver la compatibilité des cartes et des lectures vidéo. Confirmation du périmètre avant développement. |

La priorité d’un lot n’est pas une promesse de publication. Garder les issues comme suivi opérationnel et le changelog pour ce qui a effectivement été livré.

### Lot 6A — Affichage en pause et couleurs des badges

Préparation documentaire uniquement. En pause, conserver le temps restant à gauche ; afficher le message orange « En pause » à droite à la place de l’heure de fin. Recalculer l’heure de fin à la reprise et préserver les options de masquage existantes.

Pour les badges du bandeau général, prévoir une couleur normale configurable par badge, indépendamment de sa couleur spécifique à la valeur zéro. Sans nouveau réglage, préserver l’apparence des configurations existantes.

**Réserve 3.2 à examiner en 6A :** une session entièrement absente d’un snapshot puis revenue avec une position source ancienne peut présenter un recul temporaire du compteur. Les sessions simplement filtrées ne sont pas concernées. Étudier, si nécessaire, une conservation temporaire et bornée des états récemment supprimés, sans réintroduire la rétention mémoire corrigée en 3.1. Réserve acceptée, non corrigée en 3B.1.

### Lot 6B — Badges techniques personnalisables

**Décision du mainteneur — préparation documentaire uniquement.** Le lot 6B concerne les badges techniques des panneaux de lecture, pas la personnalisation des couleurs des badges de capteurs du bandeau général. Aucun développement de ces fonctionnalités pendant le lot 3.1 : son périmètre fonctionnel, ses tests, ses autorisations et sa condition de fin restent inchangés.

Les cinq styles seront proposés dans l’éditeur graphique :

| Style | Présentation |
|---|---|
| Classique | Présentation textuelle actuelle, conservée par défaut pour préserver les configurations existantes. |
| Premium | Fond légèrement teinté, bordure et texte colorés. |
| Cinéma | Fond de couleur pleine avec texte contrasté. |
| Minimaliste | Fond neutre avec trait latéral coloré. |
| Technique | Deux niveaux : format principal et information complémentaire. |

**Personnalisation dans l’éditeur :** choix du style, réglage de la taille du texte, de l’arrondi et de l’espacement des badges, activation ou désactivation des couleurs par format, palette prédéfinie, modification des couleurs par format, réinitialisation des personnalisations et aperçu en direct.

**Palette indicative, à affiner pendant le lot 6B :**

| Couleur | Formats ou familles |
|---|---|
| Doré | 4K UHD |
| Violet | Dolby Vision et Dolby Atmos |
| Orange | HDR10 et HDR10+ |
| Bleu | Full HD et famille DTS |
| Vert émeraude | Audio lossless |
| Turquoise | HEVC et codecs vidéo modernes |
| Gris | Formats standards |

Le rendu doit être réalisé en HTML/CSS, sans fichier image, sans logo officiel et sans téléchargement de ressources graphiques externes. Les couleurs et les formes doivent permettre de reconnaître rapidement les caractéristiques du média tout en maintenant un design homogène entre formats. L’affichage doit rester compact et s’adapter à la largeur disponible, avec un contraste et une lisibilité suffisants en thèmes clair et sombre.

N’afficher que les formats réellement identifiables dans les métadonnées Tracearr : la palette ne présume pas que tous les formats cités sont détectables. Prévoir un moteur de rendu commun aux lectures vidéo et aux futures lectures musicales lorsque c’est pertinent.

### Lot 6C — Lectures musicales

Préparation documentaire uniquement, en réponse à la [demande #2](https://github.com/Moosketair/home-assistant-tracearr/issues/2). Prévoir le titre du morceau, l’artiste, l’album, une pochette carrée, le codec et les informations audio, le débit et la progression, avec coexistence des lectures musicales et vidéo. Étudier les métadonnées réellement fournies par Tracearr pour Plex, Jellyfin et Emby et définir les replis si elles sont absentes. Réutiliser le moteur de rendu des badges techniques vidéo lorsque c’est pertinent.
