# Investigation réseau — revue A, correction, contre-revue B
Date : 7 novembre 2026

## Protocole retenu
Si téléphone et TV sont sur le même réseau domestique, le téléphone n'a pas à connaître l'adresse IP à l'avance. Sur webOS, rechercher le service LG par SSDP/UPnP, puis utiliser le canal local SSAP WebSocket avec autorisation sur la TV. LG 2015 n'est pas un seul OS : webOS 2.0 et NetCast 4.5 existent, nécessitant SSAP ou UDAP respectivement.

Références :
- https://webostv.developer.lge.com/develop/specifications/comparison-netcast
- https://webostv.developer.lge.com/more/netcast/platform-specifications
- https://connectsdk.com/en/latest/discover/overview.html
- https://connectsdk.com/en/latest/guide-and/and-discovery-manager.html
- https://developer.android.com/reference/android/net/wifi/WifiManager.MulticastLock
- https://webostv.developer.lge.com/assets/netcast/NetCast-UDAP.pdf

## Revue A — défauts de la version précédente
- P0 expérience : découverte native existante mais recherche non automatique à l'entrée du Wi-Fi.
- P1 usage : écran imposant un vocabulaire technique et une saisie IP en haut du formulaire.
- P1 persistance : seul le dernier hôte/IP était mémorisé ; après DHCP différent le raccourci cessait de fonctionner.
- P1 comportement : aucune réassociation automatisée au prochain lancement Wi-Fi.
- P2 performance : recherches de durée fixe 6,5 s même lorsque la TV avait répondu.
- P2 sécurité : une IP attribuée à un nouvel appareil ne doit pas suffire à sélectionner silencieusement une TV.
- P2 compatibilité : une annonce NetCast ne signifie pas que le client SSAP sait la contrôler.

## Correctifs
- Rechercher automatiquement à l'ouverture du mode Wi-Fi ; liste de téléviseurs sans IP, avec validation obligatoire lors de la première association.
- Après jumelage accepté, mémoriser le UUID SSDP normalisé et l'adresse courante. À la session suivante, chercher le UUID. Si l'adresse change, le bon appareil est retrouvé.
- Stocker la clé d'autorisation webOS sous le UUID dans SecureStore lorsque l'identifiant est disponible ; garder le chemin IP pour le contrôle manuel historique.
- SSDP sur le Wi-Fi Android, deux vagues de requêtes, retour anticipé si la TV préférée est reconnue ou après silence des autres, durée maximale 6,2 s ; socket et MulticastLock libérés dans finally.
- Réessayer l'ancienne adresse uniquement sur action explicite si la découverte échoue. Pas de connexion automatique aveugle à la première IP historique.
- NetCast détecté mais affiché non pilotable tant qu'une implémentation UDAP n'est pas développée et testée.

## Contre-revue B — hypothèses non prouvées et risques
- Les réponses SSDP ne sont pas cryptographiquement authentifiées ; réseau domestique de confiance et jumelage sur la TV requis.
- Un routeur peut isoler ses clients ou filtrer le multicast même si les appareils ont un réseau Wi-Fi semblable : informations visibles, nouvelle recherche et dernier hôte accessibles sans saisie manuelle.
- Une TV en Ethernet peut être sur le même LAN ; inutile d'exiger le même SSID physique.
- Si deux TV sont détectées, ne pas choisir arbitrairement la première.
- Une TV LG peut être webOS, NetCast ou non Smart ; la compatibilité doit être affichée sans fausse promesse.
- L'ancien SSAP en ws/3000 n'est pas chiffré ; aucun contournement de certificat, aucune ouverture de port Internet, aucun URL LOCATION SSDP arbitraire ouvert.
- Le multicast ne doit ni tourner en tâche de fond ni garder la batterie éveillée ; annulation des recherches lors de la fermeture et de la mise en arrière-plan.
- Les tests unitaires du protocole ne remplacent pas une capture réelle des paquets, l'affichage de l'autorisation sur la TV, ni un test de production en appartement avec plusieurs LG.

## Validation restante sur appareil
Rechercher dans une maison avec une ou plusieurs TV, accepter/refuser le jumelage, redémarrer l'application, provoquer un changement de DHCP, couper le multicast et vérifier le secours manuel. Le POCO F3 et le modèle LG réel sont indispensables pour déclarer le Wi-Fi fonctionnel.

## Correctif de seconde revue : méthode de jumelage par code PIN
Le guide officiel LG TV Plus décrit l'association par affichage d'un PIN sur la TV, même si d'autres clients utilisent la confirmation PROMPT. Le client SSAP accepte donc désormais la demande de code PIN reçue dans une réponse de registration ou une initiation manuelle « La télévision affiche un code PIN ». L'application envoie le code via ssap://pairing/setPin et ne l'enregistre pas. Validation strictement numérique 4 à 8 chiffres, code refusé pouvant être ressaisi. L'écran conserve la possibilité d'accepter une confirmation classique et de revenir à l'IR.
Sources : https://www.lgappstv.com/manual/w16_mr/atsc/Contents/control/remoteapp_k_u_b/enga/w3a__control__remoteapp_k_u_b__enga.html ; https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/webos/WebOSTVServiceSocketClient.java
Limite : le protocole SSAP PIN est implémenté d'après la documentation ConnectSDK, mais il faut encore le tester sur le téléviseur précis de l'utilisateur.
