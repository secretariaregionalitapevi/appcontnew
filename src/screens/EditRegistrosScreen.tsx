import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { AppHeader } from '../components/AppHeader';
import { theme } from '../theme';
import { supabaseDataService } from '../services/supabaseDataService';
import { getDatabase } from '../database/database';
import { RegistroPresenca, Comum, Cargo, Instrumento, Pessoa } from '../types/models';
import { showToast } from '../utils/toast';
import { useNavigation } from '@react-navigation/native';

export const EditRegistrosScreen: React.FC = () => {
  const navigation = useNavigation();
  const [registros, setRegistros] = useState<RegistroPresenca[]>([]);
  const [comuns, setComuns] = useState<Comum[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Carregar dados de referência
      const [comunsData, cargosData, instrumentosData, pessoasData] = await Promise.all([
        supabaseDataService.fetchComuns(),
        supabaseDataService.fetchCargos(),
        supabaseDataService.fetchInstrumentos(),
        supabaseDataService.fetchPessoas(),
      ]);

      setComuns(comunsData);
      setCargos(cargosData);
      setInstrumentos(instrumentosData);
      setPessoas(pessoasData);

      // Carregar registros pendentes do banco local
      const registrosData = await supabaseDataService.getRegistrosPendentesFromLocal();
      setRegistros(registrosData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      showToast.error('Erro', 'Não foi possível carregar os registros');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleDeleteRegistro = async (id: string) => {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM registros_presenca WHERE id = ?', [id]);

      showToast.success('Registro removido', 'O registro foi removido com sucesso');
      await loadData();
    } catch (error) {
      console.error('Erro ao remover registro:', error);
      showToast.error('Erro', 'Não foi possível remover o registro');
    }
  };

  const getNomeComum = (id: string) => {
    return comuns.find(c => c.id === id)?.nome || id;
  };

  const getNomeCargo = (id: string) => {
    return cargos.find(c => c.id === id)?.nome || id;
  };

  const getNomeInstrumento = (id: string | null | undefined) => {
    if (!id) return '-';
    return instrumentos.find(i => i.id === id)?.nome || id;
  };

  const getNomePessoa = (id: string) => {
    const pessoa = pessoas.find(p => p.id === id);
    if (!pessoa) return id;
    return `${pessoa.nome} ${pessoa.sobrenome}`;
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Carregando registros...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Editar Registros</Text>
            <Text style={styles.cardSubtitle}>
              {registros.length} registro(s) pendente(s) de sincronização
            </Text>
          </View>

          {registros.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FontAwesome5 name="check-circle" size={48} color={theme.colors.textSecondary} />
              <Text style={styles.emptyText}>Nenhum registro pendente</Text>
              <Text style={styles.emptySubtext}>Todos os registros foram sincronizados</Text>
            </View>
          ) : (
            <View style={styles.registrosList}>
              {registros.map(registro => (
                <View key={registro.id} style={styles.registroItem}>
                  <View style={styles.registroContent}>
                    <View style={styles.registroHeader}>
                      <Text style={styles.registroNome}>{getNomePessoa(registro.pessoa_id)}</Text>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteRegistro(registro.id!)}
                      >
                        <FontAwesome5 name="trash" size={14} color={theme.colors.error} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.registroDetails}>
                      <View style={styles.detailRow}>
                        <FontAwesome5 name="church" size={12} color={theme.colors.textSecondary} />
                        <Text style={styles.detailText}>{getNomeComum(registro.comum_id)}</Text>
                      </View>

                      <View style={styles.detailRow}>
                        <FontAwesome5
                          name="briefcase"
                          size={12}
                          color={theme.colors.textSecondary}
                        />
                        <Text style={styles.detailText}>{getNomeCargo(registro.cargo_id)}</Text>
                      </View>

                      {registro.instrumento_id && (
                        <View style={styles.detailRow}>
                          <FontAwesome5 name="music" size={12} color={theme.colors.textSecondary} />
                          <Text style={styles.detailText}>
                            {getNomeInstrumento(registro.instrumento_id)}
                          </Text>
                        </View>
                      )}

                      <View style={styles.detailRow}>
                        <FontAwesome5
                          name="map-marker-alt"
                          size={12}
                          color={theme.colors.textSecondary}
                        />
                        <Text style={styles.detailText}>{registro.local_ensaio}</Text>
                      </View>

                      <View style={styles.detailRow}>
                        <FontAwesome5 name="clock" size={12} color={theme.colors.textSecondary} />
                        <Text style={styles.detailText}>
                          {formatDate(registro.data_hora_registro)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.statusBadge}>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor:
                              registro.status_sincronizacao === 'synced'
                                ? theme.colors.success
                                : theme.colors.warning,
                          },
                        ]}
                      />
                      <Text style={styles.statusText}>
                        {registro.status_sincronizacao === 'synced' ? 'Sincronizado' : 'Pendente'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cardTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  cardSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  emptyContainer: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  emptySubtext: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  registrosList: {
    padding: theme.spacing.md,
  },
  registroItem: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  registroContent: {
    padding: theme.spacing.md,
  },
  registroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  registroNome: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  deleteButton: {
    padding: theme.spacing.xs,
  },
  registroDetails: {
    gap: theme.spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  detailText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
});
