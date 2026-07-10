import { useEffect, useRef } from 'react';
import { Animated, Text, View, Pressable, StyleSheet, Platform } from 'react-native';
import { useToastStore } from '@/store/toastStore';
import { C, FONT } from '@/constants/theme';

const BG: Record<string, string> = {
  error:   C.brand,
  success: C.success,
  info:    C.info,
};

export function ToastBar() {
  const { message, type, action, seq, dismissToast } = useToastStore();
  const opacity     = useRef(new Animated.Value(0)).current;
  const translateY  = useRef(new Animated.Value(20)).current;
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animateOut = (onDone?: () => void) => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 20, duration: 200, useNativeDriver: true }),
    ]).start(() => { dismissToast(); onDone?.(); });
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (message) {
      opacity.setValue(0);
      translateY.setValue(20);
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      // Con acción damos más tiempo para poder pulsar "Deshacer".
      timerRef.current = setTimeout(() => animateOut(), action ? 5000 : 3200);
    } else {
      opacity.setValue(0);
      translateY.setValue(20);
    }

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  if (!message) return null;

  const onAction = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const fn = action?.onPress;
    animateOut();
    fn?.();
  };

  return (
    <Animated.View
      style={[s.bar, { backgroundColor: BG[type] ?? BG.info, opacity, transform: [{ translateY }] }]}
      pointerEvents={action ? 'box-none' : 'none'}
    >
      <View style={s.inner} pointerEvents={action ? 'box-none' : 'none'}>
        <Text style={s.text} numberOfLines={2} pointerEvents="none">{message}</Text>
        {action && (
          <Pressable onPress={onAction} hitSlop={10} style={s.actionBtn}>
            <Text style={s.actionText}>{action.label}</Text>
          </Pressable>
        )}
      </View>
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
  inner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: {
    flex: 1,
    color: C.white,
    fontSize: 14,
    fontFamily: FONT,
    fontWeight: '500',
    lineHeight: 20,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  actionText: {
    color: C.white,
    fontSize: 13.5,
    fontFamily: FONT,
    fontWeight: '700',
  },
});
