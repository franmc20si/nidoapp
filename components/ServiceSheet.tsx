import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { SERVICE_CATS, CYCLES } from '@/constants/services';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { Subscription } from '@/types';
import { withTimeout } from '@/lib/withTimeout';

// ── Fechas: ISO (yyyy-mm-dd) ⇆ texto (DD/MM/AAAA) ──────────────────────────
function isoToDisplay(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}
function displayToIso(text: string): string | null {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = +dd, month = +mm;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}
// Inserta las barras a medida que se escribe (8 dígitos máx).
function maskDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
}

interface Props {
  service: Subscription | null; // null = crear
  visible: boolean;
  onClose: () => void;
  onSaved: (service: Subscription) => void;
  onDeleted: (id: string) => void;
}

export default function ServiceSheet({ service, visible, onClose, onSaved, onDeleted }: Props) {
  const { accent } = useNidoStore();
  const { household, user } = useAuthStore();

  const [name,     setName]     = useState('');
  const [category, setCategory] = useState<string | null>('luz');
  const [amount,   setAmount]   = useState('');
  const [cycle,    setCycle]    = useState('monthly');
  const [dateText, setDateText] = useState('');
  const [bank,     setBank]     = useState('');
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  const isEdit = !!service;

  useEffect(() => {
    if (!visible) return;
    if (service) {
      setName(service.name);
      setCategory(service.category ?? 'otros');
      setAmount(String(service.amount ?? ''));
      setCycle(service.cycle ?? 'monthly');
      setDateText(isoToDisplay(service.next_payment));
      setBank(service.bank_account ?? '');
    } else {
      setName(''); setCategory('luz'); setAmount(''); setCycle('monthly'); setDateText(''); setBank('');
    }
    setError('');
  }, [service, visible]);

  const handleSave = async () => {
    if (!household) return;
    const amountNum = parseFloat(amount.replace(',', '.'));
    if (!name.trim())      { setError('Ponle un nombre al servicio'); return; }
    if (isNaN(amountNum) || amountNum <= 0) { setError('Introduce un importe válido'); return; }
    const iso = dateText.trim() ? displayToIso(dateText.trim()) : null;
    if (dateText.trim() && !iso) { setError('La fecha debe tener el formato DD/MM/AAAA'); return; }

    setSaving(true);
    setError('');
    const patch = {
      name: name.trim(),
      category,
      amount: amountNum,
      cycle,
      next_payment: iso,
      bank_account: bank.trim() || null,
    };
    try {
      if (service) {
        const { error: err } = await withTimeout(
          supabase.from('subscriptions').update(patch).eq('id', service.id)
        );
        if (err) throw err;
        onSaved({ ...service, ...patch });
      } else {
        const newId = crypto.randomUUID();
        const { error: err } = await withTimeout(
          supabase.from('subscriptions')
            .insert({ id: newId, ...patch, household_id: household.id, created_by: user?.id })
        );
        if (err) throw err;
        onSaved({
          id: newId,
          household_id: household.id,
          created_by: user?.id ?? null,
          created_at: new Date().toISOString(),
          ...patch,
        } as Subscription);
      }
      onClose();
    } catch (e: any) {
      setError(e?.message === 'TIMEOUT'
        ? 'La conexión tardó demasiado. Inténtalo de nuevo.'
        : (e?.message ?? 'No se pudo guardar el servicio'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!service) return;
    setDeleting(true);
    setError('');
    try {
      const { error: err } = await withTimeout(
        supabase.from('subscriptions').delete().eq('id', service.id)
      );
      if (err) throw err;
      onDeleted(service.id);
      onClose();
    } catch (e: any) {
      setError(e?.message === 'TIMEOUT'
        ? 'La conexión tardó demasiado. Inténtalo de nuevo.'
        : (e?.message ?? 'No se pudo eliminar el servicio'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDelete = () => {
    // RN Web no soporta los botones de Alert.alert → en web usamos confirm().
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm('¿Eliminar este servicio?')) doDelete();
      return;
    }
    Alert.alert('Eliminar servicio', '¿Seguro que quieres eliminar este servicio?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: doDelete },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <View style={s.grab} />
          <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

            <View style={s.headerRow}>
              <Text style={s.sheetTitle}>{isEdit ? 'Editar servicio' : 'Nuevo servicio'}</Text>
              {isEdit && (
                <TouchableOpacity onPress={handleDelete} disabled={deleting} style={s.deleteBtn}>
                  {deleting
                    ? <ActivityIndicator size="small" color="#c0392b" />
                    : <Text style={s.deleteBtnText}>Eliminar</Text>}
                </TouchableOpacity>
              )}
            </View>

            {/* Categoría */}
            <Text style={s.label}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow} keyboardShouldPersistTaps="handled">
              {SERVICE_CATS.map((cat) => {
                const on = category === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[s.catChip, { backgroundColor: cat.tint, borderColor: on ? cat.color : 'transparent' }]}
                    onPress={() => setCategory(cat.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={s.catEmoji}>{cat.emoji}</Text>
                    <Text style={[s.catText, { color: cat.color }]}>{cat.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Nombre */}
            <TextInput
              style={s.field}
              value={name}
              onChangeText={setName}
              placeholder="Nombre (ej. Iberdrola, Netflix…)"
              placeholderTextColor={C.ink3}
            />

            {/* Importe */}
            <Text style={s.label}>Importe</Text>
            <View style={s.amountWrap}>
              <TextInput
                style={s.amountField}
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ''))}
                placeholder="0,00"
                placeholderTextColor={C.ink3}
                keyboardType="decimal-pad"
              />
              <Text style={s.amountCur}>€</Text>
            </View>

            {/* Ciclo */}
            <Text style={s.label}>Ciclo de pago</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cycleRow} keyboardShouldPersistTaps="handled">
              {CYCLES.map((c) => {
                const on = cycle === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[s.cyclePill, on && { backgroundColor: accent.hex, borderColor: accent.hex }]}
                    onPress={() => setCycle(c.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.cycleText, on && { color: C.white }]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Próximo pago */}
            <Text style={s.label}>Próximo pago</Text>
            <TextInput
              style={s.field}
              value={dateText}
              onChangeText={(t) => setDateText(maskDate(t))}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.ink3}
              keyboardType="number-pad"
              maxLength={10}
            />

            {/* Cuenta bancaria */}
            <Text style={s.label}>Cuenta de banco</Text>
            <TextInput
              style={s.field}
              value={bank}
              onChangeText={setBank}
              placeholder="Desde qué cuenta se paga (ej. BBVA ··1234)"
              placeholderTextColor={C.ink3}
            />

            {error ? <Text style={s.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.save, { backgroundColor: accent.hex }, saving && s.saveDim]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveText}>{isEdit ? 'Guardar cambios' : 'Añadir servicio'}</Text>}
            </TouchableOpacity>

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim:      { flex: 1, backgroundColor: 'rgba(33,28,23,0.42)' },
  sheet:      { backgroundColor: C.paper, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '90%' },
  grab:       { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginTop: 12 },
  scroll:     {},
  body:       { padding: 22, paddingBottom: 40 },

  headerRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle:    { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  deleteBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1.5, borderColor: '#c0392b' },
  deleteBtnText: { color: '#c0392b', fontWeight: '600', fontSize: 13, fontFamily: FONT },

  label:      { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, letterSpacing: 0.2, marginBottom: 10, textTransform: 'uppercase' },

  catRow:     { gap: 8, paddingBottom: 4, paddingRight: 8 },
  catChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5 },
  catEmoji:   { fontSize: 15 },
  catText:    { fontSize: 13, fontWeight: '600', fontFamily: FONT },

  field:      { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 16, fontSize: 17, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginTop: 14, marginBottom: 20 },

  amountWrap:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, backgroundColor: C.card, paddingHorizontal: 18, marginBottom: 20 },
  amountField: { flex: 1, paddingVertical: 16, fontSize: 22, fontWeight: '600', color: C.ink, fontFamily: FONT },
  amountCur:   { fontSize: 20, fontWeight: '600', color: C.ink3, fontFamily: FONT },

  cycleRow:   { gap: 8, paddingBottom: 4, paddingRight: 8, marginBottom: 20 },
  cyclePill:  { borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.card },
  cycleText:  { fontSize: 13.5, fontWeight: '600', color: C.ink2, fontFamily: FONT },

  error:      { color: '#c0392b', fontSize: 13, fontFamily: FONT, marginBottom: 10, textAlign: 'center' },
  save:       { borderRadius: R.pill, paddingVertical: 17, alignItems: 'center', marginTop: 4 },
  saveDim:    { opacity: 0.5 },
  saveText:   { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
