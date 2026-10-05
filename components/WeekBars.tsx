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
  onSelect?: (key: string) => void;
}

export default function WeekBars({ data, selectedKey, color, dimColor, height = 120, onSelect }: Props) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const max = Math.max(...data.map((d) => d.total), 1);
  const activeKey = hoverKey ?? selectedKey;
  // Con muchas semanas (6 meses / todo) las columnas son estrechas: el valor
  // activo va en una línea encima del gráfico y solo se etiqueta una semana
  // de cada `step`, alineadas con la última.
  const dense = data.length > 14;
  const step = Math.ceil(data.length / 10);
  const n = data.length;
  const active = data.find((d) => d.key === activeKey);
  const inlineValue = !dense;

  return (
    <View>
      {dense && (
        <Text style={s.readout} numberOfLines={1}>
          {active ? `S${isoWeekNum(active.monday)} · ${money(active.total)} €` : ' '}
        </Text>
      )}
      <View style={[s.plot, dense && s.plotDense, { height: height + (inlineValue ? 18 : 0) }]}>
        {data.map((d) => {
          const on = d.key === selectedKey;
          const isActive = d.key === activeKey;
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
              <View style={[s.colInner, dense && s.colInnerDense]}>
                {inlineValue && isActive && (
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
      {dense ? (
        <View style={s.labelsDense}>
          {data.map((d, i) => ((n - 1 - i) % step === 0) && (
            <Text key={d.key} style={[s.labelAbs, { left: `${((i + 0.5) / n) * 100}%` }, d.key === selectedKey && s.labelOn]} numberOfLines={1}>
              S{isoWeekNum(d.monday)}
            </Text>
          ))}
        </View>
      ) : (
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
  plotDense:{ gap: 1 },
  readout:  { fontSize: 12, fontWeight: '600', color: C.ink, fontFamily: FONT, marginBottom: 8 },
  col:      { flex: 1, height: '100%', justifyContent: 'flex-end' },
  colInner: { alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 2 },
  colInnerDense: { paddingHorizontal: 0 },
  bar:      { alignSelf: 'stretch', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  zero:     { alignSelf: 'stretch', height: 2, borderRadius: 1 },
  value:    { fontSize: 11, fontWeight: '600', color: C.ink, fontFamily: FONT, marginBottom: 4 },
  baseline: { height: 1, backgroundColor: C.line },
  labels:   { flexDirection: 'row', gap: 2, marginTop: 6 },
  labelsDense: { height: 14, marginTop: 6 },
  labelAbs: { position: 'absolute', width: 40, marginLeft: -20, textAlign: 'center', fontSize: 10, color: C.ink3, fontFamily: FONT },
  label:    { flex: 1, textAlign: 'center', fontSize: 10, color: C.ink3, fontFamily: FONT },
  labelOn:  { color: C.ink, fontWeight: '700' },
});
