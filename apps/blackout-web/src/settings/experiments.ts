export type ExperimentRampStep = 1 | 5 | 20;

export interface RollbackCriteria {
  metric: string;
  threshold: number;
  direction: "above" | "below";
}

export interface EngagementExperiment {
  id: string;
  feature: string;
  holdoutPercentage: number;
  rampStep: ExperimentRampStep;
  rollback: RollbackCriteria[];
}

export interface ExperimentMetrics {
  [metric: string]: number;
}

export function shouldRollbackExperiment(
  experiment: EngagementExperiment,
  observed: ExperimentMetrics,
): boolean {
  return experiment.rollback.some((criterion) => {
    const value = observed[criterion.metric];
    if (typeof value !== "number") return false;

    if (criterion.direction === "above") return value > criterion.threshold;
    return value < criterion.threshold;
  });
}

export function nextRampStep(step: ExperimentRampStep): ExperimentRampStep {
  if (step === 1) return 5;
  if (step === 5) return 20;
  return 20;
}
