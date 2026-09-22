import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { View, Text, ScrollView, StyleSheet, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Task } from '@/types';
import { C, R, FONT } from '@/constants/theme';
import TaskCard from '@/components/TaskCard';
import StaggerItem from '@/components/StaggerItem';
import PressScale from '@/components/PressScale';
import { AlertCards } from '@/components/AlertSystem';
import { nextDueAfterComplete, shouldReappear, mondayFirstWeekday } from '@/lib/recurrence';
import { getMondayOfWeek } from '@/lib/week';
import { IlluNidoLimpio, IconRepeat } from '@/components/icons';
import { useNidoStore } from '@/store/nidoStore';
import TaskEditSheet from '@/components/TaskEditSheet';
import { showToast } from '@/store/toastStore';
import { withTimeout } from '@/lib/withTimeout';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';

// Orden de las franjas del día (mañana → noche). Sin franja va al final del día.
const SLOT_ORDER: Record<string, number> = { manana: 0, comida: 1, tarde: 2, noche: 3 };

// Posición FIJA de la tarea en la semana (Lunes → Domingo), para ordenar "Por
// hacer" recorriendo el calendario de tareas sin depender de hoy: una tarea del
// martes se queda en el martes aunque olvidaras marcarla. Dentro del día se
// ordena por franja. Devuelve {day, slot} comparables numéricamente.
function weekAppearance(t: Task): { day: number; slot: number } {
  const slot = t.day_slot != null && SLOT_ORDER[t.day_slot] != null ? SLOT_ORDER[t.day_slot] : 4;

  // Diaria: toca cada día → arriba del todo.
  if (t.is_recurring && t.recurrence_rule === 'daily') return { day: -1, slot };
  // Semanal anclada a día(s): su día fijo (el más temprano del conjunto, 0=Lun).
  if (t.weekdays && t.weekdays.length) return { day: Math.min(...t.weekdays), slot };
  // Con fecha concreta (quincenal, mensual, trimestral, puntual): en el día de
  // la semana de su fecha.
  if (t.due_date) return { day: mondayFirstWeekday(new Date(t.due_date + 'T00:00:00')), slot };
  // Sin día ni fecha → al final.
  return { day: 999, slot };
}

