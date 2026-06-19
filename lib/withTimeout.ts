// supabase-js no lleva timeout propio; sin esto un lock de auth/fetch bloqueado
// en web dejaría peticiones (y la UI que depende de ellas) colgadas para siempre.
export function withTimeout<T>(p: PromiseLike<T>, ms = 12000): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}

// Lectura Supabase robusta: timeout + 1 reintento ante fallo transitorio.
// supabase-js no lanza: resuelve { data, error }. Un blip de red/RLS o un
// timeout NO deben confundirse con "sin datos" (eso vacía listas y desmarca
// checks). Reintenta una vez —con una pequeña espera— tanto si la promesa
// rechaza (TIMEOUT/throw) como si devuelve un { error } blando. Nunca lanza:
// siempre resuelve { data, error }, para que el llamador decida.
// `make` se invoca en cada intento porque los builders de PostgREST son
// thenables de un solo uso (no se pueden re-esperar).
export async function readWithRetry<T = any>(
  make: () => PromiseLike<{ data: T; error: any }>,
  { ms = 10000, retries = 1, delay = 400 }: { ms?: number; retries?: number; delay?: number } = {},
): Promise<{ data: T; error: any }> {
  let last: { data: T; error: any } = { data: null as any, error: new Error('not run') };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await withTimeout(make(), ms);
      if (!res || !res.error) return res;
      last = res;
    } catch (e) {
      last = { data: null as any, error: e };
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, delay));
  }
  return last;
}
