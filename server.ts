/**
 * @file /server.ts
 * @description The Express server entry point for the Smart AI Calculator full-stack application.
 * 
 * --- EDUCATIONAL LESSON FOR BEGINNERS: WHAT IS A BACKEND / SERVER? ---
 * In web development, a full-stack application is divided into two major halves:
 * 1. The FRONTEND (Client): The code that runs in the visitor's browser (HTML, CSS, React).
 *    Its job is to display beautiful buttons, capture user typing, and handle visual clicks.
 * 2. The BACKEND (Server): The code that runs on a remote machine (like this Express server).
 *    Its job is to securely handle database queries, run heavy calculations, and execute APIs
 *    using confidential credentials (like the Google Gemini API key) that must NEVER be sent
 *    to the browser. If we put our Gemini key directly in the browser, anyone could steal it!
 * 
 * --- WHY IS THIS CALLED "BACKGROUND PROCESSING"? ---
 * Web browsers exist to be lightning-fast and interactive. If we loaded heavy AI processing
 * directly on the browser's main thread (or if we blocked the browser while talking to external servers),
 * the page would freeze, buttons would stop clicking, and users would think the site crashed.
 * Instead, the browser sends a web request "in the background" (asynchronously) to our server,
 * while keeping the screen active. The server handles the long-running task, talks to Gemini, and
 * returns the results. During this time, the frontend can render animations or loading charts.
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables from .env file (for local development)
dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON parsing middleware to handle incoming requests with JSON bodies.
app.use(express.json());

/**
 * --- LAZY INITIALIZATION OF CLIENT SIDE SDK ---
 * This is a highly safe pattern. If we initialize the GoogleGenAI SDK at the module root,
 * and the user hasn't configured their GEMINI_API_KEY secret yet, the code would immediately
 * crash on startup!
 * Instead, we initialize the Gemini client only when it is actually needed (lazily),
 * ensuring the app boots up properly even if credentials aren't ready yet.
 */
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is missing! Please make sure it is configured in the Secrets pane in AI Studio."
      );
    }
    // Correct @google/genai initialization style (named parameters + header for telemetry)
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build', // Identifies this build context for analytics
        },
      },
    });
  }
  return aiClient;
}

/**
 * Helper to determine if an error is a transient 503 / UNAVAILABLE error.
 */
function isTransientError(error: any): boolean {
  if (!error) return false;
  const errMsg = String(error.message || error).toLowerCase();
  
  if (error.status === 503 || error.code === 503 || error.status === "UNAVAILABLE") {
    return true;
  }
  
  if (
    errMsg.includes("503") ||
    errMsg.includes("unavailable") ||
    errMsg.includes("high demand") ||
    errMsg.includes("temporary")
  ) {
    return true;
  }
  return false;
}

// Utility for sleep / backoff
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * --- THE API ROUTE: AI CALCULATION ENGINE ---
 * [BACKEND RECEIVE] This endpoint receives the raw question from the frontend, verifies it,
 * communicates with the Gemini model, receives the response, and formats it as JSON.
 */
