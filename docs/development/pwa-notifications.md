# PWA and Future Notifications

## Purpose

Describe the safe PWA baseline and the requirements for future admin notifications.

The admin PWA uses a network-only service worker. It does not cache conversations, authenticated API responses, cookies, or credentials. Offline mode preserves only in-memory UI state and prevents sending messages.

## Future Notifications

Potential alerts include new visitor messages, new conversations, and AI handovers. Implement them only after adding:

- an explicit browser-permission prompt initiated by the admin;
- a push subscription stored server-side and scoped to the single admin;
- service-worker `push` and `notificationclick` handlers;
- authenticated, rate-limited server delivery; and
- a user-controlled notification preference and unsubscribe path.

Never place authentication tokens, visitor message bodies, or sensitive conversation data in push payloads. Fetch details only after the installed app opens with a valid admin session.
