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
import { validateOCR, hardParser } from "./src/ocrValidator";

// Load environment variables from .env file (for local development)
dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON parsing middleware to handle incoming requests with JSON bodies.
app.use(express.json({
  limit: "20mb",
}) as any);

app.use(express.urlencoded({
  extended: true,
  limit: "20mb",
}) as any);



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
  const status = error.status || error.code;
  
  if (
    status === 503 ||
    status === "UNAVAILABLE" ||
    status === 429 ||
    status === "RESOURCE_EXHAUSTED"
  ) {
    return true;
  }
  
  if (
    errMsg.includes("503") ||
    errMsg.includes("unavailable") ||
    errMsg.includes("high demand") ||
    errMsg.includes("temporary") ||
    errMsg.includes("429") ||
    errMsg.includes("quota") ||
    errMsg.includes("rate limit") ||
    errMsg.includes("exhausted")
  ) {
    return true;
  }
  return false;
}

// Utility for sleep / backoff
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to diagnose errors and map them to appropriate friendly responses
const analyzeAndMapError = (error: any): { errorType: string; errorCode: string; message: string } => {
  const errMsg = String(error?.message || error).toLowerCase();
  const status = error?.status || error?.code || error?.statusCode;
  
  console.error(`[Backend OCR Log] ❌ Analyzing Exception:`, {
    name: error?.name,
    message: error?.message,
    status: status,
    stack: error?.stack,
  });

  if (
    status === 401 ||
    status === 403 ||
    errMsg.includes("api key") ||
    errMsg.includes("key is missing") ||
    errMsg.includes("unauthorized") ||
    errMsg.includes("not authenticated") ||
    errMsg.includes("api_key_invalid")
  ) {
    return {
      errorType: "API_KEY_INVALID",
      errorCode: "API_KEY_INVALID",
      message: "The server's Google Gemini API key is missing, unauthorized, or invalid. Please configure your API key in the Settings > Secrets menu in AI Studio."
    };
  }

  if (
    status === 429 ||
    errMsg.includes("quota") ||
    errMsg.includes("rate limit") ||
    errMsg.includes("too many requests") ||
    errMsg.includes("exhausted") ||
    errMsg.includes("api_rate_limit")
  ) {
    return {
      errorType: "API_RATE_LIMIT",
      errorCode: "API_RATE_LIMIT",
      message: "The Gemini API request limit has been exceeded. Please wait a few moments and try your camera scan again."
    };
  }

  if (
    errMsg.includes("timeout") ||
    errMsg.includes("deadline") ||
    errMsg.includes("etimedout") ||
    errMsg.includes("socket") ||
    errMsg.includes("abort") ||
    errMsg.includes("hang up") ||
    status === 408 ||
    status === 504 ||
    errMsg.includes("network_timeout")
  ) {
    return {
      errorType: "NETWORK_TIMEOUT",
      errorCode: "NETWORK_TIMEOUT",
      message: "The OCR parsing request timed out while communicating with the AI service. This can happen under high server load. Retrying..."
    };
  }

  if (
    errMsg.includes("decode") ||
    errMsg.includes("corrupt") ||
    errMsg.includes("malformed") ||
    errMsg.includes("unsupported") ||
    errMsg.includes("image format") ||
    errMsg.includes("image_decode_failed")
  ) {
    return {
      errorType: "IMAGE_DECODE_FAILED",
      errorCode: "IMAGE_DECODE_FAILED",
      message: "The image data is corrupted, malformed, or of an unsupported format. Please retry capturing or upload another image."
    };
  }

  if (
    isTransientError(error) ||
    errMsg.includes("gemini_unavailable") ||
    errMsg.includes("unavailable") ||
    errMsg.includes("overloaded")
  ) {
    return {
      errorType: "GEMINI_UNAVAILABLE",
      errorCode: "GEMINI_UNAVAILABLE",
      message: "The AI service is temporarily overloaded or unavailable. We are retrying the request..."
    };
  }

  if (
    errMsg.includes("parse") ||
    errMsg.includes("ocr_parse_failed") ||
    errMsg.includes("json") ||
    errMsg.includes("validation")
  ) {
    return {
      errorType: "OCR_PARSE_FAILED",
      errorCode: "OCR_PARSE_FAILED",
      message: "OCR scanning failed to extract structured question text. Please try taking a clearer picture."
    };
  }

  // Default server error
  return {
    errorType: "SERVER_ERROR",
    errorCode: "SERVER_ERROR",
    message: "A server error occurred while processing the OCR request."
  };
};

/**
 * --- THE API ROUTE: OCR MULTIMODAL QUESTION SCANNER ---
 * Extracts math, science, or general text questions from uploaded or captured base64 images
 * using Gemini's powerful multimodal parsing capabilities.
 */
