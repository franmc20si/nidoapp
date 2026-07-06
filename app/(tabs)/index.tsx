import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useNidoStore } from '@/store/nidoStore';
import { useMenuStore } from '@/store/menuStore';
import { weekKey } from '@/lib/week';
import { supabase } from '@/lib/supabase';
import { Task, Subscription } from '@/types';
import { AlertComposer, AlertCards } from '@/components/AlertSystem';
import NidoSheet from '@/components/NidoSheet';
import StaggerItem from '@/components/StaggerItem';
import { isDueAgain, nextDueDate } from '@/lib/recurrence';
import { withTimeout, readWithRetry } from '@/lib/withTimeout';
import { recipeCheckKey, migrateRecipeCheckKeys } from '@/lib/shoppingChecks';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';
import { getServiceCat } from '@/constants/services';
import { nextPaymentDate, daysUntilNextPayment } from '@/lib/nextPayment';

// ── helpers ──────────────────────────────────────────────────────────────────
function mixHex(a: string, b: string, t: number) {
  const hex = (h: string): [number, number, number] => {
    h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const x = hex(a), y = hex(b);
  return '#' + [0, 1, 2].map(i => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0')).join('');
}

function getMondayOfWeek(ref: Date): Date {
  const m = new Date(ref); m.setDate(ref.getDate() - (ref.getDay() + 6) % 7); m.setHours(0, 0, 0, 0); return m;
}

function getGreeting(name: string) {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return `Buenos días, ${name}`;
  if (h >= 14 && h < 21) return `Buenas tardes, ${name}`;
  return `Buenas noches, ${name}`;
}

function daysLabel(days: number | null): string {
  if (days === null) return '';
  if (days < 0) return 'Vencido';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

function urgencyColor(days: number | null): string {
  if (days === null) return C.ink3;
  if (days <= 3) return '#c0392b';
  if (days <= 7) return C.cena;
  return C.ink3;
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €';

const DAYS_SHORT  = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS      = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS_LONG   = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const weekNumber = (d: Date) => {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
};

function getWeekDays() {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { label: DAYS_SHORT[i], num: d.getDate(), isToday: d.toDateString() === today.toDateString() };
  });
}

export default function HoyScreen() {
  const { profile, household, user, setHomeReady } = useAuthStore();
  const { accent, loadAccent } = useNidoStore();
  const taskRev = useNidoStore((s) => s.taskRev);
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [manualItems, setManualItems]    = useState<{ id: string; name: string; unit: string | null }[]>([]);
  const [recipeChecked, setRecipeChecked] = useState<Set<string>>(new Set());
  const [upcomingSubs, setUpcomingSubs]  = useState<Subscription[]>([]);
  const [bellActive, setBellActive]      = useState(false);
  const [nidoSheetVisible, setNidoSheetVisible] = useState(false);
  const [refreshing, setRefreshing]      = useState(false);
  const [loading, setLoading]            = useState(true);
  const [loaded, setLoaded]              = useState(false);
  const [loadError, setLoadError]        = useState(false);

  const { weeklyPlans, recipeById, loadMenu } = useMenuStore();
  const todayPlan   = weeklyPlans[weekKey(new Date())] ?? {};
  const todayDow    = (new Date().getDay() + 6) % 7;
  const todayComida = todayPlan[`${todayDow}-comida`];
  const todayCena   = todayPlan[`${todayDow}-cena`];

  useEffect(() => { if (household?.id) loadAccent(household.id); }, [household?.id]);
  useEffect(() => { if (household?.id) loadMenu(household.id); }, [household?.id]);
  useFocusEffect(useCallback(() => { if (household?.id) loadMenu(household.id); }, [household?.id]));

  useEffect(() => {
    if (typeof document !== 'undefined') {
      let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
      meta.content = accent.hex;
    }
  }, [accent.hex]);

  const today = new Date();
  const days  = getWeekDays();
  const firstName = profile?.full_name?.split(' ')[0] ?? 'tú';

  // ── Tasks (para calcular % semanal) ──────────────────────────────────────
  const fetchTasks = async () => {
    if (!household) return;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await withTimeout(
        supabase.from('tasks').select('*')
          .eq('household_id', household.id).order('created_at', { ascending: false })
      );
      if (error) throw error;
      const ts: Task[] = (data ?? []) as Task[];

      const toReset = ts.filter(t => t.is_done && t.is_recurring && isDueAgain((t as any).due_date));
      if (toReset.length > 0) {
        const ids = toReset.map(t => t.id);
        await withTimeout(supabase.from('tasks').update({ is_done: false, due_date: null, completed_by: null, completed_at: null }).in('id', ids));
        toReset.forEach(t => { t.is_done = false; (t as any).due_date = null; t.completed_by = null; t.completed_at = null; });
      }

      setTasks(ts);
      setLoaded(true);
    } catch (e) {
      console.error('[index] fetchTasks error', e);
      setLoadError(true);
    } finally {
      setLoading(false);
      setHomeReady(true);
    }
  };

  // ── Falta por comprar ─────────────────────────────────────────────────────
  // La lista de la compra mezcla dos fuentes (igual que ShoppingListSheet):
  //   1. Ingredientes de las recetas del menú de la semana — su estado "comprado"
  //      vive en Supabase (tabla shopping_checks), ids "ri-...".
  //   2. Productos añadidos a mano — viven en shopping_items (Supabase).
  // Esta función carga ambas fuentes; el merge final se calcula en render.
  const fetchShopping = async () => {
    if (!household) return;
    const wk = weekKey(new Date());

    // 1. Estado "comprado" de los ingredientes de receta (Supabase, sincronizado)
    //    Si la lectura falla NO sobreescribimos con un Set vacío: eso pintaría
    //    todos los ingredientes como "sin comprar" por un fallo transitorio. Se
    //    conserva el estado previo y se recupera en la próxima carga con éxito.
    const { data: checksData, error: checksErr } = await readWithRetry(() =>
      supabase.from('shopping_checks')
        .select('item_key')
        .eq('household_id', household.id)
        .eq('week_key', wk)
    );
    if (!checksErr) {
      let set = new Set<string>((checksData ?? []).map((r: any) => r.item_key));
      // Migración de formato de clave (nombres → ids estables) de esta semana.
      const plan = weeklyPlans[wk] ?? {};
      const pairs: { oldKey: string; newKey: string }[] = [];
      Object.values(plan).forEach(rid => {
        const recipe = recipeById(rid);
        recipe?.ingredients?.forEach(ing => {
          pairs.push({
            oldKey: `ri-${recipe.name}-${ing.name}`,
            newKey: recipeCheckKey(recipe.id, ing.id),
          });
        });
      });
      set = await migrateRecipeCheckKeys(household.id, wk, pairs, set);
      setRecipeChecked(set);
    }

    // 2. Productos manuales sin comprar (Supabase)
    const { data: list, error: listErr } = await readWithRetry(() =>
      supabase.from('shopping_lists')
        .select('id')
        .eq('household_id', household.id)
        .eq('week_key', wk)
        .maybeSingle()
    );
    if (listErr) return;                       // fallo transitorio: conservar lista previa
    if (!list?.id) { setManualItems([]); return; } // sin lista esta semana: vacío real
    const { data: items, error: itemsErr } = await readWithRetry(() =>
      supabase.from('shopping_items')
        .select('id, name, unit, is_checked')
        .eq('list_id', list.id)
        .eq('is_checked', false)
    );
    if (itemsErr) return;                       // fallo transitorio: conservar lista previa
    setManualItems((items ?? []).map((i: any) => ({ id: i.id, name: i.name, unit: i.unit ?? null })));
  };

  // ── Próximos pagos ────────────────────────────────────────────────────────
  // Traemos todos los servicios con fecha y calculamos su PRÓXIMA ocurrencia en
  // cliente (avanzando por el ciclo). Así los recurrentes ya pasados no
  // desaparecen: se muestran con su siguiente vencimiento. Ordenamos por esa
  // fecha efectiva y cogemos los 2 más próximos.
  const fetchUpcomingSubs = async () => {
    if (!household) return;
    try {
      const { data } = await withTimeout(
        supabase.from('subscriptions')
          .select('*')
          .eq('household_id', household.id)
          .not('next_payment', 'is', null)
      );
      const subs = ((data ?? []) as Subscription[])
        .map(s => ({ s, next: nextPaymentDate(s.next_payment, s.cycle) }))
        .filter(x => x.next !== null)
        .sort((a, b) => a.next!.getTime() - b.next!.getTime())
        .slice(0, 2)
        .map(x => x.s);
      setUpcomingSubs(subs);
    } catch {
      setUpcomingSubs([]);
    }
  };

  useEffect(() => { fetchTasks(); }, [household, taskRev]);
  useFocusEffect(useCallback(() => {
    fetchTasks();
    fetchShopping();
    fetchUpcomingSubs();
  }, [household]));

  // ── Weekly % ──────────────────────────────────────────────────────────────
  const monday    = getMondayOfWeek(new Date());
  const sunday    = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
  const weekTasks = tasks.filter(t => {
    const due = (t as any).due_date;
    if (!due) return true;
    const d = new Date(due);
    return d >= monday && d <= sunday;
  });
  const doneCount = weekTasks.filter(t => t.is_done).length;
  const total     = weekTasks.length;
  const pct       = total ? Math.round((doneCount / total) * 100) : 0;
  const pendingCount = tasks.filter(t => !t.is_done).length;

  // ── Falta por comprar: merge ingredientes de receta (sin marcar) + manuales ──
  const weekPlan = weeklyPlans[weekKey(new Date())] ?? {};
  const pendingItems: { id: string; name: string; unit: string | null }[] = (() => {
    const out: { id: string; name: string; unit: string | null }[] = [];
    const seen = new Set<string>();
    Object.values(weekPlan).forEach(rid => {
      const recipe = recipeById(rid);
      if (!recipe?.ingredients?.length) return;
      recipe.ingredients.forEach(ing => {
        const key = `${ing.name.toLowerCase()}|${ing.category}`;
        if (seen.has(key)) return;
        seen.add(key);
        const id = recipeCheckKey(recipe.id, ing.id);
        if (recipeChecked.has(id)) return; // ya comprado
        out.push({ id, name: ing.name, unit: ing.amount ?? null });
      });
    });
    manualItems.forEach(m => out.push(m));
    return out;
  })();

  // Marcar un producto como comprado desde la card → desaparece aquí y queda
  // tachado en la lista de la compra (misma fuente). Optimista + escritura en
  // Supabase, según la fuente del item (receta = shopping_checks, manual = shopping_items).
  const markBought = (item: { id: string; name: string; unit: string | null }) => {
    if (!household) return;
    const wk = weekKey(new Date());
    if (item.id.startsWith('ri-')) {
      setRecipeChecked(prev => new Set(prev).add(item.id));
      supabase.from('shopping_checks').upsert(
        { household_id: household.id, week_key: wk, item_key: item.id },
        { onConflict: 'household_id,week_key,item_key' }
      ).then(() => {});
    } else {
      setManualItems(prev => prev.filter(m => m.id !== item.id));
      supabase.from('shopping_items').update({ is_checked: true }).eq('id', item.id).then(() => {});
    }
  };

  if (!loaded && loading) {
    return (
      <SafeAreaView style={[n.root, { backgroundColor: accent.hex }]}>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: C.paper }}>
          <ScreenLoader color={accent.hex} />
        </View>
      </SafeAreaView>
    );
  }
  if (!loaded && loadError) {
    return (
      <SafeAreaView style={[n.root, { backgroundColor: accent.hex }]}>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: C.paper }}>
          <ScreenError onRetry={fetchTasks} color={accent.hex} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[n.root, { backgroundColor: accent.hex }]}>
      <StatusBar style="light" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        style={{ backgroundColor: C.paper }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([fetchTasks(), fetchShopping(), fetchUpcomingSubs()]);
              setRefreshing(false);
            }}
            tintColor={accent.hex}
            colors={[accent.hex]}
          />
        }
      >
        {/* Top bar */}
        <View style={n.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={n.greetName}>{getGreeting(firstName)}</Text>
            <Text style={n.greetSub}>
              {pendingCount > 0
                ? `Hoy el nido necesita ${pendingCount} ${pendingCount === 1 ? 'cosa' : 'cosas'}`
                : '¡Nido completado!'}
            </Text>
          </View>
          <TouchableOpacity
            style={[n.avatar, { backgroundColor: accent.hex }]}
            onPress={() => router.push('/(tabs)/household')}
            activeOpacity={0.8}
          >
            <Text style={n.avatarText}>{(profile?.full_name?.[0] ?? 'T').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* Nido chip + bell */}
        <View style={n.chipRow}>
          <TouchableOpacity
            style={[n.nidoChip, { borderColor: accent.hex + '40' }]}
            onPress={() => setNidoSheetVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={n.nidoChipNest}>🪺</Text>
            <Text style={n.nidoChipName}>{household?.name ?? 'Nuestro nido'}</Text>
            <View style={[n.accentDot, { backgroundColor: accent.hex }]} />
            <Text style={n.nidoChipCaret}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[n.bellBtn, bellActive && { backgroundColor: accent.hex, borderColor: accent.hex }]}
            activeOpacity={0.7}
            onPress={() => setBellActive(v => !v)}
          >
            <Text style={n.bellIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        <NidoSheet visible={nidoSheetVisible} onClose={() => setNidoSheetVisible(false)} />

        {/* Date hero */}
        <View style={n.dateHero}>
          <View style={n.dateLeft}>
            <Text style={n.dateBig}>{today.getDate()}</Text>
            <Text style={n.dateMon}>{MONTHS[today.getMonth()]}</Text>
          </View>
          <View style={n.dateRight}>
            <Text style={n.dateDay}>{DAYS_LONG[today.getDay()]}</Text>
            <Text style={n.dateSub}>Semana {weekNumber(today)}</Text>
          </View>
        </View>

        {bellActive && <AlertComposer onClose={() => setBellActive(false)} />}
        <AlertCards />

        {/* Week strip */}
        <View style={n.weekStrip}>
          {days.map((d, i) => (
            <View key={i} style={n.weekDayWrap}>
              <Text style={[n.weekLabel, d.isToday && n.weekLabelOn]}>{d.label}</Text>
              <View style={[n.weekNum, d.isToday && { backgroundColor: accent.hex, borderColor: accent.hex }]}>
                <Text style={[n.weekNumText, d.isToday && n.weekNumTextOn]}>{d.num}</Text>
              </View>
              <View style={[n.weekDot, { backgroundColor: accent.hex, opacity: d.isToday ? 1 : 0 }]} />
            </View>
          ))}
        </View>

        {/* Menú de hoy */}
        {(todayComida || todayCena) && (() => {
          const comida = recipeById(todayComida);
          const cena   = recipeById(todayCena);
          return (
            <StaggerItem index={0}>
            <View style={n.menuCard}>
              <Text style={n.menuLabel}>MENÚ DE HOY</Text>
              <View style={n.menuCols}>
                <View style={[n.menuCol, comida && { backgroundColor: mixHex(C.paper, comida.color, 0.22), borderColor: mixHex(C.paper, comida.color, 0.4) }]}>
                  <Text style={n.menuSlot}>Comida</Text>
                  <Text style={[n.menuDish, comida && { color: mixHex(comida.color, '#241E18', 0.55) }]} numberOfLines={2}>
                    {comida ? comida.name : '—'}
                  </Text>
                </View>
                <View style={[n.menuCol, cena && { backgroundColor: mixHex(C.paper, cena.color, 0.22), borderColor: mixHex(C.paper, cena.color, 0.4) }]}>
                  <Text style={n.menuSlot}>Cena</Text>
                  <Text style={[n.menuDish, cena && { color: mixHex(cena.color, '#241E18', 0.55) }]} numberOfLines={2}>
                    {cena ? cena.name : '—'}
                  </Text>
                </View>
              </View>
            </View>
            </StaggerItem>
          );
        })()}

        {/* Tu nido esta semana */}
        <StaggerItem index={1}>
        <View style={[n.nestHero, { backgroundColor: accent.wash, borderColor: accent.hex + '28' }]}>
          <View style={n.nestHeroRow}>
            <Text style={n.nestLabel}>TU NIDO ESTA SEMANA</Text>
            <Text style={n.nestCap}>
              {doneCount} de {total} {total === 1 ? 'tarea hecha' : 'tareas hechas'}
            </Text>
          </View>
          <View style={n.nestPctRow}>
            <Text style={n.nestPct}>{pct}<Text style={n.nestPctSm}>%</Text></Text>
          </View>
          <View style={n.nestBar}>
            <View style={[n.nestBarFill, { width: `${pct}%` as any, backgroundColor: accent.hex }]} />
          </View>
        </View>
        </StaggerItem>

        {/* Falta por comprar */}
        <StaggerItem index={2}>
        <View style={n.sectionGap}>
          <View style={n.compraCard}>
            <View style={n.cardHeaderRow}>
              <Text style={[n.cardLabel, { color: C.compra }]}>FALTA POR COMPRAR</Text>
              {pendingItems.length > 0 && (
                <View style={[n.badge, { backgroundColor: C.compra }]}>
                  <Text style={n.badgeText}>{pendingItems.length}</Text>
                </View>
              )}
            </View>
            {pendingItems.length === 0 ? (
              <Text style={n.cardEmpty}>✓  Lista completa esta semana</Text>
            ) : (
              <ScrollView
                style={n.itemScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {pendingItems.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={n.itemRow}
                    onPress={() => markBought(item)}
                    activeOpacity={0.6}
                  >
                    <View style={[n.itemCheck, { borderColor: C.compra }]} />
                    <Text style={n.itemName} numberOfLines={1}>
                      {item.name}
                      {item.unit ? <Text style={n.itemUnit}>  {item.unit}</Text> : null}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
        </StaggerItem>

        {/* Próximos pagos */}
        <StaggerItem index={3}>
        <View style={n.sectionGap}>
          <View style={n.pagosCard}>
            <Text style={[n.cardLabel, { color: C.suelo }]}>PRÓXIMOS PAGOS</Text>
            {upcomingSubs.length === 0 ? (
              <Text style={n.cardEmpty}>Sin pagos próximos</Text>
            ) : (
              upcomingSubs.map(sub => {
                const cat  = getServiceCat(sub.category);
                const days = daysUntilNextPayment(sub.next_payment, sub.cycle);
                const col  = urgencyColor(days);
                return (
                  <View key={sub.id} style={n.subRow}>
                    <View style={[n.subIcon, { backgroundColor: cat.tint }]}>
                      <Text style={n.subEmoji}>{cat.emoji}</Text>
                    </View>
                    <View style={n.subInfo}>
                      <Text style={n.subName}>{sub.name}</Text>
                      <Text style={n.subAmount}>{fmt(sub.amount)}</Text>
                    </View>
                    <Text style={[n.subDays, { color: col }]}>{daysLabel(days)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
        </StaggerItem>

      </ScrollView>
    </SafeAreaView>
  );
}

const n = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 12 },
  greetName: { fontSize: 27, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.6 },
  greetSub: { fontSize: 13, color: C.ink3, fontFamily: FONT, marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.white, fontSize: 16, fontWeight: '600', fontFamily: FONT },

  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, marginBottom: 4 },
  nidoChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.card },
  nidoChipNest: { fontSize: 16 },
  nidoChipName: { fontSize: 13, fontWeight: '500', color: C.ink, fontFamily: FONT },
  accentDot: { width: 8, height: 8, borderRadius: 4 },
  nidoChipCaret: { fontSize: 14, color: C.ink3, marginLeft: -2 },
  bellBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 16 },

  dateHero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 22, paddingTop: 14, paddingBottom: 14 },
  dateLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  dateBig: { fontSize: 44, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -1.3, lineHeight: 48 },
  dateMon: { fontSize: 24, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.3 },
  dateRight: { alignItems: 'flex-end' },
  dateDay: { fontSize: 22, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.3 },
  dateSub: { fontSize: 12, color: C.ink3, fontFamily: FONT, marginTop: 2 },

  weekStrip: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16 },
  weekDayWrap: { flex: 1, alignItems: 'center', gap: 6 },
  weekLabel: { fontSize: 12, color: C.ink3, fontFamily: FONT, fontWeight: '500' },
  weekLabelOn: { color: C.ink, fontWeight: '600' },
  weekNum: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  weekNumText: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: FONT },
  weekNumTextOn: { color: C.white },
  weekDot: { width: 5, height: 5, borderRadius: 3 },

  menuCard: { marginHorizontal: 20, marginBottom: 14 },
  menuLabel: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 8 },
  menuCols: { flexDirection: 'row', gap: 10 },
  menuCol: { flex: 1, borderRadius: R.l, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, padding: 12 },
  menuSlot: { fontSize: 11, color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  menuDish: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.2 },

  nestHero: { marginHorizontal: 20, borderRadius: R.l, borderWidth: 1, padding: 16 },
  nestHeroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  nestLabel: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: C.ink2, fontFamily: FONT, fontWeight: '600' },
  nestCap: { fontSize: 12, color: C.ink2, fontFamily: FONT },
  nestPctRow: { marginBottom: 10 },
  nestPct: { fontSize: 34, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -1.5, lineHeight: 38 },
  nestPctSm: { fontSize: 14, color: C.ink2, fontWeight: '500' },
  nestBar: { height: 7, borderRadius: 999, backgroundColor: C.ink + '12', overflow: 'hidden' },
  nestBarFill: { height: '100%', borderRadius: 999 },

  sectionGap: { marginTop: 12, paddingHorizontal: 20 },

  // Falta por comprar
  compraCard: {
    borderRadius: R.l, borderWidth: 1,
    borderColor: C.compra + '40',
    backgroundColor: C.compraTint,
    padding: 16,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardLabel: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: FONT, fontWeight: '600' },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: C.white, fontSize: 12, fontWeight: '600', fontFamily: FONT },
  cardEmpty: { fontSize: 13, color: C.ink2, fontFamily: FONT, paddingVertical: 2 },
  itemScroll: { maxHeight: 88 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7 },
  itemCheck: { width: 19, height: 19, borderRadius: 10, borderWidth: 2, backgroundColor: 'transparent', flexShrink: 0 },
  itemName: { flex: 1, fontSize: 14, color: C.ink, fontFamily: FONT, fontWeight: '500' },
  itemUnit: { fontSize: 12, color: C.ink2, fontWeight: '400' },

  // Próximos pagos
  pagosCard: {
    borderRadius: R.l, borderWidth: 1,
    borderColor: C.suelo + '40',
    backgroundColor: C.sueloTint,
    padding: 16,
  },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  subIcon: { width: 34, height: 34, borderRadius: R.m, alignItems: 'center', justifyContent: 'center' },
  subEmoji: { fontSize: 17 },
  subInfo: { flex: 1 },
  subName: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: FONT },
  subAmount: { fontSize: 12, color: C.ink2, fontFamily: FONT, marginTop: 1 },
  subDays: { fontSize: 12, fontWeight: '600', fontFamily: FONT },
});
