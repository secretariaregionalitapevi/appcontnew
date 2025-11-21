import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAuthContext } from '../context/AuthContext';
import { SimpleSelectField } from '../components/SimpleSelectField';
import { AutocompleteField } from '../components/AutocompleteField';
import { NameSelectField } from '../components/NameSelectField';
import { TextInputField } from '../components/TextInputField';
import { PrimaryButton } from '../components/PrimaryButton';
import { OfflineBadge } from '../components/OfflineBadge';
import { AppHeader } from '../components/AppHeader';
import { theme } from '../theme';
import { supabaseDataService } from '../services/supabaseDataService';
import { offlineSyncService } from '../services/offlineSyncService';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Comum, Cargo, Instrumento, Pessoa, RegistroPresenca } from '../types/models';
import { getCurrentDateTimeISO } from '../utils/dateUtils';
import { localStorageService } from '../services/localStorageService';
import { showToast } from '../utils/toast';
import { useNavigation } from '@react-navigation/native';

export const RegisterScreen: React.FC = () => {
  const { user } = useAuthContext();
  const navigation = useNavigation();
  const isOnline = useOnlineStatus();
  const { pendingCount } = useOfflineQueue();

  const [comuns, setComuns] = useState<Comum[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);

  const [selectedComum, setSelectedComum] = useState<string>('');
  const [selectedCargo, setSelectedCargo] = useState<string>('');
  const [selectedInstrumento, setSelectedInstrumento] = useState<string>('');
  const [selectedPessoa, setSelectedPessoa] = useState<string>('');
  const [isNomeManual, setIsNomeManual] = useState(false);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    nome: string;
    comum: string;
    data: string;
    horario: string;
  } | null>(null);
  const [pendingRegistro, setPendingRegistro] = useState<RegistroPresenca | null>(null);

  // Mostrar campo de instrumento apenas para Músico
  // Organista NÃO mostra campo de instrumento (sempre toca órgão)
  const selectedCargoObj = cargos.find(c => c.id === selectedCargo);
  const cargoNome = selectedCargoObj?.nome || '';
  const isOrganista = cargoNome === 'Organista';
  const showInstrumento = !isOrganista && selectedCargoObj?.is_musical;

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (isOnline && !syncing) {
      syncData();
    }
  }, [isOnline]);

  useEffect(() => {
    // Verificar se precisa de instrumento obrigatório (apenas Músico)
    // Organista não precisa de instrumento (sempre toca órgão)
    const selectedCargoObj = cargos.find(c => c.id === selectedCargo);
    const cargoNome = selectedCargoObj?.nome || '';
    const precisaInstrumento = cargoNome === 'Músico'; // Organista removido

    // Só carregar pessoas se tiver comum + cargo + (instrumento se necessário)
    if (selectedComum && selectedCargo) {
      if (precisaInstrumento && !selectedInstrumento) {
        // Precisa de instrumento mas não foi selecionado ainda
        setPessoas([]);
        setSelectedPessoa('');
        return;
      }
      // Tem todos os campos necessários, carregar pessoas
      loadPessoas();
    } else {
      setPessoas([]);
      setSelectedPessoa('');
    }
  }, [selectedComum, selectedCargo, selectedInstrumento, cargos]);

  const loadInitialData = async () => {
    try {
      setInitialLoading(true);

      // Se está online, sempre tentar sincronizar primeiro
      if (isOnline) {
        console.log('🔄 Sincronizando dados do Supabase...');
        try {
          await syncData();
        } catch (syncError) {
          console.warn('⚠️ Erro na sincronização:', syncError);
        }
      }

      // Carregar do banco local/cache
      let [comunsData, cargosData, instrumentosData] = await Promise.all([
        supabaseDataService.getComunsFromLocal(),
        supabaseDataService.getCargosFromLocal(),
        supabaseDataService.getInstrumentosFromLocal(),
      ]);

      console.log('📊 Dados carregados:', {
        comuns: comunsData.length,
        cargos: cargosData.length,
        instrumentos: instrumentosData.length,
      });

      // Debug detalhado dos cargos
      console.log('🔍 Debug cargos:', {
        quantidade: cargosData.length,
        cargos: cargosData.map(c => ({ id: c.id, nome: c.nome, is_musical: c.is_musical })),
      });

      // Se ainda não há dados e está online, tentar buscar diretamente
      if (isOnline && comunsData.length === 0) {
        console.log('🔄 Nenhuma comum no cache, buscando diretamente do Supabase...');
        try {
          const comunsDiretas = await supabaseDataService.fetchComuns();
          if (comunsDiretas.length > 0) {
            comunsData = comunsDiretas;
            // Salvar no cache
            await supabaseDataService.syncComunsToLocal();
          }
        } catch (error) {
          console.warn('⚠️ Erro ao buscar comuns diretamente:', error);
        }
      }

      if (comunsData.length === 0) {
        console.warn('⚠️ Nenhuma comum encontrada - verifique a conexão e tente novamente');
      }

      setComuns(comunsData);
      setCargos(cargosData);
      setInstrumentos(instrumentosData);
    } catch (error) {
      console.error('❌ Erro ao carregar dados iniciais:', error);
      Alert.alert('Erro', 'Não foi possível carregar os dados. Verifique sua conexão.');
    } finally {
      setInitialLoading(false);
    }
  };

  const syncData = async () => {
    if (syncing || !isOnline) return; // Não sincronizar se já está sincronizando ou está offline

    try {
      setSyncing(true);
      const result = await offlineSyncService.syncAllData();
      // Não mostrar erro se for apenas falta de conexão ou sessão (são esperados)
      if (!result.success && result.error) {
        if (!result.error.includes('conexão') && !result.error.includes('Sessão')) {
          console.warn('⚠️ Erro na sincronização:', result.error);
        }
      }
    } catch (error) {
      // Não logar erros de rede como erros críticos
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        !errorMessage.toLowerCase().includes('fetch') &&
        !errorMessage.toLowerCase().includes('network')
      ) {
        console.error('❌ Erro ao sincronizar:', error);
      }
    } finally {
      setSyncing(false);
    }
  };

  const loadPessoas = async () => {
    try {
      console.log('📚 Carregando pessoas:', {
        selectedComum,
        selectedCargo,
        selectedInstrumento,
        showInstrumento,
      });

      const pessoasData = await supabaseDataService.getPessoasFromLocal(
        selectedComum,
        selectedCargo,
        showInstrumento ? selectedInstrumento : undefined
      );

      console.log(`✅ ${pessoasData.length} pessoas carregadas`);
      setPessoas(pessoasData);
    } catch (error) {
      console.error('❌ Erro ao carregar pessoas:', error);
      setPessoas([]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedComum || !selectedCargo || !selectedPessoa) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios');
      return;
    }

    // Validar instrumento apenas para Músico (obrigatório)
    // Organista não precisa de instrumento (sempre toca órgão)
    const cargoNome = cargos.find(c => c.id === selectedCargo)?.nome || '';
    const instrumentoObrigatorio = cargoNome === 'Músico'; // Organista removido
    if (instrumentoObrigatorio && !selectedInstrumento) {
      Alert.alert('Erro', 'Selecione o instrumento para Músico');
      return;
    }

    if (!user) {
      Alert.alert('Erro', 'Usuário não autenticado');
      return;
    }

    setLoading(true);

    // Preparar registro antes do try para estar disponível no catch
    const localEnsaio = await localStorageService.getLocalEnsaio();

    // Usar nome do usuário ao invés do ID
    const nomeUsuario = user.nome || user.email || user.id;

    // Buscar classe da organista do banco de dados se for Organista
    // Se nome é manual, não buscar classe (cadastro desatualizado)
    let classeOrganistaDB: string | undefined = undefined;
    if (isOrganista && !isNomeManual) {
      const pessoaSelecionada = pessoas.find(p => p.id === selectedPessoa);
      if (pessoaSelecionada && pessoaSelecionada.classe_organista) {
        classeOrganistaDB = pessoaSelecionada.classe_organista;
      } else {
        // Se não encontrou classe mas é organista da lista, usar OFICIALIZADA
        classeOrganistaDB = 'OFICIALIZADA';
      }
    }

    // Se nome é manual, usar o texto digitado como pessoa_id temporário
    // O sistema precisa lidar com isso nos serviços de sincronização
    const pessoaIdFinal = isNomeManual ? `manual_${selectedPessoa}` : selectedPessoa;

    const registro: RegistroPresenca = {
      pessoa_id: pessoaIdFinal,
      comum_id: selectedComum,
      cargo_id: selectedCargo,
      instrumento_id: showInstrumento ? selectedInstrumento : null,
      classe_organista: classeOrganistaDB, // Buscar do banco de dados (ou null se manual)
      local_ensaio: localEnsaio || 'Não definido',
      data_hora_registro: getCurrentDateTimeISO(),
      usuario_responsavel: nomeUsuario, // Usar nome ao invés de ID
      status_sincronizacao: 'pending',
    };

    try {
      const result = await offlineSyncService.createRegistro(registro);

      console.log('📋 Resultado do createRegistro:', result);

      if (result.success) {
        // Se está online, tentar sincronizar imediatamente após salvar
        if (isOnline && !syncing) {
          setTimeout(() => {
            syncData();
          }, 500);
        }

        showToast.success('Registro enviado!', result.error || 'Registro enviado com sucesso!');
        // Limpar formulário
        setSelectedComum('');
        setSelectedCargo('');
        setSelectedInstrumento('');
        setSelectedPessoa('');
        setIsNomeManual(false);
      } else {
        // Verificar se é erro de duplicata
        if (
          result.error &&
          (result.error.includes('DUPLICATA:') ||
            result.error.includes('já foi cadastrado hoje') ||
            result.error.includes('DUPLICATA_BLOQUEADA'))
        ) {
          let nome = '';
          let comumNome = '';
          let dataFormatada = '';
          let horarioFormatado = '';

          // Tentar extrair informações do formato DUPLICATA:nome|comum|data|horario
          if (result.error.includes('DUPLICATA:')) {
            const parts = result.error.split('DUPLICATA:')[1]?.split('|');
            if (parts && parts.length >= 4) {
              nome = parts[0];
              comumNome = parts[1];
              dataFormatada = parts[2];
              horarioFormatado = parts[3];
            }
          }

          // Se não conseguiu extrair, usar fallback
          if (!nome || !comumNome) {
            const errorMsg = result.error;
            const nomeMatch = errorMsg.match(/^([^d]+) de/);
            const comumMatch = errorMsg.match(/de ([^j]+) já/);

            nome = nomeMatch
              ? nomeMatch[1].trim()
              : isNomeManual
                ? selectedPessoa
                : pessoas.find(p => p.id === selectedPessoa)?.nome_completo || '';
            comumNome = comumMatch
              ? comumMatch[1].trim()
              : comuns.find(c => c.id === selectedComum)?.nome || '';

            // Formatar data e horário atual como fallback
            const agora = new Date();
            dataFormatada = agora.toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            });
            horarioFormatado = agora.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
          }

          // Mostrar alerta simples
          Alert.alert(
            'Cadastro Duplicado!',
            `${nome} de ${comumNome} já foi cadastrado hoje!\n\nData: ${dataFormatada}\nHorário: ${horarioFormatado}`,
            [
              {
                text: 'Cancelar',
                style: 'cancel',
              },
              {
                text: 'Cadastrar Mesmo Assim',
                onPress: async () => {
                  setLoading(true);
                  try {
                    // Forçar duplicata - criar registro mesmo assim
                    const registroForce = { ...registro };
                    const resultForce = await offlineSyncService.createRegistro(registroForce);
                    if (resultForce.success) {
                      if (isOnline && !syncing) {
                        setTimeout(() => {
                          syncData();
                        }, 500);
                      }
                      showToast.success(
                        'Registro enviado!',
                        'Registro duplicado cadastrado com sucesso!'
                      );
                      setSelectedComum('');
                      setSelectedCargo('');
                      setSelectedInstrumento('');
                      setSelectedPessoa('');
                      setIsNomeManual(false);
                    } else {
                      showToast.error(
                        'Erro',
                        resultForce.error || 'Erro ao cadastrar registro duplicado'
                      );
                    }
                  } catch (error) {
                    Alert.alert('Erro', 'Ocorreu um erro ao processar o registro duplicado');
                    console.error('Erro ao criar registro duplicado:', error);
                  } finally {
                    setLoading(false);
                  }
                },
              },
            ]
          );
        } else {
          showToast.error('Erro', result.error || 'Erro ao enviar registro');
        }
      }
    } catch (error) {
      Alert.alert('Erro', 'Ocorreu um erro ao processar o registro');
      console.error('Erro ao criar registro:', error);
    } finally {
      setLoading(false);
    }
  };

  // Exibir apenas o nome sem código na busca, mas manter código completo no valor
  // MEMOIZAR para evitar recriação constante que causa loops
  // IMPORTANTE: useMemo DEVE estar ANTES de qualquer return condicional
  const comunsOptions = useMemo(() => {
    return comuns.map(c => {
      // Extrair nome sem código usando a função do supabaseDataService
      const nomeExibicao = supabaseDataService.extrairNomeComum(c.nome);
      return {
        id: c.id,
        label: nomeExibicao || c.nome, // Nome sem código para exibição
        value: c.id,
        nomeCompleto: c.nome, // Manter nome completo (com código) para registro
      };
    });
  }, [comuns]);

  // MEMOIZAR cargosOptions para evitar recriação constante
  const cargosOptions = useMemo(() => {
    return cargos.map(c => ({
      id: c.id,
      label: c.nome,
      value: c.id,
    }));
  }, [cargos]);

  // MEMOIZAR instrumentosOptions para evitar recriação constante
  const instrumentosOptions = useMemo(() => {
    return instrumentos.map(i => ({
      id: i.id,
      label: i.nome,
      value: i.id,
    }));
  }, [instrumentos]);

  // MEMOIZAR pessoasOptions para evitar recriação constante
  const pessoasOptions = useMemo(() => {
    return pessoas.map(p => ({
      id: p.id,
      label: p.nome_completo || `${p.nome} ${p.sobrenome}`, // Usar nome completo se disponível
      value: p.id,
    }));
  }, [pessoas]);

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Carregando dados...</Text>
      </View>
    );
  }

  const handleEditRegistros = () => {
    (navigation as any).navigate('EditRegistros');
  };

  return (
    <View style={styles.container}>
      <AppHeader onEditRegistrosPress={handleEditRegistros} />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          collapsable={false}
          style={Platform.OS === 'web' ? { zIndex: 1 } : undefined}
        >
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Registro de Participante</Text>
              <Text style={styles.cardSubtitle}>
                Preencha os campos abaixo para registrar a presença
              </Text>
            </View>
            <View style={styles.cardBody}>
              <AutocompleteField
                label="COMUM CONGREGAÇÃO *"
                value={selectedComum}
                options={comunsOptions}
                onSelect={option => {
                  setSelectedComum(option.value);
                  setSelectedPessoa('');
                  setIsNomeManual(false);
                }}
                placeholder="Digite para buscar..."
              />

              <SimpleSelectField
                label="CARGO/MINISTÉRIO *"
                value={selectedCargo}
                options={cargosOptions}
                onSelect={option => {
                  setSelectedCargo(option.value);
                  setSelectedInstrumento('');
                  setSelectedPessoa('');
                  setIsNomeManual(false);
                }}
                placeholder="Digite para buscar..."
              />

              {showInstrumento && (
                <SimpleSelectField
                  label="Instrumento (apenas para cargos musicais)"
                  value={selectedInstrumento}
                  options={instrumentosOptions}
                  onSelect={(option: any) => {
                    setSelectedInstrumento(option.value);
                    setSelectedPessoa('');
                    setIsNomeManual(false);
                  }}
                  placeholder="Selecione o instrumento"
                />
              )}

              <NameSelectField
                label="Nome e Sobrenome *"
                value={selectedPessoa}
                options={pessoasOptions}
                onSelect={(option: any) => {
                  if (option.id === 'manual') {
                    setSelectedPessoa(option.value);
                    setIsNomeManual(true);
                  } else {
                    setSelectedPessoa(option.value);
                    setIsNomeManual(false);
                  }
                }}
                placeholder="Digite para buscar..."
              />

              <Text style={styles.hint}>
                Selecione um nome da lista após preencher Comum e Cargo.
              </Text>

              <PrimaryButton
                title="ENVIAR REGISTRO"
                onPress={handleSubmit}
                loading={loading}
                style={styles.submitButton}
              />
            </View>
          </View>

          <View style={styles.footer}>
            <OfflineBadge count={pendingCount} syncing={syncing} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.spacing.lg,
  },
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
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'visible',
  },
  cardHeader: {
    backgroundColor: theme.colors.surface,
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
    lineHeight: 20,
  },
  cardBody: {
    padding: theme.spacing.lg,
  },
  hint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  submitButton: {
    marginTop: theme.spacing.md,
    alignSelf: 'center',
  },
  footer: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  syncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  syncText: {
    marginLeft: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
});
