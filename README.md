# SPORTS BET

Application web personnelle de paris sportifs en **crédit virtuel**. Elle permet de composer des tickets simples ou combinés sur les matchs du moment, de les suivre jusqu'à leur règlement automatique, puis de les imprimer comme un ticket de caisse.

## À savoir avant tout

- **Jeu privé.** Le crédit est fictif et n'a aucune valeur. Aucune mise réelle n'est engagée, rien n'est payé ni encaissé.
- **Aucun lien avec la FDJ ni avec Parions Sport.** Le site n'est ni affilié, ni approuvé, ni contrôlé par ces marques. Les tickets SPORTS BET ne sont pas des reçus de jeu et ne peuvent pas être présentés en point de vente.
- **Source des données.** Les matchs, les cotes et les résultats viennent des pages publiques *Parions Sport point de vente* (`pointdevente.parionssport.fdj.fr`). Le script `sync_fdj.py` les relève toutes les 15 minutes. Les cotes affichées sont les cotes relevées **multipliées par 1,07**. La cote d'origine reste disponible dans les données (`baseOdd`).
- **Pas de temps réel.** Au-delà de 45 minutes sans mise à jour, le site l'indique. Au-delà de 6 heures, la validation de nouveaux tickets est suspendue.
- **Site public.** Toute personne qui a l'adresse peut l'ouvrir. Les tickets restent toutefois enregistrés dans le navigateur de chacun.

## Fonctionnement

| Élément | Comportement |
|---|---|
| Catalogue | `sports-data.json`, rechargé à l'ouverture, au retour sur l'onglet après 10 min et avec le bouton « Actualiser ». |
| Fraîcheur | Badge vert si les données ont moins de 45 min, orange au-delà de 45 min, rouge au-delà de 6 h (tickets suspendus). |
| Marchés | Un marché principal par match (1N2, face à face…). Pour le **rugby**, tous les paris simples du match sont aussi proposés sous « +N paris » : marqueurs d'essai, nombre d'essais, handicaps, points, mi-temps… |
| Ticket | **Une seule sélection par match** : choisir un autre pari du même match remplace le précédent. Cote combinée = produit des cotes. Mise minimale 0,10 €, dans la limite du solde. |
| Règlement | Automatique, dès qu'un résultat officiel est confirmé. Une sélection perdue fait perdre le ticket. Une sélection annulée compte pour une cote de 1. Si toutes les sélections sont annulées, le ticket est ANNULÉ et la mise remboursée. |
| Favoris | L'étoile d'un match permet de suivre une équipe ou une compétition. La chip « Favoris » n'affiche que ces matchs ; la liste se gère dans Mon compte. Les favoris font partie des sauvegardes. |
| Ticket gagnant | Le ticket porte un tampon « GAGNÉ », placé automatiquement là où il recouvre le moins de texte (aussi sur l'image, le PDF et l'impression). À la première ouverture : tampon qui s'écrase, confettis, pluie de pièces et compteur du gain (son si activé). Ensuite, version calme ; le bouton « Rejouer » d'une carte gagnée dans Mes tickets relance la célébration. |
| Matchs perso | Menu compte → Gestion des matchs : ajout d'un match et saisie manuelle de son résultat. |
| Ticket imprimé | Animation d'imprimante thermique, puis Imprimer / Image PNG / PDF / Partager. Réouverture depuis « Mes tickets ». |

Le détail des règles est dans [docs/REGLES_METIER.md](docs/REGLES_METIER.md).

## Lancer le site en local

Le site charge `sports-data.json` avec `fetch`. Il faut donc un serveur HTTP : ouvrir `index.html` en double-cliquant ne fonctionne pas.

```bash
python3 -m http.server 8080 --protocol HTTP/1.1
```

Ouvrir ensuite http://localhost:8080.

- L'option `--protocol HTTP/1.1` évite des coupures de connexion pendant le chargement des modules JavaScript, observées avec le mode HTTP/1.0 par défaut.
- Le navigateur range les données par adresse : les tickets du site en ligne n'apparaissent pas en local. Pour tester avec de vraies données, faire « Sauvegarder mes données » sur le site en ligne, puis « Restaurer une sauvegarde » en local.

Aucune installation n'est nécessaire. Il n'y a ni étape de build ni dépendance : HTML, CSS et JavaScript en modules natifs.

## Mise à jour des données

Le workflow `.github/workflows/fdj.yml` tourne toutes les 15 minutes sur `main`. À chaque passage, il :

