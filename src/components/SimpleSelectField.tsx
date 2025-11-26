import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  SafeAreaView,
  ViewStyle,
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
      // Mostrar TODAS as opções quando vazio (sem limite)
      return options;
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

  // Calcular altura máxima: cada item tem ~48px, máximo 600px para mostrar todos os instrumentos
  const maxHeight = Math.min(filtered.length * 48, 600);

  // Z-index MUITO ALTO para aparecer acima de TUDO em TODAS as plataformas (igual AutocompleteField)
  // Quando dropdown está aberto (showList), usar z-index muito alto
  const containerZIndex = (isFocused || showList) ? 99999 : 1;
  const dropdownZIndex = 999999; // Z-index extremamente alto para garantir que apareça acima de tudo

  return (
    <View
      style={[
        styles.container,
        style,
          Platform.OS === 'web'
          ? {
              position: 'relative' as any,
              overflow: 'visible' as any,
              zIndex: containerZIndex,
            }
          : {
              overflow: 'visible' as any,
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
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            error && styles.inputError,
            Platform.OS === 'web'
              ? {
                  position: 'relative' as ViewStyle['position'],
                  zIndex: 1,
                  outline: 'none',
                  outlineStyle: 'none',
                  outlineWidth: 0,
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

        {/* Dropdown - View simples no web, Modal no mobile (igual AutocompleteField) */}
        {showList && filtered.length > 0 && (
          Platform.OS === 'web' ? (
            <View
              style={styles.webDropdownContainer}
            >
              <View style={styles.webDropdown}>
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
                        if (blurTimeoutRef.current) {
                          clearTimeout(blurTimeoutRef.current);
                          blurTimeoutRef.current = null;
                        }
                        handleSelect(item);
                        setShowList(false);
                        if (inputRef.current) {
                          inputRef.current.blur();
                        }
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
                  style={[styles.webDropdownList, { maxHeight: maxHeight }]}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  initialNumToRender={15}
                  maxToRenderPerBatch={15}
                  windowSize={10}
                />
              </View>
            </View>
          ) : (
            <Modal
              visible={showList}
              transparent={true}
              animationType="fade"
              onRequestClose={() => {
                setShowList(false);
                if (inputRef.current) {
                  inputRef.current.blur();
                }
              }}
            >
              <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => {
                  setShowList(false);
                  if (inputRef.current) {
                    inputRef.current.blur();
                  }
                }}
              >
                <SafeAreaView style={styles.modalContainer}>
                  <View style={styles.modalDropdown}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>{label || 'Selecione uma opção'}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setShowList(false);
                          if (inputRef.current) {
                            inputRef.current.blur();
                          }
                        }}
                        style={styles.modalCloseButton}
                      >
                        <FontAwesome5 name="times" size={20} color={theme.colors.text} />
                      </TouchableOpacity>
                    </View>
                    <FlatList
                      ref={flatListRef}
                      data={filtered}
                      keyExtractor={item => item.id}
                      renderItem={({ item, index }) => (
                        <TouchableOpacity
                          style={[
                            styles.modalItem,
                            selectedIndex === index && styles.itemHighlighted,
                            value === item.id && styles.itemSelected,
                          ]}
                          onPress={() => {
                            handleSelect(item);
                            setShowList(false);
                            if (inputRef.current) {
                              inputRef.current.blur();
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.modalItemText, value === item.id && styles.itemTextSelected]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                          {value === item.id && (
                            <FontAwesome5
                              name="check"
                              size={14}
                              color={theme.colors.primary}
                              style={styles.checkIcon}
                            />
                          )}
                        </TouchableOpacity>
                      )}
                      style={styles.modalList}
                      keyboardShouldPersistTaps="handled"
                      initialNumToRender={20}
                      maxToRenderPerBatch={20}
                      windowSize={10}
                      removeClippedSubviews={true}
                    />
                  </View>
                </SafeAreaView>
              </TouchableOpacity>
            </Modal>
          )
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
    ...(Platform.OS === 'web' ? {
      // @ts-ignore
      position: 'relative',
      // @ts-ignore
      zIndex: 1,
      // @ts-ignore
      isolation: 'isolate',
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
      outline: 'none',
      outlineStyle: 'none',
      outlineWidth: 0,
    } : {}),
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  webDropdownContainer: {
    position: 'absolute' as any,
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 99999,
    marginTop: 4,
    ...(Platform.OS === 'web' ? {
      // @ts-ignore
      display: 'block',
      // @ts-ignore
      visibility: 'visible',
      opacity: 1,
      // @ts-ignore
      zIndex: 99999,
      // @ts-ignore
      pointerEvents: 'auto',
      // @ts-ignore
      isolation: 'isolate',
    } : {}),
  },
  webDropdown: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    maxHeight: 600,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 99999,
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
      background: '#ffffff',
      // @ts-ignore
      backgroundImage: 'none',
      // @ts-ignore
      isolation: 'isolate',
      // @ts-ignore
      zIndex: 99999,
      // @ts-ignore
      position: 'relative',
    } : {}),
  },
  webDropdownList: {
    maxHeight: 600,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? {
      backgroundColor: '#ffffff',
      // @ts-ignore
      background: '#ffffff',
    } : {}),
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
    maxHeight: 600,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 99999,
    overflow: 'hidden',
    zIndex: 99999,
  },
  list: {
    maxHeight: 600,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? {
      backgroundColor: '#ffffff',
      // @ts-ignore
      background: '#ffffff',
    } : {}),
  },
  item: {
    paddingVertical: Platform.OS === 'web' ? theme.spacing.md : theme.spacing.lg, // Mais padding no mobile
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    minHeight: Platform.OS === 'web' ? 48 : 52, // Aumentado no mobile
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? {
      backgroundColor: '#ffffff',
      // @ts-ignore
      background: '#ffffff',
      opacity: 1,
      // @ts-ignore
      position: 'relative',
      // @ts-ignore
      zIndex: 99999,
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
  // Estilos para Modal no mobile
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalDropdown: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 20,
    ...(Platform.OS === 'web' ? {
      // @ts-ignore
      backgroundColor: '#ffffff',
      // @ts-ignore
      background: '#ffffff',
      // @ts-ignore
      opacity: 1,
    } : {}),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  modalCloseButton: {
    padding: theme.spacing.xs,
  },
  modalList: {
    maxHeight: 600,
    ...(Platform.OS === 'web' ? {
      // @ts-ignore
      maxHeight: '80vh',
    } : {}), // Aumentado para mostrar todos os instrumentos no mobile também
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    minHeight: 56,
    backgroundColor: '#ffffff',
  },
  modalItemText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    flex: 1,
  },
});
