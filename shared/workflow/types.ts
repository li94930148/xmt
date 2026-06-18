export type WorkflowRuntimeRisk = 'low' | 'medium' | 'high';

export interface WorkflowRuntimeContext {
  allowed: boolean;
  risk: WorkflowRuntimeRisk;
  confidence: number;
  reason: string;
  suggestedTransition?: string;
  shadowCount?: number;
  heatmap?: Record<string, number>;
  strictBlocked: boolean;
}