1. lance `python sync_fdj.py`, qui relève le catalogue et les résultats (et, pour le rugby, la page de chaque match pour ses paris secondaires ; les paris combinés « X et Y » sont exclus) ;
2. commite `sports-data.json` si le fichier a changé ;
3. republie le site sur GitHub Pages.

En cas d'échec du relevé, le fichier précédent est conservé : aucun résultat n'est jamais déduit d'une page indisponible.

Les résultats sont gardés **30 jours** après leur confirmation. Les matchs sans résultat sont suivis 30 jours après leur clôture. Un ticket en attente doit donc être ouvert au moins une fois dans ce délai pour être réglé.

À retenir :
- Il ne faut jamais modifier `sports-data.json` à la main : le bot le réécrit.
- Il ne faut lancer le workflow à la main (« Run workflow ») que sur `main`. Sur une autre branche, il y commiterait les données et publierait cette branche.

## Sauvegarde et restauration

Les données (solde, tickets, activité, nom du joueur) sont stockées dans le navigateur, sous la clé `sports-bet-autonome-v1`.

- **Sauvegarder** : Mon compte → « Sauvegarder mes données ». Un fichier `SPORTS_BET_sauvegarde.json` est téléchargé.
- **Restaurer** : Mon compte → « Restaurer une sauvegarde ». Les sauvegardes des anciennes versions restent acceptées : elles sont migrées automatiquement.
- Si les données du navigateur deviennent illisibles, une copie brute est conservée sous la clé `sports-bet-autonome-v1-corrompu` avant le redémarrage d'une nouvelle session.
- Les préférences (son, dernière mise, gains déjà célébrés) sont stockées à part et ne font pas partie des sauvegardes.

## Impression

L'impression utilise une page à la taille exacte du ticket : 80 mm de large, hauteur calculée.

- **Imprimante thermique 80 mm** : choisir l'imprimante, marges « Aucune ».
- **Imprimante A4** : le ticket est imprimé à sa taille réelle. Le centrage dépend du pilote ; à défaut, imprimer le PDF.
- Écran, image PNG, PDF et impression sont produits par le même layout (`assets/js/ticket-layout.js`) : le rendu est identique sur les quatre supports.

## Structure

```
index.html                 page unique
favicon.svg
sports-data.json           données (géré par le bot, ne pas modifier)
sync_fdj.py                relevé des matchs et résultats
assets/
  css/                     tokens, base, composants, ticket (écran + impression)
  fonts/                   polices auto-hébergées (licence OFL, voir LICENCES.md)
  js/
    main.js                démarrage et câblage des événements
    state.js               chargement, migrations, sauvegarde, restauration
    catalog.js             validation, fusion, fraîcheur, filtres
    betslip.js             sélections, cote combinée, validation d'un ticket
    settle.js              règlement des tickets (fonctions pures)
    format.js              formats fr-FR et traductions
    prefs.js               préférences locales (son, mise, gains déjà célébrés)
    favorites.js           équipes et compétitions suivies
    celebrate.js           confettis, pièces et son de victoire
    ticket-layout.js       layout unique du ticket
    ticket-render.js       rendu SVG, PNG et PDF
    ticket-printer.js      animation d'impression, son, exports
    ui/                    en-tête, matchs, panier, historique, compte, dialogs, toasts
tests/                     tests node:test, sans dépendance
docs/                      cahier des charges et règles métier
```

## Modifier le code

Les navigateurs gardent les fichiers en cache (10 minutes sur GitHub Pages). Pour qu'une modification arrive chez tout le monde en même temps, **augmenter le numéro de version `?v=…` dans `index.html`** : il figure dans l'import map, sur `main.js` et sur les quatre feuilles de style. Il faut changer toutes les occurrences, par exemple `20261017-3` → `20261018-1`. Un nouveau fichier JavaScript doit aussi être ajouté à l'import map. Le test `tests/cache.test.js` vérifie que rien n'est oublié.

Si la page affiche une erreur du type « does not provide an export named… » juste après une mise à jour, c'est un mélange d'anciens et de nouveaux fichiers en cache : un rechargement forcé (Ctrl+Maj+R, ou Cmd+Maj+R sur Mac) règle le problème.

## Tests

```bash
node --test tests/*.test.js
```

Les tests couvrent le règlement, la validation des tickets, les migrations de données et le contenu du ticket. Ils nécessitent Node 20 ou plus récent, et uniquement pour le développement.

## Polices

Barlow, Barlow Condensed et JetBrains Mono sont distribuées sous SIL Open Font License 1.1. Les licences se trouvent dans [assets/fonts/](assets/fonts/LICENCES.md).
