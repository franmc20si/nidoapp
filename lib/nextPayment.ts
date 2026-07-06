import { getCycle } from '@/constants/services';

// Un servicio guarda una única fecha "ancla" (next_payment) + un ciclo. Como la
// fecha no se avanza en la BD, al pasar se quedaría "vencida" para siempre. Este
// helper calcula la PRÓXIMA ocurrencia real: si el ancla ya es hoy o futura, se
// devuelve tal cual; si es pasada, se avanza por el ciclo hasta alcanzar hoy o
// el futuro. Todo en fecha local a medianoche (sin horas).

function midnight(d: Date): Date {
  d.setHours(0, 0, 0, 0);
  return d;
}

// Avanza `date` n meses conservando el día del ancla, recortando al último día
// del mes destino cuando no existe (p. ej. día 31 → meses con 30/28 días).
function addMonths(date: Date, n: number, anchorDay: number): void {
  const total = date.getMonth() + n;
  const year = date.getFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  date.setFullYear(year, month, Math.min(anchorDay, lastDay));
  date.setHours(0, 0, 0, 0);
}

export function nextPaymentDate(iso: string | null, cycleKey: string | null | undefined): Date | null {
  if (!iso) return null;
  // Interpretar la fecha ISO (yyyy-mm-dd) como fecha local, no UTC.
  const anchor = midnight(new Date(iso + 'T00:00:00'));
  if (isNaN(anchor.getTime())) return null;

  const today = midnight(new Date());
  if (anchor >= today) return anchor;

  const cycle = getCycle(cycleKey ?? undefined);
  const d = new Date(anchor);

  if (cycle.key === 'weekly') {
    const behind = today.getTime() - d.getTime();
    const weeks = Math.ceil(behind / (7 * 86400000));
    d.setDate(d.getDate() + weeks * 7);
    while (d < today) d.setDate(d.getDate() + 7);
    return midnight(d);
  }

  const months = cycle.months;
  // Ciclos no mensuales enteros (no debería haber otros): no avanzar.
  if (!Number.isInteger(months) || months <= 0) return anchor;

  const anchorDay = anchor.getDate();
  let guard = 0;
  while (d < today && guard < 1200) {
    addMonths(d, months, anchorDay);
    guard++;
  }
  return d;
}

// Días hasta la próxima ocurrencia (negativo imposible salvo sin ciclo válido).
export function daysUntilNextPayment(iso: string | null, cycleKey: string | null | undefined): number | null {
  const d = nextPaymentDate(iso, cycleKey);
  if (!d) return null;
  const today = midnight(new Date());
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}
