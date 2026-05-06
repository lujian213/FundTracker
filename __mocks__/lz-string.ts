/**
 * Mock for lz-string in Jest tests
 */

const LZString = {
  compress: jest.fn((str: string) => str), // 返回原始字符串，不做压缩
  decompress: jest.fn((str: string) => str), // 返回原始字符串，不做解压
  compressToBase64: jest.fn((str: string) => str),
  decompressFromBase64: jest.fn((str: string) => str),
  compressToUTF16: jest.fn((str: string) => str),
  decompressFromUTF16: jest.fn((str: string) => str),
};

export default LZString;