import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import ShoppingListSheet, { GROCERY_CATS, Ingredient } from '@/components/ShoppingListSheet';

// ─── color helpers ─────────────────────────────────────────────────────────
function hexToRgb(h: string): [number, number, number] {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(x => {
    x = Math.round(Math.max(0, Math.min(255, x)));
    return x.toString(16).padStart(2, '0');
  }).join('');
}
function mixHex(a: string, b: string, t: number) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

// ─── date helpers ──────────────────────────────────────────────────────────
const MN_DAYS_LONG  = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MN_DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MN_MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function isoWeekNum(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstTh = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - firstTh.getTime()) / 864e5 - 3 + (firstTh.getUTCDay() + 6) % 7) / 7);
}

/** ISO week key: "2026-W22" */
function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const year = t.getUTCFullYear();
  const wn   = isoWeekNum(d);
  return `${year}-W${String(wn).padStart(2, '0')}`;
}

function getMondayOfWeek(ref: Date): Date {
  const mon = new Date(ref);
  mon.setDate(ref.getDate() - (ref.getDay() + 6) % 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// ─── types & storage ───────────────────────────────────────────────────────
// Legacy AsyncStorage keys — used only for one-time migration
const STORAGE_RECIPES = 'nido_recipes_v2';
const STORAGE_PLANS   = 'nido_weekly_plans';

interface Recipe {
  id: string;
  name: string;
  color: string;
  meals: ('comida'|'cena')[];
  ingredients?: Ingredient[];
}
type Plan        = Record<string, string>;   // "dayIdx-meal" → recipeId
type WeeklyPlans = Record<string, Plan>;     // weekKey → Plan

const DISH_COLORS = ['#D97B66','#D9A577','#7FA86A','#79C1F2','#A881F2','#C25A7A','#5BA38C','#C99A3C'];

const DEFAULT_RECIPES: Recipe[] = [
  { id: 'r1', name: 'Ensalada César',      color: '#7FA86A', meals: ['comida','cena'] },
  { id: 'r2', name: 'Pasta al pesto',      color: '#5BA38C', meals: ['comida'] },
  { id: 'r3', name: 'Lentejas estofadas',  color: '#D9A577', meals: ['comida'] },
  { id: 'r4', name: 'Salmón al horno',     color: '#D97B66', meals: ['cena'] },
  { id: 'r5', name: 'Crema de verduras',   color: '#A881F2', meals: ['cena'] },
  { id: 'r6', name: 'Tortilla de patata',  color: '#C99A3C', meals: ['comida','cena'] },
  { id: 'r7', name: 'Pollo al limón',      color: '#79C1F2', meals: ['cena'] },
];

// ─── main screen ───────────────────────────────────────────────────────────
export default function MenuScreen() {
  const today       = new Date();
  const [offset, setOffset] = useState(0);   // weeks from current week (0 = this week)

  // Derived week values
  const currentMonday = getMondayOfWeek(today);
  const monday        = addDays(currentMonday, offset * 7);
  const days          = getWeekDays(monday);
  const wKey          = weekKey(monday);
  const week          = isoWeekNum(monday);
  const first         = days[0], last = days[6];
  const todayDow      = (today.getDay() + 6) % 7; // Mon=0
  const isThisWeek    = offset === 0;

  // Recipes (shared across all weeks)
  const [recipes, setRecipes] = useState<Recipe[]>(DEFAULT_RECIPES);

  // Per-week plans
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlans>({});

  // Current week's plan (derived)
  const plan: Plan = weeklyPlans[wKey] ?? {};

  // ── persistence: load from Supabase (with AsyncStorage migration) ──────
  useEffect(() => {
    if (!household?.id) return;
    (async () => {
      try {
        const [{ data: recipeRows }, { data: planRows }] = await Promise.all([
          supabase.from('recipes').select('*').eq('household_id', household.id),
          supabase.from('meal_plans').select('*').eq('household_id', household.id),
        ]);

        if (!recipeRows || recipeRows.length === 0) {
          // One-time migration from AsyncStorage
          const rRaw = await AsyncStorage.getItem(STORAGE_RECIPES);
          if (rRaw) {
            const parsed: Recipe[] = JSON.parse(rRaw);
            if (Array.isArray(parsed) && parsed.length) {
              await supabase.from('recipes').insert(
                parsed.map(r => ({ id: r.id, name: r.name, color: r.color, meals: r.meals, ingredients: r.ingredients ?? [], household_id: household.id }))
              );
              setRecipes(parsed);
              await AsyncStorage.removeItem(STORAGE_RECIPES);
            } else {
              setRecipes(DEFAULT_RECIPES);
            }
          } else {
            setRecipes(DEFAULT_RECIPES);
          }
        } else {
          setRecipes(recipeRows.map(r => ({ id: r.id, name: r.name, color: r.color, meals: r.meals as Recipe['meals'], ingredients: (r.ingredients ?? []) as Ingredient[] })));
        }

        if (!planRows || planRows.length === 0) {
          // One-time migration from AsyncStorage
          const pRaw = await AsyncStorage.getItem(STORAGE_PLANS);
          if (pRaw) {
            const parsed: WeeklyPlans = JSON.parse(pRaw);
            if (parsed && typeof parsed === 'object') {
              const rows = Object.entries(parsed).map(([week_key, plan]) => ({ household_id: household.id, week_key, plan }));
              if (rows.length > 0) await supabase.from('meal_plans').insert(rows);
              setWeeklyPlans(parsed);
              await AsyncStorage.removeItem(STORAGE_PLANS);
            }
          }
        } else {
          const wp: WeeklyPlans = {};
          planRows.forEach(row => { wp[row.week_key] = row.plan as Plan; });
          setWeeklyPlans(wp);
        }
      } catch (e) {
        console.error('[menu] load error', e);
      }
    })();
  }, [household?.id]);

  // ── helpers ────────────────────────────────────────────────────────────
  const recipeById = (id?: string) => id ? recipes.find(r => r.id === id) : undefined;

  const setPlanForWeek = useCallback((updater: (p: Plan) => Plan) => {
    setWeeklyPlans(wp => ({
      ...wp,
      [wKey]: updater(wp[wKey] ?? {}),
    }));
  }, [wKey]);

  const { accent } = useNidoStore();
  const { household } = useAuthStore();

  // ── sheet state ────────────────────────────────────────────────────────
  const [pick,       setPick]       = useState<{ day: number; meal: 'comida'|'cena' } | null>(null);
  const [editing,    setEditing]    = useState<Recipe | 'new' | null>(null);
  const [showDishes, setShowDishes] = useState(false);
  const [showShop,   setShowShop]   = useState(false);

  // ── compute ingredient list for this week ──────────────────────────────
  const weekIngredients = (() => {
    const seen = new Set<string>();
    const result: { name: string; amount?: string; category: string; recipeColor: string; recipeName: string }[] = [];
    Object.values(plan).forEach(rid => {
      const recipe = recipeById(rid);
      if (!recipe?.ingredients?.length) return;
      recipe.ingredients.forEach(ing => {
        const key = `${ing.name.toLowerCase()}|${ing.category}`;
        if (seen.has(key)) return;
        seen.add(key);
        result.push({ name: ing.name, amount: ing.amount, category: ing.category, recipeColor: recipe.color, recipeName: recipe.name });
      });
    });
    return result;
  })();

  const upsertWeekPlan = useCallback(async (wk: string, p: Plan) => {
    if (!household?.id) return;
    await supabase.from('meal_plans').upsert(
      { household_id: household.id, week_key: wk, plan: p, updated_at: new Date().toISOString() },
      { onConflict: 'household_id,week_key' }
    );
  }, [household?.id]);

  const assign = (rid: string | null) => {
    if (!pick) return;
    const k = `${pick.day}-${pick.meal}`;
    const newPlan: Plan = { ...(weeklyPlans[wKey] ?? {}) };
    if (rid) newPlan[k] = rid; else delete newPlan[k];
    setWeeklyPlans(wp => ({ ...wp, [wKey]: newPlan }));
    upsertWeekPlan(wKey, newPlan);
    setPick(null);
  };

  const saveRecipe = async (data: Recipe) => {
    if (!household?.id) return;
    const isExisting = data.id && recipes.some(r => r.id === data.id);
    if (isExisting) {
      await supabase.from('recipes').update({
        name: data.name, color: data.color, meals: data.meals, ingredients: data.ingredients ?? [],
      }).eq('id', data.id).eq('household_id', household.id);

      setRecipes(rs => rs.map(r => r.id === data.id ? { ...r, ...data } : r));

      // Remove from plans where meal type no longer matches
      const updatedPlans = { ...weeklyPlans };
      for (const wk in updatedPlans) {
        const p = { ...updatedPlans[wk] };
        Object.keys(p).forEach(k => {
          const meal = k.split('-')[1];
          if (p[k] === data.id && !data.meals.includes(meal as any)) delete p[k];
        });
        updatedPlans[wk] = p;
        await upsertWeekPlan(wk, p);
      }
      setWeeklyPlans(updatedPlans);
    } else {
      const newRecipe: Recipe = { ...data, id: 'rc' + Date.now() };
      await supabase.from('recipes').insert({
        id: newRecipe.id, name: newRecipe.name, color: newRecipe.color,
        meals: newRecipe.meals, ingredients: newRecipe.ingredients ?? [],
        household_id: household.id,
      });
      setRecipes(rs => [...rs, newRecipe]);
    }
    setEditing(null);
  };

  const deleteRecipe = async (id: string) => {
    if (!household?.id) return;
    await supabase.from('recipes').delete().eq('id', id).eq('household_id', household.id);

    setRecipes(rs => rs.filter(r => r.id !== id));

    const updatedPlans = { ...weeklyPlans };
    for (const wk in updatedPlans) {
      const p = { ...updatedPlans[wk] };
      Object.keys(p).forEach(k => { if (p[k] === id) delete p[k]; });
      updatedPlans[wk] = p;
      await upsertWeekPlan(wk, p);
    }
    setWeeklyPlans(updatedPlans);
    setEditing(null);
  };

  const dim = C.ink3;

  return (
    <SafeAreaView style={s.root}>
      {/* ─── header ─────────────────────────────────────────────────────── */}
      <View style={s.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>Semana {week}</Text>

          {/* Navigation row */}
          <View style={s.navRow}>
            <TouchableOpacity style={s.navBtn} onPress={() => setOffset(o => o - 1)} activeOpacity={0.7}>
              <Text style={s.navArrow}>‹</Text>
            </TouchableOpacity>

            <Text style={s.rangeText} numberOfLines={1}>
              <Text style={{ color: dim }}>del </Text>
              <Text style={s.rangeStrong}>{MN_DAYS_SHORT[0].toUpperCase()} {String(first.getDate()).padStart(2,'0')}</Text>
              <Text style={{ color: dim }}> al </Text>
              <Text style={s.rangeStrong}>{MN_DAYS_SHORT[6].toUpperCase()} {String(last.getDate()).padStart(2,'0')}</Text>
              <Text style={{ color: dim }}> de {MN_MONTHS[last.getMonth()]}</Text>
            </Text>

            <TouchableOpacity style={s.navBtn} onPress={() => setOffset(o => o + 1)} activeOpacity={0.7}>
              <Text style={s.navArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={s.addRecipeBtn} onPress={() => setEditing('new')}>
          <Text style={s.addRecipeBtnText}>+ Receta</Text>
        </TouchableOpacity>
      </View>

      {/* "Esta semana" pill when navigated away */}
      {!isThisWeek && (
        <TouchableOpacity style={s.todayPill} onPress={() => setOffset(0)} activeOpacity={0.8}>
          <Text style={s.todayPillText}>Ir a esta semana</Text>
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 110 }}>
        {/* ─── grid ─────────────────────────────────────────────────────── */}
        <View>
          <View style={s.headerRow}>
            <View style={s.corner} />
            <Text style={s.colHeader}>Comida</Text>
            <Text style={s.colHeader}>Cena</Text>
          </View>

          {days.map((d, i) => {
            const isToday      = isThisWeek && i === todayDow;
            const comidaRecipe = recipeById(plan[`${i}-comida`]);
            const cenaRecipe   = recipeById(plan[`${i}-cena`]);
            return (
              <View key={i} style={s.dayRow}>
                {/* day label */}
                <View style={[s.dayLabel, isToday && { backgroundColor: C.brand }]}>
                  <Text style={[s.dayShort, isToday && { color: C.white }]}>{MN_DAYS_SHORT[i]}</Text>
                  <Text style={[s.dayNum,   isToday && { color: C.white }]}>{d.getDate()}</Text>
                </View>

                {/* comida */}
                <TouchableOpacity
                  style={[
                    s.cell,
                    comidaRecipe
                      ? { backgroundColor: mixHex(C.paper, comidaRecipe.color, 0.28), borderColor: mixHex(C.paper, comidaRecipe.color, 0.42), borderStyle: 'solid' }
                      : { borderStyle: 'dashed' },
                  ]}
                  onPress={() => setPick({ day: i, meal: 'comida' })}
                  activeOpacity={0.75}
                >
                  {comidaRecipe
                    ? <Text style={[s.dishName, { color: mixHex(comidaRecipe.color, '#241E18', 0.55) }]}>{comidaRecipe.name}</Text>
                    : <Text style={s.cellPlus}>+</Text>}
                </TouchableOpacity>

                {/* cena */}
                <TouchableOpacity
                  style={[
                    s.cell,
                    cenaRecipe
                      ? { backgroundColor: mixHex(C.paper, cenaRecipe.color, 0.28), borderColor: mixHex(C.paper, cenaRecipe.color, 0.42), borderStyle: 'solid' }
                      : { borderStyle: 'dashed' },
                  ]}
                  onPress={() => setPick({ day: i, meal: 'cena' })}
                  activeOpacity={0.75}
                >
                  {cenaRecipe
                    ? <Text style={[s.dishName, { color: mixHex(cenaRecipe.color, '#241E18', 0.55) }]}>{cenaRecipe.name}</Text>
                    : <Text style={s.cellPlus}>+</Text>}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* bottom buttons */}
        <View style={s.bottomBtns}>
          <TouchableOpacity style={s.seeDishesBtn} onPress={() => setShowDishes(true)}>
            <Text style={s.seeDishesText}>Ver platos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.shopBtn, { borderColor: accent.hex + '70', backgroundColor: accent.wash }]} onPress={() => setShowShop(true)}>
            <Text style={[s.shopBtnText, { color: accent.hex }]}>
              🛒 Lista de la compra · Semana {week}
              {weekIngredients.length > 0 ? ` (${weekIngredients.length} ingredientes)` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ─── sheets ───────────────────────────────────────────────────────── */}
      {pick && (
        <PickSheet
          day={MN_DAYS_LONG[pick.day]}
          meal={pick.meal}
          recipes={recipes.filter(r => r.meals.includes(pick.meal))}
          current={plan[`${pick.day}-${pick.meal}`]}
          onPick={assign}
          onClose={() => setPick(null)}
          onNewRecipe={() => {
            const m = pick.meal;
            setPick(null);
            setTimeout(() => setEditing({ id: '', name: '', color: DISH_COLORS[0], meals: [m] }), 80);
          }}
        />
      )}

      {showDishes && (
        <DishesSheet
          recipes={recipes}
          onClose={() => setShowDishes(false)}
          onEdit={r => { setShowDishes(false); setTimeout(() => setEditing(r), 80); }}
          onNew={() => { setShowDishes(false); setTimeout(() => setEditing('new'), 80); }}
        />
      )}

      {editing && (
        <RecipeSheet
          recipe={editing === 'new' ? null : editing as Recipe}
          onClose={() => setEditing(null)}
          onSave={saveRecipe}
          onDelete={deleteRecipe}
        />
      )}

      <ShoppingListSheet
        visible={showShop}
        onClose={() => setShowShop(false)}
        weekKey={wKey}
        weekLabel={`Semana ${week}`}
        recipeItems={weekIngredients}
        accent={accent}
      />
    </SafeAreaView>
  );
}

// ─── PickSheet ──────────────────────────────────────────────────────────────
function PickSheet({ day, meal, recipes, current, onPick, onClose, onNewRecipe }: {
  day: string; meal: 'comida'|'cena'; recipes: Recipe[];
  current?: string; onPick: (id: string|null) => void;
  onClose: () => void; onNewRecipe: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide">
      <TouchableOpacity style={sh.scrim} activeOpacity={1} onPress={onClose} />
      <View style={sh.sheet}>
        <View style={sh.grab} />
        <View style={sh.body}>
          <View style={sh.row}>
            <View style={{ flex: 1 }}>
              <Text style={sh.eyebrow}>{meal === 'comida' ? 'Comida' : 'Cena'} · {day}</Text>
              <Text style={sh.title}>Elige un plato</Text>
            </View>
            <TouchableOpacity style={sh.iconBtn} onPress={onClose}>
              <Text style={sh.iconBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ marginTop: 18 }} showsVerticalScrollIndicator={false}>
            {recipes.length === 0 && (
              <Text style={sh.muted}>Todavía no hay platos para {meal === 'comida' ? 'la comida' : 'la cena'}.</Text>
            )}
            {recipes.map(r => (
              <TouchableOpacity
                key={r.id}
                style={[sh.recipeRow, current === r.id && { borderColor: C.brand, backgroundColor: C.brandWash }]}
                onPress={() => onPick(r.id)}
              >
                <View style={[sh.rdot, { backgroundColor: r.color }]} />
                <Text style={sh.rname}>{r.name}</Text>
                {current === r.id && <Text style={{ color: C.brand, fontWeight: '700' }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={[sh.row, { marginTop: 18, gap: 10 }]}>
            <TouchableOpacity onPress={() => onPick(null)} disabled={!current}>
              <Text style={[sh.linkBtn, { color: current ? C.brand : C.ink3 }]}>Vaciar hueco</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sh.ghostBtn} onPress={onNewRecipe}>
              <Text style={sh.ghostBtnText}>+ Nueva receta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── DishesSheet ────────────────────────────────────────────────────────────
function DishesSheet({ recipes, onClose, onEdit, onNew }: {
  recipes: Recipe[]; onClose: () => void;
  onEdit: (r: Recipe) => void; onNew: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide">
      <TouchableOpacity style={sh.scrim} activeOpacity={1} onPress={onClose} />
      <View style={sh.sheet}>
        <View style={sh.grab} />
        <View style={sh.body}>
          <View style={sh.row}>
            <View style={{ flex: 1 }}>
              <Text style={sh.eyebrow}>{recipes.length} platos</Text>
              <Text style={sh.title}>Todos los platos</Text>
            </View>
            <TouchableOpacity style={sh.iconBtn} onPress={onClose}>
              <Text style={sh.iconBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ marginTop: 18 }} showsVerticalScrollIndicator={false}>
            {recipes.map(r => (
              <TouchableOpacity key={r.id} style={sh.recipeRow} onPress={() => onEdit(r)}>
                <View style={[sh.rdot, { backgroundColor: r.color }]} />
                <Text style={sh.rname}>{r.name}</Text>
                <MealTags meals={r.meals} />
                <Text style={{ color: C.ink3, fontSize: 16 }}>✏︎</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity style={[sh.ghostBtn, { marginTop: 18, alignSelf: 'stretch' }]} onPress={onNew}>
            <Text style={sh.ghostBtnText}>+ Añadir receta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── RecipeSheet ────────────────────────────────────────────────────────────
function RecipeSheet({ recipe, onClose, onSave, onDelete }: {
  recipe: Recipe | null; onClose: () => void;
  onSave: (data: Recipe) => void; onDelete: (id: string) => void;
}) {
  const [name,        setName]        = useState(recipe?.name  ?? '');
  const [color,       setColor]       = useState(recipe?.color ?? DISH_COLORS[0]);
  const [meals,       setMeals]       = useState<('comida'|'cena')[]>(recipe?.meals ?? ['comida', 'cena']);
  const [ingredients, setIngredients] = useState<Ingredient[]>(recipe?.ingredients ?? []);
  const [ingName,       setIngName]       = useState('');
  const [ingCat,        setIngCat]        = useState('otros');
  const [showCatPicker, setShowCatPicker] = useState(false);
  const isEdit = !!(recipe?.id);

  const addIngredient = () => {
    if (!ingName.trim()) return;
    const ing: Ingredient = { id: 'ing' + Date.now(), name: ingName.trim(), category: ingCat };
    setIngredients(prev => [...prev, ing]);
    setIngName('');
    setShowCatPicker(false);
  };
  const removeIngredient = (id: string) => setIngredients(prev => prev.filter(i => i.id !== id));

  const toggleMeal = (k: 'comida'|'cena') =>
    setMeals(m => m.includes(k) ? (m.length > 1 ? m.filter(x => x !== k) : m) : [...m, k]);

  const valid = name.trim() && meals.length > 0;

  const handleSave = () => {
    if (!valid) return;
    onSave({ ...(recipe ?? {}), id: recipe?.id ?? '', name: name.trim(), color, meals, ingredients } as Recipe);
  };

  const previewBg     = mixHex(C.paper, color, 0.28);
  const previewBorder = mixHex(C.paper, color, 0.42);

  return (
    <Modal visible transparent animationType="slide">
      <TouchableOpacity style={sh.scrim} activeOpacity={1} onPress={onClose} />
      <View style={sh.sheet}>
        <View style={sh.grab} />
        <ScrollView style={sh.body} showsVerticalScrollIndicator={false}>
          <View style={sh.row}>
            <Text style={sh.title}>{isEdit ? 'Editar receta' : 'Añadir receta'}</Text>
            <TouchableOpacity style={sh.iconBtn} onPress={onClose}>
              <Text style={sh.iconBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={sh.label}>Nombre del plato</Text>
          <TextInput
            style={sh.field}
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder="Ej: Garbanzos con espinacas"
            placeholderTextColor={C.ink3}
          />

          <Text style={sh.label}>¿Cuándo se sirve?</Text>
          <View style={sh.mealPick}>
            {(['comida', 'cena'] as const).map(k => (
              <TouchableOpacity
                key={k}
                style={[sh.mealOpt, meals.includes(k) && { borderColor: C.brand, backgroundColor: C.brandWash }]}
                onPress={() => toggleMeal(k)}
              >
                {meals.includes(k) && <Text style={{ color: C.brand, fontSize: 13, fontWeight: '700' }}>✓ </Text>}
                <Text style={[sh.mealOptText, meals.includes(k) && { color: C.ink }]}>
                  {k === 'comida' ? 'Comida' : 'Cena'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={sh.label}>Color</Text>
          <View style={sh.colorRow}>
            {DISH_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[sh.swatch, { backgroundColor: c }, color === c && sh.swatchOn]}
                onPress={() => setColor(c)}
              >
                {color === c && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>

          <View style={[sh.preview, { backgroundColor: previewBg, borderColor: previewBorder }]}>
            <Text style={[sh.previewName, { color: mixHex(color, '#241E18', 0.55) }]}>
              {name.trim() || 'Vista previa del plato'}
            </Text>
            <MealTags meals={meals} />
          </View>

          {/* Ingredients */}
          <Text style={sh.label}>Ingredientes</Text>

          {/* existing ingredients */}
          {ingredients.map(ing => (
            <View key={ing.id} style={sh.ingRow}>
              <Text style={sh.ingEmoji}>{GROCERY_CATS.find(c => c.key === ing.category)?.emoji ?? '🛒'}</Text>
              <Text style={sh.ingName}>{ing.name}</Text>
              <TouchableOpacity onPress={() => removeIngredient(ing.id)} style={{ padding: 4 }}>
                <Text style={{ color: C.ink3, fontSize: 14 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* add ingredient row */}
          <View style={sh.ingAdd}>
            <View style={sh.ingAddRow}>
              <TextInput
                style={sh.ingInput}
                placeholder="Ingrediente"
                placeholderTextColor={C.ink3}
                value={ingName}
                onChangeText={setIngName}
                returnKeyType="done"
                onSubmitEditing={addIngredient}
              />
              <TouchableOpacity
                style={[sh.ingCatBtn, showCatPicker && { borderColor: color }]}
                onPress={() => setShowCatPicker(v => !v)}
              >
                <Text style={{ fontSize: 20 }}>
                  {GROCERY_CATS.find(c => c.key === ingCat)?.emoji ?? '🛒'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[sh.ingAddBtn, { backgroundColor: color }, !ingName.trim() && { opacity: 0.4 }]}
                onPress={addIngredient}
                disabled={!ingName.trim()}
              >
                <Text style={{ color: C.white, fontWeight: '500', fontSize: 22, lineHeight: 26 }}>+</Text>
              </TouchableOpacity>
            </View>

            {/* compact category grid — shown on demand */}
            {showCatPicker && (
              <View style={sh.ingCatGrid}>
                {GROCERY_CATS.map(c => (
                  <TouchableOpacity
                    key={c.key}
                    style={[sh.ingCatGridItem, ingCat === c.key && { backgroundColor: color + '25', borderColor: color }]}
                    onPress={() => { setIngCat(c.key); setShowCatPicker(false); }}
                  >
                    <Text style={{ fontSize: 20 }}>{c.emoji}</Text>
                    <Text style={sh.ingCatGridLabel} numberOfLines={1}>{c.label.split(' ')[0]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[sh.primaryBtn, !valid && { opacity: 0.4 }]}
            onPress={handleSave}
            disabled={!valid}
          >
            <Text style={sh.primaryBtnText}>{isEdit ? 'Guardar cambios' : 'Guardar receta'}</Text>
          </TouchableOpacity>

          {isEdit && (
            <TouchableOpacity style={{ marginTop: 4, alignItems: 'center', paddingVertical: 14 }} onPress={() => onDelete(recipe!.id)}>
              <Text style={{ color: C.ink3, fontFamily: FONT, fontSize: 14 }}>Eliminar plato</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── MealTags ───────────────────────────────────────────────────────────────
function MealTags({ meals }: { meals: string[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {meals.map(m => (
        <View key={m} style={mt.tag}>
          <Text style={mt.tagText}>{m === 'comida' ? 'Comida' : 'Cena'}</Text>
        </View>
      ))}
    </View>
  );
}
const mt = StyleSheet.create({
  tag:     { backgroundColor: 'rgba(33,28,23,0.07)', borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 10, fontWeight: '600', color: C.ink2, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 0.4 },
});

// ─── styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, gap: 12,
  },
  eyebrow: {
    fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT,
    fontWeight: '500', textTransform: 'uppercase', marginBottom: 6,
  },

  navRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navBtn: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  navArrow: { fontSize: 20, color: C.ink, lineHeight: 24, fontWeight: '300' },

  rangeText:   { flex: 1, fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: C.ink, fontFamily: FONT },
  rangeStrong: { fontWeight: '600', color: C.ink },

  addRecipeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 38, paddingHorizontal: 15, borderRadius: R.pill,
    backgroundColor: C.ink, marginTop: 14,
  },
  addRecipeBtnText: { color: C.paper, fontSize: 14, fontWeight: '600', fontFamily: FONT },

  todayPill: {
    alignSelf: 'center', marginBottom: 10,
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: R.pill, backgroundColor: C.brandWash, borderWidth: 1, borderColor: C.brand + '40',
  },
  todayPillText: { fontSize: 13, fontWeight: '600', color: C.brand, fontFamily: FONT },

  headerRow: { flexDirection: 'row', gap: 7, marginBottom: 7 },
  dayRow:    { flexDirection: 'row', gap: 7, marginBottom: 7 },
  corner:    { width: 42 },
  colHeader: {
    flex: 1, fontSize: 11, fontWeight: '600', letterSpacing: 0.8,
    textTransform: 'uppercase', color: C.ink3, fontFamily: FONT, textAlign: 'center', paddingBottom: 2,
  },

  dayLabel:  { width: 42, borderRadius: R.m, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  dayShort:  { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, color: C.ink3, fontFamily: FONT },
  dayNum:    { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: C.ink, fontFamily: FONT },

  cell: {
    flex: 1, minHeight: 64, borderRadius: R.m, padding: 10,
    borderWidth: 1.5, borderColor: C.line, backgroundColor: C.paperSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  dishName: { fontSize: 12, fontWeight: '600', lineHeight: 15, letterSpacing: -0.2, textAlign: 'center', fontFamily: FONT },
  cellPlus: { color: C.ink3, fontSize: 18, lineHeight: 20 },

  bottomBtns: { marginTop: 18, gap: 10 },
  seeDishesBtn: {
    height: 42, paddingHorizontal: 22,
    borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center',
  },
  seeDishesText: { fontSize: 14, fontWeight: '600', color: C.ink2, fontFamily: FONT },
  shopBtn: {
    height: 42, paddingHorizontal: 22,
    borderRadius: R.pill, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  shopBtnText: { fontSize: 14, fontWeight: '600', fontFamily: FONT },
});

const sh = StyleSheet.create({
  scrim:  { flex: 1, backgroundColor: 'rgba(33,28,23,0.42)' },
  sheet:  { backgroundColor: C.paper, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl },
  grab:   { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginTop: 12 },
  body:   { padding: 22, paddingBottom: 0, maxHeight: 580 },
  row:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow:{ fontSize: 11, letterSpacing: 1.5, color: C.ink3, fontFamily: FONT, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  title:  { fontSize: 22, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  iconBtn:     { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { color: C.ink2, fontSize: 16 },
  muted:  { fontSize: 13.5, color: C.ink3, fontFamily: FONT, paddingVertical: 8 },

  recipeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 13, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line,
    backgroundColor: C.card, marginBottom: 7,
  },
  rdot:  { width: 14, height: 14, borderRadius: 7 },
  rname: { flex: 1, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: C.ink, fontFamily: FONT },

  linkBtn:      { fontSize: 14, fontWeight: '600', fontFamily: FONT },
  ghostBtn:     { borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  ghostBtnText: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: FONT },

  label: { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, marginBottom: 8, marginTop: 18, textTransform: 'uppercase', letterSpacing: 0.6 },
  field: {
    borderWidth: 1.5, borderColor: C.line, borderRadius: R.l,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: C.ink,
    backgroundColor: C.card, fontFamily: FONT, marginBottom: 4,
  },
  mealPick:    { flexDirection: 'row', gap: 10, marginBottom: 4 },
  mealOpt:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  mealOptText: { fontSize: 14, fontWeight: '600', color: C.ink2, fontFamily: FONT },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  swatch:   { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 3, borderColor: C.ink },

  preview:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line, marginTop: 14 },
  previewName: { flex: 1, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, fontFamily: FONT },

  primaryBtn:     { backgroundColor: C.ink, borderRadius: R.pill, paddingVertical: 16, alignItems: 'center', marginTop: 22 },
  primaryBtnText: { color: C.paper, fontWeight: '600', fontSize: 16, fontFamily: FONT },

  ingRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line },
  ingEmoji:   { fontSize: 18, width: 26, textAlign: 'center' },
  ingName:    { flex: 1, fontSize: 14, color: C.ink, fontFamily: FONT },
  ingAdd:     { marginTop: 10, backgroundColor: C.paperSoft, borderRadius: R.l, padding: 10, marginBottom: 4 },
  ingAddRow:  { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ingInput:   { flex: 1, borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.ink, backgroundColor: C.card, fontFamily: FONT },
  ingCatBtn:  { width: 46, height: 46, borderRadius: R.l, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  ingAddBtn:  { width: 46, height: 46, borderRadius: R.l, alignItems: 'center', justifyContent: 'center' },
  ingCatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  ingCatGridItem: { width: '22%', alignItems: 'center', paddingVertical: 8, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, gap: 3 },
  ingCatGridLabel:{ fontSize: 9, color: C.ink3, fontFamily: FONT, textAlign: 'center' },
});
