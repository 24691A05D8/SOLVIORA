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
import { validateOCR } from "./src/ocrValidator";

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
 * --- THE API ROUTE: OCR MULTIMODAL QUESTION SCANNER ---
 * Extracts math, science, or general text questions from uploaded or captured base64 images
 * using Gemini's powerful multimodal parsing capabilities.
 */
app.post("/api/ocr", async (req, res) => {
  // Helper to reliably build client-requested strict production JSON schema
  const buildOcrResponse = (opt: {
    status: "success" | "error";
    errorType?: "EMPTY_IMAGE" | "LOW_QUALITY" | "CORRUPT_IMAGE" | "UNSUPPORTED_FORMAT" | "RATE_LIMIT" | "TIMEOUT" | "MISSING_API_KEY" | "INVALID_INPUT" | null;
    errorCode?: number;
    extractedText?: string;
    confidence?: number;
    problemType?: "math" | "text" | "unknown";
  }) => {
    let errorCodeVal = opt.errorCode || 0;
    if (opt.status === "error" && !errorCodeVal) {
      switch (opt.errorType) {
        case "EMPTY_IMAGE": errorCodeVal = 1001; break;
        case "LOW_QUALITY": errorCodeVal = 1002; break;
        case "CORRUPT_IMAGE": errorCodeVal = 1003; break;
        case "UNSUPPORTED_FORMAT": errorCodeVal = 1004; break;
        case "RATE_LIMIT": errorCodeVal = 1005; break;
        case "TIMEOUT": errorCodeVal = 1006; break;
        case "MISSING_API_KEY": errorCodeVal = 1007; break;
        case "INVALID_INPUT": errorCodeVal = 1008; break;
        default: errorCodeVal = 1008; break;
      }
    }
    return validateOCR({
      status: opt.status,
      error_code: errorCodeVal,
      error_type: opt.errorType || null,
      data: {
        text: opt.extractedText || "",
        confidence: typeof opt.confidence === "number" ? opt.confidence : (opt.status === "success" ? 0.95 : 0.0),
        problem_type: opt.problemType || "unknown"
      }
    });
  };

  // Check API Key first as specified
  if (!process.env.GEMINI_API_KEY) {
    console.error("[Backend OCR Logger] Server is missing GEMINI_API_KEY.");
    return res.json(buildOcrResponse({
      status: "error",
      errorType: "MISSING_API_KEY"
    }));
  }

  try {
    const { image, mimeType } = req.body;

    if (!image || typeof image !== "string" || !image.trim()) {
      return res.json(buildOcrResponse({
        status: "error",
        errorType: "EMPTY_IMAGE"
      }));
    }

    // Sanitize and extract pure base64 database string
    let resolvedMimeType = mimeType || "image/png";
    let base64Data = image;

    if (image.startsWith("data:")) {
      const matches = image.match(/^data:([^;]+);base64,(.*)$/);
      if (matches && matches.length === 3) {
        resolvedMimeType = matches[1];
        base64Data = matches[2];
      }
    }

    // Validate MIME types
    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"];
    if (!allowedMimeTypes.includes(resolvedMimeType.toLowerCase())) {
      return res.json(buildOcrResponse({
        status: "error",
        errorType: "UNSUPPORTED_FORMAT"
      }));
    }

    // Check if image data is extremely short or doesn't have standard base64 pattern (meaning CORRUPT_IMAGE)
    if (base64Data.length < 50) {
      return res.json(buildOcrResponse({
        status: "error",
        errorType: "CORRUPT_IMAGE"
      }));
    }

    // Lazily get initialized Gemini client
    let ai;
    try {
      ai = getGeminiClient();
    } catch (keyError: any) {
      return res.json(buildOcrResponse({
        status: "error",
        errorType: "MISSING_API_KEY"
      }));
    }

    const ocrPrompt = `You are a production-grade OCR and calculation data provider.
Convert images into clean structured JSON output.

ABSOLUTE RULES (NON-NEGOTIABLE):
1. Output MUST be valid JSON only.
2. NEVER output UI text, explanations, markdown, or logs.
3. NEVER output button labels or user instructions.
4. NEVER output partial JSON.
5. NEVER return empty strings to represent meaning.
6. The frontend handles ALL user messaging.

OUTPUT SCHEMA (DO NOT CHANGE):
{
  "status": "success" | "error",
  "error_code": 0,
  "error_type": null | "EMPTY_IMAGE" | "LOW_QUALITY" | "CORRUPT_IMAGE" | "UNSUPPORTED_FORMAT" | "RATE_LIMIT" | "TIMEOUT" | "MISSING_API_KEY" | "INVALID_INPUT",
  "data": {
    "text": "the extracted clean math, formula, science or standard text question exactly",
    "confidence": 0.95,
    "problem_type": "math" | "text" | "unknown"
  }
}

FALLBACK AND CRITICAL ERROR RULES (If you fail or cannot parse):
- If no visible content in image -> status = 'error', error_type = 'EMPTY_IMAGE', error_code = 1001
- If image is blurry / unreadable -> status = 'error', error_type = 'LOW_QUALITY', error_code = 1002
- If format not supported -> status = 'error', error_type = 'UNSUPPORTED_FORMAT', error_code = 1004
- If image decoding failure -> status = 'error', error_type = 'CORRUPT_IMAGE', error_code = 1003`;

    const imagePart = {
      inlineData: {
        mimeType: resolvedMimeType,
        data: base64Data,
      },
    };

    const textPart = {
      text: ocrPrompt + "\n\nCRITICAL: Return ONLY valid JSON matching this schema.",
    };

    const generateParams = {
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: {
              type: Type.STRING,
              description: "Status containing success or error",
            },
            error_code: {
              type: Type.INTEGER,
              description: "Error code number, 0 for success",
            },
            error_type: {
              type: Type.STRING,
              description: "EMPTY_IMAGE, LOW_QUALITY, CORRUPT_IMAGE, UNSUPPORTED_FORMAT, RATE_LIMIT, TIMEOUT, MISSING_API_KEY, INVALID_INPUT, or null if status is success",
            },
            data: {
              type: Type.OBJECT,
              properties: {
                text: {
                  type: Type.STRING,
                  description: "The exactly captured text/mathematical problem content.",
                },
                confidence: {
                  type: Type.NUMBER,
                  description: "A numeric float from 0.0 to 1.0 reflecting confidence.",
                },
                problem_type: {
                  type: Type.STRING,
                  description: "math, text, or unknown classification",
                }
              },
              required: ["text", "confidence", "problem_type"]
            }
          },
          required: ["status", "error_code", "error_type", "data"],
        },
      },
    };

    let response;
    let textOutput = "";
    let isSuccessful = false;

    // Helper function to safely extract and parse JSON from the AI output
    const safeParseJson = (text: string): any => {
      if (!text) return null;
      const cleaned = text.trim();
      
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        // Continue
      }

      try {
        const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
        const match = cleaned.match(jsonBlockRegex);
        if (match && match[1]) {
          return JSON.parse(match[1].trim());
        }
      } catch (e) {
        // Continue
      }

      try {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const candidateString = cleaned.substring(firstBrace, lastBrace + 1);
          return JSON.parse(candidateString.trim());
        }
      } catch (e) {
        // Continue
      }

      throw new Error("Unable to extract structured JSON from Gemini response.");
    };

    // Retry block for primary structured generation
    try {
      console.info("[Backend OCR Logger] Initiating primary structured generation request...");
      response = await ai.models.generateContent(generateParams);
      textOutput = response.text || "";
      isSuccessful = true;
    } catch (primaryErr: any) {
      console.error("[Backend OCR Logger] Primary structured generation failed:", primaryErr.message || primaryErr);
      
      // If error message indicates image decode/corrupt or invalid format, maps to correct error
      const lowerErr = (primaryErr.message || "").toLowerCase();
      if (lowerErr.includes("decode") || lowerErr.includes("corrupt") || lowerErr.includes("malformed")) {
        return res.json(buildOcrResponse({
          status: "error",
          errorType: "CORRUPT_IMAGE"
        }));
      }

      // Check if transient and retry
      if (isTransientError(primaryErr)) {
        console.warn("[Backend OCR Logger] Error is transient, retrying primary generation with simple backoff delay...");
        await sleep(2000);
        try {
          response = await ai.models.generateContent(generateParams);
          textOutput = response.text || "";
          isSuccessful = true;
        } catch (retryErr: any) {
          console.error("[Backend OCR Logger] Retry of primary generation failed:", retryErr.message || retryErr);
        }
      }
    }

    // Fallback: If primary structured generation failed, submit a schema-free request and parse manually
    if (!isSuccessful || !textOutput || !textOutput.trim()) {
      console.warn("[Backend OCR Logger] Initiating robust schema-less fallback request...");
      try {
        const fallbackParams = {
          model: "gemini-3.5-flash",
          contents: {
            parts: [
              imagePart,
              {
                text: ocrPrompt + "\n\nCRITICAL: You must return a single strict JSON object complying with the key mapping schema directly without code block markdown. Return ONLY JSON."
              }
            ]
          }
        };
        const fallbackResponse = await ai.models.generateContent(fallbackParams);
        textOutput = fallbackResponse.text || "";
      } catch (fallbackErr: any) {
        console.error("[Backend OCR Logger] Fallback schema-free generation also failed:", fallbackErr.message || fallbackErr);
        return res.json(buildOcrResponse({
          status: "error",
          errorType: "TIMEOUT"
        }));
      }
    }

    if (!textOutput || !textOutput.trim()) {
      return res.json(buildOcrResponse({
        status: "error",
        errorType: "LOW_QUALITY"
      }));
    }

    // Parse extracted JSON cleanly
    let parsedData;
    try {
      parsedData = safeParseJson(textOutput);
    } catch (parseE) {
      return res.json(buildOcrResponse({
        status: "error",
        errorType: "LOW_QUALITY"
      }));
    }

    if (!parsedData) {
      return res.json(buildOcrResponse({
        status: "error",
        errorType: "LOW_QUALITY"
      }));
    }

    // Safely reconstruct the exact data values 
    const statusVal = parsedData.status === "error" ? "error" : "success";
    const errorTypeVal = parsedData.status === "error" ? (parsedData.error_type || parsedData.error?.type || parsedData.errorType || "LOW_QUALITY") : null;
    const extractedTextVal = parsedData.data?.text || parsedData.data?.extracted_text || parsedData.extractedText || "";
    const problemTypeVal = parsedData.data?.problem_type || parsedData.problem_type || "unknown";
    
    let confidenceVal = 0.0;
    if (statusVal === "success") {
      const parsedConfValue = parsedData.data?.confidence !== undefined ? parsedData.data.confidence : parsedData.confidence;
      if (typeof parsedConfValue === "number") {
        confidenceVal = parsedConfValue;
      } else if (parsedConfValue === "high") {
        confidenceVal = 0.95;
      } else if (parsedConfValue === "low") {
        confidenceVal = 0.35;
      } else {
        confidenceVal = 0.95;
      }
    }

    console.info("[Backend OCR Logger] Server-Side extraction completed. Extracted length:", extractedTextVal.length, "Confidence:", confidenceVal);

    return res.json(buildOcrResponse({
      status: statusVal,
      errorType: errorTypeVal as any,
      extractedText: extractedTextVal,
      confidence: confidenceVal,
      problemType: problemTypeVal as any
    }));

  } catch (error: any) {
    console.error("OCR API failed on Server-Side:", error);
    const errType = isTransientError(error) ? "RATE_LIMIT" : "TIMEOUT";
    return res.json(buildOcrResponse({
      status: "error",
      errorType: errType
    }));
  }
});

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
      model: "gemini-3.5-flash",
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
