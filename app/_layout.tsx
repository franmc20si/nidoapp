import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

SplashScreen.preventAutoHideAsync();

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

  if (data?.households) return { route: '/(tabs)' as const, household: data.households as any };
  return { route: '/(auth)/onboarding' as const, household: null };
}

export default function RootLayout() {
  const { setSession, setProfile, setHousehold, session, isLoading } = useAuthStore();

  useEffect(() => {
    // Start font loading in background — don't block auth listener
    const fontPromise = Font.loadAsync({ Nohemi: require('../assets/Nohemi-Regular.ttf') });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          const profile = await ensureProfile(session.user);
          if (profile) setProfile(profile);
          const { route, household } = await resolveDestination(session.user.id);
          if (household) setHousehold(household);
          await fontPromise;
          SplashScreen.hideAsync();
          router.replace(route);
        } else if (!session) {
          // If OAuth tokens are in the URL hash, wait for SIGNED_IN — don't
          // navigate away or we'll strip the hash before Supabase can read it.
          const hash = typeof window !== 'undefined' ? window.location.hash : '';
          if (hash.includes('access_token')) return;
          await fontPromise;
          SplashScreen.hideAsync();
          router.replace('/(auth)/login');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
