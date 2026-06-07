// Task theming helpers — derives card colors from a category accent + point weight.

export const PTS_MIN = 3;   // 15 min / 5
export const PTS_MAX = 24;  // 120 min / 5

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Mix two hex colors. t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const f = clamp(t, 0, 1);
  return rgbToHex(ar + (br - ar) * f, ag + (bg - ag) * f, ab + (bb - ab) * f);
}

export interface TaskTheme {
  bg: string;
  fg: string;
  sub: string;
  chip: string;
  border: string;
  mark: string;
}

/** Build a task card palette from an accent color and a point weight. */
export function taskTheme(accentHex: string, pts: number): TaskTheme {
  const f = clamp((pts - PTS_MIN) / (PTS_MAX - PTS_MIN), 0, 1);
  const bg = mixHex('#FDFAF4', accentHex, 0.12 + f * 0.48); // 12%..60% accent over cream
  const fg = '#241E18';                                     // text always dark
  const sub = 'rgba(36,30,24,0.58)';
  const chip = 'rgba(36,30,24,0.09)';
  const border = mixHex(bg, '#241E18', 0.1);
  const mark = mixHex(accentHex, '#16110D', 0.16);          // darkened accent for icons/pts
  return { bg, fg, sub, chip, border, mark };
}

/** Points from minutes: 5 min = 1 pt. */
export function ptsFromMin(min: number): number {
  return Math.round(min / 5);
}

/** Format a duration in minutes into a short human label. */
export function fmtDur(min: number): string {
  if (min >= 60) {
    const h = min / 60;
    return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1).replace('.', ',')} h`;
  }
  return `${min} min`;
}
