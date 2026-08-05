/**
 * 截屏工具函数
 * 支持普通截屏和滚动截屏（所见即所得）
 */

/**
 * 滚动截屏选项
 */
export interface ScrollScreenshotOptions {
  onProgress?: (current: number, total: number) => void;
  onCancel?: () => boolean;  // 返回 true 表示取消
  maxScreens?: number;  // 最大截图数量，默认 10
}

/**
 * 滚动截屏结果
 */
export interface ScrollScreenshotResult {
  blob: Blob;
  screenCount: number;  // 实际截取的屏数
}

/**
 * 智能截屏选项
 */
export interface SmartScreenshotOptions extends ScrollScreenshotOptions {
  onSuccess?: (isScroll: boolean, screenCount?: number) => void;
  onError?: (error: Error) => void;
}

/**
 * 检测是否需要滚动截屏
 * @returns 如果页面高度大于视口高度，返回 true
 */
export function needsScrollScreenshot(): boolean {
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = window.innerHeight;
  return scrollHeight > clientHeight;
}

/**
 * 截取单屏
 * @returns 单屏截图 Blob
 */
export async function captureSingleScreen(): Promise<Blob> {
  try {
    // 使用类型断言以支持 Chrome 的实验性 preferCurrentTab 属性
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' } as MediaTrackConstraints,
      // @ts-expect-error Chrome 实验性属性
      preferCurrentTab: true,
      audio: false
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Failed to create blob')), 'image/png');
    });

    // Clean up
    stream.getTracks().forEach(track => track.stop());
    video.remove();

    return blob;
  } catch (error) {
    console.error('截取单屏失败:', error);
    throw error;
  }
}

/**
 * 将 Blob 转换为 ImageBitmap
 * @param blob 图片 Blob
 * @returns ImageBitmap 对象
 */
async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(blob);
}

/**
 * 拼接多张图片
 * @param imageBlobs 图片 Blob 数组
 * @returns 拼接后的完整图片 Blob
 */
export async function stitchImages(imageBlobs: Blob[]): Promise<Blob> {
  if (imageBlobs.length === 0) {
    throw new Error('No images to stitch');
  }

  // 将所有 Blob 转换为 ImageBitmap
  const images = await Promise.all(imageBlobs.map(blobToImageBitmap));

  // 计算总高度和宽度
  const width = images[0].width;
  const totalHeight = images.reduce((sum, img) => sum + img.height, 0);

  // 创建 Canvas 并绘制拼接后的图片
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  let currentY = 0;

  for (const img of images) {
    ctx.drawImage(img, 0, currentY);
    currentY += img.height;
  }

  // 转换为 Blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob'));
      }
    }, 'image/png');
  });
}

/**
 * 执行滚动截屏
 * @param options 滚动截屏选项
 * @returns 拼接后的完整图片 Blob 和截取的屏数
 */
export async function captureScrollingPage(options: ScrollScreenshotOptions = {}): Promise<ScrollScreenshotResult> {
  const {
    onProgress,
    onCancel,
    maxScreens = 10
  } = options;

  // 记录当前滚动位置
  const savedScrollX = window.scrollX;
  const savedScrollY = window.scrollY;

  // 获取所有固定元素（使用 data-screenshot-ignore 标记和 CSS 选择器）
  const fixedElements = document.querySelectorAll(
    '[data-screenshot-ignore="true"], header, .fixed, [style*="position: fixed"], [style*="position:fixed"]'
  );

  try {
    // 在整个截图过程中隐藏所有固定元素
    fixedElements.forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.setProperty('display', 'none', 'important');
    });

    // 获取页面尺寸
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;

    // 计算需要截取的次数
    const totalScreens = Math.ceil(scrollHeight / clientHeight);

    if (totalScreens > maxScreens) {
      throw new Error(`页面过长（${totalScreens}屏），建议分段截图`);
    }

    // 滚动到顶部
    window.scrollTo(0, 0);

    // 等待滚动完成
    await new Promise(resolve => setTimeout(resolve, 200));

    const imageBlobs: Blob[] = [];

    // 逐屏截图
    for (let i = 0; i < totalScreens; i++) {
      // 检查是否取消
      if (onCancel && onCancel()) {
        throw new Error('Screenshot cancelled');
      }

      // 通知进度
      if (onProgress) {
        onProgress(i + 1, totalScreens);
      }

      // 等待一帧确保渲染
      await new Promise(resolve => requestAnimationFrame(resolve));

      // 截取当前屏（固定元素已经全部隐藏）
      const blob = await captureSingleScreen();
      imageBlobs.push(blob);

      // 如果不是最后一屏，滚动到下一屏
      if (i < totalScreens - 1) {
        window.scrollBy(0, clientHeight);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // 拼接所有截图（不需要裁剪，因为固定元素都已隐藏）
    const stitchedBlob = await stitchImages(imageBlobs);

    return {
      blob: stitchedBlob,
      screenCount: totalScreens
    };
  } finally {
    // 恢复所有固定元素的显示
    fixedElements.forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.removeProperty('display');
    });

    // 恢复原滚动位置
    window.scrollTo(savedScrollX, savedScrollY);
  }
}

/**
 * 智能截屏入口
 * 自动检测是否需要滚动截屏并执行相应逻辑
 * @param options 智能截屏选项
 */
export async function smartScreenshot(options: SmartScreenshotOptions = {}): Promise<void> {
  const {
    onProgress,
    onCancel,
    maxScreens,
    onSuccess,
    onError
  } = options;

  try {
    // 检测是否需要滚动截屏
    const needsScroll = needsScrollScreenshot();

    if (needsScroll) {
      // 执行滚动截屏
      const result = await captureScrollingPage({
        onProgress,
        onCancel,
        maxScreens
      });

      // 复制到剪切板
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': result.blob })
      ]);

      if (onSuccess) {
        onSuccess(true, result.screenCount);
      }
    } else {
      // 执行普通截屏
      const blob = await captureSingleScreen();

      // 复制到剪切板
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);

      if (onSuccess) {
        onSuccess(false);
      }
    }
  } catch (error) {
    console.error('截屏失败:', error);
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  }
}