# Archive of Evidences

An organized, multi-collection evidence bank with categorized English passages, expandable Arabic source text, and source scans where available.

## Files

- `index.html`: the finished browsable evidence bank
- `evidence-bank.md`: the editable Markdown source
- `assets/scans/`: web-accessible source scans
- `tools/assign_evidence_ids.mjs`: assigns fixed IDs only to new evidence records

Open `index.html` in a web browser to view the archive locally.

Evidence links use stored six-digit IDs. Run `node tools/assign_evidence_ids.mjs` after adding new quotations, then rebuild the page. Existing IDs are never renumbered.

Saved collections are private to each browser profile and are not uploaded to GitHub.

## Local audit

Run `audit-local.cmd` to generate and automatically open a private audit report on this computer. The report is written under `.local/`, which is excluded from GitHub. It flags missing evidence, missing assets, translation-length issues, and possible duplicates within the same section without deleting anything.
