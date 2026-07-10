import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { useMenuStore, Recipe, DISH_COLORS } from '@/store/menuStore';
import { getMondayOfWeek, addDays, isoWeekNum, weekKey } from '@/lib/week';
import ShoppingListSheet, { GROCERY_CATS, Ingredient } from '@/components/ShoppingListSheet';
import { showToast } from '@/store/toastStore';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';
import BottomSheet from '@/components/BottomSheet';
import PressScale from '@/components/PressScale';

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

// ─── date display helpers (el cálculo de week_key vive en @/lib/week) ────────
const MN_DAYS_LONG  = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MN_DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MN_MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

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

  const { accent } = useNidoStore();
  const { household } = useAuthStore();

  // Estado compartido (mismo store que la tab Semana → nunca divergen)
  const {
    recipes, weeklyPlans, recipeById,
    loadMenu, assignPlan,
    saveRecipe: storeSaveRecipe, deleteRecipe: storeDeleteRecipe,
    loaded, loadError,
  } = useMenuStore();

  // Current week's plan (derived)
  const plan = weeklyPlans[wKey] ?? {};

  // ── persistence: carga compartida desde el store ─────────────────────────
  useEffect(() => { if (household?.id) loadMenu(household.id); }, [household?.id]);
  useFocusEffect(useCallback(() => { if (household?.id) loadMenu(household.id); }, [household?.id]));

  // ── sheet state ────────────────────────────────────────────────────────
  const [pick,       setPick]       = useState<{ day: number; meal: 'comida'|'cena' } | null>(null);
  const [editing,    setEditing]    = useState<Recipe | 'new' | null>(null);
  const [showDishes, setShowDishes] = useState(false);
  const [showShop,   setShowShop]   = useState(false);

  // Los sheets se montan siempre (para que BottomSheet anime entrada Y salida).
  // Esta `key` sube en cada apertura → fuerza remount y estado de formulario
  // fresco, como cuando se montaban/desmontaban con el gating anterior.
  const [pickKey, setPickKey] = useState(0);
  useEffect(() => { if (pick) setPickKey((k) => k + 1); }, [pick]);
  const [editKey, setEditKey] = useState(0);
  useEffect(() => { if (editing) setEditKey((k) => k + 1); }, [editing]);

  // ── compute ingredient list for this week ──────────────────────────────
  const weekIngredients = (() => {
    const seen = new Set<string>();
    const result: { name: string; amount?: string; category: string; recipeColor: string; recipeName: string; recipeId: string; ingredientId: string }[] = [];
    Object.values(plan).forEach(rid => {
      const recipe = recipeById(rid);
      if (!recipe?.ingredients?.length) return;
      recipe.ingredients.forEach(ing => {
        const key = `${ing.name.toLowerCase()}|${ing.category}`;
        if (seen.has(key)) return;
        seen.add(key);
        result.push({ name: ing.name, amount: ing.amount, category: ing.category, recipeColor: recipe.color, recipeName: recipe.name, recipeId: recipe.id, ingredientId: ing.id });
      });
    });
    return result;
  })();

  const assign = (rid: string | null) => {
    if (!pick || !household?.id) return;
    assignPlan(household.id, wKey, `${pick.day}-${pick.meal}`, rid);
    setPick(null);
  };

  const saveRecipe = async (data: Recipe) => {
    setEditing(null);
    if (!household?.id) return;
    const { ok } = await storeSaveRecipe(household.id, data);
    if (!ok) showToast('No se pudo guardar el plato', 'error');
  };

  const deleteRecipe = async (id: string) => {
    setEditing(null);
    if (!household?.id) return;
    const { ok } = await storeDeleteRecipe(household.id, id);
    if (!ok) showToast('No se pudo eliminar el plato', 'error');
  };

  const dim = C.ink3;

  if (!loaded && !loadError) {
    return <SafeAreaView style={s.root}><ScreenLoader color={accent.hex} /></SafeAreaView>;
  }
  if (!loaded && loadError) {
    return (
      <SafeAreaView style={s.root}>
        <ScreenError onRetry={() => household?.id && loadMenu(household.id)} color={accent.hex} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      {/* ─── header ─────────────────────────────────────────────────────── */}
      <View style={s.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>Semana {week}</Text>

          {/* Navigation row */}
          <View style={s.navRow}>
            <PressScale style={s.navBtn} onPress={() => setOffset(o => o - 1)} scaleTo={0.9} accessibilityRole="button" accessibilityLabel="Semana anterior">
              <Text style={s.navArrow}>‹</Text>
            </PressScale>

            <Text style={s.rangeText} numberOfLines={1}>
              <Text style={{ color: dim }}>del </Text>
              <Text style={s.rangeStrong}>{MN_DAYS_SHORT[0].toUpperCase()} {String(first.getDate()).padStart(2,'0')}</Text>
              <Text style={{ color: dim }}> al </Text>
              <Text style={s.rangeStrong}>{MN_DAYS_SHORT[6].toUpperCase()} {String(last.getDate()).padStart(2,'0')}</Text>
              <Text style={{ color: dim }}> de {MN_MONTHS[last.getMonth()]}</Text>
            </Text>

            <PressScale style={s.navBtn} onPress={() => setOffset(o => o + 1)} scaleTo={0.9} accessibilityRole="button" accessibilityLabel="Semana siguiente">
              <Text style={s.navArrow}>›</Text>
            </PressScale>
          </View>
        </View>

        <PressScale style={[s.addRecipeBtn, { backgroundColor: accent.hex }]} onPress={() => setEditing('new')} scaleTo={0.96} accessibilityRole="button" accessibilityLabel="Añadir receta">
          <Text style={s.addRecipeBtnText}>+ Receta</Text>
        </PressScale>
      </View>

      {/* "Esta semana" pill when navigated away */}
      {!isThisWeek && (
        <PressScale style={s.todayPill} onPress={() => setOffset(0)} scaleTo={0.95} accessibilityRole="button" accessibilityLabel="Ir a esta semana">
          <Text style={s.todayPillText}>Ir a esta semana</Text>
        </PressScale>
      )}

      <ScrollView alwaysBounceVertical={false} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 32 }}>
        {/* ─── grid ─────────────────────────────────────────────────────── */}
        <View>
          <View style={s.headerRow}>
            <View style={s.corner} />
            <Text style={s.colHeader}>Comida</Text>
            <Text style={s.colHeader}>Cena</Text>
          </View>

          {days.map((d, i) => {
            const isToday      = isThisWeek && i === todayDow;
            const comidaVal    = plan[`${i}-comida`];
            const cenaVal      = plan[`${i}-cena`];
            const comidaRecipe = recipeById(comidaVal);
            const cenaRecipe   = recipeById(cenaVal);
            const comidaEvent  = !comidaRecipe && comidaVal?.startsWith('event:') ? comidaVal.slice(6) : null;
            const cenaEvent    = !cenaRecipe && cenaVal?.startsWith('event:') ? cenaVal.slice(6) : null;
            return (
              <View key={i} style={s.dayRow}>
                {/* day label */}
                <View style={[s.dayLabel, isToday && { backgroundColor: C.brand }]}>
                  <Text style={[s.dayShort, isToday && { color: C.white }]}>{MN_DAYS_SHORT[i]}</Text>
                  <Text style={[s.dayNum,   isToday && { color: C.white }]}>{d.getDate()}</Text>
                </View>

                {/* comida */}
                <PressScale
                  style={[
                    s.cell,
                    comidaRecipe
                      ? { backgroundColor: mixHex(C.paper, comidaRecipe.color, 0.28), borderColor: mixHex(C.paper, comidaRecipe.color, 0.42), borderStyle: 'solid' }
                      : comidaEvent
                        ? { backgroundColor: C.white, borderColor: C.line, borderStyle: 'solid' }
                        : { borderStyle: 'dashed' },
                  ]}
                  onPress={() => setPick({ day: i, meal: 'comida' })}
                  scaleTo={0.96}
                  accessibilityRole="button"
                  accessibilityLabel={`${MN_DAYS_LONG[i]}, comida${comidaRecipe ? ': ' + comidaRecipe.name : comidaEvent ? ': ' + comidaEvent : ', añadir'}`}
                >
                  {comidaRecipe
                    ? <Text style={[s.dishName, { color: mixHex(comidaRecipe.color, C.ink, 0.55) }]}>{comidaRecipe.name}</Text>
                    : comidaEvent
                      ? <Text style={s.eventCellName}>{comidaEvent}</Text>
                      : <Text style={s.cellPlus}>+</Text>}
                </PressScale>

                {/* cena */}
                <PressScale
                  style={[
                    s.cell,
                    cenaRecipe
                      ? { backgroundColor: mixHex(C.paper, cenaRecipe.color, 0.28), borderColor: mixHex(C.paper, cenaRecipe.color, 0.42), borderStyle: 'solid' }
                      : cenaEvent
                        ? { backgroundColor: C.white, borderColor: C.line, borderStyle: 'solid' }
                        : { borderStyle: 'dashed' },
                  ]}
                  onPress={() => setPick({ day: i, meal: 'cena' })}
                  scaleTo={0.96}
                  accessibilityRole="button"
                  accessibilityLabel={`${MN_DAYS_LONG[i]}, cena${cenaRecipe ? ': ' + cenaRecipe.name : cenaEvent ? ': ' + cenaEvent : ', añadir'}`}
                >
                  {cenaRecipe
                    ? <Text style={[s.dishName, { color: mixHex(cenaRecipe.color, C.ink, 0.55) }]}>{cenaRecipe.name}</Text>
                    : cenaEvent
                      ? <Text style={s.eventCellName}>{cenaEvent}</Text>
                      : <Text style={s.cellPlus}>+</Text>}
                </PressScale>
              </View>
            );
          })}
        </View>

        {/* bottom buttons */}
        <View style={s.bottomBtns}>
          <PressScale style={s.seeDishesBtn} onPress={() => setShowDishes(true)} scaleTo={0.97} accessibilityRole="button" accessibilityLabel="Ver todos los platos">
            <Text style={s.seeDishesText}>Ver platos</Text>
          </PressScale>
          <PressScale style={[s.shopBtn, { borderColor: accent.hex + '70', backgroundColor: accent.wash }]} onPress={() => setShowShop(true)} scaleTo={0.98} accessibilityRole="button" accessibilityLabel="Abrir la lista de la compra">
            <Text style={[s.shopBtnText, { color: accent.hex }]}>
              🛒 Lista de la compra · Semana {week}
              {weekIngredients.length > 0 ? ` (${weekIngredients.length} ingredientes)` : ''}
            </Text>
          </PressScale>
        </View>
      </ScrollView>

      {/* ─── sheets ───────────────────────────────────────────────────────── */}
      <PickSheet
        key={pickKey}
        visible={!!pick}
        day={pick ? MN_DAYS_LONG[pick.day] : ''}
        meal={pick?.meal ?? 'comida'}
        recipes={pick ? recipes.filter(r => r.meals.includes(pick.meal)) : []}
        current={pick ? plan[`${pick.day}-${pick.meal}`] : undefined}
        onPick={assign}
        onClose={() => setPick(null)}
        onNewRecipe={() => {
          const m = pick?.meal ?? 'comida';
          setPick(null);
          setTimeout(() => setEditing({ id: '', name: '', color: DISH_COLORS[0], meals: [m] }), 80);
        }}
      />

      <DishesSheet
        visible={showDishes}
        recipes={recipes}
        onClose={() => setShowDishes(false)}
        onEdit={r => { setShowDishes(false); setTimeout(() => setEditing(r), 80); }}
        onNew={() => { setShowDishes(false); setTimeout(() => setEditing('new'), 80); }}
      />

      <RecipeSheet
        key={editKey}
        visible={!!editing}
        recipe={editing === 'new' ? null : (editing as Recipe | null)}
        onClose={() => setEditing(null)}
        onSave={saveRecipe}
        onDelete={deleteRecipe}
      />

      <ShoppingListSheet
        visible={showShop}
        onClose={() => setShowShop(false)}
        weekKey={wKey}
        weekLabel={`Semana ${week}`}
        recipeItems={weekIngredients}
        accent={accent}
        householdId={household?.id ?? ''}
      />
    </SafeAreaView>
  );
}

