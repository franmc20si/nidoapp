/**
 * NIDO — hand-drawn vector icons
 * Style: bold strokes, round caps, two-color (primary + light fill)
 * ViewBox: 24×24 unless noted
 */
import Svg, { Path, Circle, Ellipse, Line, Rect, Polyline, G } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;   // primary stroke / dark
  fill?: string;    // secondary fill / light
  strokeWidth?: number;
}

const D = { w: 2.6 }; // default strokeWidth

// ── Home / Hoy ────────────────────────────────────────────────────────────────
export function IconHome({ size = 24, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 10.5 L12 3 L21 10.5 V20 Q21 21 20 21 H15 V15 Q15 14 14 14 H10 Q9 14 9 15 V21 H4 Q3 21 3 20 Z"
        stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" fill={fill} />
    </Svg>
  );
}

// ── Nest / Nido ───────────────────────────────────────────────────────────────
export function IconNest({ size = 24, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* nest bowl */}
      <Path d="M4 16 Q4 21 12 21 Q20 21 20 16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill={fill} />
      {/* twigs */}
      <Path d="M4 16 Q7 13 12 14 Q17 13 20 16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
      <Path d="M6 14 Q8 11 12 12" stroke={color} strokeWidth={strokeWidth * 0.75} strokeLinecap="round" fill="none" />
      <Path d="M18 14 Q16 11 12 12" stroke={color} strokeWidth={strokeWidth * 0.75} strokeLinecap="round" fill="none" />
      {/* eggs */}
      <Ellipse cx="10" cy="13" rx="2" ry="1.5" fill={fill} stroke={color} strokeWidth={strokeWidth * 0.7} />
      <Ellipse cx="14" cy="13" rx="2" ry="1.5" fill={fill} stroke={color} strokeWidth={strokeWidth * 0.7} />
      <Ellipse cx="12" cy="12" rx="1.8" ry="1.4" fill={fill} stroke={color} strokeWidth={strokeWidth * 0.7} />
    </Svg>
  );
}

