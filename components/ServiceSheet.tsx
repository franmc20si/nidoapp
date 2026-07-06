import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView,
  StyleSheet, ActivityIndicator, Platform, Alert,
} from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import BankSheet from '@/components/BankSheet';
import HouseSheet from '@/components/HouseSheet';
import PressScale from '@/components/PressScale';
import { C, R, FONT } from '@/constants/theme';
import { SERVICE_CATS, CYCLES } from '@/constants/services';
import { nidoColorByKey } from '@/constants/nidoColors';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { useBanksStore } from '@/store/banksStore';
import { useHousesStore } from '@/store/housesStore';
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
  const { banks, loadBanks } = useBanksStore();
  const { houses, loadHouses } = useHousesStore();

  const [name,     setName]     = useState('');
  const [category, setCategory] = useState<string | null>('luz');
  const [amount,   setAmount]   = useState('');
  const [cycle,    setCycle]    = useState('monthly');
  const [dateText, setDateText] = useState('');
  const [bankId,   setBankId]   = useState<string | null>(null);
  const [houseId,  setHouseId]  = useState<string | null>(null);
  const [bankSheetOpen, setBankSheetOpen] = useState(false);
  const [houseSheetOpen, setHouseSheetOpen] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  const isEdit = !!service;

  useEffect(() => {
    if (!visible) return;
    if (household) { loadBanks(household.id); loadHouses(household.id); }
    if (service) {
      setName(service.name);
      setCategory(service.category ?? 'otros');
      setAmount(String(service.amount ?? ''));
      setCycle(service.cycle ?? 'monthly');
      setDateText(isoToDisplay(service.next_payment));
      setBankId(service.bank_id ?? null);
      setHouseId(service.house_id ?? null);
    } else {
      setName(''); setCategory('luz'); setAmount(''); setCycle('monthly'); setDateText(''); setBankId(null); setHouseId(null);
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
      bank_id: bankId,
      house_id: houseId,
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
          bank_account: null,
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
    <>
    <BottomSheet visible={visible} onClose={onClose} sheetStyle={{ maxHeight: '90%' }}>
          <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

            <View style={s.headerRow}>
              <Text style={s.sheetTitle}>{isEdit ? 'Editar servicio' : 'Nuevo servicio'}</Text>
              {isEdit && (
                <PressScale onPress={handleDelete} disabled={deleting} style={s.deleteBtn}>
                  {deleting
                    ? <ActivityIndicator size="small" color="#c0392b" />
                    : <Text style={s.deleteBtnText}>Eliminar</Text>}
                </PressScale>
              )}
            </View>

            {/* Categoría */}
            <Text style={s.label}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow} keyboardShouldPersistTaps="handled">
              {SERVICE_CATS.map((cat) => {
                const on = category === cat.key;
                return (
                  <PressScale
                    key={cat.key}
                    scaleTo={0.94}
                    style={[s.catChip, { backgroundColor: cat.tint, borderColor: on ? cat.color : 'transparent' }]}
                    onPress={() => setCategory(cat.key)}
                  >
                    <Text style={s.catEmoji}>{cat.emoji}</Text>
                    <Text style={[s.catText, { color: cat.color }]}>{cat.label}</Text>
                  </PressScale>
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
                  <PressScale
                    key={c.key}
                    scaleTo={0.94}
                    style={[s.cyclePill, on && { backgroundColor: accent.hex, borderColor: accent.hex }]}
                    onPress={() => setCycle(c.key)}
                  >
                    <Text style={[s.cycleText, on && { color: C.white }]}>{c.label}</Text>
                  </PressScale>
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

            {/* Banco */}
            <Text style={s.label}>Banco</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bankRow} keyboardShouldPersistTaps="handled">
              {banks.map((b) => {
                const on = bankId === b.id;
                const col = nidoColorByKey(b.color);
                return (
                  <PressScale
                    key={b.id}
                    scaleTo={0.94}
                    style={[s.bankChip, on && { borderColor: col.hex, backgroundColor: col.wash }]}
                    onPress={() => setBankId(on ? null : b.id)}
                  >
                    <View style={[s.bankChipDot, { backgroundColor: col.hex }]} />
                    <Text style={[s.bankChipText, on && { color: col.hex }]}>{b.name}</Text>
                  </PressScale>
                );
              })}
              <PressScale scaleTo={0.94} style={s.bankAddChip} onPress={() => setBankSheetOpen(true)}>
                <Text style={s.bankAddText}>＋ Nuevo banco</Text>
              </PressScale>
            </ScrollView>

            {/* Casa */}
            <Text style={s.label}>Casa</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bankRow} keyboardShouldPersistTaps="handled">
              {houses.map((h) => {
                const on = houseId === h.id;
                const col = nidoColorByKey(h.color);
                return (
                  <PressScale
                    key={h.id}
                    scaleTo={0.94}
                    style={[s.bankChip, on && { borderColor: col.hex, backgroundColor: col.wash }]}
                    onPress={() => setHouseId(on ? null : h.id)}
                  >
                    <View style={[s.bankChipDot, { backgroundColor: col.hex }]} />
                    <Text style={[s.bankChipText, on && { color: col.hex }]}>{h.name}</Text>
                  </PressScale>
                );
              })}
              <PressScale scaleTo={0.94} style={s.bankAddChip} onPress={() => setHouseSheetOpen(true)}>
                <Text style={s.bankAddText}>＋ Nueva casa</Text>
              </PressScale>
            </ScrollView>

            {error ? <Text style={s.error}>{error}</Text> : null}

            <PressScale
              style={[s.save, { backgroundColor: accent.hex }, saving && s.saveDim]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveText}>{isEdit ? 'Guardar cambios' : 'Añadir servicio'}</Text>}
            </PressScale>

          </ScrollView>
    </BottomSheet>

    <BankSheet
      bank={null}
      visible={bankSheetOpen}
      onClose={() => setBankSheetOpen(false)}
      onSaved={(b) => { setBankId(b.id); setBankSheetOpen(false); }}
    />

    <HouseSheet
      house={null}
      visible={houseSheetOpen}
      onClose={() => setHouseSheetOpen(false)}
      onSaved={(h) => { setHouseId(h.id); setHouseSheetOpen(false); }}
    />
    </>
  );
}

const s = StyleSheet.create({
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

  bankRow:      { gap: 8, paddingBottom: 4, paddingRight: 8, marginBottom: 20 },
  bankChip:     { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.card },
  bankChipDot:  { width: 10, height: 10, borderRadius: 5 },
  bankChipText: { fontSize: 13.5, fontWeight: '600', color: C.ink2, fontFamily: FONT },
  bankAddChip:  { borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.paperSoft, borderStyle: 'dashed' },
  bankAddText:  { fontSize: 13.5, fontWeight: '600', color: C.ink3, fontFamily: FONT },

  error:      { color: '#c0392b', fontSize: 13, fontFamily: FONT, marginBottom: 10, textAlign: 'center' },
  save:       { borderRadius: R.pill, paddingVertical: 17, alignItems: 'center', marginTop: 4 },
  saveDim:    { opacity: 0.5 },
  saveText:   { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
