import fetch from "node-fetch";
import { Resend } from "resend";
import { openDB } from "../../db.js";
import { generateConversationPdf } from "./pdfGenerator.js";
import {
  exportConversationTemplate,
  exportSingleConversationTemplate,
} from "./exportConversationTemplate.js";
import { buildConversationHtml } from "./buildConversation.js";
import fs from "fs/promises";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

const resend = new Resend(process.env.RESEND_API_KEY);

if (!resend) {
  throw new Error("RESEND_API_KEY is not set in environment variables");
}

export async function sendEmail({ fromName, to, subject, html }) {
  const senderEmail = "no-reply@ogooluwaniadewale.com";
  try {
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${senderEmail}>`,
      to,
      subject,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error.message };
  }
}
export async function sendEmailWithAttachment({
  to,
  subject,
  html,
  attachmentData,
}) {
  try {
    const { data, error } = await resend.emails.send({
      from: "Portfolio Chat Transcript <robot@ogooluwaniadewale.com>",
      to,
      subject,
      html,
      attachments: [
        {
          filename: "conversation-transcript.pdf",
          content: attachmentData,
        },
      ],
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error.message };
  }
}

// Admin notification
export async function notifyAdminNewChat(
  visitorName,
  visitorPhone,
  visitorEmail,
) {
  const recipient = process.env.ADMIN_EMAIL;

  if (!recipient) {
    console.error("ADMIN_EMAIL is not set in environment variables");
    return { success: false, error: "Recipient email missing" };
  }
  const cleanPhone = visitorPhone?.toString().replace(/^\+/, "");
  const displayPhone = visitorPhone ? `+${cleanPhone}` : "Not provided";

  const subject = "🔔 New Chat Transfer Request";

  const html = `
    <div style="font-family: 'Ubuntu', Arial, sans-serif; max-width:600px; margin:auto; padding:30px; border-radius:12px; background:#f8eff4; text-align:center; border: 1px solid #e0b1cb;">
      <img src="https://ogooluwaniadewale.com/favicon.ico" alt="Ogooluwani Logo" width="80" style="margin-bottom:20px;" />
      
      <h2 style="color:#231942; margin-bottom: 10px;">New Transfer Request</h2>
      
      <p style="color:#655e7a; font-size:16px; line-height:1.5; margin-bottom: 20px;">
        Yo Admin, a visitor is waiting for a live agent transfer. Here are the details:
      </p>

      <div style="background: #ffffff; padding: 20px; border-radius: 8px; text-align: left; margin-bottom: 24px; border: 1px solid #e0b1cb;">
        <p style="margin: 5px 0; color: #231942;"><strong>Name:</strong> ${visitorName || "Guest"}</p>
        <p style="margin: 5px 0; color: #231942;"><strong>Email:</strong> ${visitorEmail || "Not provided"}</p>
        <p style="margin: 5px 0; color: #231942;"><strong>Phone:</strong> ${displayPhone}</p>
      </div>

      <p style="margin-top:24px; font-size:14px; color:#231942;">
        Please log in to the dashboard to pick up the chat.
      </p>

      <a href="${process.env.FRONTEND_URL}/admin" style="display:inline-block; margin-top:20px; padding:12px 25px; background:#e0b1cb; color:#231942; border-radius:6px; text-decoration:none; font-weight: bold; border: 1px solid #be95ae;">
        Open Admin Dashboard
      </a>

      <p style="margin-top:30px; font-size:14px; color:#231942; font-weight:bold; border-top: 1px solid #e0b1cb; padding-top: 20px;">
        Best Regards,<br/>System Bot
      </p>
    </div>
  `;
  const fromName = "Chat System";
  return await sendEmail({ fromName, to: recipient, subject, html });
}

// export chat
export async function exportConversation(id, email, res) {
  let pdfPath = null;
  try {
    const db = await openDB();

    const conversations = await db.all(
      `SELECT c.*, u.firstName, u.lastName, u.email as userEmail
       FROM conversations c
       JOIN users u ON c.userId = u.id
       WHERE c.userId = (SELECT userId FROM conversations WHERE id = ?)
       ORDER BY c.createdAt ASC`,
      [id],
    );

    if (!conversations?.length) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    for (const convo of conversations) {
      convo.messages = await db.all(
        `SELECT m.*, u.firstName, u.lastName
         FROM messages m
         LEFT JOIN users u ON m.senderId = u.id
         WHERE m.conversationId = ?
         ORDER BY m.timestamp ASC`,
        [convo.id],
      );
    }

    const transcriptHtml = buildConversationHtml(conversations);
    pdfPath = await generateConversationPdf(transcriptHtml);

    const pdfBuffer = await fs.readFile(pdfPath);
    const recipientEmail = email || process.env.ADMIN_EMAIL;

    const emailHtml = exportConversationTemplate({
      firstName: conversations[0].firstName,
      lastName: conversations[0].lastName,
    });

    const result = await sendEmailWithAttachment({
      to: recipientEmail,
      subject: "Your Conversation Transcript",
      html: emailHtml,
      attachmentData: pdfBuffer,
    });

    if (!result.success) throw new Error(result.error);

    res.json({ success: true, message: "Conversation exported successfully" });
  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({ error: "Failed to export conversation" });
  } finally {
    if (pdfPath) {
      try {
        await fs.unlink(pdfPath);
        console.log(`Successfully deleted temp file: ${pdfPath}`);
      } catch (cleanupError) {
        console.error("Failed to delete temp file:", cleanupError);
      }
    }
  }
}

export async function exportUserTranscript(conversation, recipientEmail, res) {
  let pdfPath = null;

  try {
    // 1. Ensure conversation data exists
    if (!conversation || conversation.length === 0) {
      throw new Error("No conversation data provided for PDF generation");
    }

    // 2. Build and sanitize HTML
    const pdfHtml = buildConversationHtml(conversation);

    // 3. GENERATE PDF - Assign to the outer variable (remove 'const')
    pdfPath = await generateConversationPdf(pdfHtml);

    // 4. Read the file
    const pdfBuffer = await fs.readFile(pdfPath);

    const emailHtml = exportSingleConversationTemplate({
      firstName: conversation[0].firstName || "User",
      lastName: conversation[0].lastName || "",
    });

    const result = await sendEmailWithAttachment({
      to: recipientEmail,
      subject: "Your Chat Transcript",
      html: emailHtml,
      attachmentData: pdfBuffer,
    });

    if (!result.success) throw new Error(result.error);

    res.json({ success: true, message: "Chat Transcript has been Sent" });
  } catch (error) {
    console.error("Detailed Send Error:", error); // This will now show the actual sub-error
    res
      .status(500)
      .json({ error: error.message || "Failed to export conversation" });
  } finally {
    // This now correctly sees the path because we removed 'const' above
    if (pdfPath) {
      try {
        await fs.unlink(pdfPath);
      } catch (cleanupError) {
        console.error("Cleanup Error:", cleanupError);
      }
    }
  }
}
