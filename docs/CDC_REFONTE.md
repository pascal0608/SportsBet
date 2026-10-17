# CDC : Refonte SPORTS BET

Projet : https://github.com/pascal0608/SportsBet
Branche de travail : `refonte` (jamais `main`)
Date : 17/10/2026

---

## 0. Mise en route (à copier dans le terminal VS Code)

```bash
git clone https://github.com/pascal0608/SportsBet.git
cd SportsBet
git checkout -b refonte
mkdir -p docs
cp ~/Downloads/CDC_REFONTE.md docs/CDC_REFONTE.md
git add docs/CDC_REFONTE.md
git commit -m "docs: cahier des charges de la refonte"
git push -u origin refonte
code .
```

Rendu local (le site fait un `fetch` de `sports-data.json`, donc il faut un serveur HTTP, pas `file://`) :

```bash
python3 -m http.server 8080
# ou
npx serve -l 8080 .
```

Puis ouvrir http://localhost:8080. Le `localStorage` est lié à l'origine : les tickets de la version GitHub Pages n'apparaissent pas en local. Pour tester avec de vraies données : "Sauvegarder mes données" sur la version en ligne, puis "Restaurer" en local.

Prompt de lancement à coller dans l'extension Claude de VS Code : voir section 12.

---

## 1. Contexte

Application web statique personnelle de paris sportifs en crédit virtuel, utilisée par une seule personne (Pascal).

- Catalogue de matchs et résultats récupérés depuis les pages publiques Parions Sport point de vente par `sync_fdj.py`, lancé par GitHub Actions toutes les 15 min, qui commit `sports-data.json` sur `main` puis publie sur GitHub Pages.
- Crédit virtuel, tickets combinés, règlement automatique des tickets à partir des résultats confirmés.
- Ticket numérique exportable (canvas PNG, PDF maison, impression).
- Stockage : `localStorage` (clé `sports-bet-autonome-v1`) + sauvegarde/restauration JSON.

## 2. État des lieux (audit du code existant)

