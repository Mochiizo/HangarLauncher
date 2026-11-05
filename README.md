# Hangar — Steam + Epic Games

Application de bureau (Electron) qui réunit les jeux Steam et Epic de l'utilisateur dans une seule bibliothèque, avec une frise des jeux joués sur les 7 derniers jours.

## Installer

Lance `Hangar-Setup-1.0.0.exe`. L'installeur n'est pas signé : Windows SmartScreen affichera « Windows a protégé votre ordinateur ». Clique sur **Informations complémentaires**, puis **Exécuter quand même**.

## Ce que l'appli récupère, sans configuration

| Source | Fichier lu | Ce qu'on en tire |
|---|---|---|
| Steam | `config/loginusers.vdf` | Compte connecté (SteamID64) |
| Steam | `steamapps/libraryfolders.vdf` + `appmanifest_*.acf` | Jeux installés sur tous les disques, taille |
| Steam | `userdata/<id>/config/localconfig.vdf` | Temps de jeu total, 2 dernières semaines, dernière session |
| Epic | `ProgramData/Epic/EpicGamesLauncher/Data/Manifests/*.item` | Jeux installés, exécutable, taille |
| Epic | `.../Data/Catalog/catcache.bin` | Jaquettes et bannières |

- **Images Steam** : CDN public de Steam (`library_600x900`, `library_hero`, `header`). Si aucune image n'existe, l'appli affiche un dégradé avec les initiales du jeu.
- **Clé API Steam (facultative, dans Réglages)** : ajoute les jeux possédés mais jamais installés.
- **Epic** : seuls les jeux installés sont visibles. Epic n'a pas d'API publique pour la bibliothèque complète.

## La frise « Cette semaine »

Ni Steam ni Epic ne donnent le temps de jeu jour par jour, donc l'appli le reconstitue :

- **Steam** : toutes les 10 minutes, elle enregistre le temps de jeu total de chaque jeu. Le temps d'une journée est la différence avec la veille.
- **Epic** : toutes les 60 secondes, elle regarde si l'exécutable d'un jeu tourne et compte une minute.
- Tant que l'historique n'existe pas encore, chaque jeu s'affiche le jour de sa dernière session, sans durée.

Pour que le suivi soit complet, l'appli doit tourner. Fermer la fenêtre la réduit dans la zone de notification. Dans Réglages, l'option « Lancer au démarrage » la démarre réduite à chaque ouverture de session.

Les données sont dans `%APPDATA%\Hangar\library-data.json`.

## Développer

```bash
npm install
npm start          # lance l'appli
npm run dist       # crée l'installeur Windows dans dist/
```

Pour construire depuis Linux ou macOS, il faut Wine, y compris la version 32 bits pour l'étape NSIS. Le plus simple est de lancer `npm run dist` sur Windows.

```
src/main/      processus principal : main.js, steam.js, epic.js, vdf.js, store.js, tracker.js, demo.js
src/renderer/  interface : index.html, styles.css, app.js
build/         icône
```
