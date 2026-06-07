import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, StyleSheet, Share,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { C, R, FONT } from '@/constants/theme';
import { NIDO_COLORS } from '@/constants/nidoColors';
import { IlluNidoLimpio } from '@/components/icons';

type Step = 'choose' | 'create' | 'join';

export default function OnboardingScreen() {
  const { user, setHousehold } = useAuthStore();
  const [step, setStep]                 = useState<Step>('choose');
  const [householdName, setHouseholdName] = useState('');
  const [colorKey, setColorKey]          = useState(NIDO_COLORS[0].key);
  const [inviteCode, setInviteCode]      = useState('');
  const [loading, setLoading]            = useState(false);
  const [createdCode, setCreatedCode]    = useState('');

  const accent = NIDO_COLORS.find(c => c.key === colorKey) ?? NIDO_COLORS[0];

  // ── Create household ──────────────────────────────────────────────────────
  const createHousehold = async () => {
    if (!householdName.trim()) { Alert.alert('Falta el nombre', 'Escribe un nombre para tu nido'); return; }
    setLoading(true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await supabase
      .from('households')
      .insert({ name: householdName.trim(), invite_code: code, created_by: user?.id })
      .select().single();
    if (error || !data) { setLoading(false); Alert.alert('Error', error?.message ?? 'No se pudo crear'); return; }
    await supabase.from('household_members').insert({ household_id: data.id, user_id: user?.id, role: 'admin' });
    setLoading(false);
    setCreatedCode(code);
    setHousehold(data);
    // Show code before entering
    setStep('join'); // reuse "join" view as the "share code" step — handled below via createdCode
    router.replace('/(tabs)');
  };

  // ── Join household ────────────────────────────────────────────────────────
  const joinHousehold = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length < 4) { Alert.alert('Código inválido', 'Introduce el código de invitación completo'); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('households').select().eq('invite_code', code).single();
    if (error || !data) {
      setLoading(false);
      Alert.alert('Código no encontrado', 'Comprueba el código e inténtalo de nuevo');
      return;
    }
    await supabase.from('household_members').insert({ household_id: data.id, user_id: user?.id, role: 'member' });
    setLoading(false);
    setHousehold(data);
    router.replace('/(tabs)');
  };

  // ── Welcome step ──────────────────────────────────────────────────────────
  if (step === 'choose') {
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* Illustration */}
          <View style={s.illuWrap}>
            <IlluNidoLimpio size={120} color={C.brand} fill={C.brandWash} />
          </View>

          <Text style={s.headline}>Bienvenido a Nido</Text>
          <Text style={s.lead}>¿Quieres crear tu propio nido o unirte al de alguien?</Text>

          {/* Option cards */}
          <TouchableOpacity style={[s.card, s.cardCreate]} onPress={() => setStep('create')} activeOpacity={0.85}>
            <View style={[s.cardIconWrap, { backgroundColor: C.brand }]}>
              <Text style={s.cardIcon}>🪺</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Crear un nido</Text>
              <Text style={s.cardDesc}>Soy el primero de mi casa en usar Nido</Text>
            </View>
            <Text style={s.cardCaret}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.card} onPress={() => setStep('join')} activeOpacity={0.85}>
            <View style={[s.cardIconWrap, { backgroundColor: C.paperDeep }]}>
              <Text style={s.cardIcon}>🔑</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Unirme a un nido</Text>
              <Text style={s.cardDesc}>Tengo un código de invitación</Text>
            </View>
            <Text style={s.cardCaret}>›</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Create step ───────────────────────────────────────────────────────────
  if (step === 'create') {
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <TouchableOpacity style={s.backRow} onPress={() => setStep('choose')}>
            <Text style={s.backText}>‹ Volver</Text>
          </TouchableOpacity>

          <Text style={s.stepEyebrow}>NUEVO NIDO</Text>
          <Text style={s.stepTitle}>Ponle nombre{'\n'}a tu hogar</Text>
          <Text style={s.stepSub}>Puede ser "Casa de Ana y Pablo", "El piso de Gran Vía"…</Text>

          <TextInput
            style={[s.input, { borderColor: accent.hex }]}
            placeholder="Nombre del nido"
            placeholderTextColor={C.ink3}
            value={householdName}
            onChangeText={setHouseholdName}
            autoFocus
            returnKeyType="done"
          />

          {/* Color picker */}
          <Text style={s.colorLabel}>Color del nido</Text>
          <View style={s.colorRow}>
            {NIDO_COLORS.map(nc => (
              <TouchableOpacity
                key={nc.key}
                style={[s.swatch, { backgroundColor: nc.hex }, colorKey === nc.key && s.swatchOn]}
                onPress={() => setColorKey(nc.key)}
                activeOpacity={0.8}
              >
                {colorKey === nc.key && <Text style={s.swatchCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>

          {/* Preview */}
          {householdName.trim() && (
            <View style={[s.preview, { backgroundColor: accent.wash, borderColor: accent.hex + '30' }]}>
              <IlluNidoLimpio size={44} color={accent.hex} fill={accent.wash} />
              <View style={{ flex: 1 }}>
                <Text style={[s.previewName, { color: accent.hex }]}>{householdName.trim()}</Text>
                <Text style={s.previewSub}>Tu nido · color {accent.label.toLowerCase()}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[s.btnPrimary, { backgroundColor: accent.hex }, (!householdName.trim() || loading) && { opacity: 0.4 }]}
            onPress={createHousehold}
            disabled={!householdName.trim() || loading}
          >
            {loading
              ? <ActivityIndicator color={C.white} />
              : <Text style={s.btnPrimaryText}>Crear nido ›</Text>}
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Join step ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <TouchableOpacity style={s.backRow} onPress={() => setStep('choose')}>
          <Text style={s.backText}>‹ Volver</Text>
        </TouchableOpacity>

        <View style={s.illuWrap}>
          <Text style={s.keyEmoji}>🔑</Text>
        </View>

        <Text style={s.stepEyebrow}>CÓDIGO DE INVITACIÓN</Text>
        <Text style={s.stepTitle}>Únete al nido{'\n'}de tu hogar</Text>
        <Text style={s.stepSub}>Pídele el código de 6 caracteres a quien ya usa Nido en tu casa</Text>

        <TextInput
          style={[s.input, s.inputCode, { borderColor: inviteCode.length === 6 ? C.brand : C.line }]}
          placeholder="ABC 123"
          placeholderTextColor={C.ink3}
          value={inviteCode}
          onChangeText={t => setInviteCode(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
          maxLength={6}
          autoCapitalize="characters"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={joinHousehold}
        />

        <Text style={s.codeHint}>
          El código tiene 6 caracteres · letras y números
        </Text>

        <TouchableOpacity
          style={[s.btnPrimary, { backgroundColor: C.ink }, (inviteCode.length < 4 || loading) && { opacity: 0.4 }]}
          onPress={joinHousehold}
          disabled={inviteCode.length < 4 || loading}
        >
          {loading
            ? <ActivityIndicator color={C.white} />
            : <Text style={s.btnPrimaryText}>Unirme al nido</Text>}
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.paper },
  scroll: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 16, paddingBottom: 48 },

  illuWrap: { alignItems: 'center', paddingVertical: 28 },
  keyEmoji: { fontSize: 72 },

  headline: { fontSize: 30, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.6, marginBottom: 10 },
  lead:     { fontSize: 15, color: C.ink2, fontFamily: FONT, lineHeight: 22, marginBottom: 32 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: C.line, borderRadius: R.xl,
    padding: 18, marginBottom: 12, backgroundColor: C.card,
  },
  cardCreate: { borderColor: C.brand + '50', backgroundColor: C.brandWash },
  cardIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardIcon:  { fontSize: 22 },
  cardTitle: { fontSize: 16, fontWeight: '500', color: C.ink, fontFamily: FONT },
  cardDesc:  { fontSize: 13, color: C.ink3, fontFamily: FONT, marginTop: 2 },
  cardCaret: { fontSize: 22, color: C.ink3 },

  backRow: { marginBottom: 20 },
  backText: { color: C.brand, fontWeight: '500', fontFamily: FONT, fontSize: 15 },

  stepEyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 8 },
  stepTitle:   { fontSize: 30, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.6, lineHeight: 36, marginBottom: 10 },
  stepSub:     { fontSize: 14, color: C.ink2, fontFamily: FONT, lineHeight: 20, marginBottom: 28 },

  input: {
    borderWidth: 2, borderRadius: R.l,
    paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 17, color: C.ink, backgroundColor: C.card,
    fontFamily: FONT, marginBottom: 20,
  },
  inputCode: {
    textAlign: 'center', letterSpacing: 10, fontSize: 26,
    fontWeight: '600', paddingVertical: 22,
  },
  codeHint: { fontSize: 12, color: C.ink3, fontFamily: FONT, textAlign: 'center', marginBottom: 28, marginTop: -10 },

  colorLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 12 },
  colorRow:   { flexDirection: 'row', gap: 14, marginBottom: 22 },
  swatch:     { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  swatchOn:   { borderWidth: 3, borderColor: C.ink },
  swatchCheck:{ color: C.white, fontWeight: '700', fontSize: 16 },

  preview: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: R.l, borderWidth: 1, padding: 14, marginBottom: 28,
  },
  previewName: { fontSize: 17, fontWeight: '500', fontFamily: FONT, letterSpacing: -0.3 },
  previewSub:  { fontSize: 12, color: C.ink3, fontFamily: FONT, marginTop: 2 },

  btnPrimary:     { borderRadius: R.pill, paddingVertical: 17, alignItems: 'center' },
  btnPrimaryText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
