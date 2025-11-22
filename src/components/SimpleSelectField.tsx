import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { theme } from '../theme';

const { DROPDOWN_FIELD_CONTAINER, DROPDOWN_FIELD_INPUT, DROPDOWN_FIELD_DROPDOWN } = theme.zIndex;

interface SelectOption {
  id: string;
  label: string;
  value: unknown;
}

interface SimpleSelectFieldProps {
  label?: string;
  value?: string;
  options: SelectOption[];
  onSelect: (option: SelectOption) => void;
  placeholder?: string;
  error?: string;
  style?: any;
}

export const SimpleSelectField: React.FC<SimpleSelectFieldProps> = ({
  label,
  value,
  options,
  onSelect,
  placeholder = 'Digite para buscar...',
  error,
  style,
}) => {
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

  // Filtrar opções baseado no texto digitado
  const filtered = useMemo(() => {
    // Se não há opções, retornar array vazio
    if (!options || options.length === 0) {
      return [];
    }

    if (!searchText.trim()) {
      // Mostrar todas as opções quando vazio (até 50)
      return options.slice(0, 50);
    }

    const query = normalize(searchText);
    return options.filter(opt => {
      const labelNorm = normalize(opt.label);
      return labelNorm.includes(query);
    });
  }, [searchText, options]);

  // Sincronizar searchText com value quando muda externamente
  useEffect(() => {
    if (!options || options.length === 0) {
      if (!value) {
        setSearchText('');
      }
      return;
    }

    const currentOption = options.find(opt => opt.id === value || opt.value === value);
    if (currentOption) {
      setSearchText(currentOption.label);
    } else if (!value) {
      setSearchText('');
    }
  }, [value, options]);

  // Quando o usuário digita
  const handleChange = (text: string) => {
    setSearchText(text);
    setSelectedIndex(-1);
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
    // Mostrar lista se há opções disponíveis
    if (options.length > 0) {
      setShowList(true);
    }
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

  const maxHeight = Math.min(filtered.length * 48, 300);

  // Z-index DINÂMICO baseado no foco - campo ativo sempre acima
  // Z-index DINÂMICO baseado no foco - campo ativo sempre acima
  // Valores extremos para garantir que campo focado SEMPRE fique acima de tudo
  const baseZIndex = Platform.OS === 'web' ? 1 : 1; // Z-index base muito baixo para campos não focados
  const focusedZIndex = Platform.OS === 'web' ? 2147483647 : 10000; // Z-index máximo possível (2147483647 = max int32) para campo focado
  const dropdownZIndex = Platform.OS === 'web' ? 2147483647 : 10001; // Z-index máximo para dropdown do campo focado
  
  const containerZIndex = isFocused ? focusedZIndex : baseZIndex;
  const inputZIndex = isFocused ? focusedZIndex : baseZIndex;

  return (
    <View
      style={[
        styles.container,
        style,
          Platform.OS === 'web'
          ? {
              zIndex: containerZIndex,
              position: 'relative' as any,
              overflow: 'visible' as any,
            }
          : {
              elevation: isFocused ? 100 : 0,
              zIndex: isFocused ? 10000 : 1,
              overflow: 'visible' as any,
            },
      ]}
      ref={containerRef}
      collapsable={false}
    >
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputContainer,
          Platform.OS === 'web'
            ? {
                zIndex: inputZIndex,
                position: 'relative' as ViewStyle['position'],
                overflow: 'visible' as any,
              }
            : {
                zIndex: inputZIndex,
                overflow: 'visible' as any,
              },
        ]}
      >
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            error && styles.inputError,
            Platform.OS === 'web'
              ? {
                  zIndex: inputZIndex,
                  position: 'relative' as ViewStyle['position'],
                }
              : {},
          ]}
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
                      const nextIndex = selectedIndex < filtered.length - 1 ? selectedIndex + 1 : 0;
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
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (filtered.length > 0) {
                      const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : filtered.length - 1;
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

        {/* Dropdown inline - SEM Modal */}
        {showList && filtered.length > 0 && (
          <View
            style={[
              styles.dropdown,
              Platform.OS === 'web'
                ? {
                    zIndex: dropdownZIndex,
                    position: 'absolute' as ViewStyle['position'],
                  }
                : {
                    zIndex: dropdownZIndex,
                    elevation: 1000, // Elevation alto no Android
                  },
            ]}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
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
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.item,
                    selectedIndex === index && styles.itemHighlighted,
                    value === item.id && styles.itemSelected,
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
                    style={[styles.itemText, value === item.id && styles.itemTextSelected]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {value === item.id && (
                    <FontAwesome5
                      name="check"
                      size={12}
                      color={theme.colors.primary}
                      style={styles.checkIcon}
                    />
                  )}
                </TouchableOpacity>
              )}
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
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
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
    position: 'relative' as any,
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
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  dropdown: {
    position: 'absolute' as any,
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
    elevation: Platform.OS === 'android' ? 1000 : 15,
    overflow: 'hidden',
    zIndex: Platform.OS === 'web' ? 99999999 : 10000,
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
