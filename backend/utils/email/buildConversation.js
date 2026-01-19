export function buildConversationHtml(conversations) {
  let html = `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Ubuntu&display=swap');

        body {
          font-family: 'Ubuntu', sans-serif;
          background: #fff;
          padding: 5px;
        }

        .conversation-break {
          text-align: center;
          font-weight: bold;
          margin: 20px 0 20px;
          font-size: 16px;
          color: #555;
        }

        .message-row {
          display: flex;
          margin-bottom: 12px;
        }

        .message-row.left {
          justify-content: flex-start;
        }

        .message-row.right {
          justify-content: flex-end;
        }

        .bubble {
          max-width: 65%;
          padding: 12px 16px;
          border-radius: 12px;
          background-color: #e0dff7; /* admin/system bubble */
          color: #231942;
          position: relative;
        }

        .bubble.visitor {
          background-color: #fff; /* visitor bubble */
          color: #231942;
          border: 1px solid #ccc;
        }

        .sender-name {
          font-size: 12px;
          color: #555;
          margin-top: 4px;
        }

        .timestamp {
          font-size: 11px;
          color: #999;
        }

        .content {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
          
      </style>
    </head>
    <body>
  `;

  for (const convo of conversations) {
    const dateLabel = new Date(convo.createdAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    html += `
    <div style="font-family: 'Ubuntu', sans-serif; max-width: 700px; margin: auto; padding: 20px;">
      <!-- Logo & Header -->
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://ogooluwaniadewale.com/favicon.ico" alt="Ogooluwani Logo" width="60" style="margin-bottom: 10px;" />
        <h2 style="margin:0; color:#231942;">Chat Transcript with Ogooluwani</h2>
      </div>
      <div class="conversation-break">
        Conversation on ${dateLabel}
      </div>
    `;

    for (const msg of convo.messages) {
      const isAdminOrSystem =
        msg.senderId === "admin" || msg.senderId === "system";

      const rowClass = isAdminOrSystem ? "left" : "right";
      const bubbleClass = isAdminOrSystem ? "bubble" : "bubble visitor";

      const senderName =
        msg.senderId === "system"
          ? "Robot"
          : msg.senderId === "admin"
            ? "Ogooluwani"
            : `${msg.firstName} ${msg.lastName}`;

      const time = new Date(msg.timestamp).toLocaleString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      html += `
        <div class="message-row ${rowClass}">
          <div class="${bubbleClass}">
            <div class="content">${msg.content}</div>
            <div class="sender-name">${senderName}</div>
            <div class="timestamp">${time}</div>
          </div>
        </div>
      `;
    }
  }

  html += `
  </div>
    </body>
  </html>
  `;

  return html;
}
