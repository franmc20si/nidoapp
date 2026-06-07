import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

async function ensureProfile(user: User) {
  const { data: existing } = await supabase
    .from('profiles')
    .select()
    .eq('id', user.id)
    .maybeSingle();
  if (existing) return existing;
  const meta = user.user_metadata ?? {};
  const name = meta.full_name ?? meta.name ?? user.email ?? '';
  const avatar = meta.avatar_url ?? null;
  const { data } = await supabase
    .from('profiles')
    .insert({ id: user.id, full_name: name, avatar_url: avatar })
    .select()
    .single();
  return data;
}

async function resolveDestination(userId: string) {
  const { data } = await supabase
    .from('household_members')
    .select('household_id, households(*)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (data?.households) return '/(tabs)' as const;
  return '/(auth)/onboarding' as const;
}

export default function AuthCallback() {
  const { setSession, setProfile } = useAuthStore();
  const [status, setStatus] = useState('Conectando...');
  const [debug, setDebug] = useState('');

  useEffect(() => {
    let handled = false;

    // Capture URL info for debugging
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.substring(0, 80);
      const search = window.location.search.substring(0, 80);
      setDebug(`hash: ${hash || '(vacío)'} | search: ${search || '(vacío)'}`);
    }

    const processSession = async (session: any) => {
      if (handled) return;
      handled = true;
      setSession(session);
      const profile = await ensureProfile(session.user);
      if (profile) setProfile(profile);
      const route = await resolveDestination(session.user.id);
      router.replace(route);
    };

    // Subscribe first to catch SIGNED_IN if it fires before getSession resolves
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setStatus(`evento: ${event}`);
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
      <ActivityIndicator size="large" color="#4A90D9" />
      <Text style={s.text}>{status}</Text>
      <Text style={s.debug}>{debug}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  text: { marginTop: 16, color: '#888', fontSize: 15 },
  debug: { marginTop: 12, color: '#aaa', fontSize: 11, paddingHorizontal: 16, textAlign: 'center' },
});
