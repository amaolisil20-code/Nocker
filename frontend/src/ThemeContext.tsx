import React, { createContext, useContext, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
export type Language = 'pt' | 'en' | 'es';
export type ThemeMode = 'dark' | 'light';

export interface Colors {
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryGlow: string;
  expense: string;
  expenseSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  info: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderStrong: string;
  white: string;
}

// ─── Color palettes ───────────────────────────────────────────────────────────
const darkColors: Colors = {
  bg: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1A1A1A',
  surfaceMuted: '#1F1F1F',
  primary: '#16A34A',
  primaryDark: '#15803D',
  primaryLight: '#86EFAC',
  primaryGlow: 'rgba(22,163,74,0.25)',
  expense: '#EF4444',
  expenseSoft: 'rgba(239,68,68,0.12)',
  success: '#16A34A',
  successSoft: 'rgba(22,163,74,0.12)',
  warning: '#F59E0B',
  info: '#3B82F6',
  text: '#FFFFFF',
  textSecondary: '#A3A3A3',
  textTertiary: '#737373',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  white: '#FFFFFF',
};

const lightColors: Colors = {
  bg: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceElevated: '#FAFAFA',
  surfaceMuted: '#F0F0F0',
  primary: '#16A34A',
  primaryDark: '#15803D',
  primaryLight: '#86EFAC',
  primaryGlow: 'rgba(22,163,74,0.15)',
  expense: '#EF4444',
  expenseSoft: 'rgba(239,68,68,0.10)',
  success: '#16A34A',
  successSoft: 'rgba(22,163,74,0.10)',
  warning: '#F59E0B',
  info: '#3B82F6',
  text: '#111111',
  textSecondary: '#555555',
  textTertiary: '#888888',
  border: 'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.14)',
  white: '#FFFFFF',
};

// ─── Translations ─────────────────────────────────────────────────────────────
const translations = {
  pt: {
    // Tabs
    home: 'Início',
    transactions: 'Movimentos',
    nockerIA: 'Nocker IA',
    cards: 'Cartões',
    more: 'Mais',
    
    // Dashboard
    welcome: 'Olá',
    totalBalance: 'Saldo total',
    entries: 'Entradas',
    exits: 'Saídas',
    financialEvolution: 'Evolução financeira',
    expensesByCategory: 'Gastos por categoria',
    lastTransactions: 'Últimas transações',
    noTransactions: 'Nenhuma transação encontrada',
    iaPrompt: 'Como posso ajudar com suas finanças hoje?',
    
    // Settings
    settings: 'Configurações',
    account: 'CONTA',
    profile: 'Perfil',
    profileHint: 'Editar informações pessoais',
    security: 'Segurança',
    securityHint: 'Senha e autenticação',
    notifications: 'Notificações',
    notificationsHint: 'Alertas e lembretes',
    preferences: 'PREFERÊNCIAS',
    appearance: 'Aparência',
    appearanceDark: 'Modo escuro ativado',
    appearanceLight: 'Modo claro ativado',
    language: 'Idioma',
    selectLanguage: 'Selecionar idioma',
    portuguese: 'Português',
    english: 'Inglês',
    spanish: 'Espanhol',
    export: 'Exportar dados',
    exportHint: 'Baixar seus dados em CSV',
    banking: 'Integração bancária',
    bankingHint: 'Conectar conta bancária',
    help: 'Ajuda & Suporte',
    helpHint: 'FAQ e contato',
    logout: 'Sair',
    logoutConfirm: 'Tem certeza que deseja sair?',
    cancel: 'Cancelar',
    comingSoon: 'Em breve',
    version: 'Versão 1.0.0',
    
    // Common
    save: 'Salvar',
    delete: 'Excluir',
    edit: 'Editar',
    add: 'Adicionar',
    loading: 'Carregando...',
    error: 'Ocorreu um erro',
    back: 'Voltar',
    brand: 'Nocker',
    slogan: 'Sua inteligência financeira',
  },
  en: {
    // Tabs
    home: 'Home',
    transactions: 'Transactions',
    nockerIA: 'Nocker AI',
    cards: 'Cards',
    more: 'More',
    
    // Dashboard
    welcome: 'Hello',
    totalBalance: 'Total balance',
    entries: 'Income',
    exits: 'Expenses',
    financialEvolution: 'Financial evolution',
    expensesByCategory: 'Expenses by category',
    lastTransactions: 'Recent transactions',
    noTransactions: 'No transactions found',
    iaPrompt: 'How can I help with your finances today?',
    
    // Settings
    settings: 'Settings',
    account: 'ACCOUNT',
    profile: 'Profile',
    profileHint: 'Edit personal information',
    security: 'Security',
    securityHint: 'Password and authentication',
    notifications: 'Notifications',
    notificationsHint: 'Alerts and reminders',
    preferences: 'PREFERENCES',
    appearance: 'Appearance',
    appearanceDark: 'Dark mode enabled',
    appearanceLight: 'Light mode enabled',
    language: 'Language',
    selectLanguage: 'Select language',
    portuguese: 'Portuguese',
    english: 'English',
    spanish: 'Spanish',
    export: 'Export data',
    exportHint: 'Download your data as CSV',
    banking: 'Banking integration',
    bankingHint: 'Connect bank account',
    help: 'Help & Support',
    helpHint: 'FAQ and contact',
    logout: 'Logout',
    logoutConfirm: 'Are you sure you want to logout?',
    cancel: 'Cancel',
    comingSoon: 'Coming soon',
    version: 'Version 1.0.0',
    
    // Common
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    loading: 'Loading...',
    error: 'An error occurred',
    back: 'Back',
    brand: 'Nocker',
    slogan: 'Your financial intelligence',
  },
  es: {
    // Tabs
    home: 'Inicio',
    transactions: 'Movimientos',
    nockerIA: 'Nocker IA',
    cards: 'Tarjetas',
    more: 'Más',
    
    // Dashboard
    welcome: 'Hola',
    totalBalance: 'Saldo total',
    entries: 'Ingresos',
    exits: 'Gastos',
    financialEvolution: 'Evolución financiera',
    expensesByCategory: 'Gastos por categoría',
    lastTransactions: 'Últimas transacciones',
    noTransactions: 'No se encontraron transacciones',
    iaPrompt: '¿Cómo posso ajudar com suas finanças hoje?',
    
    // Settings
    settings: 'Configuración',
    account: 'CUENTA',
    profile: 'Perfil',
    profileHint: 'Editar información personal',
    security: 'Seguridad',
    securityHint: 'Contraseña y autenticación',
    notifications: 'Notificaciones',
    notificationsHint: 'Alertas y recordatorios',
    preferences: 'PREFERENCIAS',
    appearance: 'Apariencia',
    appearanceDark: 'Modo oscuro activado',
    appearanceLight: 'Modo claro activado',
    language: 'Idioma',
    selectLanguage: 'Seleccionar idioma',
    portuguese: 'Portugués',
    english: 'Inglés',
    spanish: 'Español',
    export: 'Exportar datos',
    exportHint: 'Descargar datos en CSV',
    banking: 'Integración bancaria',
    bankingHint: 'Conectar cuenta bancaria',
    help: 'Ayuda & Soporte',
    helpHint: 'FAQ y contacto',
    logout: 'Cerrar sesión',
    logoutConfirm: '¿Estás seguro de que deseas cerrar sesión?',
    cancel: 'Cancelar',
    comingSoon: 'Próximamente',
    version: 'Versión 1.0.0',
    
    // Common
    save: 'Guardar',
    delete: 'Eliminar',
    edit: 'Editar',
    add: 'Añadir',
    loading: 'Cargando...',
    error: 'Ocurrió un error',
    back: 'Volver',
    brand: 'Nocker',
    slogan: 'Su inteligencia financiera',
  },
};

// ─── Context ──────────────────────────────────────────────────────────────────
interface ThemeContextValue {
  themeMode: ThemeMode;
  language: Language;
  colors: Colors;
  t: typeof translations['pt'];
  toggleTheme: () => void;
  setLanguage: (lang: Language) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [language, setLanguageState] = useState<Language>('pt');

  const colors = themeMode === 'dark' ? darkColors : lightColors;
  const t = translations[language];

  const toggleTheme = useCallback(() => {
    setThemeMode(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  return (
    <ThemeContext.Provider value={{ themeMode, language, colors, t, toggleTheme, setLanguage }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
