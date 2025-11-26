import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  ViewStyle,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { theme } from '../theme';

interface DuplicateModalProps {
  visible: boolean;
  nome: string;
  comum: string;
  data: string;
  horario: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DuplicateModal: React.FC<DuplicateModalProps> = ({
  visible,
  nome,
  comum,
  data,
  horario,
  onCancel,
  onConfirm,
}) => {
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      // Definir valores imediatamente para garantir visibilidade
      scaleAnim.setValue(1);
      opacityAnim.setValue(1);

      // Animar suavemente
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: false,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: opacityAnim,
            ...(Platform.OS === 'web'
              ? {
                  zIndex: 999999999,
                  position: 'fixed' as ViewStyle['position'],
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }
              : {}),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.modal,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Ícone de alerta no topo */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <FontAwesome5 name="exclamation" size={28} color="#ffffff" />
            </View>
          </View>

          {/* Título */}
          <Text style={styles.title}>Cadastro Duplicado</Text>

          {/* Mensagem */}
          <View style={styles.messageContainer}>
            <Text style={styles.message}>
              <Text style={styles.bold}>{nome}</Text> de <Text style={styles.bold}>{comum}</Text> já
              foi cadastrado hoje!
            </Text>
          </View>

          {/* Detalhes */}
          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <FontAwesome5 name="calendar-alt" size={14} color="#666" style={styles.detailIcon} />
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>Data: </Text>
                {data}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <FontAwesome5 name="clock" size={14} color="#666" style={styles.detailIcon} />
              <Text style={styles.detailText}>
                <Text style={styles.detailLabel}>Horário: </Text>
                {horario}
              </Text>
            </View>
          </View>

          {/* Botões */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.6} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <FontAwesome5 name="times" size={14} color="#666" />
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.confirmButton} onPress={onConfirm} activeOpacity={0.6} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <FontAwesome5 name="check" size={14} color="#fff" />
              <Text style={styles.confirmButtonText}>Cadastrar Mesmo Assim</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    ...(Platform.OS === 'web'
      ? {
          backdropFilter: 'blur(4px)',
        }
      : {}),
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 440,
    padding: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05)',
          position: 'relative' as ViewStyle['position'],
          zIndex: 999999999,
        }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 24,
          elevation: 20,
        }),
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ff9800',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 4px 12px rgba(255, 152, 0, 0.3)',
        }
      : {
          shadowColor: '#ff9800',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 4,
        }),
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    letterSpacing: -0.3,
  },
  messageContainer: {
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
  },
  message: {
    fontSize: 15,
    color: '#4a4a4a',
    textAlign: 'center',
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
    color: '#1a1a1a',
  },
  detailsContainer: {
    backgroundColor: '#f8f9fa',
    marginHorizontal: theme.spacing.xl,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  detailIcon: {
    marginRight: theme.spacing.sm,
    width: 16,
  },
  detailText: {
    fontSize: 14,
    color: '#6c757d',
    flex: 1,
  },
  detailLabel: {
    fontWeight: '600',
    color: '#495057',
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: '#fafafa',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Platform.OS === 'web' ? 12 : 14, // Aumentado
    paddingHorizontal: theme.spacing.lg, // Aumentado de md para lg
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#dee2e6',
    minHeight: Platform.OS === 'web' ? 44 : 52, // Aumentado
    ...(Platform.OS === 'web'
      ? {
          transition: 'all 0.2s ease',
          cursor: 'pointer',
          ':hover': {
            backgroundColor: '#f8f9fa',
            borderColor: '#adb5bd',
          },
        }
      : {}),
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    marginLeft: 6,
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Platform.OS === 'web' ? 12 : 14, // Aumentado
    paddingHorizontal: theme.spacing.lg, // Aumentado de md para lg
    borderRadius: 8,
    backgroundColor: '#ff9800',
    minHeight: Platform.OS === 'web' ? 44 : 52, // Aumentado
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 2px 8px rgba(255, 152, 0, 0.25)',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
          ':hover': {
            backgroundColor: '#fb8c00',
            boxShadow: '0 4px 16px rgba(255, 152, 0, 0.35)',
            transform: 'translateY(-1px)',
          },
          ':active': {
            transform: 'translateY(0)',
          },
        }
      : {
          shadowColor: '#ff9800',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 6,
          elevation: 4,
        }),
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 6,
    letterSpacing: 0.2,
  },
});
