import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import PressScale from '@/components/PressScale';
import WeekBars from '@/components/WeekBars';
import { C, R, FONT } from '@/constants/theme';
import { useGroceryStore, weeklyTotals, money, toDay } from '@/store/groceryStore';
import { NidoColor } from '@/constants/nidoColors';

// Tarjeta de la tab Menú: gasto del súper de la semana que se está viendo,
// comparado con la anterior, y la tendencia de las últimas 8 semanas.
// Tocar → pantalla /super con el detalle.

interface Props {
  monday: Date;      // lunes de la semana que muestra el menú
  week: number;      // número de semana ISO (para el texto)
  accent: NidoColor;
}

export default function GrocerySpendCard({ monday, week, accent }: Props) {
  const { spends, loaded } = useGroceryStore();
  const data = weeklyTotals(spends, monday, 8);
  const cur = data[data.length - 1];
  const prev = data[data.length - 2];
  const diff = cur.total - prev.total;

  let delta = '';
  if (cur.total > 0 || prev.total > 0) {
    if (Math.abs(diff) < 0.005) delta = 'Igual que la anterior';
    else delta = `${diff > 0 ? '▲' : '▼'} ${money(Math.abs(diff))} € vs anterior`;
  }

  return (
    <PressScale
      style={[s.card, { borderColor: accent.hex + '40' }]}
      onPress={() => router.push({ pathname: '/super', params: { monday: toDay(monday) } })}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Gasto del súper, semana ${week}: ${money(cur.total)} euros. Ver detalle`}
    >
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow} numberOfLines={1}>SÚPER · SEMANA {week}</Text>
          <Text style={s.total}>{loaded ? `${money(cur.total)} €` : '—'}</Text>
          <Text style={s.delta} numberOfLines={1}>{delta || 'Sin compras esta semana'}</Text>
        </View>
        <View style={s.chart}>
          <WeekBars data={data} selectedKey={cur.key} color={accent.hex} dimColor={accent.hex + '59'} height={44} showWeekLabels={false} showValue={false} />
        </View>
      </View>
      <Text style={[s.more, { color: accent.hex }]}>Ver evolución ›</Text>
    </PressScale>
  );
}

const s = StyleSheet.create({
  card:    { backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, padding: 16, gap: 10 },
  top:     { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, color: C.ink3, fontFamily: FONT, fontWeight: '600' },
  total:   { fontSize: 28, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.8, marginTop: 4 },
  delta:   { fontSize: 12.5, color: C.ink2, fontFamily: FONT, marginTop: 2 },
  chart:   { width: '38%', maxWidth: 160 },
  more:    { fontSize: 13, fontWeight: '600', fontFamily: FONT },
});
