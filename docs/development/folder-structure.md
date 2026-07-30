# Folder structure

## Purpose

Give contributors a concise map of the current repository.

```text
.
├── frontend/                 Next.js application
│   ├── app/                  Routes, layout, global styles
│   ├── components/           Widget, chat, admin, shared and UI components
│   ├── hooks/                Client hooks
│   ├── lib/                  HTTP, socket, cookies and utilities
│   ├── public/               Static assets and embed.js
│   ├── store/                Zustand chat store
│   └── types/                Shared frontend types
├── backend/                  Express and Socket.IO application
│   ├── controllers/          Socket and AI handling
│   ├── middleware/           Admin authentication
│   ├── routes/               HTTP endpoints
│   ├── services/             Service helpers
│   ├── utils/                Sanitisation, messages and email helpers
│   └── db.js                 SQLite setup
├── docs/                     Project documentation
└── .github/workflows/        Deployment workflow
```

## Placement guidance

- Add frontend route UI under `frontend/app`; reusable UI under `frontend/components`.
- Add backend HTTP transport under `backend/routes`; keep reusable domain logic outside route handlers.
- Add schema migrations in a dedicated migration directory once a migration tool is adopted.
- Add tests next to modules or in a documented test directory. TODO: select the test structure/tooling.

See [architecture overview](../architecture/overview.md).

