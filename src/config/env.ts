import Constants from 'expo-constants';

const getEnvVar = (key: string, defaultValue?: string): string => {
  // Tentar várias fontes de variáveis de ambiente
  const value =
    Constants.expoConfig?.extra?.[key] ||
    process.env[`EXPO_PUBLIC_${key}`] ||
    process.env[key] ||
    defaultValue ||
    '';

  if (!value && __DEV__) {
    console.warn(`⚠️ Missing environment variable: ${key}. Using default or empty value.`);
  }

  return value;
};

export const env = {
  SUPABASE_URL: getEnvVar('SUPABASE_URL', ''),
  SUPABASE_ANON_KEY: getEnvVar('SUPABASE_ANON_KEY', ''),
  SHEETS_ENDPOINT_URL: getEnvVar('SHEETS_ENDPOINT_URL', ''),
};
