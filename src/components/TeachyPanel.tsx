import React, { useState } from "react";
import { BookOpen, Code2, Code, Lightbulb, Server, Monitor, FileCode, CheckCircle } from "lucide-react";

interface CodeExplainer {
  fileName: string;
  role: "Backend" | "Frontend" | "Configuration" | "HTML Shell";
  roleIcon: any;
  analogy: string;
  summary: string;
  lines: { code: string; explanation: string }[];
  proTip: string;
}

interface TeachyPanelProps {
  isDark: boolean;
}

export default function TeachyPanel({ isDark }: TeachyPanelProps) {
  const [activeTab, setActiveTab] = useState<number>(0);

  const explanations: CodeExplainer[] = [
    {
      fileName: "server.ts",
      role: "Backend",
      roleIcon: Server,
      analogy: "The kitchen restaurant chef. The frontend is the waiter (receiving orders), but the backend handles the heat, holds the secret spices (API keys), and creates the actual food.",
      summary: "This file is our remote backend server built using Express.ts. It handles standard browser networking, intercepts requests securely, and contacts the Google Gemini AI safely without leaking your confidential API key.",
      proTip: "Never expose API keys directly in the browser! It's called client-side exposure. Always route queries through a custom backend proxy like this one to keep keys confidential.",
      lines: [
        { code: "import express from 'express';", explanation: "Imports the Express library, a super lightweight framework for building web servers in Node.js." },
        { code: "const app = express();", explanation: "Creates a live server instance. 'app' is the central configuration object where we build our routes." },
        { code: "dotenv.config();", explanation: "Reads developer-configured variables from the hidden '.env' file and attaches them to process.env." },
        { code: "let aiClient: GoogleGenAI | null = null;", explanation: "Defines a container for our AI connection that defaults to empty. This prevents premature connection errors." },
        { code: "function getGeminiClient() { ... }", explanation: "Our lazy initialization helper! It compiles and unlocks the GoogleGenAI connection only when someone clicks the button, saving memory." },
        { code: "app.post('/api/explain', async (req, res) => { ... })", explanation: "An HTTP 'POST' route. It listens for client packets coming to /api/explain, captures the payload, and executes the math logic." },
        { code: "const response = await ai.models.generateContent({ model: 'gemini-3.5-flash', ... })", explanation: "Initiates the official SDK network connection, querying the lightning-fast Gemini 3.5 Flash model with custom parameters." },
        { code: "responseMimeType: 'application/json'", explanation: "Instructs Gemini that it is forbidden from outputting conversational chatter. It must reply exclusively with parsed, pure JSON." },
        { code: "const textOutput = response.text;", explanation: "Accesses the string contents returned by Gemini using the official SDK .text property safely." },
        { code: "app.use(vite.middlewares);", explanation: "If we are developing, this redirects any unhandled asset requests straight back to Vite, so we don't have to restart the server on edits!" },
        { code: "app.listen(3000, '0.0.0.0', ...)", explanation: "Binds the port 3000 and starts the backend service, listening for incoming laptop and server traffic." }
      ]
    },
    {
      fileName: "src/App.tsx",
      role: "Frontend",
      roleIcon: Monitor,
      analogy: "The dashboard of a modern spaceship. It doesn't build the hyper-engine, but it provides beautiful levers, dials, and interactive states to command it.",
      summary: "This is our primary React client file. It renders the modern bento grid, maintains calculation states in memory, processes standard math clicks instantly, and updates step-by-step illustrations.",
      proTip: "Keep your components modular! Notice how typescript-driven props and decoupled visual elements make code incredibly readable and maintainable.",
      lines: [
        { code: "export default function App() { ... }", explanation: "Declares and exports the master React visual component that will render our entire single-page view." },
        { code: "const [expression, setExpression] = useState('');", explanation: "State variables! Allows React to instantly remember what numbers have been clicked on the classic calculator." },
        { code: "const [activeStep, setActiveStep] = useState(0);", explanation: "Controls which phase of the beautiful visual pipeline diagram glows in active/completed colors." },
        { code: "const handleStandardCalc = (op: string) => { ... }", explanation: "A physical driver function. Handles classic button clicks instantly on the client without contacting any servers." },
        { code: "const handleAiExplain = async () => { ... }", explanation: "The central fetch pipeline! Dispatches an async 'POST' command payload to the backend server and waits for the AI response." },
        { code: "setActiveStep(2); ... setActiveStep(3);", explanation: "Updates our live visual diagnostics step-by-step. Let's the user see precisely how their request progresses." },
        { code: "<Diagram activeStep={activeStep} />", explanation: "Integrates and feeds state variables directly into our visual flowchart, rendering state changes in real-time." }
      ]
    },
    {
      fileName: "src/types.ts",
      role: "Configuration",
      roleIcon: FileCode,
      analogy: "A legal contract between business partners. It ensures both sides speak the exact same language and agree on names and definitions.",
      summary: "This file contains TypeScript interfaces. They define the shape of standard/AI calculations, diagnostics steps, and Server responses.",
      proTip: "By declaring schemas in a central 'types.ts', you construct a common contract. Both the files editing state and the UI rendering state consume this standard safely.",
      lines: [
        { code: "export interface CalculationItem { ... }", explanation: "Outlines a blueprint for calculation records. Dictates that every calculation must contain an ID, type, input, result, and timestamp." },
        { code: "export type StepStatus = 'pending' | 'active' | 'completed' | 'failed';", explanation: "Defines a union of literal strings representing valid progress values, guarding against accidental typos." },
        { code: "export interface ApiResponse { ... }", explanation: "Ensures that the server's API payload strictly outputs fields for 'success', 'result', 'explanation', and 'steps' before client consumption." }
      ]
    },
    {
      fileName: "vite.config.ts",
      role: "Configuration",
      roleIcon: Code2,
      analogy: "A hyper-efficient postal sorter. It parses, bundles, optimizes, and delivers your files directly to the browser at light speed.",
      summary: "This contains build and compilation properties for Vite, configuring React support, Tailwind plugins, development port binding, and HMR (Hot Module Replacement) file-watch constraints.",
      proTip: "Vite uses native ES Modules under the hood, making dev startup near-instant because it doesn't need to pre-bundle the entire code tree.",
      lines: [
        { code: "import tailwindcss from '@tailwindcss/vite';", explanation: "Enables Tailwind CSS compilation immediately as a Vite bundler plugin." },
        { code: "alias: { '@': path.resolve(__dirname, '.') }", explanation: "Defines path shortcuts, allowing cleanly organized imports starting with '@/' instead of deep nesting like '../../../'." },
        { code: "hmr: process.env.DISABLE_HMR !== 'true'", explanation: "Turns on/off HMR (Hot Module Replacement). We disable heavy watchers behind slow connections to conserve machine CPU power." }
      ]
    }
  ];

  return (
    <div className={`border rounded-3xl shadow-sm overflow-hidden transition-all duration-300 ${
      isDark ? "bg-[#111e35] border-slate-700/60" : "bg-white border-slate-200"
    }`} id="teachy-panel">
      {/* Header */}
      <div className={`border-b px-6 py-5 flex items-center gap-3 ${
        isDark ? "bg-[#0b1424] border-slate-700/60" : "bg-slate-50 border-slate-200"
      }`}>
        <div className={`p-2 rounded-xl ${isDark ? 'bg-indigo-950 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
          <BookOpen className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h3 className={`font-black text-base ${isDark ? 'text-white' : 'text-slate-800'}`}>Full-Stack Code Tutor Academy</h3>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Interactive step-by-step developer walkthrough for beginners</p>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex border-b overflow-x-auto scrollbar-none ${
        isDark ? "bg-[#0b1424]/60 border-slate-700/60" : "bg-slate-50/50 border-slate-200"
      }`}>
        {explanations.map((item, index) => {
          const RoleIcon = item.roleIcon;
          const isActive = activeTab === index;
          return (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? isDark 
                    ? "border-indigo-500 text-indigo-400 bg-[#111e35]" 
                    : "border-indigo-600 text-indigo-600 bg-white"
                  : isDark 
                    ? "border-transparent text-slate-400 hover:text-white hover:bg-[#1a2d4b]/40" 
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
              }`}
              id={`teachy-tab-${item.fileName.replace("/", "-")}`}
            >
              <RoleIcon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-500' : 'text-slate-500'}`} />
              <span className="font-mono">{item.fileName}</span>
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                item.role === 'Backend' ? 'bg-amber-100/15 text-amber-400 font-mono' :
                item.role === 'Frontend' ? 'bg-blue-100/15 text-blue-400 font-mono' : 'bg-slate-100/15 text-slate-400 font-mono'
              }`}>
                {item.role}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Body */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* File Meta and Analogy */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-4 lg:border-r pr-0 lg:pr-6 border-slate-700/20">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-1 rounded inline-block uppercase ${
                  isDark ? 'bg-indigo-950/60 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  ROLE: {explanations[activeTab].role}
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded inline-block ${
                  isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                }`}>
                  {explanations[activeTab].fileName}
                </span>
              </div>
              <p className={`text-xs font-semibold leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {explanations[activeTab].summary}
              </p>
            </div>

            {/* Analogy Box */}
            <div className={`border rounded-2xl p-4 ${
              isDark ? "bg-amber-950/20 border-amber-800/25" : "bg-amber-50/50 border-amber-200/50"
            }`}>
              <div className={`flex items-center gap-2 font-bold text-[10px] uppercase mb-1.5 ${
                isDark ? "text-amber-400" : "text-amber-800"
              }`}>
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Beginner Analogy</span>
              </div>
              <p className={`text-[11px] leading-relaxed font-serif italic ${
                isDark ? "text-amber-300/95" : "text-amber-950"
              }`}>
                "{explanations[activeTab].analogy}"
              </p>
            </div>

            {/* Pro Tip Box */}
            <div className={`border rounded-2xl p-4 ${
              isDark ? "bg-emerald-950/20 border-emerald-800/25" : "bg-emerald-50 border-emerald-100"
            }`}>
              <div className={`flex items-center gap-2 font-bold text-[10px] uppercase mb-1.5 ${
                isDark ? "text-emerald-400" : "text-emerald-800"
              }`}>
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Developer Pro Tip</span>
              </div>
              <p className={`text-[11px] leading-relaxed ${
                isDark ? "text-emerald-300/90" : "text-emerald-900"
              }`}>
                {explanations[activeTab].proTip}
              </p>
            </div>
          </div>

          {/* Line-by-Line Breakdown */}
          <div className="lg:col-span-8 flex flex-col justify-start">
            <div className={`flex items-center gap-2 font-bold text-xs mb-3 uppercase tracking-wider ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}>
              <Code className="w-4 h-4 text-indigo-500" />
              <span>Line-by-Line Code Breakdown:</span>
            </div>

            <div className={`space-y-2.5 max-h-[380px] overflow-y-auto pr-1.5 custom-scrollbar border rounded-2xl p-4 ${
              isDark ? 'bg-[#0b1424]/40 border-slate-700/60' : 'bg-slate-50/50 border-slate-100'
            }`}>
              {explanations[activeTab].lines.map((line, idx) => (
                <div key={idx} className={`border rounded-xl p-3 hover:shadow-sm transition-all duration-200 ${
                  isDark ? 'bg-[#15233c]/80 border-slate-700/40 hover:border-slate-600/60' : 'bg-white border-slate-150 hover:border-slate-200'
                }`} id={`code-breakdown-line-${idx}`}>
                  <div className={`font-mono text-[11px] font-bold px-2 py-1.5 rounded-lg overflow-x-auto whitespace-pre ${
                    isDark ? 'bg-indigo-950/80 text-indigo-300' : 'bg-indigo-50/60 text-indigo-700'
                  }`}>
                    {line.code}
                  </div>
                  <div className={`mt-2 text-[11px] leading-relaxed pl-1 flex items-start gap-1.5 ${
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  }`}>
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0 mt-1.5"></span>
                    <span>{line.explanation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
