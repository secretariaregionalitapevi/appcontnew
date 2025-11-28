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

    // Adicionar estilos customizados para SweetAlert2
    const customStyle = document.createElement('style');
    customStyle.id = 'sweetalert2-custom-styles';
    customStyle.textContent = `
      .swal2-popup {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        font-size: 16px !important;
        border-radius: 12px !important;
        padding: 2rem !important;
      }
      .swal2-title {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        font-size: 24px !important;
        font-weight: 600 !important;
        color: #212121 !important;
        line-height: 1.4 !important;
        margin-bottom: 1rem !important;
      }
      .swal2-content {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        font-size: 16px !important;
        font-weight: 400 !important;
        color: #4a5568 !important;
        line-height: 1.6 !important;
        margin-top: 0.5rem !important;
      }
      .swal2-confirm {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        font-size: 15px !important;
        font-weight: 500 !important;
        padding: 0.75rem 2rem !important;
        border-radius: 8px !important;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
        transition: all 0.2s ease !important;
      }
      .swal2-confirm:hover {
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
      }
      .swal2-icon {
        margin-bottom: 1.5rem !important;
      }
    `;
    document.head.appendChild(customStyle);
  }
}

export const showToast = {
  success: (title: string, message?: string) => {
    // Se message não foi fornecido, usar title como mensagem única (igual ao contpedras)
    const finalMessage = message || title;
    const finalTitle = message ? title : '';
    
    if (Platform.OS === 'web') {
      // 🚀 MELHORIA: Toast de sucesso mais rápido e elegante
      const Swal = getSwal();
      if (Swal) {
        Swal.fire({
          icon: 'success',
          title: finalTitle || finalMessage,
          text: finalTitle ? finalMessage : '',
          timer: 1500, // Reduzido de 2000 para 1500ms (mais rápido)
          timerProgressBar: false,
          showConfirmButton: false,
          toast: true,
          position: 'top-end',
          width: 'auto',
          padding: '1rem',
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
      // No mobile, usar apenas text1 se não houver message (igual ao contpedras)
      // Garantir que funcione no iOS e Android
      try {
        Toast.show({
          type: 'success',
          text1: finalTitle || finalMessage,
          text2: finalTitle ? finalMessage : undefined,
          position: 'top',
          visibilityTime: 1500, // Reduzido de 2000 para 1500ms (mais rápido)
          autoHide: true,
          topOffset: Platform.OS === 'ios' ? 60 : 50,
          text1Style: { fontSize: 14, fontWeight: '600' },
          text2Style: { fontSize: 12 },
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
      // 🚀 MELHORIA: Toast de erro mais elegante e informativo
      const Swal = getSwal();
      if (Swal) {
        Swal.fire({
          icon: 'error',
          title: title,
          text: message || '',
          timer: 4000, // Reduzido de 5000 para 4000ms (mais rápido)
          timerProgressBar: true,
          showConfirmButton: true,
          confirmButtonText: 'OK',
          confirmButtonColor: '#ef4444',
          toast: false, // Modal para erros importantes
          position: 'center',
        });
      } else {
        // Fallback para alert nativo
        console.error(`❌ ${title}: ${message || ''}`);
        if (typeof window !== 'undefined' && window.alert) {
          alert(`${title}\n${message || ''}`);
        }
      }
    } else if (Toast) {
      Toast.show({
        type: 'error',
        text1: title,
        text2: message,
        position: 'top',
        visibilityTime: 3500, // Reduzido de 4000 para 3500ms (mais rápido)
        autoHide: true,
        topOffset: Platform.OS === 'ios' ? 50 : 40,
        text1Style: { fontSize: 14, fontWeight: '600' },
        text2Style: { fontSize: 12 },
      });
    } else {
      Alert.alert(title, message || '');
    }
  },

  info: (title: string, message?: string) => {
    if (Platform.OS === 'web') {
      // Usar SweetAlert2 na web - modo toast (igual ao ContPedras)
      const Swal = getSwal();
      if (Swal) {
        Swal.fire({
          icon: 'info',
          title: title,
          text: message || '',
          timer: 3000, // 3 segundos
          timerProgressBar: false,
          showConfirmButton: false,
          toast: true, // Modo toast (menor e mais elegante)
          position: 'top-end',
          width: 'auto',
          padding: '1rem',
        });
      } else {
        // Fallback para console
        console.info(`ℹ️ ${title}: ${message || ''}`);
      }
    } else if (Toast) {
      Toast.show({
        type: 'info',
        text1: title,
        text2: message,
        position: 'top',
        visibilityTime: 3000,
        autoHide: true,
        topOffset: Platform.OS === 'ios' ? 50 : 40,
        text1Style: { fontSize: 14, fontWeight: '600' },
        text2Style: { fontSize: 12 },
      });
    } else {
      Alert.alert(title, message || '');
    }
  },

  warning: (title: string, message?: string) => {
    if (Platform.OS === 'web') {
      // Usar SweetAlert2 na web
      const Swal = getSwal();
      if (Swal) {
        Swal.fire({
          icon: 'warning',
          title: title,
          text: message || '',
          timer: 5000,
          timerProgressBar: true,
          showConfirmButton: true,
          confirmButtonText: 'OK',
          confirmButtonColor: '#f59e0b',
        });
      } else {
        // Fallback para console
        console.warn(`⚠️ ${title}: ${message || ''}`);
        if (typeof window !== 'undefined' && window.alert) {
          alert(`${title}\n${message || ''}`);
        }
      }
    } else if (Toast) {
      Toast.show({
        type: 'info',
        text1: title,
        text2: message,
        position: 'top',
        visibilityTime: 4000,
        autoHide: true,
        topOffset: Platform.OS === 'ios' ? 50 : 40,
        text1Style: { fontSize: 14, fontWeight: '600' },
        text2Style: { fontSize: 12 },
      });
    } else {
      Alert.alert(title, message || '');
    }
  },

  // 🚀 NOVO: Toast de progresso para envio de registros
  progress: (title: string, message?: string) => {
    if (Platform.OS === 'web') {
      const Swal = getSwal();
      if (Swal) {
        Swal.fire({
          icon: 'info',
          title: title,
          text: message || 'Aguarde...',
          timer: 15000, // 15 segundos (tempo máximo esperado)
          timerProgressBar: true,
          showConfirmButton: false,
          toast: true,
          position: 'top-end',
          width: 'auto',
          padding: '1rem',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });
      }
    } else if (Toast) {
      Toast.show({
        type: 'info',
        text1: title,
        text2: message || 'Aguarde...',
        position: 'top',
        visibilityTime: 15000,
        autoHide: false, // Não fechar automaticamente
        topOffset: Platform.OS === 'ios' ? 60 : 50,
        text1Style: { fontSize: 14, fontWeight: '600' },
        text2Style: { fontSize: 12 },
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
