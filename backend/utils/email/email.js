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
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const resend = new Resend(process.env.RESEND_API_KEY);

if (!resend) {
  throw new Error("RESEND_API_KEY is not set in environment variables");
}

export async function sendEmail({ to, subject, text, html }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Portfolio Contact <no-reply@ogooluwaniadewale.com>",
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
    const pdfHtml = buildConversationHtml(conversation);
    const pdfPath = await generateConversationPdf(pdfHtml);

    const pdfBuffer = await fs.readFile(pdfPath);

    const emailHtml = exportSingleConversationTemplate({
      firstName: conversation[0].firstName,
      lastName: conversation[0].lastName,
    });

    const result = await sendEmailWithAttachment({
      to: recipientEmail,
      subject: "Your Chat Transcript with Ogooluwani",
      html: emailHtml,
      attachmentData: pdfBuffer,
    });
    if (!result.success) throw new Error(result.error);

    res.json({ success: true, message: "Chat Transcript has been Sent " });
  } catch (error) {
    console.error("Send Error:", error);
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
