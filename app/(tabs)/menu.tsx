import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Animated, PanResponder, PanResponderGestureState, Platform, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { useMenuStore, Recipe, DISH_COLORS } from '@/store/menuStore';
import { getMondayOfWeek, addDays, isoWeekNum, weekKey } from '@/lib/week';
import ShoppingListSheet, { GROCERY_CATS, Ingredient } from '@/components/ShoppingListSheet';
import BasicsSheet from '@/components/BasicsSheet';
import { GroceryIcon } from '@/components/icons';
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

// ─── arrastrar y soltar platos ─────────────────────────────────────────────
type Meal = 'comida' | 'cena';
const mealOf = (slot: string) => slot.split('-')[1] as Meal;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const cloneHint = Platform.select({ web: { willChange: 'transform' }, default: {} }) as any;
// Ratón (puntero fino): se arrastra directamente al moverse. Táctil: hay que
// mantener pulsado primero, para no robarle el gesto al scroll vertical.
const FINE_POINTER = Platform.OS === 'web' && typeof window !== 'undefined'
  && !!window.matchMedia?.('(pointer: fine)').matches;
const LONG_PRESS_MS = 280;

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
  // Etiqueta de mes para el eyebrow: un mes, o "MES1 - MES2" si la semana los cruza.
  const monthLabel    = first.getMonth() === last.getMonth()
    ? MN_MONTHS[first.getMonth()]
    : `${MN_MONTHS[first.getMonth()]} - ${MN_MONTHS[last.getMonth()]}`;

  const { accent } = useNidoStore();
  const { household } = useAuthStore();

  // Estado compartido (mismo store que la tab Semana → nunca divergen)
  const {
    recipes, weeklyPlans, recipeById,
    loadMenu, assignPlan, swapPlan,
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
  const [showBasics, setShowBasics] = useState(false);
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

  // ── arrastrar y soltar: intercambia dos huecos de la semana ────────────────
  // Un plato solo cae donde cabe (sus `meals`) y el desplazado debe caber en el
  // hueco de origen. Los eventos y los huecos vacíos caben en cualquier sitio.
  const canPlace = (value: string | undefined, meal: Meal) => {
    if (!value || value.startsWith('event:')) return true;
    const r = recipeById(value);
    return !r || r.meals.includes(meal);
  };
  const canSwap = (from: string, to: string) =>
    from !== to && canPlace(plan[from], mealOf(to)) && canPlace(plan[to], mealOf(from));

  const [drag,      setDrag]      = useState<{ from: string; value: string; w: number; h: number } | null>(null);
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const [armedSlot, setArmedSlot] = useState<string | null>(null);
  const dragPos      = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cloneScale   = useRef(new Animated.Value(1)).current;
  const cloneOpacity = useRef(new Animated.Value(1)).current;
  const rootRef      = useRef<View>(null);
  const cellRefs     = useRef<Map<string, View>>(new Map());
  const zonesRef     = useRef<Array<{ key: string; x: number; y: number; w: number; h: number }>>([]);
  const originRef    = useRef({ x: 0, y: 0 });   // posición en ventana del root (clon absoluto dentro)
  const grabRef      = useRef({ x: 0, y: 0 });   // punto de agarre dentro de la celda
  const dragRef      = useRef<{ from: string; value: string } | null>(null);
  const armedRef     = useRef<string | null>(null);
  const hoverRef     = useRef<string | null>(null);
  const settlingRef  = useRef(false);
  const justDraggedRef = useRef(false);

  const registerCell = (key: string) => (ref: View | null) => {
    if (ref) cellRefs.current.set(key, ref); else cellRefs.current.delete(key);
  };

  // Con el scroll bloqueado durante el arrastre, una medición al empezar vale.
  const measureAll = () => {
    const zones: typeof zonesRef.current = [];
    cellRefs.current.forEach((ref, key) => {
      ref.measureInWindow((x, y, w, h) => { zones.push({ key, x, y, w, h }); });
    });
    zonesRef.current = zones;
    rootRef.current?.measureInWindow((x, y) => { originRef.current = { x, y }; });
  };
  // measureInWindow (web) da coords de viewport y el PanResponder de página.
  const scrollOff = () => (Platform.OS === 'web' && typeof window !== 'undefined')
    ? { x: window.scrollX || 0, y: window.scrollY || 0 } : { x: 0, y: 0 };
  const hitTest = (px: number, py: number) => {
    for (const z of zonesRef.current) {
      if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) return z.key;
    }
    return null;
  };

  // Web: sin selección de texto durante el arrastre y, en táctil, que el dedo
  // no haga scroll de la página una vez "levantado" el plato.
  const blockTouchMove = useRef((e: Event) => { if (e.cancelable) e.preventDefault(); }).current;
  const setDragActiveWeb = (on: boolean) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const b = document.body.style as any;
    b.userSelect = on ? 'none' : '';
    b.webkitUserSelect = on ? 'none' : '';
    b.cursor = on && FINE_POINTER ? 'grabbing' : '';
    if (on) document.addEventListener('touchmove', blockTouchMove, { passive: false });
    else document.removeEventListener('touchmove', blockTouchMove);
  };
  useEffect(() => () => setDragActiveWeb(false), []);

  const clearDrag = () => {
    settlingRef.current = false;
    dragRef.current = null; hoverRef.current = null; armedRef.current = null;
    setDrag(null); setHoverSlot(null); setArmedSlot(null);
    cloneScale.setValue(1); cloneOpacity.setValue(1);
    setDragActiveWeb(false);
  };

  const clonePosFor = (px: number, py: number) => {
    const o = scrollOff();
    return { x: px - o.x - originRef.current.x - grabRef.current.x, y: py - o.y - originRef.current.y - grabRef.current.y };
  };

  const dragApi: CellDragApi = {
    canStart: (slot) => !settlingRef.current && !!plan[slot]
      && (armedRef.current === slot || FINE_POINTER),
    arm: (slot) => {
      if (settlingRef.current || !plan[slot]) return;
      armedRef.current = slot; setArmedSlot(slot);
      measureAll();
      setDragActiveWeb(true);
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') (navigator as any).vibrate?.(8);
    },
    disarm: (slot) => {
      if (armedRef.current !== slot || dragRef.current) return;
      armedRef.current = null; setArmedSlot(null);
      setDragActiveWeb(false);
    },
    onStart: (slot, g) => {
      const value = plan[slot];
      if (!value) return;
      if (!armedRef.current) { measureAll(); setDragActiveWeb(true); }
      justDraggedRef.current = true;
      // measureInWindow es síncrono en web; en nativo llega en el siguiente
      // tick, así que el tamaño de la celda cae a unos valores razonables.
      const z = zonesRef.current.find(zz => zz.key === slot);
      const o = scrollOff();
      grabRef.current = z ? { x: g.x0 - o.x - z.x, y: g.y0 - o.y - z.y } : { x: 40, y: 32 };
      dragRef.current = { from: slot, value };
      setDrag({ from: slot, value, w: z?.w ?? 140, h: z?.h ?? 64 });
      dragPos.setValue(clonePosFor(g.moveX || g.x0, g.moveY || g.y0));
      cloneOpacity.setValue(1);
      cloneScale.setValue(1);
      Animated.spring(cloneScale, { toValue: 1.05, useNativeDriver: false, speed: 20, bounciness: 6 }).start();
    },
    onMove: (g) => {
      dragPos.setValue(clonePosFor(g.moveX, g.moveY));
      const o = scrollOff();
      const k = hitTest(g.moveX - o.x, g.moveY - o.y);
      if (k !== hoverRef.current) { hoverRef.current = k; setHoverSlot(k); }
    },
    onEnd: (g) => {
      const d = dragRef.current;
      setTimeout(() => { justDraggedRef.current = false; }, 350);
      if (!d) { clearDrag(); return; }
      const o = scrollOff();
      const k = hitTest(g.moveX - o.x, g.moveY - o.y);
      hoverRef.current = null; setHoverSlot(null);
      const ok = !!k && canSwap(d.from, k);
      // Destino válido: el clon aterriza en la celda nueva. Si no, vuelve a su
      // sitio (el "rebote" comunica que ahí no cabe).
      const landKey = ok ? k! : d.from;
      const z = zonesRef.current.find(zz => zz.key === landKey);
      const target = z
        ? { x: z.x - originRef.current.x, y: z.y - originRef.current.y }
        : clonePosFor(g.moveX, g.moveY);
      settlingRef.current = true;
      Animated.parallel([
        Animated.spring(dragPos, { toValue: target, useNativeDriver: false, speed: 22, bounciness: 3 }),
        Animated.timing(cloneScale, { toValue: 1, duration: 180, easing: EASE_OUT, useNativeDriver: false }),
      ]).start(() => {
        if (ok && household?.id) {
          const hid = household.id, wk = wKey, from = d.from, to = k!;
          swapPlan(hid, wk, from, to);
          showToast('Plato movido', 'info', { label: 'Deshacer', onPress: () => swapPlan(hid, wk, from, to) });
        }
        clearDrag();
      });
    },
  };

  // Vista previa del intercambio mientras se sobrevuela un destino válido.
  const previewSwap = drag && hoverSlot && canSwap(drag.from, hoverSlot) ? hoverSlot : null;
  const shownValue = (slot: string) => {
    if (drag && previewSwap) {
      if (slot === drag.from)   return plan[previewSwap];
      if (slot === previewSwap) return plan[drag.from];
    }
    return plan[slot];
  };
  const cellState = (slot: string): CellState => {
    if (!drag) return armedSlot === slot ? 'armed' : 'idle';
    if (slot === previewSwap) return 'target';
    if (slot === drag.from) return previewSwap ? 'swapped' : 'source';
    return canSwap(drag.from, slot) ? 'idle' : 'blocked';
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
      {/* Marcador del origen de coordenadas del clon (mismo contenedor absoluto) */}
      <View ref={rootRef} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {/* ─── header ─────────────────────────────────────────────────────── */}
      <View style={s.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>{monthLabel} / Semana {week}</Text>

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

      <ScrollView
        alwaysBounceVertical={false}
        scrollEnabled={!drag && !armedSlot}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 32 }}
      >
        {/* ─── grid ─────────────────────────────────────────────────────── */}
        <View>
          <View style={s.headerRow}>
            <View style={s.corner} />
            <Text style={s.colHeader}>Comida</Text>
            <Text style={s.colHeader}>Cena</Text>
          </View>

          {days.map((d, i) => {
            const isToday = isThisWeek && i === todayDow;
            return (
              <View key={i} style={s.dayRow}>
                {/* day label */}
                <View style={[s.dayLabel, isToday && { backgroundColor: C.brand }]}>
                  <Text style={[s.dayShort, isToday && { color: C.white }]}>{MN_DAYS_SHORT[i]}</Text>
                  <Text style={[s.dayNum,   isToday && { color: C.white }]}>{d.getDate()}</Text>
                </View>

                {(['comida', 'cena'] as const).map(meal => {
                  const slot = `${i}-${meal}`;
                  return (
                    <MealCell
                      key={meal}
                      slot={slot}
                      value={shownValue(slot)}
                      recipe={recipeById(shownValue(slot))}
                      state={cellState(slot)}
                      label={`${MN_DAYS_LONG[i]}, ${meal}`}
                      cellRef={registerCell(slot)}
                      drag={dragApi}
                      onPress={() => {
                        if (justDraggedRef.current) return;
                        setPick({ day: i, meal });
                      }}
                    />
                  );
                })}
              </View>
            );
          })}
        </View>

        {/* bottom buttons */}
        <View style={s.bottomBtns}>
          <PressScale style={s.seeDishesBtn} onPress={() => setShowDishes(true)} scaleTo={0.97} accessibilityRole="button" accessibilityLabel="Ver todos los platos">
            <Text style={s.seeDishesText}>Ver platos</Text>
          </PressScale>
          <PressScale style={s.seeDishesBtn} onPress={() => setShowBasics(true)} scaleTo={0.97} accessibilityRole="button" accessibilityLabel="Gestionar básicos semanales">
            <Text style={s.seeDishesText}>Básicos semanales</Text>
          </PressScale>
          <PressScale style={[s.shopBtn, { borderColor: accent.hex + '70', backgroundColor: accent.wash, flexDirection: 'row', gap: 8 }]} onPress={() => setShowShop(true)} scaleTo={0.98} accessibilityRole="button" accessibilityLabel="Abrir la lista de la compra">
            <GroceryIcon catKey="otros" size={16} color={accent.hex} />
            <Text style={[s.shopBtnText, { color: accent.hex }]}>
              Lista de la compra · Semana {week}
              {weekIngredients.length > 0 ? ` (${weekIngredients.length} ingredientes)` : ''}
            </Text>
          </PressScale>
        </View>
      </ScrollView>

      {/* Clon flotante del plato mientras se arrastra */}
      {drag && (() => {
        const r = recipeById(drag.value);
        const ev = !r && drag.value.startsWith('event:') ? drag.value.slice(6) : null;
        return (
          <Animated.View
            pointerEvents="none"
            style={[s.cell, s.dragClone, cloneHint, cellColors(r, ev), {
              width: drag.w, height: drag.h,
              opacity: cloneOpacity,
              transform: [...dragPos.getTranslateTransform(), { scale: cloneScale }],
            }]}
          >
            <CellContent recipe={r} event={ev} />
          </Animated.View>
        );
      })()}

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

      <BasicsSheet
        visible={showBasics}
        onClose={() => setShowBasics(false)}
        accent={accent}
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

