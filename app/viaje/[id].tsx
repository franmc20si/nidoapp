import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Platform, Alert, useWindowDimensions,
  Animated, PanResponder, PanResponderGestureState, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { useCalendarioStore } from '@/store/calendarioStore';
import { useTripStore, TripItemInput } from '@/store/tripStore';
import { TripItem, TripItemKind } from '@/types';
import { extractPlaceName, looksLikeUrl, openLink, linkLabel } from '@/lib/maps';
import { ScreenLoader, ScreenError } from '@/components/ScreenLoader';
import BottomSheet from '@/components/BottomSheet';
import PressScale from '@/components/PressScale';
import { IconChevronRight } from '@/components/icons';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const KINDS: { key: TripItemKind; label: string; emoji: string }[] = [
  { key: 'manana', label: 'Mañana', emoji: '☀️' },
  { key: 'comida', label: 'Comida', emoji: '🍽️' },
  { key: 'tarde',  label: 'Tarde',  emoji: '☕' },
  { key: 'cena',   label: 'Cena',   emoji: '🌙' },
  { key: 'dormir', label: 'Dormir', emoji: '🛏️' },
];

// Punto de agarre del clon flotante bajo el dedo/cursor al arrastrar.
const CLONE_GRAB = 22;
// Salida suave (ease-out fuerte) — Emil: la salida siempre decidida y corta.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
// En web, promocionar el clon a su propia capa de composición = arrastre fluido.
const cloneHint = Platform.select({ web: { willChange: 'transform' }, default: {} }) as any;

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toIso(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function shortDate(iso: string) { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTH_SHORT[m - 1]}`; }

function money(n: number) { return n.toFixed(2).replace('.', ',') + ' €'; }
function parsePrice(s: string): number | null {
  const v = parseFloat(s.replace(',', '.').replace(/[^0-9.]/g, ''));
  return isNaN(v) ? null : v;
}
function priceToInput(n: number | null): string {
  return n == null ? '' : String(n).replace('.', ',');
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

const cellKey = (day: string, kind: TripItemKind) => `${day}|${kind}`;

// ─── Sheet unificado: añadir un sitio nuevo o editar/mover uno existente ───────
function ItemSheet({
  visible, mode, item, addKind, addDay, days, periodId, color, openSeq, onClose, onDelete,
}: {
  visible: boolean;
  mode: 'add' | 'edit';
  item: TripItem | null;       // presente en modo edit
  addKind: TripItemKind;       // contexto en modo add
  addDay: string;
  days: string[];              // todos los días del viaje
  periodId: string;
  color: string;
  openSeq: number;             // sube en cada apertura → dispara el reset del formulario
  onClose: () => void;
  onDelete: (id: string, title: string) => void;
}) {
  const { household, user } = useAuthStore();
  const { addItems } = useTripStore();

  // Estado del formulario. Se reinicia SIEMPRE que se abre (openSeq cambia), lo
  // que arregla el bug de "aparece el último sitio" al añadir el 2º/3er ítem.
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [selKind, setSelKind] = useState<TripItemKind>('manana');
  const [selDay, setSelDay] = useState('');
  const [nights, setNights] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode === 'edit' && item) {
      setFormMode('edit'); setEditId(item.id);
      setTitle(item.title); setUrl(item.url ?? ''); setPrice(priceToInput(item.price));
      setNotes(item.notes ?? ''); setSelKind(item.kind); setSelDay(item.day);
    } else {
      setFormMode('add'); setEditId(null);
      setTitle(''); setUrl(''); setPrice(''); setNotes(''); setSelKind(addKind); setSelDay(addDay);
    }
    setNights('1'); setError(''); setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSeq]);

  const isLodging = selKind === 'dormir';
  const kindMeta = KINDS.find((k) => k.key === selKind)!;

  // Noches posibles desde el día elegido hasta el final del viaje (solo add+dormir).
  const startIdx = days.indexOf(selDay);
  const maxNights = startIdx >= 0 ? days.length - startIdx : 1;
  const nightsNum = Math.min(Math.max(parseInt(nights, 10) || 1, 1), Math.max(maxNights, 1));
  const coveredDays = startIdx >= 0 ? days.slice(startIdx, startIdx + nightsNum) : [selDay];
  const showNights = formMode === 'add' && isLodging;
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

  const canOpenLink = url.trim() !== '' && looksLikeUrl(url.trim());

  const handleSave = async () => {
    if (!household) return;
    const cleanTitle = title.trim();
    const cleanUrl = url.trim();
    if (!cleanTitle && !cleanUrl) { setError('Añade un nombre o un enlace'); return; }
    if (cleanUrl && !looksLikeUrl(cleanUrl)) { setError('El enlace no parece válido'); return; }
    setSaving(true); setError('');
    const place = cleanUrl ? extractPlaceName(cleanUrl) : null;
    const base = {
      kind: selKind,
      title: cleanTitle || place || 'Sitio',
      url: cleanUrl || null,
      place,
      price: parsePrice(price),
      notes: notes.trim() || null,
    };

    if (formMode === 'edit' && editId) {
      // Editar (y, si cambió franja/día, mover el sitio).
      const res = await useTripStore.getState().updateItem(periodId, editId, { ...base, day: selDay });
      setSaving(false);
      if (!res.ok) { setError(res.error ?? 'No se pudo guardar'); return; }
      onClose();
      return;
    }

    // Añadir. En "dormir" se pueden crear varias noches consecutivas (un item por día).
    const n = isLodging ? Math.min(Math.max(parseInt(nights, 10) || 1, 1), maxNights) : 1;
    const targetDays = startIdx >= 0 ? days.slice(startIdx, startIdx + n) : [selDay];
    const inputs: TripItemInput[] = targetDays.map((d) => ({ ...base, day: d }));
    const res = await addItems(household.id, user?.id, periodId, inputs);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo guardar'); return; }
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} sheetStyle={{ maxHeight: '92%' }}>
      <ScrollView contentContainerStyle={a.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {formMode === 'edit' ? (
          <Text style={a.eyebrow}>EDITAR SITIO</Text>
        ) : (
          <Text style={a.eyebrow}>{kindMeta.emoji} {kindMeta.label.toUpperCase()} · {shortDate(selDay)}</Text>
        )}
        <Text style={a.title}>
          {formMode === 'edit' ? 'Editar sitio' : (isLodging ? 'Añadir alojamiento' : 'Añadir sitio')}
        </Text>

        <TextInput
          style={a.field}
          placeholder="Nombre (ej. Sagrada Familia)"
          placeholderTextColor={C.ink3}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={a.field}
          placeholder="Enlace (opcional)"
          placeholderTextColor={C.ink3}
          value={url}
          onChangeText={onChangeUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {canOpenLink && (
          <PressScale style={a.openLink} onPress={() => openLink(url.trim())} scaleTo={0.96}>
            <Text style={[a.openLinkTxt, { color }]}>Abrir enlace ↗</Text>
          </PressScale>
        )}
        <TextInput
          style={a.field}
          placeholder={isLodging ? 'Precio por noche (opcional)' : 'Precio (opcional, ej. 12,50)'}
          placeholderTextColor={C.ink3}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />
        <TextInput
          style={[a.field, a.notesField]}
          placeholder="Notas (horarios, reserva, comentarios…)"
          placeholderTextColor={C.ink3}
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
        />

        {showNights && (
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

        {formMode === 'add' && (
          <Text style={a.hint}>
            {isLodging
              ? 'Si te quedas varias noches en el mismo sitio, sube las noches y se añadirá a cada día automáticamente. El precio es por noche.'
              : 'Puedes pegar cualquier enlace (Google Maps, una web, una reserva…).'}
          </Text>
        )}

        {error ? <Text style={a.error}>{error}</Text> : null}

        <PressScale style={[a.save, { backgroundColor: color }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={C.white} /> : <Text style={a.saveText}>{formMode === 'edit' ? 'Guardar cambios' : 'Guardar'}</Text>}
        </PressScale>

        {formMode === 'edit' && editId && (
          <TouchableOpacity style={a.deleteBtn} onPress={() => onDelete(editId, title.trim() || 'este sitio')} activeOpacity={0.7}>
            <Text style={a.deleteTxt}>Eliminar sitio</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

// Handlers de arrastre que el padre inyecta en las tarjetas (solo escritorio).
interface DragApi {
  onStart: (item: TripItem, g: PanResponderGestureState) => void;
  onMove: (g: PanResponderGestureState) => void;
  onEnd: (g: PanResponderGestureState) => void;
}

// ─── Tarjeta de un sitio ──────────────────────────────────────────────────────
// Memoizada: durante el arrastre solo cambia el resalte de la celda destino, así
// que las tarjetas NO deben re-renderizarse (evita el lag del clon). Los callbacks
// (onPress/drag) cierran sobre refs/setState estables, así que ignorar su identidad
// en la comparación es seguro aunque se salte el render.
const ItemCard = memo(function ItemCard({
  item, color, onPress, onDelete, compact, drag, dragging, justMoved,
}: {
  item: TripItem;
  color: string;
  onPress: () => void;
  onDelete: () => void;
  compact?: boolean;
  drag?: DragApi;        // presente → la tarjeta es arrastrable
  dragging?: boolean;    // es la tarjeta que se está arrastrando ahora mismo
  justMoved?: boolean;   // acaba de aterrizar aquí tras soltarla → entra animada
}) {
  const hasUrl = !!item.url;
  const sub = hasUrl ? (item.place ?? linkLabel(item.url!)) : null;
  const hasNotes = !!(item.notes && item.notes.trim());

  // Entrada al aterrizar en la columna destino: fade + subida + escala.
  const enter = useRef(new Animated.Value(justMoved ? 0 : 1)).current;
  useEffect(() => {
    if (!justMoved) return;
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 280, easing: EASE_OUT, useNativeDriver: false }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const enterStyle = justMoved
    ? {
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
        ],
      }
    : null;

  // PanResponder creado una sola vez; lee item/drag "vivos" vía ref.
  const latest = useRef({ item, drag });
  latest.current = { item, drag };
  // Marca que hubo un arrastre real para descartar el "click fantasma" que el
  // navegador dispara sobre la tarjeta al soltar (si no, se abría la edición).
  const draggedRef = useRef(false);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) =>
        !!latest.current.drag && Math.hypot(g.dx, g.dy) > 8,
      onPanResponderGrant: (_e, g) => { draggedRef.current = true; latest.current.drag?.onStart(latest.current.item, g); },
      onPanResponderMove: (_e, g) => latest.current.drag?.onMove(g),
      onPanResponderRelease: (_e, g) => { latest.current.drag?.onEnd(g); setTimeout(() => { draggedRef.current = false; }, 350); },
      onPanResponderTerminate: (_e, g) => { latest.current.drag?.onEnd(g); setTimeout(() => { draggedRef.current = false; }, 350); },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;
  const panHandlers = drag ? pan.panHandlers : {};

  // Tras un arrastre, el primer tap se ignora (era el final del arrastre).
  const handlePress = () => {
    if (draggedRef.current) { draggedRef.current = false; return; }
    onPress();
  };

  return (
    <Animated.View style={[c.card, compact && c.cardDraggable, dragging && c.cardDragging, enterStyle]} {...panHandlers}>
      <PressScale style={[c.tap, compact && c.tapC]} onPress={handlePress}>
        <View style={{ flex: 1 }}>
          <Text style={[c.name, compact && c.nameC]} numberOfLines={compact ? 3 : 2}>{item.title}</Text>
          {compact ? (
            <View style={c.metaC}>
              {item.price != null && <Text style={[c.priceC, { color }]}>{money(item.price)}</Text>}
              {hasNotes && <Text style={c.noteMark}>📝</Text>}
            </View>
          ) : (
            <>
              {sub && <Text style={c.sub} numberOfLines={1}>{sub} ↗</Text>}
              {hasNotes && <Text style={c.note} numberOfLines={1}>📝 {item.notes!.trim()}</Text>}
            </>
          )}
        </View>
        {!compact && item.price != null && <Text style={[c.price, { color }]}>{money(item.price)}</Text>}
      </PressScale>
      <TouchableOpacity style={[c.del, compact && c.delC]} onPress={onDelete} hitSlop={8}>
        <Text style={c.delText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}, (a, b) =>
  a.item === b.item && a.color === b.color && a.compact === b.compact
  && a.dragging === b.dragging && a.justMoved === b.justMoved);

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

  // Sheet (añadir/editar)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'add' | 'edit'>('add');
  const [addKind, setAddKind] = useState<TripItemKind>('manana');
  const [addDay, setAddDay] = useState<string>('');
  const [editItem, setEditItem] = useState<TripItem | null>(null);
  const [openSeq, setOpenSeq] = useState(0);
  const [page, setPage] = useState(0);

  // En escritorio mostramos los días en columnas paralelas (hasta 7 a la vez),
  // sin tener que pinchar cada día. En móvil/tablet, selector + día activo.
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 920;
  const PER_PAGE = 7;
  // Ancho de columna FIJO (basado en 7 por fila) para que las cards midan igual
  // en todas las semanas, aunque la última página tenga menos de 7 días.
  const DESKTOP_PAD = 20;
  const COL_GAP = 12;
  const colW = Math.floor((winW - DESKTOP_PAD * 2 - COL_GAP * (PER_PAGE - 1)) / PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(days.length / PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageDays = isWide ? days.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE) : [];

  // ── Arrastrar y soltar (solo escritorio) ────────────────────────────────────
  const [dragItem, setDragItem] = useState<TripItem | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [justMovedId, setJustMovedId] = useState<string | null>(null);
  const dragPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cloneScale = useRef(new Animated.Value(1)).current;
  const cloneOpacity = useRef(new Animated.Value(1)).current;
  const cellRefs = useRef<Map<string, View | null>>(new Map());
  const zonesRef = useRef<Array<{ key: string; x: number; y: number; w: number; h: number }>>([]);
  const dragItemRef = useRef<TripItem | null>(null);
  const hoverRef = useRef<string | null>(null);
  const settlingRef = useRef(false);          // durante la animación de aterrizaje ignoramos nuevos gestos

  const registerCell = (key: string) => (ref: View | null) => {
    if (ref) cellRefs.current.set(key, ref); else cellRefs.current.delete(key);
  };

  // Medimos las celdas al empezar el arrastre (la posición absoluta cambia con el
  // scroll; durante el drag el scroll está bloqueado, así que la medida vale).
  const measureZones = () => {
    const zones: typeof zonesRef.current = [];
    cellRefs.current.forEach((ref, key) => {
      ref?.measureInWindow((x, y, w, h) => { zones.push({ key, x, y, w, h }); });
    });
    zonesRef.current = zones;
  };
  // measureInWindow (web) devuelve coords de viewport; el PanResponder da coords
  // de página. Normalmente el documento no hace scroll (lo hace el ScrollView
  // interno) y coinciden; restamos el scroll del documento por si acaso.
  const scrollOff = () => (Platform.OS === 'web' && typeof window !== 'undefined')
    ? { x: window.scrollX || 0, y: window.scrollY || 0 } : { x: 0, y: 0 };

  const hitTest = (px: number, py: number): string | null => {
    for (const z of zonesRef.current) {
      if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) return z.key;
    }
    return null;
  };

  // Mientras se arrastra, bloqueamos la selección de texto y ponemos cursor
  // "grabbing" en todo el documento (web) — si no, arrastrar sobre las tarjetas
  // selecciona su texto como si pasaras el ratón por encima.
  const setDragActiveWeb = (on: boolean) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const b = document.body.style as any;
    b.userSelect = on ? 'none' : '';
    b.webkitUserSelect = on ? 'none' : '';
    b.cursor = on ? 'grabbing' : '';
  };

  const clearDrag = () => {
    settlingRef.current = false;
    dragItemRef.current = null; hoverRef.current = null;
    setDragItem(null); setHoverKey(null);
    cloneScale.setValue(1); cloneOpacity.setValue(1);
    setDragActiveWeb(false);
  };

  const dragApi: DragApi = {
    onStart: (item, g) => {
      if (settlingRef.current) return;
      dragItemRef.current = item;
      setDragItem(item);
      setJustMovedId(null);
      measureZones();
      const o = scrollOff();
      dragPos.setValue({ x: g.moveX - o.x - CLONE_GRAB, y: g.moveY - o.y - CLONE_GRAB });
      cloneOpacity.setValue(1);
      cloneScale.setValue(1);
      // Pequeño "lift" al levantar la tarjeta (Emil: feedback físico sutil).
      Animated.spring(cloneScale, { toValue: 1.04, useNativeDriver: false, speed: 20, bounciness: 8 }).start();
      setDragActiveWeb(true);
    },
    onMove: (g) => {
      const o = scrollOff();
      dragPos.setValue({ x: g.moveX - o.x - CLONE_GRAB, y: g.moveY - o.y - CLONE_GRAB });
      const k = hitTest(g.moveX - o.x, g.moveY - o.y);
      if (k !== hoverRef.current) { hoverRef.current = k; setHoverKey(k); }
    },
    onEnd: (g) => {
      const o = scrollOff();
      const k = hitTest(g.moveX - o.x, g.moveY - o.y);
      const it = dragItemRef.current;
      // Al soltar quitamos ya el resalte de la celda; el clon sigue animándose.
      hoverRef.current = null; setHoverKey(null);
      const move = it && k
        ? (() => { const [day, kind] = k.split('|'); return day !== it.day || kind !== it.kind; })()
        : false;

      if (move && it && k) {
        // Aterrizaje: el clon vuela con muelle a la celda destino y se funde
        // mientras la tarjeta real entra animada allí (crossfade natural).
        const [day, kind] = k.split('|') as [string, TripItemKind];
        const z = zonesRef.current.find((zz) => zz.key === k);
        // z siempre existe (k viene de hitTest); si no, deja el clon donde está.
        const target = z
          ? { x: z.x - o.x + 6, y: z.y - o.y + 44 }
          : { x: g.moveX - o.x - CLONE_GRAB, y: g.moveY - o.y - CLONE_GRAB };
        settlingRef.current = true;
        Animated.parallel([
          Animated.spring(dragPos, { toValue: target, useNativeDriver: false, speed: 18, bounciness: 4 }),
          Animated.timing(cloneScale, { toValue: 0.96, duration: 200, easing: EASE_OUT, useNativeDriver: false }),
          Animated.timing(cloneOpacity, { toValue: 0, duration: 150, delay: 90, easing: EASE_OUT, useNativeDriver: false }),
        ]).start(() => {
          useTripStore.getState().updateItem(periodId, it.id, { day, kind });
          setJustMovedId(it.id);
          clearDrag();
          setTimeout(() => setJustMovedId((cur) => (cur === it.id ? null : cur)), 500);
        });
      } else {
        // Misma celda o fuera de destino: no se mueve nada → el clon se
        // desvanece EN EL SITIO (sin viajar), para que no haya slide lateral.
        settlingRef.current = true;
        Animated.parallel([
          Animated.timing(cloneOpacity, { toValue: 0, duration: 150, easing: EASE_OUT, useNativeDriver: false }),
          Animated.timing(cloneScale, { toValue: 0.96, duration: 150, easing: EASE_OUT, useNativeDriver: false }),
        ]).start(() => clearDrag());
      }
    },
  };

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

  const openAdd = (kind: TripItemKind, day: string) => {
    setSheetMode('add'); setAddKind(kind); setAddDay(day); setEditItem(null);
    setOpenSeq((n) => n + 1); setSheetOpen(true);
  };
  const openEdit = (item: TripItem) => {
    setSheetMode('edit'); setEditItem(item);
    setOpenSeq((n) => n + 1); setSheetOpen(true);
  };

  const confirmDelete = (id: string, title: string) => {
    const doDelete = () => { useTripStore.getState().deleteItem(periodId, id); setSheetOpen(false); };
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm(`¿Eliminar “${title}”?`)) doDelete();
      return;
    }
    Alert.alert('Eliminar sitio', `¿Eliminar “${title}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: doDelete },
    ]);
  };

  // Renderiza las 5 secciones (franjas) de un día. `compact` para las columnas
  // estrechas de escritorio, donde además las celdas son zonas de arrastre.
  const renderSections = (day: string, compact: boolean) => KINDS.map((k) => {
    const list = items.filter((it) => it.day === day && it.kind === k.key);
    const key = cellKey(day, k.key);
    const isDropTarget = compact && !!dragItem && hoverKey === key
      && !(dragItem.day === day && dragItem.kind === k.key);
    return (
      <View
        key={k.key}
        ref={compact ? registerCell(key) : undefined}
        style={[compact ? s.sectionC : s.section, isDropTarget && { ...s.sectionDrop, borderColor: color }]}
      >
        <View style={s.sectionHead}>
          <Text style={[s.sectionTitle, compact && s.sectionTitleC]}>{k.emoji} {k.label}</Text>
          <PressScale style={s.addChip} onPress={() => openAdd(k.key, day)} scaleTo={0.94}>
            <Text style={[s.addChipText, { color }]}>{compact ? '＋' : '＋ Añadir'}</Text>
          </PressScale>
        </View>
        {list.length === 0 ? (
          <Text style={[s.sectionEmpty, compact && s.sectionEmptyC]}>{compact ? '—' : 'Nada planeado todavía'}</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {list.map((it) => (
              <ItemCard
                key={it.id}
                item={it}
                color={color}
                compact={compact}
                onPress={() => openEdit(it)}
                onDelete={() => confirmDelete(it.id, it.title)}
                drag={compact ? dragApi : undefined}
                dragging={dragItem?.id === it.id}
                justMoved={compact && justMovedId === it.id}
              />
            ))}
          </View>
        )}
      </View>
    );
  });

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
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        scrollEnabled={!dragItem}
      >
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
            <Text style={s.dragHint}>Arrastra un sitio a otra franja o día para moverlo · toca para editarlo</Text>
            <View style={s.daysRow}>
              {pageDays.map((iso) => {
                const { dow, num } = dayChipLabel(iso);
                const idx = days.indexOf(iso);
                return (
                  <View key={iso} style={[s.dayCol, { width: colW }]}>
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

      {/* Clon flotante mientras se arrastra (escritorio) */}
      {dragItem && (
        <Animated.View
          pointerEvents="none"
          style={[dg.clone, cloneHint, {
            width: colW,
            borderColor: color,
            opacity: cloneOpacity,
            transform: [...dragPos.getTranslateTransform(), { scale: cloneScale }],
          }]}
        >
          <Text style={dg.cloneName} numberOfLines={2}>{dragItem.title}</Text>
          {dragItem.price != null && <Text style={[dg.clonePrice, { color }]}>{money(dragItem.price)}</Text>}
        </Animated.View>
      )}

      <ItemSheet
        visible={sheetOpen}
        mode={sheetMode}
        item={editItem}
        addKind={addKind}
        addDay={addDay}
        days={days}
        periodId={periodId}
        color={color}
        openSeq={openSeq}
        onClose={() => setSheetOpen(false)}
        onDelete={confirmDelete}
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
  sectionC: { marginTop: 14, borderWidth: 1.5, borderColor: 'transparent', borderRadius: R.m, paddingHorizontal: 6, paddingVertical: 4, marginHorizontal: -6 },
  sectionDrop: { borderStyle: 'dashed', backgroundColor: C.brandWash },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 17, color: C.ink, fontFamily: FONT, fontWeight: '600', letterSpacing: -0.2 },
  sectionTitleC: { fontSize: 15 },
  addChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.pill, backgroundColor: C.brandWash },
  addChipText: { fontSize: 13, fontFamily: FONT, fontWeight: '600' },
  sectionEmpty: { fontSize: 13.5, color: C.ink3, fontFamily: FONT, fontStyle: 'italic', paddingVertical: 4 },
  sectionEmptyC: { paddingVertical: 8, textAlign: 'center' },

  // Escritorio: días en columnas
  desktop: { paddingHorizontal: 20, marginTop: 6 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 },
  pagerBtn: { width: 32, height: 32, borderRadius: R.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  pagerBtnOff: { opacity: 0.5 },
  pagerLabel: { fontSize: 13.5, color: C.ink2, fontFamily: FONT, fontWeight: '600' },
  dragHint: { fontSize: 12, color: C.ink3, fontFamily: FONT, textAlign: 'center', marginBottom: 12 },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 },
  dayCol: { backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingBottom: 14 },
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
  // Arrastrable (escritorio): sin selección de texto y cursor de agarre en web.
  cardDraggable: Platform.select({ web: { userSelect: 'none', cursor: 'grab' }, default: {} }) as any,
  cardDragging: { opacity: 0.35 },
  tap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingLeft: 14, paddingRight: 4 },
  tapC: { paddingVertical: 9, paddingLeft: 10, paddingRight: 2 },
  name: { fontSize: 15.5, color: C.ink, fontFamily: FONT, fontWeight: '600' },
  nameC: { fontSize: 13, marginBottom: 0 },
  sub: { fontSize: 12.5, color: C.ink3, fontFamily: FONT, marginTop: 2 },
  note: { fontSize: 12, color: C.ink2, fontFamily: FONT, marginTop: 3 },
  metaC: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  noteMark: { fontSize: 11 },
  price: { fontSize: 14.5, fontFamily: FONT, fontWeight: '700', marginLeft: 8 },
  priceC: { fontSize: 12.5, fontFamily: FONT, fontWeight: '700' },
  del: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  delC: { width: 24, alignSelf: 'flex-start', paddingTop: 6 },
  delText: { fontSize: 15, color: C.ink3, fontFamily: FONT },
});

