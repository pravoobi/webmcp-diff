# WebMCP Contract Viewer

A single static HTML file — no build step, no dependencies — for browsing or sharing a
`webmcp-contract.json` snapshot or a `webmcp-contract diff --format json` result.

## Use it

- **Open it directly.** Double-click `index.html`, or drag it into a browser tab.
- **Drop a file onto it**, or click "choose a file", and pick a contract or diff JSON.
- **Point it at a URL**: paste a URL into the "load from URL" field, or link straight to
  `index.html?url=<url-to-your.json>` for a shareable link (the target must serve the file
  with CORS allowed — a raw GitHub URL or a public S3/GCS object both work).
- **Host it anywhere.** It's one file with no external requests of its own (besides the
  `?url=` fetch you point it at), so GitHub Pages, a CI artifact, or a plain `python -m
  http.server` all work.

It auto-detects which kind of file it was given:

| Shape | Rendered as |
| --- | --- |
| `{ contractVersion, routes, ... }` | Contract browser — per-route tables of tools, risk badges, expandable schema/annotations |
| `{ changes, summary, from, to, ... }` | Diff view — the same layout as `webmcp-contract diff --format html` |

It never computes a diff itself — pass it the *output* of `webmcp-contract diff` (or `check
--format json`), not two contracts to compare.
