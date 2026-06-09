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
