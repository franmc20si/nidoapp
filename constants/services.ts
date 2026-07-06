import { C } from './theme';

export interface ServiceCat {
  key: string;
  label: string;
  emoji: string;
  color: string;
  tint: string;
}

// Categorías de servicios del hogar + digitales.
export const SERVICE_CATS: ServiceCat[] = [
  { key: 'luz',       label: 'Luz',       emoji: '💡', color: C.cena,      tint: C.cenaTint },
  { key: 'agua',      label: 'Agua',      emoji: '💧', color: C.suelo,     tint: C.sueloTint },
  { key: 'gas',       label: 'Gas',       emoji: '🔥', color: C.cocina,    tint: C.cocinaTint },
  { key: 'internet',  label: 'Internet',  emoji: '🌐', color: C.cristales, tint: C.cristalesTint },
  { key: 'movil',     label: 'Móvil',     emoji: '📱', color: C.bano,      tint: C.banoTint },
  { key: 'comunidad', label: 'Comunidad', emoji: '🏢', color: C.coche,     tint: C.cocheTint },
  { key: 'seguro',    label: 'Seguro',    emoji: '🛡️', color: C.general,   tint: C.generalTint },
  { key: 'streaming', label: 'Streaming', emoji: '🎬', color: C.colada,    tint: C.coladaTint },
  { key: 'gimnasio',  label: 'Gimnasio',  emoji: '🏋️', color: C.compra,    tint: C.compraTint },
  { key: 'otros',     label: 'Otros',     emoji: '📦', color: C.ink3,      tint: C.paperDeep },
];

export function getServiceCat(key: string | null | undefined): ServiceCat {
  return SERVICE_CATS.find((c) => c.key === key) ?? SERVICE_CATS[SERVICE_CATS.length - 1];
}

export interface Cycle {
  key: string;
  label: string;
  short: string;
  months: number; // para normalizar a coste mensual
}

export const CYCLES: Cycle[] = [
  // Semanal: ~4,33 pagos/mes (52 semanas / 12 meses) → months = 12/52 para que
  // monthlyEquivalent calcule bien el coste mensual.
  { key: 'weekly',     label: 'Semanal',    short: '/sem',   months: 12 / 52 },
  { key: 'monthly',    label: 'Mensual',    short: '/mes',   months: 1 },
  { key: 'bimonthly',  label: 'Bimestral',  short: '/2 mes', months: 2 },
  { key: 'quarterly',  label: 'Trimestral', short: '/3 mes', months: 3 },
  { key: 'semiannual', label: 'Semestral',  short: '/6 mes', months: 6 },
  { key: 'yearly',     label: 'Anual',      short: '/año',   months: 12 },
  // Pago único: no recurre. Su coste se prorratea entre 12 (importe/12) para
  // que sume a la media mensual como una parte más del gasto anual.
  { key: 'once',       label: 'Pago único', short: 'único',  months: 12 },
];

export function getCycle(key: string | null | undefined): Cycle {
  return CYCLES.find((c) => c.key === key) ?? CYCLES[1]; // por defecto mensual
}

// ¿Es un pago único (derrama / gasto puntual) y no recurrente?
export function isOnce(cycleKey: string | null | undefined): boolean {
  return cycleKey === 'once';
}

// Coste mensual de un servicio = gasto anual proyectado / 12.
// - Recurrente: importe / meses del ciclo (equivale a anual/12).
// - Pago único: importe / 12 (la derrama repartida en el año).
export function monthlyEquivalent(amount: number, cycleKey: string): number {
  if (cycleKey === 'once') return amount / 12;
  return amount / getCycle(cycleKey).months;
}
