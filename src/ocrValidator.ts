/**
 * @file /src/ocrValidator.ts
 * @description Strict JSON contract validator for state machine safety, preventing any malformed shapes or leaked UI text.
 */

export function validateOCR(data: any) {
  // Reject anything not proper object
  if (!data || typeof data !== "object") {
    return fallback();
  }

  const isSuccess = data.status === "success";
  const questionsList = Array.isArray(data?.data?.questions) ? data.data.questions : null;

  return {
    status: isSuccess ? "success" : "error",
    error_code: typeof data.error_code === "number" ? data.error_code : (isSuccess ? 0 : 1008),
    error_type: isSuccess ? null : (data.error_type ?? "INVALID_INPUT"),
    data: {
      text: typeof data?.data?.text === "string" ? data.data.text : "",
      confidence: typeof data?.data?.confidence === "number" ? data.data.confidence : (isSuccess ? 0.95 : 0.0),
      problem_type: (data?.data?.problem_type === "math" || data?.data?.problem_type === "text" || data?.data?.problem_type === "unknown") 
        ? data.data.problem_type 
        : "unknown",
      ...(questionsList ? { questions: questionsList } : {})
    }
  };
}

export function fallback() {
  return {
    status: "error",
    error_code: 1008,
    error_type: "INVALID_INPUT",
    data: { text: "", confidence: 0, problem_type: "unknown" }
  };
}

/**
 * PRODUCTION-GRADE HARD PARSER:
 * Analyzes raw outputs from Gemini, sanitizes them of unauthorized strings, markdown, and leaks,
 * and ensures safe mapping of any potential garbage to correct structured JSON codes.
 */
export function hardParser(rawText: string): any {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return {
      status: "error",
      error_code: 1001,
      error_type: "EMPTY_IMAGE",
      data: { text: "", confidence: 0, problem_type: "unknown" }
    };
  }

  const cleaned = rawText.trim();
  let parsed: any = null;

  // 1. Core JSON parsing attempts with fallback extractions
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    try {
      const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (match && match[1]) {
        parsed = JSON.parse(match[1].trim());
      }
    } catch (e2) {
      try {
        const first = cleaned.indexOf('{');
        const last = cleaned.lastIndexOf('}');
        if (first !== -1 && last !== -1 && last > first) {
          parsed = JSON.parse(cleaned.substring(first, last + 1));
        }
      } catch (e3) {
        // parsing failed
      }
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      status: "error",
      error_code: 1008,
      error_type: "INVALID_INPUT",
      data: { text: "", confidence: 0, problem_type: "unknown" }
    };
  }

  // 2. Extract key components safely
  let status = parsed.status === "success" ? "success" : "error";
  let error_code = typeof parsed.error_code === "number" ? parsed.error_code : (status === "error" ? 1008 : 0);
  let error_type = parsed.error_type ?? (status === "error" ? "INVALID_INPUT" : null);

  let innerText = "";
  if (parsed.data && typeof parsed.data.text === "string") {
    innerText = parsed.data.text;
  } else if (typeof parsed.text === "string") {
    innerText = parsed.text;
  }

  // 3. Strict sanitizer rules for the extracted text (Preventing ALL UI labels, instructions, or bad debug tokens)
  const forbiddenRegexes = [
    /try\s+another\s+screenshot/gi,
    /try\s+again/gi,
    /capture\s+again/gi,
    /new\s+scan/gi,
    /recrop\s+image/gi,
    /view\s+technical\s+details/gi,
    /technical\s+details/gi,
  ];

  for (const regex of forbiddenRegexes) {
    innerText = innerText.replace(regex, "");
  }

  // Filter isolated single-char garbage or test fragments like "SC" or "S"
  innerText = innerText.replace(/\bSC\b/g, "");
  innerText = innerText.replace(/\bS\b/g, "");

  // Clean layout and double spacers
  innerText = innerText.replace(/\s+/g, " ").trim();

  // If text became completely empty, we fallback to LOW_QUALITY error status
  if (status === "success" && !innerText) {
    status = "error";
    error_code = 1002; // LOW_QUALITY
    error_type = "LOW_QUALITY";
  }

  const confidenceVal = typeof parsed.data?.confidence === "number" 
    ? parsed.data.confidence 
    : (status === "success" ? 0.95 : 0.0);

  const problemTypeVal = parsed.data?.problem_type ?? parsed.problem_type ?? "unknown";
  
  const questionsList = Array.isArray(parsed?.data?.questions) 
    ? parsed.data.questions 
    : (Array.isArray(parsed?.questions) ? parsed.questions : undefined);

  return {
    status,
    error_code,
    error_type,
    data: {
      text: innerText,
      confidence: confidenceVal,
      problem_type: problemTypeVal,
      ...(questionsList ? { questions: questionsList } : {})
    }
  };
}
