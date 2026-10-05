import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import PressScale from '@/components/PressScale';
import GroceryStoreSheet from '@/components/GroceryStoreSheet';
import { C, R, FONT } from '@/constants/theme';
import { nidoColorByKey } from '@/constants/nidoColors';
import { useGroceryStore, toDay, parseDay } from '@/store/groceryStore';
import { useAuthStore } from '@/store/authStore';
import { useNidoStore } from '@/store/nidoStore';
import { showToast } from '@/store/toastStore';
import { GrocerySpend } from '@/types';

// Añadir / editar una compra del súper: importe + tienda + fecha.
// Pensado para meterlo en tres toques a la salida de la tienda: el importe
// lleva el foco, la tienda viene preseleccionada (la última usada) y la
// fecha es "Hoy" por defecto.

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
// Atajos para el primer uso (sin tiendas todavía): un toque crea la tienda.
const SUGGESTED = [
  { name: 'Día',      color: 'teja' },
  { name: 'Lidl',     color: 'cielo' },
  { name: 'Frutería', color: 'bosque' },
];

function dayLabel(day: string, today: string, yesterday: string) {
  if (day === today) return 'Hoy';
  if (day === yesterday) return 'Ayer';
  const d = parseDay(day);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()}`;
}

/** "12,5" / "12.50" / "1.234,56" → número; NaN si no es válido. */
function parseAmount(raw: string): number {
  const t = raw.trim().replace(/\s|€/g, '');
  if (!t) return NaN;
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^\d+(\.\d{0,2})?$/.test(norm) ? Number(norm) : NaN;
}

interface Props {
  visible: boolean;
  spend: GrocerySpend | null; // null = nueva compra
  onClose: () => void;
}

export default function GrocerySpendSheet({ visible, spend: spendProp, onClose }: Props) {
  // Retiene la compra mientras el sheet está abierto: al cerrar, el padre pasa
  // `null` antes de que acabe la animación y el título saltaría a "Nuevo gasto".
  const snap = useRef(spendProp);
  if (visible) snap.current = spendProp;
  const spend = snap.current;
  const { household, user } = useAuthStore();
  const { accent } = useNidoStore();
  const { stores, spends, addSpend, updateSpend, deleteSpend, restoreSpend, addStore } = useGroceryStore();

  const [amount,  setAmount]  = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [day,     setDay]     = useState(toDay(new Date()));
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [storeSheet, setStoreSheet] = useState(false);
  const [creating,   setCreating]   = useState<string | null>(null);

  const isEdit = !!spend;
  const norm = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const pendingSuggested = stores.length < SUGGESTED.length
    ? SUGGESTED.filter((sg) => !stores.some((st) => norm(st.name) === norm(sg.name)))
    : [];
  const now = new Date();
  const today = toDay(now);
  const yesterday = toDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  // Últimos 7 días; si se edita una compra más antigua, su fecha va al final.
  const days = Array.from({ length: 7 }, (_, i) => toDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  if (!days.includes(day)) days.push(day);

  useEffect(() => {
    if (!visible) return;
    if (spend) {
      setAmount(money2(spend.amount));
      setStoreId(spend.store_id);
      setDay(spend.spent_on);
    } else {
      setAmount('');
      // La tienda de la última compra: casi siempre se repite.
      const last = spends.find((x) => x.store_id && stores.some((st) => st.id === x.store_id));
      setStoreId(last?.store_id ?? stores[0]?.id ?? null);
      setDay(today);
    }
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, spendProp]);

  const createSuggested = async (name: string, color: string) => {
    if (!household) return;
    setCreating(name);
    try {
      const res = await addStore(household.id, user?.id, { name, color });
      if (!res.ok || !res.store) { setError(res.error ?? 'No se pudo crear la tienda'); return; }
      setStoreId(res.store.id);
    } finally {
      setCreating(null);
    }
  };

  const handleSave = async () => {
    if (!household) return;
    const value = parseAmount(amount);
    if (!(value > 0)) { setError('Escribe el importe (ej. 42,50)'); return; }
    setSaving(true);
    setError('');
    const input = { amount: value, store_id: storeId, spent_on: day };
    try {
      const res = spend ? await updateSpend(spend.id, input) : await addSpend(household.id, user?.id, input);
      if (!res.ok) { setError(res.error ?? 'No se pudo guardar'); return; }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!spend) return;
    onClose();
    const res = await deleteSpend(spend.id);
    if (!res.ok || !res.spend) { showToast(res.error ?? 'No se pudo eliminar el gasto', 'error'); return; }
    const removed = res.spend;
    showToast('Gasto eliminado', 'info', { label: 'Deshacer', onPress: () => { restoreSpend(removed); } });
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>COMPRA DEL SÚPER</Text>
              <Text style={s.sheetTitle}>{isEdit ? 'Editar gasto' : 'Nuevo gasto'}</Text>
            </View>
            <TouchableOpacity style={s.iconBtn} onPress={onClose} accessibilityLabel="Cerrar">
              <Text style={s.iconBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Importe */}
          <View style={s.amountRow}>
            <TextInput
              style={s.amountInput}
              value={amount}
              onChangeText={(t) => { setAmount(t); if (error) setError(''); }}
              placeholder="0,00"
              placeholderTextColor={C.ink3}
              keyboardType="decimal-pad"
              inputMode="decimal"
              autoFocus={!isEdit}
              returnKeyType="done"
              onSubmitEditing={handleSave}
              accessibilityLabel="Importe en euros"
            />
            <Text style={s.amountEuro}>€</Text>
          </View>

          {/* Tienda */}
          <Text style={s.label}>Tienda</Text>
          {stores.length === 0 ? (
            <>
              <Text style={s.hint}>Toca para crear tus tiendas habituales:</Text>
              <View style={s.chips}>
                {SUGGESTED.map((sg) => (
                  <PressScale key={sg.name} scaleTo={0.94} style={s.chip} onPress={() => createSuggested(sg.name, sg.color)} disabled={!!creating}>
                    {creating === sg.name
                      ? <ActivityIndicator size="small" color={nidoColorByKey(sg.color).hex} />
                      : <View style={[s.dot, { backgroundColor: nidoColorByKey(sg.color).hex }]} />}
                    <Text style={s.chipText}>{sg.name}</Text>
                  </PressScale>
                ))}
                <PressScale scaleTo={0.94} style={[s.chip, s.chipGhost]} onPress={() => setStoreSheet(true)}>
                  <Text style={s.chipGhostText}>＋ Otra</Text>
                </PressScale>
              </View>
            </>
          ) : (
            <View style={s.chips}>
              {stores.map((st) => {
                const col = nidoColorByKey(st.color);
                const on = storeId === st.id;
                return (
                  <PressScale
                    key={st.id}
                    scaleTo={0.94}
                    style={[s.chip, on && { borderColor: col.hex, backgroundColor: col.wash }]}
                    onPress={() => setStoreId(st.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <View style={[s.dot, { backgroundColor: col.hex }]} />
                    <Text style={[s.chipText, on && s.chipTextOn]}>{st.name}</Text>
                  </PressScale>
                );
              })}
              {/* Sugerencias que aún no existen, mientras haya pocas tiendas */}
              {pendingSuggested.map((sg) => (
                <PressScale key={sg.name} scaleTo={0.94} style={[s.chip, s.chipGhost]} onPress={() => createSuggested(sg.name, sg.color)} disabled={!!creating} accessibilityLabel={`Crear tienda ${sg.name}`}>
                  {creating === sg.name
                    ? <ActivityIndicator size="small" color={nidoColorByKey(sg.color).hex} />
                    : <Text style={s.chipGhostText}>＋ {sg.name}</Text>}
                </PressScale>
              ))}
              <PressScale scaleTo={0.94} style={[s.chip, s.chipGhost]} onPress={() => setStoreSheet(true)} accessibilityLabel="Nueva tienda">
                <Text style={s.chipGhostText}>＋ Nueva</Text>
              </PressScale>
            </View>
          )}

          {/* Fecha */}
          <Text style={s.label}>Fecha</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {days.map((d) => {
              const on = d === day;
              return (
                <PressScale
                  key={d}
                  scaleTo={0.94}
                  style={[s.chip, on && { borderColor: C.ink, backgroundColor: C.ink }]}
                  onPress={() => setDay(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.chipText, on && { color: C.white, fontWeight: '600' }]}>{dayLabel(d, today, yesterday)}</Text>
                </PressScale>
              );
            })}
          </ScrollView>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <PressScale
            style={[s.save, { backgroundColor: accent.hex }, saving && s.saveDim]}
            onPress={handleSave}
            disabled={saving}
            scaleTo={0.97}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveText}>{isEdit ? 'Guardar cambios' : 'Añadir gasto'}</Text>}
          </PressScale>

          {isEdit && (
            <TouchableOpacity style={s.deleteLink} onPress={handleDelete}>
              <Text style={s.deleteLinkText}>Eliminar gasto</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </BottomSheet>

      <GroceryStoreSheet
        store={null}
        visible={storeSheet}
        onClose={() => setStoreSheet(false)}
        onSaved={(st) => setStoreId(st.id)}
      />
    </>
  );
}

const money2 = (n: number) => n.toFixed(2).replace('.', ',');

const s = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingTop: 4 },

  headerRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  eyebrow:    { fontSize: 11, letterSpacing: 1.6, color: C.ink3, fontFamily: FONT, fontWeight: '600' },
  sheetTitle: { fontSize: 22, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4, marginTop: 2 },
  iconBtn:     { width: 36, height: 36, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  iconBtnText: { fontSize: 14, color: C.ink2 },

  amountRow:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, backgroundColor: C.card, paddingHorizontal: 18, marginBottom: 22 },
  amountInput: { flex: 1, fontSize: 34, fontWeight: '600', color: C.ink, fontFamily: FONT, paddingVertical: 12, letterSpacing: -0.8, minWidth: 0 },
  amountEuro:  { fontSize: 26, fontWeight: '500', color: C.ink3, fontFamily: FONT, marginLeft: 8 },

  label: { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, letterSpacing: 0.2, marginBottom: 10, textTransform: 'uppercase' },
  hint:  { fontSize: 13, color: C.ink3, fontFamily: FONT, marginBottom: 10 },

  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  chipText:   { fontSize: 14, color: C.ink2, fontFamily: FONT },
  chipTextOn: { color: C.ink, fontWeight: '600' },
  chipGhost:  { borderStyle: 'dashed', backgroundColor: 'transparent' },
  chipGhostText: { fontSize: 14, color: C.ink2, fontFamily: FONT },
  dot:        { width: 10, height: 10, borderRadius: 5 },

  error:    { color: C.danger, fontSize: 13, fontFamily: FONT, marginBottom: 10, textAlign: 'center' },
  save:     { borderRadius: R.pill, paddingVertical: 17, alignItems: 'center' },
  saveDim:  { opacity: 0.5 },
  saveText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
  deleteLink:     { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  deleteLinkText: { color: C.ink3, fontFamily: FONT, fontSize: 14 },
});
