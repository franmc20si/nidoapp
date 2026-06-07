import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, FONT } from '@/constants/theme';

// Trip data — replace with real data when trips are stored in DB
const TRIP_START = new Date('2026-08-14T00:00:00');
const TRIP_END   = new Date('2026-08-21T00:00:00');

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ViajesScreen() {
  const days = daysUntil(TRIP_START);
  const countdownLabel = days > 0 ? `${days}` : days === 0 ? '¡Hoy!' : 'Terminado';
  const showDays = days > 0;

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={s.topbar}>
          <Text style={s.eyebrow}>PRÓXIMOS</Text>
          <Text style={s.title}>Viajes ✈︎</Text>
        </View>

        {/* Trip card */}
        <View style={s.tripCard}>
          <Text style={s.tripDest}>Próximas vacaciones</Text>
          <Text style={s.tripDates}>14 — 21 agosto 2026</Text>
          <Text style={s.tripCountdown}>
            <Text style={s.tripBig}>{countdownLabel}</Text>
            {showDays && <Text style={s.tripUnit}> días</Text>}
          </Text>
        </View>

        {/* Empty state for more trips */}
        <View style={s.emptyCard}>
          <Text style={s.emptyEmoji}>🗺️</Text>
          <Text style={s.emptyTitle}>Planifica tus viajes</Text>
          <Text style={s.emptySub}>Añade fechas, listas de equipaje y tareas previas al viaje</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  topbar: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 16 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '500' },
  title: { fontSize: 30, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.6 },
  tripCard: { marginHorizontal: 20, borderRadius: R.xl, padding: 22, marginBottom: 14, backgroundColor: C.sueloTint, borderWidth: 1, borderColor: C.suelo + '40' },
  tripDest: { fontSize: 22, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  tripDates: { fontSize: 13, color: C.ink2, fontFamily: FONT, marginTop: 4 },
  tripCountdown: { marginTop: 16 },
  tripBig: { fontSize: 52, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -2 },
  tripUnit: { fontSize: 16, color: C.ink2, fontFamily: FONT },
  emptyCard: { marginHorizontal: 20, backgroundColor: C.card, borderRadius: R.l, padding: 28, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.ink, fontFamily: FONT },
  emptySub: { fontSize: 13, color: C.ink3, fontFamily: FONT, marginTop: 6, textAlign: 'center', lineHeight: 19 },
});
