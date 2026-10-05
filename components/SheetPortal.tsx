import { Modal } from 'react-native';

// Nativo: el Modal de React Native de siempre. En web se usa SheetPortal.web.tsx.
export default function SheetPortal({ onRequestClose, children }: {
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible transparent animationType="none" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
