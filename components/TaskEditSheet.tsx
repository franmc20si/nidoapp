import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView,
  StyleSheet, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { CATS } from '@/constants/categories';
import { ptsFromMin } from '@/lib/taskTheme';
import { RECURRENCE_OPTS, RecurrenceRule } from '@/lib/recurrence';
import { useNidoStore } from '@/store/nidoStore';
import { supabase } from '@/lib/supabase';
import { getCatIcon } from '@/components/icons';
import { Task } from '@/types';
import { withTimeout } from '@/lib/withTimeout';
import PressScale from '@/components/PressScale';
import BottomSheet from '@/components/BottomSheet';

const TIMES = [
  { label: '15 min', min: 15 },
  { label: '30 min', min: 30 },
  { label: '1 h',    min: 60 },
  { label: '2 h',    min: 120 },
];

interface Props {
  task: Task | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}

export default function TaskEditSheet({ task, visible, onClose, onSaved, onDeleted }: Props) {
  const { accent } = useNidoStore();

  const [title,    setTitle]    = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [min,      setMin]      = useState(30);
  const [recRule,  setRecRule]  = useState<RecurrenceRule>('weekly');
  const [isRec,    setIsRec]    = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (task && visible) {
      setTitle(task.title);
      setCategory(task.category ?? null);
      setMin(task.duration_min ?? 30);
      setIsRec(task.is_recurring);
      setRecRule((task.recurrence_rule as RecurrenceRule) ?? 'weekly');
      setError('');
    }
  }, [task, visible]);

  const pts = ptsFromMin(min);

  const handleSave = async () => {
    if (!task || !title.trim()) return;
    setSaving(true);
    setError('');
    const patch = {
      title: title.trim(),
      category,
      duration_min: min,
      points: pts,
      is_recurring: isRec,
      recurrence_rule: isRec ? recRule : null,
    };
    try {
      // Sin .select().single(): no necesitamos releer la fila (ya tenemos patch)
      // y así evitamos el error PGRST116 si el SELECT post-update devuelve 0 filas.
      const { error: err } = await withTimeout(
        supabase.from('tasks').update(patch).eq('id', task.id)
      );
      if (err) throw err;
      onSaved({ ...task, ...patch });
      onClose();
    } catch (e: any) {
      setError(e?.message === 'TIMEOUT'
        ? 'La conexión tardó demasiado. Revisa tu red e inténtalo de nuevo.'
        : (e?.message ?? 'No se pudo guardar la tarea'));
    } finally {
      setSaving(false); // garantiza que el botón nunca se quede colgado
    }
  };

  const doDelete = async () => {
    if (!task) return;
    setDeleting(true);
    setError('');
    try {
      const { error: err } = await withTimeout(
        supabase.from('tasks').delete().eq('id', task.id)
      );
      if (err) throw err;
      onDeleted(task.id);
      onClose();
    } catch (e: any) {
      setError(e?.message === 'TIMEOUT'
        ? 'La conexión tardó demasiado. Inténtalo de nuevo.'
        : (e?.message ?? 'No se pudo eliminar la tarea'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDelete = () => {
    // RN Web no soporta los botones de Alert.alert (el onPress nunca dispara),
    // así que en web usamos el confirm nativo del navegador.
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm('¿Seguro que quieres eliminar esta tarea?')) {
        doDelete();
      }
      return;
    }
    Alert.alert('Eliminar tarea', '¿Seguro que quieres eliminar esta tarea?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: doDelete },
    ]);
  };

  if (!task) return null;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
          <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

            <View style={s.headerRow}>
              <Text style={s.sheetTitle}>Editar tarea</Text>
              <PressScale onPress={handleDelete} disabled={deleting} style={s.deleteBtn}>
                {deleting
                  ? <ActivityIndicator size="small" color={C.danger} />
                  : <Text style={s.deleteBtnText}>Eliminar</Text>}
              </PressScale>
            </View>

            {/* Tipo */}
            <View style={s.seg}>
              {(['regular', 'puntual'] as const).map((k) => {
                const on = (k === 'regular') === isRec;
                return (
                  <PressScale key={k} scaleTo={0.96} style={[s.segItem, on && s.segItemOn]} onPress={() => setIsRec(k === 'regular')}>
                    <Text style={[s.segText, on && s.segTextOn]}>{k === 'regular' ? 'Regular' : 'Puntual'}</Text>
                  </PressScale>
                );
              })}
            </View>

            {/* Categoría */}
            <Text style={s.label}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow} keyboardShouldPersistTaps="handled">
              {CATS.map((cat) => {
                const on = category === cat.key;
                const Icon = getCatIcon(cat.key);
                return (
                  <PressScale
                    key={cat.key}
                    scaleTo={0.94}
                    style={[s.catChip, { backgroundColor: cat.tint, borderColor: on ? cat.color : 'transparent' }]}
                    onPress={() => setCategory(on ? null : cat.key)}
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
              value={title}
              onChangeText={setTitle}
              placeholder="¿Qué hay que hacer?"
              placeholderTextColor={C.ink3}
            />

            {/* Tiempo */}
            <Text style={s.label}>Tiempo</Text>
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

            {/* Recurrencia */}
            {isRec && (
              <>
                <Text style={s.label}>Frecuencia</Text>
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
              </>
            )}

            {/* Puntos */}
            <View style={s.ptsRow}>
              <Text style={[s.ptsBig, { color: accent.hex }]}>+ {pts} puntos</Text>
              <Text style={s.ptsRule}>5 min = 1 punto</Text>
            </View>

            {error ? <Text style={s.error}>{error}</Text> : null}

            <PressScale
              style={[s.save, { backgroundColor: accent.hex }, (!title.trim() || saving) && s.saveDim]}
              onPress={handleSave}
              disabled={saving || !title.trim()}
            >
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveText}>Guardar cambios</Text>}
            </PressScale>

          </ScrollView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  scroll:     {},
  body:       { padding: 22, paddingBottom: 40 },

  headerRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle:    { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  deleteBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.danger },
  deleteBtnText: { color: C.danger, fontWeight: '600', fontSize: 13, fontFamily: FONT },

  seg:        { flexDirection: 'row', backgroundColor: C.paperDeep, borderRadius: R.pill, padding: 4, marginBottom: 20 },
  segItem:    { flex: 1, paddingVertical: 11, borderRadius: R.pill, alignItems: 'center' },
  segItemOn:  { backgroundColor: C.card, shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText:    { fontSize: 15, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  segTextOn:  { color: C.ink, fontWeight: '600' },

  label:      { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, letterSpacing: 0.2, marginBottom: 10, textTransform: 'uppercase' },

  catRow:     { gap: 8, paddingBottom: 4, paddingRight: 8 },
  catChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5 },
  catText:    { fontSize: 13, fontWeight: '600', fontFamily: FONT },

  field:      { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 16, fontSize: 17, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginTop: 18, marginBottom: 20 },

  timeRow:    { flexDirection: 'row', gap: 8, marginBottom: 20 },
  timePill:   { flex: 1, borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingVertical: 12, alignItems: 'center', backgroundColor: C.card },
  timePillOn: { backgroundColor: C.ink, borderColor: C.ink },
  timeText:   { fontSize: 14, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  timeTextOn: { color: C.paper, fontWeight: '600' },

  recRow:     { gap: 8, paddingBottom: 4, paddingRight: 8, marginBottom: 4 },
  recPill:    { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.card, alignItems: 'center', minWidth: 88 },
  recText:    { fontSize: 13.5, fontWeight: '600', color: C.ink2, fontFamily: FONT },
  recTextOn:  { color: C.white },
  recSub:     { fontSize: 10.5, color: C.ink3, fontFamily: FONT, marginTop: 2 },

  ptsRow:     { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 22 },
  ptsBig:     { fontSize: 22, fontWeight: '600', fontFamily: FONT, letterSpacing: -0.4 },
  ptsRule:    { fontSize: 12, color: C.ink3, fontFamily: FONT },

  error:      { color: C.danger, fontSize: 13, fontFamily: FONT, marginBottom: 10, textAlign: 'center' },
  save:       { borderRadius: R.pill, paddingVertical: 17, alignItems: 'center' },
  saveDim:    { opacity: 0.4 },
  saveText:   { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
