# CLAUDE.md

This file provides guidance to Claude when working on the better-tsc-fixer codebase.

## Project Overview

**better-tsc-fixer** is a GitHub Action that automatically detects and fixes TypeScript type errors using AI (Anthropic Claude or OpenAI GPT). It runs `tsc --noEmit`, parses errors, sends them to an LLM for fixes, and either commits directly or opens a PR.

## Build & Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Type-check (lint)
pnpm run lint

# Build (bundles TypeScript to dist/index.js via Vercel NCC)
pnpm run build
```

> **Important:** The `dist/` directory is committed to the repo (required for GitHub Actions). Always run `pnpm run build` and commit `dist/` after source changes.

## Project Structure

```
src/
  index.ts    - GitHub Action entry point; reads inputs, routes to push/pr mode
  fixer.ts    - Core fix loop: runs tsc → calls LLM → applies diffs → repeats
  tsc.ts      - Runs `tsc --noEmit`, parses and groups errors by file
  llm.ts      - LLM integration for Anthropic and OpenAI providers
  git.ts      - Git operations: commit, branch, push
  pr.ts       - Pull request creation via `gh` CLI
  types.ts    - Shared TypeScript interfaces
  utils.ts    - Shell exec wrapper, logging helpers, diff analysis
tests/        - Vitest unit tests
dist/         - Compiled output (committed, do not edit manually)
action.yml    - GitHub Action manifest (inputs/outputs)
```

## Key Architecture Decisions

- **Diff validation**: Rejects LLM output if >50% of lines changed — prevents hallucinated rewrites (`diffPercentage()` in `utils.ts`)
- **Infinite loop prevention**: Skips if the last commit was by the bot or contains `[skip-tsc-fix]` in the message (`shouldSkip()` in `index.ts`)
- **Two delivery modes**: `push` (commit directly to current branch) or `pr` (create a new `fix/tsc-errors-<sha>` branch and open a PR)
- **Iterative fixing**: `fixLoop()` in `fixer.ts` reruns tsc after each round of fixes, up to `maxRetries` (default: 3)
- **LLM prompting**: Prompts are built with line-numbered code and explicit instructions to fix only type errors, not refactor

## LLM Integration

- Default models: `claude-sonnet-4-5` (Anthropic), `gpt-4o` (OpenAI)
- LLM calls are in `src/llm.ts`; add new providers there
- Responses are expected to return the full fixed file contents in a code block

## Testing

Tests use **Vitest** and are in `tests/`. Run with `pnpm test`. Tests cover `fixer.ts`, `llm.ts`, `tsc.ts`, and `utils.ts`.

## Action Inputs / Outputs

Key inputs: `fix-mode` (`push`|`pr`), `llm-provider` (`anthropic`|`openai`), `model`, `anthropic-api-key`, `openai-api-key`, `max-retries`, `tsconfig-path`

Key outputs: `fixed` (bool), `errors-before`, `errors-after`, `pr-url`

## Common Tasks

- **Add a new LLM provider**: Add a case in `src/llm.ts:callLLM()` and update `action.yml` input description
- **Change fix validation logic**: Edit `fixFile()` in `src/fixer.ts`
- **Modify commit/PR behavior**: Edit `src/git.ts` or `src/pr.ts`
- **Update prompts**: Edit `buildPrompt()` in `src/fixer.ts`
