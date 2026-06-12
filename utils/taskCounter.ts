/**
 * 任务计数器辅助函数
 *
 * 修复版本：累加逻辑，避免并发状态冲突
 */

/**
 * 计算手动刷新的总任务数
 *
 * 手动刷新包含4类任务：
 * - 基金估值更新（portfolio.length）
 * - 基金历史数据更新（portfolio.length）
 * - 指数实时数据更新（indicesConfig.length）
 * - 指数历史数据更新（indicesConfig.length）
 *
 * @param portfolioLength - 基金数量
 * @param indicesConfigLength - 指数数量
 * @returns 总任务数
 */
export function calculateTotalTasks(portfolioLength: number, indicesConfigLength: number): number {
  return portfolioLength * 2 + indicesConfigLength * 2;
}

/**
 * 计算累加式任务计数（修复版本）
 *
 * 修复原理：累加而非覆盖，确保所有并发任务的计数都被保留
 *
 * Bug场景对比：
 * - Bug版本：prevCount=62, newTasks=24 -> 返回24（覆盖，丢失38个计数）
 * - 修复版本：prevCount=62, newTasks=24 -> 返回86（累加，保留所有计数）
 *
 * @param prevCount - 当前计数器值
 * @param newTasks - 新增任务数
 * @returns 新的计数器值（累加）
 */
/**
 * 创建进度回调函数
 *
 * 返回一个可直接传递给批处理函数的回调，每次调用时递减任务计数（确保非负）
 *
 * @param setBackgroundTasks - React state setter函数
 * @returns 进度回调函数
 */
export function createProgressCallback(setBackgroundTasks: React.Dispatch<React.SetStateAction<number>>): () => void {
  return () => setBackgroundTasks(prev => Math.max(0, prev - 1));
}

/**
 * 增加任务计数（累加式）
 *
 * @param setBackgroundTasks - React state setter函数
 * @param count - 新增任务数
 */
export function incrementTaskCount(setBackgroundTasks: React.Dispatch<React.SetStateAction<number>>, count: number): void {
  setBackgroundTasks(prev => prev + count);
}