import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { Ingredient } from '@/components/ShoppingListSheet';
import { showToast } from '@/store/toastStore';
import { readWithRetry } from '@/lib/withTimeout';

// ─── tipos compartidos ───────────────────────────────────────────────────────
export interface Recipe {
  id: string;
  name: string;
  color: string;
  meals: ('comida' | 'cena')[];
  ingredients?: Ingredient[];
}
export type Plan = Record<string, string>;     // "dayIdx-meal" → recipeId
export type WeeklyPlans = Record<string, Plan>; // weekKey → Plan

export const DISH_COLORS = ['#D97B66','#D9A577','#7FA86A','#79C1F2','#A881F2','#C25A7A','#5BA38C','#C99A3C'];

// Recetas de ejemplo — SOLO se siembran en Supabase en el primer arranque real
// (household sin recetas y sin datos legacy). Nunca se usan como fallback en
// memoria, para no enmascarar datos reales con ids falsos.
export const DEFAULT_RECIPES: Recipe[] = [
  { id: 'r1', name: 'Ensalada César',      color: '#7FA86A', meals: ['comida','cena'] },
  { id: 'r2', name: 'Pasta al pesto',      color: '#5BA38C', meals: ['comida'] },
  { id: 'r3', name: 'Lentejas estofadas',  color: '#D9A577', meals: ['comida'] },
  { id: 'r4', name: 'Salmón al horno',     color: '#D97B66', meals: ['cena'] },
  { id: 'r5', name: 'Crema de verduras',   color: '#A881F2', meals: ['cena'] },
  { id: 'r6', name: 'Tortilla de patata',  color: '#C99A3C', meals: ['comida','cena'] },
  { id: 'r7', name: 'Pollo al limón',      color: '#79C1F2', meals: ['cena'] },
];

// Claves legacy de AsyncStorage — solo para migración única
const STORAGE_RECIPES        = 'nido_recipes_v2';
const STORAGE_PLANS          = 'nido_weekly_plans';
const STORAGE_MIGRATION_DONE = 'nido_menu_migrated_v1';

interface MenuState {
  recipes: Recipe[];
  weeklyPlans: WeeklyPlans;
  loaded: boolean;          // true tras una carga exitosa (distingue "vacío" de "sin cargar")
  loadError: boolean;       // true si la última carga falló y aún no hay datos
  loadingFor: string | null; // household.id de la carga en curso (evita cargas duplicadas)

  loadMenu: (householdId: string) => Promise<void>;
  recipeById: (id?: string) => Recipe | undefined;
  saveRecipe: (householdId: string, data: Recipe) => Promise<{ ok: boolean }>;
  deleteRecipe: (householdId: string, id: string) => Promise<{ ok: boolean }>;
  assignPlan: (householdId: string, weekKey: string, slot: string, recipeId: string | null) => Promise<void>;
}

async function upsertWeekPlan(householdId: string, weekKey: string, plan: Plan) {
  const { error } = await supabase.from('meal_plans').upsert(
    { household_id: householdId, week_key: weekKey, plan, updated_at: new Date().toISOString() },
    { onConflict: 'household_id,week_key' }
  );
  if (error) throw error;
}

