# Feuille de route — propositions à arbitrer

## Livré en v0.1.16

Lecture REST et SSE par entrée, capteurs globaux et par serveur, listes et carrousel groupés, carte individuelle et éditeur partagé, images/signatures et fonds cinéma, horloge locale, couleurs et ordre des badges, ciblage et règles LAN/WAN manuelles, alias/avatars, ressources storage/YAML, publication HACS. Le détail et les limites sont dans [ARCHITECTURE](ARCHITECTURE.md) et les preuves dans [AUDIT_INITIAL](AUDIT_INITIAL.md). Ces fonctions ne sont pas des travaux futurs.

## Décisions explicites

Les phases 0 et 1.1 sont validées. **2A** est définitivement validée sur `942de6f` après correction du reliquat de rollback. **2B** est définitivement clôturée après le verdict indépendant **VALIDÉ** de 2B.4 sur `f918150` (fusion et états de connexion corrigés ; limites d’ordre acceptées). **2C** est définitivement clôturée (A3/A4). **2D** est définitivement clôturée sur `28bef59` (A6), sans contre-audit supplémentaire, par décision du mainteneur. **2E** est définitivement clôturée sur `b9c5880` (A11/A12), sans contre-audit supplémentaire, par décision du mainteneur. Voir [l’état de reprise](DEVELOPMENT_STATUS.md) pour les SHA complets et [RECETTE](RECETTE.md) pour les preuves. Aucune publication ni migration approuvée ; la stable reste v0.1.16 (`443ce38`).

## Ordre proposé après validation

| Ordre | Lot proposé | Critère de sortie avant livraison |
|---|---|---|
| 1 | **Options et compatibilité** (A7, A8, A13) : aller-retour JSON et précisions sur la version de Tracearr et la clé de compte ; ni défaut de géométrie ni interaction visuelle. | `unknown` explicite conservé ; anciens YAML toujours lisibles sans migration obligatoire. A6 est déjà clôturée en 2D. |
| 2 | **Autres propositions de l’audit** (A9, A10) : réauthentification et présentation des données périmées, qui exige une décision sur les états de disponibilité et le gel de l’horloge. | Accord de périmètre avant modification ; pas de changement de sémantique implicite dans un lot visuel. |
| 3 | **Contenir le coût des dashboards** : la rétention A5, le cycle de vie des cartes et la phase des badges sont corrigés localement en 3.1. Restent l’étude éventuelle du trafic WS et les performances longue durée. | Comparer abonnés, octets, temps de rendu et mémoire longue durée avant d’envisager d’autres optimisations. Tactile et vrais thèmes HA restent à éprouver. |
| 4 | **Consolider validation et maintenance** : matrice Core minimum/stable, fixtures anonymes Plex/Jellyfin/Emby, smoke HA et navigateur dans la CI selon coût, traduction progressive, précision sur les dimensions de l’icône (A14, documentation historique sans panne avérée). | Contrats de ressource, flows, options et entités testés sans production ; contrôles reproductibles sur le SHA candidat. Pas de réécriture globale du JS proposée sans mesures et tests d’équivalence. |
| 6A | [**Affichage en pause et couleurs des badges du bandeau**](#lot-6a--affichage-en-pause-et-couleurs-des-badges) | Conserver les options de masquage et l’apparence des anciennes configurations par défaut. |
| 6B | [**Badges techniques personnalisables**](#lot-6b--badges-techniques-personnalisables) : identité visuelle propre à Tracearr HA pour les panneaux de lecture. | Cinq styles avec aperçu dans l’éditeur ; rendu compact, lisible en thèmes clair et sombre ; style classique conservé par défaut. |
| 6C | [**Lectures musicales**](#lot-6c--lectures-musicales), [demande #2](https://github.com/Moosketair/home-assistant-tracearr/issues/2). | Définir le repli si les métadonnées manquent et préserver la compatibilité des cartes et des lectures vidéo. Confirmation du périmètre avant développement. |

La priorité d’un lot n’est pas une promesse de publication. Garder les issues comme suivi opérationnel et le changelog pour ce qui a effectivement été livré.

### Lot 6A — Affichage en pause et couleurs des badges

Préparation documentaire uniquement. En pause, conserver le temps restant à gauche ; afficher le message orange « En pause » à droite à la place de l’heure de fin. Recalculer l’heure de fin à la reprise et préserver les options de masquage existantes.

Pour les badges du bandeau général, prévoir une couleur normale configurable par badge, indépendamment de sa couleur spécifique à la valeur zéro. Sans nouveau réglage, préserver l’apparence des configurations existantes.

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