export default function NidoScreen() {
  const { household, user } = useAuthStore();
  const { accent, openFab } = useNidoStore();
  const taskRev = useNidoStore((s) => s.taskRev);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'pendiente' | 'realizada' | 'todas'>('pendiente');
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const fetchTokenRef = useRef(0);

  const fetchProfiles = async () => {
    if (!household) return;
    const { data: members } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', household.id);
    if (!members?.length) return;
    const ids = members.map(m => m.user_id);
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids);
    if (!profs) return;
    const map: Record<string, string> = {};
    for (const p of profs) {
      if (p.full_name) map[p.id] = p.full_name.split(' ')[0];
    }
    setProfiles(map);
  };

  const fetchTasks = async () => {
    if (!household) return;
    const token = ++fetchTokenRef.current;
    setLoading(true);
    setLoadError(false);

    try {
      const { data, error } = await withTimeout(
        supabase.from('tasks').select('*')
          .eq('household_id', household.id).order('created_at', { ascending: false })
      );
      if (error) throw error;

      // Discard result if a newer fetch has started since this one
      if (token !== fetchTokenRef.current) return;

      const tasks: Task[] = (data ?? []) as Task[];

      const toReset = tasks.filter(t =>
        t.is_done && t.is_recurring && shouldReappear(t.recurrence_rule, t.due_date)
      );
      if (toReset.length > 0) {
        const ids = toReset.map(t => t.id);
        await withTimeout(supabase.from('tasks').update({ is_done: false, due_date: null, completed_by: null, completed_at: null }).in('id', ids));
        if (token !== fetchTokenRef.current) return;
        toReset.forEach(t => { t.is_done = false; (t as any).due_date = null; t.completed_by = null; t.completed_at = null; });
      }

      setTasks(tasks);
      setLoaded(true);
    } catch (e) {
      console.error('[nido] fetchTasks error', e);
      if (token === fetchTokenRef.current) setLoadError(true);
    } finally {
      if (token === fetchTokenRef.current) setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); fetchProfiles(); }, [household?.id, taskRev]);
  useFocusEffect(useCallback(() => { fetchTasks(); fetchProfiles(); }, [household?.id]));

  const toggleTask = async (task: Task) => {
    const markingDone = !task.is_done;
    const completedBy = markingDone ? (user?.id ?? null) : null;
    const completedAt = markingDone ? new Date().toISOString() : null;

    // Snapshot de la tarea ANTES del cambio, para poder deshacer restaurando
    // exactamente los campos previos (incl. due_date de las recurrentes).
    const snapshot = task;
    const undo = () => {
      setTasks(prev => prev.map(t => t.id === task.id ? snapshot : t));
      supabase.from('tasks').update({
        is_done: snapshot.is_done,
        due_date: (snapshot as any).due_date ?? null,
        completed_by: snapshot.completed_by ?? null,
        completed_at: snapshot.completed_at ?? null,
      }).eq('id', task.id).then(() => {});
    };

    if (markingDone && task.is_recurring && task.recurrence_rule) {
      const due = nextDueAfterComplete(task.recurrence_rule, new Date(), task.weekdays);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: true, due_date: due, completed_by: completedBy, completed_at: completedAt } : t));
      const { error } = await supabase.from('tasks').update({ is_done: true, due_date: due, completed_by: completedBy, completed_at: completedAt }).eq('id', task.id);
      if (error) { setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: false } : t)); showToast('No se pudo actualizar la tarea', 'error'); return; }
      showToast('Hecho ✓', 'success', { label: 'Deshacer', onPress: undo });
    } else {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: markingDone, completed_by: completedBy, completed_at: completedAt } : t));
      const { error } = await supabase.from('tasks').update({ is_done: markingDone, completed_by: completedBy, completed_at: completedAt }).eq('id', task.id);
      if (error) { setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: !markingDone } : t)); showToast('No se pudo actualizar la tarea', 'error'); return; }
      if (markingDone) showToast('Hecho ✓', 'success', { label: 'Deshacer', onPress: undo });
    }
  };

  // Swipe-a-izquierda → DESCARTAR: marca la tarea como realizada pero SIN autor
  // (completed_by/completed_at a null) → sale del pendiente y no cuenta en el
  // reparto ni en los puntos. Semanales/diarias se aparcan hasta el lunes que
  // viene; las de intervalo (quincenal/mensual/trimestral) saltan su intervalo.
  const discardTask = (task: Task) => {
    const snapshot = task;
    const undo = () => {
      setTasks(prev => prev.map(t => t.id === task.id ? snapshot : t));
      supabase.from('tasks').update({
        is_done: snapshot.is_done,
        due_date: (snapshot as any).due_date ?? null,
        completed_by: snapshot.completed_by ?? null,
        completed_at: snapshot.completed_at ?? null,
      }).eq('id', task.id).then(() => {});
    };
    const patch: any = { is_done: true, completed_by: null, completed_at: null };
    if (task.is_recurring && task.recurrence_rule) {
      patch.due_date = nextDueAfterComplete(task.recurrence_rule, new Date(), task.weekdays);
    }
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } : t));
    withTimeout(supabase.from('tasks').update(patch).eq('id', task.id))
      .then((res: any) => { if (res?.error) { undo(); showToast('No se pudo descartar la tarea', 'error'); } })
      .catch(() => { undo(); showToast('No se pudo descartar la tarea', 'error'); });
    showToast('Tarea descartada', 'success', { label: 'Deshacer', onPress: undo });
  };

  const shown = statusFilter === 'pendiente'
                // Por hacer: ordenadas por su posición fija en la semana
                // (Lun→Dom, luego franja), como recorre el calendario de tareas.
                ? tasks.filter(t => !t.is_done).sort((a, b) => {
                    const A = weekAppearance(a), B = weekAppearance(b);
                    if (A.day !== B.day) return A.day - B.day;
                    if (A.slot !== B.slot) return A.slot - B.slot;
                    return a.title.localeCompare(b.title);
                  })
              : statusFilter === 'realizada'
                // Histórico: de la más recientemente hecha a la más antigua
                // (por completed_at, no por fecha de creación). Nulls al final.
                ? tasks.filter(t => t.is_done)
                        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
              : tasks;

  // Para no agobiar, mostramos solo las primeras y un botón "Ver más".
  const LIST_CAP = 4;
  const visible = expanded ? shown : shown.slice(0, LIST_CAP);

  // Métricas de la semana en curso (lunes→domingo), igual criterio que la tab Hoy.
  const weekStart = getMondayOfWeek(new Date());
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
  const inThisWeek = (iso: string | null | undefined) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= weekStart && d <= weekEnd;
  };
  const weekDoneList = tasks.filter((t) => t.is_done && inThisWeek(t.completed_at));
  const weekPendingList = tasks.filter((t) => {
    if (t.is_done) return false;
    const due = (t as any).due_date;
    if (!due) return true;                    // pendiente sin fecha → cuenta esta semana
    const d = new Date(due);
    return d >= weekStart && d <= weekEnd;     // pendiente con vencimiento esta semana
  });
  const weekTasks = weekDoneList.length + weekPendingList.length; // tareas de esta semana
  const weekDone  = weekDoneList.length;                          // hechas esta semana
  const ptsWeek   = weekDoneList.reduce((sum, t) => sum + (t.points ?? 10), 0); // puntos

  // Reparto: % de tareas hechas por cada persona
  const SHARE_PALETTE = [accent.hex, C.suelo, C.general, C.cena, C.cristales];
  const buildShare = (list: Task[]) => {
    const byPerson = list.reduce<Record<string, number>>((acc, t) => {
      if (t.is_done && t.completed_by) acc[t.completed_by] = (acc[t.completed_by] ?? 0) + 1;
      return acc;
    }, {});
    const sum = Object.values(byPerson).reduce((a, b) => a + b, 0);
    const ids = Object.keys(byPerson).sort((a, b) =>
      a === user?.id ? -1 : b === user?.id ? 1 : byPerson[b] - byPerson[a]
    );
    const people = ids.map((id, i) => ({
      id,
      count: byPerson[id],
      name: id === user?.id ? (profiles[id] ?? 'Tú') : (profiles[id] ?? 'Alguien'),
      pct: sum ? Math.round((byPerson[id] / sum) * 100) : 0,
      color: SHARE_PALETTE[i % SHARE_PALETTE.length],
    }));
    return { people, total: sum };
  };

  const weekShare = buildShare(weekDoneList);
  const allShare = buildShare(tasks);

  if (!loaded && loading) {
    return <SafeAreaView style={s.root}><ScreenLoader color={accent.hex} /></SafeAreaView>;
  }
  if (!loaded && loadError) {
    return <SafeAreaView style={s.root}><ScreenError onRetry={fetchTasks} color={accent.hex} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          contentContainerStyle={{ paddingBottom: 32 }}
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
        <View style={s.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>TU NIDO</Text>
            <Text style={s.title}>{household?.name ?? 'Nuestro nido'}</Text>
          </View>
          <PressScale style={[s.headerAddBtn, { backgroundColor: accent.hex }]} onPress={openFab} scaleTo={0.96} accessibilityRole="button" accessibilityLabel="Añadir tarea">
            <Text style={s.headerAddBtnText}>+ Tarea</Text>
          </PressScale>
        </View>

        {/* Share meter card — esta semana */}
        <View style={s.meterCard}>
          <Text style={s.meterTitle}>Reparto · esta semana</Text>
          {weekShare.total === 0 ? (
            <Text style={s.meterEmpty}>Aún no hay tareas repartidas</Text>
          ) : (
            <View style={s.meterBar}>
              {weekShare.people.map((p) => (
                <View key={p.id} style={[s.meterSeg, { flex: p.count, backgroundColor: p.color }]}>
                  <Text style={s.meterSegText} numberOfLines={1}>{p.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Share meter card — histórico (más pequeño) */}
        <View style={s.meterCardMini}>
          <Text style={s.meterTitleMini}>Histórico</Text>
          {allShare.total === 0 ? (
            <Text style={s.meterEmptyMini}>Sin datos todavía</Text>
          ) : (
            <View style={s.meterBarMini}>
              {allShare.people.map((p) => (
                <View key={p.id} style={[s.meterSeg, { flex: p.count, backgroundColor: p.color }]}>
                  <Text style={s.meterSegTextMini} numberOfLines={1}>{p.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Stats card — semana en curso */}
        <View style={s.statsCard}>
          <Text style={s.meterTitle}>Semana</Text>
          <View style={s.statsRow}>
            <View style={s.statCol}>
              <Text style={s.statNum}>{weekTasks}</Text>
              <Text style={s.statLabel}>tareas</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.statCol}>
              <Text style={s.statNum}>{weekDone}</Text>
              <Text style={s.statLabel}>hechas</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.statCol}>
              <Text style={s.statNum}>{ptsWeek}</Text>
              <Text style={s.statLabel}>puntos</Text>
            </View>
          </View>
        </View>

        {/* Status filter pills + acceso a Recurrentes */}
        <View style={s.statusRow}>
          {(['pendiente', 'realizada', 'todas'] as const).map((k) => (
            <PressScale
              key={k}
              style={[s.statusPill, statusFilter === k && { backgroundColor: accent.hex, borderColor: accent.hex }]}
              onPress={() => { setStatusFilter(k); setExpanded(false); }}
              scaleTo={0.94}
              accessibilityRole="button"
              accessibilityLabel={k === 'pendiente' ? 'Filtro: por hacer' : k === 'realizada' ? 'Filtro: realizadas' : 'Filtro: todas'}
            >
              <Text style={[s.statusText, statusFilter === k && { color: C.white }]}>
                {k === 'pendiente' ? 'Por hacer' : k === 'realizada' ? 'Realizadas' : 'Todas'}
              </Text>
            </PressScale>
          ))}
          <View style={{ flex: 1 }} />
          <PressScale
            style={s.recurBtn}
            onPress={() => router.push('/recurrentes')}
            scaleTo={0.9}
            accessibilityRole="button"
            accessibilityLabel="Ver tareas recurrentes por semana"
          >
            <IconRepeat size={19} color={C.cristales} strokeWidth={2} />
          </PressScale>
        </View>

        {/* Alert cards — shared with Hoy */}
        <AlertCards />

        {/* Task list */}
        <View style={s.list}>
          {shown.length === 0 && (
            <View style={s.empty}>
              <IlluNidoLimpio size={110} color={accent.hex} fill={accent.wash} />
              <Text style={s.emptyTitle}>Nido limpio</Text>
              <Text style={s.emptySub}>Añade tareas con el botón de abajo</Text>
            </View>
          )}
          {visible.map((task, i) => (
            <StaggerItem key={task.id} index={i}>
              <TaskCard
                task={task}
                onToggle={toggleTask}
                onPress={setEditingTask}
                onSwipe={statusFilter === 'pendiente' ? discardTask : undefined}
                completerName={task.is_done && task.completed_by ? profiles[task.completed_by] ?? null : null}
              />
            </StaggerItem>
          ))}

          {shown.length > LIST_CAP && (
            <PressScale
              style={s.moreBtn}
              onPress={() => setExpanded(e => !e)}
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Ver menos tareas' : 'Ver más tareas'}
            >
              <Text style={[s.moreText, { color: accent.hex }]}>
                {expanded ? 'Ver menos' : `Ver más (${shown.length - LIST_CAP})`}
              </Text>
            </PressScale>
          )}

          {/* Add task button (ob-opt style) */}
          <PressScale style={s.addBtn} scaleTo={0.98} onPress={openFab} accessibilityRole="button" accessibilityLabel="Añadir tarea">
            <View style={s.addIcon}>
              <Text style={s.addIconText}>+</Text>
            </View>
            <Text style={s.addText}>Añadir tarea</Text>
          </PressScale>
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '600' },
  title: { fontSize: 30, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.6, marginTop: 2 },
  headerAddBtn: { borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 10 },
  headerAddBtnText: { color: C.white, fontWeight: '600', fontSize: 14, fontFamily: FONT },

  statsCard: { marginHorizontal: 20, backgroundColor: C.paperSoft, borderRadius: R.l, borderWidth: 1, borderColor: C.line, marginBottom: 16, paddingHorizontal: 18, paddingVertical: 14, gap: 10 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statCol: { flex: 1, alignItems: 'center' },
  statDiv: { width: 1, height: 36, backgroundColor: C.line },
  statNum: { fontSize: 24, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: C.ink3, fontFamily: FONT, marginTop: 3 },

  meterCard: { height: 92, marginHorizontal: 20, backgroundColor: C.paperSoft, borderRadius: R.l, borderWidth: 1, borderColor: C.line, marginBottom: 8, paddingHorizontal: 18, justifyContent: 'center', gap: 10 },
  meterTitle: { fontSize: 11, letterSpacing: 0.4, color: C.ink3, fontFamily: FONT, fontWeight: '600' },
  meterEmpty: { fontSize: 13, color: C.ink3, fontFamily: FONT },
  meterBar: { flexDirection: 'row', height: 38, borderRadius: R.s, overflow: 'hidden', backgroundColor: C.paperDeep, gap: 2 },
  meterSeg: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, minWidth: 0 },
  meterSegText: { fontSize: 12, fontWeight: '600', color: C.white, fontFamily: FONT },

  meterCardMini: { marginHorizontal: 20, backgroundColor: C.paperSoft, borderRadius: R.m, borderWidth: 1, borderColor: C.line, marginBottom: 16, paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  meterTitleMini: { fontSize: 10, letterSpacing: 0.4, color: C.ink3, fontFamily: FONT, fontWeight: '600' },
  meterEmptyMini: { fontSize: 12, color: C.ink3, fontFamily: FONT },
  meterBarMini: { flexDirection: 'row', height: 22, borderRadius: R.s, overflow: 'hidden', backgroundColor: C.paperDeep, gap: 2 },
  meterSegTextMini: { fontSize: 11, fontWeight: '600', color: C.white, fontFamily: FONT },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 14 },
  statusPill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  statusText: { fontSize: 13, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  recurBtn: { alignItems: 'center', justifyContent: 'center', width: 40, height: 38, borderRadius: R.pill, backgroundColor: C.cristalesTint, borderWidth: 1.5, borderColor: C.cristales + '55' },
  recurBtnText: { fontSize: 17, fontFamily: FONT },

  list: { paddingHorizontal: 20, marginTop: 2 },
  moreBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 18, marginTop: 2, marginBottom: 4 },
  moreText: { fontSize: 13.5, fontFamily: FONT, fontWeight: '600', letterSpacing: -0.2 },
  empty: { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '500', color: C.ink, fontFamily: FONT },
  emptySub: { fontSize: 14, color: C.ink3, marginTop: 4, fontFamily: FONT },

  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, padding: 14, marginTop: 4 },
  addIcon: { width: 36, height: 36, borderRadius: R.s, backgroundColor: C.brandWash, alignItems: 'center', justifyContent: 'center' },
  addIconText: { fontSize: 22, color: C.brand, fontWeight: '400', lineHeight: 26 },
  addText: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: FONT },
});
