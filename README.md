# LG CMD 1.1 — LG Remote

Télécommande Android personnelle et non officielle, en Expo SDK 57 / React Native. Le mode infrarouge de la version 1.0 a été confirmé fonctionnel sur POCO F3 par l'utilisateur. La refonte préserve ces codes et le module d'émission.

## Version 1.1
Icônes vectorielles, pavé directionnel central, panneaux Chiffres/Lecture/Plus, zones système prises en compte, noms TalkBack, retour haptique facultatif et appuis prolongés bornés. Le mode IR est choisi initialement sur les appareils équipés.

Le Wi-Fi propose une découverte SSDP locale et une saisie IP manuelle. Le client distingue connexion, jumelage, navigation disponible, capacité limitée et erreur. Il annule les requêtes à la déconnexion et n'exécute pas de commandes en différé après reconnexion.

## Compatibilité réelle
- IR : émetteur matériel requis ; POCO F3 compatible. Aucun accessoire ni réseau nécessaire.
- Wi-Fi : ancienne LG Smart TV webOS avec service SSAP accessible sur le port 3000. Même réseau local ; TV en Wi-Fi ou Ethernet. Accepter le jumelage sur la TV et activer LG Connect Apps si disponible.
- Une TV NetCast détectée est signalée, mais son protocole n'est pas implémenté.
- Wi-Fi Direct, TLS/3001 et Wake-on-LAN ne sont pas annoncés comme pris en charge. L'IR reste disponible pour allumer et valider le jumelage.
- Expo Go ne contient pas les modules Android IR/découverte. Utiliser l'APK EAS.

## Installation et contrôles
Node.js 22.16 ou plus récent :

```sh
npm ci              # utiliser npm install seulement pour le bootstrap sans verrou
npm run verify      # tests + couverture du noyau + types + versions Expo
npx expo start
npx eas-cli build --platform android --profile preview
```

Projet EAS : `d4c12bb7-ce55-478f-a5b7-b519275a775f`. Package inchangé : `com.yunusb.lgcmd`. Version Android : 1.1.0 / code 2.

Les pushes `main` et `ui-ux-wifi-v2` sont configurés pour déclencher un APK `preview` via EAS. Le hook post-install impose les contrôles avant Gradle. Les clés de signature restent chez EAS ; ne pas les mettre dans le dépôt.

## Architecture
- `src/core/` : réseau, machine d'état SSAP et répétition ; aucune dépendance React/Expo.
- `src/useRemote.ts` : cycle de vie Android, préférences et routage IR/Wi-Fi.
- `src/ui/` : composants accessibles, icônes SVG et thème.
- `modules/lg-infrared/` : émetteur IR original + module de découverte SSDP séparé.
- `tests/` : tests Node déterministes ; horloge et WebSockets simulés.
- `.maestro/` : parcours UI à exécuter sur appareil/émulateur.
- `docs/UI_UX_REVIEW.md` : audit, décisions et critères d'acceptation.
- `docs/TEST_PLAN.md` : résultats effectivement obtenus et limites.

## Confidentialité et sécurité
Pas de compte LG, de backend, de publicité ou de télémétrie. Clés de jumelage stockées dans Expo SecureStore ; sauvegarde Android désactivée. Seules les IP locales canoniques sont admises ; aucune résolution DNS. Les sockets de navigation sont restreints à la TV jumelée. Les réponses SSDP ne déclenchent pas de requête vers un champ LOCATION arbitraire. Recherche bornée à la demande, annulable, sans scan de sous-réseau ni service permanent.

L'ancien protocole webOS utilise une liaison locale non chiffrée : réserver l'application à un réseau de confiance, ne jamais exposer le port 3000 sur Internet. Aucun contournement de certificat TLS.

## Statut
Les tests du noyau sont exécutables sans dépendances natives. Le résultat d'une compilation ne prouve pas le fonctionnement sur TV : la découverte, le jumelage et le rendu doivent être validés sur l'appareil cible. Voir le plan de test pour les résultats exacts.
