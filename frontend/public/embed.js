(function () {
  const CONTAINER_ID = "ogooluwani-chat-widget";

  function createWidget() {
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      width: 200px; 
      height: 150px;
      pointer-events: none; 
      transition: all 0.3s ease;
    `;

    // container.style.backgroundColor = "red";
    const widgetUrl = window.CHAT_WIDGET_URL || "http://localhost:3000";
    console.log(widgetUrl);
    const iframe = document.createElement("iframe");
    iframe.src = `${widgetUrl}/widget`;
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      pointer-events: auto;
    `;

    container.appendChild(iframe);
    document.body.appendChild(container);

    window.addEventListener("message", (event) => {
      if (event.data.type === "CHAT_STATE_CHANGED") {
        if (event.data.isOpen) {
          container.style.width = "420px";
          container.style.height = "630px";
        } else {
          container.style.width = "200px";
          container.style.height = "150px";
        }
      }
    });
  }
  createWidget();
})();
