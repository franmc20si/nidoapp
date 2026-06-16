import { useState } from 'react';
import { Tabs } from 'expo-router';
import {
  View, Text, TouchableOpacity, Modal, TextInput, StyleSheet,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { CATS } from '@/constants/categories';
import { ptsFromMin } from '@/lib/taskTheme';
import { RECURRENCE_OPTS, RecurrenceRule } from '@/lib/recurrence';
import { useAuthStore } from '@/store/authStore';
import { useNidoStore } from '@/store/nidoStore';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';
import {
  IconHome as IcoHome, IconNest as IcoNest,
  IconChart as IcoChart, IconMenu as IcoMenu,
  IconCalendar as IcoCalendar, getCatIcon,
} from '@/components/icons';
import { ToastBar } from '@/components/ToastBar';

function IconHome({ active, accent }: { active: boolean; accent: string }) {
  return <IcoHome size={22} color={active ? accent : C.ink3} fill="transparent" strokeWidth={active ? 2.6 : 2} />;
}
function IconNest({ active, accent }: { active: boolean; accent: string }) {
  return <IcoNest size={22} color={active ? accent : C.ink3} fill="transparent" strokeWidth={active ? 2.6 : 2} />;
}
function IconChart({ active, accent }: { active: boolean; accent: string }) {
  return <IcoChart size={22} color={active ? accent : C.ink3} fill="transparent" strokeWidth={active ? 2.6 : 2} />;
}
function IconMenuTab({ active, accent }: { active: boolean; accent: string }) {
  return <IcoMenu size={22} color={active ? accent : C.ink3} fill="transparent" strokeWidth={active ? 2.6 : 2} />;
}
function IconCalendarTab({ active, accent }: { active: boolean; accent: string }) {
  return <IcoCalendar size={22} color={active ? accent : C.ink3} fill="transparent" strokeWidth={active ? 2.6 : 2} />;
}

const TIMES = [
  { label: '15 min', min: 15 },
  { label: '30 min', min: 30 },
  { label: '1 h',    min: 60 },
  { label: '2 h',    min: 120 },
];

function AddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { household, user } = useAuthStore();
  const { accent } = useNidoStore();
  const [kind, setKind] = useState<'regular' | 'puntual'>('regular');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [min, setMin] = useState(30);
  const [recRule, setRecRule] = useState<RecurrenceRule>('weekly');
  const [saving, setSaving] = useState(false);

  const pts = ptsFromMin(min);

  const reset = () => {
    setKind('regular');
    setTitle('');
    setCategory(null);
    setMin(30);
    setRecRule('weekly');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const [saveError, setSaveError] = useState('');

  const handleAdd = async () => {
    if (!title.trim() || !household) return;
    setSaving(true);
    setSaveError('');
    try {
      const { error } = await withTimeout(
        supabase.from('tasks').insert({
          household_id: household.id,
          title: title.trim(),
          created_by: user?.id,
          is_recurring: kind === 'regular',
          recurrence_rule: kind === 'regular' ? recRule : null,
          category,
          points: pts,
          duration_min: min,
        } as any)
      );
      if (error) { setSaveError(error.message); return; }
      useNidoStore.getState().bumpTasks();
      reset();
      onClose();
    } catch (e: any) {
      setSaveError(e?.message === 'TIMEOUT'
        ? 'La conexión tardó demasiado. Inténtalo de nuevo.'
        : (e?.message ?? 'No se pudo añadir la tarea'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={tb.scrim} activeOpacity={1} onPress={handleClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={tb.sheet}>
          <View style={tb.grab} />
          <ScrollView style={tb.sheetScroll} contentContainerStyle={tb.sheetBody} keyboardShouldPersistTaps="handled">
            {/* Segmented control */}
            <View style={tb.seg}>
              {(['regular', 'puntual'] as const).map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[tb.segItem, kind === k && tb.segItemOn]}
                  onPress={() => setKind(k)}
                  activeOpacity={0.8}
                >
                  <Text style={[tb.segText, kind === k && tb.segTextOn]}>
                    {k === 'regular' ? 'Regular' : 'Puntual'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Frequent task chips */}
            <Text style={tb.sectionLabel}>Tarea frecuente</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={tb.catRow}
              keyboardShouldPersistTaps="handled"
            >
              {CATS.map((cat) => {
                const on = category === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[tb.catChip, { backgroundColor: cat.tint, borderColor: on ? cat.color : 'transparent' }]}
                    onPress={() => {
                      setCategory(cat.key);
                      if (!title.trim()) setTitle(cat.label);
                    }}
                    activeOpacity={0.85}
                  >
                    {(() => { const Icon = getCatIcon(cat.key); return <Icon size={17} color={cat.color} fill={cat.tint} strokeWidth={2.4} />; })()}
                    <Text style={[tb.catText, { color: cat.color }]}>{cat.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Title */}
            <TextInput
              style={tb.field}
              placeholder="¿Qué hay que hacer?"
              placeholderTextColor={C.ink3}
              value={title}
              onChangeText={setTitle}
            />

            {/* Time selector */}
            <Text style={tb.sectionLabel}>Tiempo</Text>
            <View style={tb.timeRow}>
              {TIMES.map((t) => {
                const on = min === t.min;
                return (
                  <TouchableOpacity
                    key={t.min}
                    style={[tb.timePill, on && tb.timePillOn]}
                    onPress={() => setMin(t.min)}
                    activeOpacity={0.8}
                  >
                    <Text style={[tb.timeText, on && tb.timeTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Recurrence — only for regular tasks */}
            {kind === 'regular' && (
              <>
                <Text style={tb.sectionLabel}>Frecuencia</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={tb.recRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {RECURRENCE_OPTS.map((opt) => {
                    const on = recRule === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[tb.recPill, on && { backgroundColor: accent.hex, borderColor: accent.hex }]}
                        onPress={() => setRecRule(opt.key)}
                        activeOpacity={0.8}
                      >
                        <Text style={[tb.recText, on && tb.recTextOn]}>{opt.label}</Text>
                        <Text style={[tb.recSub, on && { color: C.white + 'CC' }]}>{opt.short}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Points */}
            <View style={tb.ptsRow}>
              <Text style={[tb.ptsBig, { color: accent.hex }]}>+ {pts} puntos</Text>
              <Text style={tb.ptsRule}>5 min = 1 punto</Text>
            </View>

            {/* Save */}
            {saveError ? <Text style={tb.errorText}>{saveError}</Text> : null}
            <TouchableOpacity style={[tb.save, { backgroundColor: accent.hex, shadowColor: accent.hex }]} onPress={handleAdd} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={tb.saveText}>Añadir al nido</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CustomTabBar({ state, navigation }: any) {
  const { accent, fabOpen, closeFab } = useNidoStore();

  const TABS = [
    { name: 'index',   label: 'Semana',  Icon: IconHome },
    { name: 'nido',    label: 'Nido',    Icon: IconNest },
    { name: 'menu',    label: 'Menú',    Icon: IconMenuTab },
    { name: 'servicios', label: 'Servicios', Icon: IconChart },
    { name: 'calendario', label: 'Calendario', Icon: IconCalendarTab },
  ];

  return (
    <>
      <AddSheet visible={fabOpen} onClose={closeFab} />
      <View style={tb.bar}>
        {TABS.map((tab) => {
          const routeIndex = state.routes.findIndex((r: any) => r.name === tab.name);
          const focused = state.index === routeIndex;
          const { Icon } = tab;

          return (
            <TouchableOpacity
              key={tab.name}
              style={tb.tab}
              onPress={() => navigation.navigate(tab.name)}
              activeOpacity={0.7}
            >
              {Icon && <Icon active={focused} accent={accent.hex} />}
              <Text style={[tb.tabLabel, { color: focused ? accent.hex : C.ink3 }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

export default function TabsLayout() {
  return (
    <>
      <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="nido" />
        <Tabs.Screen name="servicios" />
        <Tabs.Screen name="reparto" options={{ href: null }} />
        <Tabs.Screen name="menu" />
        <Tabs.Screen name="calendario" />
        <Tabs.Screen name="household" options={{ href: null }} />
      </Tabs>
      <ToastBar />
    </>
  );
}

const tb = StyleSheet.create({
  // Tab bar — paper fading at top, no hard top border, active = brand
  bar: {
    flexDirection: 'row',
    backgroundColor: C.paper,
    paddingBottom: 24,
    paddingTop: 12,
    paddingHorizontal: 10,
    alignItems: 'flex-end',
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  ico: { fontSize: 22, opacity: 0.35 },
  icoOn: { opacity: 1 },
  tabLabel: { fontSize: 10, fontFamily: FONT, fontWeight: '500' },

  // Sheet
  scrim: { flex: 1, backgroundColor: 'rgba(33,28,23,0.42)' },
  sheet: { backgroundColor: C.paper, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '88%' },
  sheetScroll: { },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginTop: 12 },
  sheetBody: { padding: 22, paddingBottom: 40 },

  seg: { flexDirection: 'row', backgroundColor: C.paperDeep, borderRadius: R.pill, padding: 4, marginBottom: 22 },
  segItem: { flex: 1, paddingVertical: 11, borderRadius: R.pill, alignItems: 'center' },
  segItemOn: { backgroundColor: C.card, shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { fontSize: 15, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  segTextOn: { color: C.ink, fontWeight: '600' },

  sectionLabel: { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, letterSpacing: 0.2, marginBottom: 10, textTransform: 'uppercase' },

  catRow: { gap: 8, paddingBottom: 4, paddingRight: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5 },
  catEmoji: { fontSize: 15 },
  catText: { fontSize: 13, fontWeight: '600', fontFamily: FONT },

  field: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 16, fontSize: 17, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginTop: 18, marginBottom: 20 },

  timeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  timePill: { flex: 1, borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingVertical: 12, alignItems: 'center', backgroundColor: C.card },
  timePillOn: { backgroundColor: C.ink, borderColor: C.ink },
  timeText: { fontSize: 14, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  timeTextOn: { color: C.paper, fontWeight: '600' },

  recRow: { gap: 8, paddingBottom: 4, paddingRight: 8, marginBottom: 4 },
  recPill: {
    borderWidth: 1.5, borderColor: C.line, borderRadius: R.l,
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.card,
    alignItems: 'center', minWidth: 88,
  },
  recText:    { fontSize: 13.5, fontWeight: '600', color: C.ink2, fontFamily: FONT },
  recTextOn:  { color: C.white },
  recSub:     { fontSize: 10.5, color: C.ink3, fontFamily: FONT, marginTop: 2 },

  ptsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 22 },
  ptsBig: { fontSize: 22, fontWeight: '600', color: C.brand, fontFamily: FONT, letterSpacing: -0.4 },
  ptsRule: { fontSize: 12, color: C.ink3, fontFamily: FONT },

  save: { backgroundColor: C.brand, borderRadius: R.pill, paddingVertical: 17, alignItems: 'center', shadowColor: C.brand, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  saveText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
  errorText: { color: '#c0392b', fontSize: 13, fontFamily: FONT, marginBottom: 10, textAlign: 'center' },
});
