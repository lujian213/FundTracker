import { computeRiskFromHistory, RiskResult } from './fundRiskAnalysis';
import { ValuationData } from '../types';

type HistPoint = { date: number; value: number; equityReturn: number };

export function computeRatingFromHistory(history: HistPoint[], data?: ValuationData): RiskResult {
  return computeRiskFromHistory(history, data);
}
