import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { Subscription } from '@/types';
import { getCycle, monthlyEquivalent } from '@/constants/services';
import PressScale from '@/components/PressScale';
import { ServiceIcon, IconChevronRight, IconEdit } from '@/components/icons';

// Lista de bancos o de casas con sus servicios. Tocar la tarjeta despliega los
// gastos de ese banco/casa; el lápiz abre la edición del propio banco/casa.
// La comparten app/bancos.tsx y app/casas.tsx.

export interface ServiceGroup {
  id: string | null;      // null = "Sin banco" / "Sin casa"
  name: string;
  color: string;          // hex del punto y del importe
  onEdit?: () => void;    // sin onEdit no hay lápiz (p.ej. el grupo "Sin …")
}

interface Props {
  groups: ServiceGroup[];
  subs: Subscription[];
  groupKey: 'bank_id' | 'house_id';
  onEditService: (sub: Subscription) => void;
}

const money = (n: number) => n.toFixed(2).replace('.', ',');

export default function ServiceGroupList({ groups, subs, groupKey, onEditService }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen(prev => {
    const next = new Set(prev);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });

  return (
    <View style={s.list}>
      {groups.map((g) => {
        const k = g.id ?? '__none__';
        const items = subs
          .filter(sub => (sub[groupKey] ?? null) === g.id)
          .sort((a, b) => monthlyEquivalent(b.amount, b.cycle) - monthlyEquivalent(a.amount, a.cycle));
        const monthly = items.reduce((acc, sub) => acc + monthlyEquivalent(sub.amount, sub.cycle), 0);
        const isOpen = open.has(k) && items.length > 0;
        const unassigned = g.id === null;

        return (
          <View key={k} style={[s.card, unassigned && s.cardUnassigned]}>
            <View style={s.head}>
              <PressScale
                style={s.headMain}
                onPress={() => items.length > 0 && toggle(k)}
                scaleTo={0.99}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${isOpen ? 'Ocultar' : 'Ver'} gastos de ${g.name}`}
              >
                <View style={[s.dot, { backgroundColor: g.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{g.name}</Text>
                  <View style={s.countRow}>
                    <Text style={s.count}>{items.length} {items.length === 1 ? 'servicio' : 'servicios'}</Text>
                    {items.length > 0 && (
                      <View style={{ transform: [{ rotate: isOpen ? '-90deg' : '90deg' }] }}>
                        <IconChevronRight size={14} color={C.ink3} />
                      </View>
                    )}
                  </View>
                </View>
                <View style={s.right}>
                  <Text style={[s.amount, { color: unassigned ? C.ink2 : g.color }]}>{money(monthly)} €</Text>
                  <Text style={s.cycle}>/mes</Text>
                </View>
              </PressScale>
              {g.onEdit && (
                <PressScale
                  style={s.editBtn}
                  onPress={g.onEdit}
                  scaleTo={0.9}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${g.name}`}
                >
                  <IconEdit size={15} color={C.ink2} strokeWidth={2} />
                </PressScale>
              )}
            </View>

            {isOpen && (
              <View style={s.items}>
                {items.map((sub, i) => (
                  <PressScale
                    key={sub.id}
                    style={[s.item, i === items.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => onEditService(sub)}
                    scaleTo={0.99}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar ${sub.name}`}
                  >
                    <View style={s.itemIcon}><ServiceIcon catKey={sub.category} size={17} color={C.ink2} /></View>
                    <Text style={s.itemName} numberOfLines={1}>{sub.name}</Text>
                    <Text style={s.itemAmount}>{money(sub.amount)} €</Text>
                    <Text style={s.itemCycle}>{getCycle(sub.cycle).short}</Text>
                  </PressScale>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  list: { marginHorizontal: 20, gap: 10 },
  card: { backgroundColor: C.card, borderRadius: R.l, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  cardUnassigned: { backgroundColor: C.paperSoft, borderStyle: 'dashed' },

  head: { flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  headMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16, paddingRight: 10, paddingVertical: 16 },
  dot:   { width: 14, height: 14, borderRadius: 7 },
  name:  { fontSize: 16, fontWeight: '600', color: C.ink, fontFamily: FONT },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  count: { fontSize: 12.5, color: C.ink3, fontFamily: FONT },
  right: { alignItems: 'flex-end' },
  amount:{ fontSize: 18, fontWeight: '700', fontFamily: FONT, letterSpacing: -0.4 },
  cycle: { fontSize: 11, color: C.ink3, fontFamily: FONT, marginTop: 1 },
  editBtn: {
    width: 34, height: 34, borderRadius: R.pill, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
  },

  items: { borderTopWidth: 1, borderTopColor: C.line },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  itemIcon: { width: 28, alignItems: 'center' },
  itemName: { flex: 1, fontSize: 14.5, color: C.ink, fontFamily: FONT },
  itemAmount: { fontSize: 14.5, fontWeight: '600', color: C.ink, fontFamily: FONT },
  itemCycle: { fontSize: 11, color: C.ink3, fontFamily: FONT, minWidth: 40 },
});
