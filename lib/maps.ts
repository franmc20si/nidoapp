/**
 * maps — utilidades para los links de Google Maps de los viajes.
 *
 * No usamos ninguna API de mapas (sin key ni coste): de cada link intentamos
 * extraer el nombre del sitio para mostrar una tarjeta limpia con un pin, y al
 * tocarla abrimos el link en la app/web de Maps.
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

/** ¿Parece un link de Google Maps? (para validar el campo al añadir). */
export function looksLikeMapsUrl(url: string): boolean {
  return /https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url.trim());
}

/** Abre el link en Google Maps (app nativa o navegador). */
export async function openMaps(url: string): Promise<void> {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    /* el link puede ser inválido; lo ignoramos en silencio */
  }
}
