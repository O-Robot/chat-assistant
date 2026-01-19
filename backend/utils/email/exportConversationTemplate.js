export function exportConversationTemplate({ firstName, lastName }) {
  return `
  <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:24px; border-radius:12px; background:#f8eff4; text-align:center;">
    <img 
      src="https://ogooluwaniadewale.com/favicon.ico" 
      alt="Ogooluwani Logo" 
      width="80" 
      style="margin-bottom:20px;" 
    />

    <h2 style="color:#231942; margin-bottom:12px;">
      Hi ${firstName} ${lastName},
    </h2>

    <p style="color:#655e7a; font-size:16px; line-height:1.6; margin-bottom:16px;">
      As requested, I've have attached a PDF copy of your conversation transcript to this email.
    </p>

    <p style="color:#655e7a; font-size:16px; line-height:1.6;">
      This file contains the full conversation history, including timestamps and participant details, for your records.
    </p>

    <p style="margin-top:24px; font-size:14px; color:#231942;">
      If you need anything else, feel free to reply to this email.
    </p>

    <p style="margin-top:20px; font-size:14px; color:#231942; font-weight:bold;">
      Best regards,<br />
      Ogooluwani
    </p>

    <a 
      href="https://ogooluwaniadewale.com/home" 
      style="display:inline-block; margin-top:24px; padding:10px 20px; background:#e0b1cb; color:#231942; border-radius:6px; text-decoration:none; font-size:14px;"
    >
      Visit My Portfolio
    </a>
  </div>
  `;
}
export function exportSingleConversationTemplate({ firstName, lastName }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:20px; border-radius:12px; background:#f8eff4; text-align:center;">
      <img src="https://ogooluwaniadewale.com/favicon.ico" alt="Ogooluwani Logo" width="80" style="margin-bottom:20px;" />
      <h2 style="color:#231942;">Hi ${firstName} ${lastName},</h2>
      <p style="color:#655e7a; font-size:16px; line-height:1.5;">
        As requested, I’ve attached your chat transcript.      </p>
        <p style="margin-top:24px; font-size:14px; color:#231942;">
      If you need anything else, feel free to reply to this email.
    </p>
      <p style="margin-top:20px; font-size:14px; color:#231942; font-weight:bold;">
        Best Regards,<br/>Ogooluwani
      </p>
      <a href="https://ogooluwaniadewale.com/home" style="display:inline-block; margin-top:20px; padding:10px 20px; background:#e0b1cb; color:#231942; border-radius:6px; text-decoration:none;">
        Visit My Portfolio
      </a>
    </div>
  `;
}
