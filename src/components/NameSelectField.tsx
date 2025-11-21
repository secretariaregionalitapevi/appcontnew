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
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { theme } from '../theme';

const { DROPDOWN_FIELD_CONTAINER, DROPDOWN_FIELD_DROPDOWN } = theme.zIndex;

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

    // Se não há opções, mostrar apenas a opção manual (para permitir digitação)
    if (!options || options.length === 0) {
      return optionsWithManual.slice(-1); // Retornar apenas a opção manual
    }

    // Se não há texto digitado, mostrar todas as opções + opção manual
    if (!searchText.trim()) {
      return optionsWithManual;
    }

    // Filtrar opções baseado no texto
    const query = normalize(searchText);
    const filteredOptions = options.filter(opt => {
      const labelNorm = normalize(opt.label);
      return labelNorm.includes(query);
    });

    // Sempre adicionar opção manual no final, mesmo quando filtra
    return [...filteredOptions, optionsWithManual[optionsWithManual.length - 1]];
  }, [searchText, options, optionsWithManual, isManualMode]);

  // Sincronizar searchText com value quando muda externamente
  useEffect(() => {
    if (isManualMode) {
      // Em modo manual, searchText é o próprio value
      setSearchText(value || '');
      return;
    }

    // Se não há opções, não fazer nada (vai converter para manual no outro useEffect)
    if (!options || options.length === 0) {
      if (!value) {
        setSearchText('');
      } else {
        // Se há valor mas não há opções, manter o valor (modo manual)
        setSearchText(value);
      }
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
      // Em modo manual, atualizar diretamente
      onSelect({ id: 'manual', label: text, value: text });
      return;
    }

    // Mostrar lista quando há texto ou quando há opções disponíveis
    if (text.trim().length > 0 || options.length > 0) {
      setShowList(true);
    } else {
      setShowList(false);
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
      // Em modo manual, não mostrar lista
      return;
    }

    // Mostrar lista se há opções disponíveis
    if (options.length > 0) {
      setShowList(true);
    }
  };

  // Quando o campo perde foco
  const handleBlur = () => {
    setIsFocused(false);
    // Delay para permitir clique no item
    blurTimeoutRef.current = setTimeout(() => {
      setShowList(false);
      blurTimeoutRef.current = null;
    }, 300);
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
    setSearchText(option.label);
    setShowList(false);
    setSelectedIndex(-1);
    onSelect(option);

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

  // Z-index dinâmico baseado no foco
  const dynamicZIndex =
    isFocused || showList ? DROPDOWN_FIELD_CONTAINER + 1000 : DROPDOWN_FIELD_CONTAINER;
  const dropdownZIndex =
    isFocused || showList ? DROPDOWN_FIELD_DROPDOWN : DROPDOWN_FIELD_DROPDOWN - 1000;

  return (
    <View
      style={[
        styles.container,
        style,
        Platform.OS === 'web' && (isFocused || showList)
          ? {
              zIndex: dynamicZIndex,
              position: 'relative' as ViewStyle['position'],
            }
          : {},
      ]}
      ref={containerRef}
      collapsable={false}
    >
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputContainer,
          Platform.OS === 'web' && (isFocused || showList)
            ? {
                zIndex: dynamicZIndex,
              }
            : {},
        ]}
      >
        {isManualMode ? (
          // Modo manual: apenas TextInput (só quando não há opções ou usuário escolheu manual)
          <View style={styles.manualContainer}>
            <TextInput
              ref={inputRef}
              style={[styles.input, styles.manualInput, error && styles.inputError]}
              value={searchText}
              onChangeText={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Digite o nome completo manualmente"
              placeholderTextColor={theme.colors.textSecondary}
              returnKeyType="done"
              onSubmitEditing={handleEnterPress}
              autoCapitalize="words"
            />
            {options.length > 0 && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  setIsManualMode(false);
                  setSearchText('');
                  onSelect({ id: 'manual', label: '', value: '' });
                }}
                activeOpacity={0.7}
              >
                <FontAwesome5 name="arrow-left" size={12} color={theme.colors.primary} />
                <Text style={styles.backButtonText}>Voltar</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          // Modo select: TextInput com dropdown
          <>
            <TextInput
              ref={inputRef}
              style={[styles.input, error && styles.inputError]}
              value={searchText}
              onChangeText={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.textSecondary}
              returnKeyType="done"
              onSubmitEditing={handleEnterPress}
              {...(Platform.OS === 'web'
                ? {
                    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleEnterPress();
                      } else if (e.key === 'ArrowDown') {
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
                              });
                            }, 50);
                          }
                        }
                      } else if (e.key === 'ArrowUp') {
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
                              });
                            }, 50);
                          }
                        }
                      } else if (e.key === 'Escape') {
                        setShowList(false);
                        if (inputRef.current) {
                          inputRef.current.blur();
                        }
                      }
                    },
                  }
                : {})}
            />

            {/* Dropdown inline - SEM Modal */}
            {showList && filtered.length > 0 && (
              <View
                style={[
                  styles.dropdown,
                  Platform.OS === 'web'
                    ? {
                        zIndex: dropdownZIndex,
                      }
                    : {},
                ]}
              >
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
                        onPress={() => handleSelect(item)}
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
            )}

            {/* Mensagem quando não há resultados */}
            {showList && filtered.length === 0 && searchText.trim().length > 0 && (
              <View style={styles.dropdown}>
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Nenhum resultado encontrado</Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
    ...(Platform.OS === 'web'
      ? {
          position: 'relative' as ViewStyle['position'],
          zIndex: 1000,
        }
      : {}),
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
    ...(Platform.OS === 'web'
      ? {
          zIndex: 1000,
        }
      : {}),
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: '#ffffff',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    ...(Platform.OS === 'web'
      ? {
          position: 'relative' as ViewStyle['position'],
          zIndex: 1001,
        }
      : {}),
  },
  manualInput: {
    backgroundColor: '#e8f5e8',
    borderColor: '#28a745',
    color: '#155724',
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
  dropdown: {
    position: 'absolute' as ViewStyle['position'],
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    maxHeight: 300,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 15,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? {
          zIndex: 999999999,
          position: 'absolute' as ViewStyle['position'],
        }
      : {
          zIndex: 1000,
        }),
  },
  list: {
    maxHeight: 300,
  },
  item: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
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
    backgroundColor: '#e3f2fd',
    borderLeftWidth: 3,
    borderLeftColor: '#1976d2',
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
    color: '#1976d2',
    fontWeight: '600',
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
});
