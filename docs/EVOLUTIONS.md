# Pistes d'évolution

Ces idées viennent après la refonte. Rien ici n'est implémenté : chaque piste est à valider avec Pascal avant de commencer.

Taille estimée : **S** = moins d'une demi-journée, **M** = 1 à 2 jours, **L** = plus de 2 jours ou nouvelle infrastructure.

---

## 1. E-mails avec Resend

**Objectif.** Pascal reçoit un e-mail quand il valide un ticket (reçu) et surtout quand un ticket est réglé (« Ticket gagné : +31,85 € »), même si le site n'est pas ouvert.

**Avant tout.** La version précédente s'appelait « Automatique **Sans Mails** » et `LIRE-MOI.txt` précisait « aucune fonction d'envoi de mails ». Il faut confirmer avec Pascal que les e-mails sont bien voulus.

### 1.1 Contraintes

- **La clé Resend ne peut pas être dans le site.** Le site est public et statique : une clé écrite dans le JavaScript serait lisible par tout le monde, qui pourrait alors envoyer des mails au nom du domaine. Il faut un petit serveur (une fonction).
- **Le serveur ne connaît pas les tickets.** Ils ne vivent que dans le `localStorage` du navigateur. Pour envoyer un mail « ticket gagné » pendant que le site est fermé, le serveur doit en avoir une copie.
- **Domaine d'envoi.** Resend exige un domaine vérifié (enregistrements DNS). Sans domaine, l'adresse de test `onboarding@resend.dev` n'envoie qu'au propriétaire du compte Resend, ce qui peut suffire si ce compte est celui de Pascal.
- **Données personnelles.** L'adresse e-mail est stockée côté serveur. Il faut prévoir un moyen de la supprimer et de se désabonner (lien dans chaque mail).

### 1.2 Options

| Option | Fonctionnement | Avantages | Limites | Taille |
|---|---|---|---|---|
| **A. Reçu à la validation** | Le site appelle une fonction serverless (Cloudflare Worker ou Vercel) qui détient la clé Resend et envoie le reçu à l'adresse **configurée côté serveur**. | Simple, aucune base de données. | Pas de mail « gagné » quand le site est fermé. Le point d'accès est public : il faut limiter le débit et ne jamais accepter le destinataire depuis le navigateur. | S |
| **B. Tickets synchronisés + règlement par le bot** | Le site envoie chaque ticket à une petite base (Supabase, table `tickets`). Après chaque relevé, le workflow GitHub lance le **même `settle.js`** avec Node (déjà dispo sur les runners) et envoie via Resend les mails des tickets réglés. | Mail « gagné » quelques minutes après le résultat officiel. La logique de règlement reste unique, sans réécriture en Python. | Nouvelle infrastructure (Supabase), secrets GitHub (`RESEND_API_KEY`, clé Supabase), modification de `.github/workflows/fdj.yml`. | L |
| **C. B + synchronisation complète** | Comme B, mais tout l'état est sauvegardé côté serveur. | Ouvre la voie au multi-appareils et à la sauvegarde cloud (voir 3.4). | Authentification nécessaire (lien magique par e-mail, par exemple). | L |

**Recommandation.** Commencer par **A** si un simple reçu suffit, sinon passer directement à **B**. Dans les deux cas, l'adresse est saisie dans « Mon compte », puis confirmée par un lien envoyé par mail (double opt-in).

### 1.3 Contenu des mails

- **Même identité que le ticket**, sans aucun élément FDJ ni Parions Sport. La mention « Jeu privé · crédit sans valeur » figure en pied de mail.
- **Mail « gagné »** : montant, sélections, lien vers « Mes tickets ». La célébration se déclenche à l'ouverture du lien, grâce à un paramètre `#tickets`.
- **Désabonnement en un clic** dans chaque mail.

---

## 2. Refonte des sons

Aujourd'hui, tous les sons sont **synthétisés en WebAudio** : moteur et tête d'impression, découpe, impact du tampon, fanfare, pièces. Ils sont désactivés par défaut. C'est léger (0 octet de fichier), mais ça sonne « synthétique ».

### 2.1 Proposition

