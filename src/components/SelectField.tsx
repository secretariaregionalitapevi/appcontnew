import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  TextInput,
  ViewStyle,
} from 'react-native';
import { theme } from '../theme';

interface SelectOption {
  id: string;
  label: string;
  value: unknown;
}

interface SelectFieldProps {
  label?: string;
  value?: string;
  options: SelectOption[];
  onSelect: (option: SelectOption) => void;
  placeholder?: string;
  searchable?: boolean;
  error?: string;
  style?: ViewStyle;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  value,
  options,
  onSelect,
  placeholder = 'Selecione...',
  searchable = false,
  error,
  style,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedOption = options.find(opt => opt.id === value);

  // Função para normalizar texto (remover acentos para busca)
  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacríticos
      .trim();
  };

  const filteredOptions =
    searchable && searchQuery
      ? options.filter(opt => {
          const normalizedLabel = normalizeText(opt.label);
          const normalizedQuery = normalizeText(searchQuery);
          return normalizedLabel.includes(normalizedQuery);
        })
      : options;

  const handleSelect = (option: SelectOption) => {
    onSelect(option);
    setModalVisible(false);
    setSearchQuery('');
  };

  const isInline = !label;

  return (
    <View style={[styles.container, isInline && styles.containerInline]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={[
          styles.selectButton,
          error && styles.selectButtonError,
          isInline && styles.selectButtonInline,
          style,
        ]}
        onPress={e => {
          e.preventDefault();
          e.stopPropagation();
          console.log(
            '🔘 SelectField pressionado, abrindo modal. Options:',
            options.length,
            'modalVisible:',
            modalVisible
          );
          setModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.selectText, !selectedOption && styles.placeholderText]}
          numberOfLines={1}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <View style={styles.arrowContainer}>
          <Text style={styles.arrow}>▼</Text>
        </View>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          console.log('🔘 Modal fechado via onRequestClose');
          setModalVisible(false);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            console.log('🔘 Overlay pressionado, fechando modal');
            setModalVisible(false);
          }}
        >
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={e => {
              // Prevenir que o clique no conteúdo feche o modal
              e.stopPropagation();
            }}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label || 'Selecione uma opção'}</Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setSearchQuery('');
                }}
                style={styles.closeButtonContainer}
                activeOpacity={0.7}
              >
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {searchable && (
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor={theme.colors.textSecondary}
              />
            )}

            <FlatList
              data={filteredOptions}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    selectedOption?.id === item.id && styles.optionItemSelected,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selectedOption?.id === item.id && styles.optionTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Nenhum item encontrado</Text>
                </View>
              }
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
    zIndex: 0,
  },
  containerInline: {
    marginBottom: 0,
    flex: 1,
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'web' ? theme.spacing.sm : theme.spacing.md, // Mais padding no mobile
    minHeight: Platform.OS === 'web' ? 48 : 52, // Aumentado no mobile
  },
  selectButtonInline: {
    borderWidth: 0,
    borderRadius: 0,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.md,
    flex: 1,
    backgroundColor: 'transparent',
    minHeight: 48,
    justifyContent: 'space-between',
  },
  selectButtonError: {
    borderColor: theme.colors.error,
  },
  selectText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    textAlign: 'left',
  },
  placeholderText: {
    color: theme.colors.textSecondary,
  },
  arrowContainer: {
    marginLeft: theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: 'bold',
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    maxHeight: '80%',
    paddingBottom: theme.spacing.lg,
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.primary,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.surface,
  },
  closeButtonContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    fontSize: theme.fontSize.xl,
    color: theme.colors.surface,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 20,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    margin: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  optionItem: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    minHeight: 40,
    justifyContent: 'center',
  },
  optionItemSelected: {
    backgroundColor: theme.colors.primary + '15',
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    paddingLeft: theme.spacing.lg - 4,
  },
  optionText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: '400',
  },
  optionTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
});