app.post("/api/explain", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid natural language math question.",
      });
    }

    // Lazily get initialized Gemini API client (Throws clear error message if key is missing)
    let ai;
    try {
      ai = getGeminiClient();
    } catch (keyError: any) {
      return res.status(500).json({
        success: false,
        error: `Configuration Error: ${keyError.message}`,
      });
    }

    /**
     * --- SENDING THE REQUEST TO THE AI ---
     * Express Server sends a structured instruction to 'gemini-2.5-flash'.
     * We define a Type Schema which instructs Gemini to return clean,
     * predictable JSON containing a numeric 'result', a friendly student-focused 'explanation',
     * and list of sequential 'steps'.
     */
    const promptContents = `You are an AI Explain Engine under the name SOLVIORA.
Your job is to solve calculations and conceptual word problems step-by-step, with support for standard arithmetic as well as advanced mathematical functions, including:
- Trigonometry: sine (\\sin), cosine (\\cos), tangent (\\tan), in both degrees and radians (always specify which assumptions/parameters are used, e.g. radians vs degrees)
- Logarithms: common logs (\\log or log base 10), natural logs (\\ln)
- Exponents & Powers: x^y or custom exponential formulas

Rules to follow:
1. Understand the user's question and identify the required operation(s).
2. Break the solution into clear, numbered steps (provided as the "steps" string array).
3. Show all intermediate calculations clearly, showcasing trigonometric equations, logarithmic rules, or exponent reductions where applicable.
4. Explain why each step is performed in simple, accessible language.
5. Respect the order of operations (PEMDAS/BODMAS) and mathematical precedence.
6. For word problems or advanced mathematical derivations, identify:
   - Given variables and values (e.g., angles, bases, exponentials)
   - What needs to be found
   - Formula/identities or reasoning used (e.g., trig identities, log laws)
   - Final calculation
7. Always provide:
   - Step-by-step explanation
   - Final answer (inside the "result" property, formatted cleanly, e.g., '0.5', '2.302', '128')
   - A short summary
8. If the question is ambiguous, ask for clarification instead of guessing. Set "result" to "Clarification Requested", "steps" to ["Clarification needed"], and write a friendly message in "explanation" asking the user to specify their question with more details.
9. Format the "explanation" property using clean Markdown/bullet points and headings (e.g. ### Given Information, ### Step-by-step Explanation, ### Summary).

Question: ${question}`;

    const generateParams = {
      model: "gemini-2.5-flash",
      contents: promptContents,
      config: {
        // Enforce returning structured JSON matching our strict Schema
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            result: {
              type: Type.STRING,
              description: "The simplified final answer (final calculation result or 'Clarification Requested'). (e.g. '155' or '60')",
            },
            explanation: {
              type: Type.STRING,
              description: "The step-by-step study/explanation formatted with markdown-style headings (using ###) and bullet items (using - or *). Includes given information, reasoning, calculations, and the final short summary.",
            },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
              description: "The simple list of numbered steps, e.g. ['Step 1: ...', 'Step 2: ...'].",
            },
          },
          required: ["result", "explanation", "steps"],
        },
      },
    };

    let response;
    try {
      response = await ai.models.generateContent(generateParams);
    } catch (err: any) {
      if (isTransientError(err)) {
        console.warn("Gemini API returned 503/UNAVAILABLE service error. Retrying once with exponential backoff...");
        await sleep(2000); // 2000ms delay for backoff
        try {
          response = await ai.models.generateContent(generateParams);
        } catch (retryErr: any) {
          console.error("Retry failed for Gemini API due to persistent 503 status:", retryErr);
          return res.status(503).json({
            success: false,
            error: "⚠️ The AI service is currently experiencing high demand or is temporarily unavailable.\nPlease wait a few moments and try again.",
          });
        }
      } else {
        // Re-throw any other (non-503) error to let the generic catch handle it safely
        throw err;
      }
    }

    /**
     * --- RECEIVING THE AI RESPONSE ---
     * The SDK returns a GenerateContentResponse where we access the generated
     * text using the '.text' property (not a function). We then parse it and send it to the frontend.
     */
    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("No response text returned from the AI model.");
    }

    const parsedData = JSON.parse(textOutput.trim());

    return res.json({
      success: true,
      result: parsedData.result,
      explanation: parsedData.explanation,
      steps: parsedData.steps,
    });

  } catch (error: any) {
    console.error("AI processing failed on Server-Side:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "An internal error occurred during the AI explanation process.",
    });
  }
});

// Expose a helpful health/diagnostics endpoint to check environment variables
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    hasApiKey: !!process.env.GEMINI_API_KEY,
    currentTime: new Date().toISOString(),
  });
});

/**
 * --- INTEGRATE VITE FOR MIDDLEWARE AND PAGE STATIC SERVING ---
 * During development, we let Vite handle server-side compilation of our React and TypeScript files
 * hot-on-the-fly. In production mode, we serve pre-compiled HTML/CSS/JS files from the 'dist' directory.
 */
async function configureApp() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // This routes all requests not captured by the API endpoints back to the Vite frontend engine
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode with pre-compiled static serving...");
    const distPath = path.join(process.cwd(), "dist");
    // Serve standard client artifacts (compiled CSS/JS)
    app.use(express.static(distPath));
    // Serve HTML page for any client route
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Smart AI Calculator Full-Stack app running at http://localhost:${PORT}`);
  });
}

configureApp();
