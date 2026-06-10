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
import { Task } from '@/types';
import TaskCard from '@/components/TaskCard';
import { AlertComposer, AlertCards } from '@/components/AlertSystem';
import NidoSheet from '@/components/NidoSheet';
import TaskEditSheet from '@/components/TaskEditSheet';
import { nextDueDate, isDueAgain } from '@/lib/recurrence';

// ── menu helpers ─────────────────────────────────────────────────────────────
function mixHex(a: string, b: string, t: number) {
  const hex = (h: string): [number,number,number] => {
    h = h.replace('#',''); if (h.length===3) h=h.split('').map(c=>c+c).join('');
    const n=parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255];
  };
  const x=hex(a), y=hex(b);
  return '#'+[0,1,2].map(i=>Math.round(x[i]+(y[i]-x[i])*t).toString(16).padStart(2,'0')).join('');
}

function getMondayOfWeek(ref: Date): Date {
  const m = new Date(ref); m.setDate(ref.getDate()-(ref.getDay()+6)%7); m.setHours(0,0,0,0); return m;
}

function getGreeting(name: string) {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return `Buenos días, ${name}`;
  if (h >= 14 && h < 21) return `Buenas tardes, ${name}`;
  return `Buenas noches, ${name}`;
}

const DAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const weekNumber = (d: Date) => {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
};

