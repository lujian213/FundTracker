/**
 * Position Export and Compare Types
 * Used by positionExportService and PositionCompareModal
 */

// Export file format (concise)
export interface PositionExportData {
  exportDate: string;  // YYYY-MM-DD format
  positions: PositionExportItem[];
}

export interface PositionExportItem {
  symbol: string;
  name: string;
  shares: number;
  price: number;
}

// Comparison result item
export interface PositionCompareItem {
  symbol: string;
  name: string;              // Aligned name (local preferred)
  currentShares: number;     // Current position shares
  currentValue: number;      // Current position market value
  importedShares: number;    // Imported file shares
  importedValue: number;     // Imported file market value
  sharesDiff: number;        // Shares difference (current - imported)
  valueDiff: number;         // Value difference (current - imported)
  ratio: number | null;      // Ratio percentage, null if cannot calculate
}

// Comparison result with totals
export interface PositionCompareResult {
  items: PositionCompareItem[];
  totalCurrentValue: number;      // Total current value
  totalImportedValue: number;     // Total imported value
  totalValueDiff: number;         // Total value difference
  totalRatio: number | null;      // Total ratio percentage
}

// Import validation error
export interface ImportError {
  message: string;
  details?: string;
}