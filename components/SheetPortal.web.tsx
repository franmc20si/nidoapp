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
// Aquí el contenedor solo se engancha a <body> en un layout effect (un render
// descartado nunca llega a tocar el DOM) y el propio contenedor no captura
// nada (pointer-events:none): solo el scrim y el sheet lo reactivan mientras
// están abiertos. Aunque algo se quedara montado, no puede bloquear la app.
export default function SheetPortal({ onRequestClose, children }: {
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  const [el] = useState(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;display:flex;flex-direction:column;';
    return d;
  });

  useLayoutEffect(() => {
    document.body.appendChild(el);
    return () => { el.remove(); };
  }, [el]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onRequestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onRequestClose]);

  return createPortal(children, el);
}
