import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { useBanksStore } from '@/store/banksStore';
import { supabase } from '@/lib/supabase';
import { readWithRetry } from '@/lib/withTimeout';
import { Bank, Subscription } from '@/types';
import { monthlyEquivalent } from '@/constants/services';
import { nidoColorByKey } from '@/constants/nidoColors';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';
import BankSheet from '@/components/BankSheet';

const money = (n: number) => n.toFixed(2).replace('.', ',');

export default function BancosScreen() {
  const { accent } = useNidoStore();
  const { household } = useAuthStore();
  const { banks, loadBanks } = useBanksStore();

  // Servicios: solo lo necesario para sumar el gasto mensual por banco.
  const [subs, setSubs] = useState<Pick<Subscription, 'amount' | 'cycle' | 'bank_id'>[]>([]);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
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
        loadBanks(household.id),
        readWithRetry(() =>
          supabase.from('subscriptions').select('amount, cycle, bank_id').eq('household_id', household.id)
        ),
      ]);
      if ((subRes as any).error) throw (subRes as any).error;
      if (useBanksStore.getState().loadError) throw new Error('banks load failed');
      setSubs(((subRes as any).data ?? []) as Pick<Subscription, 'amount' | 'cycle' | 'bank_id'>[]);
      setLoaded(true);
    } catch (e) {
      console.error('[bancos] fetchAll error', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchAll(); }, [household?.id]));

  const openNew  = () => { setEditingBank(null); setSheetOpen(true); };
  const openEdit = (b: Bank) => { setEditingBank(b); setSheetOpen(true); };

  const monthlyFor = (bankId: string | null) =>
    subs.filter(s => s.bank_id === bankId).reduce((acc, s) => acc + monthlyEquivalent(s.amount, s.cycle), 0);
  const countFor = (bankId: string | null) => subs.filter(s => s.bank_id === bankId).length;

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
            <Text style={s.eyebrow}>CUENTAS DE PAGO</Text>
            <Text style={s.title}>Bancos</Text>
          </View>
          <TouchableOpacity style={[s.addBtn, { backgroundColor: accent.hex }]} onPress={openNew} activeOpacity={0.8}>
            <Text style={s.addBtnText}>+ Añadir</Text>
          </TouchableOpacity>
        </View>

        {/* Total general */}
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total mensual en {banks.length} {banks.length === 1 ? 'banco' : 'bancos'}</Text>
          <Text style={[s.summaryAmount, { color: accent.hex }]}>{money(grandTotal)} €</Text>
        </View>

        {banks.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🏦</Text>
            <Text style={s.emptyTitle}>Sin bancos todavía</Text>
            <Text style={s.emptySub}>Añade tus cuentas para asignarlas a cada servicio y ver cuánto gasta cada una</Text>
            <TouchableOpacity style={[s.emptyBtn, { backgroundColor: accent.hex }]} onPress={openNew} activeOpacity={0.8}>
              <Text style={s.emptyBtnText}>Añadir primer banco</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.list}>
            {banks.map((b) => {
              const col = nidoColorByKey(b.color);
              const n = countFor(b.id);
              return (
                <TouchableOpacity key={b.id} style={s.bankCard} onPress={() => openEdit(b)} activeOpacity={0.75}>
                  <View style={[s.bankDot, { backgroundColor: col.hex }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.bankName}>{b.name}</Text>
                    <Text style={s.bankCount}>{n} {n === 1 ? 'servicio' : 'servicios'}</Text>
                  </View>
                  <View style={s.bankRight}>
                    <Text style={[s.bankAmount, { color: col.hex }]}>{money(monthlyFor(b.id))} €</Text>
                    <Text style={s.bankCycle}>/mes</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {unassignedCount > 0 && (
              <View style={[s.bankCard, s.unassignedCard]}>
                <View style={[s.bankDot, { backgroundColor: C.ink3 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.bankName}>Sin banco</Text>
                  <Text style={s.bankCount}>{unassignedCount} {unassignedCount === 1 ? 'servicio' : 'servicios'}</Text>
                </View>
                <View style={s.bankRight}>
                  <Text style={[s.bankAmount, { color: C.ink2 }]}>{money(unassignedTotal)} €</Text>
                  <Text style={s.bankCycle}>/mes</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <BankSheet
        bank={editingBank}
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
  bankCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, paddingVertical: 16 },
  unassignedCard: { backgroundColor: C.paperSoft, borderStyle: 'dashed' },
  bankDot:   { width: 14, height: 14, borderRadius: 7 },
  bankName:  { fontSize: 16, fontWeight: '600', color: C.ink, fontFamily: FONT },
  bankCount: { fontSize: 12.5, color: C.ink3, fontFamily: FONT, marginTop: 2 },
  bankRight: { alignItems: 'flex-end' },
  bankAmount:{ fontSize: 18, fontWeight: '700', fontFamily: FONT, letterSpacing: -0.4 },
  bankCycle: { fontSize: 11, color: C.ink3, fontFamily: FONT, marginTop: 1 },
});
