# Structure du projet

```
river-raid-game-development/
├── index.html                 # Template HTML avec SEO
├── package.json               # Dépendances et scripts
├── vite.config.ts             # Config Vite (base: /tidalrun/)
├── tsconfig.json              # Config TypeScript
├── .gitignore                 # Ignore node_modules/, dist/
├── README.md                  # Présentation rapide
├── about.md                   # Description complète du jeu
├── structure.md               # Ce fichier
├── features.md                # Liste des fonctionnalités
├── todo.md                    # Roadmap
├── changelog.md               # Historique des versions
├── favicon.png                # Favicon bateau (32x32)
├── og-image.png               # Image Open Graph (1024x576)
└── src/
    ├── main.tsx               # Point d'entrée React
    ├── App.tsx                # Composant principal (2859 lignes)
    │                          #   - Logique de jeu complète (game loop, physique, collisions)
    │                          #   - Rendu Canvas 2D (rivière, joueur, ennemis, projectiles, effets)
    │                          #   - UI React (HUD, menus, onboarding, règles)
    │                          #   - 4 bateaux sélectionnables
    │                          #   - 10 tiers de difficulté
    │                          #   - 5 types de projectiles joueur
    │                          #   - 6 types de pickups
    │                          #   - 7 types d'ennemis + mines + ponts
    ├── index.css               # Styles globaux
    └── utils/
        └── cn.ts               # Utilitaire clsx + tailwind-merge
```
