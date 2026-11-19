# Hangar Launcher

Application de bureau Windows (Electron) qui réunit tous les jeux installés sur le PC dans une seule bibliothèque : Steam, Epic Games, EA app, Ubisoft Connect, Xbox (Game Pass PC), GOG Galaxy, et les jeux sans launcher ajoutés à la main.

Site et téléchargement : https://hangar-launcher-site.vercel.app (version anglaise sur `/en`).

## Installer

Télécharge `Hangar-Setup-x.y.z.exe` depuis le site ou les [Releases GitHub](https://github.com/Mochiizo/HangarLauncher/releases) et lance-le.

L'installeur n'est pas signé : Windows SmartScreen affiche « Windows a protégé votre ordinateur ». Clique sur **Informations complémentaires**, puis **Exécuter quand même**.

Ensuite, Hangar se met à jour tout seul : la nouvelle version s'installe par-dessus l'ancienne, les données sont conservées.

## Ce que fait Hangar

**Accueil**
- Le dernier jeu joué en grand, avec le bouton Jouer, et les jeux récents.
- La frise « Cette semaine » : le temps de jeu jour par jour.
- Le calendrier des sorties Steam (nouveautés, jeux à venir, liste de souhaits si elle est publique).
- Les amis Steam en ligne et à quoi ils jouent.

**Bibliothèque**
- Tous les jeux, avec recherche, filtres (Tous, Installés, Favoris) et filtre par plateforme.
- Fiche de chaque jeu : temps de jeu, dernière session, taille, succès Steam (obtenus, à débloquer, rareté).
- L'activité du jeu (patchs et annonces) s'ouvre dans Hangar, comme sur Steam, sans passer par le navigateur.
- Jouer, installer, désinstaller, ouvrir le dossier du jeu.
- Barre latérale masquable (Ctrl+B).

**Statistiques**
- Temps de jeu par période (semaine, mois, année, depuis le début), avec transitions quand on change de période.
- Répartition par plateforme, jeux les plus joués, records, carte des jours joués, succès.

**Partout**
- **Recherche rapide (Ctrl+K)** : tape quelques lettres, Entrée, le jeu se lance. Marche aussi avec les initiales (« cs » → Counter-Strike 2). Ctrl+Entrée ouvre la fiche du jeu. Donne aussi accès aux actions (Statistiques, Réglages, Ajouter un jeu…).
- **Donner mon avis** : la bulle en haut ouvre un formulaire (bug, idée, autre). Le message part sur le site, qui l'envoie par mail et le garde sur la page privée `/avis`.
- **Joueurs en ligne** : le nombre de personnes qui ont Hangar ouvert en ce moment.
- **Écran d'ouverture** : un clip de décollage au démarrage, toujours au premier plan, que l'on peut passer (Échap, Entrée ou Espace).
- **Langues** : français et anglais (Réglages → Langue ; par défaut, la langue de Windows).
- Réduit dans la zone de notification à la fermeture ; option « Lancer au démarrage » dans les Réglages.

## D'où viennent les jeux

Tout est lu sur l'ordinateur, sans connexion aux comptes.

| Plateforme | Ce qui est lu | Ce qu'on en tire |
|---|---|---|
| Steam | `config/loginusers.vdf`, `steamapps/libraryfolders.vdf`, `appmanifest_*.acf` | Compte connecté, jeux installés sur tous les disques, taille |
| Steam | `userdata/<id>/config/localconfig.vdf` | Temps de jeu total et dernière session |
| Steam | Cache d'images du client Steam, puis CDN Steam | Jaquettes, bannières et logos |
| Epic | `ProgramData/Epic/EpicGamesLauncher/Data/Manifests/*.item` | Jeux installés, exécutable, taille |
| Epic | `.../Data/Catalog/catcache.bin` | Images des jeux |
| Ubisoft Connect | Registre Windows (`Ubisoft\Launcher\Installs`) | Jeux installés |
| EA app | Programmes installés édités par Electronic Arts | Jeux installés |
| Xbox / Game Pass PC | Paquets Windows contenant un `MicrosoftGame.config` | Jeux installés |
| GOG Galaxy | Registre Windows | Jeux installés |
| Jeux ajoutés | Un `.exe`, un raccourci `.lnk` ou `.url` choisi par l'utilisateur | Lancement et suivi du temps de jeu |

- **Clé API Steam (facultative, dans les Réglages)** : ajoute les jeux possédés jamais installés, les amis et les succès.
- Pour Epic, EA, Ubisoft, Xbox et GOG, seuls les jeux installés sont visibles : ces launchers n'ont pas d'API publique pour la bibliothèque complète.
- Si aucune image n'existe pour un jeu, Hangar affiche un dégradé avec ses initiales.

## Le temps de jeu jour par jour

Aucun launcher ne donne le temps de jeu jour par jour, donc Hangar le reconstitue :

- **Steam** : toutes les 10 minutes, Hangar enregistre le temps de jeu total de chaque jeu. Le temps d'une journée est la différence avec la veille.
- **Autres plateformes et jeux ajoutés** : un jeu est « lancé » tant qu'un programme de son dossier d'installation tourne. Hangar compte ce temps lui-même.

Pour un suivi complet, Hangar doit tourner (même réduit dans la zone de notification).

## Données et vie privée

- Toutes les données restent sur le PC : `%APPDATA%\Hangar\library-data.json` (réglages, historique du temps de jeu, favoris).
- **Signal anonyme** : tant que Hangar est ouvert, il envoie au site toutes les 4 minutes un identifiant tiré au hasard et son numéro de version. Rien d'autre : ni nom, ni jeux, ni compte Steam. Il sert à compter les utilisateurs actifs et les joueurs en ligne. Désactivable dans Réglages → Confidentialité. Jamais envoyé par la version Aperçu ni en développement.
- **Formulaire d'avis** : n'envoie que le message, l'e-mail s'il est rempli, et (case cochée par défaut) les versions de Hangar et de Windows et la langue.

## Développer

```bash
npm install
npm start          # lance l'appli
```

```
src/main/       processus principal
  main.js         fenêtres, écran d'ouverture, zone de notification, échanges avec l'interface
  steam.js, vdf.js, artwork.js     bibliothèque Steam et images
  epic.js, more.js, custom.js      Epic, EA / Ubisoft / Xbox / GOG, jeux ajoutés
  tracker.js, store.js             jeux en cours, historique du temps de jeu, réglages
  friends.js, achievements.js, news.js, releases.js   amis, succès, activité, calendrier des sorties
  telemetry.js    signal anonyme et formulaire d'avis
  updater.js      mises à jour via les Releases GitHub
src/renderer/   interface : index.html, styles.css, app.js, i18n.js (anglais), splash.* (écran d'ouverture)
build/          icônes
```

Le site vitrine est dans un autre dépôt : [HangarLauncherSite](https://github.com/Mochiizo/HangarLauncherSite).

### Tester avant de publier (Aperçu)

```bash
npm run preview    # crée dist-preview/Hangar-Apercu.exe
```

`Hangar-Apercu.exe` est portable : il se lance d'un double-clic, sans installation. Il porte le badge « Aperçu » et a son propre dossier de données (`%APPDATA%\Hangar Preview`), copié depuis celui de Hangar au premier lancement. Il ne modifie pas le Hangar installé, ne cherche pas de mises à jour et n'envoie pas de signal anonyme.

### Publier une version

1. Monter `version` dans `package.json`.
2. `npm run dist` (ou `npx electron-builder --win nsis --x64 --publish never`) : crée dans `dist/` l'installeur, son `.blockmap` et `latest.yml`.
3. Créer une release GitHub avec le tag `vX.Y.Z` et y joindre ces trois fichiers. Le texte de la release devient les notes « Quoi de neuf » dans l'appli.

Les Hangar déjà installés trouvent la nouvelle version grâce à `latest.yml`.

Pour construire depuis Linux ou macOS, il faut Wine, y compris la version 32 bits pour l'étape NSIS. Le plus simple est de lancer `npm run dist` sur Windows.
