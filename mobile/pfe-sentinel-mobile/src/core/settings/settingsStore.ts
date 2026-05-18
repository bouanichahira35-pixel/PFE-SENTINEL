import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_API_BASE_URL = 'settings.apiBaseUrl';
const KEY_ACTIVE_SITE = 'settings.activeSite';

const DEFAULT_API_BASE_URL = 'http://10.0.2.2:5000';
const DEFAULT_ACTIVE_SITE = 'SITE-DEFAULT';

export const SettingsStore = {
  async getApiBaseUrl(): Promise<string> {
    const value = await AsyncStorage.getItem(KEY_API_BASE_URL);
    return (value && value.trim().length > 0 ? value : DEFAULT_API_BASE_URL).trim();
  },
  async setApiBaseUrl(url: string): Promise<void> {
    await AsyncStorage.setItem(KEY_API_BASE_URL, String(url || '').trim());
  },

  async getActiveSite(): Promise<string> {
    const value = await AsyncStorage.getItem(KEY_ACTIVE_SITE);
    return (value && value.trim().length > 0 ? value : DEFAULT_ACTIVE_SITE).trim();
  },
  async setActiveSite(site: string): Promise<void> {
    await AsyncStorage.setItem(KEY_ACTIVE_SITE, String(site || '').trim());
  },
};

