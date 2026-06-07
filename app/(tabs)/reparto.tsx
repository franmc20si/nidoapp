import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { AchFlame, AchNest, AchStar, AchTrophy, AchGem } from '@/components/icons';

const MEMBERS = [
  { name: 'Tú',   ini: 'T', color: C.brand, pts: 124, tasks: 8 },
  { name: 'Marc', ini: 'M', color: C.suelo, pts: 76,  tasks: 5 },
];

const ACHIEVEMENTS = [
  { Icon: AchFlame,  title: 'Racha de 5', desc: '5 días seguidos', unlocked: true },
  { Icon: AchNest,   title: 'Nido lleno', desc: '100% en un día',  unlocked: true },
  { Icon: AchStar,   title: 'Centena',    desc: '100 puntos',      unlocked: true },
  { Icon: AchTrophy, title: 'Maratón',    desc: '30 tareas',       unlocked: false },
  { Icon: AchGem,    title: 'Leyenda',    desc: '500 puntos',      unlocked: false },
];

export default function RepartoScreen() {
  const [period, setPeriod] = useState<'semana' | 'mes' | 'ano'>('semana');
  const { accent } = useNidoStore();

  const totalPts = MEMBERS.reduce((s, m) => s + m.pts, 0);

  return (
    <SafeAreaView style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Top bar */}
        <View style={s.topbar}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>QUIÉN HACE QUÉ</Text>
            <Text style={s.title}>Reparto</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} activeOpacity={0.7}>
            <Text style={s.iconBtnText}>↗</Text>
          </TouchableOpacity>
        </View>

        {/* Period selector */}
        <View style={s.periodRow}>
          {(['semana', 'mes', 'ano'] as const).map((p) => (
            <TouchableOpacity key={p} style={[s.periodPill, period === p && s.periodPillOn]} onPress={() => setPeriod(p)} activeOpacity={0.8}>
              <Text style={[s.periodText, period === p && s.periodTextOn]}>
                {p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : 'Año'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Balance card */}
        <View style={s.balanceCard}>
          <View style={s.balanceHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.balanceLabel}>Equilibrio del nido</Text>
              <Text style={s.balanceStatus}>Equilibrado</Text>
              <Text style={s.balanceCap}>El reparto entre vosotros está bastante igualado.</Text>
            </View>
            <View style={s.streakPill}>
              <Text style={s.streakText}>🔥 5</Text>
            </View>
          </View>
          <View style={s.stackBar}>
            {MEMBERS.map((m) => (
              <View key={m.name} style={[s.stackSeg, { flex: m.pts, backgroundColor: m.color }]} />
            ))}
          </View>
          <View style={s.legend}>
            {MEMBERS.map((m) => (
              <View key={m.name} style={s.legendRow}>
                <View style={[s.legendDot, { backgroundColor: m.color }]} />
                <Text style={s.legendName}>{m.name}</Text>
                <Text style={s.legendPct}>{Math.round((m.pts / totalPts) * 100)}%</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Member grid */}
        <View style={s.membersGrid}>
          {MEMBERS.map((m) => (
            <View key={m.name} style={s.memberCard}>
              <View style={[s.memberAvatar, { backgroundColor: m.color }]}>
                <Text style={s.memberAvatarText}>{m.ini}</Text>
              </View>
              <Text style={s.memberName}>{m.name}</Text>
              <Text style={s.memberMeta}>{m.pts} pts · {m.tasks} tareas</Text>
            </View>
          ))}
        </View>

        {/* Achievements */}
        <Text style={s.sectionHeader}>Logros</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.achRow}>
          {ACHIEVEMENTS.map((a) => (
            <View key={a.title} style={[s.achCard, !a.unlocked && s.achLocked]}>
              <View style={[s.achIconWrap, { backgroundColor: accent.wash }]}>
                <a.Icon size={26} color={accent.hex} fill={accent.wash} strokeWidth={2.4} />
              </View>
              <Text style={s.achTitle}>{a.title}</Text>
              <Text style={s.achDesc}>{a.desc}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Member breakdown */}
        <Text style={s.sectionHeader}>Este mes</Text>
        <View style={s.breakdownCard}>
          {MEMBERS.map((m, i) => (
            <View key={m.name} style={[s.breakRow, i > 0 && s.breakRowBorder]}>
              <View style={[s.breakAvatar, { backgroundColor: m.color }]}>
                <Text style={s.breakAvatarText}>{m.ini}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.breakName}>{m.name}</Text>
                <Text style={s.breakTasks}>{m.tasks} tareas</Text>
              </View>
              <Text style={[s.breakPts, { color: m.color }]}>{m.pts} pts</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },

  topbar: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 14 },
  eyebrow: { fontSize: 11, letterSpacing: 1.8, color: C.ink3, fontFamily: FONT, fontWeight: '600' },
  title: { fontSize: 30, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.6, marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 18, color: C.ink2 },

  periodRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16 },
  periodPill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1, borderColor: C.line },
  periodPillOn: { backgroundColor: C.ink, borderColor: C.ink },
  periodText: { fontSize: 14, fontWeight: '500', color: C.ink2, fontFamily: FONT },
  periodTextOn: { color: C.paper },

  balanceCard: { marginHorizontal: 20, borderRadius: R.xl, backgroundColor: C.brandWash, borderWidth: 1, borderColor: C.brand + '28', padding: 20, marginBottom: 16 },
  balanceHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  balanceLabel: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: C.ink2, fontFamily: FONT, fontWeight: '600' },
  balanceStatus: { fontSize: 26, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.6, marginTop: 4 },
  balanceCap: { fontSize: 13, color: C.ink2, fontFamily: FONT, marginTop: 4, maxWidth: 220 },
  streakPill: { backgroundColor: C.card, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: C.brand + '30' },
  streakText: { fontSize: 14, fontWeight: '700', color: C.brand, fontFamily: FONT },
  stackBar: { flexDirection: 'row', height: 14, borderRadius: 999, overflow: 'hidden' },
  stackSeg: { height: '100%' },
  legend: { marginTop: 16, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendName: { flex: 1, fontSize: 15, fontWeight: '500', color: C.ink, fontFamily: FONT },
  legendPct: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: FONT, minWidth: 44, textAlign: 'right' },

  membersGrid: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 8 },
  memberCard: { flex: 1, backgroundColor: C.card, borderRadius: R.l, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  memberAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  memberAvatarText: { color: C.white, fontSize: 20, fontWeight: '600', fontFamily: FONT },
  memberName: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: FONT },
  memberMeta: { fontSize: 12, color: C.ink3, fontFamily: FONT, marginTop: 3 },

  sectionHeader: { fontSize: 18, fontWeight: '500', color: C.ink, fontFamily: FONT, letterSpacing: -0.3, paddingHorizontal: 22, marginTop: 22, marginBottom: 12 },

  achRow: { paddingHorizontal: 20, gap: 10, flexDirection: 'row' },
  achCard: { width: 132, backgroundColor: C.card, borderRadius: R.l, padding: 14, borderWidth: 1, borderColor: C.line },
  achLocked: { opacity: 0.5 },
  achIconWrap: { width: 40, height: 40, borderRadius: R.s, backgroundColor: C.brandWash, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  achIcon: { fontSize: 20 },
  achTitle: { fontSize: 14, fontWeight: '600', color: C.ink, fontFamily: FONT },
  achDesc: { fontSize: 12, color: C.ink3, fontFamily: FONT, marginTop: 2 },

  breakdownCard: { marginHorizontal: 20, backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16 },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  breakRowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  breakAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  breakAvatarText: { color: C.white, fontSize: 16, fontWeight: '600', fontFamily: FONT },
  breakName: { fontSize: 15, fontWeight: '600', color: C.ink, fontFamily: FONT },
  breakTasks: { fontSize: 12, color: C.ink3, fontFamily: FONT, marginTop: 2 },
  breakPts: { fontSize: 16, fontWeight: '700', fontFamily: FONT },
});
