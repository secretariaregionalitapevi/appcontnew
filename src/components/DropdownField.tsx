import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  Platform,
  ViewStyle,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { theme } from '../theme';

interface DropdownOption {
  id: string;
  label: string;
  value: unknown;
  icon?: string; // Nome do ícone FontAwesome (opcional)
}

interface DropdownFieldProps {
  value?: string;
  options: DropdownOption[];
  onSelect: (option: DropdownOption) => void;
  placeholder?: string;
  style?: ViewStyle;
  icon?: string; // Ícone padrão para todos os itens
  iconColor?: string; // Cor do ícone
}

export const DropdownField: React.FC<DropdownFieldProps> = ({
  value,
  options,
  onSelect,
  placeholder = 'Selecione...',
  style,
  icon = 'map-marker-alt',
  iconColor = theme.colors.primary,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<View>(null);
  const [layout, setLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });


  const selectedOption = options.find(opt => opt.id === value);

  const handleSelect = (option: DropdownOption) => {
    onSelect(option);
    setIsOpen(false);
  };

  const handleOpen = () => {
    if (options.length === 0) {
      return;
    }

    if (containerRef.current) {
        containerRef.current.measure((x, y, width, height, pageX, pageY) => {
        const newLayout = Platform.OS === 'web'
          ? (pageX !== undefined && pageY !== undefined
              ? { x: pageX, y: pageY, width: width || 300, height: height || 48 }
              : { x: 0, y: 0, width: width || 300, height: height || 48 })
          : (pageX !== undefined && pageY !== undefined
              ? { x: pageX, y: pageY, width, height }
              : { x: 0, y: 0, width: width || 300, height: height || 48 });
        
        setLayout(newLayout);
        setIsOpen(true);
      });
    } else {
      setLayout({ x: 0, y: 0, width: 300, height: 48 });
      setIsOpen(true);
    }
  };

  // Altura máxima: 6 itens (240px)
  const maxHeight = Math.min(options.length * 48, 240);

  return (
    <View style={[styles.container, style]} ref={containerRef} collapsable={false}>
      <TouchableOpacity
        style={[styles.selectButton, isOpen && styles.selectButtonOpen]}
        onPress={handleOpen}
        activeOpacity={0.7}
        {...(Platform.OS === 'web'
          ? {
              onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
                if (!isOpen) {
                  (e.currentTarget as HTMLElement).style.cursor = 'pointer';
                }
              },
              onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
                (e.currentTarget as HTMLElement).style.cursor = 'default';
              },
            }
          : {})}
      >
        {selectedOption && (
          <FontAwesome5
            name={selectedOption.icon || icon}
            size={16}
            color={iconColor}
            style={styles.buttonIcon}
          />
        )}
        <Text
          style={[styles.selectText, !selectedOption && styles.placeholderText]}
          numberOfLines={1}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <FontAwesome5
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={theme.colors.textSecondary}
          style={styles.arrowIcon}
        />
      </TouchableOpacity>

      {isOpen && options.length > 0 && (
      <Modal
          visible={true}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsOpen(false)}
        >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            style={[
              styles.dropdownContainer,
              {
                top: layout.y + layout.height + 2,
                left: layout.x || 0,
                width: layout.width || '100%',
                maxHeight: maxHeight,
                  ...(Platform.OS === 'web'
                    ? {
                        position: 'fixed' as const,
                        zIndex: 9999,
                      }
                    : {}),
              },
            ]}
            >
            {options.length === 0 ? (
              <View style={styles.optionItem}>
                <Text style={styles.optionText}>Nenhuma opção disponível</Text>
              </View>
            ) : (
            <FlatList
              data={options}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    selectedOption?.id === item.id && styles.optionItemSelected,
                  ]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.6}
                  {...(Platform.OS === 'web'
                    ? {
                        onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            theme.colors.primary + '15';
                          (e.currentTarget as HTMLElement).style.cursor = 'pointer';
                        },
                        onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            selectedOption?.id === item.id
                              ? theme.colors.primary + '08'
                              : theme.colors.surface;
                          (e.currentTarget as HTMLElement).style.cursor = 'default';
                        },
                        onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            theme.colors.primary + '25';
                        },
                        onMouseUp: (e: React.MouseEvent<HTMLDivElement>) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            theme.colors.primary + '15';
                        },
                      }
                    : {})}
                >
                  <FontAwesome5
                    name={item.icon || icon}
                    size={16}
                    color={selectedOption?.id === item.id ? iconColor : theme.colors.textSecondary}
                    style={styles.optionIcon}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      selectedOption?.id === item.id && styles.optionTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {selectedOption?.id === item.id && (
                    <FontAwesome5
                      name="check"
                      size={14}
                      color={iconColor}
                      style={styles.checkIcon}
                    />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            />
            )}
            </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md, // Aumentado de sm para md
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.md, // Aumentado de sm para md
    minHeight: 52, // Aumentado de 48 para 52px (melhor área de toque)
    flex: 1,
    borderRadius: theme.borderRadius.md,
  },
  selectButtonOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  buttonIcon: {
    marginRight: theme.spacing.sm,
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
  arrowIcon: {
    marginLeft: theme.spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  dropdownContainer: {
    position: 'absolute',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14, // Aumentado de 12 para 14px
    paddingHorizontal: theme.spacing.md,
    minHeight: 52, // Aumentado de 48 para 52px (melhor área de toque)
    backgroundColor: theme.colors.surface,
  },
  optionItemSelected: {
    backgroundColor: theme.colors.primary + '08',
  },
  optionIcon: {
    marginRight: theme.spacing.sm,
    width: 20,
  },
  optionText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    fontWeight: '400',
  },
  optionTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  checkIcon: {
    marginLeft: theme.spacing.xs,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: theme.spacing.md + 20, // Alinhar com o texto (ícone + margin)
  },
});
