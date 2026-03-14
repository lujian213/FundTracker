import { VirtualStrategy } from '../types';
import { strategyConfig, StrategyMeta } from './strategyConfig';

// Mapping of strategy keys to their import functions
const strategyImportMap: Record<string, () => Promise<any>> = {
  trendFollowing: () => import('./virtualTradeStrategies/trendFollowing'),
  meanReversion: () => import('./virtualTradeStrategies/meanReversion'),
  constantMix: () => import('./virtualTradeStrategies/constantMix'),
};

/**
 * Gets the list of available strategy keys
 */
export function getAvailableStrategyKeys(): string[] {
  return Object.keys(strategyConfig);
}

/**
 * Gets the meta information for all available strategies
 */
export function getAllStrategyMeta(): StrategyMeta[] {
  return Object.values(strategyConfig);
}

/**
 * Gets the meta information for a specific strategy
 */
export function getStrategyMeta(key: string): StrategyMeta | null {
  return strategyConfig[key] || null;
}

/**
 * Dynamically loads a strategy implementation by key
 */
export async function loadStrategy(key: string): Promise<VirtualStrategy | null> {
  const strategyImport = strategyImportMap[key as keyof typeof strategyImportMap];
  if (!strategyImport) {
    console.warn(`Unknown strategy key: ${key}`);
    return null;
  }

  try {
    const module = await strategyImport();
    // Each strategy module exports a named export with the strategy named after the key
    // e.g., trendFollowingStrategy for the 'trendFollowing' key
    const strategyExportName = `${key}Strategy`;
    const strategy = module[strategyExportName] || module.default || null;

    if (!strategy) {
      console.error(`Strategy ${key} not found in module`);
      return null;
    }

    return strategy;
  } catch (error) {
    console.error(`Failed to load strategy ${key}:`, error);
    return null;
  }
}

/**
 * Loads all available strategies
 */
export async function loadAllStrategies(): Promise<Array<{ key: string; strategy: VirtualStrategy; meta: StrategyMeta }>> {
  const results: Array<{ key: string; strategy: VirtualStrategy; meta: StrategyMeta }> = [];

  for (const key of getAvailableStrategyKeys()) {
    const strategy = await loadStrategy(key);
    const meta = getStrategyMeta(key);

    if (strategy && meta) {
      results.push({ key, strategy, meta });
    }
  }

  return results;
}

/**
 * Gets a static array of all strategy configurations (without loading the implementation)
 * This can be used for UI rendering without loading strategy code
 */
export function getStaticStrategyList(): Array<{ key: string; meta: StrategyMeta }> {
  return Object.entries(strategyConfig).map(([key, meta]) => ({
    key,
    meta
  }));
}

/**
 * Synchronously get all currently available strategy data (meta only)
 * This is suitable for UI components that need to display strategy info without loading implementations
 */
export function getAvailableStrategiesInfo(): Array<{ key: string; name: string; description: string }> {
  return Object.entries(strategyConfig).map(([key, meta]) => ({
    key,
    name: meta.name,
    description: meta.description
  }));
}