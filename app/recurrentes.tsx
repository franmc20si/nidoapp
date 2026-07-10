import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  ActivityIndicator, useWindowDimensions, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useNidoStore } from '@/store/nidoStore';
import { supabase } from '@/lib/supabase';
import { Task } from '@/types';
import {
  WEEKDAYS, TIME_SLOTS, DaySlot, firstWeeklyDue, mondayFirstWeekday, recurrenceLabel,
} from '@/lib/recurrence';
import { catFor } from '@/constants/categories';
import { ptsFromMin } from '@/lib/taskTheme';
import { readWithRetry, withTimeout } from '@/lib/withTimeout';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';
import PressScale from '@/components/PressScale';
import BottomSheet from '@/components/BottomSheet';
import RecurrenceScheduler from '@/components/RecurrenceScheduler';
import TaskEditSheet from '@/components/TaskEditSheet';

const TIMES = [
  { label: '15 min', min: 15 },
  { label: '30 min', min: 30 },
  { label: '1 h',    min: 60 },
  { label: '2 h',    min: 120 },
];

// ─── Chip de una tarea recurrente ─────────────────────────────────────────────
function TaskChip({ task, onPress, compact }: { task: Task; onPress: () => void; compact?: boolean }) {
  const cat = catFor(task.category);
  return (
    <PressScale
      style={[ch.chip, compact && ch.chipC]}
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`Editar ${task.title}`}
    >
      <View style={[ch.dot, { backgroundColor: cat.color }]} />
      <Text style={ch.txt} numberOfLines={2}>{task.title}</Text>
      {task.recurrence_rule === 'daily' && <Text style={ch.daily}>· diaria</Text>}
    </PressScale>
  );
}

