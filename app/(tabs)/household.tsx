import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Image, ActivityIndicator, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { C, R, FONT } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useNidoStore } from '@/store/nidoStore';
import { supabase } from '@/lib/supabase';

function computeStreak(completedDates: (string | null)[]): number {
  const daySet = new Set(
    completedDates.filter(Boolean).map(d => d!.slice(0, 10))
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (daySet.has(key)) streak++;
    else break;
  }
  return streak;
}

export default function ProfileScreen() {
  const { profile, household, user, setProfile, signOut } = useAuthStore();
  const { accent } = useNidoStore();

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(profile?.full_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [nameError, setNameError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [stats, setStats] = useState({ tareas: '—', racha: '—', aportacion: '—' });

  useEffect(() => { setNameVal(profile?.full_name ?? ''); }, [profile]);

  useEffect(() => {
    if (!user || !household) return;
    (async () => {
      const [{ data: myTasks }, { count: totalDone }] = await Promise.all([
        supabase
          .from('tasks')
          .select('completed_at')
          .eq('household_id', household.id)
          .eq('completed_by', user.id)
          .eq('is_done', true),
        supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('household_id', household.id)
          .eq('is_done', true),
      ]);
      const myCount = myTasks?.length ?? 0;
      const streak = computeStreak((myTasks ?? []).map(t => t.completed_at));
      const aportacion = (totalDone ?? 0) > 0
        ? Math.round((myCount / (totalDone ?? 1)) * 100)
        : 0;
      setStats({
        tareas:     String(myCount),
        racha:      String(streak),
        aportacion: `${aportacion}%`,
      });
    })();
  }, [user?.id, household?.id]);

  const initial = profile?.full_name?.[0]?.toUpperCase() ?? '?';
  const avatarUrl = profile?.avatar_url;

  // ── save name ─────────────────────────────────────────────────────────────
  const saveName = async () => {
    if (!nameVal.trim() || !user) return;
    setNameError('');
    setSavingName(true);
    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name: nameVal.trim() })
      .eq('id', user.id)
      .select()
      .single();
    setSavingName(false);
    if (!error && data) { setProfile(data); setEditingName(false); }
    else setNameError(error?.message ?? 'No se pudo guardar');
  };

  // ── upload photo ──────────────────────────────────────────────────────────
  const pickPhoto = async () => {
    setPhotoError('');
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setPhotoError('Necesitamos acceso a tu galería para cambiar la foto.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setUploadingPhoto(true);
    try {
      const mime = asset.mimeType ?? 'image/jpeg';
      const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      const path = `${user!.id}/avatar.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: upError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: mime });

      if (upError) throw upError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl + '?t=' + Date.now(); // cache-bust

      const { data: profData, error: profError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user!.id)
        .select()
        .single();

      if (!profError && profData) setProfile(profData);
    } catch (e: any) {
      setPhotoError(e.message ?? 'No se pudo subir la foto');
    }
    setUploadingPhoto(false);
  };

  // ── invite code actions ───────────────────────────────────────────────────
  const copyCode = async () => {
    const code = household?.invite_code;
    if (!code) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } else {
      shareCode();
    }
  };

  const shareCode = () => {
    const code = household?.invite_code;
    if (!code) return;
    Share.share({
      message: `Únete a mi nido en la app Nido con el código: ${code}`,
      title: 'Código de invitación Nido',
    });
  };

  // ── reset onboarding ──────────────────────────────────────────────────────
  const resetOnboarding = () => setConfirmReset(true);

  const confirmResetAction = async () => {
    setConfirmReset(false);
    // Remove from household_members in DB so the user can join/create another
    if (user && household) {
      await supabase.from('household_members')
        .delete()
        .eq('household_id', household.id)
        .eq('user_id', user.id);
    }
    useAuthStore.setState({ household: null });
    router.replace('/(auth)/onboarding');
  };

  // ── sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = () => setConfirmSignOut(true);

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Header */}
        <View style={s.topbar}>
          <Text style={s.eyebrow}>PERFIL</Text>
        </View>

        {/* Avatar */}
        <View style={s.hero}>
          <TouchableOpacity style={s.avatarWrap} onPress={pickPhoto} activeOpacity={0.8}>
            {uploadingPhoto ? (
              <View style={[s.avatar, { backgroundColor: accent.hex }]}>
                <ActivityIndicator color={C.white} />
              </View>
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, { backgroundColor: accent.hex }]}>
                <Text style={s.avatarText}>{initial}</Text>
              </View>
            )}
            <View style={[s.cameraBtn, { backgroundColor: accent.hex }]}>
              <Text style={s.cameraIcon}>📷</Text>
            </View>
          </TouchableOpacity>

          {/* Name */}
          {editingName ? (
            <View style={{ alignItems: 'center', width: '100%' }}>
              <View style={s.nameEditRow}>
                <TextInput
                  style={s.nameInput}
                  value={nameVal}
                  onChangeText={setNameVal}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                />
                <TouchableOpacity
                  style={[s.nameBtn, { backgroundColor: accent.hex }, savingName && { opacity: 0.5 }]}
                  onPress={saveName}
                  disabled={savingName}
                >
                  {savingName
                    ? <ActivityIndicator color={C.white} size="small" />
                    : <Text style={s.nameBtnText}>✓</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.nameCancelBtn} onPress={() => { setEditingName(false); setNameError(''); }}>
                  <Text style={s.nameCancelText}>✕</Text>
                </TouchableOpacity>
              </View>
              {!!nameError && <Text style={s.inlineError}>{nameError}</Text>}
            </View>
          ) : (
            <TouchableOpacity style={s.nameRow} onPress={() => setEditingName(true)} activeOpacity={0.7}>
              <Text style={s.name}>{profile?.full_name ?? '—'}</Text>
              <Text style={s.editPencil}>✏︎</Text>
            </TouchableOpacity>
          )}
          {!!photoError && <Text style={[s.inlineError, { marginTop: 6 }]}>{photoError}</Text>}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { v: stats.tareas,     k: 'tareas' },
            { v: stats.racha,      k: 'días racha' },
            { v: stats.aportacion, k: 'aportación' },
          ].map((st) => (
            <View key={st.k} style={s.stat}>
              <Text style={[s.statVal, { color: accent.hex }]}>{st.v}</Text>
              <Text style={s.statKey}>{st.k}</Text>
            </View>
          ))}
        </View>

        {/* Household card */}
        {household && (
          <View style={[s.card, { borderColor: accent.hex + '30' }]}>
            <Text style={s.cardLabel}>MI NIDO ACTIVO</Text>
            <View style={s.cardRow}>
              <Text style={s.cardTitle}>{household.name}</Text>
              <View style={[s.colorDot, { backgroundColor: accent.hex }]} />
            </View>
            {household.invite_code && (
              <>
                <View style={s.codeRow}>
                  <Text style={s.codePre}>Código de invitación</Text>
                  <Text style={[s.code, { color: accent.hex }]}>{household.invite_code}</Text>
                </View>
                <View style={s.codeActions}>
                  <TouchableOpacity
                    style={[s.codeBtn, { backgroundColor: codeCopied ? accent.hex : accent.hex + '15', borderColor: accent.hex + '40' }]}
                    onPress={copyCode}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.codeBtnText, { color: codeCopied ? C.white : accent.hex }]}>
                      {codeCopied ? '✓ Copiado' : '📋 Copiar'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.codeBtn, { backgroundColor: accent.hex + '15', borderColor: accent.hex + '40' }]}
                    onPress={shareCode}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.codeBtnText, { color: accent.hex }]}>↗ Compartir</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* Settings rows */}
        <View style={s.settingsCard}>
          <TouchableOpacity style={s.settingsRow} onPress={() => router.push('/(tabs)/household')} activeOpacity={0.7}>
            <Text style={s.settingsIcon}>⚙️</Text>
            <Text style={s.settingsLabel}>Configurar nido</Text>
            <Text style={s.settingsCaret}>›</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.settingsRow} onPress={resetOnboarding} activeOpacity={0.7}>
            <Text style={s.settingsIcon}>🔄</Text>
            <Text style={s.settingsLabel}>Resetear onboarding</Text>
            <Text style={s.settingsCaret}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={s.signOutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        {/* Inline confirm: reset onboarding */}
        {confirmReset && (
          <View style={s.confirmBox}>
            <Text style={s.confirmTitle}>¿Salir del nido?</Text>
            <Text style={s.confirmSub}>Saldrás del nido actual y volverás al inicio.</Text>
            <View style={s.confirmRow}>
              <TouchableOpacity style={s.confirmCancel} onPress={() => setConfirmReset(false)}>
                <Text style={s.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmDanger} onPress={confirmResetAction}>
                <Text style={s.confirmDangerText}>Salir del nido</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Inline confirm: sign out */}
        {confirmSignOut && (
          <View style={s.confirmBox}>
            <Text style={s.confirmTitle}>Cerrar sesión</Text>
            <Text style={s.confirmSub}>¿Seguro que quieres salir?</Text>
            <View style={s.confirmRow}>
              <TouchableOpacity style={s.confirmCancel} onPress={() => setConfirmSignOut(false)}>
                <Text style={s.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmDanger} onPress={signOut}>
                <Text style={s.confirmDangerText}>Cerrar sesión</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  topbar: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 4 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '600' },

  hero: { alignItems: 'center', paddingTop: 12, paddingBottom: 24 },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.card },
  avatarText: { color: C.white, fontSize: 30, fontWeight: '600', fontFamily: FONT },
  cameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.paper },
  cameraIcon: { fontSize: 13 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 22, fontWeight: '600', color: C.ink, fontFamily: FONT, letterSpacing: -0.4 },
  editPencil: { fontSize: 15, color: C.ink3 },

  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22 },
  nameInput: { flex: 1, borderWidth: 1.5, borderColor: C.line, borderRadius: R.l, paddingHorizontal: 14, paddingVertical: 10, fontSize: 17, color: C.ink, fontFamily: FONT, backgroundColor: C.card },
  nameBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  nameBtnText: { color: C.white, fontWeight: '700', fontSize: 16 },
  nameCancelBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  nameCancelText: { color: C.ink3, fontSize: 14 },

  statsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: C.card, borderRadius: R.l, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  statVal: { fontSize: 26, fontWeight: '600', fontFamily: FONT, letterSpacing: -0.5 },
  statKey: { fontSize: 11, color: C.ink3, marginTop: 2, fontFamily: FONT },

  card: { marginHorizontal: 20, backgroundColor: C.card, borderRadius: R.l, padding: 18, borderWidth: 1.5, marginBottom: 14 },
  cardLabel: { fontSize: 10, letterSpacing: 1.5, color: C.ink3, fontFamily: FONT, fontWeight: '600', marginBottom: 6 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 20, fontWeight: '600', color: C.ink, fontFamily: FONT },
  colorDot: { width: 16, height: 16, borderRadius: 8 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  codePre: { fontSize: 13, color: C.ink3, fontFamily: FONT },
  code: { fontFamily: 'monospace', fontWeight: '700', fontSize: 15, letterSpacing: 3 },
  codeActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  codeBtn: { flex: 1, borderRadius: R.l, borderWidth: 1, paddingVertical: 9, alignItems: 'center' },
  codeBtnText: { fontSize: 13, fontWeight: '600', fontFamily: FONT },

  settingsCard: { marginHorizontal: 20, backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, paddingHorizontal: 18, marginBottom: 14 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  settingsIcon: { fontSize: 18 },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: C.ink, fontFamily: FONT },
  settingsCaret: { fontSize: 20, color: C.ink3 },
  divider: { height: 1, backgroundColor: C.line },

  signOut: { marginHorizontal: 20, backgroundColor: '#FEE8E1', borderRadius: R.l, padding: 16, alignItems: 'center' },
  signOutText: { color: '#C2502F', fontWeight: '600', fontFamily: FONT, fontSize: 15 },

  inlineError: { fontSize: 13, color: '#C2502F', fontFamily: FONT, marginTop: 4, textAlign: 'center' },

  confirmBox: { marginHorizontal: 20, marginTop: 12, backgroundColor: C.card, borderRadius: R.l, borderWidth: 1.5, borderColor: '#C2502F' + '40', padding: 18 },
  confirmTitle: { fontSize: 16, fontWeight: '600', color: C.ink, fontFamily: FONT },
  confirmSub: { fontSize: 13, color: C.ink2, fontFamily: FONT, marginTop: 4, marginBottom: 14 },
  confirmRow: { flexDirection: 'row', gap: 10 },
  confirmCancel: { flex: 1, borderRadius: R.l, borderWidth: 1, borderColor: C.line, padding: 11, alignItems: 'center' },
  confirmCancelText: { fontSize: 14, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  confirmDanger: { flex: 1, borderRadius: R.l, backgroundColor: '#C2502F', padding: 11, alignItems: 'center' },
  confirmDangerText: { fontSize: 14, fontWeight: '600', color: C.white, fontFamily: FONT },
});
