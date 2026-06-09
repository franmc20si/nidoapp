/**
 * ShoppingListSheet — lista de la compra semanal
 *
 * Combina automáticamente los ingredientes de los platos del menú de la semana
 * con artículos añadidos manualmente, agrupados por orden de supermercado.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  StyleSheet, TextInput, Animated, useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, R, FONT } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

function genId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Supermarket categories (typical Spanish order) ──────────────────────────
export interface GroceryCat { key: string; label: string; emoji: string; }
export const GROCERY_CATS: GroceryCat[] = [
  { key: 'frutas',      label: 'Frutas y verduras',        emoji: '🥦' },
  { key: 'carnes',      label: 'Carnes y aves',            emoji: '🥩' },
  { key: 'pescado',     label: 'Pescado y marisco',        emoji: '🐟' },
  { key: 'lacteos',     label: 'Lácteos y huevos',         emoji: '🥛' },
  { key: 'panaderia',   label: 'Panadería',                emoji: '🍞' },
  { key: 'pasta',       label: 'Pasta, arroz y legumbres', emoji: '🍝' },
  { key: 'conservas',   label: 'Conservas y enlatados',    emoji: '🥫' },
  { key: 'aceites',     label: 'Aceites y condimentos',    emoji: '🫙' },
  { key: 'congelados',  label: 'Congelados',               emoji: '🧊' },
  { key: 'limpieza',    label: 'Limpieza e higiene',       emoji: '🧼' },
  { key: 'otros',       label: 'Otros',                    emoji: '🛒' },
];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Ingredient {
  id: string;
  name: string;
  amount?: string;
  category: string; // GroceryCat key
}

export interface ManualItem {
  id: string;
  name: string;
  amount?: string;
  category: string;
}

interface ShoppingItem {
  id: string;
  name: string;
  amount?: string;
  category: string;
  checked: boolean;
  source: 'recipe' | 'manual';
  recipeColor?: string;
  recipeName?: string;
}

// ─── AsyncStorage helpers ─────────────────────────────────────────────────────
const keyChecked = (wk: string) => `nido_shop_checked_${wk}`;
const keyManual  = (wk: string) => `nido_shop_manual_${wk}`;

async function loadChecked(wk: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(keyChecked(wk));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
async function saveChecked(wk: string, ids: Set<string>) {
  try { await AsyncStorage.setItem(keyChecked(wk), JSON.stringify([...ids])); } catch {}
}
async function loadManual(wk: string): Promise<ManualItem[]> {
  try {
    const raw = await AsyncStorage.getItem(keyManual(wk));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
async function saveManual(wk: string, items: ManualItem[]) {
  try { await AsyncStorage.setItem(keyManual(wk), JSON.stringify(items)); } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
  weekKey: string;         // e.g. "2026-W22"
  weekLabel: string;       // e.g. "Semana 22"
  recipeItems: { name: string; amount?: string; category: string; recipeColor: string; recipeName: string }[];
  accent: { hex: string; wash: string };
  householdId: string;
}

export default function ShoppingListSheet({ visible, onClose, weekKey, weekLabel, recipeItems, accent, householdId }: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const [checked,     setChecked]     = useState<Set<string>>(new Set());
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [addCat,      setAddCat]      = useState('otros');
  const [addName,     setAddName]     = useState('');
  const [addAmount,   setAddAmount]   = useState('');
  const [showAdd,     setShowAdd]     = useState(false);
  const [catFilter,   setCatFilter]   = useState<string | null>(null);
  const listIdRef = useRef<string | null>(null);

  // Load state when opening — manual items from Supabase, recipe checked from AsyncStorage
  useEffect(() => {
    if (!visible || !householdId) return;
    (async () => {
      const recipeChecked = await loadChecked(weekKey);
      setChecked(recipeChecked);

      // Get or create the shopping_list record for this week
      const { data: existing } = await supabase
        .from('shopping_lists')
        .select('id')
        .eq('household_id', householdId)
        .eq('week_key', weekKey)
        .maybeSingle();

      let lid: string | null = existing?.id ?? null;
      if (!lid) {
        const { data: created } = await supabase
          .from('shopping_lists')
          .insert({ household_id: householdId, week_key: weekKey })
          .select('id')
          .single();
        lid = created?.id ?? null;
      }
      listIdRef.current = lid;

      if (!lid) return;

      const { data: items } = await supabase
        .from('shopping_items')
        .select('id, name, unit, category, is_checked')
        .eq('list_id', lid);

      if (items?.length) {
        setManualItems(items.map(i => ({
          id: i.id,
          name: i.name,
          amount: i.unit ?? undefined,
          category: i.category ?? 'otros',
        })));
        // Merge Supabase checked state for manual items
        setChecked(prev => {
          const next = new Set(prev);
          items.forEach(i => { if (i.is_checked) next.add(i.id); });
          return next;
        });
      } else {
        // One-time migration from AsyncStorage per week
        const migKey = `nido_shop_migrated_${weekKey}`;
        const done = await AsyncStorage.getItem(migKey);
        if (!done) {
          const legacy = await loadManual(weekKey);
          if (legacy.length > 0) {
            await supabase.from('shopping_items').upsert(
              legacy.map(m => ({
                id: m.id,
                list_id: lid,
                name: m.name,
                unit: m.amount ?? null,
                category: m.category,
                is_checked: recipeChecked.has(m.id),
              }))
            );
            setManualItems(legacy);
          }
          await AsyncStorage.setItem(migKey, '1');
        }
      }
    })();
  }, [visible, weekKey, householdId]);

  // Toggle checked: recipe items → AsyncStorage, manual items → Supabase
  const toggleChecked = useCallback((id: string) => {
    setChecked(prev => {
      const willBeChecked = !prev.has(id);
      const next = new Set(prev);
      if (willBeChecked) next.add(id); else next.delete(id);
      if (id.startsWith('ri-')) {
        saveChecked(weekKey, next);
      } else if (listIdRef.current) {
        supabase.from('shopping_items').update({ is_checked: willBeChecked }).eq('id', id);
      }
      return next;
    });
  }, [weekKey]);

  // Add manual item — sync to Supabase
  const addManual = async () => {
    if (!addName.trim()) return;
    const id = genId();
    const item: ManualItem = { id, name: addName.trim(), amount: addAmount.trim() || undefined, category: addCat };
    setManualItems(prev => [...prev, item]);
    setAddName(''); setAddAmount(''); setShowAdd(false);
    if (listIdRef.current) {
      await supabase.from('shopping_items').insert({
        id,
        list_id: listIdRef.current,
        name: item.name,
        unit: item.amount ?? null,
        category: item.category,
        is_checked: false,
      });
    }
  };

  // Remove manual item — sync to Supabase
  const removeManual = async (id: string) => {
    setManualItems(prev => prev.filter(m => m.id !== id));
    setChecked(prev => { const next = new Set(prev); next.delete(id); saveChecked(weekKey, next); return next; });
    if (listIdRef.current) {
      await supabase.from('shopping_items').delete().eq('id', id);
    }
  };

  // Build merged item list
  const allItems: ShoppingItem[] = [
    ...recipeItems.map((r) => ({
      id: `ri-${r.recipeName}-${r.name}`,
      name: r.name,
      amount: r.amount,
      category: r.category,
      checked: checked.has(`ri-${r.recipeName}-${r.name}`),
      source: 'recipe' as const,
      recipeColor: r.recipeColor,
      recipeName: r.recipeName,
    })),
    ...manualItems.map(m => ({
      id: m.id,
      name: m.name,
      amount: m.amount,
      category: m.category,
      checked: checked.has(m.id),
      source: 'manual' as const,
    })),
  ];

  // Group by category (supermarket order)
  const grouped = GROCERY_CATS.map(cat => ({
    cat,
    items: allItems.filter(i => i.category === cat.key),
  })).filter(g => g.items.length > 0);

  const total   = allItems.length;
  const doneQty = allItems.filter(i => i.checked).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={sl.scrim} activeOpacity={1} onPress={onClose} />
      <View style={sl.sheet}>
        <View style={sl.grab} />

        {/* Header */}
        <View style={sl.header}>
          <View style={{ flex: 1 }}>
            <Text style={sl.eyebrow}>{weekLabel}</Text>
            <Text style={sl.title}>Lista de la compra</Text>
          </View>
          <View style={sl.headerRight}>
            <Text style={[sl.progress, { color: accent.hex }]}>{doneQty}/{total}</Text>
            <TouchableOpacity style={sl.closeBtn} onPress={onClose}>
              <Text style={sl.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress bar */}
        <View style={sl.progressBar}>
          <View style={[sl.progressFill, { width: `${total ? (doneQty/total)*100 : 0}%` as any, backgroundColor: accent.hex }]} />
        </View>

        <ScrollView style={[sl.scroll, { maxHeight: screenHeight * 0.65 }]} contentContainerStyle={sl.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {allItems.length === 0 && (
            <View style={sl.empty}>
              <Text style={sl.emptyIcon}>🛒</Text>
              <Text style={sl.emptyTitle}>Lista vacía</Text>
              <Text style={sl.emptySub}>
                Para ver ingredientes:{'\n'}
                1. Edita un plato y añade ingredientes{'\n'}
                2. Asígnalo al menú de <Text style={{ fontWeight: '600' }}>{weekLabel}</Text>{'\n\n'}
                O añade productos manualmente 👇
              </Text>
            </View>
          )}

          {/* Recipe items exist but some recipes have no ingredients */}
          {recipeItems.length === 0 && manualItems.length === 0 && null}

          {/* Grouped sections */}
          {grouped.map(({ cat, items }) => (
            <View key={cat.key} style={sl.section}>
              <View style={sl.sectionHead}>
                <Text style={sl.sectionEmoji}>{cat.emoji}</Text>
                <Text style={sl.sectionLabel}>{cat.label}</Text>
                <Text style={sl.sectionCount}>{items.filter(i => i.checked).length}/{items.length}</Text>
              </View>
              {items.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[sl.item, item.checked && sl.itemDone]}
                  onPress={() => toggleChecked(item.id)}
                  activeOpacity={0.7}
                >
                  {/* Checkbox */}
                  <View style={[sl.check, item.checked && { backgroundColor: accent.hex, borderColor: accent.hex }]}>
                    {item.checked && <Text style={sl.checkMark}>✓</Text>}
                  </View>

                  {/* Item info */}
                  <View style={sl.itemMain}>
                    <Text style={[sl.itemName, item.checked && sl.itemNameDone]}>{item.name}</Text>
                    {item.amount && <Text style={sl.itemAmount}>{item.amount}</Text>}
                    {item.source === 'recipe' && item.recipeName && (
                      <View style={sl.recipeTag}>
                        <View style={[sl.recipeDot, { backgroundColor: item.recipeColor }]} />
                        <Text style={sl.recipeTagText}>{item.recipeName}</Text>
                      </View>
                    )}
                  </View>

                  {/* Delete manual items */}
                  {item.source === 'manual' && (
                    <TouchableOpacity style={sl.deleteBtn} onPress={() => removeManual(item.id)}>
                      <Text style={sl.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}

          {/* Add product form */}
          {showAdd ? (
            <View style={sl.addForm}>
              <Text style={sl.addFormTitle}>Añadir producto</Text>

              {/* Category pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sl.catPills}>
                {GROCERY_CATS.map(c => (
                  <TouchableOpacity
                    key={c.key}
                    style={[sl.catPill, addCat === c.key && { backgroundColor: accent.hex, borderColor: accent.hex }]}
                    onPress={() => setAddCat(c.key)}
                  >
                    <Text style={sl.catPillEmoji}>{c.emoji}</Text>
                    <Text style={[sl.catPillText, addCat === c.key && { color: C.white }]}>
                      {c.label.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput
                style={sl.addInput}
                placeholder="Nombre del producto"
                placeholderTextColor={C.ink3}
                value={addName}
                onChangeText={setAddName}
                autoFocus
              />
              <View style={sl.addRow}>
                <TextInput
                  style={[sl.addInput, { flex: 1 }]}
                  placeholder="Cantidad (ej: 500g)"
                  placeholderTextColor={C.ink3}
                  value={addAmount}
                  onChangeText={setAddAmount}
                />
                <TouchableOpacity
                  style={[sl.addBtn, { backgroundColor: accent.hex }, !addName.trim() && { opacity: 0.4 }]}
                  onPress={addManual}
                  disabled={!addName.trim()}
                >
                  <Text style={sl.addBtnText}>Añadir</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => { setShowAdd(false); setAddName(''); setAddAmount(''); }}>
                <Text style={sl.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[sl.addProductBtn, { borderColor: accent.hex + '60' }]} onPress={() => setShowAdd(true)}>
              <Text style={[sl.addProductBtnText, { color: accent.hex }]}>+ Añadir producto</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sl = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(33,28,23,0.42)' },
  sheet: { backgroundColor: C.paper, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl },
  grab:  { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginTop: 12, marginBottom: 4 },

  header:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 4 },
  eyebrow:     { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT, fontWeight: '500', marginBottom: 2 },
  title:       { fontSize: 22, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  headerRight: { alignItems: 'flex-end', gap: 8 },
  progress:    { fontSize: 18, fontWeight: '600', fontFamily: FONT, letterSpacing: -0.4 },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:{ fontSize: 13, color: C.ink2 },

  scroll:       { maxHeight: undefined },
  progressBar:  { height: 4, backgroundColor: C.line, marginHorizontal: 22, borderRadius: 999, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', borderRadius: 999 },

  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },

  empty:      { alignItems: 'center', paddingVertical: 48 },
  emptyIcon:  { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '500', color: C.ink, fontFamily: FONT },
  emptySub:   { fontSize: 13, color: C.ink3, fontFamily: FONT, marginTop: 4, textAlign: 'center' },

  section:     { marginBottom: 20 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionEmoji:{ fontSize: 16 },
  sectionLabel:{ flex: 1, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT },
  sectionCount:{ fontSize: 11, color: C.ink3, fontFamily: FONT },

  item:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line },
  itemDone: { opacity: 0.5 },
  check:    { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  checkMark:{ color: C.white, fontSize: 11, fontWeight: '700', lineHeight: 13 },
  itemMain: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '500', color: C.ink, fontFamily: FONT },
  itemNameDone: { textDecorationLine: 'line-through', color: C.ink3 },
  itemAmount: { fontSize: 12, color: C.ink3, fontFamily: FONT, marginTop: 1 },
  recipeTag:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  recipeDot:  { width: 8, height: 8, borderRadius: 4 },
  recipeTagText: { fontSize: 11, color: C.ink3, fontFamily: FONT },
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
