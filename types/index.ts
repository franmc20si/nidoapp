export type UserRole = 'admin' | 'member';

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  role: UserRole;
  profile?: Profile;
}

export interface Task {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  is_done: boolean;
  is_recurring: boolean;
  recurrence_rule: string | null;
  weekdays: number[] | null;   // 0=Lunes … 6=Domingo (recurrentes semanales ancladas a día)
  day_slot: string | null;     // 'manana' | 'comida' | 'tarde' | 'noche'
  category: string | null;
  points: number | null;
  duration_min: number | null;
  completed_by: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
}

export interface ShoppingList {
  id: string;
  household_id: string;
  name: string;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  list_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  is_checked: boolean;
  added_by: string;
}

export interface Expense {
  id: string;
  household_id: string;
  title: string;
  amount: number;
  category: string | null;
  paid_by: string;
  split_between: string[];
  date: string;
  created_at: string;
}

export interface Bank {
  id: string;
  household_id: string;
  name: string;
  color: string;            // clave de NIDO_COLORS (teja | terracota | cielo | bosque | iris)
  created_by: string | null;
  created_at: string;
}

export interface House {
  id: string;
  household_id: string;
  name: string;
  color: string;            // clave de NIDO_COLORS (teja | terracota | cielo | bosque | iris)
  created_by: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  household_id: string;
  name: string;
  category: string | null;
  amount: number;
  cycle: string;            // monthly | bimonthly | quarterly | semiannual | yearly
  next_payment: string | null;
  bank_account: string | null; // texto libre heredado (reemplazado por bank_id)
  bank_id: string | null;      // banco asignado → tabla banks
  house_id: string | null;     // casa/vivienda asignada → tabla houses
  created_by: string | null;
  created_at: string;
}

export interface VacationPeriod {
  id: string;
  household_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  label: string;
  color: string;
  is_trip: boolean;   // periodo marcado como "viaje" → aparece en la pantalla Viajes
  created_by: string | null;
  created_at: string;
}

// Franjas del día de un viaje. 'dormir' admite varias noches consecutivas.
export type TripItemKind = 'manana' | 'comida' | 'tarde' | 'cena' | 'dormir';

export interface TripItem {
  id: string;
  household_id: string;
  period_id: string;
  day: string;        // YYYY-MM-DD
  kind: TripItemKind;
  title: string;
  url: string | null;     // enlace opcional (cualquier URL)
  place: string | null;   // nombre del sitio si se pudo extraer del enlace
  price: number | null;   // precio opcional del sitio
  notes: string | null;   // notas opcionales (horarios, comentarios…)
  sort: number;
  created_by: string | null;
  created_at: string;
}
