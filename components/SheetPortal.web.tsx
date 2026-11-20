import { useEffect, useLayoutEffect, useState } from 'react';
// react-dom va con react-native-web pero sin @types instalados.
const { createPortal } = require('react-dom') as {
  createPortal: (children: React.ReactNode, container: Element) => React.ReactElement;
};

// Capa propia para los sheets en web, en lugar del <Modal> de react-native-web.
//
// Ese Modal crea su contenedor en <body> DURANTE el render y lo limpia en un
// efecto; con React 19 se quedaban contenedores huérfanos con el contenido del
// sheet dentro (opacidad 0 pero position:fixed a pantalla completa) que se
// tragaban todos los toques → la app parecía congelada tras añadir un plato.
//
// Aquí el contenedor no captura nada (pointer-events:none): solo el scrim y el
// sheet lo reactivan mientras están abiertos, así que aunque algo se quedara
// montado no puede bloquear la app. Se engancha a <body> al crearse (no en un
// efecto) para que los `autoFocus` de los hijos —que se ejecutan antes que los
// efectos del padre— encuentren el input ya en la página. Si un render se
// descartara, solo quedaría un div vacío e inerte.
export default function SheetPortal({ onRequestClose, children }: {
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  const [el] = useState(() => {
    const d = document.createElement('div');
    // top/height los ajusta el efecto del visualViewport (teclado en móvil).
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;height:100%;z-index:9999;pointer-events:none;display:flex;flex-direction:column;';
    document.body.appendChild(d);
    return d;
  });

  useLayoutEffect(() => {
    if (!el.isConnected) document.body.appendChild(el); // p.ej. tras un remount de StrictMode
    return () => { el.remove(); };
  }, [el]);

  // ── Teclado en móvil ──────────────────────────────────────────────────────
  // En iOS (y en Android Chrome) el teclado virtual se pinta ENCIMA de la
  // página sin encoger el viewport de layout, así que un sheet anclado abajo
  // con position:fixed queda tapado. KeyboardAvoidingView no hace nada en web.
  // La capa sigue al visualViewport (la parte que de verdad se ve): con el
  // teclado abierto se encoge hasta su borde superior y el sheet, que va
  // anclado abajo con maxHeight en %, se recoloca encima del teclado.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);

    // Al enfocar un campo, que quede a la vista dentro del sheet en cuanto el
    // teclado termine de abrirse (el resize del viewport llega después).
    let t: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !/^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      clearTimeout(t);
      t = setTimeout(() => target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350);
    };
    el.addEventListener('focusin', onFocusIn);

    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      el.removeEventListener('focusin', onFocusIn);
      clearTimeout(t);
    };
  }, [el]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onRequestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onRequestClose]);

  return createPortal(children, el);
}
