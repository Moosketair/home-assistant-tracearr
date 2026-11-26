# Feuille de route — propositions à arbitrer

## Livré en v0.1.16

Lecture REST et SSE par entrée, capteurs globaux et par serveur, listes et carrousel groupés, carte individuelle et éditeur partagé, images/signatures et fonds cinéma, horloge locale, couleurs et ordre des badges, ciblage et règles LAN/WAN manuelles, alias/avatars, ressources storage/YAML, publication HACS. Le détail et les limites sont dans [ARCHITECTURE](ARCHITECTURE.md) et les preuves dans [AUDIT_INITIAL](AUDIT_INITIAL.md). Ces fonctions ne sont pas des travaux futurs.

## Décisions explicites

Les phases 0 et 1.1 sont validées. **2A** est définitivement validée sur `942de6f` après correction du reliquat de rollback. **2B** est définitivement clôturée après le verdict indépendant **VALIDÉ** de 2B.4 sur `f918150` (fusion et états de connexion corrigés ; limites d’ordre acceptées). **2C** est définitivement clôturée (A3/A4). **2D** est définitivement clôturée sur `28bef59` (A6), sans contre-audit supplémentaire, par décision du mainteneur. **2E** est définitivement clôturée sur `b9c5880` (A11/A12), sans contre-audit supplémentaire, par décision du mainteneur. Voir [l’état de reprise](DEVELOPMENT_STATUS.md) pour les SHA complets et [RECETTE](RECETTE.md) pour les preuves. Aucune publication ni migration approuvée ; la stable reste v0.1.16 (`443ce38`).

## Ordre proposé après validation

**3.1 clôturée** après le contre-audit 3.2 (validé avec réserve non bloquante) sur `fcd3c83`. **3B.1 livré localement** : A7 et A9 corrigées, A8/A13/A14 rectifiées dans les guides ou l’historique. A10 seule reste ouverte parmi les 14 anomalies ; voir [l’état de reprise](DEVELOPMENT_STATUS.md#état-des-14-anomalies-à-lentrée-du-lot-4).

| Ordre | Lot proposé | Critère de sortie avant livraison |
|---|---|---|
| 4 | **Validation globale** : matrice Core minimum/stable, non-régression avec fixtures Plex/Jellyfin/Emby, installation/mise à niveau HACS et essai sur un vrai dashboard HA isolé. | Vérifier HACS et hassfest sur le SHA candidat ; vérifier les flows, options, ressources et cartes réels. Trancher A10 avant toute publication. |
| À arbitrer | **A10 — données périmées** : convenir de l’indication « dernière lecture connue », des règles de gel et de reprise et du comportement à vide (`hide`, `header_only`, message). | Ne pas marquer périmé un flux encore alimenté par SSE sur une panne REST seule ; vérifier le mode REST seul sain, la panne des deux transports et la reprise. Accord requis avant modification de comportement. |
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
