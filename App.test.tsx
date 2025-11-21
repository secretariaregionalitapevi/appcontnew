import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Versão mínima para testar se o problema é de código ou conexão
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Teste iOS</Text>
      <Text style={styles.subtitle}>Se você vê isso, o app está carregando!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E88E5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    padding: 20,
  },
});
