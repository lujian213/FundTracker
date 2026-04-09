/**
 * services/rootService.ts
 *
 * 根服务对象 - 聚合测试需要的 service，挂载到 window 供测试用例访问
 */

import * as marketNewsService from './marketNewsService';
import { getTimerJobScheduler } from './timerJobScheduler';

/**
 * Root 对象，包含测试需要的 service
 */
export const Root = {
  marketNewsService,
  timerJobScheduler: getTimerJobScheduler(),
};

/**
 * 挂载 Root 到 window（仅在浏览器环境）
 */
export function mountRoot(): void {
  if (typeof window !== 'undefined') {
    (window as any).__ROOT__ = Root;
  }
}