- **Vrais échantillons sous licence libre** :
  - imprimante thermique : boucle tête + moteur, découpe ;
  - coup de tampon, pluie de pièces, courte acclamation ;
  - clic discret sur une cote, validation.
  - Sources : packs CC0 (Kenney « Casino Audio », Freesound filtré en CC0). Les licences iront dans `assets/sounds/LICENCES.md`.
- **Formats** : Opus (`.webm`), avec repli `.mp3` pour Safari ancien. Objectif **moins de 150 Ko** pour l'ensemble, regroupé en un seul fichier (« audio sprite ») pour éviter les requêtes multiples.
- **Chargement** : au premier geste de l'utilisateur, et seulement si le son est activé. Débloquer l'`AudioContext` au toucher pour iOS.
- **Réglages** : son activé ou coupé (existant), plus un volume. Synchronisation exacte avec l'animation : un clic de tête par ligne imprimée, le « clac » du tampon à l'impact.
- **Repli** : garder la synthèse actuelle si les fichiers ne chargent pas.

Taille : **M**, dont la moitié pour choisir et monter les sons.

---

## 3. Autres idées

### 3.1 Rapides (S)

| Idée | Détail |
|---|---|
| **Cotes réelles** | `baseOdd` (cote relevée sans le ×1,07) est déjà dans les données. Un réglage « cotes réelles / cotes boostées », ou un retrait du coefficient, selon la décision de Pascal (question 11.1 du CDC). |
| **Tests automatiques sur chaque pull request** | Un workflow séparé de `fdj.yml` qui lance `node --test tests/*.test.js`. |
| **Alerte taille des données** | Faire échouer le relevé ou prévenir si `sports-data.json` dépasse 3 Mo (garde-fou après la purge à 30 jours). |
| **Protection d'accès** | Code d'accès côté navigateur (dissuasif, pas sécurisé), en réponse à la question 11.2 du CDC. |
| **Export CSV de l'historique** | Pour suivre les tickets dans un tableur. |
| **Limites de jeu (même virtuelles)** | Plafond de mise par jour ou par semaine, et rappel du bilan. |

### 3.2 Moyennes (M)

| Idée | Détail |
|---|---|
| **Application installable (PWA)** | Manifeste, icônes, service worker. Ouverture hors ligne avec le dernier catalogue et les tickets. Le cache doit reprendre le numéro de version `?v=` déjà en place. |
| **Statistiques** | Courbe du solde, taux de réussite et bilan par sport ou par compétition, plus grosse cote gagnée, série en cours. |
| **Badges et défis** | « Premier combiné x5 gagné », « 3 tickets gagnants d'affilée »… avec une mini-célébration. |
| **Paris secondaires pour d'autres sports** | Aujourd'hui, seul le rugby les a. Étendre à quelques compétitions de foot choisies (Ligue 1, Ligue des champions), et seulement certaines familles (buteurs, nombre de buts), pour garder les données raisonnables. |
| **Notifications des favoris** | Bandeau « Ton équipe joue ce soir » à l'ouverture, à partir des favoris. |
| **Tests de bout en bout** | Playwright : parcours sélection → validation → impression → règlement, sur ordinateur et à 375 px. |

### 3.3 Plus lourdes (L)

| Idée | Détail |
|---|---|
| **Sauvegarde cloud et multi-appareils** | À mutualiser avec l'option C des e-mails (Supabase et authentification par lien magique). |
| **Notifications push** | Web Push (clés VAPID) pour « ticket gagné ». Nécessite le même serveur que l'option B. Sur iOS, uniquement si le site est installé (PWA). |
| **Cash-out virtuel** | Encaisser un ticket avant la fin à une valeur calculée. Délicat : le catalogue n'est relevé que toutes les 15 min et la source ne fournit pas de cotes en direct. À étudier. |

### 3.4 Points de vigilance communs

- **Rien qui ressemble à la FDJ ou à Parions Sport** : ni logo, ni reproduction d'un reçu officiel (CDC 4.3 et 6.4), y compris dans les mails et les notifications.
- **Volume de requêtes vers la source** : chaque extension du relevé (autres sports, plus de marchés) augmente le trafic vers le site public. Rester raisonnable.
- **Pas d'étape de build** : chaque ajout doit rester du HTML/CSS/JS natif, modifiable depuis l'interface GitHub.
