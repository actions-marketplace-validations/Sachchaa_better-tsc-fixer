# better-tsc-fixer

[![CI](https://github.com/Sachchaa/better-tsc-fixer/actions/workflows/ci.yml/badge.svg)](https://github.com/Sachchaa/better-tsc-fixer/actions/workflows/ci.yml)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-better--tsc--fixer-blue?logo=github)](https://github.com/marketplace/actions/better-tsc-fixer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A GitHub Action that automatically detects and fixes TypeScript type errors using AI. Supports **Anthropic**, **OpenAI**, and **OpenRouter** (access 300+ models via a single key). Delivers fixes via direct push or pull request — your choice.

## How It Works

```
Push → tsc --noEmit → Errors found? → LLM fixes them → Push or PR
```

1. Runs `tsc --noEmit` to detect type errors
2. Parses errors and groups them by file
3. Sends each file + its errors to an LLM with instructions to fix only the type errors
4. Validates the diff (rejects if > 50% of lines changed — prevents hallucinated rewrites)
5. Applies fixes, re-runs `tsc`, repeats up to N times
6. Commits fixes directly to the branch (`push` mode) or opens a PR (`pr` mode)

## Quick Start

Add this to `.github/workflows/tsc-fix.yml` in your project:

```yaml
name: TSC Auto-Fix
on: push

permissions:
  contents: write
  pull-requests: write

jobs:
  fix-types:
    runs-on: ubuntu-latest
    if: github.actor != 'better-tsc-fixer[bot]'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - uses: Sachchaa/better-tsc-fixer@v1
        with:
          fix-mode: 'push'
          llm-provider: 'anthropic'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Then add your API key as a repository secret (`Settings → Secrets → Actions`).

## Inputs

| Input | Description | Required | Default |
|---|---|---|---|
| `fix-mode` | How to deliver fixes: `push` (commit to branch) or `pr` (open a pull request) | No | `push` |
| `llm-provider` | LLM provider: `anthropic`, `openai`, or `openrouter` | No | `anthropic` |
| `model` | Model name to use (e.g. `claude-sonnet-4-20250514`, `gpt-4o`, `openai/gpt-4o`) | No | Best model for provider |
| `anthropic-api-key` | Anthropic API key | If provider is `anthropic` | — |
| `openai-api-key` | OpenAI API key | If provider is `openai` | — |
| `openrouter-api-key` | OpenRouter API key | If provider is `openrouter` | — |
| `github-token` | GitHub token for pushing / creating PRs | Yes | `${{ github.token }}` |
| `max-retries` | Maximum fix iterations | No | `3` |
| `tsconfig-path` | Path to tsconfig.json | No | `tsconfig.json` |

## Outputs

| Output | Description |
|---|---|
| `fixed` | `true` if any errors were fixed |
| `errors-before` | Number of TypeScript errors before fixing |
| `errors-after` | Number of TypeScript errors after fixing |
| `pr-url` | URL of the created PR (only in `pr` mode) |

## Examples

### Push mode with Anthropic (default)

```yaml
- uses: Sachchaa/better-tsc-fixer@v1
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### PR mode with OpenAI

```yaml
- uses: Sachchaa/better-tsc-fixer@v1
  with:
    fix-mode: 'pr'
    llm-provider: 'openai'
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### PR mode with OpenRouter

Use any of 300+ models from a single API key via [OpenRouter](https://openrouter.ai):

```yaml
- uses: Sachchaa/better-tsc-fixer@v1
  with:
    fix-mode: 'pr'
    llm-provider: 'openrouter'
    model: 'anthropic/claude-3.5-sonnet'   # or any model slug from openrouter.ai
    openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Custom model

```yaml
- uses: Sachchaa/better-tsc-fixer@v1
  with:
    llm-provider: 'anthropic'
    model: 'claude-haiku-4-20250514'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Custom tsconfig and more retries

```yaml
- uses: Sachchaa/better-tsc-fixer@v1
  with:
    fix-mode: 'push'
    llm-provider: 'anthropic'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    max-retries: '5'
    tsconfig-path: 'tsconfig.build.json'
```

### Using outputs

```yaml
- uses: Sachchaa/better-tsc-fixer@v1
  id: fixer
  with:
    fix-mode: 'pr'
    llm-provider: 'anthropic'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}

- if: steps.fixer.outputs.fixed == 'true'
  run: echo "Fixed! PR at ${{ steps.fixer.outputs.pr-url }}"
```

## Safety

- **No infinite loops** — skips if the last commit was authored by `better-tsc-fixer[bot]` or the commit message contains `[skip-tsc-fix]`
- **Diff validation** — rejects LLM output if more than 50% of lines changed
- **Max retries** — stops after N attempts (default 3) to prevent runaway API costs
- **No force push** — never uses `git push --force`

## Development

```bash
# Clone
git clone https://github.com/Sachchaa/better-tsc-fixer.git
cd better-tsc-fixer

# Install
pnpm install

# Lint
pnpm run lint

# Test
pnpm run test

# Build
pnpm run build
```

The `dist/` directory must be committed — GitHub Actions runs the compiled bundle directly.

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `pnpm run lint && pnpm run test && pnpm run build`
5. Commit (including any changes to `dist/`)
6. Open a PR

## License

[MIT](LICENSE)
