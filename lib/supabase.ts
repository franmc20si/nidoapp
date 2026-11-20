import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno EXPO_PUBLIC_SUPABASE_URL y/o EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Copia .env.example a .env.local y rellena los valores.'
  );
}

// On web use the browser's localStorage (Supabase default) so detectSessionInUrl
// can read OAuth tokens from the URL hash correctly.
// On native use AsyncStorage for persistence.
const storage = Platform.OS === 'web' ? undefined : AsyncStorage;

// ── Lock de Auth con timeout (evita el deadlock de Web Locks en web) ──────────
// El lock por defecto de supabase-js en web (navigatorLock) espera de forma
// INDEFINIDA a adquirir el Web Lock antes de refrescar el token. Si otra pestaña
// (o un contexto que se cerró mal) dejó el lock retenido, cada petición que
// necesita la sesión se cuelga para siempre → "se queda pensando" → TIMEOUT, y
// nada se guarda. Esto sustituye ese lock por uno que abandona tras unos segundos
// y, antes que colgar, ejecuta la operación sin lock (a lo sumo un refresh de
// token duplicado, inofensivo). Coordina entre pestañas en el caso normal.
const LOCK_ACQUIRE_TIMEOUT = 8000;

async function webLockWithTimeout<R>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  // Sin Web Locks API (navegadores antiguos / RN): nada que coordinar.
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    return fn();
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOCK_ACQUIRE_TIMEOUT);
  try {
    return await navigator.locks.request(
      `lock:${name}`,
      { mode: 'exclusive', signal: ctrl.signal },
      async () => fn(),
    );
  } catch (e: any) {
    // AbortError = no se pudo adquirir el lock a tiempo (otro contexto lo
    // retiene atascado). En vez de colgar la petición, seguimos sin lock.
    if (e?.name === 'AbortError') return fn();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── Tokens de OAuth en la URL (web) ──────────────────────────────────────────
// Leemos nosotros el #access_token de la vuelta de Google en vez de dejar que lo
// haga supabase-js (detectSessionInUrl). supabase-js limpia la URL con
// `location.hash = ''`, eso dispara un `popstate` y expo-router lo procesa antes
// de tener montado el navegador → "Cannot read properties of undefined (reading
// 'includes')". Aquí limpiamos con history.replaceState, que no dispara popstate.
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

function takeOAuthParamsFromUrl(): URLSearchParams | null {
  if (!isWeb) return null;
  const hash = window.location.hash;
  if (!hash.includes('access_token') && !hash.includes('error_description')) return null;
  const params = new URLSearchParams(hash.slice(1));
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
  return params;
}

const oauthParams = takeOAuthParamsFromUrl();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: !isWeb,
    flowType: 'implicit',
    lock: webLockWithTimeout,
  },
});

if (oauthParams) {
  const access_token = oauthParams.get('access_token');
  const refresh_token = oauthParams.get('refresh_token');
  if (access_token && refresh_token) {
    // Dispara SIGNED_IN, que recogen _layout y auth-callback.
    supabase.auth.setSession({ access_token, refresh_token }).catch((e) => {
      console.warn('[auth] No se pudo guardar la sesión de OAuth', e);
    });
  } else {
    console.warn('[auth] Error de OAuth', oauthParams.get('error_description'));
  }
}
