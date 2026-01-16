import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import db from "@/lib/db";

function verifyAdmin(req: NextRequest) {
  const token = req.cookies.get("admin_token")?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return false;

  try {
    jwt.verify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessions = db
      .prepare(
        `
        SELECT
          s.id AS session_id,
          s.user_id,
          s.created_at,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.country,
          (
            SELECT message
            FROM messages
            WHERE session_id = s.id
            ORDER BY id DESC
            LIMIT 1
          ) AS last_message
        FROM sessions s
        LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC
      `
      )
      .all();

    return NextResponse.json(sessions);
  } catch (err) {
    console.error("DB fetch error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
