# UI principles

## Purpose

Guide product decisions for visitor chat, widget, admin inbox, and future settings screens.

## Principles

1. **Make chat state explicit.** Show loading, sending, sent, failed, reconnecting, offline, closed, and human-handoff states in context.
2. **Preserve user control.** Do not force-scroll readers away from older messages; provide a clear route to the latest message. Confirm destructive actions and preserve drafts where safe.
3. **Ask for data progressively.** Explain why visitor details are needed and collect only what is necessary for the next step.
4. **Design for the smallest screen first.** The widget must fit dynamic mobile viewports, keyboards, safe areas, and touch targets before desktop enhancements.
5. **Be accessible by default.** Use semantic controls, keyboard operation, visible focus, readable contrast, meaningful labels, and reduced-motion support.
6. **Communicate trust.** Clearly distinguish AI from a human, set accurate response expectations, and provide useful recovery messages.

## Current priorities

The widget and full chat should share interaction patterns. The admin inbox should surface conversation status, assignment, unread state, customer context, and errors without relying on frequent disruptive polling.

## TODO

Define supported personas, service-level expectations, onboarding completion criteria, and a content style guide.

See [design system](design-system.md) and [widget architecture](../architecture/widget.md).

