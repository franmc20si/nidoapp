import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { useHousesStore } from '@/store/housesStore';
import { supabase } from '@/lib/supabase';
import { readWithRetry } from '@/lib/withTimeout';
import { House, Subscription } from '@/types';
import { monthlyEquivalent } from '@/constants/services';
import { nidoColorByKey } from '@/constants/nidoColors';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';
import HouseSheet from '@/components/HouseSheet';

const money = (n: number) => n.toFixed(2).replace('.', ',');

export default function CasasScreen() {
  const { accent } = useNidoStore();
  const { household } = useAuthStore();
  const { houses, loadHouses } = useHousesStore();

  // Servicios: solo lo necesario para sumar el gasto mensual por casa.
  const [subs, setSubs] = useState<Pick<Subscription, 'amount' | 'cycle' | 'house_id'>[]>([]);
  const [editingHouse, setEditingHouse] = useState<House | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [loaded, setLoaded]     = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fetchAll = async () => {
    if (!household) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [, subRes] = await Promise.all([
        loadHouses(household.id),
        readWithRetry(() =>
          supabase.from('subscriptions').select('amount, cycle, house_id').eq('household_id', household.id)
        ),
      ]);
      if ((subRes as any).error) throw (subRes as any).error;
      if (useHousesStore.getState().loadError) throw new Error('houses load failed');
      setSubs(((subRes as any).data ?? []) as Pick<Subscription, 'amount' | 'cycle' | 'house_id'>[]);
      setLoaded(true);
    } catch (e) {
      console.error('[casas] fetchAll error', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchAll(); }, [household?.id]));

  const openNew  = () => { setEditingHouse(null); setSheetOpen(true); };
  const openEdit = (h: House) => { setEditingHouse(h); setSheetOpen(true); };

  const monthlyFor = (houseId: string | null) =>
    subs.filter(s => s.house_id === houseId).reduce((acc, s) => acc + monthlyEquivalent(s.amount, s.cycle), 0);
  const countFor = (houseId: string | null) => subs.filter(s => s.house_id === houseId).length;

  const unassignedCount = countFor(null);
  const unassignedTotal = monthlyFor(null);
  const grandTotal = subs.reduce((acc, s) => acc + monthlyEquivalent(s.amount, s.cycle), 0);

  if (!loaded && loading) {
    return <SafeAreaView style={s.root}><ScreenLoader color={accent.hex} /></SafeAreaView>;
  }
  if (!loaded && loadError) {
    return <SafeAreaView style={s.root}><ScreenError onRetry={fetchAll} color={accent.hex} /></SafeAreaView>;
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
            onRefresh={async () => { setRefreshing(true); await fetchAll(); setRefreshing(false); }}
            tintColor={accent.hex}
            colors={[accent.hex]}
          />
        }
      >
        {/* Top bar con volver */}
        <View style={s.topbar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} hitSlop={8}>
            <Text style={s.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>VIVIENDAS</Text>
            <Text style={s.title}>Casas</Text>
          </View>
          <TouchableOpacity style={[s.addBtn, { backgroundColor: accent.hex }]} onPress={openNew} activeOpacity={0.8}>
            <Text style={s.addBtnText}>+ Añadir</Text>
          </TouchableOpacity>
        </View>

        {/* Total general de todas las casas */}
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total mensual en {houses.length} {houses.length === 1 ? 'casa' : 'casas'}</Text>
          <Text style={[s.summaryAmount, { color: accent.hex }]}>{money(grandTotal)} €</Text>
        </View>

        {houses.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🏠</Text>
            <Text style={s.emptyTitle}>Sin casas todavía</Text>
            <Text style={s.emptySub}>Añade tus viviendas para atribuir cada servicio y ver cuánto gasta cada una</Text>
            <TouchableOpacity style={[s.emptyBtn, { backgroundColor: accent.hex }]} onPress={openNew} activeOpacity={0.8}>
              <Text style={s.emptyBtnText}>Añadir primera casa</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.list}>
            {houses.map((h) => {
              const col = nidoColorByKey(h.color);
              const n = countFor(h.id);
              return (
                <TouchableOpacity key={h.id} style={s.houseCard} onPress={() => openEdit(h)} activeOpacity={0.75}>
                  <View style={[s.houseDot, { backgroundColor: col.hex }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.houseName}>{h.name}</Text>
                    <Text style={s.houseCount}>{n} {n === 1 ? 'servicio' : 'servicios'}</Text>
                  </View>
                  <View style={s.houseRight}>
                    <Text style={[s.houseAmount, { color: col.hex }]}>{money(monthlyFor(h.id))} €</Text>
                    <Text style={s.houseCycle}>/mes</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {unassignedCount > 0 && (
              <View style={[s.houseCard, s.unassignedCard]}>
                <View style={[s.houseDot, { backgroundColor: C.ink3 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.houseName}>Sin casa</Text>
                  <Text style={s.houseCount}>{unassignedCount} {unassignedCount === 1 ? 'servicio' : 'servicios'}</Text>
                </View>
                <View style={s.houseRight}>
                  <Text style={[s.houseAmount, { color: C.ink2 }]}>{money(unassignedTotal)} €</Text>
                  <Text style={s.houseCycle}>/mes</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <HouseSheet
        house={editingHouse}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={() => fetchAll()}
        onDeleted={() => fetchAll()}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14 },
  backBtn: { width: 38, height: 38, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  backChevron: { fontSize: 26, color: C.ink, fontFamily: FONT, marginTop: -4 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '600' },
  title:   { fontSize: 30, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.6, marginTop: 2 },
  addBtn:  { borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: C.white, fontWeight: '600', fontSize: 14, fontFamily: FONT },

  summaryCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, padding: 20 },
  summaryLabel:  { fontSize: 11, letterSpacing: 0.4, color: C.ink3, fontFamily: FONT, fontWeight: '600', textTransform: 'uppercase' },
  summaryAmount: { fontSize: 34, fontWeight: '600', fontFamily: FONT, letterSpacing: -1, marginTop: 4 },

  empty:       { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 },
  emptyEmoji:  { fontSize: 52, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '500', color: C.ink, fontFamily: FONT, marginBottom: 6 },
  emptySub:    { fontSize: 14, color: C.ink3, fontFamily: FONT, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn:    { borderRadius: R.pill, paddingHorizontal: 24, paddingVertical: 14 },
  emptyBtnText:{ color: C.white, fontWeight: '600', fontSize: 15, fontFamily: FONT },

  list: { marginHorizontal: 20, gap: 10 },
  houseCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingVertical: 16 },
  unassignedCard: { backgroundColor: C.paperSoft, borderStyle: 'dashed' },
  houseDot:   { width: 14, height: 14, borderRadius: 7 },
  houseName:  { fontSize: 16, fontWeight: '600', color: C.ink, fontFamily: FONT },
  houseCount: { fontSize: 12.5, color: C.ink3, fontFamily: FONT, marginTop: 2 },
  houseRight: { alignItems: 'flex-end' },
  houseAmount:{ fontSize: 18, fontWeight: '700', fontFamily: FONT, letterSpacing: -0.4 },
  houseCycle: { fontSize: 11, color: C.ink3, fontFamily: FONT, marginTop: 1 },
});
