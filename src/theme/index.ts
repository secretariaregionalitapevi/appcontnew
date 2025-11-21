export { colors } from './colors';
export { spacing } from './spacing';

// Z-index constants para campos de formulário (web)
// Garante que dropdowns apareçam acima de outros elementos
export const Z_INDEX = {
  DROPDOWN_FIELD_CONTAINER: 1000000,
  DROPDOWN_FIELD_INPUT: 1000001,
  DROPDOWN_FIELD_DROPDOWN: 999999999,
};

export const theme = {
  colors: {
    primary: '#1ab394', // Verde principal do design
    primaryDark: '#18a689',
    secondary: '#1ab394',
    secondaryDark: '#18a689',
    background: '#f3f3f4',
    surface: '#FFFFFF',
    text: '#212121',
    textSecondary: '#7b8a97', // Muted do design
    error: '#ef4444',
    success: '#10b981',
    warning: '#f59e0b',
    border: '#e7eaec',
    disabled: '#BDBDBD',
    icon: '#8a95a6',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
  },
  zIndex: Z_INDEX,
};
