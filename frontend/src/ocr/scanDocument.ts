import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from '../api';
import type { DocumentParseResult } from '../components/DocumentScanConfirmModal';

async function imageUriToBase64(uri: string): Promise<string> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!b64 || b64.length < 100) {
    throw new Error('Não foi possível ler a foto. Tente tirar outra imagem.');
  }
  return b64;
}

async function prepareImage(uri: string) {
  return ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
}

/** Prepara JPEG e envia ao backend para OCR + extração dos dados. */
export async function scanDocumentFromUri(uri: string): Promise<DocumentParseResult> {
  await api.wakeServer();
  const prepared = await prepareImage(uri);

  // Base64 é mais confiável no Expo Go (iOS); upload multipart como reserva
  try {
    const image_base64 = await imageUriToBase64(prepared.uri);
    return await api.scanDocumentImage(image_base64);
  } catch (base64Err: any) {
    const msg = String(base64Err?.message || '');
    if (msg.toLowerCase().includes('login') || msg.toLowerCase().includes('conexão') || msg.toLowerCase().includes('internet')) {
      throw base64Err;
    }
    return api.scanDocumentUpload(prepared.uri);
  }
}

export function emptyScanResult(warning?: string): DocumentParseResult {
  return {
    establishment: '',
    amount: null,
    category: 'Compras',
    transaction_date: new Date().toISOString(),
    ocr_text: '',
    warnings: warning ? [warning] : [],
    errors: [],
    ok: true,
  };
}
