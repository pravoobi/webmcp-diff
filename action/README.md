# WebMCP Contract Diff — GitHub Action

Snapshots the WebMCP tool contract your web app exposes to agents and fails the PR
on breaking or risk-increasing changes.

> The action runs `npx @webmcp-contract/cli`, so that package must be published
> (see the repo's release workflow) or pinned to a version you host.

## Usage

Commit a baseline contract to your repo first:

```bash
npx @webmcp-contract/cli snapshot --config webmcp.config.json -o webmcp-contract.json
git add webmcp-contract.json && git commit -m "chore: add webmcp contract"
```

Then, on PRs:

```yaml
name: webmcp-contract
on:
  pull_request:
  push:
    branches: [main]

jobs:
  contract:
    runs-on: ubuntu-latest
    permissions:
      contents: write       # only for update-on-push
      pull-requests: write   # to post the diff comment
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0     # baseline history must be reachable
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && npm run build

      - uses: pravoobi/webmcp-diff/action@v0   # v1 after the first 1.0 release
        with:
          config: webmcp.config.json
          server-command: "npm run preview -- --port 3000"
          ready-url: http://localhost:3000
          comment: true
          update-on-push: true
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}   # only if semantic: true
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `config` | — | Path to the extractor config JSON (`baseUrl`, `app`, `routes[]`). **Required.** |
| `server-command` | — | Command to start the app; run in the background, waited on for readiness. |
| `ready-url` | config `baseUrl` | URL polled until the server responds. |
| `base-ref` | PR base branch, else default branch | Branch holding the committed baseline contract. |
| `contract-path` | `webmcp-contract.json` | Path to the committed contract. |
| `semantic` | `false` | Run the LLM-assisted description-drift check (needs `ANTHROPIC_API_KEY`). |
| `risk-as-warning` | `false` | Don't fail on risk-increasing-only changes. |
| `comment` | `true` | Post/update the markdown diff as a PR comment. |
| `update-on-push` | `false` | On push to the default branch, refresh and commit the contract. |
| `cli-version` | `latest` | Version of `@webmcp-contract/cli` to run. |
| `working-directory` | `.` | Directory to run in. |

## Outputs

| Output | Description |
| --- | --- |
| `exit-code` | `0` if clean, `1` on breaking / risk-increasing changes (or a missing baseline). |
| `report` | Path to the generated markdown report. |

## Version pinning

Each release moves three tags to the release commit — `v<major>`, `v<major>.<minor>`,
and `v<major>.<minor>.<patch>`. Pin `@v1` for automatic minor/patch updates, `@v1.2`
for patch-only, or `@v1.2.3` for an exact pin. (Pre-1.0, the major tag is `v0`.)
