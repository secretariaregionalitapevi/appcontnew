import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';

// Importar Toast apenas para plataformas nativas (não web)
type ToastComponent = React.ComponentType | null;
let Toast: ToastComponent = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Toast = require('react-native-toast-message').default;
  } catch (error) {
    console.warn('Toast não disponível:', error);
  }
}

export default function App() {
  const [initError, setInitError] = useState<Error | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Aguardar um pouco para garantir que tudo está inicializado
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Se houver erro de inicialização, mostrar tela de erro
  if (initError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Erro ao inicializar</Text>
        <Text style={styles.errorText}>{initError.message || 'Erro desconhecido'}</Text>
        <Text style={styles.errorStack}>{initError.stack || ''}</Text>
      </View>
    );
  }

  // Garantir que o app sempre renderize algo, mesmo com erros
  try {
    if (!isReady) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Inicializando...</Text>
        </View>
      );
    }

    return (
      <AuthProvider>
        <StatusBar style="auto" />
        <ErrorBoundary onError={setInitError}>
          <AppNavigator />
        </ErrorBoundary>
        {Platform.OS !== 'web' && Toast && <Toast />}
      </AuthProvider>
    );
  } catch (error) {
    console.error('Erro crítico ao inicializar app:', error);
    const err = error instanceof Error ? error : new Error(String(error));
    setInitError(err);
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Erro ao inicializar</Text>
        <Text style={styles.errorText}>{err.message || 'Erro desconhecido'}</Text>
      </View>
    );
  }
}

// Error Boundary para capturar erros
interface ErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error) => void;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  { hasError: boolean; error: Error | null }
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Erro capturado:', error, errorInfo);
    // Chamar callback se fornecido
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Erro ao carregar o aplicativo</Text>
          <Text style={styles.errorText}>{this.state.error?.message || 'Erro desconhecido'}</Text>
          {__DEV__ && this.state.error?.stack && (
            <Text style={styles.errorStack}>{this.state.error.stack}</Text>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E88E5',
  },
  loadingText: {
    fontSize: 18,
    color: '#FFFFFF',
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f3f3f4',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#ef4444',
  },
  errorText: {
    fontSize: 16,
    color: '#212121',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorStack: {
    fontSize: 10,
    color: '#7b8a97',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 10,
    padding: 10,
    backgroundColor: '#ffffff',
    borderRadius: 5,
    maxHeight: 200,
  },
});
