export interface NidoColor {
  key: string;
  label: string;
  hex: string;
  wash: string;   // light tint for backgrounds
}

export const NIDO_COLORS: NidoColor[] = [
  { key: 'teja',      label: 'Teja',      hex: '#C2502F', wash: '#F6E3D7' },
  { key: 'terracota', label: 'Terracota', hex: '#D9663F', wash: '#F7E2D6' },
  { key: 'cielo',     label: 'Cielo',     hex: '#5B97C4', wash: '#DCEAF4' },
  { key: 'bosque',    label: 'Bosque',    hex: '#6FA368', wash: '#E0EDD9' },
  { key: 'iris',      label: 'Iris',      hex: '#8E6FCF', wash: '#E7DEF6' },
];

export const DEFAULT_COLOR = NIDO_COLORS[0];

export function nidoColorByKey(key: string | null | undefined): NidoColor {
  return NIDO_COLORS.find((c) => c.key === key) ?? DEFAULT_COLOR;
}
