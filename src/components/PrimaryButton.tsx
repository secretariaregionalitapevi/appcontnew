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
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
}) => {
  return (
    <TouchableOpacity
      style={[styles.button, (disabled || loading) && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.surface} size="small" />
      ) : (
        <View style={styles.buttonContent}>
          <FontAwesome
            name="paper-plane"
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
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    alignSelf: 'center',
    ...(Platform.OS === 'web'
      ? {
          background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.primaryDark} 100%)`,
          boxShadow: '0 2px 8px rgba(26, 179, 148, 0.2)',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }
      : {
          shadowColor: theme.colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 2,
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
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
