# Tests et critères de livraison

## Exécutés localement
- `npm test` : 68 tests réussis, aucune dépendance native requise.
- `npm run test:coverage` : noyau `src/core/*.ts` uniquement ; 100 % des lignes, 93,64 % des branches, 95,92 % des fonctions lors de cette exécution. Ces chiffres ne couvrent NI l'interface React NI Kotlin.
- Vérification TypeScript stricte du noyau : réussie avec TypeScript 5.8.3 disponible localement. La vérification du projet complet utilise TypeScript 6 du projet en CI.

## Tests automatiques
Les tests n'utilisent pas le réseau réel, de délais réels ou de secrets. Des WebSockets, une horloge et un stockage injectés vérifient l'appairage, le refus, les déconnexions, les réponses malformées, les requêtes concurrentes, les temporisations, les sources, le mute, les commandes et la non-divulgation des clés. Des tests de régression vérifient les 36 codes IR existants.

`npm run verify` impose la couverture minimale du noyau, les tests, TypeScript et la cohérence des dépendances Expo. Le hook EAS post-install bloque la compilation si ces vérifications échouent. Le workflow GitHub vérifie aussi le bundle Android avec Metro.

Un vrai `package-lock.json` doit être généré par npm, jamais reconstitué à la main. Le workflow GitHub conserve celui de la vérification réussie et le commit sur la branche de refonte. Les installations suivantes utilisent `npm ci`. Le hook de bootstrap EAS n'agit que si le verrou est absent et ne réécrit jamais un verrou existant.

## Parcours UI préparés, non exécutés ici
Installer l'APK sur un émulateur ou un appareil, puis :

```sh
maestro test .maestro/smoke.yml
maestro test .maestro/invalid-ip.yml
```

Le premier vérifie les panneaux et réglages sans exiger un émetteur IR. Le second vérifie le rejet d'une adresse publique. Une exécution Maestro n'est pas un test de signal IR ou de TV physique.

## Validation matérielle obligatoire
1. POCO F3 : marche/arrêt, navigation, volume, source. Vérifier que l'appui prolongé s'arrête immédiatement au relâchement, au verrouillage et au changement d'application.
2. Wi-Fi : TV allumée sur la même box, détection puis acceptation de la demande. Tester également l'IP manuelle si le routeur bloque SSDP.
3. Déconnecter le réseau, refuser le jumelage, éteindre la TV : messages explicites, aucune boucle de reconnexion ou rafale de commandes différées.
4. NetCast/non-Smart/TLS uniquement : afficher la limite ; utiliser IR. Aucun succès fictif.
5. TalkBack, tailles de texte 100/200 %, petites largeurs et clavier ouvert : aucun contrôle inaccessible ; tous les éléments interactifs nommés.
6. Mise à jour APK : même package et signature EAS, versionCode 2 ; ne pas désinstaller l'ancienne application pour conserver les clés.

## Limitations connues
L'accès réseau du conteneur de développement n'a pas permis d'installer les dépendances npm ici. Les tests du noyau ont réellement tourné ; le rendu natif, le bundling complet, la compilation Kotlin, les scénarios Maestro et le jumelage physique doivent être vérifiés séparément en CI/sur appareil. Le résultat d'un build cloud doit être lu, pas présumé.

## Tests additionnels de réactivité (5 novembre 2026)
Six tests de régression couvrent l’envoi immédiat sans répétition, la sécurité des boutons d’alimentation, la suppression des doublons au relâchement, les touches désactivées, l’activation accessible et l’annulation. Le retour tactile se déclenche dès le contact, sans attendre la promesse asynchrone du module infrarouge. À valider encore avec la vibration réelle du POCO F3 et le récepteur LG : les tests unitaires ne prouvent pas la perception tactile ni la portée IR.

## Revue Wi-Fi 1.2.1 — validations supplémentaires
Les nouveaux tests vérifient l'identité SSDP stable, le renouvellement DHCP, les téléviseurs non correspondants, la confidentialité du jeton et du code, le type de jumelage PIN/PROMPT, les délais et les codes IR inchangés. L'intégration n'est pas considérée fonctionnelle sur la TV de l'utilisateur sans test matériel : la CI seule n'observe ni le multicast Android réel ni le code affiché sur la TV.

## Réactivité IR sous recherche Wi-Fi (seconde revue)
Test matériel nécessaire : avec découverte SSDP en cours, passer en mode infrarouge et envoyer OK/Volume ; l'événement doit être immédiat, sans attente de fin de scan. Le module de découverte Kotlin utilise désormais Dispatchers.IO et n'occupe plus la file partagée Expo AsyncFunction. Aucun test unitaire JavaScript ne peut mesurer à lui seul le temps de réponse du matériel IR.


## 8 novembre 2026 — diagnostic d'une TV détectée mais déconnectée
Le diagnostic SSAP indique maintenant le stade de fermeture du canal local de commande sans afficher l'IP, le token ou une réponse réseau non filtrée : `WS3000-OPEN-…`, `WS3000-PAIR-…`, `WS3000-ACTIVE-…` ou `SSAP-401/403/ERR`. Les erreurs WebSocket Android peuvent être suivies d'une fermeture ; le traitement attend brièvement la fermeture pour récupérer le code et évite les doublons.
Une clé précédemment enregistrée peut être réessayée une seule fois, sans clé, si la TV ferme la session avant le jumelage ou signale une clé invalide. Aucun réessai automatique après un refus explicite de l'utilisateur. L'IP et les clés ne sont jamais journalisées dans l'interface.
Tests déterministes ajoutés pour les phases, les refus, la sécurité des clés et l'absence de boucle. La détection SSDP ne prouve toujours pas le support SSAP sur port 3000 ; certains firmwares utilisent un port sécurisé 3001 avec certificats LG non reconnus par Android. Aucune désactivation de la vérification TLS n'est implémentée.
