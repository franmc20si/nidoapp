import { View, Text, StyleSheet } from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import PressScale from '@/components/PressScale';
import { WEEKDAYS, TIME_SLOTS, DaySlot } from '@/lib/recurrence';

/**
 * Selector de día(s) de la semana + franja para tareas recurrentes.
 * Compartido por el sheet de crear (AddSheet) y el de editar (TaskEditSheet).
 * `showDays` solo para semanales (varios días); la franja se ofrece siempre.
 */
export default function RecurrenceScheduler({
  showDays, weekdays, onToggleDay, slot, onSlot, color,
}: {
  showDays: boolean;
  weekdays: number[];
  onToggleDay: (day: number) => void;
  slot: DaySlot | null;
  onSlot: (s: DaySlot) => void;
  color: string;
}) {
  return (
    <>
      {showDays && (
        <>
          <Text style={s.label}>¿Qué días?</Text>
          <View style={s.dayRow}>
            {WEEKDAYS.map((w) => {
              const on = weekdays.includes(w.key);
              return (
                <PressScale
                  key={w.key}
                  scaleTo={0.9}
                  style={[s.dayChip, on && { backgroundColor: color, borderColor: color }]}
                  onPress={() => onToggleDay(w.key)}
                  accessibilityRole="button"
                  accessibilityLabel={w.label}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.dayTxt, on && s.dayTxtOn]}>{w.short}</Text>
                </PressScale>
              );
            })}
          </View>
        </>
      )}

      <Text style={s.label}>¿En qué franja?</Text>
      <View style={s.slotRow}>
        {TIME_SLOTS.map((sl) => {
          const on = slot === sl.key;
          return (
            <PressScale
              key={sl.key}
              scaleTo={0.94}
              style={[s.slotChip, on && { backgroundColor: color, borderColor: color }]}
              onPress={() => onSlot(sl.key)}
              accessibilityRole="button"
              accessibilityLabel={sl.label}
              accessibilityState={{ selected: on }}
            >
              <Text style={s.slotEmoji}>{sl.emoji}</Text>
              <Text style={[s.slotTxt, on && s.slotTxtOn]}>{sl.label}</Text>
            </PressScale>
          );
        })}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, letterSpacing: 0.2, marginBottom: 10, textTransform: 'uppercase' },

  dayRow: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  dayChip: { flex: 1, aspectRatio: 1, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  dayTxt: { fontSize: 14, fontWeight: '700', color: C.ink2, fontFamily: FONT },
  dayTxtOn: { color: C.white },

  slotRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  slotChip: { flex: 1, borderRadius: R.m, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 2 },
  slotEmoji: { fontSize: 17 },
  slotTxt: { fontSize: 11.5, fontWeight: '600', color: C.ink2, fontFamily: FONT },
  slotTxtOn: { color: C.white },
});
