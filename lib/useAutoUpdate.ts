import { useEffect } from 'react';
import { Platform } from 'react-native';

// ── Auto-actualización de la web/PWA ──────────────────────────────────────────
// Cada push a master lo publica Vercel solo. Abrir la app en frío ya carga la
// versión nueva (index.html va sin caché), pero una PWA que vuelve de segundo
// plano sigue ejecutando el JS viejo que tenía en memoria. Aquí comparamos el
// commit con el que se compiló este bundle (EXPO_PUBLIC_BUILD_ID, lo pone el
// buildCommand de vercel.json) con el de /version.json, que se escribe en cada
// build. Si difieren, recargamos:
//   · al volver a primer plano → al momento (el usuario acaba de llegar);
//   · si se detecta mientras se usa → al pasar a segundo plano, para no cortar
//     a nadie a mitad de escribir.
const BUILD_ID = process.env.EXPO_PUBLIC_BUILD_ID;
const CHECK_EVERY_MS = 5 * 60 * 1000;

async function isOutdated(): Promise<boolean> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const { version } = await res.json();
    return typeof version === 'string' && version !== BUILD_ID;
  } catch {
    return false; // sin red: ya lo intentaremos luego
  }
}

export function useAutoUpdate() {
  useEffect(() => {
    // Solo en la web publicada (en local no hay BUILD_ID).
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !BUILD_ID) return;

    let pending = false;
    let reloading = false;
    const reload = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const check = async (reloadNow: boolean) => {
      if (reloading || !(await isOutdated())) return;
      if (reloadNow) reload();
      else pending = true;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check(true);
      else if (pending) reload();
    };

    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') check(false);
    }, CHECK_EVERY_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, []);
}
