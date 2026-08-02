# Changelog

## 1.3.0 (2026-08-03)

### Ajoute
- Bouton Infos (sous le bouton Rules existant), ouvrant une modale en francais avec la
  stack, les graphismes, la musique, les interactions, l'architecture et les algorithmes
  notables (paliers de difficulte progressifs, combo jusqu'a x12). Etape 15 du chantier de
  retrofit decrit dans `todo.md` racine du monorepo.

### Note
- L'ensemble de l'interface existante (Rules, Boat yard, HUD) reste en anglais, deja note
  dans `todo.md` comme ecart a la regle du depot (toute l'UI doit etre en francais) ; hors
  perimetre de ce correctif ponctuel.
- **Ce dossier source n'avait jamais son propre depot Git.** `.git` etait absent, ce qui
  faisait remonter silencieusement toutes les commandes git vers le monorepo parent (git
  cherche le `.git` le plus proche en remontant les dossiers). Repere en verifiant l'identite
  du depot avant de committer les sources (routine etablie ce jour-la) : `git remote -v`
  montrait `hylst.games.git` au lieu d'un remote dedie. Aucune commande d'ecriture n'avait
  encore ete lancee a ce moment-la, donc aucun degat sur le monorepo. Corrige en initialisant
  un vrai depot local (`.gitignore` durci en premier, y compris un dossier
  `docs/superpowers/` contenant un plan d'implementation redige pour un agent IA, exclu avant
  le tout premier commit) puis en creant le depot public dedie
  [github.com/Hylst/tidalrun](https://github.com/Hylst/tidalrun), qui n'existait pas non plus.

### Verifie
- Build propre, modale testee a l'ouverture/fermeture, coexistence confirmee avec la modale
  Rules existante, aucune erreur console, aucun debordement horizontal en 390x844.

## 1.2.0 (2026-07-29)
### Ajouté
- Tourelle rotative sur le bateau
- Mines navales destructibles
- Débris flottants (obstacles)
- River events : troncs flottants, rapides
- High score local (localStorage)
- Son de game over (stop musique)
- Bouton "Nouveau record" flottant
- Onboarding responsive
- Mode plein écran
- Meta tags SEO mis à jour
- Documentation mise à jour

## 1.1.0 (2026-07-28)
### Ajouté
- Friendly mines cleanup
- Music stop on game over
- Responsive CSS improvements

## 1.0.0 (2026-07-24)
- Version initiale
- 4 bateaux jouables
- 10 tiers de difficulté
- 4 armes (canon, rapide, dispersion, missile)
- 6 power-ups (carburant, réparation, bouclier, armes, étoile)
- 7 types d'ennemis + mines + ponts
- Rivière procédurale avec passages étroits
- Système de combo
- Interface responsive (desktop + mobile)
- Intégration Hylst.Games
