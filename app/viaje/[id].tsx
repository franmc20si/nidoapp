import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Platform, Alert, useWindowDimensions,
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
import { IconChevronRight } from '@/components/icons';

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

function money(n: number) { return n.toFixed(2).replace('.', ',') + ' €'; }
function parsePrice(s: string): number | null {
  const v = parseFloat(s.replace(',', '.').replace(/[^0-9.]/g, ''));
  return isNaN(v) ? null : v;
}

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
  visible, kind, day, days, periodId, color, onClose,
}: {
  visible: boolean;
  kind: TripItemKind | null;
  day: string;
  days: string[];        // todos los días del viaje (para limitar las noches)
  periodId: string;
  color: string;
  onClose: () => void;
}) {
  const { household, user } = useAuthStore();
  const { addItems } = useTripStore();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [price, setPrice] = useState('');
  const [nights, setNights] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Resetea el formulario cada vez que se abre con un contexto distinto.
  const key = visible ? `${kind}_${day}` : 'closed';
  const [lastKey, setLastKey] = useState('closed');
  if (visible && key !== lastKey) {
    setLastKey(key);
    setTitle(''); setUrl(''); setPrice(''); setNights('1'); setError(''); setSaving(false);
  }

  if (!kind) return null;
  const kindMeta = KINDS.find((k) => k.key === kind)!;
  const isLodging = kind === 'dormir';

  // Noches posibles desde el día elegido hasta el final del viaje (no se pueden
  // crear entradas fuera del rango del viaje).
  const startIdx = days.indexOf(day);
  const maxNights = startIdx >= 0 ? days.length - startIdx : 1;
  const nightsNum = Math.min(Math.max(parseInt(nights, 10) || 1, 1), Math.max(maxNights, 1));
  const coveredDays = startIdx >= 0 ? days.slice(startIdx, startIdx + nightsNum) : [day];
  const decNights = () => setNights(String(Math.max(nightsNum - 1, 1)));
  const incNights = () => setNights(String(Math.min(nightsNum + 1, maxNights)));

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
    const base = {
      kind,
      title: title.trim() || place || 'Sitio',
      url: clean || null,
      place,
      price: parsePrice(price),
    };
    // En "dormir" se pueden crear varias noches consecutivas (un item por día).
    const n = isLodging ? Math.min(Math.max(parseInt(nights, 10) || 1, 1), maxNights) : 1;
    const targetDays = startIdx >= 0 ? days.slice(startIdx, startIdx + n) : [day];
    const inputs: TripItemInput[] = targetDays.map((d) => ({ ...base, day: d }));
    const res = await addItems(household.id, user?.id, periodId, inputs);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo guardar'); return; }
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView contentContainerStyle={a.body} keyboardShouldPersistTaps="handled">
        <Text style={a.eyebrow}>{kindMeta.emoji} {kindMeta.label.toUpperCase()} · {shortDate(day)}</Text>
        <Text style={a.title}>{isLodging ? 'Añadir alojamiento' : 'Añadir sitio'}</Text>

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
        <TextInput
          style={a.field}
          placeholder={isLodging ? 'Precio por noche (opcional)' : 'Precio (opcional, ej. 12,50)'}
          placeholderTextColor={C.ink3}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />

        {isLodging && (
          <View style={a.nightsRow}>
            <View style={{ flex: 1 }}>
              <Text style={a.nightsLabel}>Noches</Text>
              <Text style={a.nightsHint}>
                {nightsNum} {nightsNum === 1 ? 'noche' : 'noches'} · {shortDate(coveredDays[0])} → {shortDate(coveredDays[coveredDays.length - 1])}
              </Text>
            </View>
            <View style={a.stepper}>
              <PressScale style={[a.stepBtn, nightsNum <= 1 && a.stepBtnOff]} onPress={decNights} disabled={nightsNum <= 1} scaleTo={0.9}>
                <Text style={a.stepTxt}>−</Text>
              </PressScale>
              <Text style={a.stepNum}>{nightsNum}</Text>
              <PressScale style={[a.stepBtn, nightsNum >= maxNights && a.stepBtnOff]} onPress={incNights} disabled={nightsNum >= maxNights} scaleTo={0.9}>
                <Text style={a.stepTxt}>＋</Text>
              </PressScale>
            </View>
          </View>
        )}

        <Text style={a.hint}>
          {isLodging
            ? 'Si te quedas varias noches en el mismo sitio, sube las noches y se añadirá a cada día automáticamente. El precio es por noche.'
            : 'Pega el enlace de “Compartir” de Google Maps. Mostraremos el sitio con un pin y, al tocarlo, se abrirá en Maps.'}
        </Text>

        {error ? <Text style={a.error}>{error}</Text> : null}

        <PressScale style={[a.save, { backgroundColor: color }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={C.white} /> : <Text style={a.saveText}>Guardar</Text>}
        </PressScale>
      </ScrollView>
    </BottomSheet>
  );
}

