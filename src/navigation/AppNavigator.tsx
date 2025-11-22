import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { EditRegistrosScreen } from '../screens/EditRegistrosScreen';
import { useAuthContext } from '../context/AuthContext';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { theme } from '../theme';

const Stack = createNativeStackNavigator();

export const AppNavigator: React.FC = () => {
  const { user, loading } = useAuthContext();
  const navigationRef = useRef<any>(null);
  const previousUserRef = useRef<typeof user>(user);

  // Navegar para Login quando o usuário fizer logout
  useEffect(() => {
    // Só navegar se houve mudança de autenticado para não autenticado
    const wasAuthenticated = previousUserRef.current !== null;
    const isNowUnauthenticated = !loading && !user;

    if (wasAuthenticated && isNowUnauthenticated && navigationRef.current?.isReady()) {
      // Pequeno delay para garantir que o estado foi atualizado
      const timer = setTimeout(() => {
        try {
          navigationRef.current?.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        } catch (error) {
          console.warn('Erro ao navegar para Login:', error);
        }
      }, 100);

      return () => clearTimeout(timer);
    }

    // Atualizar referência do usuário anterior
    previousUserRef.current = user;
  }, [user, loading]);

  // Forçar login se não houver usuário autenticado
  useEffect(() => {
    if (!loading && !user && navigationRef.current?.isReady()) {
      // Pequeno delay para garantir que o estado foi atualizado
      const timer = setTimeout(() => {
        try {
          navigationRef.current?.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        } catch (error) {
          console.warn('Erro ao navegar para Login:', error);
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
        initialRouteName={user ? 'Register' : 'Login'}
      >
        <Stack.Screen 
          name="Login" 
          component={LoginScreen}
          options={{ title: 'CCB | Login' }}
        />
        <Stack.Screen 
          name="SignUp" 
          component={SignUpScreen}
          options={{ title: 'CCB | Cadastro' }}
        />
        <Stack.Screen 
          name="Register" 
          component={RegisterScreen}
          options={{ title: 'CCB | Contagem EnR' }}
        />
        <Stack.Screen name="EditRegistros" component={EditRegistrosScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
});
