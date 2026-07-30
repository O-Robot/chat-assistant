# Frontend architecture

## Purpose

Summarise the current Next.js frontend structure and client-side responsibilities.

## Stack

- Next.js 16 with React 19 and the App Router.
- Tailwind CSS and local UI components.
- Zustand for shared chat state.
- Axios for HTTP and Socket.IO client for realtime events.

## Routes and components

- `/` renders the full visitor chat experience.
- `/chat` is the full visitor chat page.
- `/widget` renders the iframe chat launcher and window.
- `/admin/auth` is the admin sign-in page; `/admin` is the inbox/dashboard.

`app/layout.tsx` mounts a global socket initialiser and toast provider. Shared chat state lives in `store/chatStore.ts`. Visitor chat currently has two similar implementations: `components/widget/ChatWindow.tsx` and `components/chat/FullChatWindow.tsx`.

## Data flow

Visitor identity and the current conversation ID are stored in browser cookies. Messages are also cached in `localStorage` by conversation. The store receives HTTP-loaded and Socket.IO messages, then renders the active conversation.

## TODO

- Define a route-level server/client component strategy and error/loading boundary convention.
- Consolidate duplicated visitor-chat logic behind shared typed components/hooks.
- Define a privacy policy for browser message caching.

See [local setup](../development/local-setup.md) and [design system](../design/design-system.md).

