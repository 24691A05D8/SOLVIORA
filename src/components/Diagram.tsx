import React from "react";
import { User, Monitor, Server, BrainCircuit, RefreshCw, ArrowRight } from "lucide-react";

/**
 * --- EDUCATIONAL LESSON FOR BEGINNERS: PIPELINE DIAGRAM ---
 * An elegant diagram reflecting high-fidelity data transmission patterns.
 * 
 * Flow representation:
 * User typing/clicking -> Client Browser request -> Backend routing -> Gemini completion -> Render callback
 */

interface DiagramProps {
  activeStep: number;
  isDark: boolean;
}

export default function Diagram({ activeStep, isDark }: DiagramProps) {
  const steps = [
    {
      id: 1,
      label: "User Interacts",
      icon: User,
      description: "User submits math prompt on client dashboard",
      color: "from-blue-500 to-indigo-500",
      activeText: "User Submitted input",
    },
    {
      id: 2,
      label: "Frontend Fetch",
      icon: Monitor,
      description: "React captures expression, schedules async request",
      color: "from-indigo-500 to-violet-500",
      activeText: "Dispatching client payload",
    },
    {
      id: 3,
      label: "Backend Proxy",
      icon: Server,
      description: "Express intercepts request, safeguards API credentials",
      color: "from-violet-500 to-fuchsia-500",
      activeText: "Exchanging secure tokens",
    },
    {
      id: 4,
      label: "Gemini Engine",
      icon: BrainCircuit,
      description: "Gemini 3.5 Flash evaluates steps and reasons solutions",
      color: "from-fuchsia-500 to-emerald-500",
      activeText: "Model thinking...",
    },
    {
      id: 5,
      label: "Display Render",
      icon: RefreshCw,
      description: "JSON response parsed back to local memory state",
      color: "from-emerald-500 to-teal-500",
      activeText: "Painting result cards",
    },
  ];

  return (
    <div className={`border rounded-3xl p-6 transition-all duration-300 relative overflow-hidden ${
      isDark 
        ? "bg-[#111e35] border-slate-700/60 text-white shadow-2xl" 
        : "bg-white border-slate-200 text-slate-800 shadow-md shadow-slate-100/40"
    }`} id="diagram-container">
      
      {/* Visual neon ambient layout elements */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-36 h-36 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex flex-col md:flex-row items-stretch justify-between gap-3 relative z-10" id="diagram-steps-wrapper">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCurrent = activeStep === step.id;
          const isPassed = activeStep > step.id;
          const isPending = activeStep < step.id;

          let cardStyle = "";
          let iconWrapperStyle = "";

          if (isCurrent) {
            cardStyle = `bg-gradient-to-br ${step.color} text-white border-white ring-4 ring-indigo-500/20 scale-102 font-semibold shadow-lg animate-pulse`;
            iconWrapperStyle = "bg-white/25 text-white";
          } else if (isPassed) {
            cardStyle = isDark 
              ? "bg-[#162744] border-emerald-500/40 text-emerald-400" 
              : "bg-emerald-50/50 border-emerald-200 text-emerald-700";
            iconWrapperStyle = isDark 
              ? "bg-emerald-950/40 text-emerald-400" 
              : "bg-emerald-100 text-emerald-700";
          } else {
            cardStyle = isDark 
              ? "bg-[#0b1424]/40 border-slate-800 text-slate-500" 
              : "bg-slate-50/60 border-slate-150 text-slate-500";
            iconWrapperStyle = isDark 
              ? "bg-slate-800/40 text-slate-500" 
              : "bg-slate-100 text-slate-550";
          }

          return (
            <React.Fragment key={step.id}>
              {/* Individual Flow Card */}
              <div 
                className={`flex-1 p-4 rounded-2xl border text-center transition-all duration-300 flex flex-col justify-between ${cardStyle}`}
                id={`diagram-step-${step.id}`}
              >
                <div>
                  <div className="flex justify-center mb-2">
                    <div className={`p-2 rounded-xl transition-colors ${iconWrapperStyle}`}>
                      <Icon className="w-5 h-5 shrink-0" />
                    </div>
                  </div>
                  
                  <div className={`text-[9px] font-black tracking-widest uppercase mb-1 ${
                    isCurrent ? 'text-white/80' : 'text-slate-400'
                  }`}>
                    Phase {step.id}
                  </div>
                  
                  <h4 className={`text-xs font-black tracking-tight ${
                    isCurrent ? 'text-white' : isPassed ? 'text-slate-800 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-400'
                  }`}>{step.label}</h4>
                  
                  <p className={`text-[10px] mt-1.5 leading-relaxed hidden xl:block ${
                    isCurrent ? 'text-white/80' : 'text-slate-400'
                  }`}>
                    {step.description}
                  </p>
                </div>

                <div className="mt-3">
                  {isCurrent && (
                    <span className="text-[9px] bg-white text-indigo-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-bounce inline-block">
                      {step.activeText}
                    </span>
                  )}
                  {isPassed && (
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-500 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide inline-block">
                      Success ✓
                    </span>
                  )}
                  {isPending && (
                    <span className="text-[9px] bg-slate-100 dark:bg-slate-800/50 text-slate-400 font-semibold px-2 py-0.5 rounded-full inline-block">
                      Standby
                    </span>
                  )}
                </div>
              </div>

              {/* Connecting Arrow */}
              {idx < steps.length - 1 && (
                <div className="hidden md:flex items-center justify-center text-slate-300 shrink-0 select-none">
                  <ArrowRight className={`w-4 h-4 transition-all duration-300 ${
                    isPassed ? 'text-emerald-500 rotate-0 animate-pulse' : 'text-slate-300 dark:text-slate-800'
                  }`} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Dynamic latency stats bar in footer */}
      <div className={`mt-5 pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${
        isDark ? 'border-slate-800 text-slate-400' : 'border-slate-150 text-slate-500'
      }`}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
          <span className="font-semibold uppercase font-mono tracking-wide text-[10px]">
            Data Pipeline: {activeStep === 0 ? "Awaiting Input Trigger" : activeStep === 5 ? "Routings evaluated" : "Asynchronous Execution Flowing"}
          </span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="font-mono text-[10px] bg-indigo-500/10 text-indigo-400 px-2.5 py-1 rounded-lg border border-indigo-500/25 uppercase font-bold tracking-wider">
            User → Frontend → Backend → response → Display
          </span>
        </div>
      </div>
    </div>
  );
}
