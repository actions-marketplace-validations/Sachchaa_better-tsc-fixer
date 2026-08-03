import { LLMResponse } from './types';
import { logInfo } from './utils';

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  openrouter: 'openai/gpt-4o',
};

export async function callLLM(
  prompt: string,
  provider: 'anthropic' | 'openai' | 'openrouter',
  apiKey: string,
  model: string,
): Promise<LLMResponse> {
  const resolvedModel = model || DEFAULT_MODELS[provider];
  if (provider === 'anthropic') {
    return callAnthropic(prompt, apiKey, resolvedModel);
  }
  if (provider === 'openrouter') {
    return callOpenRouter(prompt, apiKey, resolvedModel);
  }
  return callOpenAI(prompt, apiKey, resolvedModel);
}

async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<LLMResponse> {
  logInfo(`Calling Anthropic API (model: ${model})...`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Anthropic API error (${response.status}): ${errorBody}`,
    );
  }

  const data = await response.json();

  const textBlock = data.content?.find(
    (block: { type: string }) => block.type === 'text',
  );

  if (!textBlock) {
    throw new Error('No text content in Anthropic response');
  }

  return {
    content: textBlock.text,
    model: data.model,
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
  };
}

async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<LLMResponse> {
  logInfo(`Calling OpenAI API (model: ${model})...`);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [
        {
          role: 'system',
          content:
            'You are a TypeScript expert. Fix only the type errors specified. Do not refactor, rename, or change any logic. Return the complete corrected file inside a single fenced code block.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (!choice?.message?.content) {
    throw new Error('No content in OpenAI response');
  }

  return {
    content: choice.message.content,
    model: data.model,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

async function callOpenRouter(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<LLMResponse> {
  logInfo(`Calling OpenRouter API (model: ${model})...`);

  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/Sachchaa/better-tsc-fixer',
        'X-Title': 'better-tsc-fixer',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages: [
          {
            role: 'system',
            content:
              'You are a TypeScript expert. Fix only the type errors specified. Do not refactor, rename, or change any logic. Return the complete corrected file inside a single fenced code block.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter API error (${response.status}): ${errorBody}`,
    );
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (!choice?.message?.content) {
    throw new Error('No content in OpenRouter response');
  }

  return {
    content: choice.message.content,
    model: data.model,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

export function extractCodeFromResponse(response: string): string | null {
  const fenceRegex = /```(?:typescript|tsx|ts|jsx|js)?\s*\n([\s\S]*?)```/;
  const match = response.match(fenceRegex);

  if (!match) {
    return null;
  }

  return match[1].trimEnd();
}
