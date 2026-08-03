import * as fs from 'fs';
import { TscError, FixResult, FixSummary } from './types';
import { runTsc, parseTscErrors, groupErrorsByFile } from './tsc';
import { callLLM, extractCodeFromResponse } from './llm';
import {
  addLineNumbers,
  diffPercentage,
  logInfo,
  logWarning,
  logError,
  logGroupAsync,
} from './utils';

const MAX_DIFF_PERCENTAGE = 50;

export function buildPrompt(
  filePath: string,
  fileContent: string,
  errors: TscError[],
): string {
  const numberedContent = addLineNumbers(fileContent);
  const errorList = errors
    .map(
      (e) =>
        `- Line ${e.line}, Col ${e.col}: ${e.code} — ${e.message}`,
    )
    .join('\n');

  return `You are a TypeScript expert. Fix ONLY the type errors listed below. Do NOT refactor, rename variables, change logic, add features, or modify anything unrelated to the listed errors.

## File: ${filePath}

\`\`\`typescript
${numberedContent}
\`\`\`

## TypeScript Errors to Fix

${errorList}

## Instructions

1. Fix ONLY the listed type errors — nothing else.
2. Keep all existing imports, exports, variable names, and logic exactly as they are.
3. If a fix requires adding an import, add only what is strictly necessary.
4. Return the COMPLETE corrected file inside a single fenced code block.
5. Do NOT include line numbers in your output.
6. Do NOT add comments explaining the changes.`;
}

async function fixFile(
  filePath: string,
  errors: TscError[],
  provider: 'anthropic' | 'openai' | 'openrouter',
  apiKey: string,
  model: string,
): Promise<FixResult | null> {
  const original = fs.readFileSync(filePath, 'utf-8');
  const prompt = buildPrompt(filePath, original, errors);

  let response;
  try {
    response = await callLLM(prompt, provider, apiKey, model);
  } catch (err) {
    logError(`LLM call failed for ${filePath}: ${err}`);
    return null;
  }

  const fixedCode = extractCodeFromResponse(response.content);
  if (!fixedCode) {
    logWarning(
      `Could not extract code from LLM response for ${filePath}`,
    );
    return null;
  }

  const diffPct = diffPercentage(original, fixedCode);
  if (diffPct > MAX_DIFF_PERCENTAGE) {
    logWarning(
      `Diff for ${filePath} is ${diffPct.toFixed(1)}% (>${MAX_DIFF_PERCENTAGE}%) — skipping to prevent hallucinated rewrites`,
    );
    return null;
  }

  if (original === fixedCode) {
    logInfo(`No changes needed for ${filePath}`);
    return null;
  }

  return {
    file: filePath,
    original,
    fixed: fixedCode,
    errorsFixed: errors.length,
  };
}

function applyFix(result: FixResult): void {
  fs.writeFileSync(result.file, result.fixed, 'utf-8');
  logInfo(
    `Applied fix to ${result.file} (${result.errorsFixed} errors targeted)`,
  );
}

export async function fixLoop(
  maxRetries: number,
  tsconfigPath: string,
  provider: 'anthropic' | 'openai' | 'openrouter',
  apiKey: string,
  model: string,
): Promise<FixSummary> {
  const initialRun = await runTsc(tsconfigPath);
  const initialErrors = parseTscErrors(initialRun.output);
  const errorsBefore = initialErrors.length;

  logInfo(`Found ${errorsBefore} TypeScript error(s)`);

  if (errorsBefore === 0) {
    return {
      errorsBefore: 0,
      errorsAfter: 0,
      filesFixed: [],
      results: [],
      fullyResolved: true,
    };
  }

  const allResults: FixResult[] = [];
  const allFilesFixed = new Set<string>();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await logGroupAsync(`Fix attempt ${attempt}/${maxRetries}`, async () => {
      const { output } = await runTsc(tsconfigPath);
      const errors = parseTscErrors(output);

      if (errors.length === 0) {
        logInfo('All errors resolved!');
        return;
      }

      logInfo(
        `Attempt ${attempt}: ${errors.length} error(s) remaining across ${new Set(errors.map((e) => e.file)).size} file(s)`,
      );

      const grouped = groupErrorsByFile(errors);

      for (const [filePath, fileErrors] of grouped) {
        const result = await fixFile(filePath, fileErrors, provider, apiKey, model);
        if (result) {
          applyFix(result);
          allResults.push(result);
          allFilesFixed.add(filePath);
        }
      }
    });

    const recheckRun = await runTsc(tsconfigPath);
    const recheckErrors = parseTscErrors(recheckRun.output);

    if (recheckErrors.length === 0) {
      logInfo(`All errors fixed after ${attempt} attempt(s)`);
      return {
        errorsBefore,
        errorsAfter: 0,
        filesFixed: [...allFilesFixed],
        results: allResults,
        fullyResolved: true,
      };
    }
  }

  const finalRun = await runTsc(tsconfigPath);
  const finalErrors = parseTscErrors(finalRun.output);

  logWarning(
    `${finalErrors.length} error(s) remain after ${maxRetries} attempts`,
  );

  return {
    errorsBefore,
    errorsAfter: finalErrors.length,
    filesFixed: [...allFilesFixed],
    results: allResults,
    fullyResolved: false,
  };
}
