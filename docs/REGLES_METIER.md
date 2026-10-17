# Règles métier de l'existant (phase 0)

Audit du code sur `main` au commit `198ed3b` (17/10/2026). Ce document décrit le comportement **actuel**, y compris ses défauts. La phase 1 (découpage) le reproduit à l'identique. Les écarts proposés sont regroupés en section 11 et ne seront appliqués qu'après validation.

Notation : `r2(x) = Math.round(x * 100) / 100` (arrondi au centime, utilisé partout pour l'argent).

---

## 1. État persistant

Clé `localStorage` : `sports-bet-autonome-v1` ([app.js:2](../app.js#L2)). Une seule écriture : `save()` sérialise l'état entier ([app.js:8](../app.js#L8)).

| Champ | Type | Rôle |
|---|---|---|
| `balance` | number | Solde virtuel en euros. Valeur initiale : `10`. |
| `matches` | array | Matchs connus : catalogue officiel courant, matchs officiels référencés par un ticket, matchs manuels. |
| `tickets` | array | Tous les tickets, ordre chronologique de création. |
| `transactions` | array | Journal d'activité (crédits, débits, gains, nouvelle session). |
| `officialResults` | object | **Absent du CDC 4.2.** Résultats officiels par id de match : `{ outcomes: { [cléIssue]: 'WON'\|'LOST'\|'VOID' }, confirmedAt, source }`. Créé au premier chargement du catalogue. |
| `catalogFetchedAt` | string ISO | **Absent du CDC 4.2.** `fetchedAt` du dernier catalogue accepté. Sert au contrôle de fraîcheur. |

Aucun numéro de version de schéma n'est stocké.

### 1.1 Ticket

```
{ id, date, stake, picks[], odd, payout, status, settledAt?, profit? }
```

- `id` : `'BET-' + Date.now().toString(36).toUpperCase()`, par exemple `BET-MGUX2K3A`.
- `date` : **chaîne d'affichage** `new Date().toLocaleString('en-GB')`, soit `17/10/2026, 14:05:03`. Ce n'est pas un ISO. Le layout du ticket la découpe sur `,` pour obtenir date et heure.
- `stake` : mise arrondie au centime.
- `odd` : produit **non arrondi** des cotes. Il est recalculé au règlement s'il y a des sélections annulées (voir 6).
- `payout` : `r2(stake * odd)`. Vaut `0` si le ticket est perdu.
- `status` : `PENDING`, `WON` ou `LOST`. **Aucun ticket ne reçoit jamais `VOID`** (voir 6).
- `settledAt` (ISO) et `profit` (`r2(payout - stake)`) : ajoutés au règlement.

### 1.2 Sélection (`picks[]`), copiée dans le ticket à la validation ([app.js:11](../app.js#L11))

```
{ id, home, away, pick, label, short, matchNumber, odd, deadline, market, sport, competition, resultPath }
```

`pick` est la clé de l'issue choisie : un id numérique FDJ pour un match officiel, ou `1`, `N`, `2` pour un match manuel. `matchNumber` est stocké mais ne doit plus être affiché (CDC 6.4).

### 1.3 Transaction ([app.js:6](../app.js#L6))

```
{ id: 'ACT-<base36 ms>-<index>', date: toLocaleString('en-GB'), type, amount (signé), balance (solde après), details }
```

Valeurs de `type` : `'DEBITED · VALIDATED'`, `'CREDITED · VALIDATED'` et `'VALIDATED'` (nouvelle session). Les libellés `details` sont en anglais.

### 1.4 Migrations implicites au chargement ([app.js:4](../app.js#L4))

1. Si le JSON est illisible, l'état repart de l'état initial. L'état initial est ensuite **écrit** par `save()` au démarrage ([app.js:61](../app.js#L61)), ce qui écrase la donnée corrompue.
2. Statuts de ticket hérités : `GAGNÉ` devient `WON`, `PERDU` devient `LOST`, `EN ATTENTE` devient `PENDING`.
3. Préfixe d'id hérité : `SEB-` devient `BET-`.
4. `transactions` vaut `[]` si absent.
5. Pas de garde sur `tickets` ou `matches` absents : une exception à ce stade bloque tout le script.

---

## 2. Catalogue ([app.js:57](../app.js#L57))

### 2.1 Chargement

- `fetch('sports-data.json?t=<now>', { cache: 'no-store' })` avec un délai maximal de 20 s.
- Déclenché au démarrage, sur `pageshow` (retour de bfcache) et par le bouton « Actualiser la liste ». Un verrou `catalogLoading` empêche les appels concurrents.

### 2.2 Validation : tout ou rien

Si une seule condition échoue, le catalogue est rejeté en entier et l'état local reste inchangé :

- `schemaVersion === 1` ;
- `fetchedAt` est une date valide et pas plus de 5 min dans le futur ;
- `matches` est un tableau et `results` un objet ;
- chaque match a un id au format `^fdj-\d+-\d+$`, `home` et `sport` en chaînes, et un tableau `outcomes` ;
- chaque issue a une `key` en chaîne et une `odd` finie et `> 1`.

### 2.3 Résultats officiels

Pour chaque entrée de `results` :
- l'entrée est ignorée si l'id est invalide, si `outcomes` est absent ou si `confirmedAt` n'est pas une date valide ;
- seules sont conservées les issues à clé numérique et à valeur `WON`, `LOST` ou `VOID`.

Une entrée non vide **remplace** celle de `state.officialResults` pour le même id. Aucune entrée n'est jamais supprimée.

### 2.4 Fusion (`merge`, [app.js:55](../app.js#L55))

1. Pour chaque sélection de chaque ticket : complète `sport`, `competition`, `resultPath` et `deadline` s'ils manquent, à partir du catalogue puis de l'état.
2. Matchs conservés de l'état : non `demo` **et** (manuels **ou** référencés par au moins un ticket, quel que soit son statut).
3. Les matchs du catalogue sont ajoutés ou remplacent ceux de même id. Le `result` local existant est conservé.
4. Tri par `startDate` croissante. Les matchs sans date sont placés en fin de liste.
5. Après la fusion : `settle()`, `save()`, puis rendu.

### 2.5 Fraîcheur

L'âge est `now - fetchedAt`, calculé une seule fois au chargement (le texte n'est pas rafraîchi ensuite).

| Âge | Affichage | Blocage |
|---|---|---|
| ≤ 45 min | — | non |
| > 45 min | « cotes de simulation du dernier relevé, pas en direct » | non |
| > 6 h | « catalogue de plus de 6 h : nouveaux tickets suspendus » | oui, à la validation (voir 4.3) |

Mentions supplémentaires :
- « catalogue partiel » si `failedCompetitions` ou `incompleteCompetitions` n'est pas vide ;
- en cas d'échec : « Actualisation indisponible. Dernières données conservées ; résultats non confirmés en attente. » L'état n'est pas modifié.

---

## 3. Matchs

- **Clos** : un match est clos s'il a un `result` non vide **ou** si sa `deadline` est passée ([app.js:17](../app.js#L17)). Un match clos :
  - est masqué du catalogue ;
  - voit sa sélection retirée à chaque rendu ;
  - ne peut pas être choisi.
- **Issues** : `m.outcomes` pour un match officiel. Pour un match manuel, elles sont dérivées de `m.odds` (`{1, N, 2}`) avec le libellé domicile / `Draw` / extérieur et le code court `1` / `X` / `2` ([app.js:16](../app.js#L16)).
- **Recherche** : texte libre sur `home`, `away`, `competition` et `region`. Le champ `region` n'existe dans aucune donnée.
- **Filtres** : sport exact et compétition exacte. La liste des compétitions dépend du sport choisi, et changer de sport réinitialise la compétition.
- **Match manuel** ([app.js:34](../app.js#L34)) :
  - champs obligatoires : équipe domicile, équipe extérieure, 3 cotes finies `≥ 1.01` ;
  - `id = 'm' + Date.now()`, sans `deadline`, `startDate` ni `competition` ;
  - un match manuel ne se clôt donc que par la saisie d'un résultat ;
  - libellés de sport en anglais, alors que ceux du catalogue sont en français.
- **Saisie de résultat** ([app.js:35](../app.js#L35)) :
  - réservée aux matchs **non officiels** sans résultat ;
  - valeurs possibles : une clé d'issue ou `void` ;
  - une confirmation est demandée, puis : `result` est fixé, la sélection est retirée, puis `settle()` et `save()`.
  - Le résultat ne peut plus être modifié ensuite.

---

## 4. Panier et validation

### 4.1 Sélections

- Elles sont stockées en mémoire uniquement (`selected = { matchId: cléIssue }`) et ne survivent pas à un rechargement.
- Une seule sélection par match. Recliquer la même issue la retire, et une autre issue remplace la précédente.
- Le catalogue ne contient qu'un marché par événement : on ne peut donc pas combiner deux marchés d'un même match.

### 4.2 Calculs

- Cote combinée : produit des cotes des sélections, sans arrondi. Elle est affichée avec `toFixed(2)`.
- Gain potentiel affiché : `r2(mise saisie × cote)`.
- Il n'y a pas de limite sur le nombre de sélections ni de cote minimale.

### 4.3 Bouton « Confirm ticket », dans l'ordre ([app.js:33](../app.js#L33))

0. Le bouton est désactivé s'il n'y a aucune sélection ou si la mise n'est pas comprise entre `0.1` et le solde. Aucune raison n'est affichée.
1. **Fraîcheur**, seulement si au moins une sélection est officielle (`id` commençant par `fdj-`). Le ticket est refusé dans trois cas :
   - `catalogFetchedAt` invalide ;
   - plus de 5 min dans le futur ;
   - âge > 6 h.

   Message affiché : « Catalogue de plus de 6 heures : nouveaux tickets suspendus… ».
2. **Mise** : sélection non vide et mise finie dans `[0.1, solde]`, sinon « Check your stake and balance. ».
3. `rounded = r2(mise)`. Si `rounded > solde`, l'abandon est **silencieux**.
4. Si `cote × rounded` n'est pas fini : « The combined odds are too high. ».
5. **Débit** : `balance = r2(balance - rounded)`.
6. Création du ticket `PENDING` avec `payout = r2(rounded × cote)`, puis transaction `DEBITED · VALIDATED` d'un montant de `-rounded`.
7. Panier vidé, `save()` (son résultat est ignoré), rendu, toast « Ticket confirmed! », puis ouverture du ticket.

Les sélections sont recalculées au clic par `picks()`, qui **écarte en silence** celles dont la clôture est passée entre l'affichage et le clic.

---

## 5. Crédit, nouvelle session, activité

- **Crédit virtuel** : montant compris entre `0.1` et `10000`, arrondi au centime, puis transaction `CREDITED · VALIDATED` « Virtual credit added ». Ce formulaire existe en deux exemplaires : dans « Match management » et dans « My account ».
- **Nouvelle session** ([app.js:36](../app.js#L36)), après confirmation :
  - `balance = 10`, `tickets = []`, `transactions = []` ;
  - ajout d'une transaction `VALIDATED` de montant 0, « New simulation session » ;
  - effacement du `result` de tous les matchs et du panier.
  - `officialResults` et les matchs sont conservés.
- **Activité** : affichée de la plus récente à la plus ancienne, avec le solde après chaque opération.

---

## 6. Règlement ([app.js:30](../app.js#L30))

Fonction appelée après chaque chargement de catalogue et après chaque saisie de résultat. Elle ne traite que les tickets `PENDING`, ce qui la rend idempotente.

Verdict par sélection :
- **Officielle** (id `^fdj-\d+-\d+$`) : `officialResults[id].outcomes[pick]`, ou `null` si absent. Le champ `result` du match n'est **pas** consulté.
- **Manuelle** : `result` du match local.
  - `''` ou match introuvable : `null` ;
  - `'void'` : `VOID` ;
  - `result === pick` : `WON` ;
  - sinon : `LOST`.

Décision pour le ticket :
1. Au moins une sélection `LOST` : le ticket est **`LOST`** et `payout = 0`, **même si d'autres sélections sont en attente**. Aucune transaction n'est enregistrée.
2. Toutes les sélections sont `WON` ou `VOID` (et il y en a au moins une) : le ticket est **`WON`**.
   - `odd` est recalculée avec les sélections `VOID` à 1, puis `payout = r2(stake × odd)`.
   - Le solde est crédité de `payout` et une transaction `CREDITED · VALIDATED` « Virtual return BET-… » est enregistrée.
   - La cote combinée d'origine est **perdue** (écrasée).
   - Un ticket dont toutes les sélections sont `VOID` devient `WON` avec une cote de 1 et `payout = stake`.
3. Dans tous les autres cas, le ticket reste `PENDING`.

`settledAt` et `profit` sont fixés pour les deux premiers cas.

**Principe non négociable** : un résultat n'est jamais déduit d'une absence de donnée.
- Côté client, un fetch en échec, un résultat invalide ou une issue absente laissent la sélection en attente.
- Côté serveur, `sync_fdj.py` n'écrit un résultat que si le marché et l'issue sont à l'état `resulted`, et ignore toute requête en échec.

---

## 7. Sauvegarde et restauration ([app.js:59-60](../app.js#L59-L60))

- **Sauvegarde** : `JSON.stringify(state, null, 2)` dans `SPORTS_BET_sauvegarde.json`. L'état entier est exporté, y compris `officialResults`.
- **Restauration** :
  - fichier de 10 Mo au maximum ;
  - validation : `balance` finie et `≥ 0` ;
  - `matches`, `tickets` et `transactions` sont des tableaux ;
  - chaque match a `id`, `home` et `sport` en chaînes, plus `outcomes` en tableau ou `odds` ;
  - chaque ticket a `id` en chaîne, `picks` en tableau, `stake`, `odd` et `payout` finis, et un `status` parmi `PENDING`, `WON` ou `LOST`.
  - Après confirmation, l'état est **remplacé entièrement**, le panier vidé, puis `save()` et rechargement du catalogue.
  - La validation est faite **avant** les migrations de 1.4. Une sauvegarde contenant des statuts `GAGNÉ`, `PERDU` ou `VOID` est donc refusée.

---

## 8. Ticket numérique (existant)

### 8.1 Flux d'ouverture

Ouverture après validation, ou depuis l'historique par « Digital ticket » ou « Save PDF » (les deux boutons font la même chose).

1. Génération du PDF.
2. Aperçu HTML provisoire, ouverture du dialog.
3. Génération du PNG, qui remplace l'aperçu.

Le canvas est donc rendu deux fois.

### 8.2 Layout

Le layout ([ticket-pdf.js](../ticket-pdf.js)) est un canvas logique de 600 px de large, rendu en ×2, converti en niveaux de gris puis exporté en PNG. Le PDF est fait maison et embarque le JPEG du canvas sur 227 pt (80 mm) de large.

Contenu, de haut en bas :
- `SPORTS BET` (police logo), « YOUR BET - OUR PASSION », ⚽ ;
- DATE et TIME (issues du découpage de `t.date`), `TICKET N°`, `PRIVATE GAME`, **`SHOP : SB-CLT-01`**, `CREDIT` ;
- `COMBINED BET (n)` ;
- pour chaque sélection : emoji (🏉 pour le rugby, ⚽ sinon), rencontre, marché, **`N°<matchNumber>`**, choix, cote ;
- `TOTAL ODDS`, `VIRTUAL STAKE`, `POTENTIAL WINNINGS` en EUR ;
- statut : `PENDING` affiche `VALIDATED`, `WON` affiche `WON`, **tout autre statut affiche `LOST`** ;
- code-barres décoratif (largeurs de barres dérivées des codes caractères de l'id, ne code aucune donnée), puis id, « GOOD LUCK… », et un encadré « SportBet.irl ».

### 8.3 Autres éléments

- Polices embarquées en base64 dans [app.js:41](../app.js#L41) : **trois polices**, pas une (voir 11.5).
  - `TicketMono` : DejaVu Sans Mono ;
  - `TicketBold` : Nimbus Sans Narrow Bold (URW++) ;
  - `TicketLogo` : Nimbus Sans Bold Italic (URW++).
- Un ticket de plus de 20 000 px de haut fait échouer le canvas. Le PNG **et** le PDF échouent alors (le PDF dépend du canvas), et le dialog ne s'ouvre pas.
- **Impression** : une popup reçoit l'image PNG, ou l'aperçu HTML à défaut, avec `@page { size: 80mm auto; margin: 4mm }`.
- **Partage** : Web Share API avec le fichier PNG. Si elle est indisponible, téléchargement de l'image.
- La mention « SIMULATION TICKET / NO REAL BET PLACED » n'apparaît que dans l'aperçu HTML, dans le pied du panier et dans l'attribut `alt` de l'image. **Le PNG et le PDF ne la contiennent pas.**

---

## 9. Pipeline de données (lecture seule pour la refonte)

- `sync_fdj.py` :
  - **catalogue** : prend le premier marché de l'événement qui a des issues publiées et `price > 1` ;
  - **cotes** : `odd = round(price × 1.07, 2)`, et `baseOdd = price` est conservé dans les données ;
  - **libellés** : le nul est libellé `Draw` (en anglais) ;
  - **id** : `fdj-<eventId>-<marketId>`, avec `deadline = endValidationDate` du marché.
- **Résultats** : jusqu'à 100 matchs « dus » par passage, du plus récent au plus ancien. Statuts FDJ convertis :
  - `winning` devient `WON` ;
  - `losing` (et la faute de frappe `loosing`) devient `LOST` ;
  - `cancelled`, `void` et `refund` deviennent `VOID`.
- **Robustesse** :
  - si la page racine est en échec, le script lève une exception et l'ancien fichier est conservé ;
  - une compétition en échec garde ses anciens matchs ;
  - l'écriture est atomique (`.tmp` puis `replace`).
- **`results` et `tracked` ne sont jamais purgés** (voir 11.1).
- **Workflow actif** `.github/workflows/fdj.yml` :
  - exécution toutes les 15 min et à la demande, avec commit de `sports-data.json` si le fichier a changé ;
  - **redéploiement de Pages à chaque passage**.
  - Il n'a pas de déclencheur `push`.
  - Le fichier `fdj.yml` à la racine n'est pas un simple doublon obsolète. C'est la version modifiée prévue par `LIRE-MOI.txt` (déclencheur `push`, nom, autre calendrier), qui n'a jamais été mise en place.

---

## 10. Invariants à couvrir par les tests de la phase 1

**`settle` :**
1. Une sélection `LOST` rend le ticket `LOST`, avec `payout = 0`, sans crédit, même si d'autres sélections sont en attente.
2. Toutes les sélections `WON` : `payout = r2(stake × Π cotes)`, et le solde est crédité une seule fois.
3. Un mélange de `WON` et de `VOID` : les cotes `VOID` comptent pour 1, et `odd` est réécrite.
4. Toutes les sélections `VOID` : le ticket est `WON`, `payout = stake`.
5. Résultat absent ou partiel : le ticket reste `PENDING`, sans modification de l'état.
6. Un ticket non `PENDING` n'est jamais retraité (idempotence sur deux appels successifs).
7. Sélection officielle : seul `officialResults` fait foi. Sélection manuelle : seul `match.result` fait foi.

**`betslip` :**
8. Cote combinée = produit non arrondi des cotes.
9. Refus si la mise est `< 0.1` ou `> solde`, si le panier est vide, ou si le catalogue a plus de 6 h, une date invalide ou une date dans le futur (+5 min) alors qu'une sélection est officielle.
10. Le contrôle de fraîcheur ne s'applique pas à un panier composé uniquement de matchs manuels.
11. Débit : `balance = r2(balance - r2(mise))`, ticket `PENDING`, `payout = r2(r2(mise) × cote)`, id au format `BET-[0-9A-Z]+`.
12. Bascule de sélection : un même clic ajoute ou retire, une autre issue remplace la précédente.

**`state` :**
13. Les migrations `SEB-` et statuts français sont appliquées.
14. Une sauvegarde JSON existante se recharge et reste égale à l'état exporté.

---

## 11. Points à valider avant la phase 1

Chaque point donne la recommandation. Rien n'est appliqué sans accord. La phase 1 garde le comportement actuel.

### 11.1 Croissance des données : risque de perte de tickets, à traiter en priorité

`sports-data.json` est passé de **427 Ko (3/10) à 3,8 Mo (17/10)**, soit environ 240 Ko par jour, car `results` et `tracked` ne sont jamais purgés. Deux conséquences :

**a) Côté navigateur**
- L'app recopie **tous** les résultats (environ 3 500 aujourd'hui, environ 920 Ko) dans `state.officialResults`, en plus du catalogue (environ 380 Ko).
- Au rythme actuel (+250 résultats par jour), l'état atteindra la limite d'environ 5 Mo du `localStorage` d'ici **deux mois environ**.
- À ce moment-là, `save()` échouera. La validation d'un ticket n'en tient pas compte : le ticket est affiché mais disparaît au rechargement.

**b) Côté réseau**
- Les 3,8 Mo sont téléchargés à chaque ouverture, et la taille ne fait qu'augmenter.
- L'objectif Lighthouse Performance ≥ 90 sur mobile deviendra inatteignable.

**Recommandations**
- (a) Migration v2 : ne conserver dans `officialResults` que les ids présents dans les tickets. Les autres résultats sont rechargeables depuis le JSON et ne servent à rien d'autre. Aucun ticket n'est perdu.
- (a, suite) Refuser la validation d'un ticket si `save()` échoue.
- (b) Il faut purger `results` et `tracked` dans `sync_fdj.py`. **Ce fichier est hors périmètre** : la décision revient à Pascal, comme la question 11.1 du CDC.

### 11.2 Statut de ticket « ANNULÉ » (CDC 2, 5.2 et 6.2)

Le statut `VOID` n'existe aujourd'hui qu'au niveau d'une sélection. Un ticket entièrement annulé est stocké comme `WON` avec `payout = stake`. De plus, la restauration rejette `VOID`.

**Recommandation** :
- garder la donnée stockée telle quelle (`WON`), pour la compatibilité et l'historique ;
- afficher « ANNULÉ (remboursé) » lorsque toutes les sélections sont `VOID` ;
- accepter tout de même `VOID` à la restauration.

### 11.3 « 3 boutons de cote » (CDC 5.2)

Environ 28 % des matchs n'ont pas 3 issues : 122 en ont 2 (face à face), et une trentaine en ont de 4 à 81 (buteurs, « plus/moins »).

**Recommandation** :
- 2 ou 3 issues : boutons en ligne ;
- plus de 3 issues : liste repliée « Voir les N choix ».

### 11.4 Mentions textuelles « FDJ » dans l'interface

On trouve « Matchs et résultats officiels FDJ » dans la notice et « Actualisation des matchs et résultats FDJ… » dans le statut du catalogue. Le CDC 4.3 interdit les éléments d'identité. La consigne de lancement va plus loin : « aucun élément FDJ / Parions Sport ».

**Recommandation** :
- dans l'interface, une formulation neutre (« résultats officiels publiés ») ;
- la source citée uniquement dans le README.

### 11.5 Polices du ticket (CDC 6.5)

Il y a trois polices, pas une.
- DejaVu Sans Mono : licence libre, sans souci.
- Les deux Nimbus Sans (URW++) : licence GPL/AGPL avec exception de police. Les redistribuer sur un site public impose de joindre la licence.

**Recommandation** :
- extraire les trois polices dans `assets/fonts/` avec leurs fichiers de licence, pour un rendu identique en phase 1 ;
- pour l'interface (titres et cotes), prendre une police sous licence OFL.

### 11.6 Sélection devenue close au moment du clic

Elle est retirée **en silence** du ticket, qui part donc avec moins de sélections qu'affiché.

**Recommandation** : refuser la validation avec le message « Match clos : X », conformément au CDC 6.1 (« matchs non clos »).

### 11.7 `localStorage` illisible

L'état est réinitialisé puis écrasé au démarrage, et les données sont perdues.

**Recommandation** : copier le contenu brut sous `sports-bet-autonome-v1-corrompu` avant de réinitialiser, puis afficher une alerte.

### 11.8 Restauration

**Recommandation** : appliquer les migrations **avant** de valider le fichier, pour accepter les anciens statuts français et `SEB-`.

### 11.9 Date des tickets

`date` est une chaîne au format `en-GB`. Les anciens tickets venant d'une autre version peuvent avoir un format différent.

**Recommandation** :
- conserver `date` à l'identique ;
- ajouter un champ `createdAt` ISO aux nouveaux tickets (ajout sans rupture) ;
- pour l'affichage `fr-FR`, analyser `date` avec prudence et afficher la chaîne brute en cas d'échec.

### 11.10 Version de schéma

**Recommandation** : ajouter `schemaVersion: 2` à l'état, avec des migrations successives `1 → 2` (point 11.1a, normalisations de 1.4). L'absence du champ signifie la version 1.

### 11.11 Cotes +7 % (question 11.1 du CDC)

`baseOdd` (la cote réelle) est déjà présente dans `sports-data.json`. L'interface pourrait donc afficher les vraies cotes **sans toucher à `sync_fdj.py`**. C'est à décider avec Pascal. D'ici là, rien ne change.

### 11.12 Déploiement

- Le workflow actif n'a pas de déclencheur `push`. Après le merge final, le nouveau site sera publié au prochain passage planifié (15 min au plus), ou en lançant le workflow à la main sur `main`.
- **Ne jamais lancer le workflow manuellement sur `refonte`** : il commiterait `sports-data.json` sur `refonte` et publierait la branche sur Pages.

### 11.13 Défauts mineurs, à corriger pendant les phases 3 et 4 sauf avis contraire

- Abandon silencieux quand la mise arrondie dépasse le solde.
- Champ de recherche `region` inexistant dans les données.
- Le texte de fraîcheur n'est pas recalculé au fil du temps.
- La liste des résultats en administration affiche tous les matchs, environ 560 lignes.
- Le formulaire de crédit est en double.
- Les boutons « Save PDF » et « Digital ticket » font la même chose dans l'historique.
- Le canvas est rendu deux fois.
- Les tickets très longs (> 20 000 px) ne peuvent pas être exportés.
- Format monétaire `en-GB`.

---

## 12. Décisions appliquées pendant la refonte

Validées le 17/10/2026. Les sections 1 à 10 décrivent l'existant ; voici ce qui a changé.

| Point | Décision appliquée |
|---|---|
| 11.1 Croissance des données | Côté client : `officialResults` ne garde que les ids présents dans les tickets (migration v2 et après chaque règlement). Côté serveur : `sync_fdj.py` purge les résultats 30 jours après confirmation et les matchs suivis sans résultat 30 jours après clôture ; `tracked` ne garde que `id`, `resultPath`, `startDate`, `deadline`. Toute écriture (ticket, crédit, résultat, nom) est annulée si la sauvegarde échoue. |
| 11.2 Statut ANNULÉ | Nouveau statut de ticket `VOID` quand toutes les sélections sont annulées (mise remboursée). Les anciens tickets `WON` avec cote 1 et gain = mise sont migrés en `VOID`. La cote d'origine est conservée dans `initialOdd` quand des annulations la réduisent. |
| 11.3 Marchés à plus de 3 issues | 2 ou 3 issues : boutons en ligne. Au-delà : liste repliée « Voir les N choix ». |
| 11.4 Mentions FDJ | Aucune mention de la FDJ, de Parions Sport, de simulation ou de fictif dans la page ni sur le ticket. Source et avertissements dans le README. |
| 11.5 Polices | DejaVu et Nimbus (AGPL) retirées. Barlow, Barlow Condensed, JetBrains Mono (OFL) auto-hébergées, avec piles de repli système. |
| 11.6 Sélection close | Elle reste visible dans le panier (« Paris clos ») et bloque la validation jusqu'à son retrait. |
| 11.7 Données illisibles | Copie brute sous `sports-bet-autonome-v1-corrompu` et message d'alerte. |
| 11.8 Restauration | Migration puis validation ; `VOID` et les statuts français hérités sont acceptés. |
| 11.9 Dates | `date` (chaîne en-GB) conservée ; `createdAt` ISO ajouté aux nouveaux tickets, `at` aux nouvelles transactions. Affichage fr-FR, chaîne brute si illisible. |
| 11.10 Schéma | `schemaVersion: 2` avec migrations successives au chargement et à la restauration. |
| 11.11 Cotes +7 % | Inchangé, en attente de la décision de Pascal (README). |
| 11.13 Défauts mineurs | Corrigés : refus explicite de mise > solde, champ `region` retiré, fraîcheur recalculée toutes les 30 s, liste des résultats limitée aux matchs perso, formulaire de crédit unique, bouton unique « Voir le ticket », tickets longs exportables (échelle du canvas réduite), formats fr-FR. |

Nouveaux champs d'état (tous facultatifs, ajoutés sans rupture) : `schemaVersion`, `playerName`, `ticket.createdAt`, `ticket.initialOdd`, `transaction.at`.

Nouvelles valeurs : statut de ticket `VOID`, détail de transaction `Refund BET-…`.

Préférences hors état (clé `sports-bet-preferences`, non sauvegardées) : son de l'imprimante, dernière mise. Sélections du panier en `sessionStorage` (clé `sports-bet-selection`).

### 12.1 Ajouts du 17/10/2026 (après la refonte)

- **Marchés secondaires du rugby** : `sync_fdj.py` lit la page de chaque match de rugby (`DETAIL_SPORTS`) et publie chaque marché simple comme une entrée de `matches` avec `extra: true` et le même `eventId`. Exclus : marchés combinés (« et », « & », « Combiné », « Double Chance », « Poste ») et marchés de plus de 40 issues. Libellés des handicaps rendus explicites (« Handicap -12 »).
- **Résultats** : une page de résultat est lue une seule fois par match et règle tous ses marchés (100 pages au plus par passage).
- **Une sélection par match** : choisir une issue d'un autre marché du même `eventId` remplace la sélection existante ; la validation refuse deux sélections d'un même match (`same-event`).
- **Stockage** : les marchés `extra` du catalogue ne sont pas enregistrés dans le navigateur ni dans les sauvegardes, sauf ceux présents dans un ticket (ils sont rechargés à chaque ouverture).

### 12.2 Favoris et célébration

- **Favoris** : champ facultatif `favorites` de l'état, liste de `{ type: 'team' | 'competition', sport, name }` (100 au plus, entrées invalides écartées au chargement). Un match est suivi si l'une de ses deux équipes (marchés qui les nomment) ou sa compétition, dans le même sport, est en favori. Comparaison insensible à la casse et aux accents.
- **Célébration** : uniquement pour un ticket `WON`, à l'ouverture. Version complète la première fois (id mémorisé dans les préférences, 300 au plus), calme ensuite. Au premier lancement de cette version, les gains réglés depuis plus de 48 h sont considérés comme déjà vus. Aucun effet sur les exports (PNG, PDF, impression).
