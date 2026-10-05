import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import PressScale from '@/components/PressScale';
import { C, R, FONT } from '@/constants/theme';
import { useGroceryStore, weeklyTotals, money, toDay } from '@/store/groceryStore';
import { NidoColor } from '@/constants/nidoColors';

// Tarjeta compacta de la tab Menú (2 filas × 2 columnas): gasto de la semana
// que se está viendo y su comparación con la anterior. La evolución completa
// vive en /super (tocar la tarjeta).

interface Props {
  monday: Date;      // lunes de la semana que muestra el menú
  week: number;      // número de semana ISO (para el texto)
  accent: NidoColor;
}

export default function GrocerySpendCard({ monday, week, accent }: Props) {
  const { spends, loaded } = useGroceryStore();
  const [prev, cur] = weeklyTotals(spends, monday, 2);
  const diff = cur.total - prev.total;

  let delta = 'Sin compras';
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
      accessibilityLabel={`Gastos, semana ${week}: ${money(cur.total)} euros. ${delta}. Ver evolución`}
    >
      <View style={s.row}>
        <Text style={s.eyebrow} numberOfLines={1}>GASTOS · SEMANA {week}</Text>
        <Text style={s.delta} numberOfLines={1}>{loaded ? delta : ''}</Text>
      </View>
      <View style={[s.row, s.rowBottom]}>
        <Text style={s.total} numberOfLines={1}>{loaded ? `${money(cur.total)} €` : '—'}</Text>
        <Text style={[s.more, { color: accent.hex }]}>Ver evolución ›</Text>
      </View>
    </PressScale>
  );
}

const s = StyleSheet.create({
  card:      { backgroundColor: C.card, borderRadius: R.m, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowBottom: { alignItems: 'baseline' },
  eyebrow:   { flexShrink: 1, fontSize: 11, letterSpacing: 1.2, color: C.ink3, fontFamily: FONT, fontWeight: '600' },
  delta:     { flexShrink: 1, fontSize: 12.5, color: C.ink2, fontFamily: FONT, textAlign: 'right' },
  total:     { flexShrink: 1, fontSize: 22, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.6 },
  more:      { fontSize: 13, fontWeight: '600', fontFamily: FONT },
});
