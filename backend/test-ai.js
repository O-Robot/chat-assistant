import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function testGemini() {
  try {
    const response = await genAI.models.listModels();

    console.log(response);
  } catch (error) {
    console.error("❌ Gemini failed:", error.message);
  }
}

async function testGroq() {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: "Say hello!" }],
      model: "llama-3.3-70b-versatile",
    });

    console.log("✅ Groq works:", completion.choices[0]?.message?.content);
  } catch (error) {
    console.error("❌ Groq failed:", error.message);
  }
}

testGemini();
testGroq();

async function listModels() {
  try {
    const response = await genAI.models.list();
    const models = response.pageInternal;

    for (const model of models) {
      console.log({
        name: model.name,
        supportedActions: model.supportedActions,
      });
    }
  } catch (error) {
    console.error("List models failed:", error.message);
  }
}

listModels();