// ─── PickSheet ──────────────────────────────────────────────────────────────
function PickSheet({ visible, day, meal, recipes, current, onPick, onClose, onNewRecipe }: {
  visible: boolean; day: string; meal: 'comida'|'cena'; recipes: Recipe[];
  current?: string; onPick: (id: string|null) => void;
  onClose: () => void; onNewRecipe: () => void;
}) {
  // Retiene los últimos datos con el sheet abierto para que el contenido no
  // parpadee durante la animación de salida (cuando los props ya llegan vacíos).
  const snap = useRef({ day, meal, recipes, current });
  if (visible) snap.current = { day, meal, recipes, current };
  const { day: dDay, meal: dMeal, recipes: dRecipes, current: dCurrent } = snap.current;

  const currentEventName = dCurrent?.startsWith('event:') ? dCurrent.slice(6) : '';
  const [eventText, setEventText] = useState(currentEventName);
  const isEventActive = !!currentEventName;

  const submitEvent = () => {
    const name = eventText.trim();
    if (!name) return;
    onPick('event:' + name);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={sh.body}>
        <View style={sh.row}>
          <View style={{ flex: 1 }}>
            <Text style={sh.eyebrow}>{dMeal === 'comida' ? 'Comida' : 'Cena'} · {dDay}</Text>
            <Text style={sh.title}>Elige un plato</Text>
          </View>
          <TouchableOpacity style={sh.iconBtn} onPress={onClose}>
            <Text style={sh.iconBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ marginTop: 18 }} showsVerticalScrollIndicator={false}>
          {dRecipes.length === 0 && (
            <Text style={sh.muted}>Todavía no hay platos para {dMeal === 'comida' ? 'la comida' : 'la cena'}.</Text>
          )}
          {dRecipes.map(r => (
            <PressScale
              key={r.id}
              style={[sh.recipeRow, !isEventActive && dCurrent === r.id && { borderColor: C.brand, backgroundColor: C.brandWash }]}
              onPress={() => onPick(r.id)}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={`Elegir ${r.name}`}
            >
              <View style={[sh.rdot, { backgroundColor: r.color }]} />
              <Text style={sh.rname}>{r.name}</Text>
              {!isEventActive && dCurrent === r.id && <Text style={{ color: C.brand, fontWeight: '700' }}>✓</Text>}
            </PressScale>
          ))}

          <View style={sh.sectionDivider} />
          <Text style={sh.sectionTitle}>Añade un evento</Text>
          <View style={[sh.eventRow, isEventActive && { borderColor: C.brand, backgroundColor: C.brandWash }]}>
            <TextInput
              style={sh.eventInput}
              value={eventText}
              onChangeText={setEventText}
              placeholder="Ej: Cumpleaños, Restaurante…"
              placeholderTextColor={C.ink3}
              returnKeyType="done"
              onSubmitEditing={submitEvent}
            />
            <TouchableOpacity
              style={[sh.eventBtn, !eventText.trim() && { opacity: 0.35 }]}
              onPress={submitEvent}
              disabled={!eventText.trim()}
              activeOpacity={0.8}
            >
              <Text style={sh.eventBtnText}>Añadir</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={[sh.row, { marginTop: 18, gap: 10 }]}>
          <TouchableOpacity onPress={() => onPick(null)} disabled={!dCurrent}>
            <Text style={[sh.linkBtn, { color: dCurrent ? C.brand : C.ink3 }]}>Vaciar hueco</Text>
          </TouchableOpacity>
          <PressScale style={sh.ghostBtn} onPress={onNewRecipe} scaleTo={0.96} accessibilityRole="button" accessibilityLabel="Nueva receta">
            <Text style={sh.ghostBtnText}>+ Nueva receta</Text>
          </PressScale>
        </View>
      </View>
    </BottomSheet>
  );
}

