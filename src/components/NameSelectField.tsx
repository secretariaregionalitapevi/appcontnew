import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ViewStyle,
  Modal,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { theme } from '../theme';

const { DROPDOWN_FIELD_CONTAINER, DROPDOWN_FIELD_DROPDOWN } = theme.zIndex;

// Detectar se é mobile (apenas para apps nativos, não para web)
const isMobileDevice = (): boolean => {
  // IMPORTANTE: No web, SEMPRE retornar false para usar dropdown inline
  // Modal só deve ser usado em apps nativos (iOS/Android)
  if (Platform.OS === 'web') {
    return false; // Sempre usar dropdown inline no web
  }
  // Para apps nativos, verificar se é iOS ou Android
  return Platform.OS === 'ios' || Platform.OS === 'android';
};

interface SelectOption {
  id: string;
  label: string;
  value: unknown;
}

interface NameSelectFieldProps {
  label?: string;
  value?: string;
  options: SelectOption[];
  onSelect: (option: SelectOption | { id: 'manual'; label: string; value: string }) => void;
  placeholder?: string;
  error?: string;
  style?: ViewStyle;
  loading?: boolean;
}

const MANUAL_INPUT_OPTION_ID = '__MANUAL_INPUT__';

export const NameSelectField: React.FC<NameSelectFieldProps> = ({
  label,
  value,
  options,
  onSelect,
  placeholder = 'Digite para buscar...',
  error,
  style,
  loading = false,
}) => {
  // Iniciar sempre como select, não como manual
  const [isManualMode, setIsManualMode] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showList, setShowList] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Normalizar texto (remove acentos, converte para minúscula)
  const normalize = (text: string) => {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  // REMOVIDO: Conversão automática para modo manual
  // O campo sempre inicia como select normal
  // Só converte para modo manual quando o usuário clicar em "Adicionar novo nome manualmente"

  // Adicionar opção manual às opções filtradas
  const optionsWithManual = useMemo(() => {
    const manualOption: SelectOption = {
      id: MANUAL_INPUT_OPTION_ID,
      label: '✏️ Adicionar novo nome manualmente',
      value: MANUAL_INPUT_OPTION_ID,
    };
    return [...options, manualOption];
  }, [options]);

  // Filtrar opções baseado no texto digitado
  const filtered = useMemo(() => {
    if (isManualMode) {
      return [];
    }

    // Se não há opções, não mostrar dropdown (já está em modo manual automaticamente)
    if (!options || options.length === 0) {
      return []; // Não mostrar dropdown - modo manual será ativado automaticamente
    }

    // Verificar se já há um nome selecionado válido (que está na lista de opções)
    const hasValidSelection = value && options.some(opt => opt.id === value || opt.value === value);
    
    // Verificar se o valor atual é uma entrada manual (começa com "manual_")
    const isManualValue = value && typeof value === 'string' && value.startsWith('manual_');

    // Filtrar opções baseado no texto
    const query = normalize(searchText);
    const filteredOptions = options.filter(opt => {
      const labelNorm = normalize(opt.label);
      return labelNorm.includes(query);
    });

    // 🚨 CRÍTICO: Se há um nome selecionado válido da lista E o usuário não está editando
    // (ou seja, searchText corresponde ao nome selecionado), NÃO mostrar opção manual
    if (hasValidSelection && !isManualValue) {
      // Se o texto digitado corresponde ao nome selecionado, não mostrar manual
      const selectedOption = options.find(opt => opt.id === value || opt.value === value);
      if (selectedOption && normalize(selectedOption.label) === normalize(searchText)) {
        // Usuário está vendo o nome selecionado, não mostrar manual
        if (!searchText.trim()) {
          return options; // Mostrar todas as opções
        }
        if (filteredOptions.length > 0) {
          return filteredOptions; // Mostrar resultados filtrados
        }
        return []; // Não mostrar nada se não há resultados
      }
    }

    // Se não há texto digitado, mostrar todas as opções + opção manual no final
    // Isso permite que o usuário veja a lista E tenha a opção de digitar manualmente
    if (!searchText.trim()) {
      return optionsWithManual;
    }

    // Se há resultados filtrados, mostrar apenas eles (sem opção manual)
    // Isso evita confusão quando há resultados na busca
    if (filteredOptions.length > 0) {
      return filteredOptions;
    }

    // Se não há resultados filtrados, mostrar apenas a opção manual
    // Isso permite digitação quando o usuário não encontra o nome na busca
    return optionsWithManual.slice(-1);
  }, [searchText, options, optionsWithManual, isManualMode, value]);

  // 🚨 CRÍTICO: Quando não há opções, entrar automaticamente em modo manual
  // Quando há opções, modo manual só quando usuário SELECIONAR a opção manual
  useEffect(() => {
    // Se não há opções, entrar automaticamente em modo manual
    if (!options || options.length === 0) {
      if (!isManualMode) {
        setIsManualMode(true);
        // Se há um valor manual anterior, manter
        if (value && typeof value === 'string' && value.startsWith('manual_')) {
          const manualValue = value.replace('manual_', '');
          setSearchText(manualValue);
        } else if (value) {
          setSearchText(value);
        } else {
          setSearchText('');
        }
      }
      return;
    }

    // Se há opções e está em modo manual, verificar se foi escolha do usuário
    if (isManualMode) {
      // Se o valor é manual (começa com manual_), manter modo manual (usuário escolheu)
      if (value && typeof value === 'string' && value.startsWith('manual_')) {
        // Usuário escolheu manualmente, manter modo manual
        return;
      }
      // Se o valor não é manual, verificar se corresponde a uma opção da lista
      if (value) {
        const matchesOption = options.some(opt => opt.id === value || opt.value === value);
        if (matchesOption) {
          // Valor corresponde a uma opção, sair do modo manual
          setIsManualMode(false);
        }
      } else {
        // Não há valor, sair do modo manual para mostrar lista
        setIsManualMode(false);
      }
    }
  }, [options, isManualMode, value]);

  // Sincronizar searchText com value quando muda externamente
  useEffect(() => {
    if (isManualMode) {
      // Em modo manual, searchText é o próprio value (sem prefixo manual_)
      if (value && typeof value === 'string' && value.startsWith('manual_')) {
        setSearchText(value.replace('manual_', ''));
      } else {
        setSearchText(value || '');
      }
      return;
    }

    // Se não há opções, já foi convertido para manual no useEffect anterior
    if (!options || options.length === 0) {
      return;
    }

    // Buscar opção correspondente ao value
    const currentOption = options.find(opt => opt.id === value || opt.value === value);
    if (currentOption) {
      setSearchText(currentOption.label);
    } else if (!value) {
      setSearchText('');
    } else {
      // Se o value não está nas opções, pode ser entrada manual anterior
      // Mas não converter automaticamente - deixar o usuário escolher
      setSearchText(value);
    }
  }, [value, options, isManualMode]);

  // Quando o usuário digita
  const handleChange = (text: string) => {
    setSearchText(text);
    setSelectedIndex(-1);

    if (isManualMode) {
      onSelect({ id: 'manual', label: text, value: text });
      return;
    }

    if (Platform.OS === 'android') {
      if (options.length > 0) {
        setShowList(true);
      } else {
        setShowList(false);
      }
    } else {
      if (text.trim().length > 0 || options.length > 0) {
        setShowList(true);
      } else {
        setShowList(false);
      }
    }
  };

  // Quando o campo recebe foco
  const handleFocus = () => {
    setIsFocused(true);
    // Cancelar blur pendente
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    if (isManualMode) {
      return;
    }

    // Se não há opções, não abrir dropdown (já está em modo manual automaticamente)
    if (!options || options.length === 0) {
      setShowList(false);
      return;
    }

    // 🚨 CRÍTICO: Sempre abrir dropdown quando há opções e não está em modo manual
    // Isso permite que o usuário veja e selecione nomes da lista
    setShowList(true);
  };

  // Quando o campo perde foco
  const handleBlur = () => {
    setIsFocused(false);
    // Delay muito maior no web para permitir clique com mouse
    // O mouse precisa de mais tempo porque o blur acontece antes do click
    const delay = Platform.OS === 'web' ? 500 : Platform.OS === 'android' ? 500 : 300;
    blurTimeoutRef.current = setTimeout(() => {
      setShowList(false);
      blurTimeoutRef.current = null;
    }, delay);
  };

  // Quando seleciona um item
  const handleSelect = (option: SelectOption) => {
    // Cancelar blur pendente
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    // Se selecionou opção manual, ativar modo manual
    if (option.id === MANUAL_INPUT_OPTION_ID || option.value === MANUAL_INPUT_OPTION_ID) {
      setIsManualMode(true);
      setSearchText('');
      setShowList(false);
      setSelectedIndex(-1);
      onSelect({ id: 'manual', label: '', value: '' });
      // Focar no input após um pequeno delay
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
      return;
    }

    // Seleção normal da lista
    console.log('✅ [NameSelectField] Nome selecionado:', {
      id: option.id,
      label: option.label,
      value: option.value,
    });
    setSearchText(option.label);
    setShowList(false);
    setSelectedIndex(-1);
    // 🚨 CRÍTICO: Garantir que o valor está sendo passado corretamente
    // Passar option.value (ID) como valor, não o label
    onSelect({
      id: option.id,
      label: option.label,
      value: option.value || option.id, // Usar value se disponível, senão usar id
    });

    // Blur do input após seleção
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.blur();
      }
    }, 100);
  };

  // Handler para Enter/Submit
  const handleEnterPress = () => {
    if (isManualMode) {
      // Em modo manual, apenas blur
      if (inputRef.current) {
        inputRef.current.blur();
      }
      return;
    }

    if (showList && filtered.length > 0) {
      const indexToSelect = selectedIndex >= 0 ? selectedIndex : 0;
      const optionToSelect = filtered[indexToSelect];
      if (optionToSelect) {
        handleSelect(optionToSelect);
      }
    }
  };




  // Limpar timeouts ao desmontar
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  // Z-index para aparecer acima de outros elementos
  const containerZIndex = isFocused ? 99999 : 1;

  return (
    <View
      style={[
        styles.container,
        style,
          Platform.OS === 'web'
          ? {
              position: 'relative' as ViewStyle['position'],
              overflow: 'visible' as ViewStyle['overflow'],
              zIndex: containerZIndex,
            }
          : {
              overflow: 'visible' as ViewStyle['overflow'],
              zIndex: containerZIndex,
              elevation: isFocused ? 10 : 0,
            },
      ]}
      ref={containerRef}
      collapsable={false}
    >
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputContainer,
          {
            position: 'relative' as ViewStyle['position'],
            overflow: 'visible' as ViewStyle['overflow'],
            zIndex: containerZIndex,
            ...(Platform.OS === 'web' ? {
              backgroundColor: '#ffffff',
            } : {}),
          },
        ]}
      >
        {/* Sempre usar o mesmo TextInput - mesma aparência sempre */}
        <>
          <View style={{ position: 'relative', flex: 1 }}>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                error && styles.inputError,
                Platform.OS === 'web'
                  ? {
                      position: 'relative' as ViewStyle['position'],
                    }
                  : {},
              ]}
              value={searchText}
              onChangeText={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={loading ? "Carregando nomes..." : (isManualMode ? "Digite o nome completo manualmente" : placeholder)}
              placeholderTextColor={theme.colors.textSecondary}
              returnKeyType="done"
              onSubmitEditing={handleEnterPress}
              autoCapitalize="words"
              editable={!loading}
              onKeyPress={(e) => {
              // Suporte para Android/iOS com teclado físico ou virtual
              if (Platform.OS !== 'web') {
                // No mobile, Enter já é tratado por onSubmitEditing
                // Mas podemos adicionar lógica adicional se necessário
                return;
              }
            }}
            {...(Platform.OS === 'web'
              ? {
                  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleEnterPress();
                    } else if (e.key === 'ArrowDown' && !isManualMode) {
                      e.preventDefault();
                      if (filtered.length > 0) {
                        const nextIndex =
                          selectedIndex < filtered.length - 1 ? selectedIndex + 1 : 0;
                        setSelectedIndex(nextIndex);
                        if (flatListRef.current && nextIndex >= 0) {
                          setTimeout(() => {
                            flatListRef.current?.scrollToIndex({
                              index: nextIndex,
                              animated: true,
                              viewOffset: 10,
                            });
                          }, 50);
                        }
                      }
                    } else if (e.key === 'ArrowUp' && !isManualMode) {
                      e.preventDefault();
                      if (filtered.length > 0) {
                        const prevIndex =
                          selectedIndex > 0 ? selectedIndex - 1 : filtered.length - 1;
                        setSelectedIndex(prevIndex);
                        if (flatListRef.current && prevIndex >= 0) {
                          setTimeout(() => {
                            flatListRef.current?.scrollToIndex({
                              index: prevIndex,
                              animated: true,
                              viewOffset: 10,
                            });
                          }, 50);
                        }
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowList(false);
                      if (inputRef.current) {
                        inputRef.current.blur();
                      }
                    }
                  },
                }
              : {})}
          />

          {/* Dropdown - só mostrar se não estiver em modo manual E houver opções */}
          {!isManualMode && (
            <>
              {/* Dropdown - Modal no mobile nativo, inline no Web */}
              {Platform.OS !== 'web' ? (
              <Modal
                visible={showList && filtered.length > 0}
                transparent
                animationType="fade"
                onRequestClose={() => setShowList(false)}
              >
                <TouchableOpacity
                  style={styles.modalOverlay}
                  activeOpacity={1}
                  onPress={() => setShowList(false)}
                >
                  <View style={styles.modalContent}>
                    {filtered.length > 0 ? (
                      <FlatList
                        ref={flatListRef}
                        data={filtered}
                        keyExtractor={item => item.id}
                        renderItem={({ item, index }) => {
                          const isManualOption = item.id === MANUAL_INPUT_OPTION_ID;
                          return (
                            <TouchableOpacity
                              style={[
                                styles.item,
                                selectedIndex === index && styles.itemHighlighted,
                                value === item.id && !isManualOption && styles.itemSelected,
                                isManualOption && styles.itemManual,
                              ]}
                              onPress={() => {
                                // Cancelar blur pendente ao clicar
                                if (blurTimeoutRef.current) {
                                  clearTimeout(blurTimeoutRef.current);
                                  blurTimeoutRef.current = null;
                                }
                                handleSelect(item);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.itemText,
                                  value === item.id && !isManualOption && styles.itemTextSelected,
                                  isManualOption && styles.itemTextManual,
                                ]}
                                numberOfLines={1}
                              >
                                {item.label}
                              </Text>
                              {value === item.id && !isManualOption && (
                                <FontAwesome5
                                  name="check"
                                  size={12}
                                  color={theme.colors.primary}
                                  style={styles.checkIcon}
                                />
                              )}
                            </TouchableOpacity>
                          );
                        }}
                        style={styles.list}
                        keyboardShouldPersistTaps="handled"
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={5}
                      />
                    ) : (
                      <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>Nenhum resultado encontrado</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </Modal>
            ) : (
              <>
            {showList && filtered.length > 0 && (
              <View
                style={styles.webDropdownContainer}
              >
              <View
                style={[
                  styles.dropdown,
                  Platform.OS === 'web' ? {
                    // @ts-ignore
                    backgroundColor: '#ffffff',
                    // @ts-ignore
                    // @ts-ignore
                    opacity: 1,
                  } : {},
                ]}
                    onStartShouldSetResponder={() => false}
                    onMoveShouldSetResponder={() => false}
                    pointerEvents="auto"
                    {...(Platform.OS === 'web'
                      ? {
                          onMouseEnter: () => {
                            // Cancelar blur quando mouse entra no dropdown
                            if (blurTimeoutRef.current) {
                              clearTimeout(blurTimeoutRef.current);
                              blurTimeoutRef.current = null;
                            }
                          },
                          onMouseDown: (e: React.MouseEvent) => {
                            // Cancelar blur ao clicar no dropdown
                            if (blurTimeoutRef.current) {
                              clearTimeout(blurTimeoutRef.current);
                              blurTimeoutRef.current = null;
                            }
                          },
                        }
                      : {})}
              >
                <FlatList
                  ref={flatListRef}
                  data={filtered}
                  keyExtractor={item => item.id}
                  style={styles.list}
                  renderItem={({ item, index }) => {
                    const isManualOption = item.id === MANUAL_INPUT_OPTION_ID;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.item,
                          selectedIndex === index && styles.itemHighlighted,
                          value === item.id && !isManualOption && styles.itemSelected,
                          isManualOption && styles.itemManual,
                        ]}
                            onPress={() => {
                              // Cancelar blur pendente ao clicar
                              if (blurTimeoutRef.current) {
                                clearTimeout(blurTimeoutRef.current);
                                blurTimeoutRef.current = null;
                              }
                              handleSelect(item);
                            }}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web'
                          ? {
                              onMouseEnter: () => setSelectedIndex(index),
                              onMouseLeave: () => setSelectedIndex(-1),
                            }
                          : {})}
                      >
                        <Text
                          style={[
                            styles.itemText,
                            value === item.id && !isManualOption && styles.itemTextSelected,
                            isManualOption && styles.itemTextManual,
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                        {value === item.id && !isManualOption && (
                          <FontAwesome5
                            name="check"
                            size={12}
                            color={theme.colors.primary}
                            style={styles.checkIcon}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  style={styles.list}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                />
              </View>
            </View>
            )}

            {/* Mensagem quando não há resultados */}
            {showList && filtered.length === 0 && searchText.trim().length > 0 && isFocused && (
              <View style={styles.webDropdownContainer}>
                <View style={styles.dropdown}>
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Nenhum resultado encontrado</Text>
                  </View>
                </View>
              </View>
            )}
              </>
            )}
            </>
          )}
        </>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
    ...(Platform.OS === 'web' ? {
      backgroundColor: '#ffffff',
    } : {}),
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    position: 'relative' as ViewStyle['position'],
    ...(Platform.OS === 'web' ? {
      backgroundColor: '#ffffff',
      zIndex: 1,
    } : {}),
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: '#ffffff',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'web' ? theme.spacing.md : theme.spacing.lg, // Mais padding no mobile
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    minHeight: Platform.OS === 'web' ? 48 : 52, // Aumentado no mobile
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    ...(Platform.OS === 'web' ? {
      backgroundColor: '#ffffff',
      // @ts-ignore
      opacity: 1,
    } : {}),
  },
  manualInput: {
    // Removido estilo de cor - campo deve ter aparência normal mesmo em modo manual
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  manualContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: '#ffffff',
  },
  backButtonText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  webDropdownContainer: {
    position: 'absolute' as any,
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 999999,
    marginTop: 4,
    ...(Platform.OS === 'web' ? {
      // @ts-ignore
      display: 'block',
      // @ts-ignore
      visibility: 'visible',
      opacity: 1,
      // @ts-ignore
      zIndex: 999999,
      // @ts-ignore
      pointerEvents: 'auto',
      // @ts-ignore
      isolation: 'isolate',
      // @ts-ignore
      willChange: 'transform',
    } : {}),
  },
  dropdown: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 999999,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
      backgroundColor: '#ffffff',
      // @ts-ignore
      display: 'block',
      // @ts-ignore
      visibility: 'visible',
      opacity: 1,
      // @ts-ignore
      // @ts-ignore
      backgroundImage: 'none',
      // @ts-ignore
      isolation: 'isolate',
      // @ts-ignore
      zIndex: 999999,
      // @ts-ignore
      position: 'relative',
      // @ts-ignore
      willChange: 'transform',
    } : {}),
  },
  list: {
    maxHeight: 300,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? {
      backgroundColor: '#ffffff',
      // @ts-ignore
      // @ts-ignore
      zIndex: 999999,
    } : {}),
  },
  item: {
    paddingVertical: Platform.OS === 'web' ? theme.spacing.md : theme.spacing.lg, // Mais padding no mobile
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    minHeight: Platform.OS === 'web' ? 48 : 52, // Aumentado no mobile
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? {
      backgroundColor: '#ffffff',
      // @ts-ignore
      opacity: 1,
      // @ts-ignore
      position: 'relative',
      // @ts-ignore
      zIndex: 999999,
      // @ts-ignore
      willChange: 'transform',
    } : {}),
  },
  itemHighlighted: {
    backgroundColor: theme.colors.primary + '15',
  },
  itemSelected: {
    backgroundColor: theme.colors.primary + '20',
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  itemManual: {
    // Removido estilo dourado/azul - usar estilo padrão
  },
  itemText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: '#333333',
    fontWeight: '400',
    lineHeight: 20,
  },
  itemTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  itemTextManual: {
    // Removido estilo dourado/azul - usar estilo padrão
    fontWeight: '400',
  },
  checkIcon: {
    marginLeft: theme.spacing.xs,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  emptyContainer: {
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    paddingTop: 100,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    borderRadius: theme.borderRadius.md,
    maxHeight: 400,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 15,
  },
});
