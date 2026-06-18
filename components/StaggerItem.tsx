import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from '@/lib/useReducedMotion';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const STEP_MS = 40;   // Emil: 30–80ms entre ítems; corto para no sentir lentitud.
const MAX_STEPS = 8;  // tope para que una lista larga no cascadee eternamente.

/**
 * Envuelve un ítem de lista para que entre con fade + leve subida, escalonado
 * por su índice. Emil: el stagger es decorativo; nunca bloquea la interacción.
 * Solo anima al montar (los ítems con key estable no re-animan en re-render).
 */
export default function StaggerItem({ index, children }: { index: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) { p.setValue(1); return; }
    Animated.timing(p, {
      toValue: 1,
      duration: 280,
      delay: Math.min(index, MAX_STEPS) * STEP_MS,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return (
    <Animated.View style={{ opacity: p, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}
