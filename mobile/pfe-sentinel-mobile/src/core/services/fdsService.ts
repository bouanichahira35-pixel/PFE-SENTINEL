// BLOC 1 - Role du fichier.
// Ce fichier gere un service mobile lie a fdsService.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import { ProductsRepo, type ProductRow } from '../db/productsRepo';
import { SettingsStore } from '../settings/settingsStore';
import { SessionStore } from '../session/sessionStore';

function safeFilename(input: string) {
  return String(input || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80);
}

async function openAndroidFile(uri: string, mimeType: string) {
  const contentUri = await FileSystem.getContentUriAsync(uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1,
    type: mimeType,
  });
}

export const FdsService = {
  async openOrDownload(product: ProductRow): Promise<'opened' | 'downloaded_opened'> {
    if (product.fdsLocalPath) {
      await openAndroidFile(product.fdsLocalPath, 'application/pdf');
      return 'opened';
    }

    if (!product.fdsFileUrl) throw new Error('Aucune FDS liée à ce produit');

    const session = await SessionStore.get();
    if (!session?.token) throw new Error('Session absente');

    const baseUrl = await SettingsStore.getApiBaseUrl();
    const url = `${baseUrl}${product.fdsFileUrl}`;

    const dir = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ''}fds/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});

    const target = `${dir}${safeFilename(product.codeProduct)}_${Date.now()}.pdf`;

    const result = await FileSystem.downloadAsync(url, target, {
      headers: { Authorization: `Bearer ${session.token}` },
    });

    if (result.status !== 200) throw new Error(`Téléchargement FDS échoué (HTTP ${result.status})`);

    await ProductsRepo.setFdsLocalPath(product.id, result.uri);
    await openAndroidFile(result.uri, 'application/pdf');
    return 'downloaded_opened';
  },
};

