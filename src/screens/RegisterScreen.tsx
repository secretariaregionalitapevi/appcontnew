import React, { useState, useEffect, useMemo, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useAuthContext } from '../context/AuthContext';
import { SimpleSelectField } from '../components/SimpleSelectField';
import { AutocompleteField } from '../components/AutocompleteField';
import { NameSelectField } from '../components/NameSelectField';
import { TextInputField } from '../components/TextInputField';
import { PrimaryButton } from '../components/PrimaryButton';
import { OfflineBadge } from '../components/OfflineBadge';
import { AppHeader } from '../components/AppHeader';
import { DuplicateModal } from '../components/DuplicateModal';
import { NewRegistrationModal } from '../components/NewRegistrationModal';
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
import { getNaipeByInstrumento } from '../utils/instrumentNaipe';
import { formatRegistradoPor } from '../utils/userNameUtils';
import { generateExternalUUID } from '../utils/uuid';

export const RegisterScreen: React.FC = () => {
  const { user } = useAuthContext();

  // Definir título da página na web
  useLayoutEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'CCB | Contagem EnR';
    }
  }, []);
  const navigation = useNavigation();
  const { isOnline, setOnStatusChange } = useOnlineStatus();
  const { pendingCount, refreshCount } = useOfflineQueue();

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
  const [refreshing, setRefreshing] = useState(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    nome: string;
    comum: string;
    data: string;
    horario: string;
  } | null>(null);
  const [pendingRegistro, setPendingRegistro] = useState<RegistroPresenca | null>(null);
  const [newRegistrationModalVisible, setNewRegistrationModalVisible] = useState(false);

  // Mostrar campo de instrumento apenas para Músico
  // Organista NÃO mostra campo de instrumento (sempre toca órgão)
  const selectedCargoObj = cargos.find(c => c.id === selectedCargo);
  const cargoNome = selectedCargoObj?.nome || '';
  const isOrganista = cargoNome === 'Organista';
  const isCandidato = cargoNome === 'Candidato (a)';
  // Mostrar campo de instrumento apenas para Músico (não para Organista nem Candidato)
  // Candidatos têm instrumento na tabela, será buscado automaticamente ao enviar
  const showInstrumento = !isOrganista && !isCandidato && selectedCargoObj?.is_musical;

  // Função de sincronização - declarada ANTES dos useEffects que a usam
  const syncData = useCallback(async () => {
    // Verificar se já está sincronizando
    if (syncing) {
      console.log('⏳ Sincronização já em andamento, aguardando...');
      return;
    }
    
    // Verificar se está online antes de sincronizar
    const isOnlineNow = Platform.OS === 'web' 
      ? (typeof navigator !== 'undefined' && navigator.onLine)
      : isOnline;
    
    if (!isOnlineNow) {
      console.log('📴 Sem conexão - não é possível sincronizar agora');
      return;
    }
    
    try {
      setSyncing(true);
      console.log('🔄 [SYNC] Iniciando sincronização de dados...');
      
      // Verificar quantos registros pendentes existem
      const registrosPendentes = await supabaseDataService.getRegistrosPendentesFromLocal();
      console.log(`📊 [SYNC] ${registrosPendentes.length} registro(s) pendente(s) encontrado(s)`);
      
      if (registrosPendentes.length === 0) {
        console.log('📭 [SYNC] Nenhum registro pendente para sincronizar');
        setSyncing(false);
        return;
      }
      
      // Atualizar contador antes de sincronizar
      await refreshCount();
      
      // Sincronizar apenas registros pendentes (mais eficiente)
      const result = await offlineSyncService.syncPendingRegistros();
      
      console.log(`📊 [SYNC] Resultado: ${result.successCount} de ${result.totalCount} registros enviados`);
      
      // Atualizar contador após sincronizar
      await refreshCount();
      
      // Mostrar toast se registros foram sincronizados (igual ao contpedras)
      if (result.successCount > 0) {
        const mensagem = result.successCount === 1
          ? '1 item sincronizado'
          : `${result.successCount} itens sincronizados`;
        // Mostrar apenas mensagem, sem título (igual ao contpedras)
        showToast.success(mensagem);
      }
    } catch (error) {
      // Não logar erros de rede como erros críticos
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (
        !errorMessage.toLowerCase().includes('fetch') &&
        !errorMessage.toLowerCase().includes('network') &&
        !errorMessage.toLowerCase().includes('internet')
      ) {
        console.error('❌ [SYNC] Erro ao sincronizar:', error);
      } else {
        console.log('📴 [SYNC] Erro de rede (esperado se offline):', errorMessage);
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing, isOnline, refreshCount]);

  useEffect(() => {
    loadInitialData();
  }, []);

  // Configurar listener para mudanças de status de conexão
  useEffect(() => {
    setOnStatusChange((newStatus: boolean) => {
      if (!newStatus) {
        // Conexão caiu
        console.log('📵 Conexão perdida - modo offline ativado');
        showToast.warning('Modo offline', 'Registros serão salvos na fila');
      } else {
        // Conexão restaurada - SINCRONIZAR IMEDIATAMENTE
        console.log('🌐 Conexão restaurada - iniciando sincronização automática...');
        
        // Verificar se há registros pendentes antes de sincronizar
        supabaseDataService.getRegistrosPendentesFromLocal().then((registros) => {
          if (registros.length > 0) {
            console.log(`🔄 ${registros.length} registro(s) pendente(s) encontrado(s) - iniciando sincronização...`);
            // Aguardar um pouco para garantir que a conexão está estável
            setTimeout(() => {
              if (!syncing) {
                syncData().catch(error => {
                  console.error('❌ Erro na sincronização automática ao voltar online:', error);
                });
              }
            }, 1500); // Reduzido para 1.5s para ser mais rápido
          } else {
            console.log('📭 Nenhum registro pendente para sincronizar');
          }
        }).catch(error => {
          console.error('❌ Erro ao verificar registros pendentes:', error);
          // Tentar sincronizar mesmo assim
          setTimeout(() => {
            if (!syncing) {
              syncData().catch(err => {
                console.error('❌ Erro na sincronização automática:', err);
              });
            }
          }, 1500);
        });
      }
    });
  }, [setOnStatusChange, syncing, syncData]);

  // Sincronização automática quando voltar online
  useEffect(() => {
    if (isOnline && !syncing) {
      // Verificar se há registros pendentes
      supabaseDataService.getRegistrosPendentesFromLocal().then((registros) => {
        if (registros.length > 0) {
          console.log(`🔄 [AUTO SYNC] ${registros.length} registro(s) pendente(s) - iniciando sincronização automática...`);
          // Aguardar um pouco para garantir que a conexão está estável
          setTimeout(() => {
            if (!syncing && isOnline) {
              syncData().catch(error => {
                console.error('❌ Erro na sincronização automática:', error);
              });
            }
          }, 2000);
        }
      }).catch(error => {
        console.error('❌ Erro ao verificar registros pendentes:', error);
      });
    }
  }, [isOnline, syncing, syncData]);

  // Sincronização automática periódica da fila offline (igual ao backupcont)
  useEffect(() => {
    // Limpar intervalo anterior se existir
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    // Iniciar sincronização automática a cada 5 segundos quando online
    if (isOnline) {
      console.log('🔄 Iniciando sincronização automática da fila offline (a cada 5s)');
      
      syncIntervalRef.current = setInterval(async () => {
        if (!syncing && isOnline) {
          try {
            // Verificar conectividade real antes de processar
            const reallyOnline = await offlineSyncService.isOnline();
            if (!reallyOnline) {
              console.log('📴 Sem conexão real - pulando processamento da fila');
              return;
            }

            const queue = await supabaseDataService.getRegistrosPendentesFromLocal();
            const pendingItems = queue.filter((item: any) => !item.status_sincronizacao || item.status_sincronizacao === 'pending');
            
            if (pendingItems.length > 0) {
              console.log(`🔄 Processamento automático: ${pendingItems.length} itens pendentes`);
              // Processar assincronamente sem bloquear
              syncData().catch(error => {
                console.error('❌ Erro no processamento automático:', error);
              });
            }
          } catch (error) {
            console.error('❌ Erro ao verificar fila offline:', error);
          }
        }
      }, 5000); // A cada 5 segundos
    }

    // Cleanup: limpar intervalo quando componente desmontar ou quando ficar offline
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [isOnline, syncing]);

  useEffect(() => {
    // Verificar se precisa de instrumento obrigatório (apenas Músico)
    // Organista e Candidato(a) não precisam de instrumento obrigatório, mas podem ter
    const selectedCargoObj = cargos.find(c => c.id === selectedCargo);
    const cargoNome = selectedCargoObj?.nome || '';
    const precisaInstrumento = cargoNome === 'Músico'; // Apenas Músico requer instrumento obrigatório
    
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
        (supabaseDataService as any).getInstrumentosFromLocal(),
      ]);

      console.log('📊 Dados carregados:', {
        comuns: comunsData.length,
        cargos: cargosData.length,
        instrumentos: instrumentosData.length,
      });

      // Debug detalhado dos cargos
      console.log('🔍 Debug cargos:', {
        quantidade: cargosData.length,
        cargos: cargosData.map((c: Cargo) => ({ id: c.id, nome: c.nome, is_musical: c.is_musical })),
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

  // Função para pull-to-refresh (otimizada com useCallback)
  const onRefresh = useCallback(async () => {
    if (refreshing || syncing) return;
    
    try {
      setRefreshing(true);
      console.log('🔄 Pull-to-refresh: recarregando dados...');
      
      // Mostrar feedback visual imediato
      if (Platform.OS !== 'web') {
        showToast.info('Atualizando...', 'Recarregando dados');
      }
      
      // Recarregar dados iniciais
      await loadInitialData();
      
      // Sincronizar se estiver online
      if (isOnline) {
        await syncData();
      }
      
      // Atualizar contador
      await refreshCount();
      
      // Feedback de sucesso
      if (Platform.OS !== 'web') {
        showToast.success('Atualizado!', 'Dados recarregados com sucesso');
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar:', error);
      showToast.error('Erro', 'Não foi possível atualizar os dados');
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, syncing, isOnline, syncData, refreshCount]);

  const loadPessoas = async () => {
    try {
      console.log('📚 Carregando pessoas:', { 
        selectedComum, 
        selectedCargo, 
        selectedInstrumento,
        showInstrumento,
      });
      
      const pessoasData = await (supabaseDataService as any).getPessoasFromLocal(
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
    // Validar campos obrigatórios (permitir nome manual para candidatos também)
    if (!selectedComum || !selectedCargo) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios');
      return;
    }
    
    // Validar nome: pode ser selecionado da lista OU digitado manualmente
    if (!selectedPessoa || selectedPessoa.trim() === '') {
      Alert.alert('Erro', 'Selecione um nome da lista ou digite manualmente');
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

    // 🚨 CORREÇÃO CRÍTICA: Verificar offline PRIMEIRO, antes de qualquer outra coisa
    // Seguindo EXATAMENTE a lógica do BACKUPCONT - usar navigator.onLine diretamente
    // Esta é a verificação mais confiável e funciona tanto na web quanto no mobile
    let isOfflineNow = false;
    
    // 🚨 CRÍTICO iOS: No iOS, sempre verificar múltiplas fontes e ser mais conservador
    if (Platform.OS === 'ios') {
      // iOS: Verificar hook primeiro, depois navigator
      isOfflineNow = !isOnline;
      
      // Se navigator.onLine existir e for false, confiar nele
      if (typeof navigator !== 'undefined' && 'onLine' in navigator && navigator.onLine === false) {
        isOfflineNow = true;
      }
      
      // Se houver qualquer dúvida, assumir offline para garantir salvamento na fila
      if (!isOnline) {
        isOfflineNow = true;
      }
    } else if (Platform.OS === 'android') {
      // Android: Verificar hook primeiro
      isOfflineNow = !isOnline;
      
      // Se navigator.onLine existir e for false, confiar nele
      if (typeof navigator !== 'undefined' && 'onLine' in navigator && navigator.onLine === false) {
        isOfflineNow = true;
      }
    } else if (Platform.OS === 'web') {
      // Web: Usar navigator.onLine diretamente
      isOfflineNow = typeof navigator !== 'undefined' ? !navigator.onLine : !isOnline;
    } else {
      // Outras plataformas: usar hook
      isOfflineNow = !isOnline;
    }
    
    // Se estiver offline, salvar IMEDIATAMENTE na fila (como BACKUPCONT)
    if (isOfflineNow) {
      console.log('📴 [OFFLINE MODE] OFFLINE DETECTADO - Salvando diretamente na fila (sem tentar enviar)');
      try {
        console.log('📴 Offline detectado - adicionando à fila imediatamente');
        
        // Preparar registro para salvar na fila
        const localEnsaio = await localStorageService.getLocalEnsaio();
        
        // Usar nome do usuário ao invés do ID
        let nomeCompletoUsuario = user.nome;
        if (!nomeCompletoUsuario || nomeCompletoUsuario.trim() === '') {
          const emailSemDominio = user.email?.split('@')[0] || '';
          nomeCompletoUsuario = emailSemDominio.replace(/[._]/g, ' ').trim();
        }
        const nomeUsuario = formatRegistradoPor(nomeCompletoUsuario || user.id);
        
        // Buscar classe da organista do banco de dados se for Organista
        let classeOrganistaDB: string | undefined = undefined;
        if (isOrganista && !isNomeManual) {
          const pessoaSelecionada = pessoas.find(p => p.id === selectedPessoa);
          if (pessoaSelecionada && pessoaSelecionada.classe_organista) {
            classeOrganistaDB = pessoaSelecionada.classe_organista;
          } else {
            classeOrganistaDB = 'OFICIALIZADA';
          }
        }

        // Para Candidatos: buscar instrumento da pessoa selecionada
        let instrumentoCandidato: string | null = null;
        if (isCandidato && !isNomeManual) {
          const pessoaSelecionada = pessoas.find(p => p.id === selectedPessoa);
          if (pessoaSelecionada && pessoaSelecionada.instrumento_id) {
            instrumentoCandidato = pessoaSelecionada.instrumento_id;
          }
        }

        const pessoaIdFinal = isNomeManual ? `manual_${selectedPessoa}` : selectedPessoa;

        const registro: RegistroPresenca = {
          pessoa_id: pessoaIdFinal,
          comum_id: selectedComum,
          cargo_id: selectedCargo,
          instrumento_id: isCandidato 
            ? instrumentoCandidato 
            : (showInstrumento && selectedInstrumento) 
              ? selectedInstrumento 
              : null,
          classe_organista: classeOrganistaDB,
          local_ensaio: localEnsaio || 'Não definido',
          data_hora_registro: getCurrentDateTimeISO(),
          usuario_responsavel: nomeUsuario,
          status_sincronizacao: 'pending',
        };

        // 🚨 VERIFICAÇÃO CRÍTICA: Verificar duplicata ANTES de salvar
        const registrosPendentes = await supabaseDataService.getRegistrosPendentesFromLocal();
        const dataRegistro = new Date(registro.data_hora_registro);
        const dataRegistroStr = dataRegistro.toISOString().split('T')[0];
        
        // Verificação rápida de duplicata
        const isDuplicata = registrosPendentes.some(r => {
          const rData = new Date(r.data_hora_registro);
          const rDataStr = rData.toISOString().split('T')[0];
          return (
            r.pessoa_id === registro.pessoa_id &&
            r.comum_id === registro.comum_id &&
            r.cargo_id === registro.cargo_id &&
            rDataStr === dataRegistroStr &&
            r.status_sincronizacao === 'pending'
          );
        });
        
        if (isDuplicata) {
          console.warn('🚨 Registro duplicado - já está na fila');
          showToast.warning('Atenção', 'Este registro já está na fila');
          setLoading(false);
          return;
        }
        
        // Salvar apenas se não for duplicata
        await supabaseDataService.saveRegistroToLocal(registro);
        await refreshCount();
        showToast.success('Salvo offline', 'Será enviado quando voltar online');
        
        // Limpar formulário
        setSelectedComum('');
        setSelectedCargo('');
        setSelectedInstrumento('');
        setSelectedPessoa('');
        setIsNomeManual(false);
        
        setLoading(false);
        return;
      } catch (error) {
        console.error('❌ Erro crítico ao processar envio offline:', error);
        showToast.error('Erro', 'Erro ao salvar registro offline. Tente novamente.');
        setLoading(false);
        return;
      }
    }

    // Preparar registro antes do try para estar disponível no catch
    const localEnsaio = await localStorageService.getLocalEnsaio();
    
    // Usar nome do usuário ao invés do ID
      // Extrair apenas primeiro e último nome do usuário
      // Se não tem nome no perfil, extrair do email (remover @gmail.com e formatar)
      let nomeCompletoUsuario = user.nome;
      if (!nomeCompletoUsuario || nomeCompletoUsuario.trim() === '') {
        // Extrair nome do email: ricardograngeiro@gmail.com -> ricardograngeiro
        // A função formatRegistradoPor vai separar e formatar corretamente
        const emailSemDominio = user.email?.split('@')[0] || '';
        // Substituir pontos e underscores por espaços, mas manter minúsculas para a função separar
        nomeCompletoUsuario = emailSemDominio.replace(/[._]/g, ' ').trim();
      }
      // formatRegistradoPor extrai primeiro e último nome, separa palavras juntas e converte para maiúscula
      const nomeUsuario = formatRegistradoPor(nomeCompletoUsuario || user.id);
    
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

    // Para Candidatos: buscar instrumento da pessoa selecionada (está na tabela candidatos)
    let instrumentoCandidato: string | null = null;
    if (isCandidato && !isNomeManual) {
      const pessoaSelecionada = pessoas.find(p => p.id === selectedPessoa);
      if (pessoaSelecionada && pessoaSelecionada.instrumento_id) {
        instrumentoCandidato = pessoaSelecionada.instrumento_id;
      }
    }

    // Se nome é manual, usar o texto digitado como pessoa_id temporário
    // O sistema precisa lidar com isso nos serviços de sincronização
    const pessoaIdFinal = isNomeManual ? `manual_${selectedPessoa}` : selectedPessoa;

    const registro: RegistroPresenca = {
      pessoa_id: pessoaIdFinal,
      comum_id: selectedComum,
      cargo_id: selectedCargo,
      // Incluir instrumento:
      // - Para Músico: usar selectedInstrumento (selecionado pelo usuário)
      // - Para Candidato: usar instrumento da pessoa (buscado da tabela)
      // - Para Organista: null (sempre toca órgão, será normalizado depois)
      instrumento_id: isCandidato 
        ? instrumentoCandidato 
        : (showInstrumento && selectedInstrumento) 
          ? selectedInstrumento 
          : null,
      classe_organista: classeOrganistaDB, // Buscar do banco de dados (ou null se manual)
      local_ensaio: localEnsaio || 'Não definido',
      data_hora_registro: getCurrentDateTimeISO(),
      usuario_responsavel: nomeUsuario, // Usar nome ao invés de ID
      status_sincronizacao: 'pending',
    };

    try {
      console.log('🚀 Iniciando envio de registro...', {
        isOnline,
        pessoa_id: registro.pessoa_id,
        comum_id: registro.comum_id,
        cargo_id: registro.cargo_id,
      });
      
      const result = await (offlineSyncService as any).createRegistro(registro);
      
      console.log('📋 Resultado do createRegistro:', result);
      console.log('🔍 Verificando duplicata - success:', result.success, 'error:', result.error);
      
      // Atualizar contador da fila após criar registro (sempre, mesmo se houver erro)
      try {
        await refreshCount();
        console.log('✅ Contador da fila atualizado');
      } catch (countError) {
        console.warn('⚠️ Erro ao atualizar contador da fila:', countError);
        // Não bloquear o fluxo por erro no contador
      }

      if (result.success) {
        // Verificar se foi enviado com sucesso ou salvo localmente
        const foiEnviado = !result.error || !result.error.includes('salvo localmente');
        
        if (foiEnviado) {
          // Registro foi enviado com sucesso (Google Sheets)
          showToast.success('Registro enviado!', 'Registro salvo com sucesso!');
          // Limpar formulário
          setSelectedComum('');
          setSelectedCargo('');
          setSelectedInstrumento('');
          setSelectedPessoa('');
          setIsNomeManual(false);
        } else {
          // Registro foi salvo localmente (sem internet ou erro de conectividade)
          if (!isOnline) {
            // Modo offline - mostrar mensagem informativa
            showToast.info('Salvo offline', 'Enviado quando voltar online');
          } else {
            // Online mas erro de conectividade - mostrar mensagem informativa
            showToast.warning(
              'Salvo localmente',
              'Será enviado automaticamente quando possível'
            );
          }
          // Não limpar formulário se foi salvo localmente (usuário pode querer tentar novamente)
        }
      } else {
        // Verificar se é erro de duplicata
        const isDuplicateError = result.error && (
          result.error.includes('DUPLICATA') ||
          result.error.includes('duplicat') ||
          result.error.includes('já foi cadastrado hoje') ||
          result.error.includes('DUPLICATA_BLOQUEADA')
        );
        
        console.log('❌ Registro falhou - Verificando se é duplicata...');
        console.log('   Error:', result.error);
        console.log('   É duplicata?:', isDuplicateError);
        
        if (isDuplicateError) {
          console.log('✅ DUPLICATA DETECTADA! Processando erro:', result.error);
          
          let nome = '';
          let comumNome = '';
          let dataFormatada = '';
          let horarioFormatado = '';

          // SEMPRE usar dados do formulário primeiro (mais confiável)
          nome = isNomeManual
            ? selectedPessoa
            : pessoas.find(p => p.id === selectedPessoa)?.nome_completo || 
              (pessoas.find(p => p.id === selectedPessoa)?.nome + ' ' + 
               (pessoas.find(p => p.id === selectedPessoa)?.sobrenome || '')).trim() || '';
          comumNome = comuns.find(c => c.id === selectedComum)?.nome || '';
          
          // Tentar extrair informações do formato DUPLICATA:nome|comum|data|horario
          if (result.error && result.error.includes('DUPLICATA:')) {
            const errorPart = result.error.split('DUPLICATA:')[1]?.trim() || '';
            
            // Tentar formato com pipes primeiro: DUPLICATA:nome|comum|data|horario
            if (errorPart.includes('|')) {
              const parts = errorPart.split('|');
              if (parts.length >= 4) {
                nome = parts[0].trim() || nome;
                comumNome = parts[1].trim() || comumNome;
                dataFormatada = parts[2].trim();
                horarioFormatado = parts[3].trim();
            }
            } else {
              // Tentar formato sem pipes: DUPLICATA: nome comum data/horario
              // Exemplo: "DUPLICATA: ADRIANO MOTA BR-22-1739 - JARDIM MIRANDA 21/11/2025/13:18"
              const match = errorPart.match(/^(.+?)\s+(BR-\d+-\d+\s*-\s*.+?)\s+(\d{2}\/\d{2}\/\d{4})\/(\d{2}:\d{2})/);
              if (match) {
                nome = match[1].trim() || nome;
                comumNome = match[2].trim() || comumNome;
                dataFormatada = match[3].trim();
                horarioFormatado = match[4].trim();
              } else {
                // Tentar extrair apenas data e horário do formato: ... data/horario
                const dataHorarioMatch = errorPart.match(/(\d{2}\/\d{2}\/\d{4})\/(\d{2}:\d{2})/);
                if (dataHorarioMatch) {
                  dataFormatada = dataHorarioMatch[1];
                  horarioFormatado = dataHorarioMatch[2];
                }
              }
            }
          }

          // Se não conseguiu extrair data/horário, usar data/horário atual
          if (!dataFormatada || !horarioFormatado) {
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
          
          console.log('📋 Informações extraídas:', { nome, comumNome, dataFormatada, horarioFormatado });

          // Mostrar alerta de duplicata usando SweetAlert2 (igual ao backupcont)
          if (Platform.OS === 'web') {
            // Usar SweetAlert2 na web (igual ao backupcont)
            const getSwal = (): any => {
              if (typeof window === 'undefined') return null;
              try {
                const sweetalert2 = require('sweetalert2');
                return sweetalert2.default || sweetalert2;
              } catch (error) {
                console.warn('SweetAlert2 não disponível:', error);
                return null;
              }
            };

            const Swal = getSwal();
            if (Swal) {
              const mensagem = `
                <div style="text-align: left;">
                  <strong>${nome || 'Nome não encontrado'}</strong> de <strong>${comumNome || 'Comum não encontrada'}</strong><br>
                  já foi cadastrado hoje!<br><br>
                  <small>Data: ${dataFormatada}</small><br>
                  <small>Horário: ${horarioFormatado}</small>
                </div>
              `;

              const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                typeof navigator !== 'undefined' ? navigator.userAgent : ''
              );

              // Garantir que FontAwesome está carregado
              if (typeof window !== 'undefined' && typeof document !== 'undefined') {
                const linkId = 'fontawesome-css';
                if (!document.getElementById(linkId)) {
                  const link = document.createElement('link');
                  link.id = linkId;
                  link.rel = 'stylesheet';
                  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
                  document.head.appendChild(link);
                }
              }

              Swal.fire({
                title: '⚠️ Cadastro Duplicado!',
                html: mensagem,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-check"></i> Cadastrar Mesmo Assim',
                cancelButtonText: '<i class="fa-solid fa-times"></i> Cancelar',
                confirmButtonColor: '#f59e0b',
                cancelButtonColor: '#6b7280',
                reverseButtons: true,
                width: isMobileDevice ? '90%' : '500px',
                padding: isMobileDevice ? '1.5rem' : '2rem',
                position: 'center',
                backdrop: true,
                allowOutsideClick: false,
                allowEscapeKey: true,
                focusConfirm: false,
                focusCancel: false,
                buttonsStyling: true,
                customClass: {
                  confirmButton: 'swal-duplicity-confirm',
                  cancelButton: 'swal-duplicity-cancel',
                },
                didOpen: () => {
                  // Ajustar estilos dos botões para mostrar ícones corretamente
                  setTimeout(() => {
                    const confirmBtn = document.querySelector('.swal2-confirm, .swal-duplicity-confirm') as HTMLElement;
                    const cancelBtn = document.querySelector('.swal2-cancel, .swal-duplicity-cancel') as HTMLElement;
                    
                    if (confirmBtn) {
                      const icon = confirmBtn.querySelector('i');
                      if (icon) {
                        icon.style.marginRight = '0.5rem';
                      }
                    }
                    if (cancelBtn) {
                      const icon = cancelBtn.querySelector('i');
                      if (icon) {
                        icon.style.marginRight = '0.5rem';
                      }
                    }
                  }, 100);
                },
              }).then(async (result: any) => {
                if (!result.isConfirmed) {
                  // Usuário cancelou - recarrega a página
                  console.log('❌ Usuário cancelou registro por duplicata - recarregando página...');
                  setTimeout(() => {
                    window.location.reload();
                  }, 100);
                  return;
                }

                // Usuário confirmou - criar registro mesmo assim
                console.log('✅ Usuário confirmou registro mesmo com duplicata');
                  setLoading(true);
                  try {
                    const registroForce = { ...registro };
                  const resultForce = await (offlineSyncService as any).createRegistro(registroForce, true);
                  
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
                    // Recarregar página após sucesso
                    setTimeout(() => {
                      window.location.reload();
                    }, 1000);
                    } else {
                    showToast.error(
                      'Erro',
                      resultForce.error || 'Erro ao cadastrar registro duplicado'
                    );
                    // Recarregar página mesmo em caso de erro
                    setTimeout(() => {
                      window.location.reload();
                    }, 2000);
                    }
                  } catch (error) {
                  showToast.error('Erro', 'Ocorreu um erro ao processar o registro duplicado');
                    console.error('Erro ao criar registro duplicado:', error);
                  // Recarregar página mesmo em caso de erro
                  setTimeout(() => {
                    window.location.reload();
                  }, 2000);
                  } finally {
                    setLoading(false);
                  }
              });
            } else {
              // Fallback: usar modal React Native
              setDuplicateInfo({
                nome: nome || 'Nome não encontrado',
                comum: comumNome || 'Comum não encontrada',
                data: dataFormatada,
                horario: horarioFormatado,
              });
              setPendingRegistro(registro);
              setDuplicateModalVisible(true);
            }
          } else {
            // Mobile: usar modal React Native
            setDuplicateInfo({
              nome: nome || 'Nome não encontrado',
              comum: comumNome || 'Comum não encontrada',
              data: dataFormatada,
              horario: horarioFormatado,
            });
            setPendingRegistro(registro);
            setDuplicateModalVisible(true);
          }
        } else {
          // Erro não é duplicata - mostrar erro
          const errorMessage = result.error || 'Erro ao enviar registro';
          console.error('❌ Erro ao enviar registro:', errorMessage);
          showToast.error('Erro', errorMessage);
          
          // Se for erro de salvamento local, tentar salvar manualmente como fallback
          if (errorMessage.includes('salvar') || errorMessage.includes('localmente')) {
            console.log('🔄 Tentando salvar registro manualmente como fallback...');
            try {
              await supabaseDataService.saveRegistroToLocal({
                ...registro,
                status_sincronizacao: 'pending',
              });
              console.log('✅ Registro salvo manualmente com sucesso');
              showToast.info('Salvo offline', 'Registro salvo na fila local');
              await refreshCount();
            } catch (fallbackError) {
              console.error('❌ Erro ao salvar registro manualmente:', fallbackError);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ ERRO CRÍTICO ao processar registro:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Tentar salvar localmente como último recurso
      try {
        console.log('🔄 Tentando salvar registro localmente como último recurso...');
        await supabaseDataService.saveRegistroToLocal({
          ...registro,
          status_sincronizacao: 'pending',
        });
        console.log('✅ Registro salvo localmente como último recurso');
        showToast.warning('Salvo offline', 'Registro salvo na fila. Será enviado quando possível.');
        await refreshCount();
      } catch (fallbackError) {
        console.error('❌ ERRO CRÍTICO: Não foi possível salvar registro nem localmente:', fallbackError);
        Alert.alert(
          'Erro Crítico',
          'Não foi possível salvar o registro. Tente novamente ou verifique sua conexão.'
        );
      }
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
      const nomeExibicao = (supabaseDataService as any).extrairNomeComum(c.nome);
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

  // Função para salvar novo registro do modal (pessoas de outras cidades)
  const handleSaveNewRegistration = async (data: {
    comum: string;
    cidade: string;
    cargo: string;
    instrumento?: string;
    classe?: string;
    nome: string;
  }) => {
    if (!user) {
      Alert.alert('Erro', 'Usuário não autenticado');
      return;
    }

    try {
      const localEnsaio = await localStorageService.getLocalEnsaio();
      // Extrair apenas primeiro e último nome do usuário
      // Se não tem nome no perfil, extrair do email (remover @gmail.com e formatar)
      let nomeCompletoUsuario = user.nome;
      if (!nomeCompletoUsuario || nomeCompletoUsuario.trim() === '') {
        // Extrair nome do email: ricardograngeiro@gmail.com -> ricardograngeiro
        // A função formatRegistradoPor vai separar e formatar corretamente
        const emailSemDominio = user.email?.split('@')[0] || '';
        // Substituir pontos e underscores por espaços, mas manter minúsculas para a função separar
        nomeCompletoUsuario = emailSemDominio.replace(/[._]/g, ' ').trim();
      }
      // formatRegistradoPor extrai primeiro e último nome, separa palavras juntas e converte para maiúscula
      const nomeUsuario = formatRegistradoPor(nomeCompletoUsuario || user.id);

      // Buscar cargo e instrumento para obter nomes
      const cargoObj = cargos.find(c => c.id === data.cargo);
      const instrumentoObj = data.instrumento ? instrumentos.find(i => i.id === data.instrumento) : null;

      if (!cargoObj) {
        Alert.alert('Erro', 'Cargo não encontrado');
        return;
      }

      // Criar registro com dados do modal
      const registro: RegistroPresenca & { cidade?: string } = {
        pessoa_id: `manual_${data.nome.toUpperCase()}`,
        comum_id: `external_${data.comum.toUpperCase()}_${Date.now()}`, // ID temporário
        cargo_id: data.cargo,
        instrumento_id: data.instrumento || undefined,
        classe_organista: data.classe || undefined,
        local_ensaio: localEnsaio || 'Não definido',
        data_hora_registro: getCurrentDateTimeISO(),
        usuario_responsavel: nomeUsuario,
        status_sincronizacao: 'pending',
        cidade: data.cidade, // Adicionar cidade ao registro
      };

      // Preparar dados para Google Sheets
      const naipeInstrumento = instrumentoObj
        ? getNaipeByInstrumento(instrumentoObj.nome).toUpperCase()
        : data.classe
          ? 'TECLADO'
          : '';

      const instrumentoFinal = instrumentoObj?.nome.toUpperCase() || (data.classe ? 'ÓRGÃO' : '');

      const sheetRow = {
        UUID: registro.id || generateExternalUUID(),
        'NOME COMPLETO': data.nome.trim().toUpperCase(),
        COMUM: data.comum.toUpperCase(),
        CIDADE: data.cidade.toUpperCase(),
        CARGO: cargoObj.nome.toUpperCase(),
        INSTRUMENTO: instrumentoFinal,
        NAIPE_INSTRUMENTO: naipeInstrumento,
        CLASSE_ORGANISTA: (data.classe || '').toUpperCase(),
        LOCAL_ENSAIO: (localEnsaio || 'Não definido').toUpperCase(),
        DATA_ENSAIO: new Date().toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        REGISTRADO_POR: nomeUsuario, // Já está em maiúscula da função formatRegistradoPor
        ANOTACOES: 'Cadastro fora da Regional',
      };

      // 🚨 CORREÇÃO CRÍTICA: Usar o mesmo fluxo do handleSubmit
      // Enviar primeiro para Google Sheets, depois para Supabase
      const result = await (offlineSyncService as any).createRegistro(registro);
      
      if (result.success) {
        showToast.success(
          'Registro salvo!',
          'Registro de visita salvo com sucesso.'
        );

        // Recarregar página após salvar (igual ao backupcont)
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } else {
        // Verificar se é erro de duplicata
        if (result.error && result.error.includes('DUPLICATA:')) {
          // Tratar duplicata (mesmo fluxo do handleSubmit)
          const errorPart = result.error.split('DUPLICATA:')[1]?.trim() || '';
          const parts = errorPart.split('|');
          if (parts.length >= 4) {
            const nome = parts[0].trim();
            const comumNome = parts[1].trim();
            const dataFormatada = parts[2].trim();
            const horarioFormatado = parts[3].trim();
            
            Alert.alert(
              '⚠️ Cadastro Duplicado!',
              `${nome} de ${comumNome} já foi cadastrado hoje!\n\nData: ${dataFormatada}\nHorário: ${horarioFormatado}`,
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Cadastrar Mesmo Assim',
                  onPress: async () => {
                    // Forçar criação mesmo com duplicata
                    const resultForce = await (offlineSyncService as any).createRegistro(registro, true);
                    if (resultForce.success) {
                      showToast.success('Registro enviado!', 'Registro duplicado cadastrado com sucesso!');
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        setTimeout(() => {
                          window.location.reload();
                        }, 1000);
                      }
                    } else {
                      showToast.error('Erro', resultForce.error || 'Erro ao cadastrar registro duplicado');
                    }
                  },
                },
              ]
            );
          } else {
            showToast.error('Erro', 'Registro duplicado detectado');
          }
        } else {
          throw new Error(result.error || 'Erro ao enviar registro');
        }
      }
    } catch (error) {
      console.error('Erro ao salvar novo registro:', error);
      showToast.error('Erro', 'Erro ao salvar registro. Tente novamente.');
    }
  };

  return (
    <View style={styles.container}>
      <AppHeader onEditRegistrosPress={handleEditRegistros} />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        enabled={Platform.OS === 'ios'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          collapsable={false}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={Platform.OS !== 'web'}
          scrollEnabled={true}
          bounces={Platform.OS === 'ios'}
          alwaysBounceVertical={Platform.OS === 'ios'}
          scrollEventThrottle={16}
          removeClippedSubviews={Platform.OS === 'android'}
          style={Platform.OS === 'web' 
            ? { 
                position: 'relative' as const, 
                overflow: 'visible' as const,
                zIndex: 1,
              } 
            : { 
                flex: 1,
                backgroundColor: theme.colors.background,
              }}
          refreshControl={
            Platform.OS !== 'web' ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.colors.primary]}
                tintColor={theme.colors.primary}
                progressViewOffset={Platform.OS === 'android' ? 20 : 0}
                title="Puxe para atualizar"
                titleColor={theme.colors.textSecondary}
                progressBackgroundColor={theme.colors.surface}
              />
            ) : undefined
          }
        >
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Registro de Participante</Text>
              <Text style={styles.cardSubtitle}>
                Preencha os campos abaixo para registrar a presença
              </Text>
            </View>
            <View style={styles.cardBody}>
              <View style={Platform.OS === 'web' ? { 
                position: 'relative' as const, 
                zIndex: 999999, 
                overflow: 'visible' as const,
                // @ts-ignore
                isolation: 'isolate',
              } : {}}>
                <AutocompleteField
                  label="COMUM CONGREGAÇÃO *"
                  value={selectedComum}
                  options={comunsOptions}
                  onSelect={option => {
                    setSelectedComum(String(option.value));
                    setSelectedPessoa('');
                    setIsNomeManual(false);
                  }}
                  placeholder="Selecione a comum..."
                />
                <TouchableOpacity
                  onPress={(e) => {
                    e.preventDefault?.();
                    e.stopPropagation?.();
                    console.log('🔘 Botão "+ Novo registro" clicado');
                    setNewRegistrationModalVisible(true);
                  }}
                  style={styles.newRegistrationLink}
                  activeOpacity={0.7}
                >
                  <Text style={styles.newRegistrationLinkText}>+ Novo registro</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.field, Platform.OS === 'web' ? { position: 'relative' as const, zIndex: 1002, overflow: 'visible' as const } : {}]}>
                <Text style={styles.label}>CARGO/MINISTÉRIO *</Text>
                {Platform.OS === 'web' ? (
                  <select
                    style={{
                      ...styles.selectWeb,
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%23999' d='M5 7L1 3h8z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 10px center',
                      backgroundSize: '10px 10px',
                      paddingRight: '35px',
                    } as any}
                    value={selectedCargo}
                    onChange={(e) => {
                      setSelectedCargo(e.target.value);
                      setSelectedInstrumento('');
                      setSelectedPessoa('');
                      setIsNomeManual(false);
                    }}
                    required
                  >
                    <option value="">Selecione o cargo...</option>
                    {cargos.map(cargo => (
                      <option key={cargo.id} value={cargo.id}>
                        {cargo.nome}
                      </option>
                    ))}
                  </select>
                ) : (
                  <SimpleSelectField
                    label=""
                    value={selectedCargo}
                    options={cargosOptions}
                    onSelect={option => {
                      setSelectedCargo(String(option.value));
                      setSelectedInstrumento('');
                      setSelectedPessoa('');
                      setIsNomeManual(false);
                    }}
                    placeholder="Selecione o cargo..."
                  />
                )}
              </View>

                  {showInstrumento && (
                    <View style={[styles.field, Platform.OS === 'web' ? { position: 'relative' as const, zIndex: 1004, overflow: 'visible' as const } : {}]}>
                      <Text style={styles.label}>INSTRUMENTO (APENAS PARA CARGOS MUSICAIS) *</Text>
                      {Platform.OS === 'web' ? (
                        <select
                          style={{
                            ...styles.selectWeb,
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%23999' d='M5 7L1 3h8z'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 10px center',
                            backgroundSize: '10px 10px',
                            paddingRight: '35px',
                          } as any}
                          value={selectedInstrumento}
                          onChange={(e) => {
                            setSelectedInstrumento(e.target.value);
                            setSelectedPessoa('');
                            setIsNomeManual(false);
                          }}
                          required
                        >
                          <option value="">Selecione o instrumento...</option>
                          {instrumentos.map(instrumento => (
                            <option key={instrumento.id} value={instrumento.id}>
                              {instrumento.nome}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <SimpleSelectField
                          label=""
                          value={selectedInstrumento}
                          options={instrumentosOptions}
                          onSelect={(option: any) => {
                            setSelectedInstrumento(String(option.value));
                            setSelectedPessoa('');
                            setIsNomeManual(false);
                          }}
                          placeholder="Selecione o instrumento..."
                        />
                      )}
                    </View>
                  )}

          <View style={Platform.OS === 'web' ? { 
            position: 'relative' as const, 
            zIndex: 1, 
            overflow: 'visible' as const,
            // @ts-ignore
            isolation: 'isolate',
          } : {}}>
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
                placeholder="Selecione o nome..."
          />
          </View>

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

      {/* Modal de Duplicata */}
      {duplicateInfo && (
        <DuplicateModal
          visible={duplicateModalVisible}
          nome={duplicateInfo.nome}
          comum={duplicateInfo.comum}
          data={duplicateInfo.data}
          horario={duplicateInfo.horario}
          onCancel={() => {
            setDuplicateModalVisible(false);
            setDuplicateInfo(null);
            setPendingRegistro(null);
            // Recarregar página após cancelar (igual ao backupcont)
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              setTimeout(() => {
                window.location.reload();
              }, 100);
            }
          }}
          onConfirm={async () => {
            if (!pendingRegistro) {
              setDuplicateModalVisible(false);
              setDuplicateInfo(null);
              return;
            }

            setDuplicateModalVisible(false);
            setLoading(true);
            try {
              // Forçar duplicata - criar registro mesmo assim
              // Pular verificação de duplicata (skipDuplicateCheck = true)
              const registroForce = { ...pendingRegistro };
              const resultForce = await (offlineSyncService as any).createRegistro(registroForce, true);
              
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
                // Recarregar página após sucesso (igual ao backupcont)
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  setTimeout(() => {
                    window.location.reload();
                  }, 1000);
                } else {
                  // Mobile: limpar formulário
                  setSelectedComum('');
                  setSelectedCargo('');
                  setSelectedInstrumento('');
                  setSelectedPessoa('');
                  setIsNomeManual(false);
                }
              } else {
                // Se ainda for duplicata, mostrar modal novamente
                if (
                  resultForce.error &&
                  (resultForce.error.includes('DUPLICATA:') ||
                    resultForce.error.includes('DUPLICATA_BLOQUEADA'))
                ) {
                  // Extrair informações novamente
                  let nome = duplicateInfo.nome;
                  let comumNome = duplicateInfo.comum;
                  let dataFormatada = duplicateInfo.data;
                  let horarioFormatado = duplicateInfo.horario;

                  if (resultForce.error.includes('DUPLICATA:')) {
                    const parts = resultForce.error.split('DUPLICATA:')[1]?.split('|');
                    if (parts && parts.length >= 4) {
                      nome = parts[0];
                      comumNome = parts[1];
                      dataFormatada = parts[2];
                      horarioFormatado = parts[3];
                    }
                  }

                  setDuplicateInfo({
                    nome,
                    comum: comumNome,
                    data: dataFormatada,
                    horario: horarioFormatado,
                  });
                  setDuplicateModalVisible(true);
                } else {
                  showToast.error(
                    'Erro',
                    resultForce.error || 'Erro ao cadastrar registro duplicado'
                  );
                  // Recarregar página mesmo em caso de erro
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    setTimeout(() => {
                      window.location.reload();
                    }, 2000);
                  }
                }
              }
            } catch (error) {
              showToast.error('Erro', 'Ocorreu um erro ao processar o registro duplicado');
              console.error('Erro ao criar registro duplicado:', error);
              // Recarregar página mesmo em caso de erro
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                setTimeout(() => {
                  window.location.reload();
                }, 2000);
              }
            } finally {
              setLoading(false);
              setDuplicateInfo(null);
              setPendingRegistro(null);
            }
          }}
        />
      )}

      {/* Modal de Novo Registro (para visitas de outras cidades) */}
      <NewRegistrationModal
        visible={newRegistrationModalVisible}
        cargos={cargos}
        instrumentos={instrumentos}
        onClose={() => setNewRegistrationModalVisible(false)}
        onSave={handleSaveNewRegistration}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    ...(Platform.OS !== 'web' ? {
      height: '100%',
    } : {}),
  },
  keyboardView: {
    flex: 1,
    ...(Platform.OS !== 'web' ? {
      height: '100%',
    } : {}),
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
    ...(Platform.OS === 'web'
      ? {
          overflow: 'visible' as const,
          minHeight: '100%',
        }
      : {
          overflow: 'visible' as const,
          paddingHorizontal: theme.spacing.md, // Menos padding horizontal no mobile
          paddingTop: theme.spacing.md, // Menos padding top no mobile
        }),
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
    shadowOpacity: Platform.OS === 'web' ? 0.1 : 0.15,
    shadowRadius: Platform.OS === 'web' ? 4 : 6,
    elevation: Platform.OS === 'web' ? 3 : 4,
    ...(Platform.OS === 'web'
      ? {
          position: 'relative' as const,
          zIndex: 1,
          overflow: 'visible' as const,
        }
      : {
          marginHorizontal: theme.spacing.xs, // Margem horizontal no mobile
          overflow: 'visible' as const,
        }),
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
    ...(Platform.OS === 'web'
      ? {
          overflow: 'visible' as const,
          position: 'relative' as const,
          zIndex: 1,
        }
      : {
          overflow: 'visible' as const,
          padding: theme.spacing.md, // Menos padding no mobile
        }),
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
    ...(Platform.OS !== 'web' ? {
      width: '100%', // Botão full width no mobile
      maxWidth: 400, // Mas com limite máximo
      paddingVertical: theme.spacing.md, // Mais padding vertical no mobile
      minHeight: 50, // Altura mínima maior no mobile para melhor toque
    } : {}),
  },
  footer: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    ...(Platform.OS === 'web'
      ? {
          position: 'relative' as const,
          zIndex: 0,
          // @ts-ignore
          isolation: 'isolate',
        }
      : {
          elevation: 0,
        }),
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
  newRegistrationLink: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web'
      ? {
          cursor: 'pointer',
          zIndex: 10,
        }
      : {
          zIndex: 10,
        }),
  },
  newRegistrationLinkText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web'
      ? {
          cursor: 'pointer',
          userSelect: 'none',
        }
      : {}),
  },
  field: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  selectWeb: {
    width: '100%',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    paddingRight: '35px',
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    minHeight: 48,
    outline: 'none',
    cursor: 'pointer',
    ...(Platform.OS === 'web' ? {
      WebkitAppearance: 'none' as any,
      MozAppearance: 'none' as any,
      appearance: 'none' as any,
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%23999' d='M5 7L1 3h8z'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 10px center',
      backgroundSize: '10px 10px',
    } : {}),
  } as any,
});
