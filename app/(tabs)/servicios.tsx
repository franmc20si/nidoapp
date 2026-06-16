import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { Subscription } from '@/types';
import { SERVICE_CATS, CYCLES, getServiceCat, getCycle, monthlyEquivalent } from '@/constants/services';
import ServiceSheet from '@/components/ServiceSheet';
import { withTimeout } from '@/lib/withTimeout';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';

// Días hasta la próxima fecha de pago
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
  return Math.ceil(diff / 86400000);
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
  const [subs, setSubs]           = useState<Subscription[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [sheetOpen, setSheetOpen]   = useState(false);
  const [loading, setLoading]       = useState(true);
  const [loaded, setLoaded]         = useState(false);
  const [loadError, setLoadError]   = useState(false);

  const fetchSubs = async () => {
    if (!household) return;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await withTimeout(
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

  useFocusEffect(useCallback(() => { fetchSubs(); }, [household?.id]));

  const openNew = () => { setEditingSub(null); setSheetOpen(true); };
  const openEdit = (s: Subscription) => { setEditingSub(s); setSheetOpen(true); };

  const totalMonthly = subs.reduce((acc, s) => acc + monthlyEquivalent(s.amount, s.cycle), 0);
  const upcoming = subs.filter(s => { const d = daysUntil(s.next_payment); return d !== null && d <= 7; });

  // Agrupar por categoría en el orden definido
  const byCat: Record<string, Subscription[]> = {};
  for (const s of subs) {
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
        contentContainerStyle={{ paddingBottom: 120 }}
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
          <TouchableOpacity style={[s.addBtn, { backgroundColor: accent.hex }]} onPress={openNew} activeOpacity={0.8}>
            <Text style={s.addBtnText}>+ Añadir</Text>
          </TouchableOpacity>
        </View>

        {/* Resumen mensual */}
        <View style={s.summaryCard}>
          <View style={s.summaryLeft}>
            <Text style={s.summaryLabel}>Total mensual estimado</Text>
            <Text style={[s.summaryAmount, { color: accent.hex }]}>
              {totalMonthly.toFixed(2).replace('.', ',')} €
            </Text>
            <Text style={s.summaryCount}>{subs.length} {subs.length === 1 ? 'servicio' : 'servicios'} activos</Text>
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
              const days = daysUntil(sub.next_payment);
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
                  const days  = daysUntil(sub.next_payment);
                  const uCol  = urgencyColor(days);
                  const cycle = getCycle(sub.cycle);
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
                          {sub.bank_account ? (
                            <Text style={s.subBank}>{sub.bank_account}</Text>
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
  addBtn:  { borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: C.white, fontWeight: '600', fontSize: 14, fontFamily: FONT },

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
  subMeta:     { flexDirection: 'row', gap: 10, marginTop: 3, flexWrap: 'wrap' },
  subBank:     { fontSize: 12, color: C.ink3, fontFamily: FONT },
  subDays:     { fontSize: 12, color: C.ink3, fontFamily: FONT },
  subRight:    { alignItems: 'flex-end' },
  subAmount:   { fontSize: 16, fontWeight: '700', color: C.ink, fontFamily: FONT },
  subCycle:    { fontSize: 11, color: C.ink3, fontFamily: FONT, marginTop: 2 },
});
