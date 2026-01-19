import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";

export async function generateConversationPdf(html) {
  const tmpDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  const filePath = path.join(tmpDir, `conv-${Date.now()}.pdf`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });

    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });
    return filePath;
  } finally {
    await browser.close();
  }
}