// ─── MealCell ───────────────────────────────────────────────────────────────
type CellState = 'idle' | 'armed' | 'source' | 'swapped' | 'target' | 'blocked';
interface CellDragApi {
  canStart: (slot: string) => boolean;
  arm:      (slot: string) => void;
  disarm:   (slot: string) => void;
  onStart:  (slot: string, g: PanResponderGestureState) => void;
  onMove:   (g: PanResponderGestureState) => void;
  onEnd:    (g: PanResponderGestureState) => void;
}

function cellColors(recipe?: Recipe, event?: string | null) {
  if (recipe) return { backgroundColor: mixHex(C.paper, recipe.color, 0.28), borderColor: mixHex(C.paper, recipe.color, 0.42), borderStyle: 'solid' as const };
  if (event)  return { backgroundColor: C.white, borderColor: C.line, borderStyle: 'solid' as const };
  return { borderStyle: 'dashed' as const };
}

function CellContent({ recipe, event }: { recipe?: Recipe; event?: string | null }) {
  if (recipe) return <Text style={[s.dishName, { color: mixHex(recipe.color, C.ink, 0.55) }]}>{recipe.name}</Text>;
  if (event)  return <Text style={s.eventCellName}>{event}</Text>;
  return <Text style={s.cellPlus}>+</Text>;
}

