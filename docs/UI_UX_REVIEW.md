# Revue UI/UX mobile — LG CMD 1.1

## Périmètre et preuve
Audit du code de la version 1.0 et refonte implémentée en React Native. L'utilisateur a confirmé le fonctionnement IR sur POCO F3. Aucun test utilisateur formel, score de satisfaction, capture de la nouvelle application installée ou résultat sur TV physique n'est inventé. La validation visuelle finale reste à effectuer sur le téléphone.

## Problèmes prioritaires de la version 1.0

| Priorité | Constat | Effet | Correction implémentée |
| --- | --- | --- | --- |
| P1 | Paramètres IP et long statut placés avant les commandes | Défilement avant de contrôler la TV | Connexion dans un panneau ; état compact sur l'écran principal |
| P1 | Tous les chiffres et médias affichés en permanence | Trop de commandes concurrentes | Panneaux Chiffres, Lecture et Plus |
| P1 | État « connecté » sans distinction des capacités | Flèches potentiellement inopérantes sans explication | État limité et désactivation des commandes indisponibles |
| P1 | Aucun délai réseau explicite | Connexion indéfinie | Délais 8 s réseau, 45 s jumelage, 5 s requête/navigation |
| P1 | Mode Wi-Fi initial même avec émetteur IR | Configuration inutile sur POCO F3 | IR initial lorsque présent ; choix ensuite mémorisé |
| P2 | Symboles Unicode et emojis hétérogènes | Poids visuel et sens variables selon Android | Icônes SVG cohérentes sans police à télécharger |
| P2 | Marges fixes, pas de prise en compte des zones système | Risque de chevauchement des barres Android | SafeAreaProvider / SafeAreaView |
| P2 | Chaque pression ajoute du texte de statut | Bruit visuel lors d'appuis répétés | Retour tactile facultatif ; messages réservés aux erreurs/connexion |
| P2 | Une pression par cran de volume | Action pénible à une main | Appui maintenu, cadence bornée et arrêt immédiat |
| P2 | Aucun filet de tests | Régressions invisibles | Logique découplée, tests, couverture et vérification avant build |

## Direction visuelle
Fond sombre légèrement vert, surfaces différenciées, accent menthe réservé à la sélection et à OK. Icônes 24 unités, grille d'espacement cohérente, typographie système et rayon des touches constant. Pas de logo LG officiel ni d'association commerciale suggérée.

L'écran d'usage courant contient l'alimentation, le choix IR/Wi-Fi, un état compact, les flèches, retour/accueil/sources, volume et chaînes. Les outils moins fréquents sont accessibles par trois boutons identifiés. Le pavé numérique n'est plus un long bloc sous la télécommande.

## Accessibilité et comportement
Toutes les commandes disposent d'un nom accessible. Les touches font au moins 48 unités ; les commandes principales au moins 56. Les états ne reposent pas uniquement sur la couleur. Les textes gardent le redimensionnement système. Le contenu défile si la hauteur ou la taille des caractères l'exige. Le bouton Retour Android ferme les panneaux. Les panneaux respectent la préférence de réduction des animations.

Les appuis prolongés ne concernent que flèches, volume et chaînes. Ils ne répètent jamais marche/arrêt. Les répétitions et la découverte réseau s'arrêtent en arrière-plan. L'extinction Wi-Fi nécessite une confirmation car cette connexion ne peut pas rallumer la TV.

## Wi-Fi : décision produit
Le chemin principal est le réseau local : téléphone en Wi-Fi, TV sur la même box en Wi-Fi ou Ethernet. La découverte SSDP propose les appareils webOS ; l'IP manuelle reste disponible si le multicast est filtré. Une découverte NetCast est signalée sans promettre une compatibilité non implémentée.

Wi-Fi Direct n'est pas présenté comme une solution universelle. LG le documente pour le partage de médias ; la disponibilité d'une session IP ne garantit pas celle du service de télécommande. L'IR déjà fonctionnel reste le mode de secours. Sur une TV non connectée, une modification logicielle ne crée pas d'interface réseau.

