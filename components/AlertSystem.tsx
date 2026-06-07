import { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Animated, Platform,
} from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { useAlertStore, Alert } from '@/store/alertStore';

// ─── helpers ────────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function fmtDate(iso: string) {
  try {
    const [, m, d] = iso.split('-');
    return `${parseInt(d)} ${MONTHS_SHORT[parseInt(m) - 1]}`;
  } catch { return iso; }
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function offsetISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── AlertComposer ────────────────────────────────────────────────────────────
// Shown below the date-hero when the bell is active.
export function AlertComposer({ onClose }: { onClose: () => void }) {
  const addAlert = useAlertStore((s) => s.addAlert);
  const [concept, setConcept] = useState('');
  const [date, setDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const valid = concept.trim() && date;

  const handleCreate = () => {
    if (!valid) return;
    addAlert(concept, date);
    setConcept('');
    setDate('');
    setShowDatePicker(false);
    onClose();
  };

  const QUICK_DATES = [
    { label: 'Hoy',     value: todayISO() },
    { label: 'Mañana',  value: offsetISO(1) },
    { label: 'En 3 días', value: offsetISO(3) },
    { label: 'Esta semana', value: offsetISO(7) },
  ];

  return (
    <View style={c.form}>
      {/* Input */}
      <TextInput
        style={c.field}
        placeholder="¿De qué te aviso?"
        placeholderTextColor={C.ink3}
        value={concept}
        onChangeText={setConcept}
        autoFocus
        returnKeyType="done"
      />

      {/* Bottom row */}
      <View style={c.bottomRow}>
        {/* Left: close + date */}
        <View style={c.leftActions}>
          <TouchableOpacity style={c.closeBtn} onPress={onClose}>
            <Text style={c.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[c.dateBtn, date ? c.dateBtnSet : null]}
            onPress={() => setShowDatePicker((v) => !v)}
          >
            <Text style={[c.dateBtnIcon, date ? { color: C.brand } : null]}>📅</Text>
            <Text style={[c.dateBtnText, date ? { color: C.brand } : null]}>
              {date ? fmtDate(date) : 'Cuándo'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Right: create */}
        <TouchableOpacity
          style={[c.createBtn, !valid && c.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!valid}
        >
          <Text style={c.createBtnText}>Crear aviso</Text>
        </TouchableOpacity>
      </View>

      {/* Quick date picker */}
      {showDatePicker && (
        <View style={c.quickPicker}>
          {QUICK_DATES.map((q) => (
            <TouchableOpacity
              key={q.value}
              style={[c.quickOpt, date === q.value && c.quickOptOn]}
              onPress={() => { setDate(q.value); setShowDatePicker(false); }}
            >
              <Text style={[c.quickOptText, date === q.value && c.quickOptTextOn]}>
                {q.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Single animated alert card ──────────────────────────────────────────────
function AlertCard({ alert }: { alert: Alert }) {
  const removeAlert = useAlertStore((s) => s.removeAlert);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(opacity,     { toValue: 0, duration: 320, useNativeDriver: true }),
      Animated.timing(translateX,  { toValue: 46, duration: 320, useNativeDriver: true }),
    ]).start(() => removeAlert(alert.id));
  };

  return (
    <Animated.View style={[a.card, { opacity, transform: [{ translateX }] }]}>
      {/* Bell icon */}
      <View style={a.iconWrap}>
        <Text style={a.iconText}>🔔</Text>
      </View>

      {/* Content */}
      <View style={a.content}>
        <Text style={a.concept} numberOfLines={1}>{alert.concept}</Text>
        <Text style={a.date}>📅 {fmtDate(alert.date)}</Text>
      </View>

      {/* Dismiss */}
      <TouchableOpacity style={a.dismissBtn} onPress={dismiss}>
        <Text style={a.dismissText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── AlertCards (rendered in Hoy and Nido) ───────────────────────────────────
export function AlertCards() {
  const alerts = useAlertStore((s) => s.alerts);
  if (!alerts.length) return null;

  return (
    <View style={a.list}>
      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────
const c = StyleSheet.create({
  form: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: C.card,
    borderRadius: R.l,
    borderWidth: 1.5,
    borderColor: C.line,
    padding: 12,
  },
  field: {
    fontSize: 15,
    color: C.ink,
    fontFamily: FONT,
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  leftActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: C.line,
    backgroundColor: C.paper,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: C.ink2, lineHeight: 16 },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 34, paddingHorizontal: 12,
    borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line,
    backgroundColor: C.paper,
  },
  dateBtnSet: { borderColor: C.brand, backgroundColor: C.brandWash },
  dateBtnIcon: { fontSize: 14 },
  dateBtnText: { fontSize: 13, fontWeight: '500', color: C.ink2, fontFamily: FONT },

  createBtn: {
    backgroundColor: C.brand, borderRadius: R.pill,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { fontSize: 13.5, fontWeight: '600', color: C.white, fontFamily: FONT },

  quickPicker: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  quickOpt: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: R.pill, borderWidth: 1.5, borderColor: C.line,
    backgroundColor: C.paper,
  },
  quickOptOn: { backgroundColor: C.brand, borderColor: C.brand },
  quickOptText: { fontSize: 13, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  quickOptTextOn: { color: C.white },
});

const a = StyleSheet.create({
  list: { paddingHorizontal: 20, gap: 8, marginBottom: 4 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.brandWash,
    borderRadius: R.l, borderWidth: 1.5,
    borderColor: C.brand + '42',
    padding: 13,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: C.brand + '28',
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 16 },
  content: { flex: 1 },
  concept: { fontSize: 14.5, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.2 },
  date: { fontSize: 12, color: C.brand, fontFamily: FONT, fontWeight: '500', marginTop: 2 },
  dismissBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  dismissText: { fontSize: 14, color: C.ink3 },
});
