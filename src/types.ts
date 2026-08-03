export interface TscError {
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
}

export interface ActionInputs {
  fixMode: 'push' | 'pr';
  llmProvider: 'anthropic' | 'openai' | 'openrouter';
  model: string;
  apiKey: string;
  githubToken: string;
  maxRetries: number;
  tsconfigPath: string;
}

export interface FixResult {
  file: string;
  original: string;
  fixed: string;
  errorsFixed: number;
}

export interface FixSummary {
  errorsBefore: number;
  errorsAfter: number;
  filesFixed: string[];
  results: FixResult[];
  fullyResolved: boolean;
}

export interface TscRunResult {
  exitCode: number;
  output: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
