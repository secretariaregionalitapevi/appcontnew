import { Platform, Alert } from 'react-native';

// Importar Toast apenas para plataformas nativas (não web)
let Toast: any = null;
if (Platform.OS !== 'web') {
  try {
    Toast = require('react-native-toast-message').default;
  } catch (error) {
    console.warn('Toast não disponível:', error);
  }
}

// Função para obter SweetAlert2 dinamicamente (para web)
const getSwal = (): any => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  try {
    // Tentar importar SweetAlert2
    const sweetalert2 = require('sweetalert2');
    return sweetalert2.default || sweetalert2;
  } catch (error) {
    console.warn('SweetAlert2 não disponível:', error);
    return null;
  }
};

// Carregar CSS do SweetAlert2 dinamicamente na web (via DOM)
if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Verificar se o CSS já foi carregado
  const cssId = 'sweetalert2-css';
  if (!document.getElementById(cssId)) {
    const link = document.createElement('link');
    link.id = cssId;
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
    document.head.appendChild(link);

    // Carregar fonte Inter do Google Fonts
    const fontLink = document.createElement('link');
    fontLink.rel = 'preconnect';
    fontLink.href = 'https://fonts.googleapis.com';
    document.head.appendChild(fontLink);

    const fontLink2 = document.createElement('link');
    fontLink2.rel = 'preconnect';
    fontLink2.href = 'https://fonts.gstatic.com';
    fontLink2.crossOrigin = 'anonymous';
    document.head.appendChild(fontLink2);

    const fontStyle = document.createElement('link');
    fontStyle.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    fontStyle.rel = 'stylesheet';
    document.head.appendChild(fontStyle);

    // 🚀 MELHORIA: Estilos customizados mais compactos e elegantes
    const customStyle = document.createElement('style');
    customStyle.id = 'sweetalert2-custom-styles';
    customStyle.textContent = `
      /* Toast (modo ultra-compacto e elegante) */
      .swal2-toast {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        border-radius: 8px !important;
        padding: 0.625rem 0.875rem !important;
        min-width: 240px !important;
        max-width: 320px !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
        display: flex !important;
        align-items: center !important;
      }
      .swal2-toast .swal2-title {
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #1f2937 !important;
        line-height: 1.3 !important;
        margin: 0 !important;
        padding: 0 !important;
        flex: 1 !important;
      }
      .swal2-toast .swal2-content {
        display: none !important; /* Ocultar conteúdo extra para manter compacto */
      }
      .swal2-toast .swal2-icon {
        width: 28px !important;
        height: 28px !important;
        margin: 0 0.625rem 0 0 !important;
        flex-shrink: 0 !important;
      }
      .swal2-toast .swal2-icon .swal2-success-ring {
        width: 28px !important;
        height: 28px !important;
      }
      .swal2-toast .swal2-icon .swal2-success-line-tip,
      .swal2-toast .swal2-icon .swal2-success-line-long {
        height: 2px !important;
      }
      .swal2-toast .swal2-icon.swal2-success {
        border-color: #10b981 !important;
      }
      .swal2-toast .swal2-icon.swal2-error {
        border-color: #ef4444 !important;
      }
      .swal2-toast .swal2-icon.swal2-info {
        border-color: #3b82f6 !important;
      }
      .swal2-toast .swal2-icon.swal2-warning {
        border-color: #f59e0b !important;
      }
      
      /* Modal (para erros importantes) */
      .swal2-popup:not(.swal2-toast) {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        font-size: 15px !important;
        border-radius: 12px !important;
        padding: 1.5rem !important;
        max-width: 420px !important;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2) !important;
      }
      .swal2-popup:not(.swal2-toast) .swal2-title {
        font-size: 18px !important;
        font-weight: 600 !important;
        color: #111827 !important;
        line-height: 1.4 !important;
        margin-bottom: 0.75rem !important;
        padding: 0 !important;
      }
      .swal2-popup:not(.swal2-toast) .swal2-content {
        font-size: 14px !important;
        font-weight: 400 !important;
        color: #4b5563 !important;
        line-height: 1.6 !important;
        margin-top: 0 !important;
        padding: 0 !important;
      }
      .swal2-popup:not(.swal2-toast) .swal2-icon {
        width: 64px !important;
        height: 64px !important;
        margin-bottom: 1rem !important;
        border-width: 4px !important;
      }
      /* Garantir que o ícone de erro (X) seja visível e bem definido */
      .swal2-popup:not(.swal2-toast) .swal2-icon.swal2-error,
      .swal2-icon-error-visible {
        border-color: #ef4444 !important;
        color: #ef4444 !important;
        background-color: transparent !important;
      }
      .swal2-popup:not(.swal2-toast) .swal2-icon.swal2-error .swal2-x-mark,
      .swal2-icon-error-visible .swal2-x-mark {
        position: relative !important;
        width: 100% !important;
        height: 100% !important;
        display: block !important;
      }
      .swal2-popup:not(.swal2-toast) .swal2-icon.swal2-error .swal2-x-mark-line,
      .swal2-icon-error-visible .swal2-x-mark-line {
        position: absolute !important;
        height: 5px !important;
        width: 32px !important;
        background-color: #ef4444 !important;
        border-radius: 2px !important;
        top: 50% !important;
        left: 50% !important;
        margin-left: -16px !important;
        margin-top: -2.5px !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      .swal2-popup:not(.swal2-toast) .swal2-icon.swal2-error .swal2-x-mark-line-left,
      .swal2-icon-error-visible .swal2-x-mark-line-left {
        transform: rotate(45deg) !important;
      }
      .swal2-popup:not(.swal2-toast) .swal2-icon.swal2-error .swal2-x-mark-line-right,
      .swal2-icon-error-visible .swal2-x-mark-line-right {
        transform: rotate(-45deg) !important;
      }
      .swal2-popup:not(.swal2-toast) .swal2-confirm {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        padding: 0.625rem 1.5rem !important;
        border-radius: 8px !important;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
        transition: all 0.2s ease !important;
        margin-top: 1rem !important;
      }
      .swal2-popup:not(.swal2-toast) .swal2-confirm:hover {
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
      }
    `;
    document.head.appendChild(customStyle);
  }
}

