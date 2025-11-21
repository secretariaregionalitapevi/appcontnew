import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  Linking,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthContext } from '../context/AuthContext';
import { TextInputField } from '../components/TextInputField';
import { DropdownField } from '../components/DropdownField';
import { PrimaryButton } from '../components/PrimaryButton';
import { theme } from '../theme';
import { localStorageService } from '../services/localStorageService';
import { LocalEnsaio } from '../types/models';

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localEnsaio, setLocalEnsaio] = useState<string>('');
  const [locaisEnsaio, setLocaisEnsaio] = useState<LocalEnsaio[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const { signIn, signUp } = useAuthContext();

  React.useEffect(() => {
    loadLocaisEnsaio();
  }, []);

  const loadLocaisEnsaio = async () => {
    try {
      // Locais de ensaio da Regional Itapevi conforme o HTML original
      const mockLocais: LocalEnsaio[] = [
        { id: '1', nome: 'Cotia' },
        { id: '2', nome: 'Caucaia do Alto' },
        { id: '3', nome: 'Fazendinha' },
        { id: '4', nome: 'Itapevi' },
        { id: '5', nome: 'Jandira' },
        { id: '6', nome: 'Pirapora' },
        { id: '7', nome: 'Vargem Grande' },
      ];
      setLocaisEnsaio(mockLocais);
    } catch (error) {
      console.error('Erro ao carregar locais de ensaio:', error);
    }
  };

  const handleLogin = async () => {
    if (!email || !password || !localEnsaio) {
      Alert.alert('Campos obrigatórios', 'Preencha e-mail, senha e Local do Ensaio.');
      return;
    }

    setLoading(true);
    try {
      console.log('Tentando fazer login...');
      const result = isSignUp ? await signUp(email, password) : await signIn(email, password);

      console.log('Resultado do login:', result);

      if (result.error) {
        const errorMessage = translateErrorMessage(result.error.message || 'Erro ao fazer login');
        Alert.alert('Falha no login', errorMessage);
      } else if (result.user) {
        // Salvar local do ensaio selecionado
        await localStorageService.setLocalEnsaio(localEnsaio);
        console.log('Login bem-sucedido, navegando...');
        // Navegar para a tela de registro
        (navigation as any).navigate('Register');
      }
    } catch (error) {
      console.error('Erro no login:', error);
      Alert.alert('Erro', error instanceof Error ? error.message : 'Ocorreu um erro inesperado');
    } finally {
      setLoading(false);
    }
  };

  const translateErrorMessage = (message: string): string => {
    if (!message) return 'Ocorreu um erro ao realizar o login.';
    const msg = String(message);

    if (msg.includes('Invalid login credentials')) return 'Credenciais de login inválidas.';
    if (msg.includes('Email not confirmed'))
      return 'E-mail não confirmado. Verifique sua caixa de entrada.';
    if (msg.includes('User not found')) return 'Usuário não encontrado.';
    if (msg.includes('Invalid email or password')) return 'E-mail ou senha inválidos.';
    if (msg.includes('JWT expired')) return 'Sessão expirada. Faça login novamente.';
    if (msg.includes('rate limit') || msg.includes('Rate limit'))
      return 'Muitas tentativas. Tente novamente em instantes.';
    if (msg.includes('Network') || msg.includes('Failed to fetch'))
      return 'Falha de rede. Verifique sua conexão.';
    if (msg.includes('FetchError') || msg.includes('timeout'))
      return 'Tempo de resposta esgotado. Tente novamente.';

    return msg;
  };

  const locaisOptions = locaisEnsaio.map(local => ({
    id: local.id,
    label: local.nome,
    value: local.id,
    icon: 'map-marker-alt', // Ícone FontAwesome para cada local
  }));

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.loginWrap}>
          {/* Logo CCB */}
          <View style={styles.logoContainer}>
            <TouchableOpacity
              onPress={() => Linking.openURL('https://congregacaocristanobrasil.org.br/')}
              activeOpacity={0.7}
            >
              <Image
                source={require('../img/logo-ccb-light.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>

          {/* Título */}
          <Text style={styles.title}>Bem-vindos ao SAC</Text>

          {/* Subtítulo */}
          <Text style={styles.leadText}>
            Sistema Administrativo de Contagem, criado para facilitar a administração Musical da
            Congregação Cristã no Brasil
            {'\n'}
            <Text style={styles.boldText}>Regional Itapevi</Text>.
          </Text>

          <Text style={styles.subText}>Faça o login para acessar o Sistema</Text>

          {/* Formulário */}
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <View style={styles.inputGroupText}>
                <Text style={styles.icon}>✉</Text>
              </View>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Nome de usuário"
                placeholderTextColor={theme.colors.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputGroupText}>
                <Text style={styles.icon}>🔒</Text>
              </View>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Senha"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.togglePassword}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.toggleIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroupDropdown}>
              <DropdownField
                value={localEnsaio}
                options={locaisOptions}
                onSelect={option => setLocalEnsaio(option.value)}
                placeholder="Local do Ensaio"
                icon="map-marker-alt"
                iconColor={theme.colors.primary}
                style={styles.dropdownFullWidth}
              />
            </View>

            <PrimaryButton
              title={isSignUp ? 'Criar conta' : 'Login'}
              onPress={handleLogin}
              loading={loading}
              style={styles.loginButton}
            />

            <View style={styles.divider} />

            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>Não tem uma conta?</Text>
              <TouchableOpacity
                style={styles.registerButton}
                onPress={() => navigation.navigate('SignUp' as never)}
              >
                <Text style={styles.registerButtonText}>Criar conta</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Rodapé */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              <Text style={styles.footerBold}>©</Text> Aplicativo de Contagem v1.1.2
              {'\n'}
              <TouchableOpacity
                onPress={() => Linking.openURL('https://congregacaocristanobrasil.org.br/')}
              >
                <Text style={styles.footerLink}>Congregação Cristã no Brasil</Text>
              </TouchableOpacity>
              {'\n'}
              <Text style={styles.footerBold}>Regional Itapevi</Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  loginWrap: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingVertical: theme.spacing.md,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  logo: {
    width: 200,
    height: 120,
    marginVertical: theme.spacing.sm,
  },
  title: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    color: theme.colors.text,
  },
  leadText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  boldText: {
    fontWeight: '600',
  },
  subText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    minHeight: 48,
  },
  inputGroupDropdown: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'visible',
    minHeight: 48,
    zIndex: 1000,
  },
  dropdownFullWidth: {
    flex: 1,
  },
  inputGroupText: {
    backgroundColor: theme.colors.surface,
    borderRightWidth: 0,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 40,
  },
  icon: {
    fontSize: theme.fontSize.md,
    color: theme.colors.icon,
    textAlign: 'center',
  },
  input: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    paddingVertical: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.md,
    minHeight: 48,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },
  togglePassword: {
    position: 'absolute',
    right: theme.spacing.sm,
    padding: theme.spacing.xs,
    zIndex: 2,
  },
  toggleIcon: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.icon,
  },
  select: {
    flex: 1,
    borderWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },
  loginButton: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
  registerContainer: {
    alignItems: 'center',
  },
  registerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  registerButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    width: '100%',
  },
  registerButtonText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontSize: theme.fontSize.sm,
  },
  footer: {
    marginTop: theme.spacing.md,
    alignItems: 'center',
  },
  footerText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerBold: {
    fontWeight: '600',
  },
  footerLink: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
});
