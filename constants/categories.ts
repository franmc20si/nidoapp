import { C } from './theme';

export interface Cat {
  key: string;
  label: string;
  color: string;
  tint: string;
  emoji: string;
}

export const CATS: Cat[] = [
  { key: 'cocina',    label: 'Cocina',    color: C.cocina,    tint: C.cocinaTint,    emoji: '🍳' },
  { key: 'bano',      label: 'Baño',      color: C.bano,      tint: C.banoTint,      emoji: '🚿' },
  { key: 'suelo',     label: 'Suelo',     color: C.suelo,     tint: C.sueloTint,     emoji: '🧹' },
  { key: 'colada',    label: 'Colada',    color: C.colada,    tint: C.coladaTint,    emoji: '👕' },
  { key: 'compra',    label: 'Compra',    color: C.compra,    tint: C.compraTint,    emoji: '🛒' },
  { key: 'cristales', label: 'Cristales', color: C.cristales, tint: C.cristalesTint, emoji: '🪟' },
  { key: 'general',   label: 'General',   color: C.general,   tint: C.generalTint,   emoji: '🔧' },
  { key: 'coche',     label: 'Coche',     color: C.coche,     tint: C.cocheTint,     emoji: '🚗' },
];

export const CAT_MAP: Record<string, Cat> = CATS.reduce((m, c) => {
  m[c.key] = c;
  return m;
}, {} as Record<string, Cat>);

export const GENERAL = CAT_MAP.general;

export function catFor(key: string | null | undefined): Cat {
  return (key && CAT_MAP[key]) || GENERAL;
}
