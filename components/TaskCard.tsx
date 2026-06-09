import { useRef } from 'react';
import { Animated, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { catFor } from '@/constants/categories';
import { taskTheme, fmtDur } from '@/lib/taskTheme';
import { recurrenceLabel } from '@/lib/recurrence';
import { getCatIcon, IconCheck } from '@/components/icons';
import { Task } from '@/types';

function fmtDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

interface Props {
  task: Task;
  onToggle: (task: Task) => void;
  onAnimatedOut?: (task: Task) => void;
  onPress?: (task: Task) => void;
  completerName?: string | null;
}

export default function TaskCard({ task, onToggle, onAnimatedOut, onPress, completerName }: Props) {
  const cat = catFor(task.category);
  const pts: number = task.points ?? 10;
  const min: number = task.duration_min ?? pts * 5;
  const recurring = task.is_recurring;
  const recLabel = recurring ? recurrenceLabel(task.recurrence_rule) : null;
  const CatIcon = getCatIcon(task.category);
  const th = taskTheme(cat.color, pts);

  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    // toggling to done → animate out, then notify parent to remove
    if (!task.is_done && onAnimatedOut) {
      onToggle(task);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 60, duration: 620, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 620, useNativeDriver: true }),
      ]).start(() => onAnimatedOut(task));
    } else {
      onToggle(task);
    }
  };

  return (
    <Animated.View
      style={[
        s.card,
        { backgroundColor: th.bg, borderColor: th.border, transform: [{ translateX }], opacity },
        task.is_done && s.done,
      ]}
    >
      <TouchableOpacity style={s.row} onPress={() => onPress?.(task)} activeOpacity={onPress ? 0.7 : 1}>
        <View style={[s.icon, { backgroundColor: th.chip }]}>
          <CatIcon size={20} color={th.mark} fill={th.bg} strokeWidth={2.4} />
        </View>
        <View style={s.main}>
          <View style={s.topRow}>
            <Text style={[s.title, { color: th.fg }, task.is_done && s.titleDone]} numberOfLines={2}>
              {task.title}
            </Text>
          </View>
          <View style={s.meta}>
            {recLabel && (
              <>
                <Text style={[s.metaText, { color: th.sub }]}>↻ {recLabel}</Text>
                <Text style={[s.metaText, { color: th.sub }]}>·</Text>
              </>
            )}
            <Text style={[s.pts, { color: th.mark }]}>+{pts} pts</Text>
          </View>
        </View>
        <View style={s.rightCol}>
          <Text style={[s.dur, { color: th.sub }]}>{fmtDur(min)}</Text>
          {task.is_done && completerName ? (
            <Text style={[s.completer, { color: th.sub }]} numberOfLines={1}>
              ✓ {completerName}{task.completed_at ? ` el ${fmtDate(task.completed_at)}` : ''}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[s.check, { borderColor: th.mark }, task.is_done && { backgroundColor: th.mark }]}
          onPress={handlePress}
          activeOpacity={0.7}
        >
          {task.is_done && <IconCheck size={14} color={C.white} strokeWidth={3} />}
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: R.l, padding: 16, marginBottom: 10, borderWidth: 1 },
  done: { opacity: 0.58 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: R.s, alignItems: 'center', justifyContent: 'center' },
  iconEmoji: { fontSize: 18 },
  main: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', fontFamily: FONT, letterSpacing: -0.2 },
  titleDone: { textDecorationLine: 'line-through' },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  dur: { fontSize: 13, fontFamily: FONT, fontWeight: '500' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  metaText: { fontSize: 12, fontFamily: FONT },
  pts: { fontSize: 12, fontWeight: '700', fontFamily: FONT },
  completer: { fontSize: 11, fontFamily: FONT, marginTop: 4 },
  check: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: C.white, fontSize: 14, fontWeight: '700' },
});
