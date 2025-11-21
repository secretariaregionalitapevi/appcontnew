import { useState, useEffect, useCallback } from 'react';
import { supabaseDataService } from '../services/supabaseDataService';

export const useOfflineQueue = () => {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const count = await supabaseDataService.countRegistrosPendentes();
      setPendingCount(count);
    } catch (error) {
      console.error('Erro ao contar registros pendentes:', error);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    // Atualizar a cada 5 segundos
    const interval = setInterval(refreshCount, 5000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  return {
    pendingCount,
    loading,
    refreshCount,
  };
};
