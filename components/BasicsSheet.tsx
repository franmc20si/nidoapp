/**
 * BasicsSheet — gestión de los "básicos semanales" del hogar.
 *
 * Lista PLANTILLA de productos habituales (leche, pan, huevos…) que se añaden de
 * una vez a la lista de la compra de la semana desde ShoppingListSheet.
 * Se añaden igual que un producto manual: categoría + nombre + cantidad.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, TextInput, useWindowDimensions,
} from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useBasicsStore } from '@/store/basicsStore';
import { GROCERY_CATS } from '@/components/ShoppingListSheet';
import { GroceryIcon } from '@/components/icons';
import { showToast } from '@/store/toastStore';
import BottomSheet from '@/components/BottomSheet';
import PressScale from '@/components/PressScale';

interface Props {
  visible: boolean;
  onClose: () => void;
  accent: { hex: string; wash: string };
}

export default function BasicsSheet({ visible, onClose, accent }: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const { household, user } = useAuthStore();
  const { basics, loadBasics, addBasic, deleteBasic } = useBasicsStore();

  const [addCat,    setAddCat]    = useState('otros');
  const [addName,   setAddName]   = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [showAdd,   setShowAdd]   = useState(false);

  useEffect(() => { if (visible && household?.id) loadBasics(household.id); }, [visible, household?.id]);

  const add = async () => {
    if (!addName.trim() || !household?.id) return;
    const { ok } = await addBasic(household.id, user?.id, {
      name: addName.trim(),
      amount: addAmount.trim() || undefined,
      category: addCat,
    });
    if (!ok) { showToast('No se pudo guardar el básico', 'error'); return; }
    setAddName(''); setAddAmount(''); setShowAdd(false);
  };

  const remove = async (id: string) => {
    const { ok } = await deleteBasic(id);
    if (!ok) showToast('No se pudo eliminar el básico', 'error');
  };

  // Agrupados por orden de supermercado, como la lista de la compra.
  const grouped = GROCERY_CATS.map(cat => ({
    cat,
    items: basics.filter(b => b.category === cat.key),
  })).filter(g => g.items.length > 0);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View style={sl.header}>
        <View style={{ flex: 1 }}>
          <Text style={sl.eyebrow}>Plantilla · {basics.length} {basics.length === 1 ? 'básico' : 'básicos'}</Text>
          <Text style={sl.title}>Básicos semanales</Text>
        </View>
        <TouchableOpacity style={sl.closeBtn} onPress={onClose}>
          <Text style={sl.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ maxHeight: screenHeight * 0.65 }} contentContainerStyle={sl.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {basics.length === 0 && (
          <View style={sl.empty}>
            <View style={sl.emptyIcon}><GroceryIcon catKey="otros" size={44} color={C.ink3} strokeWidth={1.6} /></View>
            <Text style={sl.emptyTitle}>Sin básicos todavía</Text>
            <Text style={sl.emptySub}>
              Añade los productos que compras cada semana{'\n'}(leche, pan, huevos…).{'\n\n'}
              Luego los metes de una vez en la lista de la compra 👇
            </Text>
          </View>
        )}

        {grouped.map(({ cat, items }) => (
          <View key={cat.key} style={sl.section}>
            <View style={sl.sectionHead}>
              <GroceryIcon catKey={cat.key} size={17} color={C.ink3} />
              <Text style={sl.sectionLabel}>{cat.label}</Text>
              <Text style={sl.sectionCount}>{items.length}</Text>
            </View>
            {items.map(item => (
              <View key={item.id} style={sl.item}>
                <View style={sl.itemMain}>
                  <Text style={sl.itemName}>{item.name}</Text>
                  {item.amount && <Text style={sl.itemAmount}>{item.amount}</Text>}
                </View>
                <TouchableOpacity style={sl.deleteBtn} onPress={() => remove(item.id)}>
                  <Text style={sl.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}

        {/* Add form */}
        {showAdd ? (
          <View style={sl.addForm}>
            <Text style={sl.addFormTitle}>Añadir básico</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sl.catPills}>
              {GROCERY_CATS.map(c => (
                <PressScale
                  key={c.key}
                  scaleTo={0.94}
                  style={[sl.catPill, addCat === c.key && { backgroundColor: accent.hex, borderColor: accent.hex }]}
                  onPress={() => setAddCat(c.key)}
                >
                  <GroceryIcon catKey={c.key} size={14} color={addCat === c.key ? C.white : C.ink2} />
                  <Text style={[sl.catPillText, addCat === c.key && { color: C.white }]}>
                    {c.label.split(' ')[0]}
                  </Text>
                </PressScale>
              ))}
            </ScrollView>

            <TextInput
              style={sl.addInput}
              placeholder="Nombre del producto"
              placeholderTextColor={C.ink3}
              value={addName}
              onChangeText={setAddName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={add}
            />
            <View style={sl.addRow}>
              <TextInput
                style={[sl.addInput, { flex: 1, marginBottom: 0 }]}
                placeholder="Cantidad (ej: 1L)"
                placeholderTextColor={C.ink3}
                value={addAmount}
                onChangeText={setAddAmount}
                returnKeyType="done"
                onSubmitEditing={add}
              />
              <PressScale
                style={[sl.addBtn, { backgroundColor: accent.hex }, !addName.trim() && { opacity: 0.4 }]}
                onPress={add}
                disabled={!addName.trim()}
              >
                <Text style={sl.addBtnText}>Añadir</Text>
              </PressScale>
            </View>
            <TouchableOpacity onPress={() => { setShowAdd(false); setAddName(''); setAddAmount(''); }}>
              <Text style={sl.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <PressScale style={[sl.addProductBtn, { borderColor: accent.hex + '60' }]} onPress={() => setShowAdd(true)}>
            <Text style={[sl.addProductBtnText, { color: accent.hex }]}>+ Añadir básico</Text>
          </PressScale>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </BottomSheet>
  );
}

// Estilos alineados con ShoppingListSheet para que ambas listas se lean igual.
const sl = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 8 },
  eyebrow:     { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT, fontWeight: '500', marginBottom: 2 },
  title:       { fontSize: 22, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:{ fontSize: 13, color: C.ink2 },

  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },

  empty:      { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:  { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '500', color: C.ink, fontFamily: FONT },
  emptySub:   { fontSize: 13, color: C.ink3, fontFamily: FONT, marginTop: 4, textAlign: 'center', lineHeight: 19 },

  section:     { marginBottom: 20 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionEmoji:{ fontSize: 16 },
  sectionLabel:{ flex: 1, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT },
  sectionCount:{ fontSize: 11, color: C.ink3, fontFamily: FONT },

  item:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line },
  itemMain: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '500', color: C.ink, fontFamily: FONT },
  itemAmount: { fontSize: 12, color: C.ink3, fontFamily: FONT, marginTop: 1 },
  deleteBtn:  { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 12, color: C.ink3 },

  addForm:       { backgroundColor: C.card, borderRadius: R.l, borderWidth: 1.5, borderColor: C.line, padding: 16, marginBottom: 12 },
  addFormTitle:  { fontSize: 15, fontWeight: '500', color: C.ink, fontFamily: FONT, marginBottom: 12 },
  catPills:      { gap: 7, paddingBottom: 14 },
  catPill:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: C.paper },
  catPillEmoji:  { fontSize: 13 },
  catPillText:   { fontSize: 12, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  addInput:      { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: C.ink, backgroundColor: C.paper, fontFamily: FONT, marginBottom: 10 },
  addRow:        { flexDirection: 'row', gap: 10, alignItems: 'center' },
  addBtn:        { borderRadius: R.pill, paddingHorizontal: 18, paddingVertical: 11 },
  addBtnText:    { color: C.white, fontWeight: '600', fontFamily: FONT, fontSize: 14 },
  cancelText:    { textAlign: 'center', color: C.ink3, fontFamily: FONT, fontSize: 13, paddingVertical: 10 },

  addProductBtn:    { borderWidth: 1.5, borderRadius: R.pill, paddingVertical: 13, alignItems: 'center', marginVertical: 8 },
  addProductBtnText:{ fontSize: 14, fontWeight: '600', fontFamily: FONT },
});