function getWeekDays() {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // Mon=0
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'pendiente' | 'hecho'>('pendiente');
  const [bellActive, setBellActive] = useState(false);
  const [nidoSheetVisible, setNidoSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Menú: estado compartido con la tab Menú (mismo store → nunca divergen)
  const { weeklyPlans, recipeById, loadMenu } = useMenuStore();
  const todayPlan = weeklyPlans[weekKey(new Date())] ?? {};
  const todayDow  = (new Date().getDay() + 6) % 7;
  const todayComida = todayPlan[`${todayDow}-comida`];
  const todayCena   = todayPlan[`${todayDow}-cena`];

  // Load saved accent when household is known
  useEffect(() => { if (household?.id) loadAccent(household.id); }, [household?.id]);

  // Carga del menú a través del store compartido
  useEffect(() => { if (household?.id) loadMenu(household.id); }, [household?.id]);
  useFocusEffect(useCallback(() => { if (household?.id) loadMenu(household.id); }, [household?.id]));

  // Set browser theme-color meta tag on web
  useEffect(() => {
    if (typeof document !== 'undefined') {
      let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      meta.content = accent.hex;
    }
  }, [accent.hex]);

  const today = new Date();
  const days = getWeekDays();
  const firstName = profile?.full_name?.split(' ')[0] ?? 'tú';

  const fetchTasks = async () => {
    if (!household) return;
    const { data } = await supabase.from('tasks').select('*')
      .eq('household_id', household.id).order('created_at', { ascending: false });
    const tasks: Task[] = (data ?? []) as Task[];

    // Reset recurring tasks whose next due date has arrived
    const toReset = tasks.filter(t =>
      t.is_done && t.is_recurring && isDueAgain((t as any).due_date)
    );
    if (toReset.length > 0) {
      const ids = toReset.map(t => t.id);
      await supabase.from('tasks').update({ is_done: false, due_date: null, completed_by: null, completed_at: null }).in('id', ids);
      toReset.forEach(t => { t.is_done = false; (t as any).due_date = null; t.completed_by = null; t.completed_at = null; });
    }

    setTasks(tasks);
    setRemoved(new Set());
    // Datos iniciales listos → permite ocultar el splash (sin parpadeo vacío)
    setHomeReady(true);
  };

  useEffect(() => { fetchTasks(); }, [household, taskRev]);
  useFocusEffect(useCallback(() => { fetchTasks(); }, [household]));

  const fetchProfiles = useCallback(async () => {
    if (!household) return;
    const { data: members } = await supabase
      .from('household_members').select('user_id').eq('household_id', household.id);
    if (!members?.length) return;
    const { data: profs } = await supabase
      .from('profiles').select('id, full_name').in('id', members.map(m => m.user_id));
    if (!profs) return;
    const map: Record<string, string> = {};
    for (const p of profs) { if (p.full_name) map[p.id] = p.full_name.split(' ')[0]; }
    setProfiles(map);
  }, [household]);

  useEffect(() => { fetchProfiles(); }, [household]);

  const toggleTask = async (task: Task) => {
    const anyTask = task as any;
    const completing = !task.is_done;
    const now = new Date().toISOString();
    if (completing && task.is_recurring && anyTask.recurrence_rule) {
      const due = nextDueDate(anyTask.recurrence_rule);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: true, completed_by: user?.id ?? null, completed_at: now } : t));
      await supabase.from('tasks').update({ is_done: true, due_date: due, completed_by: user?.id, completed_at: now }).eq('id', task.id);
    } else {
      const patch = completing
        ? { is_done: true,  completed_by: user?.id ?? null, completed_at: now }
        : { is_done: false, completed_by: null, completed_at: null };
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } : t));
      await supabase.from('tasks').update(patch).eq('id', task.id);
    }
  };

  const handleAnimatedOut = (task: Task) => {
    setRemoved((prev) => new Set(prev).add(task.id));
  };

  const visible   = tasks.filter((t) => !removed.has(t.id));
  const pending   = visible.filter((t) => !t.is_done);
  const done      = visible.filter((t) => t.is_done);
  const hoyTasks  = pending; // kept for greeting subtitle

  const shown     = tab === 'hecho' ? done : pending;

  // Weekly % — tasks due this week (Mon–Sun) or with no due date
  const monday    = getMondayOfWeek(new Date());
  const sunday    = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
  const weekTasks = visible.filter((t) => {
    const due = (t as any).due_date;
    if (!due) return true;
    const d = new Date(due);
    return d >= monday && d <= sunday;
  });
  const weekDone  = weekTasks.filter((t) => t.is_done);
  const total     = weekTasks.length;
  const doneCount = weekDone.length;
  const pct       = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <SafeAreaView style={[n.root, { backgroundColor: accent.hex }]}>
      <StatusBar style="light" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        style={{ backgroundColor: C.paper }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await fetchTasks(); setRefreshing(false); }}
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
              {hoyTasks.length > 0
                ? `Hoy el nido necesita ${hoyTasks.length} ${hoyTasks.length === 1 ? 'cosa' : 'cosas'}`
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
            onPress={() => setBellActive((v) => !v)}
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

        {/* Alert composer */}
        {bellActive && (
          <AlertComposer onClose={() => setBellActive(false)} />
        )}

        {/* Alert cards */}
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

        {/* Today's menu */}
        {(todayComida || todayCena) && (() => {
          const comida = recipeById(todayComida);
          const cena   = recipeById(todayCena);
          return (
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
          );
        })()}

        {/* Nest hero */}
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

        {/* Filter pills */}
        <View style={n.filterRow}>
          {(['pendiente', 'hecho'] as const).map((k) => (
            <TouchableOpacity key={k} style={[n.pill, tab === k && n.pillOn]} onPress={() => setTab(k)} activeOpacity={0.8}>
              <Text style={[n.pillText, tab === k && n.pillTextOn]}>
                {k === 'pendiente' ? `Por hacer${pending.length ? ` · ${pending.length}` : ''}` : `Hecho${done.length ? ` · ${done.length}` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tasks */}
        <View style={n.list}>
          {shown.length === 0 && (
            <View style={n.empty}>
              <Text style={n.emptyEmoji}>{tab === 'pendiente' ? '✓' : '○'}</Text>
              <Text style={n.emptyTitle}>{tab === 'pendiente' ? '¡Todo hecho!' : 'Nada completado aún'}</Text>
              <Text style={n.emptySub}>{tab === 'pendiente' ? 'No quedan tareas pendientes. Buen trabajo.' : 'Las tareas completadas aparecerán aquí.'}</Text>
            </View>
          )}
          {shown.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={toggleTask}
              onAnimatedOut={tab === 'pendiente' ? handleAnimatedOut : undefined}
              onPress={setEditingTask}
              completerName={task.is_done && task.completed_by ? profiles[task.completed_by] ?? null : null}
            />
          ))}
        </View>

      </ScrollView>

      <TaskEditSheet
        task={editingTask}
        visible={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSaved={(updated) => setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))}
        onDeleted={(id) => setTasks(prev => prev.filter(t => t.id !== id))}
      />
    </SafeAreaView>
  );
}

const n = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 12 },
  greetName: { fontSize: 27, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.6 },
  greetSub: { fontSize: 13, color: C.ink3, fontFamily: FONT, marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
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
  weekNumOn: { backgroundColor: C.brand, borderColor: C.brand },
  weekNumText: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: FONT },
  weekNumTextOn: { color: C.white },
  weekDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.brand },

  menuCard:  { marginHorizontal: 20, marginBottom: 14 },
  menuLabel: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 8 },
  menuCols:  { flexDirection: 'row', gap: 10 },
  menuCol:   { flex: 1, borderRadius: R.l, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, padding: 12 },
  menuSlot:  { fontSize: 11, color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  menuDish:  { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.2 },

  nestHero: { marginHorizontal: 20, borderRadius: R.l, borderWidth: 1, padding: 16 },
  nestHeroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  nestLabel: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: C.ink2, fontFamily: FONT, fontWeight: '600' },
  nestCap: { fontSize: 12, color: C.ink2, fontFamily: FONT },
  nestPctRow: { marginBottom: 10 },
  nestPct: { fontSize: 34, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -1.5, lineHeight: 38 },
  nestPctSm: { fontSize: 14, color: C.ink2, fontWeight: '500' },
  nestBar: { height: 7, borderRadius: 999, backgroundColor: C.ink + '12', overflow: 'hidden' },
  nestBarFill: { height: '100%', borderRadius: 999 },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 18 },
  pill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: 'transparent' },
  pillOn: { backgroundColor: C.ink, borderColor: C.ink },
  pillText: { fontSize: 14, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  pillTextOn: { color: C.paper },

  list: { paddingHorizontal: 20, marginTop: 14 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 40, marginBottom: 12, color: C.brand },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.ink, fontFamily: FONT },
  emptySub: { fontSize: 13, color: C.ink3, marginTop: 4, textAlign: 'center', fontFamily: FONT },
});
