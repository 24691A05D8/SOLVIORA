import React, { ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RotateCcw, Copy, Check, Terminal } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });
    console.error("[Uncaught Exception Bound] Fatal React Error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false
    });
    window.location.reload();
  };

  private handleCopyDetails = () => {
    const textToCopy = `Error: ${this.state.error?.message}\n\nStack Trace:\n${this.state.error?.stack || ""}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ""}`;
    navigator.clipboard.writeText(textToCopy);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-6 text-center bg-slate-900 border border-slate-800 rounded-3xl max-w-lg mx-auto my-8 shadow-2xl relative overflow-hidden">
          {/* Accent decoration */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-red-500 via-rose-500 to-amber-500"></div>
          
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/20 to-rose-500/20 flex items-center justify-center border border-red-500/30 mb-5 animate-pulse">
            <AlertOctagon className="w-8 h-8 text-rose-400" />
          </div>

          <h3 className="font-extrabold text-lg text-slate-100 mb-2">
            {this.fallbackTitle || "Something went wrong"}
          </h3>
          
          <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
            {this.fallbackMessage || "An unexpected rendering exception occurred. Solviora managed the crash safely and kept the remainder of the application functional."}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-sm mb-6">
            <button
              id="error-reset-btn"
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 font-bold text-xs text-white rounded-xl transition duration-200 shadow-md active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reload Application
            </button>
            
            <button
              id="error-copy-btn"
              onClick={this.handleCopyDetails}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition duration-200 active:scale-95 border border-slate-700"
            >
              {this.state.copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copied Details
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Diagnostics
                </>
              )}
            </button>
          </div>

          <div className="w-full text-left bg-black/40 rounded-2xl border border-slate-800 p-4 max-h-[160px] overflow-y-auto font-mono text-[10px] text-slate-400 select-all scrollbar-thin">
            <div className="flex items-center gap-1 text-[11px] text-amber-500/90 font-bold uppercase tracking-wider mb-2">
              <Terminal className="w-3 h-3" />
              Technical Diagnostics Log
            </div>
            <p className="font-semibold text-rose-400/90">{String(this.state.error?.message || "Render exception of type object")}</p>
            <p className="mt-1 text-slate-500 leading-normal font-medium bg-transparent border-0 outline-0 p-0 text-wrap whitespace-normal break-all">
              {this.state.error?.stack || "No additional trace parsed."}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }

  private get fallbackTitle() {
    return this.props.fallbackTitle;
  }

  private get fallbackMessage() {
    return this.props.fallbackMessage;
  }
}
