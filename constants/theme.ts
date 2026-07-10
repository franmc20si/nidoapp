export const C = {
  // paper & ink
  paper:      '#F4EEE1',
  paperSoft:  '#FAF6EC',
  paperDeep:  '#EAE1CD',
  card:       '#FFFDF8',
  ink:        '#211C17',
  ink2:       '#5A4F44',
  ink3:       '#75695A',  // gris apagado; oscurecido a ~4.6:1 sobre paper para pasar WCAG AA (antes #978876, ~3:1)
  line:       '#E2D8C4',
  white:      '#FFFFFF',

  // brand
  brand:        '#C2502F',
  brandWash:    '#F6E3D7',
  brandWashSoft:'#FEE8E1',  // wash más rosado (p. ej. fondo del botón Cerrar sesión)

  // semantic
  danger:     '#c0392b',
  dangerTint: '#FEF3F2',
  dangerLine: '#FECDCA',
  success:    '#3A8B5C',    // toast de éxito
  info:       '#44546A',    // toast informativo

  // member / avatar accents (distinct from category colors)
  olivo:      '#7FA86A',
  lila:       '#A881F2',
  coral:      '#D97B66',

  // categories
  cocina:     '#D9663F',  cocinaTint: '#F7E2D6',
  cena:       '#C98A3C',  cenaTint:   '#F6E8D2',
  suelo:      '#5B97C4',  sueloTint:  '#DCEAF4',
  cristales:  '#8E6FCF',  cristalesTint: '#E7DEF6',
  general:    '#6FA368',  generalTint:'#E0EDD9',
  bano:       '#4FA3B5',  banoTint:   '#D8EDF0',
  colada:     '#C06796',  coladaTint: '#F4DEEB',
  compra:     '#8C7A3F',  compraTint: '#EFE9D2',
  coche:      '#5C5650',  cocheTint:  '#E4DECF',
};

export const R = {
  s:  12,
  m:  18,
  l:  26,
  xl: 34,
  pill: 999,
};

export const FONT = 'Nohemi';

export const MEMBER_COLORS = [C.brand, C.suelo, C.olivo, C.lila, C.coral];
