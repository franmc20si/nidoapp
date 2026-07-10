/**
 * maps — utilidades para los enlaces de los sitios de un viaje.
 *
 * Se admite CUALQUIER enlace (no solo Google Maps). Si el link es de Maps
 * intentamos extraer el nombre del sitio para rellenar el título; en cualquier
 * otro caso mostramos una etiqueta legible (el dominio) y, al tocar, abrimos el
 * enlace en el navegador/app correspondiente.
 */
import { Linking } from 'react-native';

function decodePlus(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' ')).trim();
  } catch {
    return s.replace(/\+/g, ' ').trim();
  }
}

/**
 * Intenta extraer un nombre legible del sitio a partir de un link de Maps.
 * Cubre los formatos largos (.../place/Nombre/@..., /search/Nombre, ?q=Nombre).
 * Los links cortos (maps.app.goo.gl, goo.gl/maps) no llevan nombre → null.
 */
export function extractPlaceName(url: string): string | null {
  if (!url) return null;
  try {
    // /maps/place/<Nombre>/...
    const place = url.match(/\/maps\/place\/([^/@?]+)/i);
    if (place?.[1]) return decodePlus(place[1]);

    // /maps/search/<Nombre>
    const search = url.match(/\/maps\/search\/([^/@?]+)/i);
    if (search?.[1]) return decodePlus(search[1]);

    // ?q=<Nombre> o &query=<Nombre> (si no son coordenadas)
    const q = url.match(/[?&](?:q|query)=([^&]+)/i);
    if (q?.[1]) {
      const val = decodePlus(q[1]);
      if (!/^-?\d+\.\d+,-?\d+\.\d+$/.test(val)) return val;
    }
  } catch {
    /* noop */
  }
  return null;
}

/** Normaliza un enlace pegado: si no trae esquema, le antepone https://. */
export function normalizeUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`;
}

/** ¿Tiene pinta de enlace válido? (validación laxa: acepta cualquier dominio). */
export function looksLikeUrl(url: string): boolean {
  const u = url.trim();
  // Con esquema, o algo tipo "dominio.tld[/...]" para permitir pegar sin https.
  return /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(u) || /^[^\s.]+\.[^\s.]{2,}(\S*)?$/i.test(u);
}

/** Etiqueta corta y legible de un enlace: el dominio sin "www." (o el original). */
export function linkLabel(url: string): string {
  const u = normalizeUrl(url);
  const m = u.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i);
  return m?.[1] ? m[1].replace(/^www\./i, '') : url.trim();
}

/** Abre el enlace en el navegador/app correspondiente. */
export async function openLink(url: string): Promise<void> {
  if (!url) return;
  try {
    await Linking.openURL(normalizeUrl(url));
  } catch {
    /* el link puede ser inválido; lo ignoramos en silencio */
  }
}