// ─── DishesSheet ────────────────────────────────────────────────────────────
function DishesSheet({ visible, recipes, onClose, onEdit, onNew }: {
  visible: boolean; recipes: Recipe[]; onClose: () => void;
  onEdit: (r: Recipe) => void; onNew: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
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
            <PressScale key={r.id} style={sh.recipeRow} onPress={() => onEdit(r)} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={`Editar ${r.name}`}>
              <View style={[sh.rdot, { backgroundColor: r.color }]} />
              <Text style={sh.rname}>{r.name}</Text>
              <MealTags meals={r.meals} />
              <Text style={{ color: C.ink3, fontSize: 16 }}>✏︎</Text>
            </PressScale>
          ))}
        </ScrollView>

        <PressScale style={[sh.ghostBtn, { marginTop: 18, alignSelf: 'stretch' }]} onPress={onNew} scaleTo={0.96} accessibilityRole="button" accessibilityLabel="Añadir receta">
          <Text style={sh.ghostBtnText}>+ Añadir receta</Text>
        </PressScale>
      </View>
    </BottomSheet>
  );
}

// ─── RecipeSheet ────────────────────────────────────────────────────────────
function RecipeSheet({ visible, recipe, onClose, onSave, onDelete }: {
  visible: boolean; recipe: Recipe | null; onClose: () => void;
  onSave: (data: Recipe) => void; onDelete: (id: string) => void;
}) {
  // Retiene la receta con el sheet abierto (para no perder isEdit/título/borrar
  // mientras se anima la salida, cuando recipe ya llega null).
  const snap = useRef(recipe);
  if (visible) snap.current = recipe;
  const r = snap.current;

  const [name,        setName]        = useState(recipe?.name  ?? '');
  const [color,       setColor]       = useState(recipe?.color ?? DISH_COLORS[0]);
  const [meals,       setMeals]       = useState<('comida'|'cena')[]>(recipe?.meals ?? ['comida', 'cena']);
  const [ingredients, setIngredients] = useState<Ingredient[]>(recipe?.ingredients ?? []);
  const [ingName,       setIngName]       = useState('');
  const [ingAmount,     setIngAmount]     = useState('');
  const [ingCat,        setIngCat]        = useState('otros');
  const [showCatPicker, setShowCatPicker] = useState(false);
  const isEdit = !!(r?.id);

  const addIngredient = () => {
    if (!ingName.trim()) return;
    const ing: Ingredient = {
      id: 'ing' + Date.now(),
      name: ingName.trim(),
      category: ingCat,
      ...(ingAmount.trim() ? { amount: ingAmount.trim() } : {}),
    };
    setIngredients(prev => [...prev, ing]);
    setIngName('');
    setIngAmount('');
    setShowCatPicker(false);
  };
  const removeIngredient = (id: string) => setIngredients(prev => prev.filter(i => i.id !== id));

  const toggleMeal = (k: 'comida'|'cena') =>
    setMeals(m => m.includes(k) ? (m.length > 1 ? m.filter(x => x !== k) : m) : [...m, k]);

  const valid = name.trim() && meals.length > 0;

  const handleSave = () => {
    if (!valid) return;
    onSave({ ...(r ?? {}), id: r?.id ?? '', name: name.trim(), color, meals, ingredients } as Recipe);
  };

  const previewBg     = mixHex(C.paper, color, 0.28);
  const previewBorder = mixHex(C.paper, color, 0.42);

  return (
    <BottomSheet visible={visible} onClose={onClose} sheetStyle={{ maxHeight: '90%' }}>
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
            <Text style={[sh.previewName, { color: mixHex(color, C.ink, 0.55) }]}>
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
              {ing.amount ? <Text style={sh.ingAmount}>{ing.amount}</Text> : null}
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
              <TextInput
                style={sh.ingAmountInput}
                placeholder="Cant."
                placeholderTextColor={C.ink3}
                value={ingAmount}
                onChangeText={setIngAmount}
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

          <PressScale
            style={[sh.primaryBtn, !valid && { opacity: 0.4 }]}
            onPress={handleSave}
            disabled={!valid}
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel={isEdit ? 'Guardar cambios' : 'Guardar receta'}
          >
            <Text style={sh.primaryBtnText}>{isEdit ? 'Guardar cambios' : 'Guardar receta'}</Text>
          </PressScale>

          {isEdit && (
            <TouchableOpacity style={{ marginTop: 4, alignItems: 'center', paddingVertical: 14 }} onPress={() => onDelete(r!.id)}>
              <Text style={{ color: C.ink3, fontFamily: FONT, fontSize: 14 }}>Eliminar plato</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 24 }} />
      </ScrollView>
    </BottomSheet>
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
    marginTop: 14,
  },
  addRecipeBtnText: { color: C.white, fontSize: 14, fontWeight: '600', fontFamily: FONT },

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
  dishName:      { fontSize: 12, fontWeight: '600', lineHeight: 15, letterSpacing: -0.2, textAlign: 'center', fontFamily: FONT },
  eventCellName: { fontSize: 12, fontWeight: '600', lineHeight: 15, letterSpacing: -0.2, textAlign: 'center', fontFamily: FONT, color: C.ink },
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
  // BottomSheet aporta scrim + asa + KAV; aquí solo el cuerpo y su contenido.
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

  sectionDivider: { height: 1, backgroundColor: C.line, marginVertical: 20 },
  sectionTitle:   { fontSize: 16, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.3, marginBottom: 12 },
  eventRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, marginBottom: 7 },
  eventInput: { flex: 1, fontSize: 15, color: C.ink, fontFamily: FONT },
  eventBtn:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.pill, backgroundColor: C.ink },
  eventBtnText: { color: C.white, fontWeight: '600', fontSize: 13, fontFamily: FONT },

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
  ingAmount:  { fontSize: 12.5, color: C.ink3, fontFamily: FONT },
  ingAdd:     { marginTop: 10, backgroundColor: C.paperSoft, borderRadius: R.l, padding: 10, marginBottom: 4 },
  ingAddRow:  { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ingInput:   { flex: 1, borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.ink, backgroundColor: C.card, fontFamily: FONT },
  ingAmountInput: { width: 62, borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 8, paddingVertical: 11, fontSize: 14, color: C.ink, backgroundColor: C.card, fontFamily: FONT, textAlign: 'center' },
  ingCatBtn:  { width: 46, height: 46, borderRadius: R.l, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  ingAddBtn:  { width: 46, height: 46, borderRadius: R.l, alignItems: 'center', justifyContent: 'center' },
  ingCatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  ingCatGridItem: { width: '22%', alignItems: 'center', paddingVertical: 8, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, gap: 3 },
  ingCatGridLabel:{ fontSize: 9, color: C.ink3, fontFamily: FONT, textAlign: 'center' },
});
