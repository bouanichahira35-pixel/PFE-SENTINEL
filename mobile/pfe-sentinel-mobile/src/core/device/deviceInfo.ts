// BLOC 1 - Role du fichier.
// Ce fichier participe a l'application mobile autour de deviceInfo.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const KEY_INSTALL_ID = 'device.install_id.v1';

function randomId() {
  const r = Math.random().toString(16).slice(2);
  return `inst_${Date.now()}_${r}`;
}

async function getInstallId(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEY_INSTALL_ID);
  if (existing && existing.trim()) return existing.trim();
  const created = randomId();
  await AsyncStorage.setItem(KEY_INSTALL_ID, created);
  return created;
}

export type EventMeta = {
  time: { createdAtDeviceIso: string };
  device: { installId: string; platform: string; storage?: { freeBytes: number; totalBytes: number } };
};

export const DeviceInfo = {
  async getEventMeta(): Promise<EventMeta> {
    const installId = await getInstallId();
    let freeBytes = 0;
    let totalBytes = 0;
    try {
      freeBytes = Number(await FileSystem.getFreeDiskStorageAsync());
      totalBytes = Number(await FileSystem.getTotalDiskCapacityAsync());
    } catch {
      // best-effort
    }
    return {
      time: { createdAtDeviceIso: new Date().toISOString() },
      device: {
        installId,
        platform: String(Platform.OS || 'unknown'),
        storage: Number.isFinite(freeBytes) && Number.isFinite(totalBytes) ? { freeBytes, totalBytes } : undefined,
      },
    };
  },
};