app.post("/api/ocr", async (req, res) => {
  const startTime = Date.now();
  console.info(`\n============================================================`);
  console.info(`[Backend OCR Log] 📥 RECEIVED OCR REQUEST AT ${new Date().toISOString()}`);
  console.info(`============================================================`);
  // Helper to reliably build client-requested strict production JSON schema
  const buildOcrResponse = (opt: {
    status: "success" | "error";
    errorType?: string | null;
    errorCode?: string | number;
    extractedText?: string;
    confidence?: number;
    problemType?: "math" | "text" | "unknown";
    message?: string;
  }) => {
    let errorCodeVal = opt.errorCode || 0;
    if (opt.status === "error" && !errorCodeVal) {
      errorCodeVal = opt.errorType || "SERVER_ERROR";
    }
    return validateOCR({
      status: opt.status,
      error_code: errorCodeVal,
      error_type: opt.errorType || null,
      message: opt.message,
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
    const { image, mimeType, originalSize, clientSentTime } = req.body;

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

    // CHECKPOINT 2: Repair any transport corruption where "+" characters were replaced by spaces
    base64Data = base64Data.replace(/ /g, "+");

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
    "text": "the extracted clean math, formula, science or standard text in the full image",
    "confidence": 0.95,
    "problem_type": "math" | "text" | "unknown",
    "questions": [
      {
        "id": "q1",
        "text": "the exact text of this specific question/problem",
        "box": {
          "ymin": 10,
          "xmin": 5,
          "ymax": 35,
          "xmax": 95
        }
      }
    ]
  }
}

DIRECTIONS FOR QUESTION REGIONS:
- If there is only one question / mathematical equation in the image, output a single question element in "questions" representing the full question, estimating its bounding box (use 0, 0, 100, 100 or actual coordinate bounds if it occupies part of the image).
- If there are multiple separate questions or math equations / calculations visible in the image, identify each distinct question as a separate element in "questions" with its own text, a unique id (q1, q2, etc.), and its exact bounding box (ymin, xmin, ymax, xmax coordinates relative to the full image size from 0 to 100).
- If the image is blurry, low-contrast, unreadable, or doesn't have a clear readable text question, set status="error", error_type="LOW_QUALITY", error_code=1002, and questions=[]

FALLBACK AND CRITICAL ERROR RULES (If you fail or cannot parse):
- If no visible content in image -> status = 'error', error_type = 'EMPTY_IMAGE', error_code = 1001
- If image is blurry / unreadable -> status = 'error', error_type = 'LOW_QUALITY', error_code = 1002
- If format not supported -> status = 'error', error_type = 'UNSUPPORTED_FORMAT', error_code = 1004
- If image decoding failure -> status = 'error', error_type = 'CORRUPT_IMAGE', error_code = 1003`;

    // CHECKPOINT 3: Both camelCase and snake_case properties are supplied to be 100% compliant with REST API and SDK representations
    const imagePart = {
      inlineData: {
        mimeType: resolvedMimeType,
        mime_type: resolvedMimeType,
        data: base64Data,
      },
      inline_data: {
        mimeType: resolvedMimeType,
        mime_type: resolvedMimeType,
        data: base64Data,
      }
    };

    const textPart = {
      text: ocrPrompt + "\n\nCRITICAL: Return ONLY valid JSON matching this schema.",
    };

    // CHECKPOINT 1: Changed to "gemini-2.5-flash"
    const generateParams = {
      model: "gemini-2.5-flash",
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
                },
                questions: {
                  type: Type.ARRAY,
                  description: "List of detected distinct question/problem regions in the image.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: {
                        type: Type.STRING,
                        description: "Unique string ID for this question (e.g. q1, q2, ...)"
                      },
                      text: {
                        type: Type.STRING,
                        description: "The exact extracted text of this specific question region."
                      },
                      box: {
                        type: Type.OBJECT,
                        description: "Normalized coordinate bounding box of the question in percentages relative to image size, from 0 to 100",
                        properties: {
                          ymin: { type: Type.NUMBER, description: "Top Y coordinate percentage (0-100)" },
                          xmin: { type: Type.NUMBER, description: "Left X coordinate percentage (0-100)" },
                          ymax: { type: Type.NUMBER, description: "Bottom Y coordinate percentage (0-100)" },
                          xmax: { type: Type.NUMBER, description: "Right X coordinate percentage (0-100)" }
                        },
                        required: ["ymin", "xmin", "ymax", "xmax"]
                      }
                    },
                    required: ["id", "text", "box"]
                  }
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
    let geminiApiError: any = null;
    let geminiProcessingTime = 0;

    // Robust backend-side retries with exponential backoff on primary structured generation
    const backoffTimes = [0, 1500, 3000]; // Multi-attempt retry delays
    for (let attempt = 0; attempt < backoffTimes.length; attempt++) {
      try {
        if (attempt > 0) {
          const backoff = backoffTimes[attempt];
          console.warn(`[Backend OCR Log] [Attempt ${attempt + 1}/${backoffTimes.length}] Transient error or socket timeout, sleeping ${backoff}ms before backoff retry...`);
          await sleep(backoff);
        }

        console.info(`[Backend OCR Log] [Attempt ${attempt + 1}/${backoffTimes.length}] Dispatching primary generation call to Gemini...`);
        const geminiCallStart = Date.now();

        // CHECKPOINT 4: Log the complete Gemini request (excluding API key)
        console.info(`[Backend Gemini Request Log] Target Model: ${generateParams.model}, Params: ${JSON.stringify({
          model: generateParams.model,
          contents: {
            parts: [
              { inlineData: { mimeType: imagePart.inlineData.mimeType, data: `[Base64 length: ${imagePart.inlineData.data.length} chars]` } },
              textPart
            ]
          },
          config: generateParams.config
        }, null, 2)}`);

        response = await ai.models.generateContent(generateParams);
        const elapsed = Date.now() - geminiCallStart;
        geminiProcessingTime += elapsed;
        const geminiLatency = (elapsed / 1000).toFixed(2);
        
        textOutput = response.text || "";
        isSuccessful = true;
        
        console.info(`[Backend OCR Log] [Attempt ${attempt + 1}/${backoffTimes.length}] Call completed successfully. Latency: ${geminiLatency}s, Response character count: ${textOutput.length}`);
        
        // CHECKPOINT 4: Log the full response
        console.info(`[Backend Gemini Response Log] Response Payload: ${JSON.stringify(response, null, 2)}`);
        break; // Succeeded! Break retry loop
      } catch (err: any) {
        geminiApiError = err;
        console.error(`[Backend OCR Log] [Attempt ${attempt + 1}/${backoffTimes.length}] Call failed. Error message: ${err?.message || err}`);
        
        // Immediate termination if the error indicates a structural issue (unauthorized / invalid API key)
        const errMsgLower = String(err?.message || err).toLowerCase();
        const status = err?.status || err?.code;
        if (status === 401 || status === 403 || errMsgLower.includes("api key") || errMsgLower.includes("key is missing") || errMsgLower.includes("unauthorized")) {
          console.error("[Backend OCR Log] 🛑 Unauthorized API Key detected. Aborting backend retry loop.");
          break;
        }

        // If it's a transient error or timeout, let it loop and sleep
        if (isTransientError(err) || errMsgLower.includes("timeout") || errMsgLower.includes("deadline") || errMsgLower.includes("socket")) {
          continue;
        }

        // Other non-transient failures should abort immediately to save resources
        break;
      }
    }

    // Fallback: If primary structured generation failed, submit a schema-free request and parse manually
    if (!isSuccessful || !textOutput || !textOutput.trim()) {
      console.warn("[Backend OCR Log] ⚠️ Structured OCR failed or exhausted retries. Invoking schema-free fallback...");
      try {
        const fallbackParams = {
          model: "gemini-2.5-flash", // CHECKPOINT 1: Changed to "gemini-2.5-flash"
          contents: {
            parts: [
              imagePart,
              {
                text: ocrPrompt + "\n\nCRITICAL: You must return a single strict JSON object complying with the key mapping schema directly without code block markdown. Return ONLY JSON."
              }
            ]
          }
        };

        const fallbackStart = Date.now();
        
        // CHECKPOINT 4: Log fallback request
        console.info(`[Backend Gemini Fallback Request Log] Target Model: ${fallbackParams.model}, Params: ${JSON.stringify({
          model: fallbackParams.model,
          contents: {
            parts: [
              { inlineData: { mimeType: imagePart.inlineData.mimeType, data: `[Base64 length: ${imagePart.inlineData.data.length} chars]` } },
              { text: (fallbackParams.contents.parts[1] as any).text }
            ]
          }
        }, null, 2)}`);

        const fallbackResponse = await ai.models.generateContent(fallbackParams);
        const elapsed = Date.now() - fallbackStart;
        geminiProcessingTime += elapsed;
        const fallbackLatency = (elapsed / 1000).toFixed(2);

        textOutput = fallbackResponse.text || "";
        console.info(`[Backend OCR Log] Fallback schema-free call completed. Latency: ${fallbackLatency}s, Length: ${textOutput.length}`);
        
        // CHECKPOINT 4: Log fallback response
        console.info(`[Backend Gemini Fallback Response Log] Response Payload: ${JSON.stringify(fallbackResponse, null, 2)}`);
      } catch (fallbackErr: any) {
        console.error("[Backend OCR Log] 🛑 Fallback schema-free call also failed:", fallbackErr.message || fallbackErr);
        
        // Map the original or fallback error to friendly output rather than hardcoded TIMEOUT
        const finalDiagnostic = analyzeAndMapError(geminiApiError || fallbackErr);
        const isDev = process.env.NODE_ENV !== "production";
        const messageToClient = isDev
          ? `${finalDiagnostic.message}\n\n[Dev Diagnostics]\nError Code: ${finalDiagnostic.errorCode}\nStack: ${(geminiApiError || fallbackErr)?.stack || (geminiApiError || fallbackErr)?.message}`
          : finalDiagnostic.message;

        return res.json(buildOcrResponse({
          status: "error",
          errorType: finalDiagnostic.errorType,
          errorCode: finalDiagnostic.errorCode,
          message: messageToClient
        }));
      }
    }

    // Strict Output Gate: Gemini -> HARD PARSER -> validateOCR -> frontend
    const parseStart = Date.now();
    const finalResult = validateOCR(hardParser(textOutput)) as any;
    const responseParsingTime = Date.now() - parseStart;

    // CHECKPOINT 8: If Gemini returns an error or no text, populate custom message with raw text output so the client can display it for debugging
    if (finalResult.status === "error") {
      finalResult.message = finalResult.message || `The OCR pipeline failed or returned empty text. Raw response from Gemini: "${textOutput || '(no text returned)'}"`;
    }

    // Metrics tracking and structured server logging
    const resolvedOriginalSize = Number(originalSize) || base64Data.length * 3 / 4;
    const compressedSize = base64Data.length * 3 / 4;
    const uploadDuration = clientSentTime ? Date.now() - Number(clientSentTime) : null;
    const totalRequestDuration = Date.now() - startTime;
    const compressionRatioVal = compressedSize > 0 ? (resolvedOriginalSize / compressedSize).toFixed(2) : "1.00";

    console.info(`============================================================`);
    console.info(`📊 Backend OCR Diagnostics Metrics:`);
    console.info(`- Original Upload Size: ${resolvedOriginalSize} bytes (${(resolvedOriginalSize / 1024).toFixed(2)} KB)`);
    console.info(`- Compressed Size: ${compressedSize} bytes (${(compressedSize / 1024).toFixed(2)} KB)`);
    console.info(`- Compression Ratio: ${compressionRatioVal}x`);
    console.info(`- Upload Duration: ${uploadDuration !== null ? `${uploadDuration}ms` : "N/A"}`);
    console.info(`- Gemini Processing Time: ${geminiProcessingTime}ms (${(geminiProcessingTime / 1000).toFixed(2)}s)`);
    console.info(`- Response Parsing Time: ${responseParsingTime}ms`);
    console.info(`- Total Request Duration: ${totalRequestDuration}ms (${(totalRequestDuration / 1000).toFixed(2)}s)`);
    console.info(`============================================================\n`);

    return res.json(finalResult);

  } catch (error: any) {
    const diagnostic = analyzeAndMapError(error);
    const isDev = process.env.NODE_ENV !== "production";
    const messageToClient = isDev
      ? `${diagnostic.message}\n\n[Dev Diagnostics]\nError Code: ${diagnostic.errorCode}\nStack: ${error?.stack || error?.message}`
      : diagnostic.message;

    return res.json(buildOcrResponse({
      status: "error",
      errorType: diagnostic.errorType,
      errorCode: diagnostic.errorCode,
      message: messageToClient
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
    const explainBackoffTimes = [1500, 3000]; // Multi-stage backoff
    let explainSuccess = false;
    let explainError: any = null;

    for (let attempt = 0; attempt <= explainBackoffTimes.length; attempt++) {
      if (attempt > 0) {
        console.warn(`[Backend Explain Log] Transient error detected. Retrying in ${explainBackoffTimes[attempt - 1]}ms... (Attempt ${attempt}/${explainBackoffTimes.length})`);
        await sleep(explainBackoffTimes[attempt - 1]);
      }
      try {
        response = await ai.models.generateContent(generateParams);
        explainSuccess = true;
        break;
      } catch (err: any) {
        explainError = err;
        console.error(`[Backend Explain Log] Attempt ${attempt + 1} failed:`, err?.message || err);
        if (!isTransientError(err)) {
          break; // Abort retry loop immediately for non-transient failures
        }
      }
    }

    if (!explainSuccess || !response) {
      const isQuota = String(explainError?.message || explainError).toLowerCase().includes("quota") || explainError?.status === 429;
      if (isQuota) {
        return res.status(429).json({
          success: false,
          error: "⚠️ You have exceeded the temporary rate limit. Please wait a few seconds before trying again.",
        });
      }
      return res.status(explainError?.status || 500).json({
        success: false,
        error: explainError?.message || "An unexpected error occurred during the AI explanation process.",
      });
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
