import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, R, FONT, MEMBER_COLORS } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { AchFlame, AchNest, AchStar, AchTrophy, AchGem } from '@/components/icons';

function getStartDate(period: 'semana' | 'mes' | 'ano'): string {
  const d = new Date();
  if (period === 'semana') d.setDate(d.getDate() - 7);
  else if (period === 'mes')  d.setDate(d.getDate() - 30);
  else                        d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

function computeStreak(dates: string[]): number {
  const days = new Set(dates.map((d) => new Date(d).toDateString()));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeMaxPerDay(dates: string[]): number {
  const counts: Record<string, number> = {};
  for (const d of dates) {
    const key = new Date(d).toDateString();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.values(counts).reduce((max, c) => Math.max(max, c), 0);
}

interface Member { id: string; name: string; ini: string; color: string; pts: number; tasks: number; }

export default function RepartoScreen() {
  const [period, setPeriod] = useState<'semana' | 'mes' | 'ano'>('semana');
  const { accent } = useNidoStore();
  const { household, user } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [streak, setStreak] = useState(0);
  const [allTimePts, setAllTimePts] = useState(0);
  const [allTimeTasks, setAllTimeTasks] = useState(0);
  const [maxPerDay, setMaxPerDay] = useState(0);

  const loadMembers = async () => {
    if (!household) return;

    const { data: memberRows } = await supabase
      .from('household_members')
      .select('user_id, profiles(full_name)')
      .eq('household_id', household.id);

    // Filter completed tasks by period using completed_at
    let taskQuery = supabase
      .from('tasks')
      .select('completed_by, points')
      .eq('household_id', household.id)
      .eq('is_done', true)
      .gte('completed_at', getStartDate(period));

    const { data: tasks } = await taskQuery;

    const built: Member[] = (memberRows ?? []).map((row: any, i: number) => {
      const name = row.profiles?.full_name ?? 'Miembro';
      const isMe = row.user_id === user?.id;
      // completed_by tracks who actually did the task
      const userTasks = (tasks ?? []).filter((t: any) => t.completed_by === row.user_id);
      return {
        id: row.user_id,
        name: isMe ? 'Tú' : name.split(' ')[0],
        ini: (isMe ? 'T' : name[0] ?? '?').toUpperCase(),
        color: MEMBER_COLORS[i % MEMBER_COLORS.length],
        pts: userTasks.reduce((s: number, t: any) => s + (t.points ?? 10), 0),
        tasks: userTasks.length,
      };
    });
    built.sort((a, b) => (a.id === user?.id ? -1 : 0) - (b.id === user?.id ? -1 : 0));
    setMembers(built);

    // All-time stats (independent of the period filter) for streak + achievements
    const { data: allTasks } = await supabase
      .from('tasks')
      .select('completed_at, points')
      .eq('household_id', household.id)
      .eq('is_done', true)
      .not('completed_at', 'is', null);
    const dates = (allTasks ?? []).map((t: any) => t.completed_at as string);
    setStreak(computeStreak(dates));
    setMaxPerDay(computeMaxPerDay(dates));
    setAllTimeTasks(dates.length);
    setAllTimePts((allTasks ?? []).reduce((s: number, t: any) => s + (t.points ?? 10), 0));
  };

  useEffect(() => { loadMembers(); }, [household, period]);

  const MEMBERS = members;
  const totalPts = MEMBERS.reduce((s, m) => s + m.pts, 0) || 1;

  const ACHIEVEMENTS = [
    { Icon: AchFlame,  title: 'Racha de 5', desc: '5 días seguidos', unlocked: streak >= 5 },
    { Icon: AchNest,   title: 'Nido lleno', desc: 'Día muy activo',  unlocked: maxPerDay >= 4 },
    { Icon: AchStar,   title: 'Centena',    desc: '100 puntos',      unlocked: allTimePts >= 100 },
    { Icon: AchTrophy, title: 'Maratón',    desc: '30 tareas',       unlocked: allTimeTasks >= 30 },
    { Icon: AchGem,    title: 'Leyenda',    desc: '500 puntos',      unlocked: allTimePts >= 500 },
  ];

  const periodLabel = period === 'semana' ? 'Esta semana' : period === 'mes' ? 'Este mes' : 'Este año';

  const balanceStatus = (() => {
    if (MEMBERS.length < 2) return { label: 'Solo/a', desc: 'Eres el único miembro activo.' };
    const pcts = MEMBERS.map(m => m.pts / totalPts);
    const diff = Math.max(...pcts) - Math.min(...pcts);
    if (diff < 0.15) return { label: 'Equilibrado',   desc: 'El reparto entre vosotros está bastante igualado.' };
    if (diff < 0.35) return { label: 'Algo desigual', desc: 'Hay algo de diferencia en el reparto de tareas.' };
    return              { label: 'Desigual',       desc: 'El reparto está bastante descompensado.' };
  })();

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await loadMembers(); setRefreshing(false); }}
              tintColor={accent.hex}
              colors={[accent.hex]}
            />
          }
        >

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
              <Text style={s.balanceStatus}>{balanceStatus.label}</Text>
              <Text style={s.balanceCap}>{balanceStatus.desc}</Text>
            </View>
            <View style={s.streakPill}>
              <Text style={s.streakText}>🔥 {streak}</Text>
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
        <Text style={s.sectionHeader}>{periodLabel}</Text>
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

  topbar: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14 },
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
