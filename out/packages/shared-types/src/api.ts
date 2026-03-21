import type { AnalysisResult } from './analysis';

export interface AnalyzeRequest {
  content: string;
  platform: 'x' | 'linkedin' | 'threads';
}

export interface AnalyzeResponse {
  success: true;
  data: AnalysisResult;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'USAGE_EXCEEDED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';
}

export interface AuthCallbackRequest {
  code: string;
  state: string;
}

export interface AuthCallbackResponse {
  success: true;
  token: string;
  user: {
    id: string;
    xUsername: string;
    xDisplayName: string;
    xProfileImage: string;
    subscriptionTier: string;
    monthlyUsageCount: number;
    monthlyUsageLimit: number;
  };
}

export interface SuggestRequest {
  content: string;
  type: 'hook' | 'cta';
}

export interface SuggestResponse {
  success: true;
  suggestions: string[];
}
