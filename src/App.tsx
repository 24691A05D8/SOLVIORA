/**
 * @file /src/App.tsx
 * @description The main interactive client (Frontend) of the Smart AI Calculator Suite. This combines
 * a traditional classic precision calculator, a modern natural-language AI solver, a live pipeline
 * flowchart diagram, and educational annotations for beginner full-stack developers.
 *
 * =============================================================================================
 *                      --- FULL-STACK ARCHITECTURAL LESSONS FOR LEARNERS ---
 * =============================================================================================
 *
 * 1. WHICH DIRECT SECTION IS THE FRONTEND (UI)?
 *    The entire React visual layout returned in the main render block of App() is the FRONTEND.
 *    It lives solely in the User's Web Browser. Its job represents managing layouts, clicking levers,
 *    updating state, and providing prompt inputs.
 *
 * 2. WHICH PART SENDS THE REQUEST TO THE AI ENGINE?
 *    The asynchronous fetch command inside `handleAiExplain` dispatches a POST request to `/api/explain`
 *    across the internet socket connection.
 *    See line reference: `fetch("/api/explain", { method: "POST", body: ... })`
 *
 * 3. WHICH PART RECEIVES THE AI RESPONSE PACKET?
 *    Directly after dispatching the HTTP packet, our frontend uses `await response.json()` to parse the
 *    structured JSON response, assigning it to React states (`setAiExplanation`, `setAiResult`).
 *
 * 4. WHY IS THIS CALLED "BACKGROUND PROCESSING"?
 *    Because the browser triggers the request securely and non-blockingly using `async/await`.
 *    The user interface remains perfectly fluid at 60 frames per second. Buttons remain hot and
 *    clickable while our Node Express server coordinates heavy mathematical reasoning alongside Gemini
 *    hundreds of miles away.
 */

import { useState, useEffect } from "react";
import { 
  Calculator, 
  Sparkles, 
  History, 
  Cpu, 
  Info, 
  Sun, 
  Moon, 
  Share2, 
  Trash2, 
  ArrowRight,
  TrendingUp, 
  Copy, 
  Check, 
  RotateCcw,
  Sparkle,
  Terminal,
  HelpCircle,
  RefreshCw
} from "lucide-react";
import { CalculationItem } from "./types";
import { motion, AnimatePresence } from "motion/react";
import SplashScreen from "./components/SplashScreen";
import CameraScanner from "./components/CameraScanner";
import ErrorBoundary from "./components/ErrorBoundary";

