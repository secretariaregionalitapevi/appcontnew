import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { AppHeader } from '../components/AppHeader';
import { AutocompleteField } from '../components/AutocompleteField';
import { theme } from '../theme';
import { supabaseDataService } from '../services/supabaseDataService';
import { googleSheetsService } from '../services/googleSheetsService';
import { showToast } from '../utils/toast';
import { useNavigation } from '@react-navigation/native';
import { useAuthContext } from '../context/AuthContext';
import { localStorageService } from '../services/localStorageService';
import { PrimaryButton } from '../components/PrimaryButton';
import { Cargo } from '../types/models';

interface RegistroPresencaSupabase {
  uuid?: string;
  nome_completo?: string;
  comum?: string;
  cidade?: string;
  cargo?: string;
  instrumento?: string;
  naipe_instrumento?: string;
  classe_organista?: string;
  local_ensaio?: string;
  data_ensaio?: string;
  registrado_por?: string;
  anotacoes?: string;
  created_at?: string;
  updated_at?: string;
}

export const EditRegistrosScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuthContext();
  const [registros, setRegistros] = useState<RegistroPresencaSupabase[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [localEnsaio, setLocalEnsaio] = useState<string>('');
  const [editingRegistro, setEditingRegistro] = useState<RegistroPresencaSupabase | null>(null);
  const [editFormVisible, setEditFormVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const modalTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Estados do formulário de edição
  const [editNome, setEditNome] = useState('');
  const [editComum, setEditComum] = useState('');
  const [editCidade, setEditCidade] = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [editInstrumento, setEditInstrumento] = useState('');
  const [editNaipe, setEditNaipe] = useState('');
  const [editClasse, setEditClasse] = useState('');
  const [editDataEnsaio, setEditDataEnsaio] = useState('');
  const [editAnotacoes, setEditAnotacoes] = useState('');

  // Verificar se usuário é master
  const userRole = user?.role ? String(user.role).toLowerCase().trim() : 'user';
  const isMaster = userRole === 'master' || userRole === 'admin';

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'CCB | Editar Registros';
    }
  }, []);

  useEffect(() => {
    loadLocalEnsaio();
    loadCargos();
  }, []);

  const loadCargos = async () => {
    try {
      const cargosData = await supabaseDataService.getCargosFromLocal();
      setCargos(cargosData);
      console.log('✅ Cargos carregados:', cargosData.length);
    } catch (error) {
      console.error('❌ Erro ao carregar cargos:', error);
    }
  };

  // Criar opções de cargos para o AutocompleteField
  const cargosOptions = useMemo(() => {
    return cargos.map(c => ({
      id: c.id,
      label: c.nome,
      value: c.id,
    }));
  }, [cargos]);

  useEffect(() => {
    console.log('🔍 editFormVisible mudou para:', editFormVisible);
    if (editFormVisible) {
      console.log('✅ Modal deve estar visível agora');
      console.log('📝 editingRegistro:', editingRegistro);
    }
  }, [editFormVisible, editingRegistro]);

  // Removido: não carregar registros automaticamente, só quando houver busca

  const loadLocalEnsaio = async () => {
    try {
      const localId = await localStorageService.getLocalEnsaio();
      if (localId) {
        // Converter ID para nome
        const locais: { id: string; nome: string }[] = [
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
        showToast.error('Erro', 'Local de ensaio não definido');
      }
    } catch (error) {
      console.error('Erro ao carregar local de ensaio:', error);
      showToast.error('Erro', 'Erro ao carregar local de ensaio');
    }
  };

  const performSearch = async (term: string) => {
    if (!localEnsaio || !isMaster) {
      return;
    }

    try {
      setLoading(true);
      const results = await supabaseDataService.fetchRegistrosFromSupabase(
        localEnsaio,
        term || undefined
      );
      setRegistros(results);
    } catch (error) {
      console.error('Erro ao buscar registros:', error);
      showToast.error('Erro', 'Não foi possível buscar os registros');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchTerm(text);
    
    // Se o campo estiver vazio, limpar resultados
    if (!text.trim()) {
      setRegistros([]);
      return;
    }

    // Debounce da busca - só buscar se houver texto
    const timeoutId = setTimeout(() => {
      if (text.trim()) {
        performSearch(text.trim());
      } else {
        setRegistros([]);
      }
    }, 300);
    
    return () => clearTimeout(timeoutId);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await performSearch(searchTerm);
    setRefreshing(false);
  };

  const handleEdit = (registro: RegistroPresencaSupabase) => {
    console.log('📝 handleEdit chamado para registro:', registro);
    
    // Verificar permissão
    if (!isMaster) {
      console.log('❌ Usuário não é master');
      showToast.error('Sem permissão', 'Apenas usuários master podem editar registros');
      return;
    }

    // Verificar se o registro pertence ao local do usuário
    const registroLocal = registro.local_ensaio || '';
    if (registroLocal.toLowerCase().trim() !== localEnsaio.toLowerCase().trim()) {
      console.log('❌ Registro não pertence ao local do usuário:', {
        registroLocal,
        localEnsaio,
      });
      showToast.error(
        'Sem permissão',
        `Registro pertence a "${registroLocal}" mas você é de "${localEnsaio}"`
      );
      return;
    }

    console.log('✅ Permissões OK, abrindo modal de edição');

    // Preencher formulário de edição primeiro
    setEditingRegistro(registro);
    setEditNome(registro.nome_completo || '');
    setEditComum(registro.comum || '');
    setEditCidade(registro.cidade || '');
    
    // Encontrar o ID do cargo pelo nome
    const cargoEncontrado = cargos.find(c => c.nome.toUpperCase() === (registro.cargo || '').toUpperCase());
    setEditCargo(cargoEncontrado?.id || '');
    
    setEditInstrumento(registro.instrumento || '');
    setEditNaipe(registro.naipe_instrumento || '');
    setEditClasse(registro.classe_organista || '');
    setEditDataEnsaio(registro.data_ensaio || '');
    setEditAnotacoes(registro.anotacoes || '');
    
    // Abrir modal usando setTimeout para garantir que o estado seja atualizado
    setTimeout(() => {
      console.log('📝 Definindo editFormVisible como true');
      setEditFormVisible(true);
    }, 100);
  };

  const handleSaveEdit = async () => {
    if (!editingRegistro || !editingRegistro.uuid) {
      console.error('❌ Registro inválido para edição');
      showToast.error('Erro', 'Registro inválido');
      return;
    }

    // Validação básica
    if (!editNome.trim() || !editComum.trim() || !editCargo.trim()) {
      console.warn('⚠️ Campos obrigatórios não preenchidos');
      showToast.error('Campos obrigatórios', 'Nome, Comum e Cargo são obrigatórios');
      return;
    }

    try {
      setSaving(true);
      console.log('💾 Iniciando salvamento de edição...', { uuid: editingRegistro.uuid });

      // Encontrar o nome do cargo pelo ID
      const cargoSelecionado = cargos.find(c => c.id === editCargo);
      const cargoNome = cargoSelecionado?.nome || editCargo;

      const updateData = {
        nome_completo: editNome.trim().toUpperCase(),
        comum: editComum.trim().toUpperCase(),
        cidade: editCidade.trim().toUpperCase(),
        cargo: cargoNome.toUpperCase(),
        instrumento: editInstrumento.trim() ? editInstrumento.trim().toUpperCase() : undefined,
        naipe_instrumento: editNaipe.trim() ? editNaipe.trim().toUpperCase() : undefined,
        classe_organista: editClasse.trim() ? editClasse.trim().toUpperCase() : undefined,
        data_ensaio: editDataEnsaio || undefined,
        anotacoes: editAnotacoes.trim() ? editAnotacoes.trim().toUpperCase() : undefined,
      };

      console.log('📤 Dados para atualização:', updateData);

      // Atualizar no Google Sheets PRIMEIRO (como backupcont)
      console.log('📤 ETAPA 1: Atualizando no Google Sheets...');
      const sheetsResult = await googleSheetsService.updateRegistroInSheet(editingRegistro.uuid, updateData);
      
      if (!sheetsResult.success) {
        console.warn('⚠️ Google Sheets falhou, mas continuando com Supabase:', sheetsResult.error);
      } else {
        console.log('✅ Google Sheets atualizado com sucesso');
      }

      // Atualizar no Supabase
      console.log('📤 ETAPA 2: Atualizando no Supabase...');
      const supabaseResult = await supabaseDataService.updateRegistroInSupabase(
        editingRegistro.uuid,
        updateData
      );

      if (supabaseResult.success) {
        console.log('✅ Supabase atualizado com sucesso');
        // Fechar modal primeiro
        setEditFormVisible(false);
        setEditingRegistro(null);
        
        // Mostrar toast de sucesso
        showToast.success('Sucesso!', 'Registro atualizado com sucesso!');
        
        // Recarregar lista após pequeno delay para garantir que o toast apareça
        setTimeout(async () => {
          await performSearch(searchTerm);
        }, 500);
      } else {
        // Se Supabase falhou mas Google Sheets OK, ainda considerar sucesso
        if (sheetsResult.success) {
          console.log('✅ Google Sheets OK, Supabase falhou mas continuando...');
          setEditFormVisible(false);
          setEditingRegistro(null);
          showToast.success('Sucesso!', 'Registro atualizado no Google Sheets');
          setTimeout(async () => {
            await performSearch(searchTerm);
          }, 500);
        } else {
          throw new Error(supabaseResult.error || 'Erro ao atualizar registro');
        }
      }
    } catch (error) {
      console.error('❌ Erro ao salvar edição:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      showToast.error('Erro', `Falha ao salvar: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
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

  // Se não é master, mostrar mensagem
  if (!isMaster) {
    return (
      <View style={styles.container}>
        <AppHeader />
        <View style={styles.noPermissionContainer}>
          <FontAwesome5 name="lock" size={48} color={theme.colors.error} />
          <Text style={styles.noPermissionText}>Acesso Restrito</Text>
          <Text style={styles.noPermissionSubtext}>
            Apenas usuários master podem editar registros
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              console.log('🔙 Botão voltar clicado (sem permissão)');
              navigation.goBack();
            }}
          >
            <FontAwesome5 name="arrow-left" size={16} color={theme.colors.primary} />
            <Text style={styles.backButtonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Se não tem local definido
  if (!localEnsaio) {
    return (
      <View style={styles.container}>
        <AppHeader />
        <View style={styles.noPermissionContainer}>
          <FontAwesome5 name="map-marker-alt" size={48} color={theme.colors.warning} />
          <Text style={styles.noPermissionText}>Local não definido</Text>
          <Text style={styles.noPermissionSubtext}>
            Defina o local de ensaio para visualizar os registros
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              console.log('🔙 Botão voltar clicado (sem local)');
              navigation.goBack();
            }}
          >
            <FontAwesome5 name="arrow-left" size={16} color={theme.colors.primary} />
            <Text style={styles.backButtonText}>Voltar</Text>
          </TouchableOpacity>
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
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS !== 'web'}
        scrollEnabled={true}
        bounces={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={true}
        alwaysBounceVertical={false}
        scrollEventThrottle={16}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
              <View style={styles.headerTop}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    console.log('🔙 Botão voltar clicado');
                    try {
                      if (navigation.canGoBack()) {
                        navigation.goBack();
                      } else {
                        navigation.navigate('Register' as never);
                      }
                    } catch (error) {
                      console.error('Erro ao voltar:', error);
                      navigation.navigate('Register' as never);
                    }
                  }}
                >
                  <FontAwesome5 name="arrow-left" size={16} color={theme.colors.primary} />
                  <Text style={styles.backButtonText}>Voltar</Text>
                </TouchableOpacity>
              </View>
            <Text style={styles.cardTitle}>Editar Registros</Text>
            <Text style={styles.cardSubtitle}>
                Local: {localEnsaio} • {registros.length} registro(s) encontrado(s)
            </Text>
          </View>

            {/* Campo de busca */}
            <View style={styles.searchContainer}>
              <FontAwesome5 name="search" size={16} color={theme.colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Pesquisar por nome, cargo ou comum..."
                placeholderTextColor={theme.colors.textSecondary}
                value={searchTerm}
                onChangeText={handleSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Buscando registros...</Text>
              </View>
            ) : registros.length === 0 ? (
            <View style={styles.emptyContainer}>
                <FontAwesome5 name="search" size={48} color={theme.colors.textSecondary} />
                <Text style={styles.emptyText}>
                  {searchTerm ? 'Nenhum registro encontrado' : 'Nenhuma pesquisa realizada'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {searchTerm
                    ? 'Tente refinar sua pesquisa'
                    : 'Digite no campo acima para buscar registros'}
                </Text>
            </View>
          ) : (
            <View style={styles.registrosList}>
                {registros.map((registro, index) => (
                  <View key={registro.uuid || index} style={styles.registroItem}>
                  <View style={styles.registroContent}>
                    <View style={styles.registroHeader}>
                        <Text style={styles.registroNome}>
                          {registro.nome_completo || 'Nome não informado'}
                        </Text>
                      <TouchableOpacity
                          style={styles.editButton}
                          onPress={() => {
                            console.log('🔘 Botão de editar clicado para:', registro.nome_completo);
                            handleEdit(registro);
                          }}
                          activeOpacity={0.7}
                      >
                          <FontAwesome5 name="edit" size={16} color={theme.colors.primary} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.registroDetails}>
                      <View style={styles.detailRow}>
                        <FontAwesome5 name="users" size={12} color={theme.colors.textSecondary} />
                          <Text style={styles.detailText}>{registro.comum || 'Não informado'}</Text>
                      </View>

                      <View style={styles.detailRow}>
                        <FontAwesome5
                          name="user"
                          size={12}
                          color={theme.colors.textSecondary}
                        />
                          <Text style={styles.detailText}>{registro.cargo || 'Não informado'}</Text>
                      </View>

                        {registro.instrumento && (
                        <View style={styles.detailRow}>
                          <FontAwesome5 name="music" size={12} color={theme.colors.textSecondary} />
                            <Text style={styles.detailText}>{registro.instrumento}</Text>
                          </View>
                        )}

                        {registro.classe_organista && (
                          <View style={styles.detailRow}>
                            <FontAwesome5 name="keyboard" size={12} color={theme.colors.textSecondary} />
                            <Text style={styles.detailText}>Classe: {registro.classe_organista}</Text>
                        </View>
                      )}

                      <View style={styles.detailRow}>
                        <FontAwesome5
                          name="map-marker-alt"
                          size={12}
                          color={theme.colors.textSecondary}
                        />
                          <Text style={styles.detailText}>{registro.local_ensaio || 'Não informado'}</Text>
                      </View>

                      <View style={styles.detailRow}>
                        <FontAwesome5 name="clock" size={12} color={theme.colors.textSecondary} />
                        <Text style={styles.detailText}>
                            {formatDate(registro.data_ensaio || registro.created_at || '')}
                        </Text>
                      </View>

                        {registro.anotacoes && (
                          <View style={styles.detailRow}>
                            <FontAwesome5 name="sticky-note" size={12} color={theme.colors.textSecondary} />
                            <Text style={styles.detailText}>{registro.anotacoes}</Text>
                          </View>
                        )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal de edição */}
      {editFormVisible && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            console.log('📝 Modal fechado via onRequestClose');
            setEditFormVisible(false);
          }}
          statusBarTranslucent={true}
        >
          <View style={styles.modalContainer}>
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => {
                console.log('📝 Overlay clicado, fechando modal');
                setEditFormVisible(false);
              }}
            />
            <View style={styles.modalContentWrapper}>
              <View style={{ flex: 1, width: '100%' }}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Editar Registro</Text>
                    <TouchableOpacity
                      style={styles.modalCloseButton}
                      onPress={() => {
                        console.log('📝 Botão fechar clicado');
                        setEditFormVisible(false);
                      }}
                    >
                      <FontAwesome5 name="times" size={20} color={theme.colors.text} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView 
                    style={styles.modalBody} 
                    contentContainerStyle={{ flexGrow: 1 }}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled={Platform.OS !== 'web'}
                    scrollEnabled={true}
                    bounces={Platform.OS === 'ios'}
                    showsVerticalScrollIndicator={true}
                    alwaysBounceVertical={false}
                    scrollEventThrottle={16}
                    removeClippedSubviews={Platform.OS === 'android'}
                  >
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Nome Completo *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editNome}
                    onChangeText={setEditNome}
                    placeholder="Nome completo"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Comum *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editComum}
                    onChangeText={setEditComum}
                    placeholder="Comum"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Cidade</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editCidade}
                    onChangeText={setEditCidade}
                    placeholder="Cidade"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Cargo/Ministério *</Text>
                  <AutocompleteField
                    value={editCargo}
                    options={cargosOptions}
                    onSelect={option => {
                      setEditCargo(String(option.value));
                    }}
                    placeholder="Selecione o cargo..."
                    icon="user"
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Instrumento</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editInstrumento}
                    onChangeText={setEditInstrumento}
                    placeholder="Instrumento"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Naipe do Instrumento</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editNaipe}
                    onChangeText={setEditNaipe}
                    placeholder="Naipe"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Classe da Organista</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editClasse}
                    onChangeText={setEditClasse}
                    placeholder="Classe"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Data do Ensaio</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editDataEnsaio}
                    onChangeText={setEditDataEnsaio}
                    placeholder="Data do ensaio"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Anotações</Text>
                  <TextInput
                    style={[styles.formInput, styles.formTextArea]}
                    value={editAnotacoes}
                    onChangeText={setEditAnotacoes}
                    placeholder="Anotações"
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    saving && { opacity: 0.6 },
                  ]}
                  onPress={() => {
                    if (!saving) {
                      setEditFormVisible(false);
                    }
                  }}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                  <PrimaryButton
                    title="SALVAR ALTERAÇÕES"
                    onPress={handleSaveEdit}
                    loading={saving}
                    icon="save"
                    style={{ minHeight: 48 }}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
  headerTop: {
    marginBottom: theme.spacing.md,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    gap: theme.spacing.xs,
  },
  backButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.primary,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    paddingVertical: theme.spacing.sm,
  },
  loadingContainer: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.md,
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
    textAlign: 'center',
  },
  noPermissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  noPermissionText: {
    fontSize: theme.fontSize.xl,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  noPermissionSubtext: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
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
  editButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '20', // Fundo mais visível
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
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
    flex: 1,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? {
      position: 'fixed' as any,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
    } : {}),
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    ...(Platform.OS === 'web' ? {
      position: 'fixed' as any,
      zIndex: 99998,
    } : {}),
  },
  modalContentWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    zIndex: 99999,
    ...(Platform.OS === 'web' ? {
      position: 'relative' as const,
      zIndex: 99999,
    } : {}),
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 100000,
    ...(Platform.OS === 'web' ? {
      maxWidth: '800px' as any,
      maxHeight: '90%' as any,
      width: '90%',
      position: 'relative' as const,
      zIndex: 100000,
    } : {}),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modalCloseButton: {
    padding: theme.spacing.xs,
  },
  modalBody: {
    padding: theme.spacing.xl,
    maxHeight: 500,
    ...(Platform.OS === 'web' ? {
      maxHeight: '60vh' as any,
    } : {}),
  },
  formField: {
    marginBottom: theme.spacing.md,
  },
  formLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  formInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    minHeight: 44, // Altura uniforme para todos os campos
    ...(Platform.OS === 'web' ? { height: 44 } : {}), // Altura fixa no web
  },
  formTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: theme.spacing.sm, // Padding extra no topo para melhor alinhamento
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.md,
    ...(Platform.OS === 'web' ? {
      position: 'sticky' as any,
      bottom: 0,
    } : {}),
  },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    } : {
      elevation: 0,
    }),
  },
  cancelButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
