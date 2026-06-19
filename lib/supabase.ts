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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
    lock: webLockWithTimeout,
  },
});
