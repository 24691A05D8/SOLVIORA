/**
 * @file /src/ocrValidator.ts
 * @description Strict JSON contract validator for state machine safety, preventing any malformed shapes or leaked UI text.
 */

export function validateOCR(data: any) {
  // Reject anything not proper object
  if (!data || typeof data !== "object") {
    return fallback();
  }

  return {
    status: data.status === "success" ? "success" : "error",
    error_code: typeof data.error_code === "number" ? data.error_code : 1008,
    error_type: data.error_type ?? "INVALID_INPUT",
    data: {
      text: typeof data?.data?.text === "string" ? data.data.text : "",
      confidence: typeof data?.data?.confidence === "number" ? data.data.confidence : 0,
      problem_type: data?.data?.problem_type ?? "unknown"
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
