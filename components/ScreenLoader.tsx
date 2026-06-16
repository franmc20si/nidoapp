import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { C, R, FONT } from '@/constants/theme';

export function ScreenLoader({ color }: { color?: string }) {
  return (
    <View style={s.wrap}>
      <ActivityIndicator size="large" color={color ?? C.ink3} />
    </View>
  );
}

export function ScreenError({
  message, onRetry, color,
}: { message?: string; onRetry: () => void; color?: string }) {
  return (
    <View style={s.wrap}>
      <Text style={s.msg}>{message ?? 'No se pudo cargar. Comprueba tu conexión.'}</Text>
      <TouchableOpacity style={[s.btn, { backgroundColor: color ?? C.brand }]} onPress={onRetry} activeOpacity={0.85}>
        <Text style={s.btnText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120, paddingHorizontal: 32, gap: 14 },
  msg: { fontSize: 14, color: C.ink2, fontFamily: FONT, textAlign: 'center' },
  btn: { borderRadius: R.pill, paddingHorizontal: 22, paddingVertical: 12 },
  btnText: { color: C.white, fontWeight: '600', fontSize: 14, fontFamily: FONT },
});
