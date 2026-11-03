# LG CMD — télécommande Android LG 2015

Projet **Expo + React Native + TypeScript**, prêt à être compilé en **APK Android** avec Expo EAS. Projet personnel **non officiel**, sans affiliation à LG.

## Compatibilité

- **Wi-Fi** : LG Smart TV prenant en charge **LG webOS / SSAP**. Téléphone et TV sur le même réseau local. Les LG webOS 1.x/2.x utilisent généralement le port 3000. Accepter la demande de jumelage à l'écran.
- **Infrarouge** : télévision LG LCD/LED et téléphone Android ayant un **émetteur IR physique**. Codes LG/NEC à 38 kHz, susceptibles de varier selon le modèle.
- **Expo Go** : le module infrarouge n'est pas inclus. Il faut un **APK EAS** (ou Development Build) pour utiliser l'IR.
- **Power Wi-Fi** : la commande éteint la télévision, mais ne peut pas la rallumer par SSAP. En infrarouge, elle peut allumer et éteindre.

## APK Android

Le projet utilise l'ID Expo EAS :

d4c12bb7-ce55-478f-a5b7-b519275a775f

Avec Node.js 22.13 ou plus récent, dans le dossier du projet :

~~~bash
npm install
npm install --global eas-cli
eas login
npx expo-doctor
eas build --platform android --profile preview
~~~

Puis ouvrir le lien APK fourni par EAS sur le téléphone Android pour l'installer. Si nécessaire, autoriser l'installation de cette source dans les paramètres Android.

**Important : le dépôt contient les sources, pas un APK déjà compilé.** Le compte Expo connecté doit avoir accès au projet EAS ci-dessus. Une première compilation et une configuration des identifiants Android peuvent être nécessaires.

## Build automatique depuis GitHub

Lier le dépôt dans **expo.dev → Project settings → GitHub**. Le fichier .eas/workflows/build-android.yml configure une compilation du profil preview sur les pushes dans main, une fois les autorisations et éventuels prérequis EAS établis. Il est aussi possible de lancer le build depuis la page du projet Expo.

## Utilisation

1. Allumer la TV LG. En mode **Wi-Fi**, entrer son IP locale dans l'application (ex. 192.168.1.20) et appuyer sur **Connecter**.
2. Accepter la demande de jumelage sur la TV. Les identifiants sont mémorisés localement avec expo-secure-store.
3. Utiliser les flèches, volume, chaînes, chiffres, lecture et la liste des sources HDMI.
4. En mode **Infrarouge**, pointer le haut du téléphone vers la TV et appuyer sur les touches.

Si la TV n'est pas Smart/webOS, utiliser l'IR avec un téléphone compatible.

## Organisation

- App.tsx : interface de la télécommande.
- src/webos.ts : appairage et commandes LG webOS/SSAP.
- src/remote-keys.ts : codes infrarouges LG/NEC.
- modules/lg-infrared/ : module Kotlin ConsumerIrManager pour Android.
- plugins/withCleartextForLocalWebOS.js : autorise les WebSockets locaux non chiffrés nécessaires à certaines anciennes TV.
- eas.json : profils Android APK et AAB.
- .eas/workflows/build-android.yml : workflow EAS.

## État et limites

Le code a été préparé, mais **n'a pas encore été compilé ni testé sur une télévision physique**. Une première compilation peut demander des corrections. Les TV LG NetCast ou LCD non Smart ne sont pas contrôlables en Wi-Fi avec ce protocole. Ne jamais exposer le port de commande LG sur Internet ; l'application ne se connecte qu'à une IP locale.

Références : [Expo EAS](https://docs.expo.dev/build/introduction/), [Expo modules](https://docs.expo.dev/modules/get-started/), [ConsumerIrManager Android](https://developer.android.com/reference/android/hardware/ConsumerIrManager).