function MealCell({ slot, value, recipe, state, label, cellRef, drag, onPress }: {
  slot: string; value?: string; recipe?: Recipe; state: CellState; label: string;
  cellRef: (ref: View | null) => void; drag: CellDragApi; onPress: () => void;
}) {
  // PanResponder creado una sola vez; lee slot/drag "vivos" vía ref.
  const latest = useRef({ slot, drag });
  latest.current = { slot, drag };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) =>
      latest.current.drag.canStart(latest.current.slot) && Math.hypot(g.dx, g.dy) > 6,
    onPanResponderGrant: (_e, g) => latest.current.drag.onStart(latest.current.slot, g),
    onPanResponderMove:  (_e, g) => latest.current.drag.onMove(g),
    onPanResponderRelease:   (_e, g) => latest.current.drag.onEnd(g),
    onPanResponderTerminate: (_e, g) => latest.current.drag.onEnd(g),
    onPanResponderTerminationRequest: () => false,
  })).current;

  const event = !recipe && value?.startsWith('event:') ? value.slice(6) : null;
  const filled = !!(recipe || event);

  const stateStyle =
    state === 'source'  ? s.cellSource :
    state === 'swapped' ? s.cellPreview :
    state === 'target'  ? s.cellTarget :
    state === 'blocked' ? s.cellBlocked :
    state === 'armed'   ? s.cellArmed : null;

  return (
    <View ref={cellRef} style={s.cellWrap} {...pan.panHandlers}>
      <PressScale
        style={[s.cell, filled && s.cellDraggable, state !== 'source' && cellColors(recipe, event), stateStyle]}
        onPress={onPress}
        onLongPress={() => drag.arm(slot)}
        onPressOut={() => drag.disarm(slot)}
        delayLongPress={LONG_PRESS_MS}
        scaleTo={0.96}
        accessibilityRole="button"
        accessibilityLabel={`${label}${recipe ? ': ' + recipe.name : event ? ': ' + event : ', añadir'}`}
        accessibilityHint={filled ? 'Mantén pulsado y arrastra para cambiarlo de día' : undefined}
      >
        {state === 'source' ? null : <CellContent recipe={recipe} event={event} />}
      </PressScale>
    </View>
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
              <View style={sh.ingEmoji}><GroceryIcon catKey={ing.category} size={18} color={C.ink2} /></View>
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
                <GroceryIcon catKey={ingCat} size={20} color={C.ink2} />
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
                    <GroceryIcon catKey={c.key} size={20} color={C.ink2} />
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

  // arrastrar y soltar
  cellWrap: { flex: 1 },
  cellDraggable: Platform.select({
    web: { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', cursor: FINE_POINTER ? 'grab' : 'pointer' },
    default: {},
  }) as any,
  cellArmed:   { borderColor: C.ink2, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  cellSource:  { borderStyle: 'dashed', borderColor: C.ink3, backgroundColor: 'transparent' },
  cellPreview: { opacity: 0.7 },
  cellTarget:  { borderColor: C.ink2, borderStyle: 'dashed' },
  cellBlocked: { opacity: 0.35 },
  dragClone: {
    position: 'absolute', top: 0, left: 0, flex: 0,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
    elevation: 10, zIndex: 100,
  },

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
  ingEmoji:   { width: 26, alignItems: 'center' },
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
