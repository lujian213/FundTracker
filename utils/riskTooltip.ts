import { AnalyzeFundRiskParams, analyzeFundRisk, RiskBadge, RiskResult, buildFallbackRiskResult } from './fundRiskAnalysis';

export type Rating = RiskBadge;
export type { RiskResult };

interface ComputeParams extends Omit<AnalyzeFundRiskParams, 'values'> {
  maValues: Record<number, (number | null)[]>;
  values?: number[];
}

export function computeRiskRating({ price, maValues, index, prevIndex, values = [] }: ComputeParams): RiskResult {
  if (!Number.isFinite(price) || price <= 0) {
    return buildFallbackRiskResult();
  }

  return analyzeFundRisk({
    price,
    maValues,
    index,
    prevIndex,
    values,
  });
}
