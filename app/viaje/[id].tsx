import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { useCalendarioStore } from '@/store/calendarioStore';
import { useTripStore, TripItemInput } from '@/store/tripStore';
import { TripItem, TripItemKind } from '@/types';
import { extractPlaceName, looksLikeMapsUrl, openMaps } from '@/lib/maps';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';
import BottomSheet from '@/components/BottomSheet';
import PressScale from '@/components/PressScale';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const KINDS: { key: TripItemKind; label: string; emoji: string }[] = [
  { key: 'ver',    label: 'Ver',    emoji: '📸' },
  { key: 'comer',  label: 'Comer',  emoji: '🍽️' },
  { key: 'dormir', label: 'Dormir', emoji: '🛏️' },
];

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toIso(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function shortDate(iso: string) { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTH_SHORT[m - 1]}`; }

function tripDays(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (d <= last) { out.push(toIso(d)); d.setDate(d.getDate() + 1); }
  return out;
}

function dayChipLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return { dow: WEEKDAYS[d.getDay()], num: d.getDate() };
}

// ─── Sheet para añadir un sitio ───────────────────────────────────────────────
function AddItemSheet({
  visible, kind, day, periodId, color, onClose,
}: {
  visible: boolean;
  kind: TripItemKind | null;
  day: string;
  periodId: string;
  color: string;
  onClose: () => void;
}) {
  const { household, user } = useAuthStore();
  const { addItem } = useTripStore();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Resetea el formulario cada vez que se abre con un contexto distinto.
  const key = visible ? `${kind}_${day}` : 'closed';
  const [lastKey, setLastKey] = useState('closed');
  if (visible && key !== lastKey) {
    setLastKey(key);
    setTitle(''); setUrl(''); setError(''); setSaving(false);
  }

  if (!kind) return null;
  const kindMeta = KINDS.find((k) => k.key === kind)!;

  // Al pegar el link, si el nombre está vacío intentamos rellenarlo del propio link.
  const onChangeUrl = (v: string) => {
    setUrl(v);
    if (!title.trim()) {
      const name = extractPlaceName(v);
      if (name) setTitle(name);
    }
  };

  const handleSave = async () => {
    if (!household) return;
    const clean = url.trim();
    if (!title.trim() && !clean) { setError('Añade un nombre o un link'); return; }
    if (clean && !looksLikeMapsUrl(clean)) { setError('El link no parece de Google Maps'); return; }
    setSaving(true); setError('');
    const place = clean ? extractPlaceName(clean) : null;
    const input: TripItemInput = {
      day,
      kind,
      title: title.trim() || place || 'Sitio',
      url: clean || null,
      place,
    };
    const res = await addItem(household.id, user?.id, periodId, input);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo guardar'); return; }
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView contentContainerStyle={a.body} keyboardShouldPersistTaps="handled">
        <Text style={a.eyebrow}>{kindMeta.emoji} {kindMeta.label.toUpperCase()} · {shortDate(day)}</Text>
        <Text style={a.title}>Añadir sitio</Text>

        <TextInput
          style={a.field}
          placeholder="Nombre (ej. Sagrada Familia)"
          placeholderTextColor={C.ink3}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={a.field}
          placeholder="Link de Google Maps (opcional)"
          placeholderTextColor={C.ink3}
          value={url}
          onChangeText={onChangeUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={a.hint}>Pega el enlace de “Compartir” de Google Maps. Mostraremos el sitio con un pin y, al tocarlo, se abrirá en Maps.</Text>

        {error ? <Text style={a.error}>{error}</Text> : null}

        <PressScale style={[a.save, { backgroundColor: color }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={C.white} /> : <Text style={a.saveText}>Guardar</Text>}
        </PressScale>
      </ScrollView>
    </BottomSheet>
  );
}

// ─── Tarjeta de un sitio ──────────────────────────────────────────────────────
function ItemCard({ item, color, onDelete }: { item: TripItem; color: string; onDelete: () => void }) {
  return (
    <View style={c.card}>
      <PressScale
        style={c.tap}
        onPress={() => item.url && openMaps(item.url)}
        disabled={!item.url}
      >
        <View style={[c.pin, { backgroundColor: color }]}>
          <Text style={c.pinGlyph}>📍</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={c.name} numberOfLines={1}>{item.title}</Text>
          <Text style={c.sub} numberOfLines={1}>
            {item.url ? (item.place ?? 'Ver en Google Maps') : 'Sin enlace'}
          </Text>
        </View>
      </PressScale>
      <TouchableOpacity style={c.del} onPress={onDelete} hitSlop={8}>
        <Text style={c.delText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const periodId = String(id);
  const { accent } = useNidoStore();
  const { household } = useAuthStore();
  const { periods, loaded: periodsLoaded, loadPeriods } = useCalendarioStore();
  const { itemsByPeriod, loadedPeriods, loadErrorFor, loadItems } = useTripStore();

  const period = periods.find((p) => p.id === periodId);
  const days = useMemo(() => (period ? tripDays(period.start_date, period.end_date) : []), [period?.start_date, period?.end_date]);

  // Día seleccionado: hoy si cae dentro del viaje, si no el primero.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const activeDay = selectedDay && days.includes(selectedDay)
    ? selectedDay
    : (days.includes(toIso(new Date())) ? toIso(new Date()) : days[0] ?? null);

  const [addKind, setAddKind] = useState<TripItemKind | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!household) return;
    if (!periodsLoaded) await loadPeriods(household.id);
    await loadItems(household.id, periodId);
  }, [household?.id, periodId, periodsLoaded]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const items = itemsByPeriod[periodId] ?? [];
  const color = period?.color ?? accent.hex;

  const openAdd = (kind: TripItemKind) => { setAddKind(kind); setSheetOpen(true); };

  const confirmDelete = (item: TripItem) => {
    const doDelete = () => useTripStore.getState().deleteItem(periodId, item.id);
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm(`¿Eliminar “${item.title}”?`)) doDelete();
      return;
    }
    Alert.alert('Eliminar sitio', `¿Eliminar “${item.title}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: doDelete },
    ]);
  };

  // Estados de carga
  if (periodsLoaded && !period) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.notFound}>
          <Text style={s.notFoundEmoji}>🧭</Text>
          <Text style={s.notFoundTitle}>Viaje no encontrado</Text>
          <TouchableOpacity style={[s.backLink]} onPress={() => router.back()}>
            <Text style={[s.backLinkText, { color: accent.hex }]}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  if (!periodsLoaded || (!loadedPeriods[periodId] && loadErrorFor !== periodId && items.length === 0)) {
    return <SafeAreaView style={s.root}><ScreenLoader color={accent.hex} /></SafeAreaView>;
  }
  if (loadErrorFor === periodId && items.length === 0) {
    return <SafeAreaView style={s.root}><ScreenError onRetry={fetchAll} color={accent.hex} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false} alwaysBounceVertical={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Cabecera */}
        <View style={s.topbar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} hitSlop={8}>
            <Text style={s.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>VIAJE ✈️</Text>
            <Text style={s.title} numberOfLines={1}>{period?.label}</Text>
          </View>
        </View>
        <Text style={s.range}>{shortDate(period!.start_date)} — {shortDate(period!.end_date)}</Text>

        {/* Selector de días */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dayStrip}>
          {days.map((iso, i) => {
            const { dow, num } = dayChipLabel(iso);
            const on = iso === activeDay;
            return (
              <PressScale key={iso} style={[s.dayChip, on && { backgroundColor: color, borderColor: color }]} onPress={() => setSelectedDay(iso)} scaleTo={0.94}>
                <Text style={[s.dayChipTop, on && s.dayChipTextOn]}>Día {i + 1}</Text>
                <Text style={[s.dayChipDow, on && s.dayChipTextOn]}>{dow} {num}</Text>
              </PressScale>
            );
          })}
        </ScrollView>

        {/* Secciones del día activo */}
        {activeDay && KINDS.map((k) => {
          const list = items.filter((it) => it.day === activeDay && it.kind === k.key);
          return (
            <View key={k.key} style={s.section}>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>{k.emoji} {k.label}</Text>
                <PressScale style={s.addChip} onPress={() => openAdd(k.key)} scaleTo={0.94}>
                  <Text style={[s.addChipText, { color }]}>＋ Añadir</Text>
                </PressScale>
              </View>
              {list.length === 0 ? (
                <Text style={s.sectionEmpty}>Nada planeado todavía</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {list.map((it) => (
                    <ItemCard key={it.id} item={it} color={color} onDelete={() => confirmDelete(it)} />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <AddItemSheet
        visible={sheetOpen}
        kind={addKind}
        day={activeDay ?? ''}
        periodId={periodId}
        color={color}
        onClose={() => { setSheetOpen(false); setAddKind(null); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 4, gap: 6 },
  backBtn: { width: 34, height: 34, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 2, marginLeft: -6 },
  backChevron: { fontSize: 30, color: C.ink2, fontFamily: FONT, lineHeight: 32, marginTop: -4 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '500' },
  title: { fontSize: 28, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.6 },
  range: { fontSize: 14, color: C.ink3, fontFamily: FONT, paddingHorizontal: 22, marginBottom: 14 },

  dayStrip: { paddingHorizontal: 20, gap: 8, paddingBottom: 6 },
  dayChip: { minWidth: 60, paddingHorizontal: 12, paddingVertical: 10, borderRadius: R.m, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  dayChipTop: { fontSize: 11, color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 2 },
  dayChipDow: { fontSize: 14, color: C.ink, fontFamily: FONT, fontWeight: '600' },
  dayChipTextOn: { color: C.white },

  section: { paddingHorizontal: 20, marginTop: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 17, color: C.ink, fontFamily: FONT, fontWeight: '600', letterSpacing: -0.2 },
  addChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.pill, backgroundColor: C.brandWash },
  addChipText: { fontSize: 13, fontFamily: FONT, fontWeight: '600' },
  sectionEmpty: { fontSize: 13.5, color: C.ink3, fontFamily: FONT, fontStyle: 'italic', paddingVertical: 4 },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  notFoundEmoji: { fontSize: 44, marginBottom: 14 },
  notFoundTitle: { fontSize: 19, color: C.ink, fontFamily: FONT, fontWeight: '600', marginBottom: 16 },
  backLink: { paddingVertical: 8, paddingHorizontal: 16 },
  backLinkText: { fontSize: 15, fontFamily: FONT, fontWeight: '600' },
});

const c = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, paddingRight: 6 },
  tap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  pin: { width: 48, height: 48, borderRadius: R.s, alignItems: 'center', justifyContent: 'center' },
  pinGlyph: { fontSize: 22 },
  name: { fontSize: 15.5, color: C.ink, fontFamily: FONT, fontWeight: '600', marginBottom: 2 },
  sub: { fontSize: 12.5, color: C.ink3, fontFamily: FONT },
  del: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  delText: { fontSize: 15, color: C.ink3, fontFamily: FONT },
});

const a = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 36 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4, marginBottom: 18 },
  field: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 15, fontSize: 16, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginBottom: 12 },
  hint: { fontSize: 12.5, color: C.ink3, fontFamily: FONT, lineHeight: 18, marginBottom: 18 },
  error: { color: '#c0392b', fontSize: 13, fontFamily: FONT, marginBottom: 12, textAlign: 'center' },
  save: { borderRadius: R.pill, paddingVertical: 16, alignItems: 'center' },
  saveText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
