/**
 * types/userPreferenceTypes.ts
 *
 * 用户偏好类型定义
 */

export type SortOrder = 'asc' | 'desc';

export interface UserPreference {
  sortOrder: SortOrder;
  /** 与基金详情窗口同步显示时的高度 */
  draftModalHeight: number | null;
}

export const DEFAULT_USER_PREFERENCE: UserPreference = {
  sortOrder: 'desc',
  draftModalHeight: null,
};