import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ensureProfile, resolveDestination } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import { C } from '@/constants/theme';

export default function AuthCallback() {
  const { setSession, setProfile, setHousehold } = useAuthStore();
  const [status, setStatus] = useState('Conectando...');

  useEffect(() => {
    let handled = false;

    const processSession = async (session: any) => {
      if (handled) return;
      handled = true;
      setSession(session);
      const profile = await ensureProfile(session.user);
      if (profile) setProfile(profile);
      const { route, household } = await resolveDestination(session.user.id);
      if (household) setHousehold(household);
      router.replace(route);
    };

    // Subscribe first to catch SIGNED_IN if it fires before getSession resolves
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          processSession(session);
        }
      }
    );

    // Also try getSession immediately — implicit flow may already have the tokens
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !handled) {
        processSession(session);
      } else if (!session) {
        setStatus('Sin sesión — esperando evento...');
      }
    });

    // Fallback: give up after 15 seconds
    const timeout = setTimeout(() => {
      if (!handled) {
        setStatus('Timeout — volviendo al inicio');
        setTimeout(() => router.replace('/(auth)/login'), 2000);
      }
    }, 15000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <View style={s.root}>
      <ActivityIndicator size="large" color={C.brand} />
      <Text style={s.text}>{status}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  text: { marginTop: 16, color: '#888', fontSize: 15 },
});
