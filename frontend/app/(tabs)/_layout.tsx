import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../src/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const { colors, themeMode, t } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: themeMode === 'dark' ? 'rgba(10,10,10,0.92)' : 'rgba(245,245,245,0.92)',
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          height: Platform.OS === 'ios' ? 86 : 58 + insets.bottom,
          paddingBottom: Platform.OS === 'ios' ? 28 : insets.bottom + 6,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarBackground: () => (
          <BlurView intensity={40} tint={themeMode === 'dark' ? 'dark' : 'light'} style={{ flex: 1 }} />
        ),
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t.home,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t.transactions,
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t.nockerIA,
          tabBarIcon: ({ color }) => (
            <View
              style={{
                width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary,
                alignItems: 'center', justifyContent: 'center', marginTop: -18,
                shadowColor: colors.primary, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
                elevation: 8,
              }}
            >
              <Ionicons name="sparkles" size={22} color="#fff" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          title: t.cards,
          tabBarIcon: ({ color, size }) => <Ionicons name="card" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t.more,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="goals" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="fixed-expenses" options={{ href: null }} />
      <Tabs.Screen name="installments" options={{ href: null }} />
      <Tabs.Screen name="subscriptions" options={{ href: null }} />
      <Tabs.Screen name="projection" options={{ href: null }} />
      <Tabs.Screen name="categories" options={{ href: null }} />
    </Tabs>
  );
}