import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuthContext } from '../context/AuthContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { theme } from '../theme';
import { showToast } from '../utils/toast';
import { isSupabaseConfigured } from '../services/supabaseClient';

export const SignUpScreen: React.FC = () => {
  const navigation = useNavigation();
  const { signUp } = useAuthContext();

  const [nomeCompleto, setNomeCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Verificar conexão com Supabase ao montar o componente
    if (!isSupabaseConfigured()) {
      showToast.error(
        'Supabase não configurado',
        'Configure as variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY'
      );
    }
  }, []);

  const handleSignUp = async () => {
    // Verificar se Supabase está configurado
    if (!isSupabaseConfigured()) {
      console.error('❌ Supabase não configurado');
      showToast.error(
        'Erro de configuração',
        'Supabase não está configurado. Verifique as variáveis de ambiente.'
      );
      return;
    }

    console.log('✅ Supabase configurado, iniciando cadastro...');

    // Validações
    if (!nomeCompleto.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Campos obrigatórios', 'Preencha todos os campos obrigatórios.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Senhas não coincidem', 'As senhas digitadas não são iguais.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Senha muito curta', 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      console.log('📝 Tentando criar conta:', { email, nomeCompleto });
      const result = await signUp(email, password, nomeCompleto.trim());
      console.log('📦 Resultado do signUp:', {
        user: result.user ? 'existe' : 'null',
        error: result.error?.message,
        hasError: !!result.error,
      });

      // Verificar se há erro primeiro
      if (result.error) {
        let errorMessage = 'Ocorreu um erro ao criar sua conta.';
        const errorMsg = result.error.message || '';

        if (
          errorMsg.includes('already registered') ||
          errorMsg.includes('already exists') ||
          errorMsg.includes('User already registered')
        ) {
          errorMessage = 'Este email já está cadastrado. Tente fazer login ou use outro email.';
        } else if (errorMsg.includes('Invalid email')) {
          errorMessage = 'Por favor, insira um email válido.';
        } else if (errorMsg.includes('Password should be at least')) {
          errorMessage = 'A senha deve ter pelo menos 6 caracteres.';
        } else if (
          errorMsg.includes('email de confirmação') ||
          errorMsg.includes('confirmation') ||
          errorMsg.includes('Verifique sua caixa de entrada')
        ) {
          // Caso especial: usuário criado mas precisa confirmar email
          showToast.info(
            'Verifique seu email',
            'Um email de confirmação foi enviado. Verifique sua caixa de entrada e clique no link para confirmar sua conta.'
          );
          setTimeout(() => {
            navigation.goBack();
          }, 4000);
          return;
        } else {
          errorMessage = errorMsg || 'Ocorreu um erro ao criar sua conta. Tente novamente.';
        }

        showToast.error('Erro no cadastro', errorMessage);
        console.error('Erro ao criar conta:', result.error);
        return;
      }

      // Se não há erro e há usuário, sucesso!
      if (result.user) {
        showToast.success('Conta criada com sucesso!', `Bem-vindo(a) ao SAC, ${nomeCompleto}!`);

        // Aguardar um pouco antes de navegar para dar tempo do usuário ver o toast
        setTimeout(() => {
          navigation.goBack();
        }, 3000);
        return;
      }

      // Caso não tratado: sem erro mas também sem usuário
      console.warn('⚠️ Resultado inesperado:', result);
      showToast.error('Erro', 'Não foi possível criar a conta. Tente novamente.');
    } catch (error) {
      console.error('Erro no cadastro:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Ocorreu um erro ao criar sua conta. Tente novamente.';
      showToast.error('Erro', errorMessage);
    } finally {
      setLoading(false);
    }
  };

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

          <Text style={styles.subText}>Preencha os dados para criar sua conta</Text>

          {/* Formulário */}
          <View style={styles.card}>
            {/* Nome Completo */}
            <View style={styles.inputGroup}>
              <View style={styles.inputGroupText}>
                <FontAwesome5 name="user" size={16} color={theme.colors.icon} />
              </View>
              <TextInput
                style={styles.input}
                value={nomeCompleto}
                onChangeText={setNomeCompleto}
                placeholder="Nome completo"
                placeholderTextColor={theme.colors.textSecondary}
                autoCapitalize="words"
                autoComplete="name"
              />
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <View style={styles.inputGroupText}>
                <FontAwesome5 name="envelope" size={16} color={theme.colors.icon} />
              </View>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="E-mail"
                placeholderTextColor={theme.colors.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            {/* Senha */}
            <View style={styles.inputGroup}>
              <View style={styles.inputGroupText}>
                <FontAwesome5 name="lock" size={16} color={theme.colors.icon} />
              </View>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Senha (mínimo 6 caracteres)"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.togglePassword}
                onPress={() => setShowPassword(!showPassword)}
              >
                <FontAwesome5
                  name={showPassword ? 'eye-slash' : 'eye'}
                  size={16}
                  color={theme.colors.icon}
                />
              </TouchableOpacity>
            </View>

            {/* Confirmar Senha */}
            <View style={styles.inputGroup}>
              <View style={styles.inputGroupText}>
                <FontAwesome5 name="lock" size={16} color={theme.colors.icon} />
              </View>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirmar senha"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity
                style={styles.togglePassword}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <FontAwesome5
                  name={showConfirmPassword ? 'eye-slash' : 'eye'}
                  size={16}
                  color={theme.colors.icon}
                />
              </TouchableOpacity>
            </View>

            <PrimaryButton
              title="Criar Conta"
              onPress={handleSignUp}
              loading={loading}
              style={styles.loginButton}
            />

            <View style={styles.divider} />

            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>Já tem uma conta?</Text>
              <TouchableOpacity style={styles.registerButton} onPress={() => navigation.goBack()}>
                <Text style={styles.registerButtonText}>Faça login aqui</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Rodapé */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              <Text style={styles.footerBold}>©</Text> Aplicativo de Contagem v1.0
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
  inputGroupText: {
    backgroundColor: theme.colors.surface,
    borderRightWidth: 0,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 40,
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
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButton: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },
  registerContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  registerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  registerButton: {
    paddingVertical: theme.spacing.xs,
  },
  registerButtonText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: '500',
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
    fontWeight: '700',
  },
  footerLink: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
});
