/**
 * 环境变量封装
 * Vite 的 import.meta.env 在 Jest 中不支持，通过此模块封装后可在测试中 mock
 */

export const isDev = import.meta.env.DEV;
export const isProd = import.meta.env.PROD;
export const mode = import.meta.env.MODE;