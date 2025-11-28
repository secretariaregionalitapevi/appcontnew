import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { theme } from '../theme';
import { SimpleSelectField } from './SimpleSelectField';
import { PrimaryButton } from './PrimaryButton';
import { showToast } from '../utils/toast';

interface NewRegistrationModalProps {
  visible: boolean;
  cargos: Array<{ id: string; nome: string }>;
  instrumentos: Array<{ id: string; nome: string }>;
  onClose: () => void;
  onSave: (data: {
    comum: string;
    cidade: string;
    cargo: string;
    instrumento?: string;
    classe?: string;
    nome: string;
  }) => Promise<void>;
}

export const NewRegistrationModal: React.FC<NewRegistrationModalProps> = ({
  visible,
  cargos,
  instrumentos,
  onClose,
  onSave,
}) => {
  const [comum, setComum] = useState('');
  const [cidade, setCidade] = useState('');
  const [selectedCargo, setSelectedCargo] = useState('');
  const [selectedInstrumento, setSelectedInstrumento] = useState('');
  const [selectedClasse, setSelectedClasse] = useState('');
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Debug: Log quando visible muda
  useEffect(() => {
    console.log('🔍 NewRegistrationModal visible:', visible);
    if (Platform.OS === 'web' && visible) {
      console.log('🌐 Modal deve estar visível no web');
    }
  }, [visible]);

  // Resetar campos quando modal fecha
  useEffect(() => {
    if (!visible) {
      setComum('');
      setCidade('');
      setSelectedCargo('');
      setSelectedInstrumento('');
      setSelectedClasse('');
      setNome('');
      setErrors({});
    }
  }, [visible]);

  // Verificar se precisa mostrar campo de instrumento
  // Como agora usamos o nome do cargo diretamente como valor, não precisamos buscar no array de cargos
  const cargoNome = selectedCargo || '';
  const isMusico = cargoNome.toLowerCase().includes('músico');
  const isOrganista = cargoNome === 'Organista';
  const showInstrumento = isMusico && !isOrganista;
  
  // 🚨 CARGOS QUE DEVEM SER OFICIALIZADAS AUTOMATICAMENTE (sem mostrar campo)
  const cargosOficializadaAutomatica = [
    'Instrutora',
    'Secretária da Música',
    'Examinadora'
  ];
  const isCargoOficializadaAutomatica = cargosOficializadaAutomatica.includes(cargoNome);
  
  // Mostrar campo de classe APENAS para Organista (outros cargos são oficializados automaticamente)
  const showClasse = isOrganista && !isCargoOficializadaAutomatica;

  // Opções de classe
  const classesOptions = [
    { id: 'Ensaio', label: 'Ensaio', value: 'Ensaio' },
    { id: 'Meia-Hora', label: 'Meia-Hora', value: 'Meia-Hora' },
    { id: 'RDJM', label: 'RDJM', value: 'RDJM' },
    { id: 'Culto a Noite', label: 'Culto a Noite', value: 'Culto a Noite' },
    { id: 'Oficializada', label: 'Oficializada', value: 'Oficializada' },
  ];

  // 🚨 CARGOS ESPECÍFICOS PARA O MODAL DE NOVO REGISTRO
  // Usar lista completa de cargos do window ou lista padrão
  const cargosCompletosModal = React.useMemo(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && (window as any).CARGOS_COMPLETOS_MODAL) {
      return (window as any).CARGOS_COMPLETOS_MODAL;
    }
    return [
      'Músico', 'Organista', 'Instrutor', 'Instrutora', 'Examinadora',
      'Encarregado Local', 'Encarregado Regional', 'Secretário da Música', 'Secretária da Música',
      'Irmandade', 'Ancião', 'Diácono', 'Cooperador do Ofício', 'Cooperador de Jovens',
      'Porteiro (a)', 'Bombeiro (a)', 'Médico (a)', 'Enfermeiro (a)'
    ];
  }, []);

  // Opções de cargos - usar lista completa do modal
  const cargosOptions = cargosCompletosModal.map((cargoNome: string, index: number) => ({
    id: `cargo_modal_${index}`,
    label: cargoNome,
    value: cargoNome, // Usar o nome do cargo como valor
  }));

  // Opções de instrumentos
  const instrumentosOptions = instrumentos.map(i => ({
    id: i.id,
    label: i.nome,
    value: i.id,
  }));

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (!comum.trim()) {
      newErrors.comum = 'Comum é obrigatória';
    }
    if (!cidade.trim()) {
      newErrors.cidade = 'Cidade é obrigatória';
    }
    if (!selectedCargo) {
      newErrors.cargo = 'Cargo é obrigatório';
    }
    if (showInstrumento && !selectedInstrumento) {
      newErrors.instrumento = 'Instrumento é obrigatório para músicos';
    }
    // Validar classe apenas se o campo estiver visível (Organista)
    // Cargos como Instrutora, Secretária da Música e Examinadora são oficializados automaticamente
    if (showClasse && !selectedClasse) {
      newErrors.classe = 'Classe é obrigatória';
    }
    if (!nome.trim()) {
      newErrors.nome = 'Nome completo é obrigatório';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    console.log('🔘 [MODAL] Botão Salvar clicado');
    
    if (!validate()) {
      console.warn('⚠️ [MODAL] Validação falhou');
      return;
    }

    console.log('✅ [MODAL] Validação passou, iniciando salvamento...');
    console.log('📋 [MODAL] Dados do formulário:', {
      comum: comum.trim(),
      cidade: cidade.trim(),
      cargo: selectedCargo,
      instrumento: showInstrumento ? selectedInstrumento : undefined,
      classe: showClasse ? selectedClasse : undefined,
      nome: nome.trim(),
    });

    setLoading(true);
    try {
      // 🚨 DETERMINAR CLASSE FINAL
      let classeFinal: string | undefined = undefined;
      
      // Se for cargo que deve ser oficializado automaticamente, forçar "Oficializada"
      if (isCargoOficializadaAutomatica) {
        classeFinal = 'Oficializada';
      } else if (showClasse) {
        // Se o campo de classe está visível (Organista), usar o valor selecionado ou padrão
        classeFinal = selectedClasse || 'Oficializada';
      }

      console.log('📤 [MODAL] Chamando onSave com dados:', {
        comum: comum.trim(),
        cidade: cidade.trim(),
        cargo: selectedCargo,
        instrumento: showInstrumento ? selectedInstrumento : undefined,
        classe: classeFinal,
        nome: nome.trim(),
      });

      // 🚨 CRÍTICO: Aguardar resultado do onSave e tratar erros
      try {
        console.log('🔄 [MODAL] Chamando onSave...');
        await onSave({
          comum: comum.trim(),
          cidade: cidade.trim(),
          cargo: selectedCargo,
          instrumento: showInstrumento ? selectedInstrumento : undefined,
          classe: classeFinal,
          nome: nome.trim(),
        });

        console.log('✅ [MODAL] onSave concluído - aguardando confirmação de salvamento...');
        // 🚨 CRÍTICO: Não mostrar sucesso imediatamente - o handleSaveNewRegistration já mostra o toast
        // Apenas limpar campos e fechar modal

        // Limpar campos após salvar (só se não houver erro)
        setComum('');
        setCidade('');
        setSelectedCargo('');
        setSelectedInstrumento('');
        setSelectedClasse('');
        setNome('');
        setErrors({});
        
        // 🚨 CORREÇÃO: NÃO mostrar toast aqui - o handleSaveNewRegistration já mostra
        // Apenas fechar modal após um delay para permitir que o toast do handleSaveNewRegistration apareça
        console.log('✅ [MODAL] Campos limpos, aguardando para fechar modal...');
        
        // Fechar modal após sucesso (aguardar um pouco para toast aparecer)
        setTimeout(() => {
          console.log('🚪 [MODAL] Fechando modal após sucesso');
          onClose();
        }, 2500); // Aumentado para dar tempo do toast do handleSaveNewRegistration aparecer
      } catch (error) {
        // Erro já foi tratado no handleSaveNewRegistration
        // Não fechar modal se houver erro
        console.error('❌ [MODAL] Erro ao salvar (catch interno):', error);
        throw error; // Re-lançar para o catch externo tratar
      }
    } catch (error) {
      console.error('❌ [MODAL] Erro ao salvar novo registro (catch externo):', error);
      // Não fazer nada aqui - o erro já foi tratado no handleSaveNewRegistration
      // Mas garantir que o loading seja desativado
    } finally {
      setLoading(false);
    }
  };

  // Debug: Log quando visible muda
  useEffect(() => {
    console.log('🔍 NewRegistrationModal visible:', visible);
    if (Platform.OS === 'web' && visible) {
      console.log('🌐 Modal deve estar visível no web');
    }
  }, [visible]);

  // No web, renderizar diretamente sem Modal se necessário
  if (Platform.OS === 'web' && !visible) {
    return null;
  }

  // Debug: Log quando vai renderizar
  if (Platform.OS === 'web' && visible) {
    console.log('🌐 Renderizando modal no web diretamente (sem Modal component)');
  }

  const modalContent = (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : Platform.OS === 'android' ? 20 : 0}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View style={styles.header}>
              <FontAwesome5
                name="laptop"
                size={Platform.OS === 'web' ? 48 : 40}
                color="#e2e3e3"
                style={styles.headerIcon}
              />
              <Text style={styles.title}>Novo Registro</Text>
              <Text style={styles.subtitle}>Use o formulário para o novo registro</Text>
            </View>

            {/* Body */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {/* Comum */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  Comum <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, errors.comum ? styles.inputError : undefined]}
                  value={comum}
                  onChangeText={(text) => {
                    setComum(text);
                    if (errors.comum) {
                      setErrors({ ...errors, comum: '' });
                    }
                  }}
                  placeholder="Ex.: Água Rasa"
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {errors.comum && <Text style={styles.errorText}>{errors.comum}</Text>}
              </View>

              {/* Cidade */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  Cidade <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, errors.cidade ? styles.inputError : undefined]}
                  value={cidade}
                  onChangeText={(text) => {
                    setCidade(text);
                    if (errors.cidade) {
                      setErrors({ ...errors, cidade: '' });
                    }
                  }}
                  placeholder="Ex.: São Paulo"
                  placeholderTextColor={theme.colors.textSecondary}
                />
                {errors.cidade && <Text style={styles.errorText}>{errors.cidade}</Text>}
              </View>

              {/* Cargo */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  Cargo/Ministério <Text style={styles.required}>*</Text>
                </Text>
                <View style={Platform.OS === 'web' ? { 
                  position: 'relative' as const, 
                  zIndex: 9999999, 
                  overflow: 'visible' as const,
                  // @ts-ignore
                  isolation: 'isolate',
                } : {}}>
                  <SimpleSelectField
                    value={selectedCargo}
                    options={cargosOptions}
                    onSelect={(option) => {
                      const novoCargo = String(option.value);
                      setSelectedCargo(novoCargo);
                      setSelectedInstrumento('');
                      
                      // 🚨 FORÇAR "Oficializada" automaticamente para cargos específicos
                      const cargosOficializadaAutomatica = [
                        'Instrutora',
                        'Secretária da Música',
                        'Examinadora'
                      ];
                      if (cargosOficializadaAutomatica.includes(novoCargo)) {
                        setSelectedClasse('Oficializada');
                      } else {
                        setSelectedClasse('');
                      }
                      
                      if (errors.cargo) {
                        setErrors({ ...errors, cargo: '' });
                      }
                    }}
                    placeholder="Selecione um cargo..."
                    error={errors.cargo}
                  />
                </View>
              </View>

              {/* Instrumento (se Músico) */}
              {showInstrumento && (
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Instrumento <Text style={styles.required}>*</Text>
                  </Text>
                  <SimpleSelectField
                    value={selectedInstrumento}
                    options={instrumentosOptions}
                    onSelect={(option) => {
                      setSelectedInstrumento(String(option.value));
                      if (errors.instrumento) {
                        setErrors({ ...errors, instrumento: '' });
                      }
                    }}
                    placeholder="Selecione um instrumento..."
                    error={errors.instrumento}
                  />
                </View>
              )}

              {/* Classe (se Organista/Examinadora/Instrutora) */}
              {showClasse && (
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Classe da Organista <Text style={styles.required}>*</Text>
                  </Text>
                  <SimpleSelectField
                    value={selectedClasse}
                    options={classesOptions}
                    onSelect={(option) => {
                      setSelectedClasse(String(option.value));
                      if (errors.classe) {
                        setErrors({ ...errors, classe: '' });
                      }
                    }}
                    placeholder="Selecione a classe..."
                    error={errors.classe}
                  />
                </View>
              )}

              {/* Nome */}
              <View style={Platform.OS === 'web' ? { 
                position: 'relative' as const, 
                zIndex: 0, 
                overflow: 'visible' as const,
                // @ts-ignore
                isolation: 'isolate',
              } : {}}>
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Nome completo <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      errors.nome ? styles.inputError : undefined,
                    ]}
                    value={nome}
                    onChangeText={(text) => {
                      setNome(text);
                      if (errors.nome) {
                        setErrors({ ...errors, nome: '' });
                      }
                    }}
                    placeholder="Ex.: João da Silva"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                  {errors.nome && <Text style={styles.errorText}>{errors.nome}</Text>}
                </View>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <PrimaryButton
                title="Salvar"
                onPress={handleSave}
                loading={loading}
                style={styles.saveButton}
                icon="save"
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
  );

  // 🚨 CRÍTICO: NUNCA renderizar modal quando offline (não faz sentido)
  // Verificar se está online antes de renderizar
  const isOnline = typeof navigator !== 'undefined' && navigator.onLine !== false;
  if (!isOnline) {
    console.log('🚨 [NewRegistrationModal] Offline detectado - NÃO renderizando modal');
    return null;
  }
  
  if (Platform.OS === 'web') {
    // No web, renderizar diretamente usando View fixo para evitar problemas com Modal
    return visible && isOnline ? (
      <View
        style={{
          position: 'fixed' as any,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999999,
          // @ts-ignore
          pointerEvents: 'auto',
          // @ts-ignore
          isolation: 'isolate',
        }}
      >
        {modalContent}
      </View>
    ) : null;
  }

  return (
    <Modal
      visible={visible && isOnline}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {modalContent}
    </Modal>
  );
};

