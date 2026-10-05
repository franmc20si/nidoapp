import { useEffect, useRef, useState } from 'react';
import {
  Animated, Pressable, View, Easing, StyleSheet, Dimensions,
  KeyboardAvoidingView, Platform, PanResponder, StyleProp, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R } from '@/constants/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';
import SheetPortal from '@/components/SheetPortal';

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
  const insets = useSafeAreaInsets();
  // Mantiene el Modal montado durante la animación de salida.
  const [render, setRender] = useState(visible);
  const heightRef = useRef(SCREEN_H);
  const translateY = useRef(new Animated.Value(SCREEN_H)).current; // px; arranca fuera de pantalla
  const scrim = useRef(new Animated.Value(0)).current;             // 0..1
  // El mismo gesto que abre el sheet (p.ej. tocar un hueco vacío del menú)
  // monta el scrim justo donde está el dedo/cursor; el "mouseup"/toque de
  // ESE MISMO gesto aterriza sobre el scrim recién aparecido y lo cierra al
  // instante — se abre y se cierra en el mismo toque, siempre. Un guardia
  // por tiempo (Date.now() en un useEffect) no basta: el efecto que lo arma
  // corre DESPUÉS del commit, y el toque fantasma puede llegar antes. En su
  // lugar, el scrim nace con pointerEvents:none y solo se "arma" (puede
  // cerrar) tras un frame pintado de verdad (doble rAF) — cualquier evento
  // de ese mismo gesto lo atraviesa sin hacer nada.
  const [scrimArmed, setScrimArmed] = useState(false);

  const animate = (open: boolean, onDone?: () => void) => {
    const duration = reduced ? 0 : open ? ENTER_MS : EXIT_MS;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: open ? 0 : heightRef.current,
        duration, easing: open ? EASE_DRAWER : EASE_OUT, useNativeDriver: true,
      }),
      Animated.timing(scrim, { toValue: open ? 1 : 0, duration, easing: EASE_OUT, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished && onDone) onDone(); });
    // Red de seguridad: si la animación se interrumpe `finished` llega
    // `false` y `onDone` nunca se dispara. Se guarda el timer para poder
    // cancelarlo si el sheet se reabre antes (si no, desmontaría el sheet
    // recién abierto).
    if (!open && onDone) closeTimer.current = setTimeout(onDone, duration + 60);
  };
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCloseTimer = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  useEffect(() => clearCloseTimer, []);

  useEffect(() => {
    clearCloseTimer();
    if (visible) {
      setScrimArmed(false);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setScrimArmed(true)); });
      setRender(true); animate(true);
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    } else if (render) {
      setScrimArmed(false);
      animate(false, () => { clearCloseTimer(); setRender(false); });
    }
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
    // Solo se monta mientras el sheet está abierto o animando la salida: al
    // cerrar no queda NADA en el DOM que pueda capturar toques.
    !render ? null :
    <SheetPortal onRequestClose={onClose}>
      {/* pointerEvents atado a `visible && scrimArmed` (no a `render`) y
          puesto en el `style` (no como prop): como prop, Pressable no lo
          aplica de forma fiable en react-native-web — el elemento se queda
          con pointer-events:auto aunque ya esté invisible. Así, el scrim no
          captura nada hasta que de verdad se ha pintado un frame (evita que
          el propio toque de apertura lo cierre) ni tras cerrarse. */}
      <AnimatedPressable
        style={[s.scrim, { opacity: scrim, pointerEvents: (visible && scrimArmed) ? 'auto' : 'none' } as any]}
        onPress={onClose}
      />
      {/* Mismo problema que el scrim: "box-none" como prop no se aplica de
          forma fiable — este contenedor a pantalla completa se queda
          bloqueando toda la app mientras el sheet sigue montado (durante o
          tras cerrarse), aunque su contenido ya esté fuera de pantalla. Va
          por `style` y se desactiva del todo (ni siquiera box-none) en
          cuanto deja de estar "abierto" lógicamente. */}
      <KeyboardAvoidingView
        style={[s.kav, { pointerEvents: visible ? 'box-none' : 'none' } as any]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View
          onLayout={(e) => { heightRef.current = e.nativeEvent.layout.height; }}
          // pointer-events se hereda: la capa de SheetPortal (web) y el KAV van
          // con none, así que el sheet lo reactiva explícitamente mientras está
          // abierto (en web, `box-none` por style no reactiva a los hijos).
          style={[s.sheet, { paddingBottom: insets.bottom }, sheetStyle, { transform: [{ translateY }], pointerEvents: visible ? 'auto' : 'none' } as any]}
        >
          {/* Zona de arrastre: el asa + un área generosa alrededor. */}
          <View style={s.grabZone} {...pan.panHandlers}>
            <View style={s.grab} />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </SheetPortal>
  );
}

const s = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(33,28,23,0.42)' },
  // Contenedor a pantalla completa que ancla el sheet abajo (fiable en web).
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.paper, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '88%' },
  grabZone: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.line },
});
