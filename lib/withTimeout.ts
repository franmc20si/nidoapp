// supabase-js no lleva timeout propio; sin esto un lock de auth/fetch bloqueado
// en web dejaría peticiones (y la UI que depende de ellas) colgadas para siempre.
export function withTimeout<T>(p: PromiseLike<T>, ms = 12000): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}
