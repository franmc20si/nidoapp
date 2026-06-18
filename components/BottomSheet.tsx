import { useEffect, useRef, useState } from 'react';
import {
  Animated, Pressable, View, Modal, Easing, StyleSheet, Dimensions,
  KeyboardAvoidingView, Platform, StyleProp, ViewStyle,
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
  const [height, setHeight] = useState(SCREEN_H);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRender(true);
      Animated.timing(progress, {
        toValue: 1, duration: reduced ? 0 : ENTER_MS, easing: EASE_DRAWER, useNativeDriver: true,
      }).start();
    } else if (render) {
      Animated.timing(progress, {
        toValue: 0, duration: reduced ? 0 : EXIT_MS, easing: EASE_OUT, useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setRender(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Reducir movimiento: sin desplazamiento, solo fade del scrim.
  const translateY = reduced
    ? 0
    : progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  const scrimOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal visible={render} transparent animationType="none" onRequestClose={onClose}>
      <AnimatedPressable style={[s.scrim, { opacity: scrimOpacity }]} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
        <Animated.View
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[s.sheet, sheetStyle, { transform: [{ translateY }] }]}
        >
          <View style={s.grab} />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(33,28,23,0.42)' },
  sheet: { backgroundColor: C.paper, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '88%' },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginTop: 12 },
});
