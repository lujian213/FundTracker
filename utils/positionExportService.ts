/**
 * Position Export and Compare Service
 * Handles export/import logic and comparison calculations
 */

import { Ticker, ValuationData } from '../types';
import { PositionExportData, PositionExportItem, PositionCompareResult, PositionCompareItem, ImportError } from '../types/positionExportTypes';
import { computePositions } from './positionHelper';
import { localDateStr } from './backupService';

// Unified error message for import format validation failures
const IMPORT_FORMAT_ERROR_MSG = '导入文件格式不正确，请检查文件是否为有效的JSON格式，且包含必要的字段信息。';

/**
 * Build export data from current positions
 */
export function buildExportData(
  portfolio: Ticker[],
  marketData: Record<string, ValuationData>
): PositionExportData {
  const { entries } = computePositions(portfolio, marketData);
  const exportDate = localDateStr(new Date());

  const positions: PositionExportItem[] = entries.map(entry => {
    const vd = marketData[entry.symbol];
    // Price: prefer currentPrice (valuation), fallback to previousPrice (NAV)
    const price = vd?.currentPrice > 0 ? vd.currentPrice : vd?.previousPrice || 0;

    return {
      symbol: entry.symbol,
      name: entry.name,
      shares: entry.currentShares,
      price: price,
    };
  });

  return { exportDate, positions };
}

/**
 * Export current positions to JSON file
 * Triggers browser download
 */
export function exportPositions(
  portfolio: Ticker[],
  marketData: Record<string, ValuationData>
): void {
  const exportData = buildExportData(portfolio, marketData);

  if (exportData.positions.length === 0) {
    console.warn('No position data to export');
    return;
  }

  // Generate filename: fund_position_YYYY-MM-DD.json
  const filename = `fund_position_${exportData.exportDate}.json`;

  // Trigger download
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validate imported data format
 * Basic validation: JSON format, required fields, field types
 */
export function validateImportData(data: any): ImportError | null {
  // Check exportDate
  if (!data.exportDate || typeof data.exportDate !== 'string') {
    return { message: IMPORT_FORMAT_ERROR_MSG };
  }

  // Check positions array
  if (!data.positions || !Array.isArray(data.positions)) {
    return { message: IMPORT_FORMAT_ERROR_MSG };
  }

  // Validate each position item
  for (const item of data.positions) {
    // Check symbol
    if (!item.symbol || typeof item.symbol !== 'string') {
      return { message: IMPORT_FORMAT_ERROR_MSG };
    }

    // Check name
    if (!item.name || typeof item.name !== 'string') {
      return { message: IMPORT_FORMAT_ERROR_MSG };
    }

    // Check shares (number)
    if (typeof item.shares !== 'number') {
      return { message: IMPORT_FORMAT_ERROR_MSG };
    }

    // Check price (number)
    if (typeof item.price !== 'number') {
      return { message: IMPORT_FORMAT_ERROR_MSG };
    }
  }

  return null; // Validation passed
}

/**
 * Import positions from file
 * Reads file, validates format, returns parsed data
 */
export async function importPositions(
  file: File
): Promise<{ data: PositionExportData | null; error: ImportError | null }> {
  try {
    // Read file content
    const text = await file.text();
    const parsed = JSON.parse(text);

    // Validate format
    const error = validateImportData(parsed);
    if (error) {
      return { data: null, error };
    }

    return { data: parsed as PositionExportData, error: null };
  } catch (e) {
    return {
      data: null,
      error: { message: IMPORT_FORMAT_ERROR_MSG },
    };
  }
}

/**
 * Compute comparison result between local positions and imported data
 * Merges funds, aligns names, calculates differences and totals
 */
export function computeCompareResult(
  localPortfolio: Ticker[],
  localMarketData: Record<string, ValuationData>,
  importedData: PositionExportData
): PositionCompareResult {
  // Get local positions
  const { entries } = computePositions(localPortfolio, localMarketData);

  // Create local position map
  const localMap = new Map<string, typeof entries[0]>();
  entries.forEach(e => localMap.set(e.symbol, e));

  // Create imported position map
  const importedMap = new Map<string, PositionExportItem>();
  importedData.positions.forEach(p => importedMap.set(p.symbol, p));

  // Merge all symbols
  const allSymbols = new Set<string>();
  entries.forEach(e => allSymbols.add(e.symbol));
  importedData.positions.forEach(p => allSymbols.add(p.symbol));

  // Build comparison items
  const items: PositionCompareItem[] = Array.from(allSymbols).map(symbol => {
    const localEntry = localMap.get(symbol);
    const importedItem = importedMap.get(symbol);

    // Name: use local if exists, otherwise imported
    const name = localEntry?.name || importedItem?.name || symbol;

    // Current shares and value
    const currentShares = localEntry?.currentShares || 0;
    const currentValue = localEntry?.marketValue || 0;

    // Imported shares
    const importedShares = importedItem?.shares || 0;

    // Imported value calculation
    let importedValue = 0;
    if (importedShares > 0) {
      // Get price: prefer local marketData, fallback to imported price
      const vd = localMarketData[symbol];
      let price = vd?.currentPrice > 0 ? vd.currentPrice : vd?.previousPrice || 0;

      // If no local price, use imported price
      if (price <= 0 && importedItem?.price) {
        price = importedItem.price;
      }

      importedValue = importedShares * price;
    }

    // Differences
    const sharesDiff = currentShares - importedShares;
    const valueDiff = currentValue - importedValue;

    // Ratio: current/imported percentage
    const ratio = (currentShares > 0 && importedShares > 0)
      ? (currentShares / importedShares) * 100
      : null;

    return {
      symbol,
      name,
      currentShares,
      currentValue,
      importedShares,
      importedValue,
      sharesDiff,
      valueDiff,
      ratio,
    };
  });

  // Sort by name (local display name)
  items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  // Calculate totals
  // Calculate totals in a single pass
  let totalCurrentValue = 0;
  let totalImportedValue = 0;
  let totalValueDiff = 0;
  for (const i of items) {
    totalCurrentValue += i.currentValue;
    totalImportedValue += i.importedValue;
    totalValueDiff += i.valueDiff;
  }

  const totalRatio = (totalCurrentValue > 0 && totalImportedValue > 0)
    ? (totalCurrentValue / totalImportedValue) * 100
    : null;

  return {
    items,
    totalCurrentValue,
    totalImportedValue,
    totalValueDiff,
    totalRatio,
  };
}