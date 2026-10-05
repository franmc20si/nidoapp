import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { useGroceryStore, weeklyTotals, spendWeek, parseDay, money } from '@/store/groceryStore';
import { getMondayOfWeek, addDays, isoWeekNum, weekKey } from '@/lib/week';
import { nidoColorByKey } from '@/constants/nidoColors';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';
import PressScale from '@/components/PressScale';
import WeekBars from '@/components/WeekBars';
import GrocerySpendSheet from '@/components/GrocerySpendSheet';
import GroceryStoreSheet from '@/components/GroceryStoreSheet';
import { GrocerySpend, GroceryStore } from '@/types';

// Rango del gráfico: 12 semanas, ~6 meses (26 semanas) o todo el histórico.
type Range = '12w' | '26w' | 'all';
const RANGES: { key: Range; label: string; total: string }[] = [
  { key: '12w', label: '12 semanas', total: 'Últimas 12 semanas' },
  { key: '26w', label: '6 meses',    total: 'Últimos 6 meses' },
  { key: 'all', label: 'Todo',       total: 'Desde el inicio' },
];
const WEEK_MS = 7 * 864e5;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function SuperScreen() {
  const { accent } = useNidoStore();
  const { household } = useAuthStore();
  const { stores, spends, loaded, loadError, load } = useGroceryStore();
  // ?monday=YYYY-MM-DD → semana preseleccionada (la que se veía en el menú).
  const params = useLocalSearchParams<{ monday?: string }>();

  const thisMonday = getMondayOfWeek(new Date());
  const [selMonday, setSelMonday] = useState<Date>(() => params.monday ? parseDay(params.monday) : thisMonday);
  const [spendSheet, setSpendSheet] = useState<{ spend: GrocerySpend | null } | null>(null);
  const [storeSheet, setStoreSheet] = useState<{ store: GroceryStore | null } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<Range>('12w');

  useEffect(() => { if (household?.id) load(household.id); }, [household?.id]);
  useFocusEffect(useCallback(() => { if (household?.id) load(household.id); }, [household?.id]));

  // El gráfico acaba en la semana actual, o en la elegida si es posterior
  // (desde el menú se puede llegar mirando la semana que viene).
  const endMonday = selMonday > thisMonday ? selMonday : thisMonday;
  // "Todo": desde el lunes de la compra más antigua (spends va de más reciente a más antigua).
  const oldest = spends.length ? getMondayOfWeek(parseDay(spends[spends.length - 1].spent_on)) : endMonday;
  const weeks = range === '12w' ? 12 : range === '26w' ? 26
    : Math.max(1, Math.round((+endMonday - +oldest) / WEEK_MS) + 1);
  const data = weeklyTotals(spends, endMonday, weeks);
  // Desde la fecha (no desde las barras): sigue siendo válida aunque el rango
  // elegido ya no muestre esa semana.
  const selKey = weekKey(selMonday);

  // Media: solo semanas TERMINADAS (la actual está a medias y la bajaría) y
  // desde la primera con datos dentro del rango (las previas a empezar a
  // apuntar no son "semanas sin gasto").
  const done = data.filter((d) => d.monday < thisMonday);
  const firstIdx = done.findIndex((d) => d.total > 0);
  const tracked = firstIdx === -1 ? [] : done.slice(firstIdx);
  const avg = tracked.length ? tracked.reduce((a, d) => a + d.total, 0) / tracked.length : 0;

  const weekSpends = spends.filter((sp) => spendWeek(sp) === selKey);
  const weekTotal = weekSpends.reduce((a, sp) => a + sp.amount, 0);
  const storeById = (id: string | null) => stores.find((st) => st.id === id);
  const byStore = Object.values(
    weekSpends.reduce<Record<string, { id: string | null; total: number }>>((acc, sp) => {
      const k = sp.store_id ?? '_none';
      (acc[k] ??= { id: sp.store_id, total: 0 }).total += sp.amount;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const selSunday = addDays(selMonday, 6);
  const rangeLabel = selMonday.getMonth() === selSunday.getMonth()
    ? `del ${selMonday.getDate()} al ${selSunday.getDate()} de ${MONTHS[selMonday.getMonth()]}`
    : `del ${selMonday.getDate()} ${MONTHS[selMonday.getMonth()]} al ${selSunday.getDate()} ${MONTHS[selSunday.getMonth()]}`;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/menu'));

  if (!loaded && !loadError) {
    return <SafeAreaView style={s.root}><ScreenLoader color={accent.hex} /></SafeAreaView>;
  }
  if (!loaded && loadError) {
    return <SafeAreaView style={s.root}><ScreenError onRetry={() => household?.id && load(household.id)} color={accent.hex} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { if (!household?.id) return; setRefreshing(true); await load(household.id); setRefreshing(false); }}
            tintColor={accent.hex}
            colors={[accent.hex]}
          />
        }
      >
        {/* Top bar */}
        <View style={s.topbar}>
          <TouchableOpacity style={s.backBtn} onPress={back} activeOpacity={0.7} hitSlop={8} accessibilityLabel="Volver">
            <Text style={s.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>MENÚ · COMPRA</Text>
            <Text style={s.title}>Gasto del súper</Text>
          </View>
          <PressScale style={[s.addBtn, { backgroundColor: accent.hex }]} onPress={() => setSpendSheet({ spend: null })} scaleTo={0.96} accessibilityRole="button" accessibilityLabel="Añadir gasto">
            <Text style={s.addBtnText}>+ Gasto</Text>
          </PressScale>
        </View>

        {/* Evolución */}
        <View style={s.card}>
          <View style={s.segment} accessibilityRole="tablist">
            {RANGES.map((r) => {
              const on = r.key === range;
              return (
                <PressScale
                  key={r.key}
                  style={[s.segmentBtn, on && s.segmentBtnOn]}
                  onPress={() => setRange(r.key)}
                  scaleTo={0.96}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.segmentText, on && s.segmentTextOn]}>{r.label}</Text>
                </PressScale>
              );
            })}
          </View>
          <View style={s.statsRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.statLabel}>Media semanal</Text>
              <Text style={s.statValue}>{money(avg)} €</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={s.statLabel}>{RANGES.find((r) => r.key === range)!.total}</Text>
              <Text style={s.statValue}>{money(data.reduce((a, d) => a + d.total, 0))} €</Text>
            </View>
          </View>
          <WeekBars
            data={data}
            selectedKey={selKey}
            color={accent.hex}
            dimColor={accent.hex + '59'}
            height={140}
            onSelect={(k) => { const d = data.find((x) => x.key === k); if (d) setSelMonday(d.monday); }}
          />
          <Text style={s.chartHint}>Toca una barra para ver esa semana</Text>
        </View>

        {/* Semana seleccionada */}
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Semana {isoWeekNum(selMonday)}</Text>
          <Text style={s.sectionSub}>{rangeLabel}</Text>
        </View>
        <View style={s.card}>
          <View style={s.weekTotalRow}>
            <Text style={s.weekTotalLabel}>Total</Text>
            <Text style={s.weekTotal}>{money(weekTotal)} €</Text>
          </View>

          {weekSpends.length === 0 ? (
            <Text style={s.empty}>Sin compras apuntadas esta semana.</Text>
          ) : (
            <>
              {/* Reparto por tienda: barra proporcional + importe en texto */}
              <View style={s.split}>
                {byStore.map((b) => {
                  const st = storeById(b.id);
                  const col = st ? nidoColorByKey(st.color).hex : C.ink3;
                  return (
                    <View key={b.id ?? '_none'} style={s.splitRow}>
                      <View style={[s.dot, { backgroundColor: col }]} />
                      <Text style={s.splitName} numberOfLines={1}>{st?.name ?? 'Sin tienda'}</Text>
                      <View style={s.splitTrack}>
                        <View style={[s.splitFill, { width: `${(b.total / weekTotal) * 100}%`, backgroundColor: col }]} />
                      </View>
                      <Text style={s.splitAmount}>{money(b.total)} €</Text>
                    </View>
                  );
                })}
              </View>

              <View style={s.divider} />

              {weekSpends.map((sp) => {
                const st = storeById(sp.store_id);
                const d = parseDay(sp.spent_on);
                return (
                  <PressScale key={sp.id} style={s.spendRow} onPress={() => setSpendSheet({ spend: sp })} scaleTo={0.98} accessibilityRole="button" accessibilityLabel={`Editar compra de ${money(sp.amount)} euros`}>
                    <View style={[s.dot, { backgroundColor: st ? nidoColorByKey(st.color).hex : C.ink3 }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.spendStore}>{st?.name ?? 'Sin tienda'}</Text>
                      <Text style={s.spendDate}>{DAY_SHORT[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}</Text>
                    </View>
                    <Text style={s.spendAmount}>{money(sp.amount)} €</Text>
                  </PressScale>
                );
              })}
            </>
          )}
        </View>

        {/* Tiendas */}
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Tiendas</Text>
        </View>
        <View style={s.storeWrap}>
          {stores.map((st) => (
            <PressScale key={st.id} scaleTo={0.94} style={s.storeChip} onPress={() => setStoreSheet({ store: st })} accessibilityRole="button" accessibilityLabel={`Editar ${st.name}`}>
              <View style={[s.dot, { backgroundColor: nidoColorByKey(st.color).hex }]} />
              <Text style={s.storeChipText}>{st.name}</Text>
            </PressScale>
          ))}
          <PressScale scaleTo={0.94} style={[s.storeChip, s.storeChipGhost]} onPress={() => setStoreSheet({ store: null })} accessibilityLabel="Nueva tienda">
            <Text style={s.storeChipText}>＋ Nueva tienda</Text>
          </PressScale>
        </View>
      </ScrollView>

      <GrocerySpendSheet
        visible={!!spendSheet}
        spend={spendSheet?.spend ?? null}
        onClose={() => setSpendSheet(null)}
      />
      <GroceryStoreSheet
        store={storeSheet?.store ?? null}
        visible={!!storeSheet}
        onClose={() => setStoreSheet(null)}
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

  card: { marginHorizontal: 20, marginBottom: 8, backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, padding: 18 },
  statsRow:  { flexDirection: 'row', marginBottom: 18 },
  segment:       { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: C.paper, borderRadius: R.pill, padding: 3, marginBottom: 16 },
  segmentBtn:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.pill, borderWidth: 1, borderColor: 'transparent' },
  segmentBtnOn:  { backgroundColor: C.card, borderColor: C.line },
  segmentText:   { fontSize: 13, color: C.ink3, fontFamily: FONT, fontWeight: '600' },
  segmentTextOn: { color: C.ink },
  statLabel: { fontSize: 11, letterSpacing: 0.4, color: C.ink3, fontFamily: FONT, fontWeight: '600', textTransform: 'uppercase' },
  statValue: { fontSize: 24, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.6, marginTop: 4 },
  chartHint: { fontSize: 11.5, color: C.ink3, fontFamily: FONT, textAlign: 'center', marginTop: 10 },

  sectionHead:  { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 22, marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.3 },
  sectionSub:   { fontSize: 13, color: C.ink3, fontFamily: FONT },

  weekTotalRow:   { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  weekTotalLabel: { fontSize: 13, color: C.ink2, fontFamily: FONT, fontWeight: '600' },
  weekTotal:      { fontSize: 26, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.6 },
  empty:          { fontSize: 14, color: C.ink3, fontFamily: FONT, marginTop: 10 },

  split:       { marginTop: 14, gap: 10 },
  splitRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  splitName:   { width: 90, fontSize: 14, color: C.ink, fontFamily: FONT },
  splitTrack:  { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.paperDeep, overflow: 'hidden' },
  splitFill:   { height: 8, borderRadius: 4 },
  splitAmount: { width: 78, textAlign: 'right', fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: FONT },

  divider: { height: 1, backgroundColor: C.line, marginVertical: 14 },

  spendRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  spendStore:  { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: FONT },
  spendDate:   { fontSize: 12.5, color: C.ink3, fontFamily: FONT, marginTop: 2 },
  spendAmount: { fontSize: 16, fontWeight: '700', color: C.ink, fontFamily: FONT, letterSpacing: -0.3 },

  dot: { width: 10, height: 10, borderRadius: 5 },

  storeWrap:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
  storeChip:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card },
  storeChipGhost: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  storeChipText:  { fontSize: 14, color: C.ink2, fontFamily: FONT },
});
