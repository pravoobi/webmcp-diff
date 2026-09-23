---
"@webmcp-contract/diff": minor
"@webmcp-contract/cli": minor
---

Add an `html` report format alongside `text`/`markdown`/`json`/`sarif` — a single
self-contained, dependency-free HTML page (dark-mode aware) suitable for opening
directly, uploading as a CI artifact, or hosting anywhere for a shareable diff
report. Use `--format html -o report.html` with `diff` or `check`.

Also fixed a stale placeholder repository URL in the `sarif` reporter's
`informationUri`.