| Fichier | Constat |
|---|---|
| `app.js` (121 Ko) | Tout le front dans un seul fichier minifié à la main, dont une ligne de 100 Ko contenant une police WOFF en base64 (utilisée pour le ticket canvas). Logique, rendu HTML par template strings et handlers `onclick` mélangés. Maintenance quasi impossible. |
| `index.html` | Une seule ligne. UI mélangée anglais / français. |
| `style.css` | Une seule ligne, couleurs en dur, pas de tokens, responsive minimal. |
| `ticket-pdf.js` | Générateur de layout ticket (texte, lignes, code-barres décoratif) partagé canvas/PDF. Contient le bandeau "SIMULATION TICKET / NO REAL BET PLACED". |
| `sync_fdj.py` | Scraper correct (écriture atomique, conservation du dernier snapshot en cas d'échec). Applique `odd = price * 1.07` : les cotes affichées sont gonflées de 7 % par rapport aux cotes réelles. |
| `fdj.yml` (racine) | Doublon obsolète du workflow. Seul `.github/workflows/fdj.yml` est actif. |
| `SPORTS_BET_Automatique_Sans_Mails.zip`, `LIRE-MOI.txt` | Artefacts d'un échange précédent, n'ont rien à faire dans le repo. |
| `README.md` | Vide ("aucune"). |

Points de vigilance identifiés :
- Le site est public sur `pascal0608.github.io/SportsBet`. "Usage perso" = usage, pas visibilité : quiconque a l'URL y accède.
- Le bot commit `sports-data.json` sur `main` toutes les 15 min. La branche `refonte` divergera sur ce fichier en permanence.
- Règles métier existantes à ne pas casser : catalogue > 45 min = mention "pas en direct" ; catalogue > 6 h = nouveaux tickets suspendus ; un résultat n'est jamais déduit d'une requête échouée ; statuts `PENDING / WON / LOST / VOID`.

## 3. Objectifs

1. Refonte visuelle complète, inspirée des codes des sites de paris grand public type FDJ / Parions Sport, avec une identité propre.
2. Nouvelle feature : à la validation d'un pari, animation d'impression d'un ticket de caisse thermique "comme au tabac", puis impression réelle possible.
3. Amélioration UX/UI globale (mobile, accessibilité, lisibilité, feedback).
4. Code maintenable, sans casser les données existantes ni le pipeline de publication.

## 4. Contraintes

### 4.1 Git et déploiement
- Tout le travail se fait sur `refonte`. Aucun commit, merge ni push sur `main`.
- Ne jamais commiter de modification de `sports-data.json` sur `refonte`. Lors du merge final (fait par un humain), garder la version de `main` pour ce fichier.
- Ne pas modifier `.github/workflows/fdj.yml` ni `sync_fdj.py` dans cette refonte (hors question 11.1).
- Pas d'étape de build : GitHub Pages publie le dossier tel quel et Pascal édite parfois les fichiers directement depuis l'interface GitHub. Donc vanilla HTML/CSS/JS, découpé en modules ES natifs (`<script type="module">`). Aucune dépendance npm en production.
- Commits atomiques, messages conventionnels (`feat:`, `fix:`, `refactor:`, `style:`, `docs:`, `chore:`).

### 4.2 Compatibilité des données
- Conserver la clé `localStorage` `sports-bet-autonome-v1` et le format de l'état (`balance`, `matches`, `tickets`, `transactions`). Toute évolution de schéma passe par une fonction de migration versionnée, appliquée au chargement, sans perte.
- Les fichiers de sauvegarde JSON existants doivent rester restaurables.
- Conserver le format de `sports-data.json` (schemaVersion 1) en lecture.

### 4.3 Direction artistique : limites
- Inspiration autorisée : ergonomie et codes visuels génériques des sites de paris (header sombre avec solde, navigation par sport en chips, cartes match avec 3 boutons de cote, panier de paris collant, badges de statut, typographie grasse et sportive).
- Interdit : logo, nom, wordmark, typographies propriétaires ou reproduction fidèle de la charte FDJ / Parions Sport. Le site est public, il ne doit pas pouvoir passer pour un site FDJ.
- L'identité reste "SPORTS BET" avec le trèfle existant.

## 5. Direction artistique

### 5.1 Tokens (CSS custom properties dans `:root`)
- Couleurs : fond bleu nuit (`--bg`), surfaces cartes claires, bleu vif pour les actions principales, accent jaune pour la cote sélectionnée et les gains, vert succès (gagné), rouge (perdu), gris (annulé). Contraste WCAG AA minimum sur tout texte.
- Mode sombre via `prefers-color-scheme` (optionnel en phase finale).
- Typo : une sans-serif grasse condensée pour titres et cotes (auto-hébergée dans `assets/fonts/`, pas de CDN), une sans-serif lisible pour le texte, une monospace pour le ticket.
- Échelle d'espacement 4/8 px, rayons 8/12/16, ombres légères, transitions 150-250 ms.

### 5.2 Composants
- Header : marque, solde virtuel animé (compteur qui roule au débit/crédit), accès compte.
- Barre de sports en chips scrollables horizontalement + recherche + filtre compétition.
- Badge de fraîcheur du catalogue ("Mis à jour il y a 12 min", orange > 45 min, rouge > 6 h).
- Carte match : sport + compétition + heure de clôture, équipes, 3 boutons de cote (état sélectionné très visible, `aria-pressed`), marché affiché si différent de 1/N/2.
- Panier de paris : colonne collante sur desktop, bottom sheet repliable sur mobile avec compteur de sélections. Cote totale, mise avec boutons rapides (1, 2, 5, 10), gain potentiel, bouton "Valider" désactivé avec raison explicite (solde insuffisant, catalogue périmé, aucun choix).
- Historique "Mes tickets" : cartes avec badge statut, filtres (En cours / Gagnés / Perdus / Tous), réouverture du ticket.
- Dialogs (compte, ticket, confirmation "Nouvelle session") en `<dialog>` natif, focus piégé, fermeture Échap.
- Toasts pour les retours (crédit ajouté, ticket validé, erreur de sauvegarde).
- États vides et skeletons de chargement.
- "Gestion des matchs" (ajout manuel, saisie de résultats, crédit) déplacée dans le menu compte, plus dans le flux principal.

### 5.3 Langue
Toute l'UI en français. Formats `fr-FR` (`1,63`, `12,50 €`, dates `17/10/2026 14:05`). Traduire les libellés actuellement en anglais (sports, marchés, statuts affichés). Les statuts internes restent `PENDING/WON/LOST/VOID`.

## 6. Feature : ticket de caisse thermique

### 6.1 Déroulé
1. Clic "Valider le ticket" : contrôles existants (solde, fraîcheur catalogue, matchs non clos), débit du solde, création du ticket, sauvegarde.
2. Overlay plein écran : une imprimante thermique stylisée (CSS/SVG) avec une fente. Le ticket sort de la fente vers le bas, par à-coups (timing `steps()` pour imiter la tête d'impression), ligne par ligne.
3. Durée : 1,8 s + 0,25 s par sélection, plafonnée à 4 s. Clic ou Échap = passer l'animation.
4. Fin : bord inférieur en dents de scie (découpe), légère chute du ticket avec ombre, puis actions : Imprimer, Enregistrer l'image, PDF, Partager (Web Share API si dispo), Fermer.
5. Son optionnel de tête d'impression généré en WebAudio (pas de fichier audio), désactivé par défaut, préférence mémorisée.
6. `prefers-reduced-motion: reduce` : ticket affiché directement, sans animation.
7. Depuis l'historique, réouverture du même ticket sans animation.

### 6.2 Contenu du ticket
- Largeur papier 80 mm, police monospace, fond légèrement crème, texte noir.
- En-tête : trèfle + SPORTS BET, ligne "JEU PRIVÉ", date, heure, numéro de ticket (format existant `BET-...`), nom du joueur.
- Type de pari (SIMPLE / COMBINÉ x N).
- Par sélection : sport, compétition, rencontre, marché, choix, cote.
- Totaux : cote totale, mise, gain potentiel (en EUR).
- Statut : VALIDÉ / GAGNÉ / PERDU / ANNULÉ (mise à jour à la réouverture).
- Pied : code-barres décoratif dérivé de l'ID, message "BONNE CHANCE".

### 6.3 Ce qui est retiré par rapport à l'existant
- Le bandeau "SIMULATION TICKET / NO REAL BET PLACED" et l'alt "Fictional ticket".

### 6.4 Ce que le ticket ne doit jamais contenir
Le ticket est imprimable et ne porte plus de bandeau de simulation, il ne doit donc pas pouvoir être confondu avec un reçu Parions Sport :
- Aucun nom, logo ou mention FDJ / Parions Sport.
- Aucune reproduction de la mise en page d'un reçu officiel.
- Aucun numéro de match FDJ (`matchNumber`), aucun code point de vente (supprimer "SHOP : SB-CLT-01").
- Code-barres purement décoratif : pas d'EAN/Code128 valide encodant une donnée.
- La ligne "JEU PRIVÉ" en en-tête est conservée.

### 6.5 Impression
- `@media print` dédié : seul le ticket est imprimé, `@page { size: 80mm auto; margin: 0 }`, rendu correct sur imprimante thermique 80 mm et sur A4 (ticket centré).
- Une source unique de layout (`ticket-layout.js`) alimente le DOM, le canvas PNG et le PDF, pour que les 3 rendus soient identiques.
- La police du ticket est extraite du base64 de `app.js` vers `assets/fonts/` et chargée via `FontFace` avant le rendu canvas.

## 7. Architecture cible

```
index.html
favicon.svg
sports-data.json            (inchangé, géré par le bot)
sync_fdj.py                 (inchangé)
assets/
  fonts/                    (polices auto-hébergées, dont celle du ticket)
  css/
    tokens.css
    base.css
    components.css
    ticket.css              (écran + print)
  js/
    main.js                 (bootstrap, wiring)
    state.js                (chargement, migration, sauvegarde, backup/restore)
    catalog.js              (fetch, fraîcheur, merge, filtres)
    betslip.js              (sélections, cote combinée, validation)
    settle.js               (règlement des tickets, fonctions pures)
    format.js               (fr-FR, traductions sports/marchés)
    ticket-layout.js        (layout unique du ticket)
    ticket-render.js        (DOM, canvas PNG, PDF)
    ticket-printer.js       (animation d'impression, son)
    ui/                     (header, matches, betslip, history, dialogs, toasts)
tests/
  settle.test.js            (node:test, aucune dépendance)
  betslip.test.js
docs/
  CDC_REFONTE.md
README.md
```

Règles : pas de `onclick` inline, délégation d'événements, échappement systématique des données injectées (`esc` existant), pas de framework, pas de commentaires évidents, logs `console.warn/error` sobres uniquement sur erreurs réelles.

## 8. Nettoyage (sur `refonte`)
- Supprimer `SPORTS_BET_Automatique_Sans_Mails.zip`, `LIRE-MOI.txt`, `fdj.yml` à la racine.
- Écrire un `README.md` : fonctionnement, lancement local, workflow de mise à jour des données, sauvegarde/restauration.
- Ajouter `.gitignore` (`.DS_Store`, `node_modules/`, `*.tmp`).

## 9. Accessibilité et qualité
- Navigation clavier complète, focus visible, ordre logique.
- Cibles tactiles >= 44 px, aucun scroll horizontal à 360 px.
- `aria-live` pour solde et messages, `aria-pressed` sur les cotes, libellés explicites.
- Lighthouse local : Accessibilité >= 95, Performance >= 90 (mobile).
- Aucune erreur console au chargement et sur les parcours principaux.

## 10. Phases et livrables

| Phase | Contenu | Validation |
|---|---|---|
| 0. Audit | Lire tout le code, lister les règles métier de `app.js` (validation, règlement, fraîcheur, migration), écrire `docs/REGLES_METIER.md` | Relu par Erki avant de continuer |
| 1. Découpage | Découper `app.js` en modules sans changer le rendu ni le comportement. Extraire la police. Tests `settle` et `betslip` | Rendu local identique, tests verts |
| 2. Design system | Tokens, base, composants, passage en français | Revue visuelle locale |
| 3. Écrans | Header, catalogue, panier, historique, compte, mobile | Parcours complet OK sur desktop et 375 px |
| 4. Ticket | Layout unique, rendu thermique, animation, son, impression 80 mm, exports | Impression test + PNG + PDF identiques |
| 5. Finitions | Accessibilité, Lighthouse, README, nettoyage | Checklist section 9 |

Chaque phase se termine par un commit/push sur `refonte` et un récapitulatif court de ce qui a changé et de ce qui reste.

## 11. Questions ouvertes (à trancher avec Pascal)
1. Cotes gonflées de 7 % dans `sync_fdj.py` : choix volontaire ou erreur ? Si le but est de se mesurer aux vraies cotes, il faut retirer ce coefficient (hors périmètre de cette refonte tant que non validé).
2. Le site doit-il rester public ? Sinon : repo privé (GitHub Pages privé nécessite un plan payant) ou simple protection par code côté client (dissuasive, pas sécurisée).
3. Nom du joueur affiché sur le ticket ("Joueur" par défaut, modifiable dans le compte ?).
4. Son d'impression : utile ou gadget ?

## 12. Prompt de lancement (extension Claude dans VS Code)

```
Lis entièrement docs/CDC_REFONTE.md avant toute action. C'est le cahier des charges de la refonte de ce projet.

Règles non négociables :
- Tu travailles uniquement sur la branche "refonte". Vérifie avec git branch avant de commencer. Aucun commit, merge ou push sur main.
- Ne commite jamais de modification de sports-data.json. Ne modifie ni sync_fdj.py ni .github/workflows/fdj.yml.
- Pas d'étape de build, pas de dépendance npm en production : HTML/CSS/JS vanilla en modules ES natifs.
- Compatibilité totale avec les données localStorage (clé sports-bet-autonome-v1) et les sauvegardes JSON existantes.
- Respecte strictement les sections 4.3 et 6.4 : aucun élément FDJ / Parions Sport, ticket non confondable avec un reçu officiel.

Méthode :
- Avance phase par phase (section 10). Commence par la phase 0 et arrête-toi après avoir produit docs/REGLES_METIER.md pour que je valide.
- À chaque phase : commits atomiques en conventional commits, push sur origin refonte, puis un récapitulatif court (fait / reste / points à valider).
- Pour vérifier le rendu, lance "python3 -m http.server 8080" et donne-moi l'URL.
- Si une exigence du CDC te semble mauvaise ou contradictoire, dis-le avant d'implémenter plutôt que de contourner.
```
