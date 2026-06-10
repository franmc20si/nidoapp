// Cálculo de semana ISO — fuente única de verdad compartida por todas las tabs.
// Antes, index.tsx y menu.tsx tenían cada uno su propia versión de estas funciones;
// cualquier divergencia mínima hacía que una pantalla buscara el plan con una
// week_key distinta a la que otra había guardado. Centralizar lo evita por diseño.

export function getMondayOfWeek(ref: Date): Date {
  const mon = new Date(ref);
  mon.setDate(ref.getDate() - (ref.getDay() + 6) % 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

export function isoWeekNum(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstTh = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - firstTh.getTime()) / 864e5 - 3 + (firstTh.getUTCDay() + 6) % 7) / 7);
}

/** Clave de semana ISO: "2026-W22". Misma fecha → misma clave en toda la app. */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const year = t.getUTCFullYear();
  return `${year}-W${String(isoWeekNum(d)).padStart(2, '0')}`;
}
