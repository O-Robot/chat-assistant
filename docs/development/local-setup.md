# Local setup

## Purpose

Provide the minimum verified setup path for local development.

## Prerequisites

- Node.js 22 is used by the deployment workflow. TODO: pin and document the supported local Node version with `.nvmrc` or equivalent.
- npm.
- API credentials only if testing AI or email features.

## Install and configure

1. From the repository root, run `npm ci`.
2. Copy `backend/.env.example` to `backend/.env` and fill the required values.
3. Copy `frontend/.env.example` to `frontend/.env.local` and set public URLs.
4. Run `npm run dev` from the root.

The normal local URLs are inferred from code as frontend `http://localhost:3000` and backend `http://localhost:3001`.

## Common commands

```bash
npm run dev
npm run lint --workspace=frontend
npm run build --workspace=frontend
```

The backend currently has only `npm start`; it has no configured lint, test, or build command.

## Data and secrets

- Local SQLite data defaults to `backend/db/data.sqlite` and is ignored by Git.
- `.env` and `.env.local` files are ignored by Git. Never commit real credentials.
- TODO: document seed/reset, backup, and safe local-email behaviour.

See [folder structure](folder-structure.md) and [security checklist](../security/checklist.md).

