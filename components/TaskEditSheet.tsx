import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { CATS } from '@/constants/categories';
import { ptsFromMin } from '@/lib/taskTheme';
import { RECURRENCE_OPTS, RecurrenceRule } from '@/lib/recurrence';
import { useNidoStore } from '@/store/nidoStore';
import { supabase } from '@/lib/supabase';
import { getCatIcon } from '@/components/icons';
import { Task } from '@/types';

const TIMES = [
  { label: '15 min', min: 15 },
  { label: '30 min', min: 30 },
  { label: '1 h',    min: 60 },
  { label: '2 h',    min: 120 },
];

// Evita que una petición colgada deje el botón girando para siempre.
// supabase-js no lleva timeout propio; sin esto, un fetch o un lock de auth
// bloqueado en web haría que el await no se resuelva nunca.
function withTimeout<T>(p: PromiseLike<T>, ms = 12000): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}

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

  const handleDelete = () => {
    Alert.alert('Eliminar tarea', '¿Seguro que quieres eliminar esta tarea?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
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
        },
      },
    ]);
  };

  if (!task) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <View style={s.grab} />
          <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

            <View style={s.headerRow}>
              <Text style={s.sheetTitle}>Editar tarea</Text>
              <TouchableOpacity onPress={handleDelete} disabled={deleting} style={s.deleteBtn}>
                {deleting
                  ? <ActivityIndicator size="small" color="#c0392b" />
                  : <Text style={s.deleteBtnText}>Eliminar</Text>}
              </TouchableOpacity>
            </View>

            {/* Tipo */}
            <View style={s.seg}>
              {(['regular', 'puntual'] as const).map((k) => {
                const on = (k === 'regular') === isRec;
                return (
                  <TouchableOpacity key={k} style={[s.segItem, on && s.segItemOn]} onPress={() => setIsRec(k === 'regular')} activeOpacity={0.8}>
                    <Text style={[s.segText, on && s.segTextOn]}>{k === 'regular' ? 'Regular' : 'Puntual'}</Text>
                  </TouchableOpacity>
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
                  <TouchableOpacity
                    key={cat.key}
                    style={[s.catChip, { backgroundColor: cat.tint, borderColor: on ? cat.color : 'transparent' }]}
                    onPress={() => setCategory(on ? null : cat.key)}
                    activeOpacity={0.85}
                  >
                    <Icon size={17} color={cat.color} fill={cat.tint} strokeWidth={2.4} />
                    <Text style={[s.catText, { color: cat.color }]}>{cat.label}</Text>
                  </TouchableOpacity>
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
                  <TouchableOpacity key={t.min} style={[s.timePill, on && s.timePillOn]} onPress={() => setMin(t.min)} activeOpacity={0.8}>
                    <Text style={[s.timeText, on && s.timeTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
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
                      <TouchableOpacity
                        key={opt.key}
                        style={[s.recPill, on && { backgroundColor: accent.hex, borderColor: accent.hex }]}
                        onPress={() => setRecRule(opt.key)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.recText, on && s.recTextOn]}>{opt.label}</Text>
                        <Text style={[s.recSub, on && { color: C.white + 'CC' }]}>{opt.short}</Text>
                      </TouchableOpacity>
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

            <TouchableOpacity
              style={[s.save, { backgroundColor: accent.hex }, (!title.trim() || saving) && s.saveDim]}
              onPress={handleSave}
              disabled={saving || !title.trim()}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveText}>Guardar cambios</Text>}
            </TouchableOpacity>

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim:      { flex: 1, backgroundColor: 'rgba(33,28,23,0.42)' },
  sheet:      { backgroundColor: C.paper, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '88%' },
  grab:       { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginTop: 12 },
  scroll:     {},
  body:       { padding: 22, paddingBottom: 40 },

  headerRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle:    { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  deleteBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1.5, borderColor: '#c0392b' },
  deleteBtnText: { color: '#c0392b', fontWeight: '600', fontSize: 13, fontFamily: FONT },

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

  error:      { color: '#c0392b', fontSize: 13, fontFamily: FONT, marginBottom: 10, textAlign: 'center' },
  save:       { borderRadius: R.pill, paddingVertical: 17, alignItems: 'center' },
  saveDim:    { opacity: 0.4 },
  saveText:   { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
