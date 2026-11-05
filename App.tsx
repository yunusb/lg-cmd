import React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StatusBar, StyleSheet, Switch,
  Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { type RemoteKey } from './src/remote-keys';
import { useRemote } from './src/useRemote';
import { Key, Sheet, s } from './src/ui/Controls';
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
  const key = (command: RemoteKey, label: string, icon?: IconName, repeat = false) =>
    <Key label={label} icon={icon} disabled={!r.available(command)} repeat={repeat}
      onPress={() => void r.send(command)} style={{ flex: 1 }} />;
  const power = () => {
    if (r.mode === 'wifi') Alert.alert('Éteindre la TV ?', 'Le Wi-Fi ne pourra pas la rallumer. Utilisez le mode infrarouge.', [
      { text: 'Annuler', style: 'cancel' }, { text: 'Éteindre', onPress: () => void r.send('POWER') },
    ]);
    else void r.send('POWER');
  };
  const connectionLabel = r.mode === 'ir' ? r.irReady ? 'Infrarouge prêt' : 'Émetteur non détecté' :
    r.wifiReady ? `TV connectée · ${r.ip}` : r.snapshot.state === 'pairing' ? 'À valider sur la TV' :
    r.snapshot.state === 'connecting' ? 'Connexion en cours…' : 'Configurer le Wi-Fi';
  const notice = r.error || (r.mode === 'wifi' && r.snapshot.state === 'error' ? r.snapshot.message : '');
  const close = () => { r.stopScan(); r.setPanel(null); };

  return <SafeAreaView style={styles.screen}>
    <StatusBar barStyle="light-content" />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.logo}><Icon name="tv" color={t.accent} size={27} /></View>
        <View style={{ flex: 1 }}><Text style={styles.title} accessibilityRole="header">LG Remote</Text>
          <Text style={s.muted}>Votre TV, simplement.</Text></View>
        <Key label={r.mode === 'ir' ? 'Marche ou arrêt' : 'Éteindre la TV'} icon="power" danger
          disabled={!r.available('POWER')} onPress={power} style={{ width: 56 }} />
      </View>

      <View style={styles.segment}>
        {(['ir', 'wifi'] as const).map(mode => <Pressable key={mode} accessibilityRole="tab"
          accessibilityLabel={mode === 'ir' ? 'Mode infrarouge' : 'Mode Wi-Fi'} accessibilityState={{ selected: r.mode === mode }}
          onPress={() => r.chooseMode(mode)} style={[styles.mode, r.mode === mode && styles.selected]}>
          <Icon name={mode} size={20} color={r.mode === mode ? t.ink : t.muted} />
          <Text style={[styles.modeText, { color: r.mode === mode ? t.ink : t.muted }]}>{mode === 'ir' ? 'Infrarouge' : 'Wi-Fi'}</Text>
        </Pressable>)}
      </View>

      <Pressable onPress={() => r.setPanel('connection')} accessibilityRole="button" accessibilityLabel="Configurer la connexion"
        style={styles.connection}>
        <View style={[styles.dot, { backgroundColor: (r.mode === 'ir' ? r.irReady : r.wifiReady) ? t.accent : t.muted }]} />
        <View style={{ flex: 1 }}><Text style={styles.connectionTitle}>{connectionLabel}</Text>
          <Text style={styles.hint}>{r.mode === 'ir' ? 'Pointez le haut du téléphone vers la TV' : 'Connexion locale · aucun compte LG'}</Text></View>
        <Icon name="right" size={20} color={t.muted} />
      </Pressable>
      {!!notice && <View style={styles.notice} accessibilityLiveRegion="polite"><Text style={[s.muted, { flex: 1, color: t.danger }]}>{notice}</Text>
        {!!r.error && <Key label="Masquer le message" icon="close" onPress={r.clearError} style={{ minHeight: 48 }} />}</View>}

      <View style={styles.pad}>
        <View style={styles.padRow}><View style={styles.empty} />{key('UP', 'Haut', 'up', true)}<View style={styles.empty} /></View>
        <View style={styles.padRow}>{key('LEFT', 'Gauche', 'left', true)}
          <Key label="Valider" text="OK" accent disabled={!r.available('OK')} onPress={() => void r.send('OK')} style={styles.ok} />
          {key('RIGHT', 'Droite', 'right', true)}</View>
        <View style={styles.padRow}><View style={styles.empty} />{key('DOWN', 'Bas', 'down', true)}<View style={styles.empty} /></View>
      </View>
      <View style={s.row}>
        <Key label="Retour" icon="back" caption disabled={!r.available('BACK')} onPress={() => void r.send('BACK')} style={styles.flex} />
        <Key label="Accueil" icon="home" caption disabled={!r.available('HOME')} onPress={() => void r.send('HOME')} style={styles.flex} />
        <Key label="Sources" icon="source" caption disabled={!r.available('SOURCE')} onPress={() => void r.send('SOURCE')} style={styles.flex} />
      </View>
      <View style={[s.row, { gap: 8 }]}>
        <View style={styles.rocker}><Text style={styles.rockerLabel}>VOLUME</Text><View style={[s.row, { gap: 8 }]}>
          {key('VOLUME_DOWN', 'Baisser le volume', 'minus', true)}{key('VOLUME_UP', 'Augmenter le volume', 'plus', true)}
        </View></View>
        <Key label="Muet" icon="mute" disabled={!r.available('MUTE')} onPress={() => void r.send('MUTE')} style={{ width: 52 }} />
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

    <Sheet title="Connexion à la TV" visible={r.panel === 'connection'} onClose={close}>
      <Text style={s.text}>Wi-Fi local, sans compte</Text>
      <Text style={s.muted}>Allumez la TV. Connectez-la à la même box que le téléphone (Wi-Fi ou câble Ethernet), puis activez « LG Connect Apps » si ce réglage existe.</Text>
      <Key label={r.scanning ? 'Annuler la recherche' : 'Rechercher une TV'} icon={r.scanning ? 'close' : 'search'} caption accent
        onPress={() => r.scanning ? r.stopScan() : void r.scan()} />
      {r.scanning && <View style={s.row}><ActivityIndicator color={t.accent} /><Text style={s.muted}>Recherche sur le Wi-Fi…</Text></View>}
      {r.devices.map(tv => <Pressable key={tv.host} accessibilityRole="button" disabled={tv.protocol !== 'webos'}
        accessibilityState={{ disabled: tv.protocol !== 'webos' }} accessibilityLabel={'Connecter ' + tv.label}
        onPress={() => r.connect(tv.host)} style={styles.device}>
        <Icon name="tv" color={t.accent} /><View style={styles.flex}><Text style={s.text}>{tv.label}</Text>
          <Text style={s.muted}>{tv.protocol === 'webos' ? 'Toucher pour jumeler' : 'NetCast : utilisez l’IR, protocole non pris en charge'}</Text></View>
        {tv.protocol === 'webos' && <Icon name="right" />}
      </Pressable>)}
      {r.scanned && !r.devices.length && <Text style={s.muted}>Aucune TV détectée. La box peut bloquer la découverte : essayez l’adresse IP ci-dessous.</Text>}
      <Text style={s.text}>Connexion manuelle</Text>
      <TextInput accessibilityLabel="Adresse IP de la TV" placeholder="192.168.1.20" placeholderTextColor={t.muted}
        value={r.ip} onChangeText={r.setIp} autoCapitalize="none" autoCorrect={false} keyboardType="decimal-pad"
        maxLength={15} style={styles.input} returnKeyType="done" onSubmitEditing={() => r.connect()} />
      <Key label={['connecting', 'pairing'].includes(r.snapshot.state) ? 'Annuler la connexion' : 'Connecter cette TV'}
        onPress={() => ['connecting', 'pairing'].includes(r.snapshot.state) ? r.disconnect() : r.connect()} />
      <Text style={s.muted} accessibilityLiveRegion="polite">{r.snapshot.message}</Text>
      {!!r.error && <Text style={[s.muted, { color: t.danger }]} accessibilityLiveRegion="polite">{r.error}</Text>}
      {r.wifiReady && <Key label="Déconnecter" onPress={r.disconnect} />}
      <View style={s.row}><Key label="Réglages Wi-Fi" icon="wifi" caption onPress={r.settings} style={styles.flex} />
        <Key label="Oublier le jumelage" icon="close" caption onPress={() => Alert.alert('Oublier le jumelage ?',
          'La TV demandera une nouvelle autorisation.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Oublier', onPress: r.forget }])} style={styles.flex} /></View>
      <Text style={s.muted}>Wi-Fi Direct n’est pas un mode de télécommande garanti. Cette version cible webOS ancien via le port local 3000 ; NetCast et les TV imposant TLS ne sont pas encore pris en charge. Pas d’ouverture de port sur Internet.</Text>
      <Text style={s.muted}>Pendant la demande de jumelage, fermez ce panneau et passez en IR pour valider sur la TV. Le jumelage Wi-Fi reste actif.</Text>
    </Sheet>

    <Sheet title="Chiffres" visible={r.panel === 'numbers'} onClose={close}>
      {[[1, 2, 3], [4, 5, 6], [7, 8, 9]].map((row, i) => <View style={s.row} key={i}>{row.map(n =>
        <Key key={n} label={String(n)} onPress={() => void r.send(('N' + n) as RemoteKey)} disabled={!r.available(('N' + n) as RemoteKey)} style={styles.flex} />)}</View>)}
      <View style={s.row}><View style={styles.flex} />{key('N0', '0')}<View style={styles.flex} /></View>
    </Sheet>
    <Sheet title="Lecture" visible={r.panel === 'media'} onClose={close}>
      <View style={s.row}>{key('REWIND', 'Reculer', 'rewind')}{key('PLAY', 'Lire', 'play')}{key('FORWARD', 'Avancer', 'forward')}</View>
      <View style={s.row}>{key('PAUSE', 'Pause', 'pause')}{key('STOP', 'Arrêter', 'stop')}</View>
    </Sheet>
    <Sheet title="Plus de commandes" visible={r.panel === 'more'} onClose={close}>
      <View style={s.row}>{key('SETTINGS', 'Réglages TV', 'settings')}{key('INFO', 'Informations', 'info')}{key('EXIT', 'Quitter', 'close')}</View>
      <View style={s.row}>{(['RED', 'GREEN', 'YELLOW', 'BLUE'] as const).map((command, i) =>
        <Key key={command} label={['Rouge', 'Vert', 'Jaune', 'Bleu'][i]} disabled={!r.available(command)}
          onPress={() => void r.send(command)} style={{ flex: 1, borderBottomWidth: 4, borderBottomColor: ['#E58C87', '#92CDA1', '#E2C779', '#8DAFE9'][i] }} />)}</View>
      <View style={s.row}><View style={styles.flex}><Text style={s.text}>Retour haptique</Text><Text style={s.muted}>Un retour discret à chaque commande.</Text></View>
        <Switch accessibilityLabel="Retour haptique" value={r.haptics} onValueChange={r.toggleHaptics} trackColor={{ true: t.accent }} /></View>
      <Text style={s.muted}>Appui prolongé : flèches, volume et chaînes. Les commandes s’arrêtent au relâchement ou quand l’application passe en arrière-plan.</Text>
      <Text style={s.muted}>Aucun compte, publicité ou suivi. Le jumelage et les préférences restent sur ce téléphone. Le Wi-Fi ancien utilise une liaison locale non chiffrée.</Text>
    </Sheet>
    <Sheet title="Sources TV" visible={r.panel === 'inputs'} onClose={close}>
      {r.loadingInputs ? <ActivityIndicator color={t.accent} /> : r.inputs.length ? r.inputs.map(input =>
        <Key key={input.id} label={input.label} icon="source" caption onPress={() => void r.switchInput(input.id)} />) :
        <Text style={s.muted}>Aucune source renvoyée par la TV.</Text>}
      {!!r.error && <Text style={[s.muted, { color: t.danger }]}>{r.error}</Text>}
    </Sheet>
  </SafeAreaView>;
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
  input: { minHeight: 56, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 14, color: t.text, fontSize: 18 },
});
