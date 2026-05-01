// services/ocrService.ts

import { parseFundInfo, OcrFundData, ParseResult } from '../utils/fundOcrParser';
import { chunk } from '../utils/arrayUtils';

export interface OcrResult {
  success: boolean;
  text: string;
  confidence: number;
  data?: OcrFundData;
  missingFields?: string[];
  error?: string;
}

// 缓存本地资源检查结果
let localResourcesCache: boolean | null = null;

// 缓存动态导入的 Tesseract 模块
let tesseractModule: typeof import('tesseract.js') | null = null;

async function getTesseract() {
  if (!tesseractModule) {
    tesseractModule = await import('tesseract.js');
  }
  return tesseractModule;
}

async function checkLocalResourcesAvailable(): Promise<boolean> {
  if (localResourcesCache !== null) {
    return localResourcesCache;
  }
  try {
    const response = await fetch('/tessdata/chi_sim.traineddata.gz', { method: 'HEAD' });
    localResourcesCache = response.ok;
    return localResourcesCache;
  } catch {
    localResourcesCache = false;
    return false;
  }
}

/**
 * 纯 OCR 识别，不进行解析
 * 用于需要自定义解析逻辑的场景（如交易截图）
 */
export async function recognizeImageRaw(
  imageFile: File,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; text: string; confidence: number; error?: string }> {
  try {
    const imageUrl = URL.createObjectURL(imageFile);

    const logger = (m: any) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    };

    const Tesseract = await getTesseract();
    const useLocalResources = await checkLocalResourcesAvailable();

    const tesseractConfig = useLocalResources
      ? {
          logger,
          workerPath: '/tesseract/worker.min.js',
          langPath: '/tessdata',
          corePath: '/tesseract-core',
          workerBlobURL: false,
        }
      : { logger };

    const result = await Tesseract.recognize(
      imageUrl,
      'chi_sim+eng',
      tesseractConfig
    );

    URL.revokeObjectURL(imageUrl);

    const text = result.data.text;
    const confidence = result.data.confidence;

    return {
      success: true,
      text,
      confidence,
    };
  } catch (err) {
    return {
      success: false,
      text: '',
      confidence: 0,
      error: err instanceof Error ? err.message : 'OCR识别失败',
    };
  }
}

export async function recognizeImage(
  imageFile: File,
  onProgress?: (progress: number) => void
): Promise<OcrResult> {
  try {
    const imageUrl = URL.createObjectURL(imageFile);

    const logger = (m: any) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    };

    const Tesseract = await getTesseract();
    const useLocalResources = await checkLocalResourcesAvailable();

    const tesseractConfig = useLocalResources
      ? {
          logger,
          workerPath: '/tesseract/worker.min.js',
          langPath: '/tessdata',
          corePath: '/tesseract-core',
          workerBlobURL: false,
        }
      : { logger };

    const result = await Tesseract.recognize(
      imageUrl,
      'chi_sim+eng',
      tesseractConfig
    );

    URL.revokeObjectURL(imageUrl);

    const text = result.data.text;
    const confidence = result.data.confidence;

    const parseResult = parseFundInfo(text);

    if (parseResult.success) {
      return {
        success: true,
        text,
        confidence,
        data: parseResult.data,
      };
    } else {
      return {
        success: false,
        text,
        confidence,
        missingFields: parseResult.missingFields,
      };
    }
  } catch (err) {
    return {
      success: false,
      text: '',
      confidence: 0,
      error: err instanceof Error ? err.message : 'OCR识别失败',
    };
  }
}

/**
 * 批量识别多张图片
 *
 * @param imageFiles 图片文件数组
 * @param concurrency 并发数量（默认从系统配置读取）
 * @param onProgress 进度回调
 * @returns 批量识别结果
 */
export interface BatchOcrResult {
  results: OcrResult[];
  successCount: number;
  failCount: number;
}

export async function recognizeBatch(
  imageFiles: File[],
  concurrency: number = 3,
  onProgress?: (processed: number, total: number) => void
): Promise<BatchOcrResult> {
  const results: OcrResult[] = [];
  let processed = 0;

  // 分批并发处理
  const batches = chunk(imageFiles, concurrency);

  for (const batch of batches) {
    const promises = batch.map(file => recognizeImage(file));
    const batchResults = await Promise.all(promises);

    for (const r of batchResults) {
      results.push(r);
      processed++;
      if (onProgress) onProgress(processed, imageFiles.length);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;

  return { results, successCount, failCount };
}