import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Recuerda cuál fue el último nido activo para volver a él al reabrir la app.
// Un usuario puede pertenecer a varios nidos; sin esto, al reiniciar se elegía
// uno arbitrario (el primero que devolvía la consulta).
const KEY = 'nido_active_household';

export async function setActiveHouseholdId(id: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return;
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
      return;
    }
    if (id) await AsyncStorage.setItem(KEY, id);
    else await AsyncStorage.removeItem(KEY);
  } catch {}
}

export async function getActiveHouseholdId(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    }
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}
