import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { useBanksStore } from '@/store/banksStore';
import { useHousesStore } from '@/store/housesStore';
import { supabase } from '@/lib/supabase';
import { Subscription } from '@/types';
import { SERVICE_CATS, CYCLES, getServiceCat, getCycle, monthlyEquivalent } from '@/constants/services';
import { nidoColorByKey } from '@/constants/nidoColors';
import ServiceSheet from '@/components/ServiceSheet';
import { readWithRetry } from '@/lib/withTimeout';
import { daysUntilNextPayment } from '@/lib/nextPayment';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';

// Días hasta el PRÓXIMO pago: avanza la fecha ancla por el ciclo, así los
// servicios recurrentes ya pasados muestran su siguiente vencimiento en vez
// de quedarse en "Vencido".
function daysUntil(sub: { next_payment: string | null; cycle: string }): number | null {
  return daysUntilNextPayment(sub.next_payment, sub.cycle);
}

function urgencyColor(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 3)  return '#c0392b';
  if (days <= 7)  return C.cena;
  if (days <= 14) return C.general;
  return null;
}

function daysLabel(days: number | null): string {
  if (days === null) return '';
  if (days < 0)  return 'Vencido';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

export default function ServiciosScreen() {
  const { accent } = useNidoStore();
  const { household } = useAuthStore();
  const { banks, loadBanks } = useBanksStore();
  const { houses, loadHouses } = useHousesStore();
  const [subs, setSubs]           = useState<Subscription[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [sheetOpen, setSheetOpen]   = useState(false);
  const [loading, setLoading]       = useState(true);
  const [loaded, setLoaded]         = useState(false);
  const [loadError, setLoadError]   = useState(false);
  // Filtro por casa: 'all' = todas · 'none' = sin casa · <id> = una casa concreta
  const [houseFilter, setHouseFilter] = useState<'all' | 'none' | string>('all');

  const fetchSubs = async () => {
    if (!household) return;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await readWithRetry(() =>
        supabase
          .from('subscriptions')
          .select('*')
          .eq('household_id', household.id)
          .order('next_payment', { ascending: true, nullsFirst: false })
      );
      if (error) throw error;
      setSubs((data ?? []) as Subscription[]);
      setLoaded(true);
    } catch (e) {
      console.error('[servicios] fetchSubs error', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    fetchSubs();
    if (household) { loadBanks(household.id); loadHouses(household.id); }
  }, [household?.id]));

  const openNew = () => { setEditingSub(null); setSheetOpen(true); };
  const openEdit = (s: Subscription) => { setEditingSub(s); setSheetOpen(true); };

  // Aplicar filtro de casa: los totales y la lista se recalculan sobre este subconjunto.
  const visibleSubs = houseFilter === 'all'
    ? subs
    : subs.filter(s => (s.house_id ?? null) === (houseFilter === 'none' ? null : houseFilter));

  const totalMonthly = visibleSubs.reduce((acc, s) => acc + monthlyEquivalent(s.amount, s.cycle), 0);
  const upcoming = visibleSubs
    .filter(s => { const d = daysUntil(s); return d !== null && d <= 7; })
    .sort((a, b) => (daysUntil(a) ?? 0) - (daysUntil(b) ?? 0));

  // Nº de servicios sin casa (para el chip "Sin casa")
  const noHouseCount = subs.filter(s => !s.house_id).length;

  // Agrupar por categoría en el orden definido
  const byCat: Record<string, Subscription[]> = {};
  for (const s of visibleSubs) {
    const k = s.category ?? 'otros';
    if (!byCat[k]) byCat[k] = [];
    byCat[k].push(s);
  }
  const orderedCats = SERVICE_CATS.map(c => c.key).filter(k => byCat[k]?.length);

  if (!loaded && loading) {
    return <SafeAreaView style={s.root}><ScreenLoader color={accent.hex} /></SafeAreaView>;
  }
  if (!loaded && loadError) {
    return <SafeAreaView style={s.root}><ScreenError onRetry={fetchSubs} color={accent.hex} /></SafeAreaView>;
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
            onRefresh={async () => { setRefreshing(true); await fetchSubs(); setRefreshing(false); }}
            tintColor={accent.hex}
            colors={[accent.hex]}
          />
        }
      >
        {/* Top bar */}
        <View style={s.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>GASTOS FIJOS</Text>
            <Text style={s.title}>Servicios</Text>
          </View>
          <View style={s.actions}>
            <TouchableOpacity style={s.utilBtn} onPress={() => router.push('/casas')} activeOpacity={0.8}>
              <Text style={s.utilBtnText}>🏠 Casas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.utilBtn} onPress={() => router.push('/bancos')} activeOpacity={0.8}>
              <Text style={s.utilBtnText}>🏦 Bancos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.addBtn, { backgroundColor: accent.hex }]} onPress={openNew} activeOpacity={0.8}>
              <Text style={s.addBtnText}>+ Añadir</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Filtro por casa */}
        {houses.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filterRow}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity
              style={[s.filterChip, houseFilter === 'all' && { backgroundColor: accent.hex, borderColor: accent.hex }]}
              onPress={() => setHouseFilter('all')}
              activeOpacity={0.8}
            >
              <Text style={[s.filterChipText, houseFilter === 'all' && { color: C.white }]}>Todas</Text>
            </TouchableOpacity>
            {houses.map((h) => {
              const on = houseFilter === h.id;
              const col = nidoColorByKey(h.color);
              return (
                <TouchableOpacity
                  key={h.id}
                  style={[s.filterChip, on && { borderColor: col.hex, backgroundColor: col.wash }]}
                  onPress={() => setHouseFilter(h.id)}
                  activeOpacity={0.8}
                >
                  <View style={[s.filterDot, { backgroundColor: col.hex }]} />
                  <Text style={[s.filterChipText, on && { color: col.hex }]}>{h.name}</Text>
                </TouchableOpacity>
              );
            })}
            {noHouseCount > 0 && (
              <TouchableOpacity
                style={[s.filterChip, houseFilter === 'none' && { backgroundColor: C.ink, borderColor: C.ink }]}
                onPress={() => setHouseFilter('none')}
                activeOpacity={0.8}
              >
                <Text style={[s.filterChipText, houseFilter === 'none' && { color: C.white }]}>Sin casa</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {/* Resumen mensual */}
        <View style={s.summaryCard}>
          <View style={s.summaryLeft}>
            <Text style={s.summaryLabel}>
              {houseFilter === 'all' ? 'Total mensual estimado' : 'Total de esta selección'}
            </Text>
            <Text style={[s.summaryAmount, { color: accent.hex }]}>
              {totalMonthly.toFixed(2).replace('.', ',')} €
            </Text>
            <Text style={s.summaryCount}>{visibleSubs.length} {visibleSubs.length === 1 ? 'servicio' : 'servicios'} activos</Text>
          </View>
          <View style={s.summaryRight}>
            <Text style={s.summaryRightLabel}>Anual estimado</Text>
            <Text style={s.summaryRightAmount}>{(totalMonthly * 12).toFixed(0)} €</Text>
          </View>
        </View>

        {/* Próximos pagos — solo si hay alguno en ≤ 7 días */}
        {upcoming.length > 0 && (
          <View style={s.upcomingCard}>
            <Text style={s.upcomingTitle}>⏰ Próximos pagos</Text>
            {upcoming.map(sub => {
              const days = daysUntil(sub);
              const cat  = getServiceCat(sub.category);
              const col  = urgencyColor(days) ?? C.cena;
              return (
                <TouchableOpacity key={sub.id} style={s.upcomingRow} onPress={() => openEdit(sub)} activeOpacity={0.7}>
                  <Text style={s.upcomingEmoji}>{cat.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.upcomingName}>{sub.name}</Text>
                    <Text style={[s.upcomingDays, { color: col }]}>{daysLabel(days)}</Text>
                  </View>
                  <Text style={[s.upcomingAmt, { color: col }]}>{sub.amount.toFixed(2).replace('.', ',')} €</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Lista por categoría */}
        {subs.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🏠</Text>
            <Text style={s.emptyTitle}>Sin servicios todavía</Text>
            <Text style={s.emptySub}>Añade la luz, el internet o cualquier gasto fijo del hogar</Text>
            <TouchableOpacity style={[s.emptyBtn, { backgroundColor: accent.hex }]} onPress={openNew} activeOpacity={0.8}>
              <Text style={s.emptyBtnText}>Añadir primer servicio</Text>
            </TouchableOpacity>
          </View>
        ) : visibleSubs.length === 0 ? (
          <View style={s.filterEmpty}>
            <Text style={s.filterEmptyText}>No hay servicios en esta selección.</Text>
          </View>
        ) : (
          orderedCats.map(catKey => {
            const cat   = getServiceCat(catKey);
            const items = byCat[catKey];
            const catTotal = items.reduce((acc, i) => acc + monthlyEquivalent(i.amount, i.cycle), 0);
            return (
              <View key={catKey} style={s.catSection}>
                <View style={s.catHeader}>
                  <Text style={s.catEmoji}>{cat.emoji}</Text>
                  <Text style={s.catLabel}>{cat.label}</Text>
                  <Text style={s.catTotal}>{catTotal.toFixed(2).replace('.', ',')} €/mes</Text>
                </View>
                {items.map((sub, idx) => {
                  const days  = daysUntil(sub);
                  const uCol  = urgencyColor(days);
                  const cycle = getCycle(sub.cycle);
                  const bank  = sub.bank_id ? banks.find(b => b.id === sub.bank_id) : null;
                  const house = sub.house_id ? houses.find(h => h.id === sub.house_id) : null;
                  return (
                    <TouchableOpacity
                      key={sub.id}
                      style={[s.subCard, idx === items.length - 1 && s.subCardLast]}
                      onPress={() => openEdit(sub)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.subName}>{sub.name}</Text>
                        <View style={s.subMeta}>
                          {house ? (
                            <View style={s.subBankWrap}>
                              <View style={[s.subBankDot, { backgroundColor: nidoColorByKey(house.color).hex }]} />
                              <Text style={s.subBank}>🏠 {house.name}</Text>
                            </View>
                          ) : null}
                          {bank ? (
                            <View style={s.subBankWrap}>
                              <View style={[s.subBankDot, { backgroundColor: nidoColorByKey(bank.color).hex }]} />
                              <Text style={s.subBank}>{bank.name}</Text>
                            </View>
                          ) : null}
                          {sub.next_payment && (
                            <Text style={[s.subDays, uCol ? { color: uCol } : {}]}>
                              {uCol ? '● ' : ''}{daysLabel(days)}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={s.subRight}>
                        <Text style={s.subAmount}>{sub.amount.toFixed(2).replace('.', ',')} €</Text>
                        <Text style={s.subCycle}>{cycle.short}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })
        )}

      </ScrollView>

      <ServiceSheet
        service={editingSub}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={(sub) => {
          setSubs(prev => {
            const idx = prev.findIndex(s => s.id === sub.id);
            return idx >= 0 ? prev.map(s => s.id === sub.id ? sub : s) : [...prev, sub];
          });
          setSubs(prev => [...prev].sort((a, b) => {
            if (!a.next_payment) return 1;
            if (!b.next_payment) return -1;
            return a.next_payment.localeCompare(b.next_payment);
          }));
        }}
        onDeleted={(id) => setSubs(prev => prev.filter(s => s.id !== id))}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '600' },
  title:   { fontSize: 30, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.6, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  utilBtn: { borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.ink },
  utilBtnText: { color: C.white, fontWeight: '600', fontSize: 14, fontFamily: FONT },
  addBtn:  { borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: C.white, fontWeight: '600', fontSize: 14, fontFamily: FONT },

  filterRow:      { gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  filterChip:     { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.card },
  filterDot:      { width: 9, height: 9, borderRadius: 5 },
  filterChipText: { fontSize: 13.5, fontWeight: '600', color: C.ink2, fontFamily: FONT },

  filterEmpty:     { alignItems: 'center', paddingTop: 32, paddingHorizontal: 32 },
  filterEmptyText: { fontSize: 14, color: C.ink3, fontFamily: FONT, textAlign: 'center' },

  summaryCard: {
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line,
    padding: 20, flexDirection: 'row', alignItems: 'center',
  },
  summaryLeft:        { flex: 1 },
  summaryLabel:       { fontSize: 11, letterSpacing: 0.4, color: C.ink3, fontFamily: FONT, fontWeight: '600', textTransform: 'uppercase' },
  summaryAmount:      { fontSize: 34, fontWeight: '600', fontFamily: FONT, letterSpacing: -1, marginTop: 4 },
  summaryCount:       { fontSize: 12, color: C.ink3, fontFamily: FONT, marginTop: 4 },
  summaryRight:       { alignItems: 'flex-end' },
  summaryRightLabel:  { fontSize: 11, color: C.ink3, fontFamily: FONT },
  summaryRightAmount: { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.5, marginTop: 3 },

  upcomingCard:  { marginHorizontal: 20, marginBottom: 14, backgroundColor: '#FEF3F2', borderRadius: R.l, borderWidth: 1, borderColor: '#FECDCA', padding: 16 },
  upcomingTitle: { fontSize: 13, fontWeight: '600', color: C.ink, fontFamily: FONT, marginBottom: 12 },
  upcomingRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  upcomingEmoji: { fontSize: 20 },
  upcomingName:  { fontSize: 14, fontWeight: '500', color: C.ink, fontFamily: FONT },
  upcomingDays:  { fontSize: 12, fontFamily: FONT, marginTop: 1 },
  upcomingAmt:   { fontSize: 15, fontWeight: '700', fontFamily: FONT },

  empty:       { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyEmoji:  { fontSize: 52, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '500', color: C.ink, fontFamily: FONT, marginBottom: 6 },
  emptySub:    { fontSize: 14, color: C.ink3, fontFamily: FONT, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn:    { borderRadius: R.pill, paddingHorizontal: 24, paddingVertical: 14 },
  emptyBtnText:{ color: C.white, fontWeight: '600', fontSize: 15, fontFamily: FONT },

  catSection: { marginHorizontal: 20, marginBottom: 12, backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  catHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.paperSoft },
  catEmoji:   { fontSize: 17 },
  catLabel:   { flex: 1, fontSize: 13, fontWeight: '600', color: C.ink2, fontFamily: FONT },
  catTotal:   { fontSize: 12, color: C.ink3, fontFamily: FONT },

  subCard:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  subCardLast: { borderBottomWidth: 0 },
  subName:     { fontSize: 15, fontWeight: '500', color: C.ink, fontFamily: FONT },
  subMeta:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' },
  subBankWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  subBankDot:  { width: 8, height: 8, borderRadius: 4 },
  subBank:     { fontSize: 12, color: C.ink3, fontFamily: FONT },
  subDays:     { fontSize: 12, color: C.ink3, fontFamily: FONT },
  subRight:    { alignItems: 'flex-end' },
  subAmount:   { fontSize: 16, fontWeight: '700', color: C.ink, fontFamily: FONT },
  subCycle:    { fontSize: 11, color: C.ink3, fontFamily: FONT, marginTop: 2 },
});
