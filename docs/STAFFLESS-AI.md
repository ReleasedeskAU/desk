# StaffLess AI (search/RAG engine)

StaffLess AI is ReleaseDesk Everywhere’s search and RAG engine. Host deploy
files no longer live in this repository.

They now live in the engine fork:

- Repo: [ReleasedeskAU/Stafless-ai](https://github.com/ReleasedeskAU/Stafless-ai)
- Path: [`deployment/releasedesk-overlay/`](https://github.com/ReleasedeskAU/Stafless-ai/tree/main/deployment/releasedesk-overlay)

Start there with `README.md` (env template, compose overlay, nginx, first-boot
script, host setup, and checklist). Clone that fork on the VM — not a bare
`onyx-foss` tree, and not the main `onyx` repo.

Connectors in this app talk to StaffLess AI from the Next.js server only
(`STAFFLESS_AI_URL` + `STAFFLESS_AI_PAT` / `ONYX_API_KEY`). The PAT is never
sent to the browser. Synced Work Items read `POST /api/admin/search` (not
Postgres `WorkItem`). Add Connector creates a credential, then
`POST /api/manage/admin/connector`, then binds the cc-pair. Sync Now is
`POST /api/manage/admin/connector/run-once`. Status is
`POST /api/manage/admin/connector/indexing-status`.
