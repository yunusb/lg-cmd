import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { canTransmitIR, transmitIR } from './modules/lg-infrared';
import { IR_CODES, type RemoteKey } from './src/remote-keys';
import { WebOsClient, type ConnectionState, type TvInput } from './src/webos';

type Mode = 'wifi' | 'ir';
const C = {
  bg: '#101318', panel: '#1B2028', button: '#2B313B',
  border: '#383F4D', text: '#F5F7FA', muted: '#ABB5C3',
  lime: '#C7E76A', red: '#F57878', green: '#6ED9AD', blue: '#97B8FF',
};

type BtnProps = {
  label: string; onPress: () => void; primary?: boolean; danger?: boolean;
  height?: number; flex?: number; small?: boolean; disabled?: boolean;
};

function Btn({ label, onPress, primary, danger, height = 55, flex = 1, small, disabled }: BtnProps) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [
        styles.btn, { height, flex },
        primary ? styles.btnPrimary : null, danger ? styles.btnDanger : null,
        pressed ? { opacity: 0.65 } : null, disabled ? { opacity: 0.45 } : null,
      ]}
    >
      <Text style={[styles.btnText, small ? { fontSize: 13 } : null,
        primary ? { color: '#171F0C' } : null, danger ? { color: C.red } : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {children}
    </View>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('wifi');
  const [ip, setIp] = useState('');
  const [connection, setConnection] = useState<ConnectionState>('disconnected');
  const [status, setStatus] = useState('Entre l’adresse IP de ta TV LG pour commencer.');
  const [inputs, setInputs] = useState<TvInput[]>([]);
  const [showInputs, setShowInputs] = useState(false);
  const [irReady, setIrReady] = useState(false);
  const client = useRef<WebOsClient | null>(null);

  if (!client.current) {
    client.current = new WebOsClient({
      status: setStatus,
      state: setConnection,
      inputs: values => {
        setInputs(values);
        setShowInputs(true);
      },
    });
  }

  useEffect(() => {
    setIrReady(canTransmitIR());
    void SecureStore.getItemAsync('lg_tv_ip')
      .then(value => { if (value) setIp(value); })
      .catch(() => {});
    return () => { client.current?.disconnect(false); };
  }, []);

  const send = useCallback((key: RemoteKey) => {
    Keyboard.dismiss();
    if (mode === 'wifi') {
      client.current?.send(key);
    } else {
      void transmitIR(IR_CODES[key])
        .then(() => setStatus('Signal infrarouge envoyé.'))
        .catch(err => setStatus(err instanceof Error ? err.message : String(err)));
    }
  }, [mode]);

  const connect = () => {
    Keyboard.dismiss();
    void client.current?.connect(ip);
  };

  const numeric = ['1','2','3','4','5','6','7','8','9','0'];

  return (
    <View style={styles.screen}>
      <StatusBar backgroundColor={C.bg} barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>TÉLÉCOMMANDE NON OFFICIELLE</Text>
            <Text style={styles.title}>LG Remote <Text style={styles.year}>2015</Text></Text>
            <Text style={styles.subtitle}>Pour téléviseurs LCD / LED LG</Text>
          </View>
          <View style={styles.symbol}><Text style={{ color: C.lime, fontSize: 25 }}>▣</Text></View>
        </View>

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setMode('wifi')}
            style={[styles.tab, mode === 'wifi' ? styles.tabSelected : null]}
          >
            <Text style={[styles.tabText, mode === 'wifi' ? styles.tabTextSelected : null]}>Wi-Fi</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('ir')}
            style={[styles.tab, mode === 'ir' ? styles.tabSelected : null]}
          >
            <Text style={[styles.tabText, mode === 'ir' ? styles.tabTextSelected : null]}>Infrarouge</Text>
          </Pressable>
        </View>

        {mode === 'wifi' ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              {connection === 'connected' ? '●  TV CONNECTÉE' :
                connection === 'connecting' ? '●  CONNEXION…' : '○  TV DÉCONNECTÉE'}
            </Text>
            <View style={styles.ipRow}>
              <TextInput
                style={styles.ipInput} placeholder="192.168.1.20"
                placeholderTextColor="#89929E" value={ip} onChangeText={setIp}
                keyboardType="numeric" autoCorrect={false} autoCapitalize="none"
                accessibilityLabel="Adresse IP locale de la télévision"
              />
              <Pressable
                style={styles.connectButton}
                onPress={connection === 'connected' ?
                  () => client.current?.disconnect() : connect}
              >
                {connection === 'connecting' ?
                  <ActivityIndicator color="#1E2410" /> :
                  <Text style={styles.connectText}>
                    {connection === 'connected' ? 'Quitter' : 'Connecter'}
                  </Text>
                }
              </Pressable>
            </View>
            <Pressable onPress={() => void client.current?.forgetPairing(ip)}>
              <Text style={styles.link}>Oublier le jumelage</Text>
            </Pressable>
            <Text style={styles.note}>Le téléphone et la TV doivent utiliser le même réseau. La TV doit prendre en charge webOS.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={[styles.cardLabel, { color: irReady ? C.green : C.red }]}>
              {irReady ? '●  ÉMETTEUR IR DISPONIBLE' : '○  ÉMETTEUR IR NON DÉTECTÉ'}
            </Text>
            <Text style={styles.note}>Il faut un téléphone Android doté d’un émetteur infrarouge et une application APK compilée avec EAS. Expo Go ne prend pas en charge le module IR.</Text>
          </View>
        )}

        <View style={styles.status}>
          <Text style={styles.statusTitle}>STATUT</Text>
          <Text style={styles.statusMessage}>{status}</Text>
        </View>

        <View style={styles.remote}>
          <View style={styles.row}>
            <Btn label="⏻" danger onPress={() => send('POWER')} />
            <Btn label="Accueil" small onPress={() => send('HOME')} />
            <Btn label="⚙" onPress={() => send('SETTINGS')} />
            <Btn label="Source" small onPress={() => send('SOURCE')} />
          </View>

          <Section title="NAVIGATION">
            <View style={styles.row}>
              <View style={styles.spacer} />
              <Btn label="▲" height={60} onPress={() => send('UP')} />
              <View style={styles.spacer} />
            </View>
            <View style={styles.row}>
              <Btn label="◀" height={65} onPress={() => send('LEFT')} />
              <Btn label="OK" height={65} primary onPress={() => send('OK')} />
              <Btn label="▶" height={65} onPress={() => send('RIGHT')} />
            </View>
            <View style={styles.row}>
              <View style={styles.spacer} />
              <Btn label="▼" height={60} onPress={() => send('DOWN')} />
              <View style={styles.spacer} />
            </View>
            <View style={styles.row}>
              <Btn label="Retour" small onPress={() => send('BACK')} />
              <Btn label="Quitter" small onPress={() => send('EXIT')} />
              <Btn label="Info" small onPress={() => send('INFO')} />
            </View>
          </Section>

          <Section title="SON & CHAÎNES">
            <View style={styles.row}>
              <Btn label="Vol −" onPress={() => send('VOLUME_DOWN')} />
              <Btn label="Muet" onPress={() => send('MUTE')} />
              <Btn label="Vol +" onPress={() => send('VOLUME_UP')} />
            </View>
            <View style={styles.row}>
              <Btn label="Chaîne −" small onPress={() => send('CHANNEL_DOWN')} />
              <Btn label="Chaîne +" small onPress={() => send('CHANNEL_UP')} />
            </View>
          </Section>

          <Section title="CHIFFRES">
            {[[1, 2, 3], [4, 5, 6], [7, 8, 9]].map((group, index) => (
              <View style={styles.row} key={'num_' + index}>
                {group.map(n => (
                  <Btn label={String(n)} key={n}
                    onPress={() => send(('N' + n) as RemoteKey)} />
                ))}
              </View>
            ))}
            <View style={styles.row}>
              <View style={styles.spacer} />
              <Btn label="0" onPress={() => send('N0')} />
              <View style={styles.spacer} />
            </View>
          </Section>

          <Section title="MULTIMÉDIA">
            <View style={styles.row}>
              <Btn label="⏪" onPress={() => send('REWIND')} />
              <Btn label="▶" onPress={() => send('PLAY')} />
              <Btn label="Ⅱ" onPress={() => send('PAUSE')} />
              <Btn label="⏹" onPress={() => send('STOP')} />
              <Btn label="⏩" onPress={() => send('FORWARD')} />
            </View>
            <View style={styles.row}>
              <Btn label="Rouge" small onPress={() => send('RED')} />
              <Btn label="Vert" small onPress={() => send('GREEN')} />
              <Btn label="Jaune" small onPress={() => send('YELLOW')} />
              <Btn label="Bleu" small onPress={() => send('BLUE')} />
            </View>
          </Section>
        </View>

        <Text style={styles.footer}>Commande Wi-Fi : allumage impossible lorsque la TV est éteinte. En IR, marche/arrêt fonctionne si le téléphone possède un émetteur.</Text>
      </ScrollView>

      <Modal visible={showInputs} transparent animationType="fade" onRequestClose={() => setShowInputs(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Choisir une source</Text>
            {inputs.length === 0 ?
              <Text style={styles.note}>Aucune entrée disponible sur cette télévision.</Text> :
              inputs.map(input => (
                <Pressable
                  key={input.id} style={styles.inputChoice}
                  onPress={() => {
                    client.current?.switchInput(input.id);
                    setShowInputs(false);
                  }}>
                  <Text style={styles.inputText}>{input.label}</Text>
                  <Text style={styles.inputHint}>{input.connected ? 'Connecté' : 'Non détecté'}</Text>
                </Pressable>
              ))
            }
            <Pressable onPress={() => setShowInputs(false)} style={styles.close}>
              <Text style={styles.closeText}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 17, paddingTop: 26, paddingBottom: 50 },
  heading: { flexDirection: 'row', alignItems: 'center', marginBottom: 23 },
  eyebrow: { fontSize: 11, color: C.lime, letterSpacing: 1.4, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '900', color: C.text, marginTop: 5 },
  year: { color: C.lime },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 4 },
  symbol: { backgroundColor: C.panel, padding: 17, borderRadius: 18 },
  tabs: { flexDirection: 'row', padding: 5, borderRadius: 15, backgroundColor: C.panel, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 11 },
  tabSelected: { backgroundColor: C.lime },
  tabText: { fontSize: 15, fontWeight: '700', color: C.muted },
  tabTextSelected: { color: '#242C18' },
  card: { backgroundColor: C.panel, padding: 15, borderRadius: 17, marginBottom: 13 },
  cardLabel: { fontSize: 12, fontWeight: '800', color: C.lime, letterSpacing: 0.8, marginBottom: 11 },
  ipRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ipInput: { flex: 1, borderColor: C.border, borderWidth: 1, borderRadius: 11,
    height: 48, paddingHorizontal: 12, color: C.text, fontSize: 16, minWidth: 0 },
  connectButton: { height: 48, minWidth: 100, paddingHorizontal: 12, backgroundColor: C.lime,
    borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  connectText: { color: '#1C2513', fontSize: 14, fontWeight: '900' },
  link: { color: C.lime, fontSize: 13, marginTop: 10, alignSelf: 'flex-start' },
  note: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 11 },
  status: { padding: 14, borderRadius: 13, backgroundColor: '#21292B', marginBottom: 15 },
  statusTitle: { color: C.lime, fontWeight: '800', fontSize: 10, letterSpacing: 1.4 },
  statusMessage: { color: C.text, fontSize: 13, lineHeight: 19, marginTop: 4 },
  remote: { borderRadius: 23, borderColor: C.border, borderWidth: 1, backgroundColor: C.panel, padding: 13 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  btn: { backgroundColor: C.button, borderRadius: 13, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center', minWidth: 0, paddingHorizontal: 4 },
  btnPrimary: { backgroundColor: C.lime, borderColor: C.lime },
  btnDanger: { backgroundColor: '#42282D', borderColor: '#5B3439' },
  btnText: { color: C.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  section: { marginTop: 18 },
  sectionHeading: { fontSize: 11, color: C.muted, letterSpacing: 1.4,
    fontWeight: '800', marginBottom: 11, marginLeft: 3 },
  spacer: { flex: 1 },
  footer: { margin: 15, textAlign: 'center', color: C.muted, fontSize: 12, lineHeight: 20 },
  overlay: { flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 25 },
  modal: { backgroundColor: C.panel, padding: 20, borderRadius: 22 },
  modalTitle: { fontSize: 21, fontWeight: '900', color: C.text, marginBottom: 13 },
  inputChoice: { borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 14 },
  inputText: { color: C.text, fontSize: 16, fontWeight: '700' },
  inputHint: { color: C.muted, fontSize: 12, marginTop: 5 },
  close: { marginTop: 15, padding: 13, backgroundColor: C.lime, alignItems: 'center', borderRadius: 12 },
  closeText: { color: '#202719', fontWeight: '900' },
});
