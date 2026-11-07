# Revue UX secondaire — connexion Wi-Fi grand public

## Test mental novice
Une personne qui ne sait pas ce qu'est une adresse IP doit pouvoir connecter une TV compatible avec un seul choix de télévision et une validation à l'écran. L'application n'exige plus de détails réseaux pour le parcours nominal.

## Première passe UX et décisions
- L'écran de télécommande garde les commandes courantes, le mode IR utilisable et un indicateur compact.
- L'onglet Wi-Fi ouvre un écran qui commence immédiatement la recherche ; aucun bouton de recherche obligatoire.
- Chaque résultat présente « Téléviseur LG · webOS » ou « NetCast » et l'état de prise en charge ; pas de fausse association NetCast.
- Si la TV est déjà enregistrée, l'UUID permet la reconnexion automatique après scan sans exiger d'IP.
- Si rien n'est détecté, une explication simple évoque TV allumée, même box et réseau invité ; le raccourci vers la TV déjà enregistrée reste disponible.
- Les réglages IP et l'oubli des clés sont sous Options avancées, et pas dans le parcours initial.
- Les zones tactiles, icônes cohérentes, libellés TalkBack, vibration facultative et commandes IR immédiates ont été conservés.

## Contre-revue UX sceptique
- 2 TV LG : montrer 2 choix, ne pas jumeler la mauvaise TV en silence.
- TV éteinte ou VLAN invité : ne jamais afficher « connectée » sans réponse SSAP. Informer, relancer, offrir le mode IR.
- Appairage refusé : message explicite plutôt que spinner infini.
- Télécommande infra nécessaire pour accepter sur la TV : laisser l'IR disponible pendant le jumelage.
- Retour d'arrière-plan : rescanner, ne pas réutiliser un hôte potentiellement obsolète.
- Grande police/TalkBack : enchaînement de contrôles nommés, ScrollView et options derrière un déclencheur accessible.

## Critères non encore démontrés par la CI
Tests à effectuer sur POCO F3 : visibilité sur largeur 320 dp et texte 200 %, TalkBack, fermeture du panneau par Retour, efficacité de la recherche sous Wi-Fi domestique, association avec TV 2015 réelle, durée ressentie et reconnection DHCP. Les tests unitaires et le build ne remplacent pas ces validations.
