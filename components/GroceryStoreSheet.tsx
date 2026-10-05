import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator, Platform, Alert,
} from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import PressScale from '@/components/PressScale';
import { C, R, FONT } from '@/constants/theme';
import { NIDO_COLORS, nidoColorByKey } from '@/constants/nidoColors';
import { useGroceryStore } from '@/store/groceryStore';
import { useAuthStore } from '@/store/authStore';
import { GroceryStore } from '@/types';

interface Props {
  store: GroceryStore | null; // null = crear
  visible: boolean;
  onClose: () => void;
  onSaved?: (store: GroceryStore) => void;
  onDeleted?: (id: string) => void;
}

export default function GroceryStoreSheet({ store, visible, onClose, onSaved, onDeleted }: Props) {
  const { household, user } = useAuthStore();
  const { addStore, updateStore, deleteStore } = useGroceryStore();

  const [name,  setName]  = useState('');
  const [color, setColor] = useState(NIDO_COLORS[0].key);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  const isEdit = !!store;

  useEffect(() => {
    if (!visible) return;
    if (store) {
      setName(store.name);
      setColor(store.color ?? NIDO_COLORS[0].key);
    } else {
      setName('');
      setColor(NIDO_COLORS[0].key);
    }
    setError('');
  }, [store, visible]);

  const handleSave = async () => {
    if (!household) return;
    if (!name.trim()) { setError('Ponle un nombre a la tienda'); return; }
    setSaving(true);
    setError('');
    const input = { name: name.trim(), color };
    try {
      if (store) {
        const res = await updateStore(store.id, input);
        if (!res.ok) { setError(res.error ?? 'No se pudo guardar'); return; }
        onSaved?.({ ...store, ...input });
      } else {
        const res = await addStore(household.id, user?.id, input);
        if (!res.ok || !res.store) { setError(res.error ?? 'No se pudo guardar'); return; }
        onSaved?.(res.store);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!store) return;
    setDeleting(true);
    setError('');
    try {
      const res = await deleteStore(store.id);
      if (!res.ok) { setError(res.error ?? 'No se pudo eliminar'); return; }
      onDeleted?.(store.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleDelete = () => {
    const msg = 'Las compras de esta tienda quedarán como "Sin tienda". ¿Eliminarla?';
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm(msg)) doDelete();
      return;
    }
    Alert.alert('Eliminar tienda', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: doDelete },
    ]);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.body}>
        <View style={s.headerRow}>
          <Text style={s.sheetTitle}>{isEdit ? 'Editar tienda' : 'Nueva tienda'}</Text>
          {isEdit && (
            <PressScale onPress={handleDelete} disabled={deleting} style={s.deleteBtn}>
              {deleting
                ? <ActivityIndicator size="small" color={C.danger} />
                : <Text style={s.deleteBtnText}>Eliminar</Text>}
            </PressScale>
          )}
        </View>

        <TextInput
          style={s.field}
          value={name}
          onChangeText={setName}
          placeholder="Nombre (ej. Día, Lidl, Frutería…)"
          placeholderTextColor={C.ink3}
          autoFocus={!isEdit}
        />

        <Text style={s.label}>Color</Text>
        <View style={s.swatchRow}>
          {NIDO_COLORS.map((col) => {
            const on = color === col.key;
            return (
              <PressScale
                key={col.key}
                scaleTo={0.9}
                onPress={() => setColor(col.key)}
                style={[s.swatch, { backgroundColor: col.hex }, on && s.swatchOn]}
              >
                {on ? <Text style={s.swatchCheck}>✓</Text> : null}
              </PressScale>
            );
          })}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <PressScale
          style={[s.save, { backgroundColor: nidoColorByKey(color).hex }, saving && s.saveDim]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveText}>{isEdit ? 'Guardar cambios' : 'Añadir tienda'}</Text>}
        </PressScale>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  body: { padding: 22, paddingBottom: 40 },

  headerRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle:    { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  deleteBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.danger },
  deleteBtnText: { color: C.danger, fontWeight: '600', fontSize: 13, fontFamily: FONT },

  label: { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, letterSpacing: 0.2, marginBottom: 12, textTransform: 'uppercase' },

  field: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 16, fontSize: 17, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginBottom: 22 },

  swatchRow:   { flexDirection: 'row', gap: 12, marginBottom: 24 },
  swatch:      { width: 44, height: 44, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  swatchOn:    { borderColor: C.ink },
  swatchCheck: { color: C.white, fontSize: 18, fontWeight: '700' },

  error: { color: C.danger, fontSize: 13, fontFamily: FONT, marginBottom: 10, textAlign: 'center' },
  save:     { borderRadius: R.pill, paddingVertical: 17, alignItems: 'center', marginTop: 4 },
  saveDim:  { opacity: 0.5 },
  saveText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