// Clon flotante durante el arrastre
const dg = StyleSheet.create({
  clone: {
    position: 'absolute', top: 0, left: 0,
    backgroundColor: C.card, borderRadius: R.l, borderWidth: 1.5,
    paddingVertical: 10, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 8, zIndex: 100,
  },
  cloneName: { fontSize: 13, color: C.ink, fontFamily: FONT, fontWeight: '600' },
  clonePrice: { fontSize: 12.5, fontFamily: FONT, fontWeight: '700', marginTop: 3 },
});

const a = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 36 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4, marginBottom: 18 },
  field: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 15, fontSize: 16, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginBottom: 12 },
  notesField: { minHeight: 76, paddingTop: 14 },
  openLink: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.brandWash, marginTop: -4, marginBottom: 12 },
  openLinkTxt: { fontSize: 13.5, fontFamily: FONT, fontWeight: '600' },
  nightsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2, marginBottom: 14 },
  nightsLabel: { fontSize: 15.5, color: C.ink, fontFamily: FONT, fontWeight: '600', marginBottom: 2 },
  nightsHint: { fontSize: 12.5, color: C.ink3, fontFamily: FONT },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 36, height: 36, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  stepBtnOff: { opacity: 0.4 },
  stepTxt: { fontSize: 18, color: C.ink, fontFamily: FONT, fontWeight: '600', lineHeight: 20 },
  stepNum: { minWidth: 28, textAlign: 'center', fontSize: 17, color: C.ink, fontFamily: FONT, fontWeight: '700' },
  error: { color: C.danger, fontSize: 13, fontFamily: FONT, marginBottom: 12, textAlign: 'center' },
  save: { borderRadius: R.pill, paddingVertical: 16, alignItems: 'center' },
  saveText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
  hint: { fontSize: 12.5, color: C.ink3, fontFamily: FONT, lineHeight: 18, marginBottom: 18, marginTop: 2 },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  deleteTxt: { fontSize: 14.5, color: C.danger, fontFamily: FONT, fontWeight: '600' },
});
