import { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { CATS } from '@/constants/categories';
import { ptsFromMin } from '@/lib/taskTheme';
import { RECURRENCE_OPTS, RecurrenceRule, DaySlot, firstWeeklyDue } from '@/lib/recurrence';
import RecurrenceScheduler from '@/components/RecurrenceScheduler';
import { useAuthStore } from '@/store/authStore';
import { useNidoStore } from '@/store/nidoStore';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';
import { getCatIcon } from '@/components/icons';
import PressScale from '@/components/PressScale';
import BottomSheet from '@/components/BottomSheet';

const TIMES = [
  { label: '15 min', min: 15 },
  { label: '30 min', min: 30 },
  { label: '1 h',    min: 60 },
  { label: '2 h',    min: 120 },
];

export interface AddTaskPrefill {
  kind?: 'regular' | 'puntual';
  category?: string | null;
  recRule?: RecurrenceRule;
  weekdays?: number[];
  slot?: DaySlot | null;
}

/**
 * Sheet de crear tarea, compartido por el botón "+" de la tab bar y por la
 * cuadrícula de recurrentes (con `prefill` para prerrellenar día+franja).
 */
export default function AddTaskSheet({ visible, onClose, prefill }: {
  visible: boolean;
  onClose: () => void;
  prefill?: AddTaskPrefill;
}) {
  const { household, user } = useAuthStore();
  const { accent } = useNidoStore();
  const [kind, setKind] = useState<'regular' | 'puntual'>('regular');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [min, setMin] = useState(30);
  const [recRule, setRecRule] = useState<RecurrenceRule>('weekly');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [slot, setSlot] = useState<DaySlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Resincroniza (y aplica prefill) cada vez que se abre con un contexto nuevo.
  const key = visible ? JSON.stringify(prefill ?? {}) : 'closed';
  const [lastKey, setLastKey] = useState('closed');
  if (visible && key !== lastKey) {
    setLastKey(key);
    setKind(prefill?.kind ?? 'regular');
    setTitle('');
    setCategory(prefill?.category ?? null);
    setMin(30);
    setRecRule(prefill?.recRule ?? 'weekly');
    setWeekdays(prefill?.weekdays ?? []);
    setSlot(prefill?.slot ?? null);
    setSaving(false);
    setSaveError('');
  }

  const pts = ptsFromMin(min);
  const toggleDay = (d: number) =>
    setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));

  const handleAdd = async () => {
    if (!title.trim() || !household) return;
    setSaving(true);
    setSaveError('');
    const anchoredWeekly = kind === 'regular' && recRule === 'weekly' && weekdays.length > 0;
    try {
      const { error } = await withTimeout(
        supabase.from('tasks').insert({
          household_id: household.id,
          title: title.trim(),
          created_by: user?.id,
          is_recurring: kind === 'regular',
          recurrence_rule: kind === 'regular' ? recRule : null,
          weekdays: anchoredWeekly ? weekdays : null,
          day_slot: kind === 'regular' ? slot : null,
          // Semanal anclada → aparece en su día desde el principio.
          ...(anchoredWeekly ? { due_date: firstWeeklyDue(weekdays) } : {}),
          category,
          points: pts,
          duration_min: min,
        } as any)
      );
      if (error) { setSaveError(error.message); return; }
      useNidoStore.getState().bumpTasks();
      onClose();
    } catch (e: any) {
      setSaveError(e?.message === 'TIMEOUT'
        ? 'La conexión tardó demasiado. Inténtalo de nuevo.'
        : (e?.message ?? 'No se pudo añadir la tarea'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView style={s.sheetScroll} contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
        {/* Regular / Puntual */}
        <View style={s.seg}>
          {(['regular', 'puntual'] as const).map((k) => (
            <PressScale key={k} scaleTo={0.96} style={[s.segItem, kind === k && s.segItemOn]} onPress={() => setKind(k)}>
              <Text style={[s.segText, kind === k && s.segTextOn]}>{k === 'regular' ? 'Regular' : 'Puntual'}</Text>
            </PressScale>
          ))}
        </View>

        {/* Categoría */}
        <Text style={s.sectionLabel}>Tarea frecuente</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow} keyboardShouldPersistTaps="handled">
          {CATS.map((cat) => {
            const on = category === cat.key;
            const Icon = getCatIcon(cat.key);
            return (
              <PressScale
                key={cat.key}
                scaleTo={0.94}
                style={[s.catChip, { backgroundColor: cat.tint, borderColor: on ? cat.color : 'transparent' }]}
                onPress={() => { setCategory(cat.key); if (!title.trim()) setTitle(cat.label); }}
              >
                <Icon size={17} color={cat.color} fill={cat.tint} strokeWidth={2.4} />
                <Text style={[s.catText, { color: cat.color }]}>{cat.label}</Text>
              </PressScale>
            );
          })}
        </ScrollView>

        {/* Título */}
        <TextInput
          style={s.field}
          placeholder="¿Qué hay que hacer?"
          placeholderTextColor={C.ink3}
          value={title}
          onChangeText={setTitle}
        />

        {/* Tiempo */}
        <Text style={s.sectionLabel}>Tiempo</Text>
        <View style={s.timeRow}>
          {TIMES.map((t) => {
            const on = min === t.min;
            return (
              <PressScale key={t.min} scaleTo={0.94} style={[s.timePill, on && s.timePillOn]} onPress={() => setMin(t.min)}>
                <Text style={[s.timeText, on && s.timeTextOn]}>{t.label}</Text>
              </PressScale>
            );
          })}
        </View>

        {/* Recurrencia — solo Regular */}
        {kind === 'regular' && (
          <>
            <Text style={s.sectionLabel}>Frecuencia</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recRow} keyboardShouldPersistTaps="handled">
              {RECURRENCE_OPTS.map((opt) => {
                const on = recRule === opt.key;
                return (
                  <PressScale
                    key={opt.key}
                    scaleTo={0.94}
                    style={[s.recPill, on && { backgroundColor: accent.hex, borderColor: accent.hex }]}
                    onPress={() => setRecRule(opt.key)}
                  >
                    <Text style={[s.recText, on && s.recTextOn]}>{opt.label}</Text>
                    <Text style={[s.recSub, on && { color: C.white + 'CC' }]}>{opt.short}</Text>
                  </PressScale>
                );
              })}
            </ScrollView>

            <View style={{ height: 14 }} />
            <RecurrenceScheduler
              showDays={recRule === 'weekly'}
              weekdays={weekdays}
              onToggleDay={toggleDay}
              slot={slot}
              onSlot={setSlot}
              color={accent.hex}
            />
          </>
        )}

        {/* Puntos */}
        <View style={s.ptsRow}>
          <Text style={[s.ptsBig, { color: accent.hex }]}>+ {pts} puntos</Text>
          <Text style={s.ptsRule}>5 min = 1 punto</Text>
        </View>

        {saveError ? <Text style={s.errorText}>{saveError}</Text> : null}
        <PressScale style={[s.save, { backgroundColor: accent.hex, shadowColor: accent.hex }]} onPress={handleAdd} disabled={saving}>
          {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveText}>Añadir tarea</Text>}
        </PressScale>
      </ScrollView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  sheetScroll: {},
  sheetBody: { padding: 22, paddingBottom: 40 },

  seg: { flexDirection: 'row', backgroundColor: C.paperDeep, borderRadius: R.pill, padding: 4, marginBottom: 22 },
  segItem: { flex: 1, paddingVertical: 11, borderRadius: R.pill, alignItems: 'center' },
  segItemOn: { backgroundColor: C.card, shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { fontSize: 15, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  segTextOn: { color: C.ink, fontWeight: '600' },

  sectionLabel: { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, letterSpacing: 0.2, marginBottom: 10, textTransform: 'uppercase' },

  catRow: { gap: 8, paddingBottom: 4, paddingRight: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5 },
  catText: { fontSize: 13, fontWeight: '600', fontFamily: FONT },

  field: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 16, fontSize: 17, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginTop: 18, marginBottom: 20 },

  timeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  timePill: { flex: 1, borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingVertical: 12, alignItems: 'center', backgroundColor: C.card },
  timePillOn: { backgroundColor: C.ink, borderColor: C.ink },
  timeText: { fontSize: 14, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  timeTextOn: { color: C.paper, fontWeight: '600' },

  recRow: { gap: 8, paddingBottom: 4, paddingRight: 8, marginBottom: 4 },
  recPill: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.card, alignItems: 'center', minWidth: 88 },
  recText: { fontSize: 13.5, fontWeight: '600', color: C.ink2, fontFamily: FONT },
  recTextOn: { color: C.white },
  recSub: { fontSize: 10.5, color: C.ink3, fontFamily: FONT, marginTop: 2 },

  ptsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 22 },
  ptsBig: { fontSize: 22, fontWeight: '600', color: C.brand, fontFamily: FONT, letterSpacing: -0.4 },
  ptsRule: { fontSize: 12, color: C.ink3, fontFamily: FONT },

  save: { borderRadius: R.pill, paddingVertical: 17, alignItems: 'center', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  saveText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
  errorText: { color: C.danger, fontSize: 13, fontFamily: FONT, marginBottom: 10, textAlign: 'center' },
});
