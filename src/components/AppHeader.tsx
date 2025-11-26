import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuthContext } from '../context/AuthContext';
import { localStorageService } from '../services/localStorageService';
import { showToast } from '../utils/toast';
import { LocalEnsaio } from '../types/models';

interface AppHeaderProps {
  onSettingsPress?: () => void;
  onLogoutPress?: () => void;
  onEditRegistrosPress?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onSettingsPress,
  onLogoutPress,
  onEditRegistrosPress,
}) => {
  const { user, signOut } = useAuthContext();
  const [localEnsaio, setLocalEnsaio] = React.useState<string>('');

  React.useEffect(() => {
    loadLocalEnsaio();
  }, []);

  // Debug: log do usuário quando mudar
  React.useEffect(() => {
    if (user) {
      console.log('👤 Usuário no AppHeader:', {
        id: user.id,
        email: user.email,
        nome: user.nome,
        role: user.role,
        hasNome: !!user.nome,
      });
    } else {
      console.log('👤 Usuário não está logado');
    }
  }, [user]);

  const loadLocalEnsaio = async () => {
    try {
      const localId = await localStorageService.getLocalEnsaio();
      if (localId) {
        // Buscar nome do local a partir do ID
        const locais: LocalEnsaio[] = [
          { id: '1', nome: 'Cotia' },
          { id: '2', nome: 'Caucaia do Alto' },
          { id: '3', nome: 'Fazendinha' },
          { id: '4', nome: 'Itapevi' },
          { id: '5', nome: 'Jandira' },
          { id: '6', nome: 'Pirapora' },
          { id: '7', nome: 'Vargem Grande' },
        ];
        const localEncontrado = locais.find(l => l.id === localId);
        setLocalEnsaio(localEncontrado?.nome || localId);
      } else {
        setLocalEnsaio('Ensaio Regional Itapevi');
      }
    } catch (error) {
      console.error('Erro ao carregar local de ensaio:', error);
      setLocalEnsaio('Ensaio Regional Itapevi');
    }
  };

  const handleLogout = async () => {
    try {
      // Mostrar feedback visual
      showToast.info('Saindo...', 'Encerrando sessão...');

      // Se há callback customizado, usar ele
      if (onLogoutPress) {
        onLogoutPress();
        return;
      }

      // Executar logout
      await signOut();

      // Feedback de sucesso
      showToast.success('Logout realizado', 'Sessão encerrada com sucesso');

      // O AppNavigator já vai reagir automaticamente ao estado user mudar para null
      // e mostrar a tela de Login
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      showToast.error('Erro', 'Erro ao encerrar sessão. Tente novamente.');
    }
  };

  // Formatar nome do usuário (primeiro e último nome)
  const formatUserName = (name: string | undefined): string => {
    if (!name) return 'Usuário';
    const parts = name
      .trim()
      .split(' ')
      .filter(p => p.length > 0);
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[parts.length - 1]}`;
    }
    return parts[0] || 'Usuário';
  };

  // Obter nome completo do usuário (não usar email)
  const getUserDisplayName = (): string => {
    if (user?.nome && user.nome.trim()) {
      return formatUserName(user.nome);
    }
    // Se não tem nome, não usar email - usar "Usuário"
    return 'Usuário';
  };

  // Verificar se é master/admin (normalizar role para comparação)
  const userRole = user?.role ? String(user.role).toLowerCase().trim() : 'user';
  const isMaster = userRole === 'master' || userRole === 'admin';
  const userRoleText = isMaster ? 'Administrador' : 'Usuário';

  const userName = getUserDisplayName();

  // Debug: log do role
  React.useEffect(() => {
    if (user) {
      console.log('👑 Verificação de role master:', {
        roleOriginal: user.role,
        roleNormalizado: userRole,
        isMaster: isMaster,
        userRoleText: userRoleText,
      });
    }
  }, [user, userRole, isMaster, userRoleText]);

  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        {/* Left Section - Logo e Título */}
        <View style={styles.headerLeft}>
          <View style={styles.brandSection}>
            <View style={styles.brandLogo}>
              <Image 
                source={require('../img/ccb.png')} 
                style={styles.brandLogoImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.brandText}>
              <Text style={styles.brandTitle}>Registro de Presença</Text>
              <View style={styles.brandSubtitleContainer}>
                <FontAwesome5 name="map-marker-alt" size={11} color="#ff6b6b" />
                <Text style={styles.brandSubtitle}>{localEnsaio}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Right Section - User Info e Actions */}
        <View style={styles.headerRight}>
          {/* User Info */}
          <View style={styles.userInfo}>
            <View style={styles.userProfile}>
              <View style={styles.userAvatar}>
                <FontAwesome5 name="user" size={14} color="#ffffff" />
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.userName} numberOfLines={1}>
                  {userName}
                </Text>
                <Text style={styles.userRole} numberOfLines={1}>
                  {userRoleText}
                </Text>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.headerActions}>
            {/* Botão Editar Registros - apenas para master */}
            {isMaster && onEditRegistrosPress && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={onEditRegistrosPress}
                activeOpacity={0.7}
              >
                <FontAwesome5 name="edit" size={14} color="#a7b1c2" />
              </TouchableOpacity>
            )}
            {onSettingsPress && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={onSettingsPress}
                activeOpacity={0.7}
              >
                <FontAwesome5 name="cog" size={14} color="#a7b1c2" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionBtn} onPress={handleLogout} activeOpacity={0.7}>
              <FontAwesome5 name="sign-out-alt" size={14} color="#a7b1c2" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#2f4050',
    paddingTop: Platform.OS === 'ios' ? 40 : 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#293846',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandLogo: {
    width: 35,
    height: 35,
    backgroundColor: '#ffffff',
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  brandLogoImage: {
    width: '100%',
    height: '100%',
  },
  brandText: {
    flexDirection: 'column',
    gap: 2,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 20,
  },
  brandSubtitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  brandSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '400',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
    minWidth: 0,
  },
  userProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  userAvatar: {
    width: 30,
    height: 30,
    backgroundColor: '#033d60', // Azul da Congregação Cristã no Brasil
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userDetails: {
    flexDirection: 'column',
    gap: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 14,
    maxWidth: 100,
  },
  userRole: {
    fontSize: 10,
    color: '#a7b1c2',
    lineHeight: 12,
    maxWidth: 100,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    width: 44, // Aumentado de 32 para 44px (mínimo recomendado)
    height: 44, // Aumentado de 32 para 44px (mínimo recomendado)
    borderRadius: 8, // Aumentado para melhor visual
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44, // Garantir área mínima
    minHeight: 44, // Garantir área mínima
    padding: 8, // Padding interno para melhor área de toque
  },
});