const styles = StyleSheet.create({
  // @ts-ignore - container usa propriedades CSS específicas do web
  container: {
    flex: 1,
    ...(Platform.OS === 'web' ? {
      // @ts-ignore - Propriedades CSS apenas para web
      zIndex: 999999,
      // @ts-ignore
      position: 'fixed',
      // @ts-ignore
      top: 0,
      // @ts-ignore
      left: 0,
      // @ts-ignore
      right: 0,
      // @ts-ignore
      bottom: 0,
      // @ts-ignore
      isolation: 'isolate',
    } : {
      zIndex: 999999,
    }),
  },
  // @ts-ignore - overlay usa propriedades CSS específicas do web
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    zIndex: 999999,
    ...(Platform.OS === 'web'
      ? {
          backdropFilter: 'blur(4px)',
          // @ts-ignore - Propriedades CSS apenas para web
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          // @ts-ignore - Propriedades CSS apenas para web
          opacity: 1,
          // @ts-ignore - Propriedades CSS apenas para web
          zIndex: 999999,
          // @ts-ignore
          position: 'fixed',
          // @ts-ignore
          top: 0,
          // @ts-ignore
          left: 0,
          // @ts-ignore
          right: 0,
          // @ts-ignore
          bottom: 0,
          // @ts-ignore
          width: '100%',
          // @ts-ignore
          height: '100%',
          // @ts-ignore
          isolation: 'isolate',
        }
      : {}),
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 500 : '95%',
    maxHeight: Platform.OS === 'web' ? '90%' : '85%',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? {
          // @ts-ignore - Propriedades CSS apenas para web
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          // @ts-ignore - Propriedades CSS apenas para web
          zIndex: 999999,
          // @ts-ignore - Propriedades CSS apenas para web
          opacity: 1,
          // @ts-ignore
          zIndex: 1000000,
          // @ts-ignore
          position: 'relative',
          // @ts-ignore
          isolation: 'isolate',
        }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 24,
          elevation: 999999,
        }),
  },
  header: {
    alignItems: 'center',
    padding: Platform.OS === 'web' ? theme.spacing.xl : theme.spacing.lg,
    paddingTop: Platform.OS === 'web' ? theme.spacing.xl : theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? {
      // @ts-ignore - Propriedades CSS apenas para web
      backgroundColor: '#ffffff',
      // @ts-ignore - Propriedades CSS apenas para web
      opacity: 1,
    } : {}),
  },
  headerIcon: {
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? {
      // @ts-ignore - Propriedades CSS apenas para web
      backgroundColor: '#ffffff',
      // @ts-ignore - Propriedades CSS apenas para web
      opacity: 1,
    } : {}),
  },
  bodyContent: {
    padding: Platform.OS === 'web' ? theme.spacing.lg : theme.spacing.md,
    paddingBottom: Platform.OS === 'web' ? theme.spacing.lg : theme.spacing.xl,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? {
      // @ts-ignore - Propriedades CSS apenas para web
      backgroundColor: '#ffffff',
      // @ts-ignore - Propriedades CSS apenas para web
      opacity: 1,
    } : {}),
  },
  field: {
    marginBottom: Platform.OS === 'web' ? theme.spacing.md : theme.spacing.sm,
    ...(Platform.OS === 'web' ? {
      // @ts-ignore
      position: 'relative',
      // @ts-ignore
      zIndex: 1,
    } : {}),
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  required: {
    color: theme.colors.error,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: Platform.OS === 'web' ? theme.spacing.md : theme.spacing.sm,
    paddingVertical: Platform.OS === 'web' ? theme.spacing.md : theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: '#ffffff',
    minHeight: Platform.OS === 'web' ? 44 : 48,
    ...(Platform.OS === 'web'
      ? {
          // @ts-ignore - Propriedades CSS apenas para web
          outlineStyle: 'none',
          outlineWidth: 0,
          // @ts-ignore - Propriedades CSS apenas para web
          backgroundColor: '#ffffff',
          // @ts-ignore - Propriedades CSS apenas para web
          opacity: 1,
        }
      : {}),
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? theme.spacing.md : theme.spacing.sm,
    paddingVertical: Platform.OS === 'web' ? theme.spacing.md : theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: '#ffffff',
    gap: theme.spacing.sm,
    ...(Platform.OS === 'web' ? {
      // @ts-ignore - Propriedades CSS apenas para web
      backgroundColor: '#ffffff',
      // @ts-ignore - Propriedades CSS apenas para web
      opacity: 1,
    } : {}),
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Platform.OS === 'web' ? theme.spacing.md : theme.spacing.lg, // Mais padding no mobile
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: '#dee2e6',
    minHeight: Platform.OS === 'web' ? 44 : 52, // Aumentado
    flex: 1,
  },
  cancelButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: '#495057',
    marginLeft: 6,
  },
  saveButton: {
    flex: Platform.OS === 'web' ? 0 : 1,
    minWidth: Platform.OS === 'web' ? 200 : 0,
    maxWidth: Platform.OS === 'web' ? 300 : '100%',
    ...(Platform.OS === 'web' ? {
      // @ts-ignore - Propriedades CSS apenas para web
      flexShrink: 0,
    } : {}),
  },
});

