import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { Task } from '@/types';
import { C, R, FONT } from '@/constants/theme';
import { CATS } from '@/constants/categories';
import TaskCard from '@/components/TaskCard';
import { AlertCards } from '@/components/AlertSystem';
import { nextDueDate, isDueAgain } from '@/lib/recurrence';
import { IlluNidoLimpio, getCatIcon } from '@/components/icons';
import { useNidoStore } from '@/store/nidoStore';
import TaskEditSheet from '@/components/TaskEditSheet';
import { showToast } from '@/store/toastStore';

export default function NidoScreen() {
  const { household, user } = useAuthStore();
  const { accent, openFab } = useNidoStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pendiente' | 'realizada' | 'todas'>('pendiente');
  const [refreshing, setRefreshing] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
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

    const { data } = await supabase.from('tasks').select('*')
      .eq('household_id', household.id).order('created_at', { ascending: false });

    // Discard result if a newer fetch has started since this one
    if (token !== fetchTokenRef.current) return;

    const tasks: Task[] = (data ?? []) as Task[];

    const toReset = tasks.filter(t =>
      t.is_done && t.is_recurring && isDueAgain(t.due_date)
    );
    if (toReset.length > 0) {
      const ids = toReset.map(t => t.id);
      await supabase.from('tasks').update({ is_done: false, due_date: null, completed_by: null, completed_at: null }).in('id', ids);
      if (token !== fetchTokenRef.current) return;
      toReset.forEach(t => { t.is_done = false; (t as any).due_date = null; t.completed_by = null; t.completed_at = null; });
    }

    setTasks(tasks);
  };

  useEffect(() => { fetchTasks(); fetchProfiles(); }, [household?.id]);
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

  const byStatus = statusFilter === 'pendiente' ? tasks.filter(t => !t.is_done)
                 : statusFilter === 'realizada'  ? tasks.filter(t => t.is_done)
                 : tasks;
  const shown = selected ? byStatus.filter((t) => t.category === selected) : byStatus;

  const total = tasks.length;
  const doneCount = tasks.filter((t) => t.is_done).length;
  const ptsWeek = tasks
    .filter((t) => t.is_done)
    .reduce((sum, t) => sum + (t.points ?? 10), 0);

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
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
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.7}>
            <Text style={s.iconBtnText}>⚙</Text>
          </TouchableOpacity>
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

        {/* Category chips — wrap grid, no horizontal scroll */}
        <View style={s.chipsRow}>
          <TouchableOpacity style={[s.chip, !selected && { backgroundColor: accent.hex, borderColor: accent.hex }]} onPress={() => setSelected(null)} activeOpacity={0.8}>
            <Text style={[s.chipText, !selected && { color: C.white }]}>Todas</Text>
          </TouchableOpacity>
          {CATS.map((cat) => {
            const on = selected === cat.key;
            const CatIcon = getCatIcon(cat.key);
            return (
              <TouchableOpacity
                key={cat.key}
                style={[s.chip, on && { backgroundColor: cat.color, borderColor: cat.color }]}
                onPress={() => setSelected(on ? null : cat.key)}
                activeOpacity={0.8}
              >
                <CatIcon size={15} color={on ? C.white : cat.color} fill={on ? cat.color : cat.tint} strokeWidth={2.2} />
                <Text style={[s.chipText, on && { color: C.white }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
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
          {shown.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={toggleTask}
              onPress={setEditingTask}
              completerName={task.is_done && task.completed_by ? profiles[task.completed_by] ?? null : null}
            />
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
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 18, color: C.ink2 },

  statsCard: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: C.paperSoft, borderRadius: R.l, paddingVertical: 18, borderWidth: 1, borderColor: C.line, marginBottom: 16 },
  statCol: { flex: 1, alignItems: 'center' },
  statDiv: { width: 1, backgroundColor: C.line, marginVertical: 2 },
  statNum: { fontSize: 24, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: C.ink3, fontFamily: FONT, marginTop: 3 },

  statusRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 14 },
  statusPill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  statusText: { fontSize: 13, fontWeight: '500', color: C.ink2, fontFamily: FONT },

  chipsRow: { paddingHorizontal: 20, paddingBottom: 14, gap: 8, flexDirection: 'row', flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: C.card },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  chipText: { fontSize: 13, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  chipTextOn: { color: C.white },

  list: { paddingHorizontal: 20, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '500', color: C.ink, fontFamily: FONT },
  emptySub: { fontSize: 14, color: C.ink3, marginTop: 4, fontFamily: FONT },

  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, padding: 14, marginTop: 4 },
  addIcon: { width: 36, height: 36, borderRadius: R.s, backgroundColor: C.brandWash, alignItems: 'center', justifyContent: 'center' },
  addIconText: { fontSize: 22, color: C.brand, fontWeight: '400', lineHeight: 26 },
  addText: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: FONT },
});