// ─── Tarjeta de un sitio ──────────────────────────────────────────────────────
function ItemCard({ item, color, onDelete, compact }: { item: TripItem; color: string; onDelete: () => void; compact?: boolean }) {
  return (
    <View style={c.card}>
      <PressScale
        style={[c.tap, compact && c.tapC]}
        onPress={() => item.url && openMaps(item.url)}
        disabled={!item.url}
      >
        <View style={[c.pin, compact && c.pinC, { backgroundColor: color }]}>
          <Text style={compact ? c.pinGlyphC : c.pinGlyph}>📍</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={c.name} numberOfLines={compact ? 2 : 1}>{item.title}</Text>
          {compact
            ? (item.price != null && <Text style={[c.priceC, { color }]}>{money(item.price)}</Text>)
            : (
              <Text style={c.sub} numberOfLines={1}>
                {item.url ? (item.place ?? 'Ver en Google Maps') : 'Sin enlace'}
              </Text>
            )}
        </View>
        {!compact && item.price != null && <Text style={[c.price, { color }]}>{money(item.price)}</Text>}
      </PressScale>
      <TouchableOpacity style={[c.del, compact && c.delC]} onPress={onDelete} hitSlop={8}>
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
  const [addDay, setAddDay] = useState<string>('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [page, setPage] = useState(0);

  // En escritorio mostramos los días en columnas paralelas (hasta 7 a la vez),
  // sin tener que pinchar cada día. En móvil/tablet, selector + día activo.
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 920;
  const PER_PAGE = 7;
  const totalPages = Math.max(1, Math.ceil(days.length / PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageDays = isWide ? days.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE) : [];

  const fetchAll = useCallback(async () => {
    if (!household) return;
    if (!periodsLoaded) await loadPeriods(household.id);
    await loadItems(household.id, periodId);
  }, [household?.id, periodId, periodsLoaded]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const items = itemsByPeriod[periodId] ?? [];
  const color = period?.color ?? accent.hex;
  // Total del viaje entero (todos los días y categorías), siempre visible al pie.
  const tripTotal = items.reduce((acc, it) => acc + (it.price ?? 0), 0);

  const openAdd = (kind: TripItemKind, day: string) => { setAddKind(kind); setAddDay(day); setSheetOpen(true); };

  // Renderiza las 3 secciones (Ver/Comer/Dormir) de un día. `compact` para las
  // columnas estrechas de escritorio.
  const renderSections = (day: string, compact: boolean) => KINDS.map((k) => {
    const list = items.filter((it) => it.day === day && it.kind === k.key);
    return (
      <View key={k.key} style={compact ? s.sectionC : s.section}>
        <View style={s.sectionHead}>
          <Text style={[s.sectionTitle, compact && s.sectionTitleC]}>{k.emoji} {k.label}</Text>
          <PressScale style={s.addChip} onPress={() => openAdd(k.key, day)} scaleTo={0.94}>
            <Text style={[s.addChipText, { color }]}>{compact ? '＋' : '＋ Añadir'}</Text>
          </PressScale>
        </View>
        {list.length === 0 ? (
          <Text style={s.sectionEmpty}>{compact ? '—' : 'Nada planeado todavía'}</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {list.map((it) => (
              <ItemCard key={it.id} item={it} color={color} onDelete={() => confirmDelete(it)} compact={compact} />
            ))}
          </View>
        )}
      </View>
    );
  });

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
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} alwaysBounceVertical={false} contentContainerStyle={{ paddingBottom: 28 }}>
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

        {isWide ? (
          /* ESCRITORIO: días en columnas paralelas, todo visible a la vez */
          <View style={s.desktop}>
            {totalPages > 1 && (
              <View style={s.pager}>
                <TouchableOpacity
                  style={[s.pagerBtn, safePage === 0 && s.pagerBtnOff]}
                  disabled={safePage === 0}
                  onPress={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <View style={{ transform: [{ rotate: '180deg' }] }}>
                    <IconChevronRight size={16} color={safePage === 0 ? C.line : C.ink2} />
                  </View>
                </TouchableOpacity>
                <Text style={s.pagerLabel}>Días {safePage * PER_PAGE + 1}–{Math.min((safePage + 1) * PER_PAGE, days.length)} de {days.length}</Text>
                <TouchableOpacity
                  style={[s.pagerBtn, safePage >= totalPages - 1 && s.pagerBtnOff]}
                  disabled={safePage >= totalPages - 1}
                  onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  <IconChevronRight size={16} color={safePage >= totalPages - 1 ? C.line : C.ink2} />
                </TouchableOpacity>
              </View>
            )}
            <View style={s.daysRow}>
              {pageDays.map((iso) => {
                const { dow, num } = dayChipLabel(iso);
                const idx = days.indexOf(iso);
                return (
                  <View key={iso} style={s.dayCol}>
                    <View style={[s.dayColHead, { borderTopColor: color }]}>
                      <Text style={s.dayColTop}>Día {idx + 1}</Text>
                      <Text style={s.dayColDow}>{dow} {num}</Text>
                    </View>
                    {renderSections(iso, true)}
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          /* MÓVIL/TABLET: selector de día + secciones del día activo */
          <>
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

            {activeDay && renderSections(activeDay, false)}
          </>
        )}
      </ScrollView>

      {/* Total del viaje — siempre visible, independiente del día */}
      <View style={s.footer}>
        <Text style={s.footerLabel}>Total del viaje</Text>
        <Text style={[s.footerTotal, { color }]}>{money(tripTotal)}</Text>
      </View>

      <AddItemSheet
        visible={sheetOpen}
        kind={addKind}
        day={addDay}
        days={days}
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
  sectionC: { marginTop: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 17, color: C.ink, fontFamily: FONT, fontWeight: '600', letterSpacing: -0.2 },
  sectionTitleC: { fontSize: 15 },
  addChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.pill, backgroundColor: C.brandWash },
  addChipText: { fontSize: 13, fontFamily: FONT, fontWeight: '600' },
  sectionEmpty: { fontSize: 13.5, color: C.ink3, fontFamily: FONT, fontStyle: 'italic', paddingVertical: 4 },

  // Escritorio: días en columnas
  desktop: { paddingHorizontal: 20, marginTop: 6 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 },
  pagerBtn: { width: 32, height: 32, borderRadius: R.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  pagerBtnOff: { opacity: 0.5 },
  pagerLabel: { fontSize: 13.5, color: C.ink2, fontFamily: FONT, fontWeight: '600' },
  daysRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dayCol: { flex: 1, backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingBottom: 14 },
  dayColHead: { alignItems: 'center', paddingVertical: 12, borderTopWidth: 3, borderTopLeftRadius: R.l, borderTopRightRadius: R.l, marginHorizontal: -12, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: C.line },
  dayColTop: { fontSize: 11, color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 1 },
  dayColDow: { fontSize: 15, color: C.ink, fontFamily: FONT, fontWeight: '700' },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingVertical: 16,
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line,
  },
  footerLabel: { fontSize: 14, color: C.ink2, fontFamily: FONT, fontWeight: '600' },
  footerTotal: { fontSize: 20, fontFamily: FONT, fontWeight: '700', letterSpacing: -0.4 },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  notFoundEmoji: { fontSize: 44, marginBottom: 14 },
  notFoundTitle: { fontSize: 19, color: C.ink, fontFamily: FONT, fontWeight: '600', marginBottom: 16 },
  backLink: { paddingVertical: 8, paddingHorizontal: 16 },
  backLinkText: { fontSize: 15, fontFamily: FONT, fontWeight: '600' },
});

const c = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, paddingRight: 6 },
  tap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  tapC: { gap: 8, padding: 8 },
  pin: { width: 48, height: 48, borderRadius: R.s, alignItems: 'center', justifyContent: 'center' },
  pinC: { width: 34, height: 34, borderRadius: 9 },
  pinGlyph: { fontSize: 22 },
  pinGlyphC: { fontSize: 16 },
  name: { fontSize: 15.5, color: C.ink, fontFamily: FONT, fontWeight: '600', marginBottom: 2 },
  sub: { fontSize: 12.5, color: C.ink3, fontFamily: FONT },
  price: { fontSize: 14.5, fontFamily: FONT, fontWeight: '700', marginLeft: 8 },
  priceC: { fontSize: 13, fontFamily: FONT, fontWeight: '700' },
  del: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  delC: { width: 26, alignSelf: 'flex-start', paddingTop: 6 },
  delText: { fontSize: 15, color: C.ink3, fontFamily: FONT },
});

const a = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 36 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4, marginBottom: 18 },
  field: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 15, fontSize: 16, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginBottom: 12 },
  hint: { fontSize: 12.5, color: C.ink3, fontFamily: FONT, lineHeight: 18, marginBottom: 18 },
  nightsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2, marginBottom: 14 },
  nightsLabel: { fontSize: 15.5, color: C.ink, fontFamily: FONT, fontWeight: '600', marginBottom: 2 },
  nightsHint: { fontSize: 12.5, color: C.ink3, fontFamily: FONT },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 36, height: 36, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  stepBtnOff: { opacity: 0.4 },
  stepTxt: { fontSize: 18, color: C.ink, fontFamily: FONT, fontWeight: '600', lineHeight: 20 },
  stepNum: { minWidth: 28, textAlign: 'center', fontSize: 17, color: C.ink, fontFamily: FONT, fontWeight: '700' },
  error: { color: '#c0392b', fontSize: 13, fontFamily: FONT, marginBottom: 12, textAlign: 'center' },
  save: { borderRadius: R.pill, paddingVertical: 16, alignItems: 'center' },
  saveText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
