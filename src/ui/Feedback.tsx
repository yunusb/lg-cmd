import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const Context = createContext<{ feedback: () => void | Promise<void>; interactionKey: string }>({
  feedback: () => {}, interactionKey: '',
});

export function FeedbackProvider({ enabled, interactionKey, children }: {
  enabled: boolean; interactionKey: string; children: React.ReactNode;
}) {
  const feedback = useCallback(() => {
    if (!enabled || (AppState.currentState !== null && AppState.currentState !== 'active')) return;
    // Native virtual-key feedback: no long Vibration.vibrate pulse and no forced system override.
    return Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key)
      : Haptics.selectionAsync();
  }, [enabled]);
  const value = useMemo(() => ({ feedback, interactionKey }), [feedback, interactionKey]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useTouchFeedback = () => useContext(Context);
