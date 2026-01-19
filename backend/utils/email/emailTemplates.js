import fs from "fs/promises";
import path from "path";

export async function loadEmailTemplate(templateName, data) {
  const templatePath = path.join(process.cwd(), "templates", templateName);

  let html = await fs.readFile(templatePath, "utf-8");

  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    html = html.replace(regex, value);
  }

  return html;
}
