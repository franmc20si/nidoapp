import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { supabase } from '@/lib/supabase';
import { ensureProfile, resolveDestination } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';

SplashScreen.preventAutoHideAsync();


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
          // Don't navigate if the callback page is handling OAuth tokens
          if (typeof window !== 'undefined') {
            const hash = window.location.hash;
            const path = window.location.pathname;
            if (hash.includes('access_token') || path === '/auth-callback') return;
          }
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
