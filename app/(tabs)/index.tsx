import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useNidoStore } from '@/store/nidoStore';
import { supabase } from '@/lib/supabase';
import { Task } from '@/types';
import TaskCard from '@/components/TaskCard';
import { AlertComposer, AlertCards } from '@/components/AlertSystem';
import NidoSheet from '@/components/NidoSheet';
import { nextDueDate, isDueAgain } from '@/lib/recurrence';

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
  const { profile, household } = useAuthStore();
  const { accent, loadAccent } = useNidoStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'hoy' | 'manana' | 'todo'>('hoy');
  const [bellActive, setBellActive] = useState(false);
  const [nidoSheetVisible, setNidoSheetVisible] = useState(false);

  // Load saved accent when household is known
  useEffect(() => { if (household?.id) loadAccent(household.id); }, [household?.id]);
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
      await supabase.from('tasks').update({ is_done: false, due_date: null }).in('id', ids);
      toReset.forEach(t => { t.is_done = false; (t as any).due_date = null; });
    }

    setTasks(tasks);
    setRemoved(new Set());
  };

  useEffect(() => { fetchTasks(); }, [household]);

  const toggleTask = async (task: Task) => {
    const anyTask = task as any;
    if (!task.is_done && task.is_recurring && anyTask.recurrence_rule) {
      // Completing a recurring task: mark done + schedule next due date
      const due = nextDueDate(anyTask.recurrence_rule);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: true } : t));
      await supabase.from('tasks').update({ is_done: true, due_date: due }).eq('id', task.id);
    } else {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: !t.is_done } : t));
      await supabase.from('tasks').update({ is_done: !task.is_done }).eq('id', task.id);
    }
  };

  const handleAnimatedOut = (task: Task) => {
    setRemoved((prev) => new Set(prev).add(task.id));
  };

  const todayStr    = new Date().toDateString();
  const tomorrowStr = new Date(Date.now() + 86400000).toDateString();

  const visible = tasks.filter((t) => !removed.has(t.id));
  const pending = visible.filter((t) => !t.is_done);
  const done    = visible.filter((t) => t.is_done);

  const hoyTasks    = pending.filter((t) => {
    const due = (t as any).due_date;
    if (!due) return true;                        // no date → show today
    return new Date(due).toDateString() === todayStr || new Date(due) < new Date();
  });
  const manTasks    = pending.filter((t) => {
    const due = (t as any).due_date;
    if (!due) return false;
    return new Date(due).toDateString() === tomorrowStr;
  });

  const shown = tab === 'todo' ? visible : tab === 'manana' ? manTasks : hoyTasks;
  const total    = visible.length;
  const doneCount = done.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <SafeAreaView style={n.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Top bar */}
        <View style={n.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={n.greetName}>Buenos días, {firstName}</Text>
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

        {/* Nest hero */}
        <View style={[n.nestHero, { backgroundColor: accent.wash, borderColor: accent.hex + '28' }]}>
          <View style={n.nestHeroRow}>
            <Text style={n.nestLabel}>TU NIDO HOY</Text>
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
          {(['hoy', 'manana', 'todo'] as const).map((k) => (
            <TouchableOpacity key={k} style={[n.pill, tab === k && n.pillOn]} onPress={() => setTab(k)} activeOpacity={0.8}>
              <Text style={[n.pillText, tab === k && n.pillTextOn]}>
                {k === 'hoy' ? 'Hoy' : k === 'manana' ? 'Mañana' : 'Todo'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tasks */}
        <View style={n.list}>
          {shown.length === 0 && (
            <View style={n.empty}>
              <Text style={n.emptyEmoji}>✓</Text>
              <Text style={n.emptyTitle}>Todo hecho por aquí</Text>
              <Text style={n.emptySub}>No quedan tareas pendientes. Buen trabajo.</Text>
            </View>
          )}
          {shown.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={toggleTask}
              onAnimatedOut={tab === 'todo' ? undefined : handleAnimatedOut}
            />
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const n = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 12 },
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
