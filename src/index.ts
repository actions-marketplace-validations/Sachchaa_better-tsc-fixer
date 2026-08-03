import * as core from '@actions/core';
import { ActionInputs, FixSummary } from './types';
import { fixLoop } from './fixer';
import {
  configureGit,
  hasChanges,
  commitChanges,
  pushToCurrentBranch,
  createFixBranch,
  pushNewBranch,
  getCurrentSha,
  getCurrentBranch,
  getLastCommitMessage,
  getLastCommitAuthor,
} from './git';
import { buildPrBody, createPullRequest } from './pr';
import { logInfo, logWarning } from './utils';

const BOT_NAME = 'better-tsc-fixer[bot]';
const SKIP_MARKER = '[skip-tsc-fix]';
const COMMIT_MESSAGE = 'fix(types): auto-fix TypeScript errors';

function getInputs(): ActionInputs {
  const fixMode = core.getInput('fix-mode') || 'push';
  const llmProvider = core.getInput('llm-provider') || 'anthropic';
  const model = core.getInput('model') || '';
  const anthropicKey = core.getInput('anthropic-api-key');
  const openaiKey = core.getInput('openai-api-key');
  const githubToken = core.getInput('github-token', { required: true });
  const maxRetries = parseInt(core.getInput('max-retries') || '3', 10);
  const tsconfigPath = core.getInput('tsconfig-path') || 'tsconfig.json';

  if (fixMode !== 'push' && fixMode !== 'pr') {
    throw new Error(`Invalid fix-mode: "${fixMode}". Must be "push" or "pr".`);
  }

  if (llmProvider !== 'anthropic' && llmProvider !== 'openai' && llmProvider !== 'openrouter') {
    throw new Error(
      `Invalid llm-provider: "${llmProvider}". Must be "anthropic", "openai", or "openrouter".`,
    );
  }

  const openrouterKey = core.getInput('openrouter-api-key');
  const apiKeyMap: Record<string, string> = {
    anthropic: anthropicKey,
    openai: openaiKey,
    openrouter: openrouterKey,
  };
  const inputNameMap: Record<string, string> = {
    anthropic: 'anthropic-api-key',
    openai: 'openai-api-key',
    openrouter: 'openrouter-api-key',
  };
  const apiKey = apiKeyMap[llmProvider];

  if (!apiKey) {
    throw new Error(
      `Missing API key for provider "${llmProvider}". ` +
        `Set the "${inputNameMap[llmProvider]}" input.`,
    );
  }

  return {
    fixMode: fixMode as 'push' | 'pr',
    llmProvider: llmProvider as 'anthropic' | 'openai' | 'openrouter',
    model,
    apiKey,
    githubToken,
    maxRetries,
    tsconfigPath,
  };
}

async function shouldSkip(): Promise<boolean> {
  const author = await getLastCommitAuthor();
  if (author === BOT_NAME) {
    logInfo(`Skipping: last commit was authored by ${BOT_NAME}`);
    return true;
  }

  const message = await getLastCommitMessage();
  if (message.includes(SKIP_MARKER)) {
    logInfo(`Skipping: commit message contains ${SKIP_MARKER}`);
    return true;
  }

  return false;
}

async function deliverFixes(
  inputs: ActionInputs,
  summary: FixSummary,
): Promise<string | undefined> {
  if (!(await hasChanges())) {
    logWarning('No file changes to commit');
    return undefined;
  }

  await configureGit();

  if (inputs.fixMode === 'push') {
    await commitChanges(COMMIT_MESSAGE);
    await pushToCurrentBranch();
    logInfo('Fixes pushed directly to branch');
    return undefined;
  }

  const baseBranch = await getCurrentBranch();
  const sha = await getCurrentSha();
  const fixBranch = await createFixBranch(sha);

  await commitChanges(COMMIT_MESSAGE);
  await pushNewBranch(fixBranch);

  const prBody = buildPrBody(summary);
  const prUrl = await createPullRequest(
    baseBranch,
    fixBranch,
    COMMIT_MESSAGE,
    prBody,
    inputs.githubToken,
  );

  return prUrl;
}

async function run(): Promise<void> {
  try {
    if (await shouldSkip()) {
      return;
    }

    const inputs = getInputs();
    logInfo(
      `Config: provider=${inputs.llmProvider}, model=${inputs.model || '(default)'}, mode=${inputs.fixMode}, retries=${inputs.maxRetries}`,
    );

    const summary = await fixLoop(
      inputs.maxRetries,
      inputs.tsconfigPath,
      inputs.llmProvider,
      inputs.apiKey,
      inputs.model,
    );

    core.setOutput('errors-before', String(summary.errorsBefore));
    core.setOutput('errors-after', String(summary.errorsAfter));

    if (summary.filesFixed.length === 0) {
      core.setOutput('fixed', 'false');
      if (summary.errorsBefore > 0) {
        core.setFailed(
          `${summary.errorsBefore} TypeScript error(s) could not be fixed`,
        );
      }
      return;
    }

    core.setOutput('fixed', 'true');

    const prUrl = await deliverFixes(inputs, summary);
    if (prUrl) {
      core.setOutput('pr-url', prUrl);
      logInfo(`PR created: ${prUrl}`);
    }

    if (!summary.fullyResolved) {
      core.setFailed(
        `${summary.errorsAfter} TypeScript error(s) remain after ${inputs.maxRetries} attempts`,
      );
    }
  } catch (error) {
    core.setFailed(
      error instanceof Error ? error.message : String(error),
    );
  }
}

run();
