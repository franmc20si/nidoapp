import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView, StyleSheet } from 'react-native';
import { Link, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { C, R, FONT } from '@/constants/theme';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    const redirectTo = typeof window !== 'undefined'
      ? window.location.origin
      : 'nido://auth/callback';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) Alert.alert('Error', error.message);
  };

  const handleRegister = async () => {
    if (!fullName || !email || !password) { Alert.alert('Error', 'Rellena todos los campos'); return; }
    if (password.length < 6) { Alert.alert('Error', 'Contraseña mínimo 6 caracteres'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
    else router.replace('/(auth)/onboarding');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        <View style={s.header}>
          <Text style={s.title}>Crear cuenta</Text>
          <Text style={s.subtitle}>Únete a Nido y organiza tu hogar</Text>
        </View>

        {/* Google */}
        <TouchableOpacity style={s.googleBtn} onPress={handleGoogle}>
          <Text style={s.googleIcon}>G</Text>
          <Text style={s.googleText}>Continuar con Google</Text>
        </TouchableOpacity>

        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>o con email</Text>
          <View style={s.dividerLine} />
        </View>

        <Text style={s.label}>Nombre completo</Text>
        <TextInput style={s.input} placeholder="Tu nombre" placeholderTextColor={C.ink3}
          value={fullName} onChangeText={setFullName} autoCapitalize="words" />

        <Text style={[s.label, { marginTop: 14 }]}>Email</Text>
        <TextInput style={s.input} placeholder="tu@email.com" placeholderTextColor={C.ink3}
          value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

        <Text style={[s.label, { marginTop: 14 }]}>Contraseña</Text>
        <TextInput style={s.input} placeholder="Mínimo 6 caracteres" placeholderTextColor={C.ink3}
          value={password} onChangeText={setPassword} secureTextEntry />

        <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color={C.paper} /> : <Text style={s.btnText}>Crear cuenta</Text>}
        </TouchableOpacity>

        <View style={s.footer}>
          <Text style={s.footerText}>¿Ya tienes cuenta? </Text>
          <Link href="/(auth)/login"><Text style={s.link}>Inicia sesión</Text></Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40 },

  header: { marginBottom: 28 },
  title: { fontSize: 32, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -1 },
  subtitle: { color: C.ink3, marginTop: 6, fontSize: 15, fontFamily: FONT },

  googleBtn: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.pill, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, backgroundColor: C.card },
  googleIcon: { fontSize: 16, fontWeight: '700', color: '#4285F4' },
  googleText: { color: C.ink, fontWeight: '600', fontSize: 15, fontFamily: FONT },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.line },
  dividerText: { color: C.ink3, fontSize: 13, fontFamily: FONT },

  label: { fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 14, fontSize: 16, color: C.ink, backgroundColor: C.card, fontFamily: FONT },

  btn: { backgroundColor: C.ink, borderRadius: R.pill, paddingVertical: 17, alignItems: 'center', marginTop: 22 },
  btnText: { color: C.paper, fontWeight: '600', fontSize: 16, fontFamily: FONT },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: C.ink3, fontFamily: FONT },
  link: { color: C.brand, fontWeight: '600', fontFamily: FONT },
});
