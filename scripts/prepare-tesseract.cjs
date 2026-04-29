#!/usr/bin/env node
/**
 * 准备 Tesseract.js 本地资源
 *
 * 在构建/部署时运行此脚本，从 npm 包和 CDN 复制必要文件到 public 目录
 * 这样可以避免将这些大文件提交到 git
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TESSDATA_DIR = path.join(PUBLIC_DIR, 'tessdata');
const TESSERACT_DIR = path.join(PUBLIC_DIR, 'tesseract');
const TESSERACT_CORE_DIR = path.join(PUBLIC_DIR, 'tesseract-core');

// 需要的语言数据
const LANG_DATA = [
  { lang: 'chi_sim', url: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_sim/4.0.0/chi_sim.traineddata.gz' },
  { lang: 'eng', url: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz' },
];

// 需要从 npm 包复制的文件
const NPM_FILES = [
  {
    src: 'node_modules/tesseract.js/dist/worker.min.js',
    dest: 'tesseract/worker.min.js',
  },
];

// tesseract.js-core 需要复制的文件（所有 WASM 变体）
const CORE_FILES = [
  'tesseract-core.js',
  'tesseract-core.wasm',
  'tesseract-core.wasm.js',
  'tesseract-core-simd.js',
  'tesseract-core-simd.wasm',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-lstm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.js',
  'tesseract-core-simd-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd.js',
  'tesseract-core-relaxedsimd.wasm',
  'tesseract-core-relaxedsimd.wasm.js',
  'tesseract-core-relaxedsimd-lstm.js',
  'tesseract-core-relaxedsimd-lstm.wasm',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

/**
 * 下载文件
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    console.log(`下载: ${url} -> ${destPath}`);

    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // 处理重定向
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`下载失败: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * 复制文件
 */
function copyFile(srcPath, destPath) {
  console.log(`复制: ${srcPath} -> ${destPath}`);
  fs.copyFileSync(srcPath, destPath);
}

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('准备 Tesseract.js 本地资源...\n');

  // 创建目录
  ensureDir(TESSDATA_DIR);
  ensureDir(TESSERACT_DIR);
  ensureDir(TESSERACT_CORE_DIR);

  // 下载语言数据
  console.log('=== 下载语言数据 ===');
  for (const { lang, url } of LANG_DATA) {
    const destPath = path.join(TESSDATA_DIR, `${lang}.traineddata.gz`);
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (stats.size > 1000000) { // 大于 1MB 说明是完整文件
        console.log(`已存在: ${destPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
        continue;
      }
    }
    await downloadFile(url, destPath);
  }

  // 复制 worker 文件
  console.log('\n=== 复制 worker 文件 ===');
  for (const { src, dest } of NPM_FILES) {
    const srcPath = path.join(__dirname, '..', src);
    const destPath = path.join(PUBLIC_DIR, dest);
    if (fs.existsSync(srcPath)) {
      copyFile(srcPath, destPath);
    } else {
      console.log(`警告: 源文件不存在: ${srcPath}`);
    }
  }

  // 复制 core 文件
  console.log('\n=== 复制 tesseract.js-core 文件 ===');
  const coreSrcDir = path.join(__dirname, '..', 'node_modules', 'tesseract.js-core');
  for (const file of CORE_FILES) {
    const srcPath = path.join(coreSrcDir, file);
    const destPath = path.join(TESSERACT_CORE_DIR, file);
    if (fs.existsSync(srcPath)) {
      copyFile(srcPath, destPath);
    } else {
      console.log(`警告: 源文件不存在: ${srcPath}`);
    }
  }

  console.log('\n✓ Tesseract.js 本地资源准备完成');
}

main().catch((err) => {
  console.error('错误:', err.message);
  process.exit(1);
});