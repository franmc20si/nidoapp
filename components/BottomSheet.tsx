import { useEffect, useRef, useState } from 'react';
import {
  Animated, Pressable, View, Modal, Easing, StyleSheet, Dimensions,
  KeyboardAvoidingView, Platform, PanResponder, StyleProp, ViewStyle,
} from 'react-native';
import { C, R } from '@/constants/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Curva de cajón iOS (Ionic) — la que usa Vaul. Arranca decidida y asienta suave.
const EASE_DRAWER = Easing.bezier(0.32, 0.72, 0, 1);
// Salida: ease-out fuerte y más corta. Emil: la salida siempre más rápida que la entrada.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const ENTER_MS = 380;
const EXIT_MS = 240;

// Umbrales de descarte (Emil): un flick rápido basta aunque no se arrastre lejos.
const DISMISS_DISTANCE = 0.28; // fracción de la altura del sheet
const DISMISS_VELOCITY = 0.5;  // px/ms hacia abajo

const SCREEN_H = Dimensions.get('window').height;

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Sobrescribe estilos del contenedor del sheet (p.ej. maxHeight). */
  sheetStyle?: StyleProp<ViewStyle>;
}

export default function BottomSheet({ visible, onClose, children, sheetStyle }: Props) {
  const reduced = useReducedMotion();
  // Mantiene el Modal montado durante la animación de salida.
  const [render, setRender] = useState(visible);
  const heightRef = useRef(SCREEN_H);
  const translateY = useRef(new Animated.Value(SCREEN_H)).current; // px; arranca fuera de pantalla
  const scrim = useRef(new Animated.Value(0)).current;             // 0..1

  const animate = (open: boolean, onDone?: () => void) => {
    const duration = reduced ? 0 : open ? ENTER_MS : EXIT_MS;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: open ? 0 : heightRef.current,
        duration, easing: open ? EASE_DRAWER : EASE_OUT, useNativeDriver: true,
      }),
      Animated.timing(scrim, { toValue: open ? 1 : 0, duration, easing: EASE_OUT, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished && onDone) onDone(); });
  };

  useEffect(() => {
    if (visible) { setRender(true); animate(true); }
    else if (render) { animate(false, () => setRender(false)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Arrastre desde el asa. Emil: pointer capture, sin saltos, descarte por velocidad.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => translateY.stopAnimation(),
      onPanResponderMove: (_, g) => {
        const dy = Math.max(0, g.dy); // sin arrastre hacia arriba (Emil: fricción/tope)
        translateY.setValue(dy);
        scrim.setValue(Math.max(0, 1 - dy / heightRef.current));
      },
      onPanResponderRelease: (_, g) => {
        const h = heightRef.current;
        const dismiss = g.dy > h * DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY;
        if (dismiss) {
          Animated.parallel([
            Animated.timing(translateY, { toValue: h, duration: EXIT_MS, easing: EASE_OUT, useNativeDriver: true }),
            Animated.timing(scrim, { toValue: 0, duration: EXIT_MS, easing: EASE_OUT, useNativeDriver: true }),
          ]).start(({ finished }) => { if (finished) onClose(); });
        } else {
          // Vuelve a sitio con spring (mantiene velocidad si se interrumpe).
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
          Animated.timing(scrim, { toValue: 1, duration: 160, easing: EASE_OUT, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <Modal visible={render} transparent animationType="none" onRequestClose={onClose}>
      <AnimatedPressable style={[s.scrim, { opacity: scrim }]} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
        <Animated.View
          onLayout={(e) => { heightRef.current = e.nativeEvent.layout.height; }}
          style={[s.sheet, sheetStyle, { transform: [{ translateY }] }]}
        >
          {/* Zona de arrastre: el asa + un área generosa alrededor. */}
          <View style={s.grabZone} {...pan.panHandlers}>
            <View style={s.grab} />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(33,28,23,0.42)' },
  sheet: { backgroundColor: C.paper, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '88%' },
  grabZone: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line },
});
