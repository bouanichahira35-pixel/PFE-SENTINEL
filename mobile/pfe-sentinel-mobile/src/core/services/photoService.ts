// BLOC 1 - Role du fichier.
// Ce fichier gere un service mobile lie a photoService.
// Point de vigilance: garder la compatibilite avec la synchronisation offline et les types TypeScript.

import * as ImagePicker from 'expo-image-picker';

export type CapturedPhoto = {
  uri: string;
  base64?: string;
};

export const PhotoService = {
  async takePhoto(): Promise<CapturedPhoto | null> {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Permission caméra refusée');

    const result = await ImagePicker.launchCameraAsync({
      // Keep mobile sync usable on weak connections by avoiding oversized base64 payloads.
      quality: 0.35,
      base64: true,
      exif: false,
    });

    if (result.canceled) return null;
    const asset = result.assets?.[0];
    if (!asset?.uri) return null;

    return { uri: asset.uri, base64: asset.base64 || undefined };
  },
};
