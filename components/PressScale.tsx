import { useRef } from 'react';
import { Animated, Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  /** Cuánto encoge al pulsar. Sutil (0.95–0.98) según Emil. */
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Reemplazo directo de TouchableOpacity con feedback de presión por escala.
 * Emil: los botones deben sentirse vivos al pulsarlos; scale > opacity.
 * Usa spring sin rebote para que vuelva nítido, y mantiene el estilo (incl.
 * flex) en el propio Pressable para no alterar el layout.
 */
export default function PressScale({ scaleTo = 0.97, style, children, disabled, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 50, bounciness: 0 }).start();

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => !disabled && to(scaleTo)}
      onPressOut={() => to(1)}
      style={[style, { transform: [{ scale }] }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
