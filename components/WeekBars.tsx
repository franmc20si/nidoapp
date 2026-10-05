import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C, FONT } from '@/constants/theme';
import { isoWeekNum } from '@/lib/week';
import { money } from '@/store/groceryStore';

// Columnas de gasto por semana (una sola serie → sin leyenda: el título la
// nombra). La semana seleccionada va en el color pleno; el resto, atenuadas.
// Valor solo en la barra activa (seleccionada o bajo el cursor), nunca en todas.

export interface WeekBar { key: string; monday: Date; total: number }

interface Props {
  data: WeekBar[];
  selectedKey: string;
  color: string;       // color pleno (barra seleccionada)
  dimColor: string;    // resto de barras
  height?: number;
  showWeekLabels?: boolean;
  showValue?: boolean;  // etiqueta de importe sobre la barra activa
  onSelect?: (key: string) => void;
}

export default function WeekBars({ data, selectedKey, color, dimColor, height = 120, showWeekLabels = true, showValue = true, onSelect }: Props) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const max = Math.max(...data.map((d) => d.total), 1);
  const activeKey = hoverKey ?? selectedKey;

  return (
    <View>
      <View style={[s.plot, { height: height + (showValue ? 18 : 0) }]}>
        {data.map((d) => {
          const on = d.key === selectedKey;
          const active = d.key === activeKey;
          // Barra mínima visible si hubo gasto; vacía (solo raya) si fue 0.
          const h = d.total > 0 ? Math.max(4, (d.total / max) * height) : 0;
          return (
            <Pressable
              key={d.key}
              style={s.col}
              onPress={onSelect ? () => onSelect(d.key) : undefined}
              onHoverIn={() => setHoverKey(d.key)}
              onHoverOut={() => setHoverKey((k) => (k === d.key ? null : k))}
              disabled={!onSelect}
              accessibilityRole={onSelect ? 'button' : undefined}
              accessibilityLabel={`Semana ${isoWeekNum(d.monday)}: ${money(d.total)} euros`}
            >
              <View style={s.colInner}>
                {showValue && active && (
                  <Text style={s.value} numberOfLines={1}>{d.total > 0 ? `${Math.round(d.total)}€` : '0€'}</Text>
                )}
                {h > 0
                  ? <View style={[s.bar, { height: h, backgroundColor: on ? color : dimColor }]} />
                  : <View style={[s.zero, { backgroundColor: on ? color : C.line }]} />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={s.baseline} />
      {showWeekLabels && (
        <View style={s.labels}>
          {data.map((d) => (
            <Text key={d.key} style={[s.label, d.key === selectedKey && s.labelOn]} numberOfLines={1}>
              S{isoWeekNum(d.monday)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  plot:     { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  col:      { flex: 1, height: '100%', justifyContent: 'flex-end' },
  colInner: { alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 2 },
  bar:      { alignSelf: 'stretch', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  zero:     { alignSelf: 'stretch', height: 2, borderRadius: 1 },
  value:    { fontSize: 11, fontWeight: '600', color: C.ink, fontFamily: FONT, marginBottom: 4 },
  baseline: { height: 1, backgroundColor: C.line },
  labels:   { flexDirection: 'row', gap: 2, marginTop: 6 },
  label:    { flex: 1, textAlign: 'center', fontSize: 10, color: C.ink3, fontFamily: FONT },
  labelOn:  { color: C.ink, fontWeight: '700' },
});
