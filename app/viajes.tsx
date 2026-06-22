import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { useCalendarioStore } from '@/store/calendarioStore';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';
import { IconChevronRight } from '@/components/icons';

const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function shortDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

// Nº de días del periodo (inclusivo)
function dayCount(start: string, end: string): number {
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export default function ViajesScreen() {
  const { accent } = useNidoStore();
  const { household } = useAuthStore();
  const { periods, loaded, loadError, loadPeriods } = useCalendarioStore();
  const [refreshing, setRefreshing] = useState(false);

  const fetchPeriods = useCallback(async () => {
    if (!household) return;
    await loadPeriods(household.id);
  }, [household?.id]);

  useFocusEffect(useCallback(() => { fetchPeriods(); }, [fetchPeriods]));

  const trips = periods.filter((p) => p.is_trip);

  if (!loaded && loadError) {
    return <SafeAreaView style={s.root}><ScreenError onRetry={fetchPeriods} color={accent.hex} /></SafeAreaView>;
  }
  if (!loaded) {
    return <SafeAreaView style={s.root}><ScreenLoader color={accent.hex} /></SafeAreaView>;
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
            onRefresh={async () => { setRefreshing(true); await fetchPeriods(); setRefreshing(false); }}
            tintColor={accent.hex}
            colors={[accent.hex]}
          />
        }
      >
        <View style={s.topbar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} hitSlop={8}>
            <Text style={s.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>VIAJES ✈️</Text>
            <Text style={s.title}>Tus viajes</Text>
          </View>
        </View>

        {trips.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>✈️</Text>
            <Text style={s.emptyTitle}>Aún no hay viajes</Text>
            <Text style={s.emptySub}>Crea un periodo en el calendario y márcalo como “viaje” para planificar tus días aquí</Text>
            <TouchableOpacity style={[s.emptyBtn, { backgroundColor: accent.hex }]} onPress={() => router.back()} activeOpacity={0.85}>
              <Text style={s.emptyBtnText}>Ir al calendario</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.list}>
            {trips.map((t) => {
              const n = dayCount(t.start_date, t.end_date);
              return (
                <TouchableOpacity
                  key={t.id}
                  style={s.tripCard}
                  onPress={() => router.push(`/viaje/${t.id}`)}
                  activeOpacity={0.75}
                >
                  <View style={[s.stripe, { backgroundColor: t.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.tripName} numberOfLines={1}>{t.label}</Text>
                    <Text style={s.tripMeta}>{shortDate(t.start_date)} — {shortDate(t.end_date)} · {n} {n === 1 ? 'día' : 'días'}</Text>
                  </View>
                  <IconChevronRight size={18} color={C.ink3} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 16, gap: 6 },
  backBtn: { width: 34, height: 34, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 2, marginLeft: -6 },
  backChevron: { fontSize: 30, color: C.ink2, fontFamily: FONT, lineHeight: 32, marginTop: -4 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '500' },
  title: { fontSize: 30, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.6 },

  list: { paddingHorizontal: 20, gap: 12 },
  tripCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line,
    paddingVertical: 16, paddingHorizontal: 16,
  },
  stripe: { width: 6, alignSelf: 'stretch', borderRadius: 3, marginVertical: -2 },
  tripName: { fontSize: 17, color: C.ink, fontFamily: FONT, fontWeight: '600', letterSpacing: -0.2, marginBottom: 3 },
  tripMeta: { fontSize: 13, color: C.ink3, fontFamily: FONT },

  empty: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 60 },
  emptyEmoji: { fontSize: 44, marginBottom: 16 },
  emptyTitle: { fontSize: 19, color: C.ink, fontFamily: FONT, fontWeight: '600', marginBottom: 8 },
  emptySub: { fontSize: 14, color: C.ink3, fontFamily: FONT, textAlign: 'center', lineHeight: 21, marginBottom: 22 },
  emptyBtn: { borderRadius: R.pill, paddingVertical: 14, paddingHorizontal: 26 },
  emptyBtnText: { color: C.white, fontWeight: '600', fontSize: 15, fontFamily: FONT },
});