Le client 1.1 cible les anciennes TV webOS exposant SSAP sur ws://IP:3000. La compatibilité TLS/3001, le PIN NetCast et le Wake-on-LAN ne sont pas revendiqués. Aucun certificat TLS n'est ignoré pour obtenir artificiellement une connexion.

## Validation à effectuer sur appareil
Comparer 1.0 et 1.1 sur POCO F3 : temps jusqu'à la première commande, nombre de défilements pour volume/source, précision des appuis et lisibilité. Vérifier les largeurs 320/360/393, les caractères à 200 %, TalkBack, les barres système et les panneaux avec clavier. Tester le jumelage sur la TV réelle avant d'affirmer que le Wi-Fi fonctionne.

## Références
- Android : https://developer.android.com/guide/topics/ui/accessibility/apps
- Expo Safe Area : https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/
- Expo SVG : https://docs.expo.dev/versions/v57.0.0/sdk/svg/
- LG TV Plus : https://kr.eguide.lgappstv.com/manual/w16/dvb/Contents/control/remoteapp_e_a_t/fre/w3a__control__remoteapp_e_a_t__fre.html
- LG Wi-Fi Direct : https://kr.eguide.lgappstv.com/manual/w16/dvb/Contents/settings/network/wifidirect_e_c_a_t/eng/w3a__settings__network__wifidirect_e_c_a_t__eng.html
- Connect SDK : https://connectsdk.com/en/latest/guide-and/and-discovery-manager.html

## Correction réactivité des touches (5 novembre 2026)
Les commandes réelles de la télécommande (alimentation IR, OK, retour, accueil, chiffres, sources, audio et médias) partent dès `onPressIn`, au toucher, et non à `onPress` lors du relâchement. Seules les touches flèches/volume/chaînes se répètent après le seuil de maintien. L’alimentation Wi-Fi conserve la confirmation au relâchement, comme les boutons de navigation de l’application, afin de limiter les déclenchements accidentels. Une touche tenue n’émet qu’un premier signal immédiat, sauf si elle est explicitement répétable.

Le retour haptique léger est délivré dès le contact via `expo-haptics` (Android `Virtual_Key`), indépendamment de la réussite de l’envoi IR. Il n’est émis qu’une fois par geste, pas à chaque répétition, et se désactive dans **Plus → Retour haptique**. Le retour dépend des réglages vibratoires du téléphone. Les touches désactivées ne vibrent pas.


## Deuxième revue contradictoire — découverte réseau (7 novembre 2026)

**Protocole :** le premier parcours doit être « Rechercher la TV » sans champ IP. Le protocole standard utilisé par les anciennes webOS est la découverte SSDP, puis un jumelage SSAP local. Le téléphone n'a pas besoin de rejoindre le Wi-Fi Direct de la TV ; il utilise le réseau domestique déjà actif. La TV peut être reliée en Ethernet à la même box. Le premier appairage doit toujours être approuvé sur la TV.

**Défaut identifié dans le code :** la découverte NetCast utilisait uniquement `urn:lge-com:service:netrcu:1`, alors que des implémentations LG NetCast/UDAP utilisent `urn:schemas-udap:service:netrcu:1`. Cela pouvait masquer une ancienne TV connectée et présenter « aucune TV détectée » à tort. Le module Android recherche maintenant les deux signatures NetCast en plus de webOS. Les appareils NetCast sont clairement affichés comme détectés mais non pilotables en Wi-Fi par notre client SSAP, plutôt que d'essayer une commande incompatible.

**Contrôle de sécurité :** seules les réponses SSDP avec signature exacte sont acceptées ; aucun lien `LOCATION` provenant d'un appareil non fiable n'est ouvert. Les clés de jumelage sont conservées sur le téléphone. La recherche est bornée, au premier plan, et la saisie IP reste dans les options avancées. Le résultat de la recherche ne doit pas être présenté comme une preuve que la TV est pilotable.

**Limites ouvertes :** cette correction ne constitue pas une implémentation du protocole UDAP/NetCast. La prise en charge réelle de la TV 2015 reste à confirmer par son modèle exact ou par une tentative d'association webOS sur le réseau local. Une découverte SSDP ne garantit pas l'absence d'isolation Wi-Fi invité, de pare-feu, ou de restrictions du firmware.
