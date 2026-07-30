# Widget architecture

## Purpose

Explain how the externally embedded chat widget currently works.

## Current implementation

Hosts include `frontend/public/embed.js`. The loader appends a fixed-position container and iframe with source `${widgetUrl}/widget`; `data-widget-url` can override the default local URL. The iframe renders `ChatWidget`.

The iframe isolates widget DOM and CSS from host-page CSS. The host loader and iframe exchange `WIDGET_READY`, `THEME_UPDATE`, and `CHAT_STATE_CHANGED` messages to apply theme and resize the container.

## Integration example

```html
<script src="https://YOUR-CHAT-HOST/embed.js" data-widget-url="https://YOUR-CHAT-HOST"></script>
```

`YOUR-CHAT-HOST` is intentionally a placeholder: production integration URL and supported host-origin policy are TODO.

## Current limitations

- The loader has one fixed container ID and is not designed for multiple instances.
- Sizing is fixed at 200×150 closed and 420×630 open, without documented mobile/safe-area behaviour.
- `postMessage` currently uses wildcard targets and does not validate message origin/source.

## TODO

Document a stable embed API, allowed origins, per-instance lifecycle, accessibility expectations, and responsive constraints after the security model is implemented.

See [security overview](../security/overview.md) and [UI principles](../design/ui-principles.md).