// Custom parser to format explanation markdown elements to JSX nicely
function renderExplanation(text: string, isDark: boolean) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div className="space-y-2 text-left">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }
        
        // Match Markdown headings: e.g., "### Heading" or "## Heading"
        if (trimmed.startsWith("###")) {
          return (
            <h5 key={idx} className="text-[11px] font-black uppercase text-indigo-400 tracking-wider mt-4.5 mb-1.5 flex items-center gap-1.5 border-b border-indigo-500/10 pb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              {trimmed.replace(/^###\s*/, "")}
            </h5>
          );
        }
        if (trimmed.startsWith("##")) {
          return (
            <h4 key={idx} className="text-xs font-black uppercase text-indigo-400 mt-4.5 mb-1.5">
              {trimmed.replace(/^##\s*/, "")}
            </h4>
          );
        }
        if (trimmed.startsWith("#")) {
          return (
            <h3 key={idx} className="text-sm font-black text-indigo-400 mt-5 mb-2">
              {trimmed.replace(/^#\s*/, "")}
            </h3>
          );
        }

        // Match list bullets: "- Bullet" or "* Bullet"
        if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          const content = trimmed.replace(/^[-*]\s*/, "");
          return (
            <div key={idx} className="flex items-start gap-2 pl-3 text-xs leading-relaxed mt-1">
              <span className="text-indigo-500 font-extrabold select-none shrink-0">•</span>
              <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                {content}
              </span>
            </div>
          );
        }

        // Standard lines
        return (
          <p key={idx} className={`text-xs leading-relaxed font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {line}
          </p>
        );
      })}
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  
  // --- CONFIGURABLE UX STATES ---
  const [isDark, setIsDark] = useState<boolean>(true); // Defaults to gorgeous deep navy slate dark theme
  const [activeTab, setActiveTab] = useState<"calculator" | "tutor" | "history">("tutor"); // Default tab displays AI Tutor first

  // --- CALCULATION INPUT & OUTPUT STATES ---
  const [expression, setExpression] = useState<string>("");
  const [calcResult, setCalcResult] = useState<string>("");
  const [degMode, setDegMode] = useState<boolean>(true); // Degrees by default
  const [aiQuestion, setAiQuestion] = useState<string>("");

  // --- AI STREAMING & DIAGNOSTICS LOGIC STATES ---
  const [aiResult, setAiResult] = useState<string>("");
  const [aiExplanation, setAiExplanation] = useState<string>("");
  const [aiSteps, setAiSteps] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState<number>(0);
  const [lastSolvedQuestion, setLastSolvedQuestion] = useState<string>("");

  // --- PERSISTENT CALCULATIONS HISTORY ---
  const [historyList, setHistoryList] = useState<CalculationItem[]>([]);

  // Diagnostics Progress Indicator (0 to 5 matching the diagram steps)
  const [activeStep, setActiveStep] = useState<number>(0);

  // Load calculation logs from local storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("math_history_saas_navy");
      if (saved) {
        setHistoryList(JSON.parse(saved));
      } else {
        // Set premium sample entries
        const initialSamples: CalculationItem[] = [
          {
            id: "preset-sh-1",
            type: "ai",
            input: "What is half of 250 plus 30?",
            result: "155",
            explanation: "To solve 'half of 250 plus 30', we first solve the priority fraction: half of 250 is 125 (calculated as 250 / 2). Then we add 30 to 125, which gives the final calculated sum of 155.",
            steps: [
              "Understand that half of a number means dividing it by 2: 250 / 2",
              "Execute the division: 250 / 2 = 125",
              "Execute the addition: 125 + 30 = 155"
            ],
            timestamp: Date.now() - 360000,
          },
          {
            id: "preset-sh-2",
            type: "standard",
            input: "√144 × 5",
            result: "60",
            timestamp: Date.now() - 1200000,
          },
        ];
        setHistoryList(initialSamples);
        localStorage.setItem("math_history_saas_navy", JSON.stringify(initialSamples));
      }
    } catch (err) {
      console.warn("Storage access restricted or currently disabled in browser container.", err);
    }
  }, []);

  // Safe localStorage sync
  const saveToHistory = (newItem: CalculationItem) => {
    setHistoryList((prev) => {
      const updated = [newItem, ...prev].slice(0, 30);
      try {
        localStorage.setItem("math_history_saas_navy", JSON.stringify(updated));
      } catch (err) {
        console.warn(err);
      }
      return updated;
    });
  };

  const clearHistory = () => {
    setHistoryList([]);
    try {
      localStorage.removeItem("math_history_saas_navy");
    } catch (err) {
      console.warn(err);
    }
  };

  // --- CLASSIC CLIENT-SIDE MATHEMATICS ENGINE ---
  const handleCalcClick = (val: string) => {
    setExpression((prev) => prev + val);
  };

  const handleClear = () => {
    setExpression("");
    setCalcResult("");
  };

  const handleBackspace = () => {
    setExpression((prev) => prev.slice(0, -1));
  };

  const evaluateExpressionLocal = () => {
    if (!expression) return;
    try {
      let sanitized = expression
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/\^/g, "**");

      // Replace standard raw roots like "√144" with "sqrt(144)"
      sanitized = sanitized.replace(/√([0-9.]+)/g, "sqrt($1)");
      // Any remaining standalone '√' (like when they typed √() becomes "sqrt"
      sanitized = sanitized.replace(/√/g, "sqrt");

      if (sanitized.includes("%")) {
        sanitized = sanitized.replace(/%/g, "/100");
      }

      // Check for strictly sanctioned characters to keep sandbox and eval safe
      if (!/^[a-zA-Z0-9+\-*/%.()\s^]+$/.test(sanitized)) {
        setCalcResult("Invalid Input");
        return;
      }

      const calculated = new Function(
        "sin", "cos", "tan", "log", "ln", "sqrt",
        `return (${sanitized})`
      )(
        (x: number) => degMode ? Math.sin(x * Math.PI / 180) : Math.sin(x),
        (x: number) => degMode ? Math.cos(x * Math.PI / 180) : Math.cos(x),
        (x: number) => degMode ? Math.tan(x * Math.PI / 180) : Math.tan(x),
        (x: number) => Math.log10(x),
        (x: number) => Math.log(x),
        (x: number) => Math.sqrt(x)
      );

      if (calculated === undefined || isNaN(calculated) || !isFinite(calculated)) {
        setCalcResult("Math Error");
        return;
      }

      const outcomeStr = Number(Number(calculated).toFixed(8)).toString();
      setCalcResult(outcomeStr);

      saveToHistory({
        id: Date.now().toString(),
        type: "standard",
        input: expression,
        result: outcomeStr,
        timestamp: Date.now(),
      });
    } catch (err) {
      setCalcResult("Parse Error");
    }
  };

  // --- ASYNCHRONOUS BACKGROUND AI CLIENT MODULE ---
  const handleAiExplain = async (overridePrompt?: string) => {
    const promptText = (overridePrompt || aiQuestion).trim();

    if (!promptText) {
      setErrorMsg("Please type a clear, mathematical question first!");
      return;
    }

    // 7. Prevent duplicate requests if already in progress
    if (isLoading) {
      return;
    }

    // 8. Optimize API usage: Avoid unnecessary repeated requests if the exact query was already successfully solved
    if (aiResult && lastSolvedQuestion === promptText && !errorMsg) {
      console.info("[AI Optimization] Skipping duplicate request as this question is already successfully solved.");
      return;
    }

    setErrorMsg("");
    setIsLoading(true);
    setAiResult("");
    setAiExplanation("");
    setAiSteps([]);
    setRetryAttempt(0);

    // Diagram Step 1: User Input Captured
    setActiveStep(1);
    await new Promise((r) => setTimeout(r, 450));

    // Diagram Step 2: Frontend prepares packet
    setActiveStep(2);
    await new Promise((r) => setTimeout(r, 450));

    // Diagram Step 3: Backend securely proxies request
    setActiveStep(3);

    const maxRetries = 3;
    const retryDelays = [2000, 4000, 8000]; // 2s, 4s, 8s backoff delays as requested
    let success = false;
    let attempt = 0;

    while (attempt <= maxRetries && !success) {
      if (attempt > 0) {
        setRetryAttempt(attempt);
        const delayMs = retryDelays[attempt - 1];
        console.warn(`[AI Retry System] Attempt ${attempt}/${maxRetries} failed. Retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }

      try {
        const response = await fetch("/api/explain", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ question: promptText }),
        });

        // 5. Detect and handle various categories of error statuses
        if (!response.ok) {
          const responseBody = await response.text().catch(() => "");
          // 6. Log the complete API error in the browser console for debugging
          console.error(`[AI API Error Log] Status: ${response.status} ${response.statusText}`, {
            status: response.status,
            statusText: response.statusText,
            responseBody,
            url: "/api/explain",
            attempt: attempt + 1
          });

          throw new Error(`API_ERROR: HTTP ${response.status} - ${responseBody || response.statusText}`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          const rawText = await response.text().catch(() => "");
          throw new Error(`Expected JSON response but received Content-Type: "${contentType}". Body: ${rawText.substring(0, 200)}`);
        }

        const data = await response.json();

        if (data.success) {
          // Diagram Step 4: AI Model Thinking parallel animation
          setActiveStep(4);
          await new Promise((r) => setTimeout(r, 700));

          // Diagram Step 5: Rendering data callback
          setActiveStep(5);
          setAiResult(data.result);
          setAiExplanation(data.explanation);
          setAiSteps(data.steps || []);
          setLastSolvedQuestion(promptText);

          saveToHistory({
            id: Date.now().toString(),
            type: "ai",
            input: promptText,
            result: data.result,
            explanation: data.explanation,
            steps: data.steps,
            timestamp: Date.now(),
          });

          success = true;
          setRetryAttempt(0);
        } else {
          // 6. Log the complete API error in the browser console for debugging
          console.error(`[AI API Error Log] Server returned successful HTTP response but failed solver payload:`, data);
          throw new Error(data.error || "The server could not solve this math statement.");
        }
      } catch (err: any) {
        // 6. Log the complete API error in the browser console for debugging
        console.error(`[AI Solviora Solver] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, err);
        
        attempt++;
        if (attempt > maxRetries) {
          // 4. If all retries fail: display friendly message, keep user input preserved
          setErrorMsg("The AI service is temporarily busy. Your question has been saved. Please try again in a few moments.");
          setActiveStep(0);
          setRetryAttempt(0);
        }
      }
    }

    setIsLoading(false);
  };

  const loadPreset = (presetText: string) => {
    setAiQuestion(presetText);
    handleAiExplain(presetText);
  };

  // Bridging: User clicks standard equation to read detailed AI reasoning walkthrough
  const promoteToAiTutor = (originalExpression: string, fallbackVal?: string) => {
    const defaultQuery = `Explain calculation ${originalExpression} with solution ${fallbackVal || ""}`;
    setAiQuestion(defaultQuery);
    setActiveTab("tutor");
    handleAiExplain(defaultQuery);
  };

  const loadHistoryItem = (item: CalculationItem) => {
    if (item.type === "standard") {
      setExpression(item.input);
      setCalcResult(item.result);
      setActiveTab("calculator");
    } else {
      setAiQuestion(item.input);
      setAiResult(item.result);
      setAiExplanation(item.explanation || "");
      setAiSteps(item.steps || []);
      setActiveTab("tutor");
    }
  };

  const copyToClipboard = (text: string, elementId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(elementId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className={`min-h-screen font-sans antialiased transition-colors duration-500 flex flex-col ${
      isDark 
        ? "bg-[#070d19] text-slate-100" 
        : "bg-slate-50 text-slate-800"
    }`} id="root-app-viewport">
      
      {/* Premium Full-Screen Splash Screen Overlay */}
      <AnimatePresence mode="wait">
        {showSplash && (
          <SplashScreen key="solviora-splash" onComplete={() => setShowSplash(false)} />
        )}
      </AnimatePresence>
      
      {/* SaaS HEADER SECTION */}
      <header className={`border-b transition-all duration-300 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 ${
        isDark 
          ? "bg-[#0b1424]/90 border-slate-800" 
          : "bg-white/95 border-slate-200 shadow-sm"
      }`} id="saas-header">
        
        {/* Brand Identity / Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-indigo-950/40 border border-indigo-500/20 shadow-[0_0_15px_rgba(126,87,255,0.25)] transform hover:scale-105 transition-transform duration-300">
              <svg
                viewBox="0 0 200 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full relative z-10 drop-shadow-[0_0_8px_rgba(14,165,233,0.35)]"
              >
                <defs>
                  <linearGradient id="sBodyGradientHeader" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00F2FE" />
                    <stop offset="60%" stopColor="#2563EB" />
                    <stop offset="100%" stopColor="#D946EF" />
                  </linearGradient>
                  <linearGradient id="orbitGradientHeader" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#9333EA" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="neuralPathGradientHeader" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#06B6D4" />
                    <stop offset="100%" stopColor="#6366F1" />
                  </linearGradient>
                </defs>

                <path
                  d="M 52 148 C 30 115, 30 75, 60 52 C 90 30, 140 38, 162 70 C 172 85, 175 105, 172 122 C 168 140, 155 155, 138 162 C 115 172, 85 168, 68 152"
                  stroke="url(#orbitGradientHeader)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="4 2"
                />

                <path
                  d="M 156 36 L 159.5 45 L 168 48.5 L 159.5 52 L 156 61 L 152.5 52 L 144 48.5 L 152.5 45 Z"
                  fill="#D946EF"
                />
                <path
                  d="M 172 58 L 174 63 L 179 65 L 174 67 L 172 72 L 170 67 L 165 65 L 170 63 Z"
                  fill="#60A5FA"
                />

                <g id="neural-brain-overlay-header" opacity="0.9">
                  <path d="M 44 80 Q 56 82 66 75" stroke="url(#neuralPathGradientHeader)" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M 42 98 C 50 98, 54 94, 68 91" stroke="url(#neuralPathGradientHeader)" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M 46 116 Q 58 112 68 108" stroke="url(#neuralPathGradientHeader)" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M 48 132 C 55 132, 60 125, 75 125" stroke="url(#neuralPathGradientHeader)" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M 58 145 Q 68 140 82 136" stroke="url(#neuralPathGradientHeader)" strokeWidth="1.5" strokeLinecap="round" />
                  
                  <circle cx="44" cy="80" r="4.5" fill="#22D3EE" />
                  <circle cx="44" cy="80" r="1.5" fill="#FFFFFF" />

                  <circle cx="42" cy="98" r="4" fill="#38BDF8" />
                  <circle cx="42" cy="98" r="1.5" fill="#FFFFFF" />

                  <circle cx="46" cy="116" r="4.5" fill="#60A5FA" />
                  <circle cx="46" cy="116" r="1.5" fill="#FFFFFF" />

                  <circle cx="48" cy="132" r="4" fill="#818CF8" />
                  <circle cx="48" cy="132" r="1.5" fill="#FFFFFF" />

                  <circle cx="58" cy="145" r="5" fill="#A78BFA" />
                  <circle cx="58" cy="145" r="2" fill="#FFFFFF" />
                </g>

                <path
                  d="M 125 55 
                     C 114 42, 85 45, 82 65 
                     C 78 85, 122 92, 124 112 
                     C 126 130, 110 148, 85 145
                     C 72 143, 62 135, 62 135
                     C 62 135, 74 153, 94 154
                     C 122 155, 142 135, 140 112
                     C 137 88, 98 84, 96 68
                     C 94 54, 110 48, 122 55 Z"
                  fill="url(#sBodyGradientHeader)"
                />

                <g id="math-operators-header" opacity="0.85">
                  <path d="M 120 78 H 128 M 124 74 V 82" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M 143 103 H 151" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M 100 120 L 106 126 M 106 120 L 100 126" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M 117 136 H 125 M 121 132 A 0.8 0.8 0 1 1 121 133 M 121 140 A 0.8 0.8 0 1 1 121 141" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                </g>
              </svg>
            </div>
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-[#0b1424] animate-ping"></span>
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-[#0b1424]"></span>
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight flex items-center gap-1.5">
              SOLVIORA <span className="text-xs font-black uppercase text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded tracking-wider">AI</span>
            </h1>
          </div>
        </div>
      </header>

      {/* CORE NAVIGATION TABS PLATFORM */}
      <div className="max-w-7xl mx-auto px-6 mt-6 w-full" id="tabs-navigation-panel">
        <div className={`flex p-1.5 rounded-2xl border transition-all duration-300 ${
          isDark ? "bg-[#111e35]/60 border-slate-800" : "bg-slate-100 border-slate-200"
        }`}>
          <div className="grid grid-cols-3 gap-1.5 w-full">
            <button
              onClick={() => setActiveTab("tutor")}
              className={`py-3.5 px-4 rounded-xl text-xs font-bold tracking-wide transition-all uppercase flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === "tutor"
                  ? isDark 
                    ? "bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-600/20 scale-[1.01]" 
                    : "bg-white text-indigo-700 shadow shadow-slate-200 scale-[1.01]"
                  : isDark 
                    ? "text-slate-400 hover:text-slate-200 hover:bg-[#1a2d4b]/40" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
              id="tab-btn-tutor"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">AI Tutor Resolver</span>
            </button>

            <button
              onClick={() => setActiveTab("calculator")}
              className={`py-3.5 px-4 rounded-xl text-xs font-bold tracking-wide transition-all uppercase flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === "calculator"
                  ? isDark 
                    ? "bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-600/20 scale-[1.01]" 
                    : "bg-white text-indigo-700 shadow shadow-slate-200 scale-[1.01]"
                  : isDark 
                    ? "text-slate-400 hover:text-slate-200 hover:bg-[#1a2d4b]/40" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
              id="tab-btn-calculator"
            >
              <Calculator className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Classic Calculator</span>
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`py-3.5 px-4 rounded-xl text-xs font-bold tracking-wide transition-all uppercase flex items-center justify-center gap-2 cursor-pointer relative ${
                activeTab === "history"
                  ? isDark 
                    ? "bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-600/20 scale-[1.01]" 
                    : "bg-white text-indigo-700 shadow shadow-slate-200 scale-[1.01]"
                  : isDark 
                    ? "text-slate-400 hover:text-slate-200 hover:bg-[#1a2d4b]/40" 
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
              id="tab-btn-history"
            >
              <History className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Calculation History</span>
              {historyList.length > 0 && (
                <span className="absolute top-2 right-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* MAIN VIEWPORT BODY */}
      <main className="max-w-7xl mx-auto px-6 py-6 w-full flex-1 flex flex-col justify-start" id="main-content-layout">
        
        {/* VIEW ROUTER FOR DIFFERENT TABS */}
        <AnimatePresence mode="wait">
          
          {/* TAB 1: AI TUTOR WORKSPACE */}
          {activeTab === "tutor" && (
            <motion.div
              key="tutor-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
              id="view-ai-tutor"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left side column: Entry controls & Live Pipeline Graph */}
                <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-6">
                  
                  {/* CENTRAL NATURAL LANGUAGE MATH GATE */}
                  <div className={`border rounded-3xl p-6 transition-all duration-300 relative ${
                    isDark 
                      ? "bg-[#111e35] border-slate-700/60 shadow-xl" 
                      : "bg-white border-slate-200 shadow shadow-slate-100"
                  }`} id="ai-reasoner-entry">
                    
                    <h3 className="font-extrabold text-base tracking-tight mb-2 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
                      Solve with AI Tutor
                    </h3>
                    
                    <p className={`text-xs mb-4 leading-normal ${
                      isDark ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Type any arithmetic calculation or conceptual word problem, then watch Gemini decompose execution routines step-by-step.
                    </p>

                    {/* MULTIMODAL CAMERA/IMAGE OCR SCANNER COMPONENT */}
                    <div className="mb-4">
                      <ErrorBoundary
                        fallbackTitle="OCR Scanner Inactive"
                        fallbackMessage="The Solviora OCR image scanner captured a rendering exception. Rest assured, you can still type your questions manually below."
                      >
                        <CameraScanner
                          isDark={isDark}
                          onTextScanned={(extractedText, solveImmediately) => {
                            setAiQuestion(extractedText);
                            if (solveImmediately) {
                              handleAiExplain(extractedText);
                            }
                          }}
                          isLoadingSolver={isLoading}
                        />
                      </ErrorBoundary>
                    </div>

                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAiExplain();
                      }}
                      className="space-y-4"
                    >
                      <div className="relative">
                        <textarea
                          placeholder="e.g., What is half of 250 plus 30?"
                          value={aiQuestion}
                          onChange={(e) => setAiQuestion(e.target.value)}
                          rows={3}
                          disabled={isLoading}
                          className={`w-full font-medium rounded-2xl p-4 pr-10 text-xs text-slate-800 outline-none transition-all placeholder-slate-400 border shadow-inner ${
                            isDark 
                              ? "bg-slate-50 border-slate-100 focus:border-indigo-500" 
                              : "bg-slate-100 border-slate-200 focus:border-indigo-600 focus:bg-white"
                          }`}
                          id="ai-text-textarea"
                        />
                        {aiQuestion && !isLoading && (
                          <button
                            type="button"
                            onClick={() => setAiQuestion("")}
                            className="absolute right-3.5 top-3.5 text-xs text-slate-400 hover:text-slate-600 font-bold bg-slate-250 p-1 rounded-full cursor-pointer"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={isLoading || !aiQuestion.trim()}
                          className={`flex-1 py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer ${
                            isLoading || !aiQuestion.trim()
                              ? "bg-slate-400 text-white opacity-40 cursor-not-allowed shadow-none"
                              : "bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow-indigo-600/10 hover:from-indigo-700 hover:to-blue-600"
                          }`}
                          id="submit-ai-solve-btn"
                        >
                          {isLoading ? (
                            <>
                              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span>{retryAttempt > 0 ? `Retrying... (${retryAttempt}/3)` : "Tutor is Thinking..."}</span>
                            </>
                          ) : (
                            <>
                              <span>Ask AI Explain Engine</span>
                              <Sparkles className="w-4.5 h-4.5 text-amber-300" />
                            </>
                          )}
                        </button>
                      </div>
                    </form>

                    {errorMsg && (
                      <div className={`mt-4 border rounded-2xl p-4.5 flex flex-col gap-3.5 ${
                        isDark 
                          ? "bg-rose-950/20 border-rose-900/40 text-rose-300" 
                          : "bg-rose-50 border-rose-100 text-rose-850"
                      }`} id="ai-error-notice">
                        <div className="flex items-start gap-2.5">
                          <div className="space-y-1 text-left">
                            <p className="text-xs font-semibold leading-relaxed whitespace-pre-line">
                              {errorMsg}
                            </p>
                          </div>
                        </div>

                        <div className={`p-3 rounded-xl text-[10px] font-semibold leading-relaxed border ${
                          isDark ? 'bg-rose-950/10 border-rose-900/20 text-slate-400' : 'bg-rose-100/30 border-rose-100/40 text-rose-700'
                        }`}>
                          💡 Suggestion: Please request the explanation again after a short delay. Your math question has been preserved above so you can click below to retry.
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAiExplain()}
                          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-bold uppercase transition-all bg-rose-500 hover:bg-rose-600 text-white cursor-pointer shadow-sm hover:scale-[1.01] active:scale-[0.98]"
                          id="ai-error-retry-btn"
                        >
                          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                          <span>Retry Solver Automatically</span>
                        </button>
                      </div>
                    )}

                    {/* Quick presets helper */}
                    <div className="mt-5 pt-4 border-t border-slate-700/10">
                      <div className="text-[10px] uppercase font-mono font-bold tracking-widest text-slate-400 mb-2.5">
                        Suggested Concept Prompts:
                      </div>
                      <div className="flex flex-col gap-2">
                        {[
                          "What is half of 250 plus 30?",
                          "Explain the square root of 144.",
                          "What is 25 percent of 80?"
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            onClick={() => loadPreset(preset)}
                            disabled={isLoading}
                            className={`text-left text-xs font-bold py-2.5 px-3.5 rounded-xl border transition-all cursor-pointer truncate ${
                              isDark 
                                ? "bg-[#1a2d4b]/40 border-slate-800 text-indigo-300 hover:bg-[#1a2d4b]/80 hover:text-white" 
                                : "bg-slate-50 border-slate-150 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100"
                            }`}
                            id={`suggested-preset-${idx}`}
                          >
                            &bull; {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right side column: Tutor response visualizers */}
                <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-6">
                  
                  {/* COMPUTATIONAL REAL-TIME TUTOR EXPLANATIONS CARD */}
                  <div className={`border rounded-3xl p-6 transition-all duration-300 relative flex-1 flex flex-col ${
                    isDark 
                      ? "bg-[#111e35] border-slate-700/60 shadow-xl" 
                      : "bg-white border-slate-200 shadow shadow-slate-100"
                  }`} id="reasoner-results-box">
                    
                    <div className="flex items-center justify-between pb-4 border-b border-slate-700/10 mb-4 text-left">
                      <div>
                        <h3 className="font-extrabold text-base tracking-tight">Logical Analysis</h3>
                        <p className={`text-[10px] uppercase font-mono mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Step sequences decoded securely from the model
                        </p>
                      </div>

                      {aiResult ? (
                        <div className="flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/20 px-2.5 py-1 rounded-lg text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Solved</span>
                        </div>
                      ) : isLoading ? (
                        <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/20 px-2.5 py-1 rounded-lg text-amber-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                          <span>Computing</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-slate-500/10 px-2.5 py-1 rounded-lg text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                          <span>Awaiting</span>
                        </div>
                      )}
                    </div>

                    {/* MAIN EXPLANATION GRAPHIC SCREEN */}
                    {!aiResult && !isLoading ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/5 rounded-2xl border border-dashed border-slate-700/25 min-h-[220px]">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3.5">
                          <SparklyIcon />
                        </div>
                        <h4 className="font-bold text-xs">Analysis monitor is vacant</h4>
                        <p className={`text-xs mt-1.5 max-w-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          No query processed yet. Input a formula into the natural language solver or click one of our conceptual presets.
                        </p>
                      </div>
                    ) : isLoading && !aiResult ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 min-h-[220px]">
                        <div className="relative w-14 h-14 mb-4">
                          <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                          <div className="absolute inset-2 bg-indigo-500/5 rounded-full flex items-center justify-center text-indigo-400">
                            <Sparkle className="w-4 h-4 animate-ping" />
                          </div>
                        </div>
                        <h4 className="font-bold text-sm tracking-tight text-indigo-400">
                          {retryAttempt > 0 ? (
                            `Retrying... (${retryAttempt}/3)`
                          ) : (
                            <>
                              {activeStep === 1 && "Analyzing input question..."}
                              {activeStep === 2 && "Decomposing calculation..."}
                              {activeStep === 3 && "Connecting to AI Tutor..."}
                              {activeStep === 4 && "Generating solution steps..."}
                              {activeStep === 5 && "Formatting results..."}
                            </>
                          )}
                        </h4>
                        <p className="text-[10px] text-slate-400 uppercase mt-1">
                          {retryAttempt > 0 ? "Transient busy state. Retrying automatically..." : "Evaluating logic securely..."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-5 flex-1" id="ai-results-dashboard">
                        
                        {/* THE MASTER VALUE PANEL */}
                        <div className={`p-5 rounded-2xl border shadow-inner relative group ${
                          isDark 
                            ? "bg-[#0b1424] border-slate-800" 
                            : "bg-slate-50 border-slate-100"
                        }`} id="master-ai-value-card">
                          
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#5d8bc5]">
                              Evaluated Resolution Outcome
                            </span>
                            <button
                              onClick={() => copyToClipboard(aiResult, "ai_outcome")}
                              className="text-slate-400 hover:text-indigo-400 transition-colors p-1"
                              title="Copy outcome to clipboard"
                            >
                              {copiedId === "ai_outcome" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 h-3.5" />}
                            </button>
                          </div>
                          
                          <div className={`text-2xl md:text-3xl font-black mt-1.5 font-mono break-all tracking-tight ${
                            isDark ? 'text-white' : 'text-slate-800'
                          }`}>
                            {aiResult}
                          </div>
                        </div>

                        {/* SEQUENCED LOGIC BULLETS */}
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 ml-0.5 flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>Algorithmic Sequence Steps</span>
                          </div>

                          <div className="space-y-2.5">
                            {aiSteps.map((step, index) => (
                              <div 
                                key={index}
                                className={`flex items-start gap-3.5 p-3 rounded-2xl border transition-all ${
                                  isDark 
                                    ? "bg-[#162744]/70 border-slate-800/80 hover:bg-[#162744]" 
                                    : "bg-slate-50 border-slate-150 hover:bg-slate-100/30"
                                }`}
                                id={`step-bullet-${index}`}
                              >
                                <div className="w-5 h-5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                                  {index + 1}
                                </div>
                                <p className={`text-xs font-semibold leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                  {step}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* DETAILED TUTOR CONTEXT NOTES */}
                        <div className={`p-5 rounded-2xl border ${
                          isDark 
                            ? "bg-emerald-950/15 border-emerald-800/30 text-emerald-300" 
                            : "bg-emerald-50/60 border-emerald-100 text-emerald-900"
                        }`} id="tutor-essay-card">
                          <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-2">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                            Tutor Methodology Notes
                          </h4>
                          <div>
                            {renderExplanation(aiExplanation, isDark)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: CLASSIC CALCULATOR */}
          {activeTab === "calculator" && (
            <motion.div
              key="calculator-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="max-w-2xl mx-auto w-full"
              id="view-calculator"
            >
              <div className={`border rounded-3xl p-6 transition-all duration-300 shadow-2xl relative overflow-hidden ${
                isDark 
                  ? "bg-[#111e35] border-slate-700/60" 
                  : "bg-white border-slate-200"
              }`} id="premium-calculator-board">
                
                {/* Decorative layout outline decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-500"></div>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-extrabold text-sm uppercase tracking-wider">Classical Precision</h3>
                  </div>
                  <span className="text-[10px] bg-slate-500/10 text-slate-400 font-bold uppercase tracking-widest px-2 py-0.5 rounded-full font-mono">
                    Standard Math
                  </span>
                </div>

                {/* CALCULATOR MAIN GLASS SCREEN */}
                <div className={`rounded-2xl p-5 mb-5 text-right flex flex-col justify-between select-all border shadow-inner ${
                  isDark 
                    ? "bg-[#0b1424] border-slate-800" 
                    : "bg-slate-50 border-slate-150"
                }`} id="premium-calc-screen">
                  
                  {/* Expression typing stream */}
                  <div className="text-slate-400 text-xs font-mono font-bold tracking-wide break-all h-6">
                    {expression || "0"}
                  </div>
                  
                  {/* Evaluation Result */}
                  <div className={`text-3xl md:text-4xl font-black font-mono break-all ${
                    isDark ? 'text-white' : 'text-slate-800'
                  }`}>
                    {calcResult ? `= ${calcResult}` : " "}
                  </div>
                </div>

                {/* ADVANCED SCIENTIFIC KEY BAR */}
                <div className="mb-5 p-4 rounded-2xl bg-slate-500/5 border border-slate-500/10" id="advanced-calc-scientific-controls">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Advanced Functions</span>
                    <button
                      onClick={() => setDegMode(!degMode)}
                      className={`px-3 py-1 rounded-lg font-extrabold text-[10px] transition-all tracking-wider cursor-pointer ${
                        degMode 
                          ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-sm" 
                          : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                      }`}
                      title="Toggle between Degrees and Radians for trigonometry calculations"
                    >
                      MODE: {degMode ? "DEG º" : "RAD ᶜ"}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[
                      { label: "sin", func: "sin(" },
                      { label: "cos", func: "cos(" },
                      { label: "tan", func: "tan(" },
                      { label: "log", func: "log(" },
                      { label: "ln", func: "ln(" },
                      { label: "xʸ", func: "^" },
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        onClick={() => handleCalcClick(btn.func)}
                        className={`h-11 rounded-xl font-black text-xs transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                          isDark 
                            ? "bg-slate-800 text-indigo-300 border border-slate-700/50 hover:bg-slate-750" 
                            : "bg-slate-100 text-indigo-700 border border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* INTERACTIVE COMPREHENSIVE KEYBOARD */}
                <div className="grid grid-cols-4 gap-3" id="premium-calc-keys-grid">
                  {/* Row 1 */}
                  <button
                    onClick={handleClear}
                    className="h-14 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-black text-sm uppercase tracking-wide transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
                    id="premium-key-c"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => handleCalcClick("√")}
                    className={`h-14 rounded-2xl font-black text-sm transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer ${
                      isDark ? 'bg-slate-800 text-indigo-400 hover:bg-slate-750' : 'bg-slate-100 text-indigo-700 hover:bg-slate-200'
                    }`}
                    id="premium-key-sqrt"
                    title="Square Root"
                  >
                    √
                  </button>
                  <button
                    onClick={() => handleCalcClick("%")}
                    className={`h-14 rounded-2xl font-black text-sm transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer ${
                      isDark ? 'bg-slate-800 text-indigo-400 hover:bg-slate-750' : 'bg-slate-100 text-indigo-700 hover:bg-slate-200'
                    }`}
                    id="premium-key-percent"
                    title="Modulo / Percentage"
                  >
                    %
                  </button>
                  <button
                    onClick={() => handleCalcClick(" ÷ ")}
                    className="h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer flex items-center justify-center"
                    id="premium-key-divide"
                  >
                    ÷
                  </button>

                  {/* Row 2 */}
                  {"789".split("").map((num) => (
                    <button
                      key={num}
                      onClick={() => handleCalcClick(num)}
                      className={`h-14 rounded-2xl font-extrabold text-base transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer ${
                        isDark 
                          ? "bg-slate-800/40 text-slate-200 border border-slate-705/10 hover:bg-slate-750/70" 
                          : "bg-white border border-slate-150 text-slate-700 hover:bg-slate-50"
                      }`}
                      id={`premium-key-${num}`}
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={() => handleCalcClick(" × ")}
                    className="h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer flex items-center justify-center"
                    id="premium-key-multiply"
                  >
                    ×
                  </button>

                  {/* Row 3 */}
                  {"456".split("").map((num) => (
                    <button
                      key={num}
                      onClick={() => handleCalcClick(num)}
                      className={`h-14 rounded-2xl font-extrabold text-base transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer ${
                        isDark 
                          ? "bg-slate-800/40 text-slate-200 border border-slate-705/10 hover:bg-slate-750/70" 
                          : "bg-white border border-slate-150 text-slate-700 hover:bg-slate-50"
                      }`}
                      id={`premium-key-${num}`}
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={() => handleCalcClick(" - ")}
                    className="h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer flex items-center justify-center"
                    id="premium-key-subtract"
                  >
                    -
                  </button>

                  {/* Row 4 */}
                  {"123".split("").map((num) => (
                    <button
                      key={num}
                      onClick={() => handleCalcClick(num)}
                      className={`h-14 rounded-2xl font-extrabold text-base transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer ${
                        isDark 
                          ? "bg-slate-800/40 text-slate-200 border border-slate-705/10 hover:bg-slate-750/70" 
                          : "bg-white border border-slate-150 text-slate-700 hover:bg-slate-50"
                      }`}
                      id={`premium-key-${num}`}
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={() => handleCalcClick(" + ")}
                    className="h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer flex items-center justify-center"
                    id="premium-key-add"
                  >
                    +
                  </button>

                  {/* Row 5 */}
                  <button
                    onClick={() => handleCalcClick("0")}
                    className={`h-14 rounded-2xl font-extrabold text-base transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer col-span-2 text-left px-5 ${
                      isDark 
                        ? "bg-slate-800/40 text-slate-200 border border-slate-705/10 hover:bg-slate-750/70" 
                        : "bg-white border border-slate-150 text-slate-700 hover:bg-slate-50"
                    }`}
                    id="premium-key-0"
                  >
                    0
                  </button>
                  <button
                    onClick={() => handleCalcClick(".")}
                    className={`h-14 rounded-2xl font-extrabold text-base transition-all shadow-sm hover:scale-[1.01] active:scale-[0.98] cursor-pointer ${
                      isDark 
                        ? "bg-slate-800/40 text-slate-200 border border-slate-705/10 hover:bg-slate-750/70" 
                        : "bg-white border border-slate-150 text-slate-700 hover:bg-slate-50"
                    }`}
                    id="premium-key-dot"
                  >
                    .
                  </button>
                  <button
                    onClick={evaluateExpressionLocal}
                    className="h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-lg hover:from-amber-600 hover:to-orange-600 shadow-md shadow-orange-500/10 transition-all hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
                    id="premium-key-equals"
                  >
                    =
                  </button>
                </div>

                {/* BRIDGE FEATURE: PROMOTE CALCULATOR EXPRESSION TO AI */}
                {calcResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-6 p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-left ${
                      isDark ? 'bg-indigo-950/40 border-indigo-900/40' : 'bg-indigo-50/50 border-indigo-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                      <div>
                        <h4 className="font-bold text-xs">Unlock theoretical details</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">
                          Want to know how the logic models formulate this solution? Click to consult the AI expert tutor.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => promoteToAiTutor(expression, calcResult)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-4 rounded-xl cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
                    >
                      Explain mathematically with AI →
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 3: CALCULATION MEMORY tape */}
          {activeTab === "history" && (
            <motion.div
              key="history-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="max-w-2xl mx-auto w-full"
              id="view-history"
            >
              <div className={`border rounded-3xl p-6 transition-all duration-300 shadow-xl flex flex-col ${
                isDark 
                  ? "bg-[#111e35] border-slate-700/60" 
                  : "bg-white border-slate-200"
              }`} id="premium-history-deck">
                
                <div className="flex items-center justify-between pb-4 border-b border-slate-700/10 mb-5">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-extrabold text-sm uppercase tracking-wider">Session Tape Memory</h3>
                  </div>

                  {historyList.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
                      id="clear-all-history-btn"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear History
                    </button>
                  )}
                </div>

                <div className="space-y-3.5" id="history-deck-list">
                  {historyList.length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-slate-700/25">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 rounded-2xl flex items-center justify-center mb-3">
                        <History className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-xs">No records available</h4>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-[280px] leading-relaxed">
                        Evaluations formulated in standard or AI tutor cards will list down here for session reference.
                      </p>
                    </div>
                  ) : (
                    historyList.map((item) => (
                      <div
                        key={item.id}
                        className={`p-4 rounded-2xl border transition-all relative group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                          isDark 
                            ? "bg-[#162744]/70 border-slate-800 hover:bg-[#162744] hover:border-slate-700" 
                            : "bg-slate-50 border-slate-150 hover:bg-slate-100/30"
                        }`}
                        id={`history-row-${item.id}`}
                      >
                        <div className="space-y-1 flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-wide font-mono ${
                              item.type === "standard" 
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/15" 
                                : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/15"
                            }`}>
                              {item.type === "standard" ? "Classic" : "🧠 AI Resolved"}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(item.timestamp).toLocaleTimeString()}
                            </span>
                          </div>

                          <div className={`text-xs font-bold leading-normal pt-1 ${
                            isDark ? 'text-slate-300' : 'text-slate-600'
                          }`}>
                            {item.input}
                          </div>
                          
                          <div className={`text-base font-extrabold flex items-center gap-1 font-mono tracking-tight ${
                            isDark ? 'text-white' : 'text-slate-900'
                          }`}>
                            <span className="text-slate-400 font-medium mr-0.5">=</span>
                            <span>{item.result}</span>
                          </div>
                        </div>

                        {/* Action controllers */}
                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                          <button
                            onClick={() => copyToClipboard(item.result, item.id)}
                            className={`p-2 rounded-xl transition-all border text-slate-400 hover:text-slate-150 cursor-pointer ${
                              isDark ? 'bg-slate-805/40 border-slate-800 hover:bg-slate-800' : 'bg-white border-slate-205 hover:bg-slate-100'
                            }`}
                            title="Copy result to clipboard"
                          >
                            {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>

                          <button
                            onClick={() => loadHistoryItem(item)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1"
                          >
                            <span>Load</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* FOOTER SECTION */}
      <footer className={`px-6 py-6 border-t font-sans transition-all duration-300 text-center text-xs tracking-wider ${
        isDark 
          ? "bg-[#0b1424] border-slate-800 text-slate-500" 
          : "bg-white border-slate-200 text-slate-400"
      }`} id="saas-footer">
        <div>
          &copy; 2026 SOLVIORA • THE SMART TUTOR
        </div>
      </footer>
    </div>
  );
}

// Sparkle animated custom vector icon
function SparklyIcon() {
  return (
    <svg className="w-6 h-6 text-indigo-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/>
      <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5z"/>
      <path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>
    </svg>
  );
}
