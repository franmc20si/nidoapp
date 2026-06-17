import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useNidoStore } from '@/store/nidoStore';
import { useCalendarioStore, PeriodInput } from '@/store/calendarioStore';
import { VacationPeriod } from '@/types';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';
import { IconChevronRight } from '@/components/icons';

const VACATION_COLORS = ['#D9663F', '#5B97C4', '#6FA368', '#C06796', '#8E6FCF', '#C99A3C', '#4FA3B5', '#5C5650'];

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toIso(year: number, month: number, day: number) { return `${year}-${pad2(month + 1)}-${pad2(day)}`; }

function monthLabel(year: number, month: number) {
  const name = MONTH_NAMES[month];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

// Matriz de semanas (lunes a domingo) para un mes dado; null = celda fuera de mes.
function monthMatrix(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = (firstDay.getDay() + 6) % 7; // lunes=0

  const cells: (string | null)[] = Array(leadingBlanks).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toIso(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function periodForDay(periods: VacationPeriod[], iso: string): VacationPeriod | undefined {
  return periods.find((p) => p.start_date <= iso && iso <= p.end_date);
}

// ─── Ficha de crear/editar periodo ──────────────────────────────────────────
function PeriodSheet({
  visible, period, draftRange, onClose,
}: {
  visible: boolean;
  period: VacationPeriod | null;
  draftRange: { start: string; end: string } | null;
  onClose: () => void;
}) {
  const { household, user } = useAuthStore();
  const { addPeriod, updatePeriod, deletePeriod } = useCalendarioStore();
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(VACATION_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!period;
  const range = period ? { start: period.start_date, end: period.end_date } : draftRange;

  // Sincroniza el formulario cada vez que la ficha se abre con datos distintos.
  const key = period?.id ?? (draftRange ? `${draftRange.start}_${draftRange.end}` : 'closed');
  const [lastKey, setLastKey] = useState('closed');
  if (visible && key !== lastKey) {
    setLastKey(key);
    setLabel(period?.label ?? '');
    setColor(period?.color ?? VACATION_COLORS[0]);
    setError('');
  }

  if (!range) return null;

  const handleSave = async () => {
    if (!household) return;
    if (!label.trim()) { setError('Ponle un nombre al periodo'); return; }
    setSaving(true);
    setError('');
    const input: PeriodInput = { start_date: range.start, end_date: range.end, label: label.trim(), color };
    const res = isEdit
      ? await updatePeriod(period!.id, input)
      : await addPeriod(household.id, user?.id, input);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo guardar'); return; }
    onClose();
  };

  const doDelete = async () => {
    if (!period) return;
    setDeleting(true);
    const res = await deletePeriod(period.id);
    setDeleting(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo eliminar'); return; }
    onClose();
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm('¿Eliminar este periodo?')) doDelete();
      return;
    }
    Alert.alert('Eliminar periodo', '¿Seguro que quieres eliminar este periodo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: doDelete },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <View style={s.grab} />
          <ScrollView style={s.sheetScroll} contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHeaderRow}>
              <Text style={s.sheetTitle}>{isEdit ? 'Editar periodo' : 'Nuevo periodo'}</Text>
              {isEdit && (
                <TouchableOpacity onPress={handleDelete} disabled={deleting} style={s.deleteBtn}>
                  {deleting ? <ActivityIndicator size="small" color="#c0392b" /> : <Text style={s.deleteBtnText}>Eliminar</Text>}
                </TouchableOpacity>
              )}
            </View>

            <Text style={s.rangeText}>{shortDate(range.start)} — {shortDate(range.end)}</Text>

            <TextInput
              style={s.field}
              placeholder="Etiqueta (ej. Vacaciones playa, Puente…)"
              placeholderTextColor={C.ink3}
              value={label}
              onChangeText={setLabel}
            />

            <Text style={s.sectionLabel}>Color</Text>
            <View style={s.colorRow}>
              {VACATION_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotOn]}
                  onPress={() => setColor(c)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity style={[s.save, { backgroundColor: color }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveText}>{isEdit ? 'Guardar cambios' : 'Guardar periodo'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Cuadrícula de un mes ────────────────────────────────────────────────────
function MonthCard({
  year, month, periods, pendingStart, onDayPress,
}: {
  year: number; month: number; periods: VacationPeriod[];
  pendingStart: string | null;
  onDayPress: (iso: string, period: VacationPeriod | undefined) => void;
}) {
  const weeks = monthMatrix(year, month);
  const monthPeriods = periods.filter((p) => {
    const monthStart = toIso(year, month, 1);
    const monthEnd = toIso(year, month, new Date(year, month + 1, 0).getDate());
    return p.start_date <= monthEnd && p.end_date >= monthStart;
  });

  return (
    <View style={s.monthCard}>
      <Text style={s.monthTitle}>{monthLabel(year, month)}</Text>

      <View style={s.weekHeaderRow}>
        {WEEKDAY_LABELS.map((w) => <Text key={w} style={s.weekHeaderText}>{w}</Text>)}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={s.weekRow}>
          {week.map((iso, di) => {
            if (!iso) return <View key={di} style={s.dayCell} />;
            const period = periodForDay(periods, iso);
            const isPending = iso === pendingStart;
            const isStart = period && iso === period.start_date;
            const isEnd = period && iso === period.end_date;
            const day = Number(iso.split('-')[2]);
            return (
              <TouchableOpacity key={di} style={s.dayCell} onPress={() => onDayPress(iso, period)} activeOpacity={0.7}>
                <View
                  style={[
                    s.dayFill,
                    period && { backgroundColor: period.color },
                    period && isStart && { borderTopLeftRadius: R.s, borderBottomLeftRadius: R.s },
                    period && isEnd && { borderTopRightRadius: R.s, borderBottomRightRadius: R.s },
                    isPending && s.dayPending,
                  ]}
                >
                  <Text style={[s.dayText, period && s.dayTextOn]}>{day}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {monthPeriods.length > 0 && (
        <View style={s.legend}>
          {monthPeriods.map((p) => (
            <TouchableOpacity key={p.id} style={s.legendRow} onPress={() => onDayPress(p.start_date, p)} activeOpacity={0.7}>
              <View style={[s.legendDot, { backgroundColor: p.color }]} />
              <Text style={s.legendLabel} numberOfLines={1}>{p.label}</Text>
              <Text style={s.legendRange}>{shortDate(p.start_date)} — {shortDate(p.end_date)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function CalendarioScreen() {
  const { household } = useAuthStore();
  const { accent } = useNidoStore();
  const { periods, loaded, loadError, loadPeriods } = useCalendarioStore();
  const [refreshing, setRefreshing] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<VacationPeriod | null>(null);
  const [draftRange, setDraftRange] = useState<{ start: string; end: string } | null>(null);

  const fetchPeriods = useCallback(async () => {
    if (!household) return;
    await loadPeriods(household.id);
  }, [household?.id]);

  useFocusEffect(useCallback(() => { fetchPeriods(); }, [fetchPeriods]));

  const today = new Date();
  const baseYear = today.getFullYear();
  const baseMonth = today.getMonth();

  const monthsToShow = [0, 1, 2].map((i) => {
    const total = baseMonth + monthOffset + i;
    return { year: baseYear + Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
  });

  const handleDayPress = (iso: string, period: VacationPeriod | undefined) => {
    if (period) {
      setPendingStart(null);
      setEditingPeriod(period);
      setDraftRange(null);
      setSheetOpen(true);
      return;
    }
    if (!pendingStart) {
      setPendingStart(iso);
      return;
    }
    const [start, end] = pendingStart <= iso ? [pendingStart, iso] : [iso, pendingStart];
    setPendingStart(null);
    setEditingPeriod(null);
    setDraftRange({ start, end });
    setSheetOpen(true);
  };

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
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>VACACIONES</Text>
            <Text style={s.title}>Calendario</Text>
          </View>
          <View style={s.navRow}>
            <TouchableOpacity
              style={[s.navBtn, monthOffset === 0 && s.navBtnDisabled]}
              disabled={monthOffset === 0}
              onPress={() => setMonthOffset((o) => Math.max(0, o - 1))}
            >
              <View style={{ transform: [{ rotate: '180deg' }] }}>
                <IconChevronRight size={18} color={monthOffset === 0 ? C.line : C.ink2} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.navBtn} onPress={() => setMonthOffset((o) => o + 1)}>
              <IconChevronRight size={18} color={C.ink2} />
            </TouchableOpacity>
          </View>
        </View>

        {pendingStart && (
          <TouchableOpacity style={s.pendingBar} onPress={() => setPendingStart(null)} activeOpacity={0.8}>
            <Text style={s.pendingText}>Selecciona el día de fin · {shortDate(pendingStart)} → …</Text>
            <Text style={s.pendingCancel}>Cancelar</Text>
          </TouchableOpacity>
        )}

        {monthsToShow.map(({ year, month }) => (
          <MonthCard
            key={`${year}-${month}`}
            year={year}
            month={month}
            periods={periods}
            pendingStart={pendingStart}
            onDayPress={handleDayPress}
          />
        ))}
      </ScrollView>

      <PeriodSheet
        visible={sheetOpen}
        period={editingPeriod}
        draftRange={draftRange}
        onClose={() => { setSheetOpen(false); setEditingPeriod(null); setDraftRange(null); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 16 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '500' },
  title: { fontSize: 30, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.6 },
  navRow: { flexDirection: 'row', gap: 8 },
  navBtn: { width: 36, height: 36, borderRadius: R.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.5 },

  pendingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 20, marginBottom: 14, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.brandWash, borderRadius: R.l,
  },
  pendingText: { fontSize: 13, color: C.ink2, fontFamily: FONT, fontWeight: '500' },
  pendingCancel: { fontSize: 13, color: C.brand, fontFamily: FONT, fontWeight: '600' },

  monthCard: { marginHorizontal: 20, backgroundColor: C.card, borderRadius: R.xl, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: C.line },
  monthTitle: { fontSize: 18, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.3, marginBottom: 14 },

  weekHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  weekHeaderText: { flex: 1, textAlign: 'center', fontSize: 11, color: C.ink3, fontFamily: FONT, fontWeight: '600' },

  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, aspectRatio: 1, padding: 1.5 },
  dayFill: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  dayPending: { borderWidth: 2, borderColor: C.brand },
  dayText: { fontSize: 13, color: C.ink2, fontFamily: FONT },
  dayTextOn: { color: C.white, fontWeight: '600' },

  legend: { marginTop: 14, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13.5, color: C.ink, fontFamily: FONT, fontWeight: '500' },
  legendRange: { fontSize: 12, color: C.ink3, fontFamily: FONT },

  // Ficha
  scrim: { flex: 1, backgroundColor: 'rgba(33,28,23,0.42)' },
  sheet: { backgroundColor: C.paper, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '88%' },
  sheetScroll: {},
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginTop: 12 },
  sheetBody: { padding: 22, paddingBottom: 40 },

  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1.5, borderColor: '#c0392b' },
  deleteBtnText: { color: '#c0392b', fontWeight: '600', fontSize: 13, fontFamily: FONT },

  rangeText: { fontSize: 14, color: C.ink2, fontFamily: FONT, marginBottom: 18 },

  field: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 16, fontSize: 17, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginBottom: 20 },

  sectionLabel: { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, letterSpacing: 0.2, marginBottom: 10, textTransform: 'uppercase' },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 22, flexWrap: 'wrap' },
  colorDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent' },
  colorDotOn: { borderColor: C.ink },

  errorText: { color: '#c0392b', fontSize: 13, fontFamily: FONT, marginBottom: 10, textAlign: 'center' },
  save: { borderRadius: R.pill, paddingVertical: 17, alignItems: 'center' },
  saveText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
