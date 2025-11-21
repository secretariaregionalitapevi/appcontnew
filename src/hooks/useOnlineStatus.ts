import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected === true && state.isInternetReachable === true);
    });

    // Verificar status inicial
    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected === true && state.isInternetReachable === true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return isOnline;
};
