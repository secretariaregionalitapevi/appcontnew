import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  Platform,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { theme } from '../theme';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: string;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
  icon = 'paper-plane',
}) => {
  return (
    <TouchableOpacity
      style={[styles.button, (disabled || loading) && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={Platform.OS === 'web' ? 0.85 : 0.6} // Feedback mais visível no mobile (reduzido de 0.7 para 0.6)
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} // Área de toque expandida
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.surface} size="small" />
      ) : (
        <View style={styles.buttonContent}>
          <FontAwesome
            name={icon as any}
            size={12}
            color={theme.colors.surface}
            style={styles.icon}
          />
          <Text style={styles.buttonText}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12, // Aumentado de 8 para melhor área de toque
    paddingHorizontal: theme.spacing.xl, // Aumentado de lg para xl
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48, // Padrão mínimo 48px (Apple/Google recomendam 44px mínimo)
    minWidth: 120, // Largura mínima para melhor área de toque
    alignSelf: 'center',
    ...(Platform.OS === 'web'
      ? {
          background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primaryDark} 100%)`,
          boxShadow: '0 2px 8px rgba(3, 61, 96, 0.3)',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
          minHeight: 44, // Web pode ser um pouco menor
          paddingVertical: 10,
        }
      : {
          shadowColor: theme.colors.primary,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.4,
          shadowRadius: 6,
          elevation: 4, // Elevação maior no mobile para melhor feedback visual
          minHeight: 52, // Aumentado para 52px no mobile (melhor que 48px)
          paddingVertical: 14, // Mais padding vertical no mobile
        }),
  },
  buttonDisabled: {
    backgroundColor: theme.colors.disabled,
    ...(Platform.OS === 'web'
      ? {
          background: theme.colors.disabled,
          boxShadow: 'none',
          cursor: 'not-allowed',
          transform: 'none',
        }
      : {
          shadowOpacity: 0,
          elevation: 0,
        }),
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  icon: {
    marginRight: 0,
  },
  buttonText: {
    color: theme.colors.surface,
    fontSize: Platform.OS === 'web' ? 14 : 15, // Ligeiramente maior no mobile
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: Platform.OS === 'web' ? 20 : 22, // Melhor espaçamento
  },
});
