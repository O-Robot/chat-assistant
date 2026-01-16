import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import db from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const cookieHeader = req.headers.get("cookie") || "";
    const tokenMatch = cookieHeader.match(/admin_token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      jwt.verify(token, process.env.JWT_SECRET || "fallback");
    } catch (err) {
      return NextResponse.json(
        { error: "Token expired or invalid" },
        { status: 401 }
      );
    }

    const messages = db
      .prepare(
        `
        SELECT id, session_id, sender, message, created_at
        FROM messages
        WHERE session_id = ?
        ORDER BY id ASC
        `
      )
      .all(sessionId);

    return NextResponse.json(messages);
  } catch (err) {
    console.error("Error in admin/messages:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
