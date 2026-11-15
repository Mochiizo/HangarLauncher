'use strict';
// Langue de l'interface : français (texte d'origine) ou anglais.
// La langue arrive dans l'adresse de la page (?lang=en), choisie dans les Réglages.
// - t('Texte français', { n: 3 }) traduit un texte avec ses variables {n} ;
// - le reste de l'interface (HTML et textes affichés par app.js) est traduit à l'affichage :
//   chaque texte qui apparaît est cherché dans le dictionnaire, tel quel ou par modèle ({x} = variable).
const LANG = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'fr';
const LOCALE = LANG === 'en' ? 'en-US' : 'fr-FR';
document.documentElement.lang = LANG;

const EN = {
  // ---- Barre du haut, navigation ----
  'Aperçu': 'Preview', 'Sections': 'Sections', 'Accueil': 'Home', 'Bibliothèque': 'Library', 'Statistiques': 'Statistics',
  'Donner mon avis sur Hangar': 'Give feedback on Hangar', 'Donner mon avis': 'Give feedback',
  'Soutenir Hangar sur Ko-fi': 'Support Hangar on Ko-fi', 'Soutenir Hangar': 'Support Hangar',
  'Actualiser la bibliothèque': 'Refresh library', 'Actualiser': 'Refresh', 'Réglages': 'Settings',
  'Fenêtre': 'Window', 'Réduire': 'Minimize', 'Agrandir': 'Maximize', 'Fermer': 'Close',
  '{n} jeux · {i} installés': '{n} games · {i} installed',
  'Version d\'aperçu {v} : rien n\'est installé, tes données sont une copie': 'Preview version {v}: nothing is installed, your data is a copy',
  'Hangar — Aperçu': 'Hangar — Preview',

  // ---- Colonne de gauche, filtres ----
  'Rechercher un jeu': 'Search for a game', 'Masquer la barre latérale': 'Hide sidebar', 'Afficher la barre latérale': 'Show sidebar', 'Masquer la barre latérale (Ctrl+B)': 'Hide sidebar (Ctrl+B)', 'Afficher la barre latérale (Ctrl+B)': 'Show sidebar (Ctrl+B)', 'Ajouter un jeu': 'Add a game',
  'Tous': 'All', 'Installés': 'Installed', 'Favoris': 'Favorites', 'Toutes plateformes': 'All platforms', 'Ajoutés': 'Added',
  'Tous les jeux': 'All games', 'Jeux installés': 'Installed games', 'Jeux ajoutés': 'Added games',
  'Tous les jeux ({n})': 'All games ({n})', 'Jeux installés ({n})': 'Installed games ({n})', 'Favoris ({n})': 'Favorites ({n})',
  'Récents': 'Recent', 'Temps de jeu': 'Playtime',
  'Aucun jeu ne correspond.': 'No game matches.',
  'Aucun jeu ajouté pour l\'instant. Clique sur « Ajouter un jeu » pour ajouter un jeu installé sans launcher (Roblox, Soulframe…).': 'No game added yet. Click “Add a game” to add a game installed without a launcher (Roblox, Soulframe…).',
  'Aucun jeu {s} trouvé sur ce PC. Vérifie le dossier dans les Réglages.': 'No {s} game found on this PC. Check the folder in Settings.',
  'Aucun jeu {s} installé sur ce PC pour l\'instant. Installe un jeu avec {via} : il apparaîtra ici tout seul.': 'No {s} game installed on this PC yet. Install a game with {via}: it will show up here on its own.',
  'l\'EA app': 'the EA app', 'l\'appli Xbox': 'the Xbox app',

  // ---- Durées, dates ----
  'Durée inconnue': 'Unknown duration', 'Jamais lancé': 'Never played', 'Aujourd\'hui': 'Today', 'Hier': 'Yesterday',
  'Il y a {n} jours': '{n} days ago', 'Il y a {n} semaines': '{n} weeks ago', 'Il y a {n} mois': '{n} months ago',
  'Vu {r}': 'Seen {r}', 'Go': 'GB',

  // ---- Fiche d'un jeu ----
  'Jouer': 'Play', 'Installer': 'Install', 'Lancé': 'Running', 'Lancement…': 'Launching…', 'Reprendre': 'Resume',
  'Mettre à jour': 'Update', 'Mise à jour…': 'Updating…', 'Fichier introuvable, rechoisir': 'File not found, choose again',
  'Installer depuis {s}': 'Install from {s}', 'Installer depuis le launcher': 'Install from the launcher',
  'Ouvre les téléchargements Steam': 'Opens Steam downloads',
  'Changer l\'image du jeu': 'Change game image', 'Revenir à l\'image d\'origine': 'Restore original image',
  'Retirer de Hangar': 'Remove from Hangar', 'Retirer {g} de Hangar': 'Remove {g} from Hangar', 'Désinstaller {g}': 'Uninstall {g}', 'Désinstaller': 'Uninstall',
  'Retirer des favoris': 'Remove from favorites', 'Ajouter aux favoris': 'Add to favorites',
  'Dernière session': 'Last session', 'Deux dernières semaines': 'Last two weeks', 'Espace disque': 'Disk space', 'Non installé': 'Not installed', 'Installé': 'Installed',
  'Cette semaine': 'This week', 'Activité': 'Activity', 'Succès': 'Achievements',
  'Pas joué': 'Not played', 'Aucune session': 'No session', '{n} jeu': '{n} game', '{n} jeux': '{n} games',
  '{d} de jeu sur 7 jours': '{d} played over 7 days',
  'Les durées par jour se remplissent à partir du moment où l\'appli tourne : elle compare chaque jour ton temps de jeu total avec celui de la veille. En attendant, chaque jeu apparaît le jour de sa dernière session. Laisse l\'appli ouverte en arrière-plan (ou lancée au démarrage) pour un suivi complet.': 'Daily durations fill in from the moment the app runs: each day it compares your total playtime with the day before. Until then, each game appears on the day of its last session. Keep the app open in the background (or launched at startup) for full tracking.',

  // ---- Mises à jour des jeux ----
  'Vérification des fichiers': 'Verifying files', 'Mise à jour · {p}': 'Updating · {p}', 'Installation · {p}': 'Installing · {p}',
  'Mise à jour en pause': 'Update paused', 'Mise à jour en attente': 'Update pending', 'En cours': 'Running',
  'Installation en cours': 'Installing', 'Mise à jour en cours': 'Updating', 'Progression : {p}': 'Progress: {p}',
  'En pause': 'Paused', 'Vérification': 'Verifying', 'Téléchargement': 'Downloading', 'Installation': 'Installing', 'Téléchargements': 'Downloads',
  '{x} sur {y}': '{x} of {y}', '· {n} autre en file': '· {n} more in queue', '· {n} autres en file': '· {n} more in queue',
  'Le jeu ne semble pas avoir démarré. Vérifie la fenêtre de son launcher.': 'The game doesn\'t seem to have started. Check its launcher window.',
  'Impossible de lancer ce jeu.': 'Unable to launch this game.',
  'Steam s\'ouvre sur Téléchargements : clique sur le bouton de téléchargement à côté de {g} pour lancer la mise à jour. La progression s\'affichera ici.': 'Steam opens on Downloads: click the download button next to {g} to start the update. Progress will show here.',
  'Mises à jour': 'Updates',

  // ---- Succès ----
  '{p} % des joueurs': '{p}% of players', 'Obtenu le {d}': 'Unlocked on {d}',
  'Succès secret : la description apparaîtra une fois obtenu.': 'Secret achievement: the description will appear once unlocked.',
  'Chargement des succès…': 'Loading achievements…',
  'Ajoute ta clé API Steam dans les Réglages pour voir tes succès et ceux qu\'il te reste à débloquer.': 'Add your Steam API key in Settings to see your achievements and the ones left to unlock.',
  'Ouvrir les Réglages': 'Open Settings', 'Connecte-toi à Steam sur ce PC pour voir tes succès.': 'Sign in to Steam on this PC to see your achievements.',
  'Ce jeu n\'a pas de succès Steam.': 'This game has no Steam achievements.', 'Impossible de joindre Steam pour l\'instant.': 'Can\'t reach Steam right now.',
  '{a} sur {b} · {p} %': '{a} of {b} · {p}%', 'À débloquer ({n})': 'To unlock ({n})', 'Obtenus ({n})': 'Unlocked ({n})', '{n} succès': '{n} achievements',
  'Steam ne partage pas tes succès : dans Steam, Profil, Modifier le profil, Paramètres de confidentialité, mets « Visibilité sur mes jeux » sur « tout le monde ».': 'Steam doesn\'t share your achievements: in Steam, go to Profile, Edit Profile, Privacy Settings, and set “Game details” to “Public”.',
  'Tes succès pour ce jeu ne sont pas encore disponibles (jeu jamais lancé ?). Voici la liste complète.': 'Your achievements for this game aren\'t available yet (never played?). Here is the full list.',
  'Bravo, tu as débloqué tous les succès ! 🏆': 'Well done, you unlocked every achievement! 🏆', 'Aucun succès obtenu pour l\'instant.': 'No achievement unlocked yet.',
  'Afficher moins': 'Show less', 'Tout afficher ({n})': 'Show all ({n})', 'Afficher plus ({n})': 'Show more ({n})',

  // ---- Actualités ----
  'Chargement des actualités…': 'Loading news…', 'Impossible de charger les actualités pour l\'instant.': 'Can\'t load news right now.',
  'Aucune actualité récente pour ce jeu.': 'No recent news for this game.', 'Les actualités apparaissent pour tes vrais jeux Steam.': 'News shows up for your real Steam games.',
  '{s} ne propose pas d\'actualités publiques par jeu.': '{s} doesn\'t offer public news per game.', 'Cette plateforme ne propose pas d\'actualités publiques par jeu.': 'This platform doesn\'t offer public news per game.',
  'Aucune actualité récente pour tes derniers jeux.': 'No recent news for your latest games.', 'Actualités de tes jeux': 'News from your games',

  // ---- Bandeaux ----
  'Aucun jeu trouvé sur cet ordinateur (Steam, Epic, Ubisoft, EA, Xbox, GOG) : voici des jeux de démonstration. Vérifie les dossiers dans les Réglages.': 'No game found on this computer (Steam, Epic, Ubisoft, EA, Xbox, GOG): here are demo games. Check the folders in Settings.',
  'Steam : {e}. Les jeux installés restent affichés.': 'Steam: {e}. Installed games are still shown.',

  // ---- Ajout / retrait / désinstallation ----
  'Impossible d\'ajouter ce fichier.': 'Unable to add this file.',
  '{g} est dans ta bibliothèque. Tu peux lui choisir une image avec le bouton image.': '{g} is in your library. You can pick an image for it with the image button.',
  'Retirer {g} de Hangar ?': 'Remove {g} from Hangar?', 'Retirer': 'Remove',
  'Le jeu disparaît seulement de Hangar : il reste installé sur ton PC. Tu pourras l\'ajouter à nouveau quand tu veux.': 'The game only disappears from Hangar: it stays installed on your PC. You can add it again whenever you want.',
  '{g} a été retiré de Hangar.': '{g} was removed from Hangar.', 'Désinstaller {g} ?': 'Uninstall {g}?', 'Désinstaller ce jeu ?': 'Uninstall this game?',
  'Steam va s\'ouvrir pour confirmer la désinstallation et libérer {s}. Ton temps de jeu, tes succès et tes sauvegardes Steam Cloud sont conservés, et tu pourras réinstaller le jeu quand tu veux.': 'Steam will open to confirm the uninstall and free {s}. Your playtime, achievements and Steam Cloud saves are kept, and you can reinstall the game whenever you want.',
  'Steam va s\'ouvrir pour confirmer la désinstallation. Ton temps de jeu, tes succès et tes sauvegardes Steam Cloud sont conservés, et tu pourras réinstaller le jeu quand tu veux.': 'Steam will open to confirm the uninstall. Your playtime, achievements and Steam Cloud saves are kept, and you can reinstall the game whenever you want.',
  'Epic Games ne permet pas à une autre application de désinstaller un jeu. Le launcher Epic va s\'ouvrir sur ta bibliothèque : clique sur « … » sous {g}, puis sur « Désinstaller ».': 'Epic Games doesn\'t let another app uninstall a game. The Epic launcher will open on your library: click “…” under {g}, then “Uninstall”.',
  '{s} ne permet pas à une autre application de désinstaller un jeu. Les paramètres Windows vont s\'ouvrir sur « Applications installées » : cherche {g}, clique sur « … » puis sur « Désinstaller ».': '{s} doesn\'t let another app uninstall a game. Windows Settings will open on “Installed apps”: find {g}, click “…” then “Uninstall”.',
  'Impossible de lancer la désinstallation de ce jeu.': 'Unable to start uninstalling this game.',
  'Confirme la désinstallation dans la fenêtre de Steam. Hangar se mettra à jour tout seul.': 'Confirm the uninstall in the Steam window. Hangar will update on its own.',
  'Les paramètres Windows s\'ouvrent : désinstalle {g} depuis « Applications installées ».': 'Windows Settings is opening: uninstall {g} from “Installed apps”.',
  'Le launcher Epic s\'ouvre : désinstalle {g} depuis sa bibliothèque.': 'The Epic launcher is opening: uninstall {g} from its library.',
  '{g} a été désinstallé.': '{g} was uninstalled.',
  'Pour les jeux installés sans Steam, Epic, Ubisoft, EA ou Xbox (Roblox, Soulframe…). Hangar le lancera comme un double-clic et comptera ton temps de jeu.': 'For games installed without Steam, Epic, Ubisoft, EA or Xbox (Roblox, Soulframe…). Hangar will launch it like a double-click and count your playtime.',
  'Nom du jeu': 'Game name',
  'Astuce : pour un jeu qui se met à jour tout seul (Roblox…), choisis plutôt son raccourci du Bureau ou du menu Démarrer : il restera valable après les mises à jour.': 'Tip: for a game that updates itself (Roblox…), pick its Desktop or Start menu shortcut instead: it will keep working after updates.',
  'Annuler': 'Cancel', 'Ajouter': 'Add',

  // ---- Accueil ----
  'Bonne nuit': 'Good night', 'Bonjour': 'Good morning', 'Bon après-midi': 'Good afternoon', 'Bonsoir': 'Good evening',
  'Bonne nuit, {u}': 'Good night, {u}', 'Bonjour, {u}': 'Good morning, {u}', 'Bon après-midi, {u}': 'Good afternoon, {u}', 'Bonsoir, {u}': 'Good evening, {u}',
  '{d} de jeu ces 7 derniers jours, sur {n} jour.': '{d} played in the last 7 days, over {n} day.',
  '{d} de jeu ces 7 derniers jours, sur {n} jours.': '{d} played in the last 7 days, over {n} days.',
  'Ta dernière session : {g}, {r}.': 'Your last session: {g}, {r}.', 'Toute ta bibliothèque, réunie ici.': 'Your whole library, all in one place.',
  'Reprendre': 'Resume', '{h} h de jeu': '{h} h played', 'Pas encore de temps de jeu': 'No playtime yet',
  'Voir {g} dans la bibliothèque': 'See {g} in the library', 'Voir la fiche': 'View details',
  'Calendrier des sorties': 'Release calendar', 'Les jeux qui viennent de sortir et ceux qui arrivent sur Steam.': 'Games just released and those coming to Steam.',
  'Ta liste de souhaits Steam, plus les nouveautés et les jeux à venir.': 'Your Steam wishlist, plus new and upcoming games.',
  'Ta semaine': 'Your week', '{n} jeu lancé': '{n} game played', '{n} jeux lancés': '{n} games played',
  'Jeu le plus joué': 'Most played game', 'Journée la plus active': 'Most active day', '{s} sur le disque': '{s} on disk',
  'À redécouvrir': 'Rediscover', 'Installés, mais pas lancés depuis plus d\'un mois.': 'Installed, but not played for over a month.',
  'Impossible de charger le calendrier des sorties pour l\'instant.': 'Can\'t load the release calendar right now.',
  'Aucune sortie': 'No release', 'Semaines': 'Weeks', 'Semaine du {w}': 'Week of {w}', 'Semaine précédente': 'Previous week', 'Semaine suivante': 'Next week',
  'Cette semaine · {w}': 'This week · {w}', 'Semaine dernière · {w}': 'Last week · {w}', 'Semaine prochaine · {w}': 'Next week · {w}',
  '{n} sorties, faire défiler': '{n} releases, scroll', 'Jeux précédents': 'Previous games', 'Jeux suivants': 'Next games',
  'Sortie prévue : {d}': 'Expected release: {d}', 'Date de parution : {d}': 'Release date: {d}', 'Chargement de la description…': 'Loading description…',
  'Dans ta liste de souhaits': 'In your wishlist',

  // ---- Réglages ----
  'Langue': 'Language', 'Steam': 'Steam', 'Dossier Steam': 'Steam folder', 'Parcourir': 'Browse', 'Clé API Steam': 'Steam API key', '(facultative)': '(optional)',
  'Pour créer une clé, Steam exige Steam Guard sur ton téléphone et un compte non limité (au moins 5 $ dépensés).': 'To create a key, Steam requires Steam Guard on your phone and a non-limited account (at least $5 spent).',
  'Obtenir ma clé': 'Get my key',
  'Sans clé, l\'appli voit tes jeux installés et ceux que tu as déjà lancés. Avec une clé, elle liste aussi les jeux possédés jamais installés. Clé gratuite :': 'Without a key, the app sees your installed games and the ones you\'ve already played. With a key, it also lists owned games never installed. Free key:',
  'Dossier de données du launcher Epic': 'Epic launcher data folder', 'Ubisoft, EA, Xbox et GOG': 'Ubisoft, EA, Xbox and GOG',
  'Les jeux installés sont trouvés tout seuls, sans connexion à tes comptes. Les jeux possédés mais pas installés n\'apparaissent pas : ces launchers ne les rendent visibles qu\'une fois connecté.': 'Installed games are found automatically, without signing in to your accounts. Owned games that aren\'t installed don\'t appear: these launchers only show them once you\'re signed in.',
  'Démarrage': 'Startup',
  'Lancer au démarrage de l\'ordinateur (avec l\'intro, pour suivre le temps de jeu)': 'Launch when the computer starts (with the intro, to track playtime)',
  'Cacher Hangar pendant que je joue, et le rouvrir quand je quitte le jeu': 'Hide Hangar while I play, and reopen it when I quit the game',
  'Rechercher une mise à jour': 'Check for updates', 'Revoir la présentation': 'Replay the introduction', 'Enregistrer': 'Save',
  'Non disponible sur ce système': 'Not available on this system',
  'Steam détecté': 'Steam detected', 'Steam détecté · compte {u}': 'Steam detected · account {u}', 'Steam introuvable à cet emplacement.': 'Steam not found at this location.',
  'Launcher Epic détecté · {n} jeu installé': 'Epic launcher detected · {n} game installed', 'Launcher Epic détecté · {n} jeux installés': 'Epic launcher detected · {n} games installed',
  'Launcher Epic introuvable à cet emplacement.': 'Epic launcher not found at this location.',
  'Détectés automatiquement · {x}': 'Detected automatically · {x}', '{s} : {n} jeu': '{s}: {n} game', '{s} : 0 jeu': '{s}: 0 games', '0 jeu': '0 games', '{s} : {n} jeux': '{s}: {n} games',
  'Version {v}': 'Version {v}',

  // ---- Mise à jour de Hangar ----
  'Mise à jour {v}': 'Update {v}', 'Hangar {v} est disponible : clique pour la télécharger': 'Hangar {v} is available: click to download it',
  'Téléchargement {p} %': 'Downloading {p}%', 'Téléchargement de la mise à jour': 'Downloading the update', 'Redémarrer et installer': 'Restart and install',
  'Hangar {v} est prêt : redémarre pour l\'installer': 'Hangar {v} is ready: restart to install it',
  'La mise à jour téléchargée est invalide (fichiers de la release incohérents). Réessaie plus tard.': 'The downloaded update is invalid (inconsistent release files). Try again later.',
  'La mise à jour n\'a pas pu être téléchargée : {e}': 'The update couldn\'t be downloaded: {e}',
  'Mise à jour disponible': 'Update available', 'Quoi de neuf dans Hangar': 'What\'s new in Hangar', 'Quoi de neuf dans Hangar {v}': 'What\'s new in Hangar {v}',
  'Améliorations et corrections pour rendre Hangar plus rapide et plus fiable.': 'Improvements and fixes to make Hangar faster and more reliable.',
  'La mise à jour se télécharge en arrière-plan. Tes jeux et réglages sont conservés.': 'The update downloads in the background. Your games and settings are kept.',
  'Plus tard': 'Later', 'Recherche…': 'Checking…',
  'Les mises à jour ne fonctionnent que dans l\'appli installée.': 'Updates only work in the installed app.',
  'Hangar {v} est disponible : utilise le bouton en haut à droite.': 'Hangar {v} is available: use the button at the top right.',
  'Recherche impossible : {e}': 'Check failed: {e}', 'Hangar est à jour.': 'Hangar is up to date.',

  // ---- Présentation (premier lancement) ----
  'Bienvenue dans Hangar': 'Welcome to Hangar',
  'Tous tes jeux PC au même endroit : Steam, Epic Games, Ubisoft Connect, EA, Xbox, GOG… et même ceux sans launcher.': 'All your PC games in one place: Steam, Epic Games, Ubisoft Connect, EA, Xbox, GOG… and even those without a launcher.',
  'Joue en un clic': 'Play in one click', ': Hangar s\'efface pendant la partie et revient quand tu quittes.': ': Hangar steps aside while you play and comes back when you quit.',
  'Ta semaine de jeu': 'Your gaming week', 'et le': 'and the', 'calendrier des sorties': 'release calendar', ', sans rien noter.': ', without writing anything down.',
  'Un jeu manque ?': 'A game is missing?', 'Bouton « Ajouter un jeu » dans la bibliothèque.': '“Add a game” button in the library.',
  'Facultatif, mais recommandé': 'Optional, but recommended', 'Débloque tout avec ta clé Steam': 'Unlock everything with your Steam key',
  'Une clé API Steam est gratuite et se crée en 1 minute. Elle permet à Hangar d\'afficher :': 'A Steam API key is free and takes 1 minute to create. It lets Hangar show:',
  'Toute ta bibliothèque Steam': 'Your whole Steam library', ', même les jeux jamais installés': ', even games never installed',
  'Tes amis': 'Your friends', 'en ligne et à quoi ils jouent': 'online and what they\'re playing',
  'Tes succès': 'Your achievements', ', ceux qu\'il te manque et leur rareté': ', the ones you\'re missing and how rare they are',
  'Avant de commencer, vérifie que ton compte est éligible :': 'Before you start, check that your account is eligible:',
  'Steam Guard sur ton téléphone': 'Steam Guard on your phone',
  '(l\'authentificateur de l\'appli mobile Steam) est obligatoire : sans lui, Steam refuse de créer la clé. Il simplifie aussi la connexion, en validant d\'un clic sur ton téléphone.': '(the Steam mobile app authenticator) is required: without it, Steam won\'t create the key. It also makes signing in easier, with one tap on your phone.',
  'Un compte Steam non limité': 'A non-limited Steam account',
  ', c\'est-à-dire avec au moins 5 $ (environ 5 €) dépensés sur Steam. Un compte limité n\'a pas accès à la clé API.': ', meaning at least $5 spent on Steam. A limited account can\'t get an API key.',
  'Pas éligible ? Aucun souci : Hangar fonctionne sans clé, avec tes jeux installés et ceux que tu as déjà lancés.': 'Not eligible? No problem: Hangar works without a key, with your installed games and the ones you\'ve already played.',
  'Ouvre la page de Steam ci-dessous et connecte-toi.': 'Open the Steam page below and sign in.',
  'Dans « Nom de domaine », écris': 'In “Domain Name”, type', ', accepte les conditions, puis clique sur « Enregistrer ».': ', accept the terms, then click “Register”.',
  'Copie la clé affichée et colle-la ici.': 'Copy the key shown and paste it here.', 'Colle ta clé API Steam ici': 'Paste your Steam API key here',
  'La clé reste sur ton PC et sert uniquement à lire tes infos Steam. Tu pourras la changer dans les Réglages.': 'The key stays on your PC and is only used to read your Steam info. You can change it in Settings.',
  'Dernière étape': 'Last step', 'Rends tes jeux visibles': 'Make your games visible',
  'Pour que Steam partage ton temps de jeu, tes succès et ta liste d\'amis, règle ta confidentialité Steam ainsi :': 'For Steam to share your playtime, achievements and friends list, set your Steam privacy like this:',
  'Visibilité sur mes jeux': 'Game details', 'tout le monde': 'Public', 'Visibilité de ma liste d\'amis': 'Friends List',
  'Garder le temps total de jeu privé': 'Always keep my total playtime private', 'décoché': 'unchecked',
  'Ouvrir mes réglages de confidentialité Steam': 'Open my Steam privacy settings',
  'Un bug, une idée, un jeu qui manque ? Le bouton': 'A bug, an idea, a missing game? The', 'bulle': 'speech bubble',
  'en haut de Hangar sert à': 'button at the top of Hangar is there to', 'donner ton avis': 'give feedback', '. Je lis tout !': '. I read everything!',
  'Passer': 'Skip', 'Retour': 'Back', 'Suivant': 'Next', 'C\'est parti !': 'Let\'s go!',
  '{n} jeu trouvé': '{n} game found', '{n} jeux trouvés': '{n} games found', 'jeu trouvé': 'game found', 'jeux trouvés': 'games found',
  'Aucun jeu trouvé pour l\'instant : vérifie les dossiers dans les Réglages.': 'No game found yet: check the folders in Settings.',
  'Cette clé ne ressemble pas à une clé Steam (32 caractères, chiffres et lettres de A à F).': 'This doesn\'t look like a Steam key (32 characters, digits and letters A to F).',
  'Clé enregistrée ✓ Ta bibliothèque se complète en arrière-plan.': 'Key saved ✓ Your library is filling in in the background.',
  'Une clé est déjà enregistrée ✓': 'A key is already saved ✓',

  // ---- Amis ----
  'Amis Steam': 'Steam friends', 'Amis': 'Friends', 'Fermer la liste d\'amis': 'Close friends list',
  'En ligne': 'Online', 'Absent': 'Away', 'Occupé': 'Busy', 'Hors ligne': 'Offline', 'En jeu': 'In game',
  'Discuter avec {u} dans Steam': 'Chat with {u} in Steam', '{n} en jeu': '{n} in game', '{n} en ligne': '{n} online',
  '{a} en ligne sur {b}': '{a} online of {b}', 'Amis : {a} en jeu, {b} en ligne': 'Friends: {a} in game, {b} online',
  'En jeu · {n}': 'In game · {n}', 'En ligne · {n}': 'Online · {n}', 'Hors ligne · {n}': 'Offline · {n}',
  'Chargement de tes amis…': 'Loading your friends…',
  'Pour voir tes amis Steam et ce qu\'ils jouent, ajoute ta clé API Steam dans les Réglages.': 'To see your Steam friends and what they\'re playing, add your Steam API key in Settings.',
  'Steam ne partage pas ta liste d\'amis. Dans Steam : Profil, Modifier le profil, Paramètres de confidentialité, puis mets « Visibilité de ma liste d\'amis » sur « tout le monde ».': 'Steam doesn\'t share your friends list. In Steam: Profile, Edit Profile, Privacy Settings, then set “Friends List” to “Public”.',
  'Connecte-toi à Steam sur ce PC pour voir tes amis.': 'Sign in to Steam on this PC to see your friends.',
  'Impossible de joindre Steam pour l\'instant. Nouvel essai dans une minute.': 'Can\'t reach Steam right now. Trying again in a minute.',
  'Aucun ami dans ta liste Steam pour l\'instant.': 'No friends in your Steam list yet.',

  // ---- Notifications ----
  'Bon retour ! Fin de la partie sur {g}.': 'Welcome back! Your session on {g} has ended.',
  '{g} est maintenant dans ta bibliothèque.': '{g} is now in your library.', '{n} nouveaux jeux dans ta bibliothèque.': '{n} new games in your library.',

  // ---- Statistiques ----
  'Semaine': 'Week', 'Mois': 'Month', 'Année': 'Year', 'Depuis le début': 'All time', 'Période': 'Period',
  '7 derniers jours': 'Last 7 days', '30 derniers jours': 'Last 30 days', '12 derniers mois': 'Last 12 months', 'Toute ta bibliothèque': 'Your whole library',
  'Moyenne par jour': 'Daily average', 'Jeux lancés': 'Games played', 'Série en cours': 'Current streak', 'Succès débloqués': 'Achievements unlocked',
  'vs la semaine d’avant': 'vs the week before', 'vs les 30 jours d’avant': 'vs the previous 30 days', 'vs l’année d’avant': 'vs the year before',
  'sur tous tes launchers': 'across all your launchers', 'sur {n} jours joués': 'over {n} days played', 'sur {n} jour joué': 'over {n} day played',
  'dont {n} nouveaux': 'including {n} new', 'dont {n} nouveau': 'including {n} new', '{n} jours': '{n} days', '{n} jour': '{n} day', 'record : {n}': 'record: {n}',
  'Chargement…': 'Loading…', 'dont {n} rares (< 5 %)': 'including {n} rare (< 5%)', 'dont {n} rare (< 5 %)': 'including {n} rare (< 5%)',
  'sur tes jeux les plus joués': 'in your most played games', 'sur tes jeux Steam': 'in your Steam games', 'Ajoute ta clé Steam': 'Add your Steam key', 'Indisponible': 'Unavailable',
  'Temps de jeu par jour': 'Playtime per day', 'Temps de jeu par mois': 'Playtime per month', 'Week-end': 'Weekend',
  'Plateformes': 'Platforms', 'au total': 'in total', 'Aucun temps de jeu sur cette période.': 'No playtime in this period.',
  'Jeux les plus joués': 'Most played games', 'part du temps de jeu': 'share of playtime', 'Aucun jeu lancé sur cette période.': 'No game played in this period.',
  'Tes records': 'Your records', 'Plus grosse journée': 'Biggest day', 'Jour préféré': 'Favorite day', '{d} en moyenne': '{d} on average',
  'Jeu le plus fidèle': 'Most loyal game', 'joué {n} jours sur {m}': 'played {n} days out of {m}', 'Dernière découverte': 'Latest discovery',
  '1re session le {d}': 'First session on {d}', 'Succès le plus rare': 'Rarest achievement',
  'Lundi': 'Monday', 'Mardi': 'Tuesday', 'Mercredi': 'Wednesday', 'Jeudi': 'Thursday', 'Vendredi': 'Friday', 'Samedi': 'Saturday', 'Dimanche': 'Sunday',
  'Calendrier d\'activité': 'Activity calendar', '6 derniers mois · {n} jours joués': 'Last 6 months · {n} days played', '6 derniers mois · {n} jour joué': 'Last 6 months · {n} day played',
  'Suivi par Hangar depuis le {d}': 'Tracked by Hangar since {d}', 'suivi depuis le {d}': 'tracked since {d}', 'Moins': 'Less', 'Plus': 'More',
  'Ta bibliothèque': 'Your library', 'Jeux possédés': 'Games owned', 'sur {n} plateformes': 'across {n} platforms', 'sur {n} plateforme': 'on {n} platform',
  'Le plus lourd': 'Largest', 'Jamais lancés': 'Never played', '{p} % de la bibliothèque': '{p}% of the library', 'Jeux en attente': 'Backlog',
  '{n} installés sont prêts à jouer, sans jamais avoir été lancés.': '{n} installed games are ready to play but have never been launched.',
  'Aucun jeu installé en attente : tu as tout essayé !': 'No installed game waiting: you\'ve tried them all!',
  'Calcul de tes statistiques…': 'Crunching your stats…', 'Pas encore de temps de jeu sur cette période': 'No playtime in this period yet',
  'Hangar compte ton temps de jeu jour par jour depuis le {d}. Les graphiques se remplissent au fil de tes parties.': 'Hangar has been counting your playtime day by day since {d}. The charts fill in as you play.',
  'Hangar commence à compter ton temps de jeu jour par jour. Les graphiques se remplissent au fil de tes parties.': 'Hangar is starting to count your playtime day by day. The charts fill in as you play.',
  'Voir depuis le début': 'See all time'
};

