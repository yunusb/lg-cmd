import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { theme } from './theme';

// Small, consistent outline set. No font loading, emoji or remote image downloads.
const paths = {
  power: 'M12 3v9 M6.3 5.7a9 9 0 1 0 11.4 0',
  tv: 'M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1 M8 22h8 M12 18v4',
  wifi: 'M2 8a16 16 0 0 1 20 0 M5 12a11 11 0 0 1 14 0 M8.5 16a5.5 5.5 0 0 1 7 0 M12 20h.01',
  ir: 'M12 17v4 M12 12v1 M7.8 7.8a6 6 0 0 1 8.4 0 M4.3 4.3a11 11 0 0 1 15.4 0',
  home: 'M3 10l9-7 9 7 M5 9v12h5v-7h4v7h5V9',
  back: 'M9 5l-6 6 6 6 M3 11h11a6 6 0 0 1 6 6v3',
  source: 'M10 4h10v16H10 M2 12h12 M10 8l4 4-4 4',
  up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6',
  plus: 'M12 5v14 M5 12h14', minus: 'M5 12h14',
  mute: 'M11 5L6 9H3v6h3l5 4V5 M16 9l6 6 M22 9l-6 6',
  keypad: 'M5 4h.01 M12 4h.01 M19 4h.01 M5 10h.01 M12 10h.01 M19 10h.01 M5 16h.01 M12 16h.01 M19 16h.01 M12 22h.01',
  play: 'M7 3l14 9-14 9V3', pause: 'M8 4v16 M16 4v16', stop: 'M5 5h14v14H5V5',
  rewind: 'M11 5l-9 7 9 7V5 M22 5l-9 7 9 7V5', forward: 'M2 5l9 7-9 7V5 M13 5l9 7-9 7V5',
  more: 'M4 12h.01 M12 12h.01 M20 12h.01', close: 'M6 6l12 12 M18 6L6 18',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  info: 'M12 10v7 M12 6h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check: 'M4 12l5 5L20 6', search: 'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, color = theme.text, size = 24 }: { name: IconName; color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d={paths[name]} fill="none" stroke={color} strokeWidth={name === 'keypad' || name === 'more' ? 3.8 : 1.8}
      strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