// ─── Sheet: nueva recurrente (prerrellena día+franja de la celda tocada) ───────
function AddRecurringSheet({
  visible, prefill, color, onClose, onAdded,
}: {
  visible: boolean;
  prefill: { weekday: number; slot: DaySlot } | null;
  color: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { household, user } = useAuthStore();
  const [title, setTitle] = useState('');
  const [min, setMin] = useState(30);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [slot, setSlot] = useState<DaySlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Resincroniza el formulario cada vez que se abre con un contexto distinto.
  const key = visible ? `${prefill?.weekday}_${prefill?.slot}` : 'closed';
  const [lastKey, setLastKey] = useState('closed');
  if (visible && key !== lastKey) {
    setLastKey(key);
    setTitle(''); setMin(30);
    setWeekdays(prefill ? [prefill.weekday] : []);
    setSlot(prefill?.slot ?? null);
    setError(''); setSaving(false);
  }

  const toggleDay = (d: number) =>
    setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
  const pts = ptsFromMin(min);

  const handleSave = async () => {
    if (!household || !title.trim()) { setError('Ponle un nombre'); return; }
    if (!weekdays.length) { setError('Elige al menos un día'); return; }
    setSaving(true); setError('');
    try {
      const { error: err } = await withTimeout(
        supabase.from('tasks').insert({
          household_id: household.id,
          title: title.trim(),
          created_by: user?.id,
          is_recurring: true,
          recurrence_rule: 'weekly',
          weekdays,
          day_slot: slot,
          due_date: firstWeeklyDue(weekdays),
          points: pts,
          duration_min: min,
        } as any)
      );
      if (err) throw err;
      useNidoStore.getState().bumpTasks();
      onAdded();
      onClose();
    } catch (e: any) {
      setError(e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView contentContainerStyle={a.body} keyboardShouldPersistTaps="handled">
        <Text style={a.title}>Nueva recurrente</Text>

        <TextInput
          style={a.field}
          placeholder="¿Qué hay que hacer?"
          placeholderTextColor={C.ink3}
          value={title}
          onChangeText={setTitle}
          autoFocus
        />

        <Text style={a.label}>Tiempo</Text>
        <View style={a.timeRow}>
          {TIMES.map((t) => {
            const on = min === t.min;
            return (
              <PressScale key={t.min} scaleTo={0.94} style={[a.timePill, on && a.timePillOn]} onPress={() => setMin(t.min)}>
                <Text style={[a.timeText, on && a.timeTextOn]}>{t.label}</Text>
              </PressScale>
            );
          })}
        </View>

        <RecurrenceScheduler
          showDays
          weekdays={weekdays}
          onToggleDay={toggleDay}
          slot={slot}
          onSlot={setSlot}
          color={color}
        />

        {error ? <Text style={a.error}>{error}</Text> : null}

        <PressScale
          style={[a.save, { backgroundColor: color }, (!title.trim() || saving) && { opacity: 0.4 }]}
          onPress={handleSave}
          disabled={saving || !title.trim()}
          accessibilityRole="button"
          accessibilityLabel="Guardar recurrente"
        >
          {saving ? <ActivityIndicator color={C.white} /> : <Text style={a.saveText}>Guardar</Text>}
        </PressScale>
      </ScrollView>
    </BottomSheet>
  );
}

export default function RecurrentesScreen() {
  const { household } = useAuthStore();
  const { accent } = useNidoStore();
  const taskRev = useNidoStore((s) => s.taskRev);
  const color = accent.hex;

  const [tasks, setTasks]         = useState<Task[]>([]);
  const [loaded, setLoaded]       = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [addCtx, setAddCtx]       = useState<{ weekday: number; slot: DaySlot } | null>(null);
  const [addOpen, setAddOpen]     = useState(false);
  const [selDay, setSelDay]       = useState<number>(mondayFirstWeekday(new Date()));

  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const fetchTasks = useCallback(async () => {
    if (!household) return;
    const { data, error } = await readWithRetry(() =>
      supabase.from('tasks').select('*').eq('household_id', household.id).eq('is_recurring', true)
    );
    if (error) { setLoadError(true); return; }
    setTasks((data ?? []) as Task[]);
    setLoaded(true); setLoadError(false);
  }, [household?.id]);

  useFocusEffect(useCallback(() => { fetchTasks(); }, [fetchTasks, taskRev]));

  // ── Derivados ──────────────────────────────────────────────────────────────
  const weeklyDaily = useMemo(
    () => tasks.filter((t) => t.recurrence_rule === 'weekly' || t.recurrence_rule === 'daily'),
    [tasks],
  );
  const isPlaced = (t: Task) => !!t.day_slot && (t.recurrence_rule === 'daily' || (t.weekdays?.length ?? 0) > 0);
  const unassigned = useMemo(() => weeklyDaily.filter((t) => !isPlaced(t)), [weeklyDaily]);
  const others = useMemo(
    () => tasks.filter((t) => ['biweekly', 'monthly', 'quarterly'].includes(t.recurrence_rule ?? '')),
    [tasks],
  );

  const tasksFor = (day: number, slot: DaySlot) =>
    weeklyDaily.filter((t) =>
      t.day_slot === slot && (t.recurrence_rule === 'daily' || (t.weekdays ?? []).includes(day)));

  const openAdd = (weekday: number, slot: DaySlot) => { setAddCtx({ weekday, slot }); setAddOpen(true); };

  const onSaved = (u: Task) => setTasks((prev) => prev.map((t) => (t.id === u.id ? u : t)));
  const onDeleted = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));

  if (!loaded && loadError) {
    return <SafeAreaView style={s.root}><ScreenError onRetry={fetchTasks} color={color} /></SafeAreaView>;
  }
  if (!loaded) {
    return <SafeAreaView style={s.root}><ScreenLoader color={color} /></SafeAreaView>;
  }

  // Una celda (día×franja): chips + botón añadir.
  const renderCell = (day: number, slot: DaySlot, compact: boolean) => {
    const list = tasksFor(day, slot);
    return (
      <View style={compact ? undefined : { gap: 6 }}>
        {list.map((t) => (
          <TaskChip key={`${t.id}-${day}`} task={t} compact={compact} onPress={() => setEditingTask(t)} />
        ))}
        <PressScale
          style={ch.add}
          onPress={() => openAdd(day, slot)}
          scaleTo={0.9}
          accessibilityRole="button"
          accessibilityLabel={`Añadir tarea el ${WEEKDAYS[day].label} en ${TIME_SLOTS.find(x => x.key === slot)!.label}`}
        >
          <Text style={ch.addTxt}>＋</Text>
        </PressScale>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Cabecera */}
        <View style={s.topbar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
            <Text style={s.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>TU SEMANA 🔁</Text>
            <Text style={s.title}>Recurrentes</Text>
          </View>
        </View>
        <Text style={s.sub}>Tus tareas regulares por día y franja. Tócalas para editarlas o borrarlas.</Text>

        {isWide ? (
          /* ESCRITORIO: cuadrícula 7 días × 4 franjas */
          <View style={s.grid}>
            <View style={s.gridRow}>
              <View style={s.rowHead} />
              {WEEKDAYS.map((w) => (
                <View key={w.key} style={s.col}><Text style={s.colHead}>{w.short}</Text></View>
              ))}
            </View>
            {TIME_SLOTS.map((sl) => (
              <View key={sl.key} style={s.gridRow}>
                <View style={s.rowHead}>
                  <Text style={s.rowHeadEmoji}>{sl.emoji}</Text>
                  <Text style={s.rowHeadTxt}>{sl.label}</Text>
                </View>
                {WEEKDAYS.map((w) => (
                  <View key={w.key} style={s.cell}>{renderCell(w.key, sl.key, true)}</View>
                ))}
              </View>
            ))}
          </View>
        ) : (
          /* MÓVIL: selector de día + 4 franjas del día elegido */
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dayStrip}>
              {WEEKDAYS.map((w) => {
                const on = w.key === selDay;
                return (
                  <PressScale
                    key={w.key}
                    style={[s.dayChip, on && { backgroundColor: color, borderColor: color }]}
                    onPress={() => setSelDay(w.key)}
                    scaleTo={0.92}
                    accessibilityRole="button"
                    accessibilityLabel={w.label}
                  >
                    <Text style={[s.dayChipTxt, on && { color: C.white }]}>{w.short}</Text>
                  </PressScale>
                );
              })}
            </ScrollView>

            {TIME_SLOTS.map((sl) => (
              <View key={sl.key} style={s.section}>
                <Text style={s.sectionTitle}>{sl.emoji} {sl.label}</Text>
                {renderCell(selDay, sl.key, false)}
              </View>
            ))}
          </>
        )}

        {/* Sin asignar */}
        {unassigned.length > 0 && (
          <View style={s.trayWrap}>
            <Text style={s.trayTitle}>Sin día o franja</Text>
            <Text style={s.trayHint}>Tócalas para asignarles día(s) y franja y que aparezcan en la cuadrícula.</Text>
            <View style={s.trayList}>
              {unassigned.map((t) => <TaskChip key={t.id} task={t} onPress={() => setEditingTask(t)} />)}
            </View>
          </View>
        )}

        {/* Otras recurrentes (quincenal/mensual/trimestral) */}
        {others.length > 0 && (
          <View style={s.trayWrap}>
            <Text style={s.trayTitle}>Otras recurrentes</Text>
            <View style={s.trayList}>
              {others.map((t) => (
                <PressScale key={t.id} style={ch.chip} onPress={() => setEditingTask(t)} scaleTo={0.97} accessibilityRole="button" accessibilityLabel={`Editar ${t.title}`}>
                  <View style={[ch.dot, { backgroundColor: catFor(t.category).color }]} />
                  <Text style={ch.txt} numberOfLines={2}>{t.title}</Text>
                  <Text style={ch.daily}>· {recurrenceLabel(t.recurrence_rule).toLowerCase()}</Text>
                </PressScale>
              ))}
            </View>
          </View>
        )}

        {weeklyDaily.length === 0 && others.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🔁</Text>
            <Text style={s.emptyTitle}>Aún no hay recurrentes</Text>
            <Text style={s.emptySub}>Toca ＋ en un día y franja para crear tu primera tarea regular.</Text>
          </View>
        )}
      </ScrollView>

      <AddRecurringSheet
        visible={addOpen}
        prefill={addCtx}
        color={color}
        onClose={() => { setAddOpen(false); setAddCtx(null); }}
        onAdded={fetchTasks}
      />

      <TaskEditSheet
        task={editingTask}
        visible={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 4, gap: 6 },
  backBtn: { width: 34, height: 34, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 2, marginLeft: -6 },
  backChevron: { fontSize: 30, color: C.ink2, fontFamily: FONT, lineHeight: 32, marginTop: -4 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '500' },
  title: { fontSize: 28, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.6 },
  sub: { fontSize: 13.5, color: C.ink3, fontFamily: FONT, paddingHorizontal: 22, marginBottom: 16, lineHeight: 19 },

  // Cuadrícula (escritorio)
  grid: { paddingHorizontal: 16 },
  gridRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  rowHead: { width: 66, alignItems: 'flex-start', justifyContent: 'center', paddingTop: 6 },
  rowHeadEmoji: { fontSize: 16 },
  rowHeadTxt: { fontSize: 11, color: C.ink2, fontFamily: FONT, fontWeight: '600', marginTop: 2 },
  col: { flex: 1, alignItems: 'stretch' },
  colHead: { textAlign: 'center', fontSize: 12, fontWeight: '700', color: C.ink2, fontFamily: FONT, paddingVertical: 6 },
  cell: { flex: 1, minHeight: 56, backgroundColor: C.card, borderRadius: R.m, borderWidth: 1, borderColor: C.line, padding: 5, gap: 5 },

  // Móvil
  dayStrip: { paddingHorizontal: 20, gap: 8, paddingBottom: 6 },
  dayChip: { width: 42, height: 42, borderRadius: R.pill, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  dayChipTxt: { fontSize: 15, fontWeight: '700', color: C.ink2, fontFamily: FONT },
  section: { paddingHorizontal: 20, marginTop: 16 },
  sectionTitle: { fontSize: 16, color: C.ink, fontFamily: FONT, fontWeight: '600', letterSpacing: -0.2, marginBottom: 10 },

  // Bandejas
  trayWrap: { marginHorizontal: 20, marginTop: 22, backgroundColor: C.paperSoft, borderRadius: R.l, borderWidth: 1, borderColor: C.line, padding: 16 },
  trayTitle: { fontSize: 13, fontWeight: '700', color: C.ink2, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 0.6 },
  trayHint: { fontSize: 12.5, color: C.ink3, fontFamily: FONT, marginTop: 4, marginBottom: 12, lineHeight: 17 },
  trayList: { gap: 8, marginTop: 8 },

  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: C.ink, fontFamily: FONT },
  emptySub: { fontSize: 14, color: C.ink3, fontFamily: FONT, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});

const ch = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: R.m, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10 },
  chipC: { paddingHorizontal: 7, paddingVertical: 6, gap: 5, borderRadius: 10 },
  dot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  txt: { flex: 1, fontSize: 12.5, color: C.ink, fontFamily: FONT, fontWeight: '600' },
  daily: { fontSize: 10.5, color: C.ink3, fontFamily: FONT },
  add: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' },
  addTxt: { fontSize: 15, color: C.ink3, fontFamily: FONT, lineHeight: 18 },
});

const a = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 36 },
  title: { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4, marginBottom: 18 },
  field: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 15, fontSize: 16, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, letterSpacing: 0.2, marginBottom: 10, textTransform: 'uppercase' },
  timeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  timePill: { flex: 1, borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingVertical: 12, alignItems: 'center', backgroundColor: C.card },
  timePillOn: { backgroundColor: C.ink, borderColor: C.ink },
  timeText: { fontSize: 14, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  timeTextOn: { color: C.paper, fontWeight: '600' },
  error: { color: C.danger, fontSize: 13, fontFamily: FONT, marginBottom: 12, textAlign: 'center' },
  save: { borderRadius: R.pill, paddingVertical: 16, alignItems: 'center' },
  saveText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