// ── Chart / Reparto ───────────────────────────────────────────────────────────
export function IconChart({ size = 24, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="12" width="4.5" height="9" rx="1" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Rect x="9.5" y="7" width="4.5" height="14" rx="1" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Rect x="16" y="3" width="4.5" height="18" rx="1" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

// ── Fork & Knife / Menú ───────────────────────────────────────────────────────
export function IconMenu({ size = 24, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* fork */}
      <Line x1="7" y1="3" x2="7" y2="21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M5 3 L5 8 Q7 11 9 8 L9 3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* knife */}
      <Path d="M15 3 L17 3 Q19 3 19 8 L17 9 L17 21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// ── Calendar / Calendario ───────────────────────────────────────────────────
export function IconCalendar({ size = 24, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="5" width="18" height="16" rx="2" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Line x1="3" y1="10" x2="21" y2="10" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="8" y1="3" x2="8" y2="7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="16" y1="3" x2="16" y2="7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ── Bell / Campana ────────────────────────────────────────────────────────────
export function IconBell({ size = 24, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 17 Q5 16 7 16 L7 10 Q7 4 12 4 Q17 4 17 10 L17 16 Q19 16 19 17 Z"
        stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" fill={fill} />
      <Path d="M10 17 Q10 19 12 19 Q14 19 14 17" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// ── Plus / FAB ────────────────────────────────────────────────────────────────
export function IconPlus({ size = 24, color = '#FFFFFF', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="4" x2="12" y2="20" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ── Check ─────────────────────────────────────────────────────────────────────
export function IconCheck({ size = 16, color = '#FFFFFF', strokeWidth = 2.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12 L10 18 L20 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Close / X ─────────────────────────────────────────────────────────────────
export function IconX({ size = 18, color = '#5A4F44', strokeWidth = 2.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="5" y1="5" x2="19" y2="19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="19" y1="5" x2="5" y2="19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// ── Settings / Gear ───────────────────────────────────────────────────────────
export function IconSettings({ size = 20, color = '#5A4F44', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} fill={fill} />
      <Path d="M12 2 L13.5 5 L17 4 L18 7.5 L21 9 L19.5 12 L21 15 L18 16.5 L17 20 L13.5 19 L12 22 L10.5 19 L7 20 L6 16.5 L3 15 L4.5 12 L3 9 L6 7.5 L7 4 L10.5 5 Z"
        stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" fill={fill} />
    </Svg>
  );
}

// ── Camera ────────────────────────────────────────────────────────────────────
export function IconCamera({ size = 20, color = '#FFFFFF', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 8 Q2 7 3 7 L7 7 L9 4 L15 4 L17 7 L21 7 Q22 7 22 8 L22 19 Q22 20 21 20 L3 20 Q2 20 2 19 Z"
        stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" fill={fill} />
      <Circle cx="12" cy="13" r="3.5" stroke={color} strokeWidth={strokeWidth} fill={fill} />
    </Svg>
  );
}

// ── Arrow right ───────────────────────────────────────────────────────────────
export function IconChevronRight({ size = 20, color = '#978876', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5 L16 12 L9 19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Share ────────────────────────────────────────────────────────────────────
export function IconShare({ size = 20, color = '#5A4F44', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12 L4 19 Q4 20 5 20 L19 20 Q20 20 20 19 L20 12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 3 L12 15 M8 7 L12 3 L16 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── CATEGORY ICONS ──────────────────────────────────────────────────────────
// Each takes color (stroke) and fill (lighter area)

// Cocina — frying pan
export function CatCocina({ size = 22, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Ellipse cx="15" cy="14" rx="7" ry="5.5" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Line x1="8" y1="14" x2="3" y2="9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="5.5" y1="8" x2="3.5" y2="10" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
      {/* steam */}
      <Path d="M12 9 Q13 7 12 5" stroke={color} strokeWidth={strokeWidth * 0.7} strokeLinecap="round" fill="none" />
      <Path d="M15 9 Q16 7 15 5" stroke={color} strokeWidth={strokeWidth * 0.7} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// Baño — shower head
export function CatBano({ size = 22, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 4 Q5 3 6 3 L11 3 Q12 3 12 5 L12 9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Ellipse cx="15" cy="9" rx="4" ry="3" fill={fill} stroke={color} strokeWidth={strokeWidth} />
      {/* water drops */}
      <Line x1="12" y1="12" x2="11" y2="15" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
      <Line x1="15" y1="12" x2="15" y2="16" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
      <Line x1="18" y1="12" x2="19" y2="15" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
      <Line x1="13" y1="15" x2="12" y2="18" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
      <Line x1="16.5" y1="16" x2="17" y2="19" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
    </Svg>
  );
}

// Suelo — broom
export function CatSuelo({ size = 22, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="7" y1="3" x2="18" y2="14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M5 15 Q7 13 9 15 Q11 17 13 15 Q15 13 17 14 L17 20 Q17 21 16 21 L6 21 Q5 21 5 20 Z"
        fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

// Colada — t-shirt
export function CatColada({ size = 22, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 6 L7 4 Q8 7 12 7 Q16 7 17 4 L22 6 L20 11 L17 10 L17 20 Q17 21 16 21 L8 21 Q7 21 7 20 L7 10 L4 11 Z"
        fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

// Compra — shopping bag
export function CatCompra({ size = 22, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9 L5 20 Q5 21 6 21 L18 21 Q19 21 19 20 L20 9 Z"
        fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M9 9 Q9 5 12 5 Q15 5 15 9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
      <Line x1="9" y1="14" x2="15" y2="14" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
    </Svg>
  );
}

// Cristales — window with shine
export function CatCristales({ size = 22, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="18" height="18" rx="2" fill={fill} stroke={color} strokeWidth={strokeWidth} />
      <Line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth={strokeWidth * 0.8} />
      <Line x1="12" y1="3" x2="12" y2="21" stroke={color} strokeWidth={strokeWidth * 0.8} />
      {/* shine */}
      <Path d="M6 6 L8 8" stroke={color} strokeWidth={strokeWidth * 0.7} strokeLinecap="round" />
      <Path d="M7 6 L9 6" stroke={color} strokeWidth={strokeWidth * 0.7} strokeLinecap="round" />
      <Path d="M6 7 L6 9" stroke={color} strokeWidth={strokeWidth * 0.7} strokeLinecap="round" />
    </Svg>
  );
}

// General — wrench
export function CatGeneral({ size = 22, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 3 Q18 3 19 6 Q20 9 17 11 L8 20 Q7 21 5.5 21 Q4 21 3 20 Q2 19 2 17.5 Q2 16 3 15 L12 6 Q13.5 4 14.5 3 Z"
        fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx="6" cy="18" r="1.5" fill={color} />
    </Svg>
  );
}

// Coche — simple car
export function CatCoche({ size = 22, color = '#211C17', fill = 'transparent', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 13 L6 8 Q7 7 9 7 L15 7 Q17 7 18 8 L21 13 L21 17 Q21 18 20 18 L4 18 Q3 18 3 17 Z"
        fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M7 7 L8 4 L16 4 L17 7" stroke={color} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="7" cy="18" r="2.5" fill={fill} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx="17" cy="18" r="2.5" fill={fill} stroke={color} strokeWidth={strokeWidth} />
      <Line x1="3" y1="13" x2="21" y2="13" stroke={color} strokeWidth={strokeWidth * 0.7} strokeLinecap="round" />
    </Svg>
  );
}

// ── Empty-state illustration: clean nest ─────────────────────────────────────
// Larger viewBox (80×80) for use as an illustration
export function IlluNidoLimpio({ size = 100, color = '#C2502F', fill = '#F6E3D7' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      {/* branch */}
      <Path d="M10 58 Q40 52 70 58" stroke={color} strokeWidth={3} strokeLinecap="round" />

      {/* nest bowl outer */}
      <Path d="M18 46 Q20 60 40 62 Q60 60 62 46"
        stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill={fill} />

      {/* nest twigs (horizontal weave) */}
      <Path d="M18 46 Q28 40 40 43 Q52 40 62 46"
        stroke={color} strokeWidth={2.8} strokeLinecap="round" fill="none" />
      <Path d="M20 50 Q30 45 40 47 Q50 45 60 50"
        stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Path d="M22 54 Q31 50 40 51 Q49 50 58 54"
        stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" />

      {/* diagonal twigs left */}
      <Path d="M18 46 Q14 52 16 58" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M24 43 Q18 49 20 56" stroke={color} strokeWidth={1.6} strokeLinecap="round" />

      {/* diagonal twigs right */}
      <Path d="M62 46 Q66 52 64 58" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M56 43 Q62 49 60 56" stroke={color} strokeWidth={1.6} strokeLinecap="round" />

      {/* small leaf sprigs */}
      <Path d="M12 46 Q8 38 14 34 Q14 40 12 46Z" fill={fill} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M14 43 Q10 36 16 32 Q15 39 14 43Z" fill={fill} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M66 46 Q72 38 66 34 Q66 40 68 46Z" fill={fill} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />

      {/* stars / sparkles: nest is clean */}
      <Path d="M40 20 L41.2 24 L45 24 L42 26.4 L43.2 30 L40 27.6 L36.8 30 L38 26.4 L35 24 L38.8 24 Z"
        fill={fill} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M26 16 L26.7 18.2 L29 18.2 L27.2 19.6 L27.9 21.8 L26 20.4 L24.1 21.8 L24.8 19.6 L23 18.2 L25.3 18.2 Z"
        fill={fill} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M54 18 L54.5 20 L56.6 20 L55 21.2 L55.5 23.2 L54 22 L52.5 23.2 L53 21.2 L51.4 20 L53.5 20 Z"
        fill={fill} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </Svg>
  );
}

// ─── ACHIEVEMENT ICONS ────────────────────────────────────────────────────────

// Racha — llama / flame
export function AchFlame({ size = 28, color = '#C2502F', fill = '#F6E3D7', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2 Q14 6 11 8 Q15 7 16 11 Q17 15 12 18 Q7 15 8 11 Q9 8 10 9 Q8 6 12 2 Z"
        fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M12 14 Q11 16 12 17 Q13 16 12 14 Z"
        fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />
    </Svg>
  );
}

// Nido lleno — nest with eggs + star above
export function AchNest({ size = 28, color = '#C2502F', fill = '#F6E3D7', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 15 Q4 20 12 20 Q20 20 20 15"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill={fill} />
      <Path d="M4 15 Q8 12 12 13 Q16 12 20 15"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
      <Ellipse cx="10" cy="12.5" rx="1.8" ry="1.4" fill={fill} stroke={color} strokeWidth={1.4} />
      <Ellipse cx="14" cy="12.5" rx="1.8" ry="1.4" fill={fill} stroke={color} strokeWidth={1.4} />
      <Ellipse cx="12" cy="11.5" rx="1.6" ry="1.3" fill={fill} stroke={color} strokeWidth={1.4} />
      {/* star above */}
      <Path d="M12 3 L12.8 5.4 L15.4 5.4 L13.3 6.9 L14.1 9.3 L12 7.8 L9.9 9.3 L10.7 6.9 L8.6 5.4 L11.2 5.4 Z"
        fill={fill} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </Svg>
  );
}

// Centena — star
export function AchStar({ size = 28, color = '#C2502F', fill = '#F6E3D7', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2 L14.4 8.3 L21.2 8.3 L15.9 12.4 L17.9 18.7 L12 14.6 L6.1 18.7 L8.1 12.4 L2.8 8.3 L9.6 8.3 Z"
        fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

// Maratón — trophy cup
export function AchTrophy({ size = 28, color = '#C2502F', fill = '#F6E3D7', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* cup */}
      <Path d="M7 3 H17 L16 12 Q16 15 12 15 Q8 15 8 12 Z"
        fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      {/* handles */}
      <Path d="M7 5 Q4 5 4 8 Q4 11 7 10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
      <Path d="M17 5 Q20 5 20 8 Q20 11 17 10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
      {/* stem */}
      <Line x1="12" y1="15" x2="12" y2="19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* base */}
      <Line x1="8" y1="19" x2="16" y2="19" stroke={color} strokeWidth={strokeWidth * 1.1} strokeLinecap="round" />
      {/* shine line inside cup */}
      <Path d="M10 7 Q10 10 11 11" stroke={color} strokeWidth={strokeWidth * 0.65} strokeLinecap="round" opacity={0.5} />
    </Svg>
  );
}

// Leyenda — gem / diamond
export function AchGem({ size = 28, color = '#C2502F', fill = '#F6E3D7', strokeWidth = D.w }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* diamond shape */}
      <Path d="M12 3 L20 9 L12 21 L4 9 Z"
        fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      {/* top facet */}
      <Path d="M4 9 L8 6 L12 3 L16 6 L20 9 L12 9 Z"
        fill={color} stroke={color} strokeWidth={strokeWidth * 0.5} strokeLinejoin="round" opacity={0.25} />
      {/* center line */}
      <Line x1="12" y1="9" x2="12" y2="21" stroke={color} strokeWidth={strokeWidth * 0.6} strokeLinecap="round" opacity={0.4} />
      <Line x1="4" y1="9" x2="20" y2="9" stroke={color} strokeWidth={strokeWidth * 0.6} strokeLinecap="round" opacity={0.4} />
    </Svg>
  );
}

// Map from category key to component
export const CAT_ICONS: Record<string, React.ComponentType<IconProps>> = {
  cocina:    CatCocina,
  bano:      CatBano,
  suelo:     CatSuelo,
  colada:    CatColada,
  compra:    CatCompra,
  cristales: CatCristales,
  general:   CatGeneral,
  coche:     CatCoche,
};

export function getCatIcon(key: string | null | undefined): React.ComponentType<IconProps> {
  return CAT_ICONS[key ?? ''] ?? CatGeneral;
}
