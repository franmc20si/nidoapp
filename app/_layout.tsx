import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { supabase } from '@/lib/supabase';
import { ensureProfile, resolveDestination } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import { C } from '@/constants/theme';
import { ToastBar } from '@/components/ToastBar';
import { useAutoUpdate } from '@/lib/useAutoUpdate';

SplashScreen.preventAutoHideAsync();

// iOS hace zoom automático al enfocar cualquier campo con letra < 16px, y no
// deshace el zoom al salir: la pantalla se queda descuadrada con el teclado.
// En pantallas táctiles forzamos 16px en los campos de texto. Y min-width:0:
// un <input> trae un ancho mínimo propio (crece con la letra) que impide que
// un campo con flex:1 encoja, y empuja fuera los botones de su fila.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent =
    'input, textarea { min-width: 0; }\n' +
    '@media (pointer: coarse) { input, textarea, select { font-size: 16px !important; } }';
  document.head.appendChild(style);
}


export default function RootLayout() {
  const { setSession, setProfile, setHousehold, session, isLoading } = useAuthStore();
  const homeReady = useAuthStore((s) => s.homeReady);
  // Usuario para el que ya resolvimos perfil/hogar y navegamos. Evita renavegar
  // (y resetear a la tab inicial) cuando supabase re-emite SIGNED_IN al volver el
  // foco a la pestaña del navegador.
  const authHandledForUser = useRef<string | null>(null);

  useAutoUpdate();

  useEffect(() => {
    // Start font loading in background — don't block auth listener
    const fontPromise = Font.loadAsync({ Nohemi: require('../assets/Nohemi-Regular.ttf') });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        // IMPORTANTE: no hacer `await` de consultas a Supabase DENTRO de este
        // callback. onAuthStateChange retiene el lock interno de GoTrue mientras
        // se ejecuta; si aquí esperamos queries (que a su vez necesitan la sesión)
        // se serializan tras ese lock y, al recargar (INITIAL_SESSION), las cargas
        // de las tabs se cuelgan → TIMEOUT. Diferir con setTimeout(0) hace que el
        // callback retorne ya y libere el lock antes de tocar la BD.
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          // Ya resuelto para este usuario (p. ej. SIGNED_IN re-emitido al volver
          // el foco a la pestaña): no renavegar, o perderíamos la tab actual.
          if (authHandledForUser.current === session.user.id) return;
          authHandledForUser.current = session.user.id;
          setTimeout(async () => {
            const profile = await ensureProfile(session.user);
            if (profile) setProfile(profile);
            const { route, household } = await resolveDestination(session.user.id);
            if (household) setHousehold(household);
            await fontPromise;
            router.replace(route);
            // Si vamos a las tabs, mantenemos el splash hasta que la pantalla
            // inicial cargue sus datos (efecto homeReady abajo). En cualquier otra
            // ruta (p. ej. onboarding) lo ocultamos ya, no hay datos pesados.
            if (route !== '/(tabs)') SplashScreen.hideAsync().catch(() => {});
          }, 0);
        } else if (!session) {
          authHandledForUser.current = null;
          // Don't navigate if the callback page is handling OAuth tokens
          if (typeof window !== 'undefined') {
            const hash = window.location.hash;
            const path = window.location.pathname;
            if (hash.includes('access_token') || path === '/auth-callback') return;
          }
          setTimeout(async () => {
            await fontPromise;
            SplashScreen.hideAsync().catch(() => {});
            router.replace('/(auth)/login');
          }, 0);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Oculta el splash cuando la pantalla inicial ya tiene datos
  useEffect(() => {
    if (homeReady) SplashScreen.hideAsync().catch(() => {});
  }, [homeReady]);

  // Red de seguridad: nunca dejar el splash más de 5s, pase lo que pase
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.paperDeep }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="bancos" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="super" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="casas" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="viajes" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="recurrentes" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="viaje/[id]" options={{ presentation: 'card', animation: 'slide_from_right' }} />
      </Stack>
      {/* En la raíz (no en las tabs): así los toasts —y su "Deshacer"— también
          salen en las pantallas del Stack (super, recurrentes, viajes…). */}
      <ToastBar />
    </View>
  );
}
