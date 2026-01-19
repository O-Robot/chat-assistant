// utils/email.ts
import fetch from "node-fetch";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// if (!RESEND_API_KEY) {
//   throw new Error("RESEND_API_KEY is not set in environment variables");
// }

export async function sendEmail({ to, subject, text, html }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Support System <support@yourdomain.com>",
        to,
        subject,
        text,
        html: html || text?.replace(/\n/g, "<br>"),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend API error: ${errText}`);
    }

    const data = await res.json();
    console.log("Email sent via Resend:", data.id);
    return { success: true, id: data.id };
  } catch (error) {
    console.error("Error sending email via Resend:", error);
    return { success: false, error: error.message };
  }
}

// Admin notification
export async function notifyAdminNewChat(visitorName, visitorEmail) {
  const subject = "🔔 New Chat Transfer Request";
  const text = `
Hello Admin,

A visitor has requested to be transferred to a live agent.

Visitor Details:
- Name: ${visitorName}
- Email: ${visitorEmail}

Please log in to the admin dashboard to respond.

Best regards,
Chat System
  `;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">🔔 New Chat Transfer Request</h2>
      <p>Hello Admin,</p>
      <p>A visitor has requested to be transferred to a live agent.</p>
      
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Visitor Details:</h3>
        <p><strong>Name:</strong> ${visitorName}</p>
        <p><strong>Email:</strong> ${visitorEmail}</p>
      </div>
      
      <p>Please log in to the admin dashboard to respond.</p>
      
      <a href="${process.env.FRONTEND_URL}/admin" 
         style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px;">
        Open Dashboard
      </a>
      
      <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
        Best regards,<br>
        Chat System
      </p>
    </div>
  `;

  return await sendEmail({ to: ADMIN_EMAIL, subject, text, html });
}