export const useMenuStore = create<MenuState>((set, get) => ({
  recipes: [],
  weeklyPlans: {},
  loaded: false,
  loadError: false,
  loadingFor: null,

  recipeById: (id) => id ? get().recipes.find(r => r.id === id) : undefined,

  // ── carga compartida y robusta ──────────────────────────────────────────
  loadMenu: async (householdId) => {
    if (!householdId) return;
    if (get().loadingFor === householdId) return; // ya hay una carga en curso para este household
    set({ loadingFor: householdId, loadError: false });
    try {
      const [recipesRes, plansRes, migrationDoneRaw] = await Promise.all([
        readWithRetry(() => supabase.from('recipes').select('*').eq('household_id', householdId)),
        readWithRetry(() => supabase.from('meal_plans').select('week_key, plan').eq('household_id', householdId)),
        AsyncStorage.getItem(STORAGE_MIGRATION_DONE),
      ]);

      const migrationDone = !!migrationDoneRaw;

      // ── Recetas ────────────────────────────────────────────────────────────
      // Clave anti-inconsistencia: si la consulta falla (error o data null) NO
      // tocamos el estado — conservamos lo que ya hubiera, nunca lo sustituimos
      // por recetas de ejemplo. Eso evita que la rejilla muestre platos falsos
      // (ids r1..r7) que no casan con los ids reales del plan.
      if (recipesRes.error) {
        // se conserva el estado actual; abajo no marcamos loaded si nunca cargó
        if (!get().loaded) set({ loadError: true });
      } else if (recipesRes.data && recipesRes.data.length > 0) {
        set({
          recipes: recipesRes.data.map((r: any) => ({
            id: r.id, name: r.name, color: r.color,
            meals: (r.meals ?? []) as Recipe['meals'],
            ingredients: (r.ingredients ?? []) as Ingredient[],
          })),
        });
      } else {
        // Respuesta exitosa y vacía: ¿primer arranque real o datos legacy?
        let seeded: Recipe[] | null = null;
        if (!migrationDone) {
          const rRaw = await AsyncStorage.getItem(STORAGE_RECIPES);
          if (rRaw) {
            try {
              const parsed: Recipe[] = JSON.parse(rRaw);
              if (Array.isArray(parsed) && parsed.length) {
                await supabase.from('recipes').insert(
                  parsed.map(r => ({ id: r.id, name: r.name, color: r.color, meals: r.meals, ingredients: r.ingredients ?? [], household_id: householdId }))
                );
                seeded = parsed;
                await AsyncStorage.removeItem(STORAGE_RECIPES);
              }
            } catch {}
          }
        }
        if (!seeded) {
          // Sembrar las recetas de ejemplo como filas REALES en Supabase, una
          // sola vez, para que tengan ids reales y nunca enmascaren nada.
          // upsert + ignoreDuplicates: si otro dispositivo ya las sembró, no falla.
          await supabase.from('recipes').upsert(
            DEFAULT_RECIPES.map(r => ({ id: r.id, name: r.name, color: r.color, meals: r.meals, ingredients: [], household_id: householdId })),
            { onConflict: 'id', ignoreDuplicates: true }
          );
          seeded = DEFAULT_RECIPES;
        }
        set({ recipes: seeded });
      }

      // ── Planes ──────────────────────────────────────────────────────────────
      if (plansRes.error) {
        // se conserva el estado actual
      } else if (plansRes.data && plansRes.data.length > 0) {
        const wp: WeeklyPlans = {};
        plansRes.data.forEach((row: any) => { wp[row.week_key] = (row.plan ?? {}) as Plan; });
        set({ weeklyPlans: wp });
      } else if (!migrationDone) {
        const pRaw = await AsyncStorage.getItem(STORAGE_PLANS);
        if (pRaw) {
          try {
            const parsed: WeeklyPlans = JSON.parse(pRaw);
            if (parsed && typeof parsed === 'object') {
              const rows = Object.entries(parsed).map(([week_key, plan]) => ({ household_id: householdId, week_key, plan }));
              if (rows.length > 0) await supabase.from('meal_plans').insert(rows);
              set({ weeklyPlans: parsed });
              await AsyncStorage.removeItem(STORAGE_PLANS);
            }
          } catch {}
        }
      }

      // Marcar migración como hecha solo si ninguna consulta falló
      if (!migrationDone && !recipesRes.error && !plansRes.error) {
        await AsyncStorage.setItem(STORAGE_MIGRATION_DONE, '1');
      }

      // Solo marcamos "loaded" tras una lectura de recetas exitosa
      if (!recipesRes.error) set({ loaded: true });
    } catch (e) {
      console.error('[menuStore] loadMenu error', e);
      if (!get().loaded) set({ loadError: true });
    } finally {
      set({ loadingFor: null });
    }
  },

  // ── crear / editar receta ─────────────────────────────────────────────────
  saveRecipe: async (householdId, data) => {
    const { recipes, weeklyPlans } = get();
    const isExisting = !!(data.id && recipes.some(r => r.id === data.id));
    const newId = isExisting ? data.id : 'rc' + Date.now();
    const saved: Recipe = { ...data, id: newId };

    // Estado local inmediato (optimista)
    set({
      recipes: isExisting
        ? recipes.map(r => r.id === data.id ? { ...r, ...saved } : r)
        : [...recipes, saved],
    });

    try {
      if (isExisting) {
        await supabase.from('recipes').update({
          name: saved.name, color: saved.color, meals: saved.meals, ingredients: saved.ingredients ?? [],
        }).eq('id', saved.id).eq('household_id', householdId);

        // Limpiar huecos del plan donde la receta ya no sirve esa comida
        const updatedPlans: WeeklyPlans = { ...weeklyPlans };
        for (const wk in updatedPlans) {
          const p = { ...updatedPlans[wk] };
          Object.keys(p).forEach(k => {
            const meal = k.split('-')[1];
            if (p[k] === data.id && !saved.meals.includes(meal as any)) delete p[k];
          });
          updatedPlans[wk] = p;
          await upsertWeekPlan(householdId, wk, p);
        }
        set({ weeklyPlans: updatedPlans });
      } else {
        await supabase.from('recipes').insert({
          id: saved.id, name: saved.name, color: saved.color,
          meals: saved.meals, ingredients: saved.ingredients ?? [], household_id: householdId,
        });
      }
      return { ok: true };
    } catch (e) {
      console.error('[menuStore] saveRecipe error', e);
      return { ok: false };
    }
  },

  // ── eliminar receta ────────────────────────────────────────────────────────
  deleteRecipe: async (householdId, id) => {
    const { recipes, weeklyPlans } = get();
    const updatedPlans: WeeklyPlans = { ...weeklyPlans };
    for (const wk in updatedPlans) {
      const p = { ...updatedPlans[wk] };
      Object.keys(p).forEach(k => { if (p[k] === id) delete p[k]; });
      updatedPlans[wk] = p;
    }
    set({ recipes: recipes.filter(r => r.id !== id), weeklyPlans: updatedPlans });

    try {
      await supabase.from('recipes').delete().eq('id', id).eq('household_id', householdId);
      for (const wk in updatedPlans) await upsertWeekPlan(householdId, wk, updatedPlans[wk]);
      return { ok: true };
    } catch (e) {
      console.error('[menuStore] deleteRecipe error', e);
      return { ok: false };
    }
  },

  // ── asignar / vaciar un hueco del plan ──────────────────────────────────────
  assignPlan: async (householdId, weekKey, slot, recipeId) => {
    const current = get().weeklyPlans[weekKey] ?? {};
    const newPlan: Plan = { ...current };
    if (recipeId) newPlan[slot] = recipeId; else delete newPlan[slot];
    set({ weeklyPlans: { ...get().weeklyPlans, [weekKey]: newPlan } });
    // Bloquear loadMenu mientras el upsert está en vuelo, para que un useFocusEffect
    // no sobreescriba el estado local con datos obsoletos de Supabase.
    set({ loadingFor: householdId });
    try {
      await upsertWeekPlan(householdId, weekKey, newPlan);
    } catch (e: any) {
      console.error('[menuStore] assignPlan error', e);
      showToast('No se pudo guardar el menú: ' + (e?.message ?? 'error desconocido'), 'error');
    } finally {
      set({ loadingFor: null });
    }
  },
}));
