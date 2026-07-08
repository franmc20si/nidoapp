import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Task } from '@/types';
import { C, R, FONT } from '@/constants/theme';
import TaskCard from '@/components/TaskCard';
import StaggerItem from '@/components/StaggerItem';
import { AlertCards } from '@/components/AlertSystem';
import { nextDueDate, isDueAgain } from '@/lib/recurrence';
import { getMondayOfWeek } from '@/lib/week';
import { IlluNidoLimpio } from '@/components/icons';
import { useNidoStore } from '@/store/nidoStore';
import TaskEditSheet from '@/components/TaskEditSheet';
import { showToast } from '@/store/toastStore';
import { withTimeout } from '@/lib/withTimeout';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';

export default function NidoScreen() {
  const { household, user } = useAuthStore();
  const { accent, openFab } = useNidoStore();
  const taskRev = useNidoStore((s) => s.taskRev);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'pendiente' | 'realizada' | 'todas'>('pendiente');
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
        t.is_done && t.is_recurring && isDueAgain(t.due_date)
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

    if (markingDone && task.is_recurring && task.recurrence_rule) {
      const due = nextDueDate(task.recurrence_rule);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: true, completed_by: completedBy, completed_at: completedAt } : t));
      const { error } = await supabase.from('tasks').update({ is_done: true, due_date: due, completed_by: completedBy, completed_at: completedAt }).eq('id', task.id);
      if (error) { setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: false } : t)); showToast('No se pudo actualizar la tarea', 'error'); }
    } else {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: markingDone, completed_by: completedBy, completed_at: completedAt } : t));
      const { error } = await supabase.from('tasks').update({ is_done: markingDone, completed_by: completedBy, completed_at: completedAt }).eq('id', task.id);
      if (error) { setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: !markingDone } : t)); showToast('No se pudo actualizar la tarea', 'error'); }
    }
  };

  const shown = statusFilter === 'pendiente' ? tasks.filter(t => !t.is_done)
              : statusFilter === 'realizada'  ? tasks.filter(t => t.is_done)
              : tasks;

  const total = tasks.length;
  const doneCount = tasks.filter((t) => t.is_done).length;
  // "pts / semana": solo tareas completadas dentro de la semana ISO actual
  const weekStart = getMondayOfWeek(new Date());
  const ptsWeek = tasks
    .filter((t) => t.is_done && t.completed_at && new Date(t.completed_at) >= weekStart)
    .reduce((sum, t) => sum + (t.points ?? 10), 0);

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

  const weekShare = buildShare(
    tasks.filter((t) => t.is_done && t.completed_at && new Date(t.completed_at) >= weekStart)
  );
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
          <TouchableOpacity style={[s.headerAddBtn, { backgroundColor: accent.hex }]} onPress={openFab} activeOpacity={0.8}>
            <Text style={s.headerAddBtnText}>+ Tarea</Text>
          </TouchableOpacity>
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

        {/* Stats card */}
        <View style={s.statsCard}>
          <View style={s.statCol}>
            <Text style={s.statNum}>{total}</Text>
            <Text style={s.statLabel}>tareas</Text>
          </View>
          <View style={s.statDiv} />
          <View style={s.statCol}>
            <Text style={s.statNum}>{doneCount}</Text>
            <Text style={s.statLabel}>hechas</Text>
          </View>
          <View style={s.statDiv} />
          <View style={s.statCol}>
            <Text style={s.statNum}>{ptsWeek}</Text>
            <Text style={s.statLabel}>pts / semana</Text>
          </View>
        </View>

        {/* Status filter pills */}
        <View style={s.statusRow}>
          {(['pendiente', 'realizada', 'todas'] as const).map((k) => (
            <TouchableOpacity
              key={k}
              style={[s.statusPill, statusFilter === k && { backgroundColor: accent.hex, borderColor: accent.hex }]}
              onPress={() => setStatusFilter(k)}
              activeOpacity={0.8}
            >
              <Text style={[s.statusText, statusFilter === k && { color: C.white }]}>
                {k === 'pendiente' ? 'Por hacer' : k === 'realizada' ? 'Realizadas' : 'Todas'}
              </Text>
            </TouchableOpacity>
          ))}
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
          {shown.map((task, i) => (
            <StaggerItem key={task.id} index={i}>
              <TaskCard
                task={task}
                onToggle={toggleTask}
                onPress={setEditingTask}
                completerName={task.is_done && task.completed_by ? profiles[task.completed_by] ?? null : null}
              />
            </StaggerItem>
          ))}

          {/* Add task button (ob-opt style) */}
          <TouchableOpacity style={s.addBtn} activeOpacity={0.8} onPress={openFab}>
            <View style={s.addIcon}>
              <Text style={s.addIconText}>+</Text>
            </View>
            <Text style={s.addText}>Añadir tarea</Text>
          </TouchableOpacity>
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

  statsCard: { flexDirection: 'row', alignItems: 'center', height: 92, marginHorizontal: 20, backgroundColor: C.paperSoft, borderRadius: R.l, borderWidth: 1, borderColor: C.line, marginBottom: 16 },
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

  statusRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 14 },
  statusPill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  statusText: { fontSize: 13, fontWeight: '500', color: C.ink2, fontFamily: FONT },

  list: { paddingHorizontal: 20, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '500', color: C.ink, fontFamily: FONT },
  emptySub: { fontSize: 14, color: C.ink3, marginTop: 4, fontFamily: FONT },

  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, padding: 14, marginTop: 4 },
  addIcon: { width: 36, height: 36, borderRadius: R.s, backgroundColor: C.brandWash, alignItems: 'center', justifyContent: 'center' },
  addIconText: { fontSize: 22, color: C.brand, fontWeight: '400', lineHeight: 26 },
  addText: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: FONT },
});