export const showToast = {
  success: (title: string, message?: string) => {
    // 🚀 MELHORIA: Sempre usar title como mensagem única (ultra-compacto)
    // Se message foi fornecido, combinar em uma linha
    const finalMessage = message ? `${title} ${message}` : title;
    
    if (Platform.OS === 'web') {
      // 🚀 MELHORIA: Toast de sucesso ultra-compacto (uma linha)
      const Swal = getSwal();
      if (Swal) {
        Swal.fire({
          icon: 'success',
          title: finalMessage,
          text: '', // Sempre vazio para manter compacto
          timer: 1500,
          timerProgressBar: false,
          showConfirmButton: false,
          toast: true,
          position: 'top-end',
          width: 'auto',
          padding: '0.625rem 0.875rem',
          customClass: {
            popup: 'swal2-toast',
            title: 'swal2-toast-title',
            content: 'swal2-toast-content',
          },
        });
      } else {
        console.log(`✅ ${finalMessage}`);
      }
    } else if (Toast) {
      // 🚀 MELHORIA: Toast mobile ultra-compacto (uma linha)
      try {
        Toast.show({
          type: 'success',
          text1: finalMessage,
          text2: undefined, // Sempre undefined para manter compacto
          position: 'top',
          visibilityTime: 1500,
          autoHide: true,
          topOffset: Platform.OS === 'ios' ? 60 : 50,
          text1Style: { 
            fontSize: 13, 
            fontWeight: '600',
            fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
          },
        });
      } catch (toastError) {
        // Fallback se Toast falhar
        if (Platform.OS !== 'web') {
          Alert.alert('Sucesso', finalMessage);
        }
      }
    } else {
      // Fallback para iOS se Toast não estiver disponível
      if (Platform.OS === 'ios') {
        Alert.alert('Sucesso', finalMessage);
      }
    }
  },

  error: (title: string, message?: string) => {
    if (Platform.OS === 'web') {
      // 🚀 MELHORIA: Modal de erro compacto e elegante com ícone visível
      const Swal = getSwal();
      if (Swal) {
        Swal.fire({
          icon: 'error',
          iconColor: '#ef4444',
          title: title,
          text: message || '',
          timer: 4000,
          timerProgressBar: true,
          showConfirmButton: true,
          confirmButtonText: 'OK',
          confirmButtonColor: '#ef4444',
          toast: false, // Modal para erros importantes
          position: 'center',
          padding: '1.5rem',
          customClass: {
            popup: 'swal2-popup-compact',
            title: 'swal2-title-compact',
            content: 'swal2-content-compact',
            confirmButton: 'swal2-confirm-compact',
            icon: 'swal2-icon-error-visible',
          },
        });
      } else {
        // Fallback para alert nativo
        console.error(`❌ ${title}: ${message || ''}`);
        if (typeof window !== 'undefined' && window.alert) {
          alert(`${title}\n${message || ''}`);
        }
      }
    } else if (Toast) {
      // 🚀 MELHORIA: Toast mobile mais compacto
      Toast.show({
        type: 'error',
        text1: title,
        text2: message,
        position: 'top',
        visibilityTime: 3500,
        autoHide: true,
        topOffset: Platform.OS === 'ios' ? 50 : 40,
        text1Style: { 
          fontSize: 14, 
          fontWeight: '600',
          fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
        },
        text2Style: { 
          fontSize: 12,
          fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
        },
      });
    } else {
      Alert.alert(title, message || '');
    }
  },

  info: (title: string, message?: string) => {
    if (Platform.OS === 'web') {
      // 🚀 MELHORIA: Toast de info compacto
      const Swal = getSwal();
      if (Swal) {
        Swal.fire({
          icon: 'info',
          title: title,
          text: message || '',
          timer: 3000,
          timerProgressBar: false,
          showConfirmButton: false,
          toast: true,
          position: 'top-end',
          width: 'auto',
          padding: '0.75rem 1rem',
          customClass: {
            popup: 'swal2-toast',
            title: 'swal2-toast-title',
            content: 'swal2-toast-content',
          },
        });
      } else {
        // Fallback para console
        console.info(`ℹ️ ${title}: ${message || ''}`);
      }
    } else if (Toast) {
      // 🚀 MELHORIA: Toast mobile mais compacto
      Toast.show({
        type: 'info',
        text1: title,
        text2: message,
        position: 'top',
        visibilityTime: 3000,
        autoHide: true,
        topOffset: Platform.OS === 'ios' ? 50 : 40,
        text1Style: { 
          fontSize: 14, 
          fontWeight: '600',
          fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
        },
        text2Style: { 
          fontSize: 12,
          fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
        },
      });
    } else {
      Alert.alert(title, message || '');
    }
  },

  warning: (title: string, message?: string) => {
    if (Platform.OS === 'web') {
      // 🚀 MELHORIA: Toast de warning compacto
      const Swal = getSwal();
      if (Swal) {
        Swal.fire({
          icon: 'warning',
          title: title,
          text: message || '',
          timer: 4000,
          timerProgressBar: true,
          showConfirmButton: true,
          confirmButtonText: 'OK',
          confirmButtonColor: '#f59e0b',
          toast: false, // Modal para warnings importantes
          position: 'center',
          padding: '1.5rem',
          customClass: {
            popup: 'swal2-popup-compact',
            title: 'swal2-title-compact',
            content: 'swal2-content-compact',
            confirmButton: 'swal2-confirm-compact',
          },
        });
      } else {
        // Fallback para console
        console.warn(`⚠️ ${title}: ${message || ''}`);
        if (typeof window !== 'undefined' && window.alert) {
          alert(`${title}\n${message || ''}`);
        }
      }
    } else if (Toast) {
      // 🚀 MELHORIA: Toast mobile mais compacto
      Toast.show({
        type: 'info',
        text1: title,
        text2: message,
        position: 'top',
        visibilityTime: 4000,
        autoHide: true,
        topOffset: Platform.OS === 'ios' ? 50 : 40,
        text1Style: { 
          fontSize: 14, 
          fontWeight: '600',
          fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
        },
        text2Style: { 
          fontSize: 12,
          fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
        },
      });
    } else {
      Alert.alert(title, message || '');
    }
  },

  // 🚀 NOVO: Toast de progresso compacto para envio de registros
  progress: (title: string, message?: string) => {
    if (Platform.OS === 'web') {
      const Swal = getSwal();
      if (Swal) {
        Swal.fire({
          icon: 'info',
          title: title,
          text: message || 'Aguarde...',
          timer: 15000,
          timerProgressBar: true,
          showConfirmButton: false,
          toast: true,
          position: 'top-end',
          width: 'auto',
          padding: '0.75rem 1rem',
          allowOutsideClick: false,
          allowEscapeKey: false,
          customClass: {
            popup: 'swal2-toast',
            title: 'swal2-toast-title',
            content: 'swal2-toast-content',
          },
          didOpen: () => {
            Swal.showLoading();
          },
        });
      }
    } else if (Toast) {
      // 🚀 MELHORIA: Toast mobile mais compacto
      Toast.show({
        type: 'info',
        text1: title,
        text2: message || 'Aguarde...',
        position: 'top',
        visibilityTime: 15000,
        autoHide: false,
        topOffset: Platform.OS === 'ios' ? 60 : 50,
        text1Style: { 
          fontSize: 14, 
          fontWeight: '600',
          fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
        },
        text2Style: { 
          fontSize: 12,
          fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
        },
      });
    }
  },

  // 🚀 NOVO: Fechar toast de progresso
  hide: () => {
    if (Platform.OS === 'web') {
      const Swal = getSwal();
      if (Swal) {
        Swal.close();
      }
    } else if (Toast) {
      Toast.hide();
    }
  },
};
