import React from 'react';
import { ActivityIndicator, Alert, ScrollView, StatusBar, StyleSheet, Switch,
  Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { type RemoteKey } from './src/remote-keys';
import { useRemote } from './src/useRemote';
import { FeedbackPressable, Key, Sheet, s } from './src/ui/Controls';
import { FeedbackProvider } from './src/ui/Feedback';
import { Icon, type IconName } from './src/ui/Icon';
import { theme as t } from './src/ui/theme';

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; revision: number }> {
  state = { failed: false, revision: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <SafeAreaView style={styles.screen}><View style={styles.content}>
      <Text style={styles.title}>L’écran n’a pas pu s’afficher.</Text>
      <Text style={s.muted}>Votre TV et vos réglages n’ont pas été modifiés.</Text>
      <Key label="Réessayer" onPress={() => this.setState(v => ({ failed: false, revision: v.revision + 1 }))} />
    </View></SafeAreaView>;
    return <React.Fragment key={this.state.revision}>{this.props.children}</React.Fragment>;
  }
}
export default function App() {
  return <SafeAreaProvider><Boundary><RemoteScreen /></Boundary></SafeAreaProvider>;
}
function RemoteScreen() {
  const r = useRemote();
  const [advanced, setAdvanced] = React.useState(false);
  const key = (command: RemoteKey, label: string, icon?: IconName, repeat = false) =>
    <Key label={label} icon={icon} disabled={!r.available(command)} repeat={repeat} immediate
      onPress={() => void r.send(command)} style={{ flex: 1 }} />;
  const power = () => {
    if (r.mode === 'wifi') Alert.alert('Éteindre la TV ?', 'Le Wi-Fi ne pourra pas la rallumer. Utilisez le mode infrarouge.', [
      { text: 'Annuler', style: 'cancel' }, { text: 'Éteindre', onPress: () => void r.send('POWER') },
    ]);
    else void r.send('POWER');
  };
  const connectionLabel = r.mode === 'ir' ? r.irReady ? 'Infrarouge prêt' : 'Émetteur non détecté' :
    r.wifiReady ? 'TV LG connectée en Wi-Fi' : r.snapshot.state === 'pin' ? 'Code de la TV à saisir' : r.snapshot.state === 'pairing' ? 'Autoriser sur la TV' :
    r.snapshot.state === 'connecting' ? 'Connexion à la TV…' : r.scanning ? 'Recherche de la télévision…' : 'Trouver une TV LG';
  const notice = r.error || (r.mode === 'wifi' && r.snapshot.state === 'error' ? r.snapshot.message : '');
  const close = () => { r.closeConnection(); };

  return <FeedbackProvider enabled={r.haptics} interactionKey={`${r.mode}:${r.panel ?? 'remote'}`}><SafeAreaView style={styles.screen}>
    <StatusBar barStyle="light-content" />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.logo}><Icon name="tv" color={t.accent} size={27} /></View>
        <View style={{ flex: 1 }}><Text style={styles.title} accessibilityRole="header">LG Remote</Text>
          <Text style={s.muted}>Votre TV, simplement.</Text></View>
        <Key label={r.mode === 'ir' ? 'Marche ou arrêt' : 'Éteindre la TV'} icon="power" danger
          disabled={!r.available('POWER')} immediate={r.mode === 'ir'} onPress={power} style={{ width: 56 }} />
      </View>

      <View style={styles.segment}>
        {(['ir', 'wifi'] as const).map(mode => <FeedbackPressable key={mode} accessibilityRole="tab"
          accessibilityLabel={mode === 'ir' ? 'Mode infrarouge' : 'Mode Wi-Fi'} accessibilityState={{ selected: r.mode === mode }}
          onPress={() => r.chooseMode(mode)} style={[styles.mode, r.mode === mode && styles.selected]}>
          <Icon name={mode} size={20} color={r.mode === mode ? t.ink : t.muted} />
          <Text style={[styles.modeText, { color: r.mode === mode ? t.ink : t.muted }]}>{mode === 'ir' ? 'Infrarouge' : 'Wi-Fi'}</Text>
        </FeedbackPressable>)}
      </View>

      <FeedbackPressable onPress={r.openConnection} accessibilityRole="button" accessibilityLabel="Rechercher ou configurer une télévision LG"
        style={styles.connection}>
        <View style={[styles.dot, { backgroundColor: (r.mode === 'ir' ? r.irReady : r.wifiReady) ? t.accent : t.muted }]} />
        <View style={{ flex: 1 }}><Text style={styles.connectionTitle}>{connectionLabel}</Text>
          <Text style={styles.hint}>{r.mode === 'ir' ? 'Pointez le haut du téléphone vers la TV' : 'Même réseau domestique, sans adresse IP à saisir'}</Text></View>
        <Icon name="right" size={20} color={t.muted} />
      </FeedbackPressable>
      {!!notice && <View style={styles.notice} accessibilityLiveRegion="polite"><Text style={[s.muted, { flex: 1, color: t.danger }]}>{notice}</Text>
        {!!r.error && <Key label="Masquer le message" icon="close" onPress={r.clearError} style={{ minHeight: 48 }} />}</View>}

      <View style={styles.pad}>
        <View style={styles.padRow}><View style={styles.empty} />{key('UP', 'Haut', 'up', true)}<View style={styles.empty} /></View>
        <View style={styles.padRow}>{key('LEFT', 'Gauche', 'left', true)}
          <Key label="Valider" text="OK" accent immediate disabled={!r.available('OK')} onPress={() => void r.send('OK')} style={styles.ok} />
          {key('RIGHT', 'Droite', 'right', true)}</View>
        <View style={styles.padRow}><View style={styles.empty} />{key('DOWN', 'Bas', 'down', true)}<View style={styles.empty} /></View>
      </View>
      <View style={s.row}>
        <Key label="Retour" icon="back" caption immediate disabled={!r.available('BACK')} onPress={() => void r.send('BACK')} style={styles.flex} />
        <Key label="Accueil" icon="home" caption immediate disabled={!r.available('HOME')} onPress={() => void r.send('HOME')} style={styles.flex} />
        <Key label="Sources" icon="source" caption immediate disabled={!r.available('SOURCE')} onPress={() => void r.send('SOURCE')} style={styles.flex} />
      </View>
      <View style={[s.row, { gap: 8 }]}>
        <View style={styles.rocker}><Text style={styles.rockerLabel}>VOLUME</Text><View style={[s.row, { gap: 8 }]}>
          {key('VOLUME_DOWN', 'Baisser le volume', 'minus', true)}{key('VOLUME_UP', 'Augmenter le volume', 'plus', true)}
        </View></View>
        <Key label="Muet" icon="mute" immediate disabled={!r.available('MUTE')} onPress={() => void r.send('MUTE')} style={{ width: 52 }} />
        <View style={styles.rocker}><Text style={styles.rockerLabel}>CHAÎNES</Text><View style={[s.row, { gap: 8 }]}>
          {key('CHANNEL_DOWN', 'Chaîne précédente', 'minus', true)}{key('CHANNEL_UP', 'Chaîne suivante', 'plus', true)}
        </View></View>
      </View>
      <View style={styles.bottom}>
        <Key label="Chiffres" icon="keypad" caption onPress={() => r.setPanel('numbers')} style={styles.flex} />
        <Key label="Lecture" icon="play" caption onPress={() => r.setPanel('media')} style={styles.flex} />
        <Key label="Plus" icon="more" caption onPress={() => r.setPanel('more')} style={styles.flex} />
      </View>
      <Text style={styles.footer}>LG CMD 1.1 · Télécommande non officielle</Text>
    </ScrollView>

    <Sheet title="Trouver votre télévision" visible={r.panel === 'connection'} onClose={close}>
      <Text style={s.text} accessibilityRole="header">Connexion Wi-Fi automatique</Text>
      <Text style={s.muted}>Allumez la télévision. Elle doit être connectée à la même box que ce téléphone, en Wi-Fi ou par câble réseau.</Text>
      {r.scanning && <View style={s.row} accessibilityLiveRegion="polite">
        <ActivityIndicator color={t.accent} />
        <View style={styles.flex}><Text style={s.text}>Recherche des TV LG…</Text>
          <Text style={s.muted}>Cela prend généralement quelques secondes.</Text></View>
        <Key label="Arrêter la recherche" icon="close" onPress={() => r.stopScan(true)} />
      </View>}
      {r.devices.map((tv, i) =>
        <FeedbackPressable key={tv.id + tv.host} accessibilityRole="button" disabled={tv.protocol !== 'webos'}
          accessibilityState={{ disabled: tv.protocol !== 'webos' }}
          accessibilityLabel={tv.protocol === 'webos' ? 'Associer ' + tv.label + ', télévision numéro ' + (i + 1) : 'LG NetCast, télécommande réseau non compatible'}
          onPress={() => r.connectDevice(tv)} style={styles.device}>
          <Icon name="tv" color={tv.protocol === 'webos' ? t.accent : t.muted} />
          <View style={styles.flex}>
            <Text style={s.text}>{tv.label}{r.devices.length > 1 ? ' ' + (i + 1) : ''}</Text>
            <Text style={s.muted}>{tv.protocol === 'webos' ?
              'Touchez pour jumeler avec cette télévision' :
              'Ancien système NetCast : utilisez l’infrarouge'}</Text>
          </View>
          {tv.protocol === 'webos' && <Icon name="right" />}
        </FeedbackPressable>
      )}
      {r.scanned && !r.scanning && !r.devices.length && !r.scanCancelled && !r.error &&
        <View style={styles.help}>
          <Text style={s.text}>Aucune TV LG détectée</Text>
          <Text style={s.muted}>Vérifiez que la TV est allumée, sur la même box et hors réseau « invité ». Sur certaines LG, activez Paramètres → Réseau → LG Connect Apps.</Text>
        </View>
      }
      {r.scanCancelled && <Text style={s.muted}>Recherche interrompue. Vous pouvez la relancer.</Text>}
      {r.scanned && !r.scanning && r.hasSavedTv && !r.wifiReady &&
        <View style={styles.help}>
          <Text style={s.text}>Télévision déjà associée ?</Text>
          <Text style={s.muted}>Si la recherche n’a pas trouvé votre TV, essayez de la retrouver à sa dernière adresse enregistrée. Vous n’avez rien à saisir.</Text>
          <Key label="Réessayer ma TV enregistrée" icon="tv" onPress={r.retryPreferred} />
        </View>}
      {!r.scanning && <Key label="Relancer la recherche" icon="search" caption onPress={() => void r.scan(false)} />}
      {['pairing', 'pin', 'connecting', 'connected', 'limited', 'error'].includes(r.snapshot.state) && (
        <View style={styles.help}>
          <Text style={s.text} accessibilityLiveRegion="polite">{r.snapshot.message}</Text>
          {r.snapshot.state === 'pairing' && <View style={{ gap: 10 }}>
            <Text style={s.muted}>Acceptez la demande sur l’écran de la TV. Si un code s’affiche plutôt qu’une confirmation, choisissez l’option ci-dessous.</Text>
            <Key label="La télévision affiche un code PIN" onPress={r.startPinPairing} />
          </View>}
          {r.snapshot.state === 'pin' && <View style={{ gap: 10 }}>
            <Text style={s.muted}>Saisissez le code de 4 à 8 chiffres visible sur votre télévision. Il n’est jamais enregistré.</Text>
            <TextInput accessibilityLabel="Code PIN affiché sur la TV" placeholder="Code affiché sur la TV"
              placeholderTextColor={t.muted} keyboardType="number-pad" autoCorrect={false}
              value={r.pairingPin} onChangeText={r.setPairingPin} maxLength={8}
              style={styles.input} returnKeyType="done" onSubmitEditing={r.submitPin} />
            <Key label="Valider le code de la télévision" onPress={r.submitPin} />
          </View>}
          {r.snapshot.state === 'error' && <Key label="Essayer le jumelage avec code PIN" onPress={r.startPinPairing} />}
          {r.snapshot.state === 'connecting' && <Key label="Annuler la connexion" onPress={r.disconnect} />}
        </View>
      )}
      {!!r.error && <Text style={[s.muted, { color: t.danger }]} accessibilityLiveRegion="polite">{r.error}</Text>}
      {r.wifiReady && <Key label="Déconnecter la TV" onPress={r.disconnect} />}
      <Key label="Ouvrir les réglages Wi-Fi du téléphone" icon="wifi" caption onPress={r.settings} />
      <FeedbackPressable accessibilityRole="button" accessibilityLabel="Afficher les options avancées de connexion"
        accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(!advanced)} style={styles.advanced}>
        <Text style={[s.muted, { fontWeight: '600' }]}>{advanced ? 'Masquer les options avancées' : 'Ma TV n’apparaît pas · Options avancées'}</Text>
        <Icon name={advanced ? 'up' : 'down'} size={18} color={t.muted} />
      </FeedbackPressable>
      {advanced && <View style={{ gap: 12 }}>
        <Text style={s.muted}>En dernier recours, saisissez l’adresse IP locale de la TV. Cette étape n’est normalement pas nécessaire.</Text>
        <TextInput accessibilityLabel="Adresse IP locale de la télévision" placeholder="192.168.1.20"
          placeholderTextColor={t.muted} value={r.ip} onChangeText={r.setIp}
          autoCapitalize="none" autoCorrect={false} keyboardType="decimal-pad"
          maxLength={15} style={styles.input} returnKeyType="done" onSubmitEditing={r.manualConnect} />
        <Key label="Connexion manuelle" onPress={r.manualConnect} />
        <Key label="Oublier l’ancienne association" onPress={() => Alert.alert('Oublier la télévision ?',
          'Vous devrez accepter un nouveau jumelage.', [
            { text: 'Annuler', style: 'cancel' }, { text: 'Oublier', onPress: r.forget },
          ])} />
        <Text style={s.muted}>Cette version prend en charge les anciennes LG webOS sur le port local 3000. NetCast, les TV en Wi-Fi Direct uniquement et certains modèles webOS plus récents ne sont pas encore pilotables en Wi-Fi.</Text>
      </View>}
    </Sheet>

    <Sheet title="Chiffres" visible={r.panel === 'numbers'} onClose={close}>
      {[[1, 2, 3], [4, 5, 6], [7, 8, 9]].map((row, i) => <View style={s.row} key={i}>{row.map(n =>
        <Key key={n} label={String(n)} immediate onPress={() => void r.send(('N' + n) as RemoteKey)} disabled={!r.available(('N' + n) as RemoteKey)} style={styles.flex} />)}</View>)}
      <View style={s.row}><View style={styles.flex} />{key('N0', '0')}<View style={styles.flex} /></View>
    </Sheet>
    <Sheet title="Lecture" visible={r.panel === 'media'} onClose={close}>
      <View style={s.row}>{key('REWIND', 'Reculer', 'rewind')}{key('PLAY', 'Lire', 'play')}{key('FORWARD', 'Avancer', 'forward')}</View>
      <View style={s.row}>{key('PAUSE', 'Pause', 'pause')}{key('STOP', 'Arrêter', 'stop')}</View>
    </Sheet>
    <Sheet title="Plus de commandes" visible={r.panel === 'more'} onClose={close}>
      <View style={s.row}>{key('SETTINGS', 'Réglages TV', 'settings')}{key('INFO', 'Informations', 'info')}{key('EXIT', 'Quitter', 'close')}</View>
      <View style={s.row}>{(['RED', 'GREEN', 'YELLOW', 'BLUE'] as const).map((command, i) =>
        <Key key={command} label={['Rouge', 'Vert', 'Jaune', 'Bleu'][i]} immediate disabled={!r.available(command)}
          onPress={() => void r.send(command)} style={{ flex: 1, borderBottomWidth: 4, borderBottomColor: ['#E58C87', '#92CDA1', '#E2C779', '#8DAFE9'][i] }} />)}</View>
      <View style={s.row}><View style={styles.flex}><Text style={s.text}>Retour haptique</Text><Text style={s.muted}>Une vibration légère dès l’appui, sans attendre la TV.</Text></View>
        <Switch accessibilityLabel="Retour haptique" value={r.haptics} onValueChange={r.toggleHaptics} trackColor={{ true: t.accent }} /></View>
      <Text style={s.muted}>Flèches, volume et chaînes : première commande dès l’appui, puis répétition si vous maintenez. Les autres touches agissent au relâchement, sans maintien nécessaire. Marche/arrêt ne se répète jamais.</Text>
      <Text style={s.muted}>La vibration confirme le toucher, pas la réception par la TV. Les répétitions s’arrêtent au relâchement, au changement de panneau ou en arrière-plan.</Text>
      <Text style={s.muted}>Aucun compte, publicité ou suivi. Le jumelage et les préférences restent sur ce téléphone. Le Wi-Fi ancien utilise une liaison locale non chiffrée.</Text>
    </Sheet>
    <Sheet title="Sources TV" visible={r.panel === 'inputs'} onClose={close}>
      {r.loadingInputs ? <ActivityIndicator color={t.accent} /> : r.inputs.length ? r.inputs.map(input =>
        <Key key={input.id} label={input.label} icon="source" caption onPress={() => void r.switchInput(input.id)} />) :
        <Text style={s.muted}>Aucune source renvoyée par la TV.</Text>}
      {!!r.error && <Text style={[s.muted, { color: t.danger }]}>{r.error}</Text>}
    </Sheet>
  </SafeAreaView></FeedbackProvider>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: 16, gap: 18, width: '100%', maxWidth: 500, alignSelf: 'center', paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 16, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' },
  title: { color: t.text, fontSize: 25, fontWeight: '700', letterSpacing: -0.7 },
  segment: { flexDirection: 'row', backgroundColor: t.surface, borderRadius: 18, padding: 4 },
  mode: { flex: 1, minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  selected: { backgroundColor: t.accent }, modeText: { fontSize: 15, fontWeight: '600' },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 4 },
  connectionTitle: { color: t.text, fontSize: 14, fontWeight: '600' },
  hint: { color: t.muted, fontSize: 12, marginTop: 3 }, dot: { width: 7, height: 7, borderRadius: 4 },
  notice: { backgroundColor: t.dangerBg, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pad: { alignSelf: 'center', width: '82%', maxWidth: 260, padding: 12, gap: 8, borderRadius: 46,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  padRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, empty: { flex: 1, minWidth: 48 },
  ok: { flex: 1, minHeight: 64, borderRadius: 24 }, flex: { flex: 1 },
  rocker: { flex: 1, gap: 7, minWidth: 104 },
  rockerLabel: { color: t.muted, fontSize: 11, fontWeight: '600', textAlign: 'center', letterSpacing: 1 },
  bottom: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderColor: t.border, paddingTop: 16 },
  footer: { fontSize: 11, color: t.muted, textAlign: 'center' },
  device: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, backgroundColor: t.raised, padding: 14, borderRadius: 16 },
  help: { backgroundColor: t.raised, borderRadius: 16, padding: 16, gap: 8 },
  advanced: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 50, paddingHorizontal: 6 },
  input: { minHeight: 56, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 14, color: t.text, fontSize: 18 },
});
