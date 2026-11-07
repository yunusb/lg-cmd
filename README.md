# LG CMD 1.2 — Télécommande LG pour Android

Télécommande personnelle non officielle pour LG LCD/LED. Le POCO F3 dispose d'un émetteur IR et les codes infrarouges fonctionnels ont été préservés. Projet Expo/React Native et Kotlin Android.

## Associer une TV en Wi-Fi, sans adresse IP

1. Allumer la TV et connecter le téléphone à la même box Wi-Fi. La TV peut être raccordée à la box par Wi-Fi ou Ethernet.
2. Choisir Wi-Fi dans l'application : la découverte SSDP se lance automatiquement.
3. Sélectionner la TV trouvée. Selon le modèle, accepter la demande sur son écran **ou saisir dans l'application un code PIN affiché par la TV**. Le code n'est jamais enregistré.
4. Lors des prochaines utilisations, l'application recherche en priorité l'identifiant SSDP stable de la TV déjà approuvée. Un changement d'IP DHCP n'oblige plus à ressaisir une adresse.
5. Si le routeur bloque la découverte, sélectionner « Réessayer ma TV enregistrée » pour tenter l'ancienne adresse avec une action explicite. La saisie d'adresse est cachée sous Options avancées.

La recherche SSDP est locale, bornée et annulable. Aucun compte LG, géolocalisation, scan de sous-réseau ou service permanent.

## Compatibilité

- Infrarouge : téléphones avec émetteur matériel, notamment POCO F3. Sans réseau, sans compte.
- Wi-Fi : anciennes LG webOS dont le protocole SSAP fonctionne sur ws://IP:3000, avec jumelage accepté sur la TV.
- Certains modèles LG 2015 sont NetCast : découverte et identification possibles, mais contrôle réseau NetCast/UDAP non implémenté. Utiliser IR.
- Les TV non Smart, webOS exigeant WSS/3001 uniquement et Wake-on-LAN ne sont pas contrôlables en Wi-Fi par cette version.
- Wi-Fi Direct n'est pas nécessaire : même réseau domestique local. Ne jamais exposer le port TV sur Internet.
- Expo Go ne contient pas les modules Kotlin IR et SSDP : installer un APK EAS.

## Commandes

Node 22.16+, projet Expo déjà associé :

    npm ci
    npm run verify
    npx eas-cli build --platform android --profile preview

Identifiant EAS : d4c12bb7-ce55-478f-a5b7-b519275a775f.
Package Android : com.yunusb.lgcmd ; version 1.2.3 / versionCode 7.
L'APK EAS doit utiliser la même signature Android pour mettre à jour l'application installée.

## Conception et contrôle qualité

- src/core/network.ts : validation d'IP, normalisation des identités SSDP, filtrage strict.
- src/core/tvMemory.ts : retrouver la TV préférée via UUID, non par IP.
- src/core/webos.ts : SSAP et clés SecureStore indexées par UUID quand connu.
- src/useRemote.ts : recherche à l'entrée du Wi-Fi, reconnexion et secours explicite.
- modules/lg-infrared : émission IR inchangée ; recherche SSDP native à durée bornée.
- docs/NETWORK_REVIEW.md : audit protocole et revue de sécurité.
- docs/UX_SECOND_REVIEW.md : revue UX et contre-revue sceptique.
- tests : tests unitaires. GitHub Actions contrôle les types, la compatibilité Expo et le bundle JS Android.
- .maestro : parcours UI préparés, non réputés exécutés sans émulateur/appareil réel.

IMPORTANT : passer une compilation Expo ou des tests unitaires ne prouve pas le jumelage sur une télévision réelle. La compatibilité Wi-Fi et les critères TalkBack nécessitent un test sur POCO F3 et sur la LG concernée ; garder le mode infrarouge.

La recherche se suspend en arrière-plan et reprend en avant-plan, seulement si l'utilisateur se trouve dans le parcours Wi-Fi.

La découverte Android passe par une Coroutine Expo avec Dispatchers.IO pour ne pas monopoliser la file de fonctions natives qui sert aussi à l'infrarouge. La réactivité IR pendant la recherche doit encore être vérifiée sur POCO F3.
