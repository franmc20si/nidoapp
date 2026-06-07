export type RecurrenceRule = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

export const RECURRENCE_OPTS: { key: RecurrenceRule; label: string; short: string }[] = [
  { key: 'daily',     label: 'Diaria',     short: 'Cada día'      },
  { key: 'weekly',    label: 'Semanal',    short: 'Cada semana'   },
  { key: 'biweekly',  label: 'Quincenal',  short: 'Cada 15 días'  },
  { key: 'monthly',   label: 'Mensual',    short: 'Cada mes'      },
  { key: 'quarterly', label: 'Trimestral', short: 'Cada 3 meses'  },
];

/** Next ISO date (YYYY-MM-DD) after completing a recurring task. */
export function nextDueDate(rule: RecurrenceRule | string, from: Date | string = new Date()): string {
  // Use T12:00:00 to avoid timezone-related date shifts when from is a date string
  const d = typeof from === 'string' ? new Date(from + 'T12:00:00') : new Date(from);
  d.setHours(12, 0, 0, 0);
  switch (rule) {
    case 'daily':     d.setDate(d.getDate() + 1);   break;
    case 'weekly':    d.setDate(d.getDate() + 7);   break;
    case 'biweekly':  d.setDate(d.getDate() + 14);  break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
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
