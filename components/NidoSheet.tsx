import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { NIDO_COLORS } from '@/constants/nidoColors';
import { useAuthStore } from '@/store/authStore';
import { useNidoStore } from '@/store/nidoStore';
import { supabase } from '@/lib/supabase';
import BottomSheet from '@/components/BottomSheet';
import PressScale from '@/components/PressScale';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NidoSheet({ visible, onClose }: Props) {
  const { household, setHousehold } = useAuthStore();
  const { accent, accentKey, setAccent } = useNidoStore();

  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync name when household loads or sheet opens
  useEffect(() => {
    if (visible && household?.name) setEditName(household.name);
  }, [visible, household?.name]);

  const saveName = async () => {
    if (!editName.trim() || !household) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('households')
      .update({ name: editName.trim() })
      .eq('id', household.id)
      .select()
      .single();
    setSaving(false);
    if (!error && data) setHousehold(data);
  };

  const handleColorChange = (key: string) => {
    if (!household) return;
    setAccent(household.id, key);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} sheetStyle={{ maxHeight: '90%' }}>
        <ScrollView
          style={sh.scroll}
          contentContainerStyle={sh.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={sh.headerRow}>
            <Text style={sh.title}>Tu nido</Text>
            <TouchableOpacity style={sh.closeBtn} onPress={onClose}>
              <Text style={sh.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Current nido name */}
          <Text style={sh.label}>Nombre</Text>
          <View style={sh.nameRow}>
            <TextInput
              style={sh.nameInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Nombre del nido"
              placeholderTextColor={C.ink3}
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
            <PressScale
              style={[sh.saveBtn, { backgroundColor: accent.hex }, (!editName.trim() || saving) && sh.saveBtnDim]}
              onPress={saveName}
              disabled={!editName.trim() || saving}
            >
              {saving
                ? <ActivityIndicator color={C.white} size="small" />
                : <Text style={sh.saveBtnText}>Guardar</Text>}
            </PressScale>
          </View>

          {/* Color picker */}
          <Text style={sh.label}>Color del nido</Text>
          <View style={sh.colorRow}>
            {NIDO_COLORS.map((nc) => {
              const on = accentKey === nc.key;
              return (
                <PressScale
                  key={nc.key}
                  scaleTo={0.9}
                  style={[sh.swatch, { backgroundColor: nc.hex }, on && sh.swatchOn]}
                  onPress={() => handleColorChange(nc.key)}
                >
                  {on && <Text style={sh.swatchCheck}>✓</Text>}
                </PressScale>
              );
            })}
          </View>
          <View style={sh.colorNames}>
            {NIDO_COLORS.map((nc) => (
              <Text
                key={nc.key}
                style={[sh.colorLabel, accentKey === nc.key && { color: nc.hex, fontWeight: '700' }]}
              >
                {nc.label}
              </Text>
            ))}
          </View>

          {/* Preview */}
          <View style={[sh.preview, { backgroundColor: accent.wash, borderColor: accent.hex + '30' }]}>
            <Text style={sh.previewNest}>🪺</Text>
            <View>
              <Text style={[sh.previewName, { color: accent.hex }]}>{household?.name ?? 'Nuestro nido'}</Text>
              <Text style={sh.previewSub}>Color activo: {NIDO_COLORS.find(c => c.key === accentKey)?.label}</Text>
            </View>
          </View>

          {/* Invite code */}
          {household?.invite_code && (
            <View style={sh.codeCard}>
              <Text style={sh.codeLabel}>Código de invitación</Text>
              <Text style={[sh.code, { color: accent.hex }]}>{household.invite_code}</Text>
              <Text style={sh.codeSub}>Comparte este código para invitar a tu pareja</Text>
            </View>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>
    </BottomSheet>
  );
}

const sh = StyleSheet.create({
  scroll: { maxHeight: 600 },
  body:  { padding: 22, paddingTop: 8, paddingBottom: 0 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  title: { fontSize: 22, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: C.ink2, fontSize: 14 },

  label: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 10, marginTop: 18 },

  nameRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  nameInput: { flex: 1, borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: C.ink, backgroundColor: C.card, fontFamily: FONT },
  saveBtn: { borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 13 },
  saveBtnDim: { opacity: 0.4 },
  saveBtnText: { color: C.white, fontWeight: '600', fontFamily: FONT, fontSize: 14 },

  colorRow: { flexDirection: 'row', gap: 12 },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 0, elevation: 0,
              borderWidth: 3, borderColor: C.ink },
  swatchCheck: { color: C.white, fontWeight: '700', fontSize: 16 },
  colorNames: { flexDirection: 'row', gap: 12, marginTop: 6, marginBottom: 4 },
  colorLabel: { width: 40, textAlign: 'center', fontSize: 10, color: C.ink3, fontFamily: FONT },

  preview: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: R.l, borderWidth: 1, padding: 16, marginTop: 18 },
  previewNest: { fontSize: 36 },
  previewName: { fontSize: 17, fontWeight: '600', fontFamily: FONT, letterSpacing: -0.3 },
  previewSub: { fontSize: 12, color: C.ink3, fontFamily: FONT, marginTop: 2 },

  codeCard: { backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, padding: 16, marginTop: 16 },
  codeLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 6 },
  code: { fontFamily: 'monospace', fontWeight: '700', fontSize: 22, letterSpacing: 6 },
  codeSub: { fontSize: 12, color: C.ink3, fontFamily: FONT, marginTop: 4 },
});
