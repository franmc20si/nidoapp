export type RecurrenceRule = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

export const RECURRENCE_OPTS: { key: RecurrenceRule; label: string; short: string }[] = [
  { key: 'daily',     label: 'Diaria',     short: 'Cada día'      },
  { key: 'weekly',    label: 'Semanal',    short: 'Cada semana'   },
  { key: 'biweekly',  label: 'Quincenal',  short: 'Cada 15 días'  },
  { key: 'monthly',   label: 'Mensual',    short: 'Cada mes'      },
  { key: 'quarterly', label: 'Trimestral', short: 'Cada 3 meses'  },
];

// Días de la semana, LUNES primero (0=Lunes … 6=Domingo) para casar con el resto
// de la app (L-D). Una tarea semanal puede caer en varios días.
export const WEEKDAYS: { key: number; short: string; label: string }[] = [
  { key: 0, short: 'L', label: 'Lunes' },
  { key: 1, short: 'M', label: 'Martes' },
  { key: 2, short: 'X', label: 'Miércoles' },
  { key: 3, short: 'J', label: 'Jueves' },
  { key: 4, short: 'V', label: 'Viernes' },
  { key: 5, short: 'S', label: 'Sábado' },
  { key: 6, short: 'D', label: 'Domingo' },
];

// Franjas del día para tareas recurrentes.
export type DaySlot = 'manana' | 'comida' | 'tarde' | 'noche';
export const TIME_SLOTS: { key: DaySlot; label: string; emoji: string }[] = [
  { key: 'manana', label: 'Mañana', emoji: '☀️' },
  { key: 'comida', label: 'Comida', emoji: '🍽️' },
  { key: 'tarde',  label: 'Tarde',  emoji: '☕' },
  { key: 'noche',  label: 'Noche',  emoji: '🌙' },
];

/** Índice de día de la semana lunes-primero (0=Lun … 6=Dom) de una fecha. */
export function mondayFirstWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Próxima fecha (YYYY-MM-DD) ESTRICTAMENTE posterior a `from` cuyo día ∈ weekdays. */
function nextMatchingWeekday(from: Date, weekdays: number[]): string {
  const set = new Set(weekdays);
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  for (let i = 1; i <= 7; i++) {
    d.setDate(d.getDate() + 1);
    if (set.has(mondayFirstWeekday(d))) return d.toISOString().split('T')[0];
  }
  return d.toISOString().split('T')[0]; // no debería pasar si weekdays no está vacío
}

/**
 * Próxima fecha (YYYY-MM-DD) tras completar una tarea recurrente.
 * Si es semanal y está anclada a día(s) → el siguiente día del conjunto
 * (recurrencia predecible: "Basura L+J" salta Lun→Jue→Lun). Sin días anclados
 * mantiene el comportamiento por intervalo de siempre.
 */
export function nextDueDate(
  rule: RecurrenceRule | string,
  from: Date | string = new Date(),
  weekdays?: number[] | null,
): string {
  // Use T12:00:00 to avoid timezone-related date shifts when from is a date string
  const d = typeof from === 'string' ? new Date(from + 'T12:00:00') : new Date(from);
  d.setHours(12, 0, 0, 0);
  if (rule === 'weekly' && weekdays && weekdays.length) {
    return nextMatchingWeekday(d, weekdays);
  }
  switch (rule) {
    case 'daily':     d.setDate(d.getDate() + 1);   break;
    case 'weekly':    d.setDate(d.getDate() + 7);   break;
    case 'biweekly':  d.setDate(d.getDate() + 14);  break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
  }
  return d.toISOString().split('T')[0];
}

/**
 * Primera fecha en la que toca una semanal anclada, contando desde `from` HOY
 * INCLUIDO. Se usa al crear/editar para que la tarea aparezca en su día desde el
 * principio.
 */
export function firstWeeklyDue(weekdays: number[], from: Date = new Date()): string {
  const set = new Set(weekdays);
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    if (set.has(mondayFirstWeekday(d))) return d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

/** Human label for display in task cards. Empty string for non-recurring tasks. */
export function recurrenceLabel(rule: string | null | undefined): string {
  if (!rule) return '';
  return RECURRENCE_OPTS.find(o => o.key === rule)?.label ?? '';
}

/** True when a done recurring task should reappear (its next due date is today or past). */
export function isDueAgain(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due <= today;
}
