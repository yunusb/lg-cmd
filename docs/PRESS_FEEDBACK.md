# Réactivité des touches et retour haptique

## Diagnostic vérifié
Dans la version stable 1.0, `Btn` utilisait `Pressable.onPress` : l'envoi était déclenché au relâchement, sans seuil explicite d'appui long. Cela peut expliquer la sensation signalée ; aucune mesure de latence sur le POCO F3 ou de réception IR sur la TV n'a été effectuée ici.

Dans la première refonte, les touches répétables n'envoyaient leur première commande qu'au relâchement ou au premier tick à 380 ms. Le retour haptique était exécuté après la fin de l'envoi asynchrone. Ces deux points sont corrigés.

## Comportement
- Flèches, volume et chaînes : première commande dès `onPressIn`, puis répétition après 380 ms, espacée de 180 ms. Pas de commande supplémentaire au relâchement.
- Autres commandes : clic court au relâchement, sans durée minimale de maintien. Marche/arrêt et les actions de navigation de l'application ne sont jamais répétées ni exécutées en avance pendant un défilement.
- Une légère impulsion tactile au premier contact avec une touche active. Pas d'impulsion différée après transmission, ni de vibration à chaque répétition.
- Le retour confirme le toucher, pas la réception par la TV. L'IR n'apporte pas d'accusé de réception dans cette application.
- Option `Plus → Retour haptique`, activée par défaut, mémorisée et désactivable. Le réglage existant est conservé.
- Android : `performAndroidHapticsAsync(AndroidHaptics.Virtual_Key)` ; pas de longue vibration forcée. Les réglages et capacités du système restent applicables.
- Arrêt des répétitions au touch-end/press-out, annulation, perte de focus Android, arrière-plan, changement de mode/panneau, désactivation et démontage.
- Activation d'accessibilité : une seule action, sans obligation de contact physique ni répétition.

Le module Kotlin d'émission, les codes IR, la fréquence et les impulsions n'ont pas été modifiés : ils fonctionnaient déjà sur la TV de l'utilisateur.

## Tests réellement exécutés
25 tests ajoutés dans `tests/press.test.mjs`, tous réussis localement avec Node 22.16. Ils utilisent des callbacks simulés et une horloge contrôlée : aucune vibration matérielle ou TV n'est simulée comme une validation physique.

```sh
node --experimental-strip-types --test tests/press.test.mjs
npm run verify
```

La première commande a été exécutée localement. La suite complète, TypeScript et Metro sont à vérifier dans la CI de ce commit ; ne pas déduire une réussite native de ces tests unitaires.

## Validation matérielle restante
Sur le nouvel APK : taps brefs sur volume/OK/alimentation, maintien puis relâchement du volume, défilement sans activation intempestive de l'alimentation, TalkBack, retour haptique activé/désactivé, ouverture du volet de notifications pendant un maintien. Une commande déjà émise ne peut pas être annulée rétroactivement.

Références :
- https://reactnative.dev/docs/pressable
- https://docs.expo.dev/versions/v57.0.0/sdk/haptics/
