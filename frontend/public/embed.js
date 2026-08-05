(function () {
  const CONTAINER_ID = "ogooluwani-chat-widget";

  function createWidget() {
    const scriptTag = document.currentScript;
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      width: min(420px, calc(100vw - 24px));
      height: min(630px, calc(100dvh - 24px));
      pointer-events: none; 
      transition: width 0.24s ease, height 0.24s ease;
    `;

    const widgetUrl = scriptTag?.dataset.widgetUrl || "http://localhost:3000";
    const iframe = document.createElement("iframe");
    iframe.src = `${widgetUrl}/widget`;
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 18px;
      pointer-events: auto;
    `;
    iframe.title = "Chat with Ogooluwani";

    container.appendChild(iframe);
    document.body.appendChild(container);

    const sendTheme = () => {
      const isDark = document.documentElement.classList.contains("dark");
      const theme = isDark ? "light" : "dark";

      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: "THEME_UPDATE", theme }, "*");
      }
    };

    iframe.addEventListener("load", sendTheme);

    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("message", (event) => {
      if (event.data.type === "WIDGET_READY") {
        sendTheme();
      }
      if (event.data.type === "CHAT_STATE_CHANGED") {
        if (event.data.isOpen) {
          container.style.width = "min(420px, calc(100vw - 24px))";
          container.style.height = "min(630px, calc(100dvh - 24px))";
        } else {
          container.style.width = "min(400px, calc(100vw - 24px))";
          container.style.height = "250px";
        }
      }
    });
  }

  if (document.readyState === "complete") {
    createWidget();
  } else {
    window.addEventListener("load", createWidget);
  }
})();
