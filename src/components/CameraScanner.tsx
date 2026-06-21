import React, { useState, useRef, useEffect } from "react";
import { 
  Camera, 
  Upload, 
  Image as ImageIcon, 
  RotateCw, 
  Crop, 
  Check, 
  AlertCircle, 
  Sparkles, 
  History, 
  X, 
  FileText, 
  RefreshCw,
  Sliders,
  Maximize,
  ChevronRight,
  HelpCircle,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CameraScannerProps {
  isDark: boolean;
  onTextScanned: (extractedText: string, solveImmediately: boolean) => void;
  isLoadingSolver: boolean;
}

interface ScanHistoryItem {
  id: string;
  imagePreview: string;
  extractedText: string;
  confidence: "high" | "low";
  timestamp: number;
}

export default function CameraScanner({
  isDark,
  onTextScanned,
  isLoadingSolver
}: CameraScannerProps) {
  // Modal & Tab States
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"camera" | "upload" | "history">("camera");
  
  // Media / Stream States
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  
  // Image Loading / Crop States
  const [sourceImage, setSourceImage] = useState<string | null>(null); // Base64 of raw image
  const [croppedImage, setCroppedImage] = useState<string | null>(null); // Base64 of cropped section
  const [isCropping, setIsCropping] = useState(false);
  
  // Interactive Crop Frame Bounding Box (in percentage 0-100)
  const [cropBox, setCropBox] = useState({ x: 10, y: 15, w: 80, h: 70 });
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  
  // OCR states
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [extractedResult, setExtractedResult] = useState<string>("");
  const [ocrConfidence, setOcrConfidence] = useState<"high" | "low" | null>(null);
  const [ocrConfidenceReason, setOcrConfidenceReason] = useState<string>("");
  const [isQuestion, setIsQuestion] = useState(true);

  // Scan History State
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Scan History from LocalStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("solviora_scan_history");
      if (stored) {
        setScanHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to parse scan history:", e);
    }
  }, []);

  // Save Scan History
  const saveScanToHistory = (item: ScanHistoryItem) => {
    const updated = [item, ...scanHistory].slice(0, 15); // Keep last 15 items
    setScanHistory(updated);
    try {
      localStorage.setItem("solviora_scan_history", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save scan history:", e);
    }
  };

  // Clear Scan History
  const clearScanHistory = () => {
    setScanHistory([]);
    try {
      localStorage.removeItem("solviora_scan_history");
    } catch (e) {
      console.error("Failed to clear scan history:", e);
    }
  };

  // Start Camera Stream
  const startCamera = async () => {
    setCameraError(null);
    if (stream) {
      stopCamera();
    }
    try {
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error("Camera startup error:", err);
      setCameraError(
        "Could not access your camera. This could be due to permission restrictions or because your device does not have an active camera. Please use the Upload tab to import a file or photo instead."
      );
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // Manage camera state on tab changes or dialog opening
  useEffect(() => {
    if (isOpen && activeTab === "camera" && !sourceImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, activeTab, facingMode, sourceImage]);

  // Flip Camera
  const toggleFacingMode = () => {
    setFacingMode(prev => (prev === "environment" ? "user" : "environment"));
  };

  // Capture Photo
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Draw frame to canvas
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      setSourceImage(dataUrl);
      setCroppedImage(dataUrl); // Default cropped to full image first
      stopCamera();
      setIsCropping(true); // Direct to crop view for sizing
    }
  };

  // File Upload Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setOcrError("Please upload a valid image file (PNG, JPEG, WEBP)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setSourceImage(base64);
      setCroppedImage(base64);
      setIsCropping(true); // Let user adjust crop frame for the uploaded picture too
    };
    reader.onerror = () => {
      setOcrError("Failed to read the uploaded image file.");
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // --- CROP BOX MOUSE / TOUCH INTERACTIVITY ---
  const handleHandleMouseDown = (handle: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setActiveHandle(handle);
  };

  const handleInteractionMove = (clientX: number, clientY: number) => {
    if (!activeHandle || !cropContainerRef.current) return;
    const rect = cropContainerRef.current.getBoundingClientRect();
    
    // Normalized touch position inside the element (0 to 100)
    const posX = ((clientX - rect.left) / rect.width) * 100;
    const posY = ((clientY - rect.top) / rect.height) * 100;

    setCropBox(prev => {
      let { x, y, w, h } = prev;

      // Restraining bounds (0 to 100)
      const clampedX = Math.max(0, Math.min(100, posX));
      const clampedY = Math.max(0, Math.min(100, posY));

      switch (activeHandle) {
        case "tl":
          w = (x + w) - clampedX;
          h = (y + h) - clampedY;
          x = clampedX;
          break;
        case "tr":
          w = clampedX - x;
          h = (y + h) - clampedY;
          y = clampedY;
          break;
        case "bl":
          w = (x + w) - clampedX;
          h = clampedY - y;
          x = clampedX;
          break;
        case "br":
          w = clampedX - x;
          h = clampedY - y;
          break;
        case "center":
          // Optional center dragging can be implemented, but simple handles are cleaner
          break;
      }

      // Enforce minimum crop sizes of 10% representation
      if (w < 10) w = 10;
      if (h < 10) h = 10;
      // Enforce outer dimensions
      if (x + w > 100) w = 100 - x;
      if (y + h > 100) h = 100 - y;
      if (x < 0) x = 0;
      if (y < 0) y = 0;

      return { x, y, w, h };
    });
  };

  useEffect(() => {
    const handleMouseUp = () => setActiveHandle(null);
    
    const handleMouseMove = (e: MouseEvent) => {
      if (activeHandle) {
        handleInteractionMove(e.clientX, e.clientY);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (activeHandle && e.touches.length > 0) {
        handleInteractionMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchend", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchend", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [activeHandle]);

  // Execute Bounding-Crop onto Canvas
  const applyCrop = () => {
    if (!sourceImage) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      
      // Calculate pixel dimensions
      const cropXPercentage = cropBox.x / 100;
      const cropYPercentage = cropBox.y / 100;
      const cropWPercentage = cropBox.w / 100;
      const cropHPercentage = cropBox.h / 100;

      const pxX = img.width * cropXPercentage;
      const pxY = img.height * cropYPercentage;
      const pxW = img.width * cropWPercentage;
      const pxH = img.height * cropHPercentage;

      canvas.width = pxW;
      canvas.height = pxH;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, pxX, pxY, pxW, pxH, 0, 0, pxW, pxH);
        const base64cropped = canvas.toDataURL("image/png");
        setCroppedImage(base64cropped);
        setIsCropping(false); // Drop to OCR staging view
        triggerOcr(base64cropped);
      }
    };
    img.src = sourceImage;
  };

  // Reset Captured Image
  const resetCaptured = () => {
    setSourceImage(null);
    setCroppedImage(null);
    setIsCropping(false);
    setExtractedResult("");
    setOcrConfidence(null);
    setOcrError(null);
    if (activeTab === "camera") {
      startCamera();
    }
  };

  // --- TRIGGER BACKEND MULTIMODAL OCR ---
  const triggerOcr = async (imageB64: string) => {
    setIsOcrProcessing(true);
    setOcrError(null);
    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imageB64,
          mimeType: "image/png"
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "OCR request failed");
      }

      const data = await response.json();
      if (data.success) {
        setExtractedResult(data.extractedText || "");
        setOcrConfidence(data.confidence);
        setOcrConfidenceReason(data.confidenceReason || "");
        setIsQuestion(data.isQuestion !== false);

        // Store to scan history automatically
        saveScanToHistory({
          id: Date.now().toString(),
          imagePreview: imageB64,
          extractedText: data.extractedText || "",
          confidence: data.confidence || "high",
          timestamp: Date.now(),
        });
      } else {
        throw new Error(data.error || "Failed to extract readable text.");
      }
    } catch (err: any) {
      console.error("OCR API error: ", err);
      setOcrError(err.message || "We encountered an issue extracting the question. Please try manually uploading or retaking with better lighting.");
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // Send output back to Solviora Solver Input
  const handleLoadToSolver = (solveImmediately: boolean) => {
    if (!extractedResult.trim()) return;
    onTextScanned(extractedResult, solveImmediately);
    setIsOpen(false);
    // Cleanup States
    resetCaptured();
  };

  return (
    <div className="w-full">
      {/* TRIGGER BUTTON */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setActiveTab("camera");
        }}
        className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2.5 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border ${
          isDark 
            ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750 hover:text-white hover:border-indigo-500/50" 
            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-indigo-600/50 hover:shadow"
        }`}
        id="camera-scan-trigger-btn"
      >
        <Camera className="w-4.5 h-4.5 text-indigo-500 animate-pulse" />
        <span>Scan Question with Camera</span>
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
      </button>

      {/* MODAL FULLSCREEN VIEWPORT */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] md:max-h-[85vh] ${
                isDark ? "bg-[#0c1626] border border-slate-800 text-white" : "bg-white border border-slate-100 text-slate-800"
              }`}
              id="camera-scanner-modal"
            >
              {/* HEADER CONTAINER */}
              <div className={`p-5 flex items-center justify-between border-b ${
                isDark ? "border-slate-800 bg-[#0e1a2f]" : "border-slate-100 bg-slate-50"
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-500">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm uppercase tracking-wider">AI Question Scanner</h3>
                    <p className={`text-[10px] uppercase font-bold tracking-widest ${
                      isDark ? "text-slate-400" : "text-slate-500"
                    }`}>
                      Multimodal OCR Resolvers
                    </p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    stopCamera();
                  }}
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    isDark ? "border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white hover:bg-slate-800" : "border-slate-150 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                  id="scanner-close-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* TABS SELECTOR ONLY SHOWN IN INITIAL SETUP WITHOUT CAPTURED IMAGES */}
              {!sourceImage && (
                <div className={`p-4 flex border-b ${
                  isDark ? "border-slate-800/80 bg-slate-950/20" : "border-slate-100 bg-slate-50/40"
                }`}>
                  <div className="flex gap-2 w-full max-w-md">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("camera");
                        setCameraError(null);
                      }}
                      className={`flex-1 py-2 px-3.5 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        activeTab === "camera"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                          : isDark ? "text-slate-400 hover:bg-slate-800/60" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Live Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("upload")}
                      className={`flex-1 py-2 px-3.5 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        activeTab === "upload"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                          : isDark ? "text-slate-400 hover:bg-slate-800/60" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload File</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("history")}
                      className={`flex-1 py-2 px-3.5 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        activeTab === "history"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                          : isDark ? "text-slate-400 hover:bg-slate-800/60" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>History</span>
                    </button>
                  </div>
                </div>
              )}

              {/* MAIN BODY AREA */}
              <div className="flex-1 overflow-y-auto p-6" id="scanner-modal-body">
                
                {/* 1. CROPPING VIEW - REPLACES TABS ONCE CAPTURED/UPLOADED */}
                {sourceImage && isCropping && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Crop className="w-4 h-4 text-indigo-500 animate-pulse" />
                        <h4 className="font-bold text-xs uppercase tracking-widest text-slate-400">Crop to Your Question</h4>
                      </div>
                      <button
                        type="button"
                        onClick={resetCaptured}
                        className="text-[10px] uppercase font-bold tracking-widest text-rose-400 hover:text-rose-300 transition-all cursor-pointer"
                      >
                        Retake / Cancel
                      </button>
                    </div>

                    <p className={`text-[11px] leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      💡 <strong>Tip:</strong> Drag the corner handles to surround only the question text. Minimizing extra background noise ensures the highest AI extraction precision!
                    </p>

                    {/* INTERACTIVE CROPPER PANEL */}
                    <div 
                      ref={cropContainerRef}
                      className="relative border rounded-2xl max-h-[350px] overflow-hidden select-none flex items-center justify-center bg-slate-950 border-slate-800"
                    >
                      <img 
                        src={sourceImage} 
                        alt="To Crop" 
                        className="max-h-[350px] object-contain pointer-events-none"
                      />
                      
                      {/* Dark overlay covering the image */}
                      <div className="absolute inset-0 bg-slate-900/60 pointer-events-none"></div>

                      {/* Interactive Crop Box Overlay */}
                      <div 
                        className="absolute border-2 border-dashed border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)] cursor-move"
                        style={{
                          left: `${cropBox.x}%`,
                          top: `${cropBox.y}%`,
                          width: `${cropBox.w}%`,
                          height: `${cropBox.h}%`
                        }}
                      >
                        {/* Interactive Corner Handles */}
                        <div 
                          className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-indigo-500 rounded-full border border-white cursor-nwse-resize select-none"
                          onTouchStart={(e) => handleHandleMouseDown("tl", e)}
                          onMouseDown={(e) => handleHandleMouseDown("tl", e)}
                        ></div>
                        <div 
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-indigo-500 rounded-full border border-white cursor-nesw-resize select-none"
                          onTouchStart={(e) => handleHandleMouseDown("tr", e)}
                          onMouseDown={(e) => handleHandleMouseDown("tr", e)}
                        ></div>
                        <div 
                          className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-indigo-500 rounded-full border border-white cursor-nesw-resize select-none"
                          onTouchStart={(e) => handleHandleMouseDown("bl", e)}
                          onMouseDown={(e) => handleHandleMouseDown("bl", e)}
                        ></div>
                        <div 
                          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-indigo-500 rounded-full border border-white cursor-nwse-resize select-none"
                          onTouchStart={(e) => handleHandleMouseDown("br", e)}
                          onMouseDown={(e) => handleHandleMouseDown("br", e)}
                        ></div>

                        {/* High tech scanner target corners */}
                        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-indigo-300"></div>
                        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-indigo-300"></div>
                        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-indigo-300"></div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-indigo-300"></div>
                      </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                      <button
                        type="button"
                        onClick={resetCaptured}
                        className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer border ${
                          isDark ? "border-slate-800 text-slate-400 hover:text-white" : "border-slate-200 text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={applyCrop}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs uppercase flex items-center gap-2 hover:bg-indigo-700 cursor-pointer shadow"
                      >
                        <Crop className="w-4 h-4" />
                        <span>Extract Text Now</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. LIVE CAMERA FEWER VIEW */}
                {!sourceImage && activeTab === "camera" && (
                  <div className="space-y-4">
                    {cameraError ? (
                      <div className={`p-5 rounded-2xl border flex flex-col items-center text-center ${
                        isDark ? "bg-[#16121c] border-rose-950/40 text-rose-300" : "bg-rose-50 border-rose-100 text-rose-800"
                      }`}>
                        <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
                        <h4 className="font-extrabold text-xs uppercase tracking-wider mb-2">Camera Access Restricted</h4>
                        <p className="text-xs max-w-md leading-relaxed mb-4">{cameraError}</p>
                        <button
                          type="button"
                          onClick={() => setActiveTab("upload")}
                          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase flex items-center gap-2 cursor-pointer shadow"
                        >
                          <Upload className="w-4 h-4" />
                          <span>Switch to File Upload</span>
                        </button>
                      </div>
                    ) : (
                      <div className="relative rounded-2xl overflow-hidden border border-slate-800 max-h-[350px] bg-black flex items-center justify-center">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          className="w-full max-h-[350px] object-cover"
                        />
                        
                        {/* HIGH TECH CAMERA CAPTURE BOX RETICLE */}
                        <div className="absolute inset-0 border border-indigo-500/20 pointer-events-none flex items-center justify-center">
                          <div className="w-[80%] h-[70%] border-2 border-dashed border-indigo-500/30 rounded-xl relative">
                            {/* Scanning horizontal line effect */}
                            <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_10px_#6366f1] top-[20%] animate-[bounce_5s_infinite]"></div>
                          </div>
                        </div>

                        {/* FLOATING ACTION PANELS */}
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4 z-10">
                          <button
                            type="button"
                            onClick={toggleFacingMode}
                            className="p-3 rounded-full bg-slate-900/85 backdrop-blur border border-slate-700 hover:bg-slate-800 text-white cursor-pointer transition-all shadow-md"
                            title="Flip Camera orientation"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>
                          
                          <button
                            type="button"
                            onClick={capturePhoto}
                            className="px-6 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase flex items-center gap-2 cursor-pointer transition-all shadow-lg scale-105 active:scale-95 border border-indigo-400"
                          >
                            <Camera className="w-4.5 h-4.5" />
                            <span>Capture Frame</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. GALARY/FILE UPLOAD VIEW */}
                {!sourceImage && activeTab === "upload" && (
                  <div className="space-y-4">
                    <div
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[250px] select-none ${
                        isDark 
                          ? "border-slate-800 bg-[#07101d] hover:border-indigo-500/50 hover:bg-indigo-500/[0.02]" 
                          : "border-slate-200 bg-slate-50 hover:border-indigo-600/50 hover:bg-indigo-600/[0.01]"
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                      />
                      <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-500 mb-4 animate-bounce">
                        <Upload className="w-7 h-7" />
                      </div>
                      <h4 className="font-extrabold text-sm uppercase tracking-wider mb-2">Drag & Drop Question Image</h4>
                      <p className={`text-xs max-w-xs mb-4 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Or click to browse storage files. Supports handwriting photos, textbook prints, screenshot crops, etc.
                      </p>
                      
                      <div className="text-[10px] font-mono text-indigo-400/80 tracking-widest uppercase py-1 px-3 rounded-full border border-indigo-500/20 bg-indigo-500/5">
                        PNG • JPEG • WEBP
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. HISTORIC SCANS TAB VIEW */}
                {!sourceImage && activeTab === "history" && (
                  <div className="space-y-4">
                    {scanHistory.length === 0 ? (
                      <div className="text-center py-12">
                        <Clock className="w-10 h-10 text-slate-500 mx-auto mb-3 animate-pulse" />
                        <h4 className="font-bold text-xs uppercase tracking-widest text-slate-400">Scan History Empty</h4>
                        <p className={`text-xs mt-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          Your captured questions will be archived here for snappy recall.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        <div className="flex justify-between items-center pl-1">
                          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Showing last {scanHistory.length} scans</span>
                          <button
                            type="button"
                            onClick={clearScanHistory}
                            className="text-[10px] uppercase font-bold tracking-widest text-rose-400 hover:text-rose-300 transition-all cursor-pointer"
                          >
                            Flush Recents
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3.5 max-h-[320px] overflow-y-auto pr-1">
                          {scanHistory.map(item => (
                            <div
                              key={item.id}
                              className={`p-4 rounded-2xl border flex gap-4 hover:scale-[1.005] duration-250 transition-all ${
                                isDark ? "bg-[#111d33] border-slate-800" : "bg-slate-50 border-slate-100"
                              }`}
                            >
                              <img
                                src={item.imagePreview}
                                alt="Scan Crop"
                                className="w-14 h-14 object-cover rounded-xl border border-slate-700/35 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[10px] font-bold ${
                                    item.confidence === "high" ? "text-emerald-500" : "text-amber-500"
                                  }`}>
                                    {item.confidence === "high" ? "✨ High Confidence" : "⚠️ Low Confidence"}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono">
                                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className={`text-xs font-medium truncate ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                                  {item.extractedText}
                                </p>
                                <div className="mt-2.5 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExtractedResult(item.extractedText);
                                      setSourceImage(item.imagePreview);
                                      setCroppedImage(item.imagePreview);
                                      setOcrConfidence(item.confidence);
                                      setIsCropping(false);
                                    }}
                                    className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-400 hover:text-indigo-300 transition"
                                  >
                                    Review / Edit
                                  </button>
                                  <span className="text-slate-600">•</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onTextScanned(item.extractedText, true);
                                      setIsOpen(false);
                                    }}
                                    className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-400 hover:text-emerald-300 transition animate-pulse"
                                  >
                                    Solve Directly
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. OCR PROCESSING LOADING SECTION */}
                {sourceImage && !isCropping && isOcrProcessing && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="relative mb-5 flex items-center justify-center">
                      <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                      <Sparkles className="w-6 h-6 text-indigo-400 absolute animate-pulse" />
                    </div>
                    <h4 className="font-extrabold text-sm uppercase tracking-wider mb-2 text-indigo-400">AI Extracting Logic...</h4>
                    <p className={`text-xs max-w-sm leading-normal animate-pulse ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Scanning fonts, symbols, handwritten vectors & structured layouts. Solviora OCR model is processing text values securely.
                    </p>
                  </div>
                )}

                {/* 6. EXTRACTED TEXT EDITOR & RESOLVER TRIGGER SCREEN */}
                {sourceImage && !isCropping && !isOcrProcessing && (
                  <div className="space-y-5">
                    
                    {/* CONFIDENCE & RECOGNITION BADGE RAILS */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {ocrConfidence === "high" ? (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-wider">
                            <Check className="w-3 h-3" />
                            <span>✨ High Confidence Recognition</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full text-[10px] font-black uppercase tracking-wider">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>⚠️ Low Confidence - Please Audit</span>
                          </div>
                        )}

                        {!isQuestion && (
                          <div className="flex items-center gap-1 px-3 py-1 bg-slate-500/10 border border-slate-500/20 text-slate-400 rounded-full text-[10px] font-mono">
                            <span>Text Only</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setOcrError(null);
                            setIsCropping(true); // Return to adjust crop overlay
                          }}
                          className={`text-[10px] uppercase font-bold tracking-widest px-2.5 py-1.5 rounded-lg border transition ${
                            isDark ? "border-slate-800 bg-slate-900/40 text-slate-300 hover:text-white" : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Recrop Frame
                        </button>
                        <button
                          type="button"
                          onClick={resetCaptured}
                          className="text-[10px] uppercase font-bold tracking-widest text-rose-400 hover:text-rose-300 transition-all cursor-pointer"
                        >
                          Retake Scan
                        </button>
                      </div>
                    </div>

                    {/* Confidence reason descriptions */}
                    {ocrConfidenceReason && (
                      <p className={`text-[11px] font-medium leading-relaxed mt-1 ${
                        ocrConfidence === "high" ? "text-emerald-400/80" : "text-amber-400/80"
                      }`}>
                        <strong>Assessment note:</strong> {ocrConfidenceReason}
                      </p>
                    )}

                    {/* ERROR MESSAGES IN PROCESSING */}
                    {ocrError && (
                      <div className={`p-4 rounded-2xl border flex gap-3 text-xs leading-relaxed ${
                        isDark ? "bg-rose-950/20 border-rose-900/40 text-rose-300" : "bg-rose-50 border-rose-100 text-rose-800"
                      }`}>
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>Extraction Error:</strong> {ocrError}
                        </div>
                      </div>
                    )}

                    {/* EDITABLE EXTRACTED RESULT FIELD */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#818cf8]">
                        Review Extracted Question:
                      </label>
                      
                      <div className="relative">
                        <textarea
                          rows={4}
                          value={extractedResult}
                          onChange={(e) => setExtractedResult(e.target.value)}
                          placeholder="Extracted text will show here... Feel free to modify or manually input missing details."
                          className={`w-full font-medium rounded-2xl p-4 text-sm outline-none transition-all placeholder-slate-400 border shadow-inner ${
                            isDark 
                              ? "bg-slate-900 border-slate-800 text-white focus:border-indigo-500" 
                              : "bg-slate-50 border-slate-200 text-slate-800 focus:border-indigo-600 focus:bg-white"
                          }`}
                        />
                      </div>
                    </div>

                    {/* OCR LOW CONFIDENCE CUSTOM CALLOUTS */}
                    {ocrConfidence === "low" && (
                      <div className={`p-4 rounded-2xl border flex gap-3 text-xs leading-normal leading-relaxed ${
                        isDark ? "bg-amber-950/15 border-amber-850/40 text-amber-300" : "bg-amber-50 border-amber-100 text-amber-900"
                      }`}>
                        <AlertCircle className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold mb-0.5">💡 Text Review Required</p>
                          <p className="opacity-95 text-[11px]">
                            Gemini flags this capture as low confidence (it could be handwritten curves or busy background). 
                            You can easily fix spelling, variables, or missing numeric operators inside the textarea above manually prior to evaluating.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ACTIONS BAR */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => handleLoadToSolver(false)}
                        className={`flex-1 py-3.5 px-5 rounded-2xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all border ${
                          isDark 
                            ? "bg-slate-800 border-slate-700 text-slate-300 hover:text-white" 
                            : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        <FileText className="w-4 h-4 text-indigo-400" />
                        <span>Load to Input Field</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleLoadToSolver(true)}
                        className="flex-1 py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/10 hover:from-emerald-700 hover:to-teal-650 transition-all scale-100 hover:scale-[1.015]"
                      >
                        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                        <span>Solve Immediately</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                )}

              </div>

              {/* FOOTER DESCRIPTIONS */}
              <div className={`p-4 text-center text-[10px] font-medium border-t ${
                isDark ? "border-slate-800/80 bg-slate-950/20 text-slate-500" : "border-slate-100 bg-slate-50 text-slate-400"
              }`}>
                Solviora OCR captures handwritten math statements, trigonometry systems, chemistry, physics, or logical word problems.
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
