import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HoldRepeater } from '../core/hold';
import { Icon, type IconName } from './Icon';
import { theme as t } from './theme';

export function Key({ label, icon, text, onPress, disabled = false, repeat = false,
  accent = false, danger = false, caption = false, style }: {
  label: string; icon?: IconName; text?: string; onPress: () => void; disabled?: boolean;
  repeat?: boolean; accent?: boolean; danger?: boolean; caption?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const action = useRef(onPress); action.current = onPress;
  const hold = useRef(new HoldRepeater()).current;
  const repeated = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') hold.stop(); });
    return () => { subscription.remove(); hold.stop(); };
  }, [hold]);
  useEffect(() => { if (disabled) hold.stop(); }, [disabled, hold]);
  const color = accent ? t.ink : danger ? t.danger : t.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    testID={'key-' + label} disabled={disabled}
    onPressIn={() => { repeated.current = false; if (repeat) hold.start(() => { repeated.current = true; action.current(); }); }}
    onPressOut={() => hold.stop()}
    onPress={() => { if (!repeated.current) action.current(); }}
    style={({ pressed }) => [s.key, accent && { backgroundColor: t.accent }, danger && { backgroundColor: t.dangerBg },
      style, disabled && { opacity: 0.38 }, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}>
    {icon ? <Icon name={icon} color={color} /> : <Text style={[s.keyText, { color }, !text && label.length > 2 ? { fontSize: 14 } : null]}>{text ?? label}</Text>}
    {caption && <Text style={[s.caption, { color }]}>{label}</Text>}
  </Pressable>;
}

export function Sheet({ title, visible, onClose, children }: {
  title: string; visible: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(v => { if (live) setReduced(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { live = false; sub.remove(); };
  }, []);
  return <Modal visible={visible} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={onClose}>
    <KeyboardAvoidingView style={s.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={s.sheet} accessibilityViewIsModal>
        <View style={s.sheetHeader}>
          <Text style={s.sheetTitle} accessibilityRole="header">{title}</Text>
          <Key label="Fermer" icon="close" onPress={onClose} style={{ width: 48, minHeight: 48 }} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetBody}>{children}</ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}
export const s = StyleSheet.create({
  key: { minHeight: 56, minWidth: 48, padding: 10, borderRadius: 18, backgroundColor: t.raised,
    alignItems: 'center', justifyContent: 'center', gap: 5 },
  keyText: { fontSize: 22, fontWeight: '600', color: t.text },
  caption: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.overlay },
  sheet: { maxHeight: '90%', backgroundColor: t.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: 12, gap: 12 },
  sheetTitle: { flex: 1, fontSize: 22, fontWeight: '700', color: t.text },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  text: { color: t.text, fontSize: 16, lineHeight: 23 },
  muted: { color: t.muted, fontSize: 14, lineHeight: 21 },
});
