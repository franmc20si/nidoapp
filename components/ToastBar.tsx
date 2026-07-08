import { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Platform } from 'react-native';
import { useToastStore } from '@/store/toastStore';
import { C, FONT } from '@/constants/theme';

const BG: Record<string, string> = {
  error:   C.brand,
  success: C.success,
  info:    C.info,
};

export function ToastBar() {
  const { message, type, dismissToast } = useToastStore();
  const opacity     = useRef(new Animated.Value(0)).current;
  const translateY  = useRef(new Animated.Value(20)).current;
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (message) {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      timerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 20, duration: 200, useNativeDriver: true }),
        ]).start(dismissToast);
      }, 3200);
    } else {
      opacity.setValue(0);
      translateY.setValue(20);
    }

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [message]);

  if (!message) return null;

  return (
    <Animated.View
      style={[
        s.bar,
        { backgroundColor: BG[type] ?? BG.info, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <Text style={s.text} numberOfLines={2}>{message}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 90,
    left: 20,
    right: 20,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 999,
  },
  text: {
    color: C.white,
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '500',
    lineHeight: 20,
  },
});
