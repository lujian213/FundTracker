import {
  getSystemParams,
  saveSystemParams,
  getOcrConcurrency,
  setOcrConcurrency,
  resetCache,
} from '../../services/systemConfigService';
import { STORAGE_KEYS } from '../../services/storageKeys';

describe('systemConfigService - SystemParams', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCache();
  });

  describe('getSystemParams', () => {
    it('returns default values when no config exists', () => {
      const params = getSystemParams();
      expect(params.ocrConcurrency).toBe(3);
    });

    it('returns saved values from localStorage', () => {
      localStorage.setItem(STORAGE_KEYS.SYSTEM_CONFIG, JSON.stringify({
        systemParams: { ocrConcurrency: 5 }
      }));
      resetCache();
      const params = getSystemParams();
      expect(params.ocrConcurrency).toBe(5);
    });
  });

  describe('saveSystemParams', () => {
    it('saves params to localStorage', () => {
      saveSystemParams({ ocrConcurrency: 4 });
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.SYSTEM_CONFIG) || '{}');
      expect(stored.systemParams.ocrConcurrency).toBe(4);
    });

    it('clamps ocrConcurrency to valid range [1, 8]', () => {
      saveSystemParams({ ocrConcurrency: 0 });
      expect(getOcrConcurrency()).toBe(1);

      saveSystemParams({ ocrConcurrency: 10 });
      expect(getOcrConcurrency()).toBe(8);

      saveSystemParams({ ocrConcurrency: 5 });
      expect(getOcrConcurrency()).toBe(5);
    });
  });

  describe('getOcrConcurrency / setOcrConcurrency', () => {
    it('gets and sets ocrConcurrency', () => {
      setOcrConcurrency(6);
      expect(getOcrConcurrency()).toBe(6);
    });
  });
});