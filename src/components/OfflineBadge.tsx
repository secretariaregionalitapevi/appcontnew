import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { theme } from '../theme';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineBadgeProps {
  count: number;
  syncing?: boolean;
}

export const OfflineBadge: React.FC<OfflineBadgeProps> = ({ count, syncing = false }) => {
  const { isOnline } = useOnlineStatus();
  const getBadgeStyle = () => {
    if (syncing) {
      return [styles.badge, styles.badgeSyncing];
    }
    if (count === 0) {
      return [styles.badge, styles.badgeEmpty];
    }
    return [styles.badge, styles.badgePending];
  };

  const getBadgeTextStyle = () => {
    if (syncing) {
      return [styles.badgeText, styles.badgeTextSyncing];
    }
    if (count === 0) {
      return [styles.badgeText, styles.badgeTextEmpty];
    }
    return [styles.badgeText, styles.badgeTextPending];
  };

  const getIcon = () => {
    if (syncing) {
      return 'sync-alt';
    }
    if (count === 0) {
      return 'check-circle';
    }
    // Usar hourglass (ampulheta) quando há pendentes, como no contpedras
    return 'hourglass-half';
  };

  const getIconColor = () => {
    if (syncing) {
      return '#1e40af';
    }
    if (count === 0) {
      return '#166534';
    }
    return '#92400e';
  };

  const getText = () => {
    if (syncing) {
      return 'Sincronizando...';
    }
    if (count === 0) {
      return 'VAZIO';
    }
    return `${count} ${count === 1 ? 'pendente' : 'pendentes'}`;
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
    <View style={getBadgeStyle()}>
      <FontAwesome5 name={getIcon()} size={12} color={getIconColor()} style={styles.icon} />
      <Text style={getBadgeTextStyle()}>{getText()}</Text>
        </View>
      </View>
      {/* Status Online/Offline - abaixo do badge */}
      <View style={styles.statusIndicator}>
        <FontAwesome5 
          name={isOnline ? "wifi" : "wifi"} 
          size={12} 
          color={isOnline ? "#10b981" : "#ef4444"} 
          solid={!isOnline} // Usar estilo sólido quando offline para diferenciar visualmente
        />
        <Text style={styles.statusText}>
          {isOnline ? 'Online' : 'Offline'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    ...(Platform.OS === 'web'
      ? {
          position: 'relative' as const,
          zIndex: 1,
        }
      : {}),
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  queueText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.md,
    ...(Platform.OS === 'web'
      ? {
          display: 'inline-flex',
          position: 'relative' as const,
          zIndex: 1,
        }
      : {
          elevation: 0,
        }),
  },
  badgeEmpty: {
    backgroundColor: '#dcfce7',
    ...(Platform.OS === 'web'
      ? {
          backgroundColor: '#dcfce7',
        }
      : {}),
  },
  badgePending: {
    backgroundColor: '#fef3c7',
    ...(Platform.OS === 'web'
      ? {
          backgroundColor: '#fef3c7',
        }
      : {}),
  },
  badgeSyncing: {
    backgroundColor: '#dbeafe',
    ...(Platform.OS === 'web'
      ? {
          backgroundColor: '#dbeafe',
        }
      : {}),
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeTextEmpty: {
    color: '#166534',
  },
  badgeTextPending: {
    color: '#92400e',
  },
  badgeTextSyncing: {
    color: '#1e40af',
  },
  icon: {
    marginRight: 2,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: theme.spacing.xs,
  },
  statusText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
});
