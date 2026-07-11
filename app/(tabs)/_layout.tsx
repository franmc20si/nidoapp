import { Tabs } from 'expo-router';
import {
  View, Text, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import { C, R, FONT } from '@/constants/theme';
import { useNidoStore } from '@/store/nidoStore';
import {
  IconHome as IcoHome, IconNest as IcoNest,
  IconChart as IcoChart, IconMenu as IcoMenu,
  IconCalendar as IcoCalendar,
} from '@/components/icons';
import { ToastBar } from '@/components/ToastBar';
import AddTaskSheet from '@/components/AddTaskSheet';

function IconHome({ active, accent }: { active: boolean; accent: string }) {
  return <IcoHome size={22} color={active ? accent : C.ink3} fill="transparent" strokeWidth={active ? 2.6 : 2} />;
}
function IconNest({ active, accent }: { active: boolean; accent: string }) {
  return <IcoNest size={22} color={active ? accent : C.ink3} fill="transparent" strokeWidth={active ? 2.6 : 2} />;
}
function IconChart({ active, accent }: { active: boolean; accent: string }) {
  return <IcoChart size={22} color={active ? accent : C.ink3} fill="transparent" strokeWidth={active ? 2.6 : 2} />;
}
function IconMenuTab({ active, accent }: { active: boolean; accent: string }) {
  return <IcoMenu size={22} color={active ? accent : C.ink3} fill="transparent" strokeWidth={active ? 2.6 : 2} />;
}
function IconCalendarTab({ active, accent }: { active: boolean; accent: string }) {
  return <IcoCalendar size={22} color={active ? accent : C.ink3} fill="transparent" strokeWidth={active ? 2.6 : 2} />;
}

// A partir de este ancho la navegación pasa de barra inferior (móvil) a
// sidebar lateral izquierda (escritorio).
const DESKTOP_BP = 900;

// Orden de las pestañas. En móvil 'Semana' va al centro (tab destacada);
// en el sidebar de escritorio lo dejamos arriba como inicio natural.
const MOBILE_TABS = [
  { name: 'menu',    label: 'Menú',    Icon: IconMenuTab },
  { name: 'nido',    label: 'Tareas',  Icon: IconNest },
  { name: 'index',   label: 'Semana',  Icon: IconHome },
  { name: 'servicios', label: 'Servicios', Icon: IconChart },
  { name: 'calendario', label: 'Calendario', Icon: IconCalendarTab },
];
const DESKTOP_TABS = [
  { name: 'index',   label: 'Semana',  Icon: IconHome },
  { name: 'nido',    label: 'Tareas',  Icon: IconNest },
  { name: 'calendario', label: 'Calendario', Icon: IconCalendarTab },
  { name: 'servicios', label: 'Servicios', Icon: IconChart },
  { name: 'menu',    label: 'Menú',    Icon: IconMenuTab },
];

function DesktopSidebar({ state, navigation, accent }: any) {
  return (
    <View style={tb.sidebar}>
      <View style={tb.brand}>
        <IcoNest size={24} color={accent.hex} fill="transparent" strokeWidth={2.4} />
        <Text style={[tb.brandText, { color: accent.hex }]}>Nido</Text>
      </View>

      {DESKTOP_TABS.map((tab) => {
        const routeIndex = state.routes.findIndex((r: any) => r.name === tab.name);
        const focused = state.index === routeIndex;
        const { Icon } = tab;
        return (
          <TouchableOpacity
            key={tab.name}
            style={[tb.navItem, focused && { backgroundColor: accent.hex + '18' }]}
            onPress={() => navigation.navigate(tab.name)}
            activeOpacity={0.7}
          >
            {Icon && <Icon active={focused} accent={accent.hex} />}
            <Text style={[tb.navLabel, { color: focused ? accent.hex : C.ink2, fontWeight: focused ? '600' : '500' }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CustomTabBar({ state, navigation }: any) {
  const { accent, fabOpen, closeFab } = useNidoStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;

  if (isDesktop) {
    return (
      <>
        <AddTaskSheet visible={fabOpen} onClose={closeFab} />
        <DesktopSidebar state={state} navigation={navigation} accent={accent} />
      </>
    );
  }

  return (
    <>
      <AddTaskSheet visible={fabOpen} onClose={closeFab} />
      <View style={tb.bar}>
        {MOBILE_TABS.map((tab) => {
          const routeIndex = state.routes.findIndex((r: any) => r.name === tab.name);
          const focused = state.index === routeIndex;
          const { Icon } = tab;

          const isCenter = tab.name === 'index';
          return (
            <TouchableOpacity
              key={tab.name}
              style={tb.tab}
              onPress={() => navigation.navigate(tab.name)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10 }}
            >
              {isCenter ? (
                <View style={[tb.centerPill, { backgroundColor: focused ? accent.hex + '22' : C.paperDeep }]}>
                  {Icon && <Icon active={focused} accent={accent.hex} />}
                  <Text style={[tb.tabLabel, { color: focused ? accent.hex : C.ink3 }]}>{tab.label}</Text>
                </View>
              ) : (
                <>
                  {Icon && <Icon active={focused} accent={accent.hex} />}
                  <Text style={[tb.tabLabel, { color: focused ? accent.hex : C.ink3 }]}>{tab.label}</Text>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;
  const tabBarPosition = isDesktop ? 'left' : 'bottom';
  // En escritorio la app usa el ancho completo. IMPORTANTE: las escenas
  // inactivas del tab navigator NO se ocultan en web (quedan apiladas detrás,
  // visibles). Para que ninguna asome de fondo al cambiar de tab, cada escena
  // debe ser opaca y ocupar todo el ancho: así la escena activa tapa por
  // completo a las de detrás. `sceneStyle` en screenOptions se aplica a TODAS
  // (incluidas las href:null como el perfil).
  const sceneStyle = { flex: 1, backgroundColor: C.paper };
  return (
    <>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false, tabBarPosition, sceneStyle }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="nido" />
        <Tabs.Screen name="servicios" />
        <Tabs.Screen name="reparto" options={{ href: null }} />
        <Tabs.Screen name="menu" />
        <Tabs.Screen name="calendario" />
        <Tabs.Screen name="household" options={{ href: null }} />
      </Tabs>
      <ToastBar />
    </>
  );
}

const tb = StyleSheet.create({
  // Tab bar — paper fading at top, no hard top border, active = brand
  bar: {
    flexDirection: 'row',
    backgroundColor: C.paper,
    paddingBottom: 24,
    paddingTop: 12,
    paddingHorizontal: 10,
    alignItems: 'flex-end',
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  // Resalte de la tab central: envuelve icono + palabra. El paddingVertical 6
  // simétrico + marginBottom -6 hace que el contenido quede alineado con las
  // demás tabs (que usan flex-end) mientras el fondo se extiende centrado.
  centerPill: { alignItems: 'center', gap: 4, paddingTop: 6, paddingBottom: 6, paddingHorizontal: 14, borderRadius: R.l, marginBottom: -6 },
  ico: { fontSize: 22, opacity: 0.35 },
  icoOn: { opacity: 1 },
  tabLabel: { fontSize: 10, fontFamily: FONT, fontWeight: '500' },

  // Sidebar (escritorio ≥ 900px)
  sidebar: {
    width: 232,
    backgroundColor: C.paper,
    borderRightWidth: 1,
    borderRightColor: C.line,
    paddingTop: 28,
    paddingHorizontal: 14,
    gap: 4,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginBottom: 24 },
  brandText: { fontSize: 22, fontWeight: '600', fontFamily: FONT, letterSpacing: -0.5 },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: R.l,
  },
  navLabel: { fontSize: 15, fontFamily: FONT },
});
