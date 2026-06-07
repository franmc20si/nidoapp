import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, StyleSheet, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { C, R, FONT } from '@/constants/theme';

type Screen = 'welcome' | 'login';

export default function LoginScreen() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth-callback`
      : 'nido://auth/callback';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) Alert.alert('Error', error.message);
  };

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('Error', 'Rellena todos los campos'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Error al entrar', error.message);
  };

  if (screen === 'welcome') {
    return (
      <View style={s.root}>
        {/* Header */}
        <View style={s.welcomeTop}>
          <View style={s.logoRow}>
            <Text style={s.logoIcon}>🪺</Text>
            <Text style={s.logoWord}>nido</Text>
          </View>
          <Text style={s.headline}>Tu casa, en orden.{'\n'}Sin discusiones.</Text>
          <Text style={s.lead}>Organiza las tareas del hogar tú solo, en pareja o en familia. Cada uno aporta, y nido lo cuenta por ti.</Text>
        </View>

        {/* Illustration */}
        <View style={s.illustWrap}>
          <Text style={s.illustEmoji}>🪺</Text>
        </View>

        {/* CTA */}
        <View style={s.welcomeBottom}>
          <TouchableOpacity style={s.btnBrand} onPress={() => setScreen('login')}>
            <Text style={s.btnBrandText}>Empezar  ›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.googleBtn} onPress={handleGoogle}>
            <Text style={s.googleG}>G</Text>
            <Text style={s.googleText}>Continuar con Google</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
      <ScrollView contentContainerStyle={s.loginScroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={s.backBtn} onPress={() => setScreen('welcome')}>
          <Text style={s.backText}>‹ Volver</Text>
        </TouchableOpacity>

        <Text style={s.loginTitle}>Acceder</Text>

        <Text style={s.label}>Email</Text>
        <TextInput style={s.input} placeholder="tu@email.com" placeholderTextColor={C.ink3}
          value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

        <Text style={[s.label, { marginTop: 14 }]}>Contraseña</Text>
        <TextInput style={s.input} placeholder="••••••••" placeholderTextColor={C.ink3}
          value={password} onChangeText={setPassword} secureTextEntry />

        <TouchableOpacity style={s.btnDark} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color={C.paper} /> : <Text style={s.btnDarkText}>Entrar</Text>}
        </TouchableOpacity>

        <View style={s.divRow}>
          <View style={s.divLine} />
          <Text style={s.divText}>o</Text>
          <View style={s.divLine} />
        </View>

        <TouchableOpacity style={s.googleBtn} onPress={handleGoogle}>
          <Text style={s.googleG}>G</Text>
          <Text style={s.googleText}>Continuar con Google</Text>
        </TouchableOpacity>

        <View style={s.footer}>
          <Text style={s.footerText}>¿No tienes cuenta? </Text>
          <Link href="/(auth)/register"><Text style={s.footerLink}>Regístrate</Text></Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  // Welcome
  welcomeTop: { flex: 1, paddingHorizontal: 28, paddingTop: 64 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoIcon: { fontSize: 28 },
  logoWord: { fontSize: 28, fontWeight: '600', color: C.brand, fontFamily: FONT, letterSpacing: -0.5 },
  headline: { fontSize: 36, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -1, lineHeight: 42, marginBottom: 16 },
  lead: { fontSize: 15, color: C.ink2, fontFamily: FONT, lineHeight: 22 },

  illustWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  illustEmoji: { fontSize: 120 },

  welcomeBottom: { paddingHorizontal: 28, paddingBottom: 48, gap: 12 },
  btnBrand: { backgroundColor: C.brand, borderRadius: R.pill, paddingVertical: 18, alignItems: 'center' },
  btnBrandText: { color: C.white, fontWeight: '600', fontSize: 17, fontFamily: FONT },

  googleBtn: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.card },
  googleG: { fontSize: 16, fontWeight: '700', color: '#4285F4' },
  googleText: { color: C.ink, fontWeight: '600', fontSize: 15, fontFamily: FONT },

  // Login form
  loginScroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 64, paddingBottom: 40 },
  backBtn: { marginBottom: 24 },
  backText: { color: C.brand, fontSize: 16, fontFamily: FONT, fontWeight: '500' },
  loginTitle: { fontSize: 32, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -1, marginBottom: 28 },
  label: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 14, fontSize: 16, color: C.ink, backgroundColor: C.card, fontFamily: FONT },
  btnDark: { backgroundColor: C.ink, borderRadius: R.pill, paddingVertical: 17, alignItems: 'center', marginTop: 22 },
  btnDarkText: { color: C.paper, fontWeight: '600', fontSize: 16, fontFamily: FONT },
  divRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  divLine: { flex: 1, height: 1, backgroundColor: C.line },
  divText: { color: C.ink3, fontSize: 13, fontFamily: FONT },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: C.ink3, fontFamily: FONT },
  footerLink: { color: C.brand, fontWeight: '600', fontFamily: FONT },
});
