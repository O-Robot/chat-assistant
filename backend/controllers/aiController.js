// controllers/aiController.js (Backend - Example Integration)
import { openDB } from "../db.js";
import { sendSystemMessage } from "../utils/systemMessages.js";


export async function handleAIResponse(io, message) {
  const { conversationId, content, senderId } = message;

  // Don't respond to system messages or admin messages
  if (senderId === "system" || senderId === "admin") {
    return;
  }

  try {
    const db = await openDB();

    // Check if admin is online
    // const adminOnline = true; 

    // Get conversation context (last few messages)
    const recentMessages = await db.all(
      `SELECT * FROM messages 
       WHERE conversationId = ? 
       ORDER BY timestamp DESC 
       LIMIT 5`,
      [conversationId]
    );

    // Simple keyword-based responses (replace with AI API call)
    const aiResponse = generateAIResponse(content, recentMessages);

    if (aiResponse) {
      // Wait a bit to simulate typing
      setTimeout(async () => {
        await sendSystemMessage(io, conversationId, aiResponse);
      }, 1500);
    }
  } catch (error) {
    console.error("Error handling AI response:", error);
  }
}


export async function generateAIResponse(userMessage, context) {
  const lowerMessage = userMessage.toLowerCase();


  const responses = {
    pricing:
      "Our pricing varies based on project scope. For a detailed quote, please visit our pricing page or describe your project needs, and I'll have our team follow up with you!",

    contract:
      "Our contract terms are flexible and client-friendly. We typically work with milestone-based agreements. Would you like me to have someone from our team send you our standard contract template?",

    services:
      "We offer web development, mobile apps, UI/UX design, and consulting services. What type of project are you interested in?",

    start:
      "Great! To get started, I'll need some information about your project. Could you tell me more about what you're looking to build?",

    hello:
      "Hello! Welcome to Ogooluwani's support. How can I assist you today?",

    help: "I'm here to help! You can ask me about our services, pricing, contracts, or how to get started with a project. What would you like to know?",
  };

  // Check for keywords
  for (const [keyword, response] of Object.entries(responses)) {
    if (lowerMessage.includes(keyword)) {
      return response;
    }
  }


  if (context.length === 1) {
    return "Thanks for reaching out! An admin will be with you shortly. In the meantime, feel free to describe what you need help with.";
  }

 
  return "Your message has been received. How else can I assist you today?";
}
