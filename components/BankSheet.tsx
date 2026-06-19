import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator, Platform, Alert,
} from 'react-native';
import BottomSheet from '@/components/BottomSheet';
import PressScale from '@/components/PressScale';
import { C, R, FONT } from '@/constants/theme';
import { NIDO_COLORS, nidoColorByKey } from '@/constants/nidoColors';
import { useBanksStore } from '@/store/banksStore';
import { useAuthStore } from '@/store/authStore';
import { Bank } from '@/types';

interface Props {
  bank: Bank | null; // null = crear
  visible: boolean;
  onClose: () => void;
  onSaved?: (bank: Bank) => void;
  onDeleted?: (id: string) => void;
}

export default function BankSheet({ bank, visible, onClose, onSaved, onDeleted }: Props) {
  const { household, user } = useAuthStore();
  const { addBank, updateBank, deleteBank } = useBanksStore();

  const [name,  setName]  = useState('');
  const [color, setColor] = useState(NIDO_COLORS[0].key);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  const isEdit = !!bank;

  useEffect(() => {
    if (!visible) return;
    if (bank) {
      setName(bank.name);
      setColor(bank.color ?? NIDO_COLORS[0].key);
    } else {
      setName('');
      setColor(NIDO_COLORS[0].key);
    }
    setError('');
  }, [bank, visible]);

  const handleSave = async () => {
    if (!household) return;
    if (!name.trim()) { setError('Ponle un nombre al banco'); return; }
    setSaving(true);
    setError('');
    const input = { name: name.trim(), color };
    try {
      if (bank) {
        const res = await updateBank(bank.id, input);
        if (!res.ok) { setError(res.error ?? 'No se pudo guardar'); return; }
        onSaved?.({ ...bank, ...input });
      } else {
        const res = await addBank(household.id, user?.id, input);
        if (!res.ok || !res.bank) { setError(res.error ?? 'No se pudo guardar'); return; }
        onSaved?.(res.bank);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!bank) return;
    setDeleting(true);
    setError('');
    try {
      const res = await deleteBank(bank.id);
      if (!res.ok) { setError(res.error ?? 'No se pudo eliminar'); return; }
      onDeleted?.(bank.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleDelete = () => {
    const msg = 'Los servicios de este banco quedarán sin banco asignado. ¿Eliminarlo?';
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm(msg)) doDelete();
      return;
    }
    Alert.alert('Eliminar banco', msg, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: doDelete },
    ]);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.body}>
        <View style={s.headerRow}>
          <Text style={s.sheetTitle}>{isEdit ? 'Editar banco' : 'Nuevo banco'}</Text>
          {isEdit && (
            <PressScale onPress={handleDelete} disabled={deleting} style={s.deleteBtn}>
              {deleting
                ? <ActivityIndicator size="small" color="#c0392b" />
                : <Text style={s.deleteBtnText}>Eliminar</Text>}
            </PressScale>
          )}
        </View>

        <TextInput
          style={s.field}
          value={name}
          onChangeText={setName}
          placeholder="Nombre (ej. BBVA, Santander ··1234…)"
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
          {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.saveText}>{isEdit ? 'Guardar cambios' : 'Añadir banco'}</Text>}
        </PressScale>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  body: { padding: 22, paddingBottom: 40 },

  headerRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle:    { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  deleteBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1.5, borderColor: '#c0392b' },
  deleteBtnText: { color: '#c0392b', fontWeight: '600', fontSize: 13, fontFamily: FONT },

  label: { fontSize: 12, fontWeight: '600', color: C.ink2, fontFamily: FONT, letterSpacing: 0.2, marginBottom: 12, textTransform: 'uppercase' },

  field: { borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 18, paddingVertical: 16, fontSize: 17, color: C.ink, backgroundColor: C.card, fontFamily: FONT, marginBottom: 22 },

  swatchRow:   { flexDirection: 'row', gap: 12, marginBottom: 24 },
  swatch:      { width: 44, height: 44, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  swatchOn:    { borderColor: C.ink },
  swatchCheck: { color: C.white, fontSize: 18, fontWeight: '700' },

  error: { color: '#c0392b', fontSize: 13, fontFamily: FONT, marginBottom: 10, textAlign: 'center' },
  save:     { borderRadius: R.pill, paddingVertical: 17, alignItems: 'center', marginTop: 4 },
  saveDim:  { opacity: 0.5 },
  saveText: { color: C.white, fontWeight: '600', fontSize: 16, fontFamily: FONT },
});