// t('…', { n }) : texte traduit avec ses variables
function t(fr, vars) {
  let s = LANG === 'en' && EN[fr] != null ? EN[fr] : fr;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}

// ---------- Traduction de ce qui s'affiche (anglais seulement) ----------
if (LANG === 'en') {
  const exact = new Map(), patterns = [];
  const NUM = new Set(['n', 'm', 'p', 'a', 'b', 'h', 'i']);
  const esc = (x) => x.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  for (const [fr, en] of Object.entries(EN)) {
    const k = fr.replace(/\s+/g, ' ').trim();
    if (!/\{\w+\}/.test(k)) { exact.set(k, en); continue; }
    const names = [];
    // {n}, {p}… : des nombres ; {g}, {s}… : n'importe quel texte (nom de jeu, date…)
    const re = new RegExp('^' + esc(k).replace(/\{(\w+)\}/g, (_, n) => { names.push(n); return NUM.has(n) ? '(\\d[\\d.,\\s\u00a0\u202f%]*?)' : '(.+?)'; }) + '$');
    patterns.push({ re, names, en, fixed: k.replace(/\{\w+\}/g, '').length });
  }
  patterns.sort((a, b) => b.fixed - a.fixed); // le modèle le plus précis d'abord

  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const low = (x) => x.charAt(0).toLowerCase() + x.slice(1);
  function tr(text, depth = 0) {
    if (exact.has(text)) return exact.get(text);
    for (const p of patterns) {
      const m = p.re.exec(text);
      if (!m) continue;
      const vals = {};
      p.names.forEach((n, i) => { vals[n] = depth < 2 ? (trLoose(m[i + 1], depth + 1) ?? m[i + 1]) : m[i + 1]; });
      return p.en.replace(/\{(\w+)\}/g, (_, n) => vals[n] ?? '');
    }
    // textes assemblés : « Steam · Hier », « Installation · 45 % »…
    if (depth < 2 && text.includes(' · ')) {
      const parts = text.split(' · ');
      const out = parts.map((x) => trLoose(x, depth + 1) ?? x);
      if (out.some((x, i) => x !== parts[i])) return out.join(' · ');
    }
    return null;
  }
  // variables : « il y a 3 jours » (en minuscules dans une phrase)
  function trLoose(text, depth) {
    const r = tr(text, depth);
    if (r != null) return r;
    if (/^[a-zà-ÿ]/.test(text)) { const r2 = tr(cap(text), depth); if (r2 != null) return low(r2); }
    return null;
  }

  const translateText = (node) => {
    const raw = node.nodeValue;
    if (!raw || !/[A-Za-zÀ-ÿ]/.test(raw)) return;
    const norm = raw.replace(/\s+/g, ' ').trim();
    if (!norm) return;
    // morceau qui suit un autre texte : « · Mise à jour en attente »
    const dot = norm.startsWith('· ') && !exact.has(norm) ? '· ' : '';
    const r0 = tr(dot ? norm.slice(2) : norm);
    const r = r0 == null ? null : dot + r0;
    if (r == null || r === norm) return;
    const lead = /^\s/.test(raw) ? ' ' : '', trail = /\s$/.test(raw) ? ' ' : '';
    node.nodeValue = lead + r + trail;
  };
  const ATTRS = ['title', 'aria-label', 'placeholder'];
  const translateEl = (e) => {
    for (const a of ATTRS) {
      const v = e.getAttribute?.(a);
      if (!v) continue;
      const r = tr(v.replace(/\s+/g, ' ').trim());
      if (r != null && r !== v) e.setAttribute(a, r);
    }
  };
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);
  function walk(root) {
    if (root.nodeType === Node.TEXT_NODE) return translateText(root);
    if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has(root.tagName) || root.closest?.('#wn-notes')) return;
    translateEl(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (SKIP.has(n.tagName) || n.id === 'wn-notes') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    for (let n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === Node.TEXT_NODE) translateText(n); else translateEl(n); }
  }
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') translateText(m.target);
      else if (m.type === 'attributes') translateEl(m.target);
    }
  });
  const start = () => {
    walk(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    const ti = tr(document.title); if (ti) document.title = ti;
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  // le titre change aussi (aperçu)
  new MutationObserver(() => { const ti = tr(document.title); if (ti && ti !== document.title) document.title = ti; })
    .observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });
}
