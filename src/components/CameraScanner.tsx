import React, { useState, useRef, useEffect } from "react";
import { 
  Camera, 
  Upload, 
  RotateCw, 
  Crop, 
  Check, 
  AlertCircle, 
  Sparkles, 
  History, 
  X, 
  FileText, 
  RefreshCw,
  ChevronRight,
  Clock,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileQuestion,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { validateOCR } from "../ocrValidator";

interface CameraScannerProps {
  isDark: boolean;
  onTextScanned: (extractedText: string, solveImmediately: boolean, selectedQuestionsList?: string[]) => void;
  isLoadingSolver: boolean;
}

interface ScanHistoryItem {
  id: string;
  imagePreview: string;
  extractedText: string;
  confidence: "high" | "low";
  timestamp: number;
}

const detectMathSymbols = (text: string): string[] => {
  if (!text) return [];
  const symbolRegex = /[\+\-\*\/=≠≈<>≤≥()\[\]{}^√πθλσΔαβγΣ∫]/g;
  const matches = text.match(symbolRegex);
  if (!matches) return [];
  return Array.from(new Set(matches)); // uniquely deduped list
};

/**
 * Optimizes an image (file or base64 data URL) by:
 * 1. Resizing so max(width, height) <= 1280 while maintaining aspect ratio.
 * 2. Compressing to JPEG starting at 80% quality.
 * 3. Reducing quality down to 50% if the size exceeds 1 MB.
 * 4. Utilizing modern browser APIs like createImageBitmap / OffscreenCanvas where supported.
 */
const optimizeImage = async (imageSrc: File | string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const handleImageLoaded = async (img: HTMLImageElement | ImageBitmap) => {
      try {
        const originalWidth = img.width;
        const originalHeight = img.height;
        
        let targetWidth = originalWidth;
        let targetHeight = originalHeight;
        const maxDim = 1024; // Optimized from 1280 to significantly reduce transmission payload and model inference time
        
        if (originalWidth > maxDim || originalHeight > maxDim) {
          if (originalWidth > originalHeight) {
            targetWidth = maxDim;
            targetHeight = Math.round((originalHeight * maxDim) / originalWidth);
          } else {
            targetHeight = maxDim;
            targetWidth = Math.round((originalWidth * maxDim) / originalHeight);
          }
        }
        
        // Use OffscreenCanvas if supported, otherwise standard canvas
        let canvas: HTMLCanvasElement | OffscreenCanvas;
        let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
        
        if (typeof OffscreenCanvas !== "undefined") {
          try {
            canvas = new OffscreenCanvas(targetWidth, targetHeight);
            ctx = canvas.getContext("2d");
          } catch (e) {
            const htmlCanvas = document.createElement("canvas");
            htmlCanvas.width = targetWidth;
            htmlCanvas.height = targetHeight;
            canvas = htmlCanvas;
            ctx = htmlCanvas.getContext("2d");
          }
        } else {
          const htmlCanvas = document.createElement("canvas");
          htmlCanvas.width = targetWidth;
          htmlCanvas.height = targetHeight;
          canvas = htmlCanvas;
          ctx = htmlCanvas.getContext("2d");
        }
        
        if (!ctx) {
          throw new Error("Failed to obtain 2D canvas context for optimization");
        }
        
        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        let quality = 0.75; // Start quality optimized between 60-75%
        let finalDataUrl = "";
        let isUnderLimit = false;
        const targetSizeLimit = 350 * 1024; // 350 KB target for rapid transmission
        
        if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
          while (!isUnderLimit && quality >= 0.60) {
            const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
            if (blob.size < targetSizeLimit || quality <= 0.60) {
              isUnderLimit = true;
              finalDataUrl = await new Promise<string>((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result as string);
                r.onerror = () => rej(r.error);
                r.readAsDataURL(blob);
              });
            } else {
              quality -= 0.03;
            }
          }
        } else if (canvas instanceof HTMLCanvasElement) {
          while (!isUnderLimit && quality >= 0.60) {
            finalDataUrl = canvas.toDataURL("image/jpeg", quality);
            // approximate size: (base64 length * 3/4)
            const approxSize = (finalDataUrl.length - 22) * 3 / 4;
            if (approxSize < targetSizeLimit || quality <= 0.60) {
              isUnderLimit = true;
            } else {
              quality -= 0.03;
            }
          }
        }
        
        // Cleanup if it was an ImageBitmap
        if ("close" in img) {
          img.close();
        }
        
        resolve(finalDataUrl);
      } catch (err) {
        reject(err);
      }
    };
    
    // Check if createImageBitmap is supported and if imageSrc is a File
    if (typeof createImageBitmap !== "undefined" && imageSrc instanceof File) {
      createImageBitmap(imageSrc)
        .then(handleImageLoaded)
        .catch(() => {
          fallbackToStandardImage(imageSrc);
        });
    } else {
      fallbackToStandardImage(imageSrc);
    }
    
    function fallbackToStandardImage(src: string | File) {
      const img = new Image();
      img.onload = () => {
        handleImageLoaded(img);
      };
      img.onerror = () => {
        reject(new Error("Failed to load image element for optimization"));
      };
      if (typeof src === "string") {
        img.src = src;
      } else {
        const url = URL.createObjectURL(src);
        img.onload = () => {
          URL.revokeObjectURL(url);
          handleImageLoaded(img);
        };
        img.src = url;
      }
    }
  });
};

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
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  
  // Image Loading / Crop States
  const [sourceImage, setSourceImage] = useState<string | null>(null); // Base64 raw image
  const [croppedImage, setCroppedImage] = useState<string | null>(null); // Base64 cropped
  const [isCropping, setIsCropping] = useState(false);
  
  // Interactive Crop Frame (in percentages)
  const [cropBox, setCropBox] = useState({ x: 10, y: 15, w: 80, h: 70 });
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  
  // OCR and Extraction states
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [extractedResult, setExtractedResult] = useState<string>("");
  const [ocrConfidence, setOcrConfidence] = useState<"high" | "low" | null>(null);
  const [ocrConfidencePercent, setOcrConfidencePercent] = useState<number | null>(null);
  const [ocrConfidenceReason, setOcrConfidenceReason] = useState<string>("");
  const [isQuestion, setIsQuestion] = useState(true);
  const [detectedQuestions, setDetectedQuestions] = useState<{
    id: string;
    text: string;
    box: { ymin: number; xmin: number; ymax: number; xmax: number };
  }[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const selectedQuestionId = selectedQuestionIds.length === 1 ? selectedQuestionIds[0] : null;

  // Multi-select helper utilities
  const updateExtractedText = (ids: string[], currentQuestions = detectedQuestions) => {
    if (ids.length === 0) {
      setExtractedResult("");
      return;
    }
    
    // Filter questions in their original order
    const selectedQs = currentQuestions.filter((q) => ids.includes(q.id));
    
    if (selectedQs.length === 1) {
      setExtractedResult(selectedQs[0].text);
    } else {
      const combined = selectedQs
        .map((q, idx) => `[Question ${idx + 1}]:\n${q.text}`)
        .join("\n\n");
      setExtractedResult(combined);
    }
  };

  const toggleQuestionSelection = (qId: string) => {
    setSelectedQuestionIds((prev) => {
      let next: string[];
      if (prev.includes(qId)) {
        next = prev.filter((id) => id !== qId);
      } else {
        next = [...prev, qId];
      }

      // Preserve original order on the page (top-to-bottom, left-to-right)
      const orderedIds = detectedQuestions
        .filter((q) => next.includes(q.id))
        .map((q) => q.id);

      updateExtractedText(orderedIds);
      return orderedIds;
    });
  };

  const handleSelectAll = () => {
    const allIds = detectedQuestions.map((q) => q.id);
    setSelectedQuestionIds(allIds);
    updateExtractedText(allIds);
  };

  const handleClearSelection = () => {
    setSelectedQuestionIds([]);
    setExtractedResult("");
  };

  // Error diagnostic modules
  const [technicalErrorDetails, setTechnicalErrorDetails] = useState<string | null>(null);
  const [isDeveloperDetailsExp, setIsDeveloperDetailsExp] = useState(false);
  const [preOptimizedSize, setPreOptimizedSize] = useState<number>(0);

  // Scan History State
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  
  // Notice Banner Popup states
  const [isCopied, setIsCopied] = useState(false);
  
  // Dynamic Loading Text state for OCR
  const [loadingText, setLoadingText] = useState("Analyzing image...");

  useEffect(() => {
    if (!isOcrProcessing) return;
    const texts = [
      "Analyzing image...",
      "Detecting text...",
      "Recognizing mathematical expressions..."
    ];
    let currentIndex = 0;
    setLoadingText(texts[0]);
    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % texts.length;
      setLoadingText(texts[currentIndex]);
    }, 2000);
    return () => clearInterval(interval);
  }, [isOcrProcessing]);
  
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

  // Copy to clipboard helper
  const handleCopyText = (text: string) => {
    if (!text.trim()) return;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  // Start Camera Stream
  const startCamera = async () => {
    setCameraError(null);
    setCameraNotice(null);
    if (stream) {
      stopCamera();
    }

    const isPreviewEnv = typeof window !== "undefined" && (
      window.self !== window.top ||
      window.location.hostname.includes("ai.studio") ||
      (window.location.hostname.includes("run.app") && !navigator?.mediaDevices)
    );

    // 1. Unsupported Browser/Context check
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn("Camera mediaDevices API is not supported in this browser context.");
      const unsupportedMsg = "Your browser or device context does not support live camera access. Please use the File Upload option instead.";
      
      if (isPreviewEnv) {
        setActiveTab("upload");
        setCameraNotice("Live camera access is not supported or is blocked in this preview iframe. Switched to File Upload.");
      } else {
        setCameraError(unsupportedMsg);
      }
      return;
    }

    try {
      // 2. Request camera permission and open camera with progressive constraints
      let mediaStream: MediaStream;
      try {
        const constraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.warn("Standard video constraints failed, trying with relaxed facingMode constraint:", err);
        try {
          const relaxedConstraints = {
            video: {
              facingMode: { ideal: facingMode }
            },
            audio: false
          };
          mediaStream = await navigator.mediaDevices.getUserMedia(relaxedConstraints);
        } catch (err2) {
          console.warn("Relaxed video constraints failed, trying simple video constraint:", err2);
          // Pure fallback to any available video track
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      setStream(mediaStream);
    } catch (err: any) {
      console.error("Camera startup error:", err);
      
      let specificError = "Could not access your camera. Please use the Upload tab to import a file or photo instead.";
      
      // Categorized Error Handling
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        specificError = "Permission Denied: Please allow camera access in your browser settings or device permissions to capture your question.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        specificError = "No camera found: We couldn't detect any active camera connected to your device. Please use the File Upload tab.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        specificError = "Camera In Use: Your camera is currently active in another application. Please close other camera apps and try again.";
      } else if (err.name === "SecurityError") {
        specificError = "Security Restriction: Camera access is blocked due to domain security policies or iframe frame permission boundaries.";
      }

      if (isPreviewEnv) {
        // Automatically fall back to Upload tab on preview environment failures
        setActiveTab("upload");
        setCameraNotice(`Camera is unavailable in the preview context (${err.name || "Access Blocked"}). Switched to File Upload.`);
      } else {
        setCameraError(specificError);
      }
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // Resilient useEffect to bind the camera stream to the video tag element once it mounts
  useEffect(() => {
    let active = true;
    if (stream && videoRef.current) {
      const video = videoRef.current;
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      
      const playVideo = async () => {
        try {
          if (active) {
            await video.play();
          }
        } catch (playErr) {
          console.warn("Autoplay / stream play failed:", playErr);
        }
      };
      playVideo();
    }
    return () => {
      active = false;
    };
  }, [stream, activeTab]);

  // Manage camera state on tab changes or dialog opening
  useEffect(() => {
    if (isOpen && activeTab === "camera" && !sourceImage) {
      if (!stream) {
        startCamera();
      }
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
  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      const originalSize = dataUrl.length * 3 / 4;
      setPreOptimizedSize(originalSize);
      
      try {
        const optimizedUrl = await optimizeImage(dataUrl);
        setSourceImage(optimizedUrl);
        setCroppedImage(optimizedUrl); // Default cropped to full image first
        stopCamera();
        setIsCropping(false); // Skip crop view entirely
        triggerOcr(optimizedUrl, originalSize); // Automatically process full image using OCR
      } catch (err: any) {
        console.error("Failed to optimize captured photo:", err);
        // Fallback to original captured image
        setSourceImage(dataUrl);
        setCroppedImage(dataUrl);
        stopCamera();
        setIsCropping(false);
        triggerOcr(dataUrl, originalSize);
      }
    }
  };

  // File Upload Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setOcrError("Please upload a valid image file (PNG, JPEG, WEBP)");
      return;
    }
    // Reject uploads that exceed a reasonable size limit with a clear user message
    const MAX_UPLOAD_SIZE = 12 * 1024 * 1024; // 12 MB
    if (file.size > MAX_UPLOAD_SIZE) {
      setOcrError(`⚠️ Upload failed: The image file is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). The maximum allowed size for OCR scanning is 12MB. Please upload a smaller or compressed image.`);
      return;
    }

    setPreOptimizedSize(file.size);

    try {
      const optimizedUrl = await optimizeImage(file);
      setSourceImage(optimizedUrl);
      setCroppedImage(optimizedUrl);
      setIsCropping(false); // Skip crop view entirely
      triggerOcr(optimizedUrl, file.size); // Automatically process full image using OCR
    } catch (err: any) {
      console.error("Failed to optimize uploaded file:", err);
      // Fallback to standard reader
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setSourceImage(base64);
        setCroppedImage(base64);
        setIsCropping(false);
        triggerOcr(base64, file.size);
      };
      reader.onerror = () => {
        setOcrError("Failed to read the uploaded image file.");
      };
      reader.readAsDataURL(file);
    }
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
    
    const posX = ((clientX - rect.left) / rect.width) * 100;
    const posY = ((clientY - rect.top) / rect.height) * 100;

    setCropBox(prev => {
      let { x, y, w, h } = prev;

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
      }

      if (w < 10) w = 10;
      if (h < 10) h = 10;
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
      
      const cropXPercentage = cropBox.x / 100;
      const cropYPercentage = cropBox.y / 100;
      const cropWPercentage = cropBox.w / 100;
      const cropHPercentage = cropBox.h / 100;

      const pxX = img.width * cropXPercentage;
      const pxY = img.height * cropYPercentage;
      const pxW = img.width * cropWPercentage;
      const pxH = img.height * cropHPercentage;

      // Ensure cropped width and height are strictly greater than 0
      if (pxW <= 0 || pxH <= 0 || isNaN(pxW) || isNaN(pxH)) {
        console.error("[Silent Tech Logger] Selected crop dimensions are too small or invalid:", { pxW, pxH });
        setOcrError("⚠️ Selected crop region is empty or too small. Please expand the cropping boundaries.");
        return;
      }

      canvas.width = pxW;
      canvas.height = pxH;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, pxX, pxY, pxW, pxH, 0, 0, pxW, pxH);
        const base64cropped = canvas.toDataURL("image/png");
        const originalSize = base64cropped.length * 3 / 4;
        setPreOptimizedSize(originalSize);
        
        optimizeImage(base64cropped)
          .then((optimizedCropped) => {
            setCroppedImage(optimizedCropped);
            setIsCropping(false); // Staging
            triggerOcr(optimizedCropped, originalSize);
          })
          .catch((err) => {
            console.error("Failed to optimize cropped image:", err);
            // Fallback to unoptimized cropped image
            setCroppedImage(base64cropped);
            setIsCropping(false);
            triggerOcr(base64cropped, originalSize);
          });
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
    setOcrConfidencePercent(null);
    setOcrError(null);
    setTechnicalErrorDetails(null);
    setIsDeveloperDetailsExp(false);
    setDetectedQuestions([]);
    setSelectedQuestionIds([]);
    if (activeTab === "camera") {
      startCamera();
    }
  };

  // --- TRIGGER BACKEND MULTIMODAL OCR ---
  const triggerOcr = async (imageB64: string, customOriginalSize?: number) => {
    setIsOcrProcessing(true);
    setOcrError(null);
    setTechnicalErrorDetails(null);
    setOcrConfidencePercent(null);
    setIsDeveloperDetailsExp(false);

    // Helper utility to convert base64 image strings to raw Blobs
    const dataURLtoBlob = (dataurl: string) => {
      try {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
      } catch (e) {
        return null;
      }
    };

    const blob = dataURLtoBlob(imageB64);
    const blobSize = blob ? blob.size : 0;
    const blobType = blob ? blob.type : "unknown";
    const b64Length = imageB64 ? imageB64.length : 0;

    // Compression ratio metrics calculation
    const originalSize = customOriginalSize || preOptimizedSize || (b64Length * 3 / 4);
    const compressedSize = b64Length * 3 / 4;
    const compressionRatio = originalSize > 0 ? (originalSize / compressedSize).toFixed(2) : "1.00";

    // Verbose, structured audit logging for developer console diagnostics
    console.info("========================================");
    console.info("⚡ SOLVIORA MULTIMODAL OCR ENGINE DIAGNOSTICS");
    console.info(`- Crop coordinates: X=${cropBox.x}%, Y=${cropBox.y}%, W=${cropBox.w}%, H=${cropBox.h}%`);
    console.info(`- Base64 length: ${b64Length} characters`);
    console.info(`- Decoded Blob type: ${blobType}`);
    console.info(`- Original pre-compression size: ${originalSize} bytes`);
    console.info(`- Compressed Blob size: ${blobSize} bytes (${(blobSize / 1024).toFixed(2)} KB)`);
    console.info(`- Compression ratio achieved: ${compressionRatio}x`);
    console.info("========================================");

    // Prevent submitting empty or invalid files
    if (!imageB64 || b64Length < 100) {
      setOcrError("⚠️ Captured image payload is empty. Please capture or upload another visual.");
      setIsOcrProcessing(false);
      return;
    }

    if (!blob || blobSize === 0) {
      setOcrError("⚠️ Image stream could not be converted to a valid file payload. Size is empty.");
      setIsOcrProcessing(false);
      return;
    }

    const validMimes = ["image/png", "image/jpeg", "image/webp"];
    if (!validMimes.includes(blobType)) {
      setOcrError(`⚠️ Unsupported file format: ${blobType}. Clean text extraction requires PNG, JPEG or WEBP.`);
      setIsOcrProcessing(false);
      return;
    }

    if (cropBox.w <= 0 || cropBox.h <= 0) {
      setOcrError("⚠️ Crop area coordinates must be positive and non-empty. Modify the crop border.");
      setIsOcrProcessing(false);
      return;
    }
    
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    let attempt = 0;
    const maxRetries = 1; // Retry once automatically for transient network failures as requested
    let lastErr: any = null;
    let finalSuccess = false;
    let fallbackText = "";

    const clientSentTime = Date.now();

    while (attempt <= maxRetries) {
      try {
        if (attempt > 0) {
          // Retry delay (2 seconds)
          const delayMs = 2000;
          console.warn(`[OCR Retry System] Transient error detected. Retrying once in ${delayMs}ms... (Attempt ${attempt}/${maxRetries})`);
          await sleep(delayMs);
        }

        // Establish a strict 40-second client-side timeout using AbortController (as requested: 30-45 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, 40000);

        let response;
        const fetchStart = Date.now();
        try {
          response = await fetch("/api/ocr", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              image: imageB64,
              mimeType: blobType,
              originalSize,
              clientSentTime
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const contentType = response.headers.get("content-type") || "";

        // Diagnostic extraction of response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((val, key) => {
          responseHeaders[key] = val;
        });

        const fetchDuration = Date.now() - fetchStart;

        console.info(`[HTTP Attempt ${attempt + 1}] Status Code: ${response.status} ${response.statusText}`);
        console.info(`[HTTP Attempt ${attempt + 1}] Content-Type Header: ${contentType}`);
        console.info(`[HTTP Attempt ${attempt + 1}] Duration: ${fetchDuration}ms`);

        const responseBodyText = await response.text().catch(() => "");
        console.info(`[HTTP Payload] Body Length: ${responseBodyText.length} characters`);
        fallbackText = responseBodyText;

        let data: any;
        try {
          const rawParsed = JSON.parse(responseBodyText);
          data = validateOCR(rawParsed);
        } catch (e) {
          data = {
            status: "error",
            error_code: "OCR_PARSE_FAILED",
            error_type: "INVALID_INPUT",
            data: {
              text: "",
              confidence: 0,
              problem_type: "unknown"
            }
          };
        }

        // Handle success status
        if (data.status === "success") {
          const extractedText = data.data?.text || data.data?.extracted_text || "";
          
          if (!extractedText.trim()) {
            throw new Error("OCR returned empty text: The text was completely unreadable, blurry, low-contrast, or contained no recognizable mathematical characters.");
          }

          const confidenceVal = typeof data.data?.confidence === "number" ? data.data.confidence : 0.95;
          const scorePercent = Math.max(10, Math.min(99, Math.round(confidenceVal * 100)));
          
          setOcrConfidencePercent(scorePercent);
          setOcrConfidence(confidenceVal >= 0.70 ? "high" : "low");
          setOcrConfidenceReason(`Multimodal OCR pattern completed successfully (Code: ${data.error_code || 0}).`);
          
          const isMathOrText = data.data?.problem_type === "math" || data.data?.problem_type === "text" || data.data?.problem_type === "unknown";
          setIsQuestion(isMathOrText);

          const questions = Array.isArray(data.data?.questions) ? data.data.questions : [];
          const resolvedQuestions = questions.length > 0 ? questions : [{
            id: "q1",
            text: extractedText,
            box: { ymin: 0, xmin: 0, ymax: 100, xmax: 100 }
          }];

          if (resolvedQuestions.length === 1) {
            const singleQuestionText = resolvedQuestions[0].text;
            setExtractedResult(singleQuestionText);
            setSelectedQuestionIds([resolvedQuestions[0].id]);
            setDetectedQuestions(resolvedQuestions);

            // Store to scan history automatically
            saveScanToHistory({
              id: Date.now().toString(),
              imagePreview: imageB64,
              extractedText: singleQuestionText,
              confidence: confidenceVal >= 0.70 ? "high" : "low",
              timestamp: Date.now(),
            });

            // Send output back to Solviora Solver Input and solve immediately
            onTextScanned(singleQuestionText, true);
            setIsOpen(false);
            resetCaptured();
          } else {
            // Multiple questions detected!
            setDetectedQuestions(resolvedQuestions);
            setSelectedQuestionIds([]); // Unselected by default so they can choose
            setExtractedResult(""); // Keep text area empty until they select

            // Store the overall text to history
            saveScanToHistory({
              id: Date.now().toString(),
              imagePreview: imageB64,
              extractedText: extractedText,
              confidence: confidenceVal >= 0.70 ? "high" : "low",
              timestamp: Date.now(),
            });
          }

          finalSuccess = true;
          break; // Break loop since we succeeded!
        }

        // Handle error status inside response
        if (data.status === "error") {
          const errCode = data.error_code;
          const errType = data.error_type;
          const serverMessage = data.message;

          const errorMap: Record<number | string, string> = {
            1001: "No image detected",
            1002: "Image too blurry",
            1003: "File corrupted",
            1004: "Unsupported format",
            1005: "Too many requests",
            1006: "Network timeout",
            1007: "API not configured",
            1008: "Invalid input",
            
            // New specific codes
            "NETWORK_TIMEOUT": "⚠️ The OCR request timed out. A connection timeout occurred. Please check your internet connection.",
            "API_KEY_INVALID": "The server's Google Gemini API key is missing, unauthorized, or invalid. Please configure your API key in the Settings > Secrets menu in AI Studio.",
            "API_RATE_LIMIT": "The Gemini API request limit has been exceeded. Please wait a few moments and try your camera scan again.",
            "IMAGE_DECODE_FAILED": "The image data is corrupted, malformed, or of an unsupported format. Please retry capturing or upload another image.",
            "GEMINI_UNAVAILABLE": "The AI service is temporarily overloaded or unavailable. We are retrying the request...",
            "OCR_PARSE_FAILED": "OCR scanning failed to extract structured question text. Please try taking a clearer picture.",
            "SERVER_ERROR": "A server error occurred while processing the OCR request."
          };

          const friendlyError = serverMessage || errorMap[errCode] || errorMap[errType] || "Unsupported image format or corrupt input. Try another screenshot.";

          const isRetryable = 
            errCode === 1006 || 
            errCode === 1005 || 
            errCode === "NETWORK_TIMEOUT" || 
            errCode === "API_RATE_LIMIT" || 
            errCode === "GEMINI_UNAVAILABLE" ||
            errType === "TIMEOUT" || 
            errType === "RATE_LIMIT" ||
            errType === "NETWORK_TIMEOUT" ||
            errType === "API_RATE_LIMIT" ||
            errType === "GEMINI_UNAVAILABLE";

          if (isRetryable && attempt < maxRetries) {
            lastErr = new Error(friendlyError);
            attempt++;
            continue; // Go to next attempt
          } else {
            // Immediately stop retry and throw for non-retryable errors
            throw new Error(friendlyError);
          }
        }

      } catch (err: any) {
        if (err.name === "AbortError") {
          lastErr = new Error("⚠️ The OCR request timed out. A connection timeout occurred. Please check your internet connection.");
        } else {
          lastErr = err;
        }
        console.warn(`[OCR Retry System] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, err.message || err);
        if (attempt < maxRetries) {
          attempt++;
        } else {
          break;
        }
      }
    }

    // Process final outcome when all attempts exhausted
    setIsOcrProcessing(false);

    if (!finalSuccess) {
      // Extracted retries fully exhausted
      const rawErrorStr = lastErr?.message || lastErr?.toString() || "Connection timeout";
      console.error("[Silent Tech Logger] OCR failure after exhausted retries:", rawErrorStr);
      
      let finalFriendlyMsg = rawErrorStr;
      if (rawErrorStr.includes("Failed to fetch") || rawErrorStr.includes("network") || rawErrorStr.includes("Network")) {
        finalFriendlyMsg = "⚠️ Network failure: A connection timeout occurred. Please check your internet connection.";
      }

      setOcrError(finalFriendlyMsg);
      setTechnicalErrorDetails(
        fallbackText 
          ? `[API Response Raw]: ${fallbackText.substring(0, 1000)}` 
          : (lastErr?.stack || rawErrorStr)
      );
    }
  };

  // Send output back to Solviora Solver Input
  const handleLoadToSolver = (solveImmediately: boolean) => {
    if (selectedQuestionIds.length > 1) {
      const selectedQsText = detectedQuestions
        .filter((q) => selectedQuestionIds.includes(q.id))
        .map((q) => q.text);
      onTextScanned(extractedResult, solveImmediately, selectedQsText);
    } else {
      if (!extractedResult.trim()) return;
      onTextScanned(extractedResult, solveImmediately);
    }
    setIsOpen(false);
    // Cleanup States
    resetCaptured();
  };

  // Extract variables for OCR preview statistics
  const numLinesDetected = extractedResult ? extractedResult.split("\n").filter(l => l.trim().length > 0).length : 0;
  const detectedMathSymbols = detectMathSymbols(extractedResult);

  return (
    <div className="w-full">
      {/* TRIGGER BUTTON */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setActiveTab("camera");
          // Pre-trigger camera request immediately within user-gesture callstack for trust
          startCamera();
        }}
        className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2.5 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer border ${
          isDark 
            ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750 hover:text-white hover:border-indigo-505/50 shadow-indigo-500/5" 
            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-indigo-600/50 hover:shadow"
        }`}
        id="camera-scan-trigger-btn"
      >
        <Camera className="w-4.5 h-4.5 text-indigo-500 animate-pulse" />
        <span>Scan Question with Camera</span>
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
      </button>

      {/* MODAL VIEWPORT FOR SCANNING */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`w-full max-w-3xl rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(99,102,241,0.15)] flex flex-col max-h-[92vh] md:max-h-[85vh] ${
                isDark ? "bg-[#070b13] border border-slate-800 text-white" : "bg-slate-950 border border-slate-850 text-white"
              }`}
              id="camera-scanner-modal"
            >
              {/* HEADER CONTAINER - FUTURISTIC GLOW */}
              <div className="p-5 flex items-center justify-between border-b border-slate-850 bg-[#0a101c]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/25 shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm tracking-widest text-[#94a3b8] uppercase flex items-center gap-1.5">
                      AI QUESTION SCANNER
                      <span className="text-[9px] bg-indigo-500/20 text-[#818cf8] py-0.5 px-2 rounded-full font-mono scale-90">
                        v2.0
                      </span>
                    </h3>
                    <p className="text-[10px] uppercase font-mono tracking-widest text-indigo-400/80">
                      Multimodal OCR Resolver
                    </p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    stopCamera();
                  }}
                  className="p-2 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                  id="scanner-close-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* TABS SELECTOR ONLY SHOWN IN INITIAL SETUP WITHOUT EXTRACTIONS */}
              {!sourceImage && (
                <div className="p-4 flex border-b border-slate-850/60 bg-slate-950/40">
                  <div className="flex gap-2 w-full max-w-md">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("camera");
                        setCameraError(null);
                        setCameraNotice(null);
                        // Trigger within user-gesture
                        startCamera();
                      }}
                      className={`flex-1 py-2 px-3.5 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        activeTab === "camera"
                          ? "bg-[#6366f1] text-white shadow-md shadow-indigo-600/20"
                          : "text-slate-400 hover:bg-slate-900/40"
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Live Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("upload");
                        setCameraError(null);
                        setCameraNotice(null);
                      }}
                      className={`flex-1 py-2 px-3.5 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        activeTab === "upload"
                          ? "bg-[#6366f1] text-white shadow-md shadow-indigo-600/20"
                          : "text-slate-400 hover:bg-slate-900/40"
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload File</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("history");
                        setCameraError(null);
                        setCameraNotice(null);
                      }}
                      className={`flex-1 py-2 px-3.5 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        activeTab === "history"
                          ? "bg-[#6366f1] text-white shadow-md shadow-indigo-600/20"
                          : "text-slate-400 hover:bg-slate-900/40"
                      }`}
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>History</span>
                    </button>
                  </div>
                </div>
              )}

              {/* COPIED TO CLIPBOARD FLOATING WARNING */}
              <AnimatePresence>
                {isCopied && (
                  <motion.div 
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -10, opacity: 0 }}
                    className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-lg border border-emerald-400 flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Copied text successfully!</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* MAIN BODY AREA */}
              <div className="flex-1 overflow-y-auto p-6" id="scanner-modal-body">
                
                {/* 1. CROPPING VIEW - LET USER CORNER THE CARD */}
                {sourceImage && isCropping && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Crop className="w-4 h-4 text-indigo-400 animate-pulse" />
                        <h4 className="font-extrabold text-xs uppercase tracking-widest text-[#94a3b8]">Crop to Your Question</h4>
                      </div>
                      <button
                        type="button"
                        onClick={resetCaptured}
                        className="text-[10px] uppercase font-bold tracking-widest text-rose-450 hover:text-rose-400 transition-all cursor-pointer"
                      >
                        Retake / Cancel
                      </button>
                    </div>

                    <p className="text-[11px] leading-relaxed text-slate-400">
                      💡 <strong>Tip:</strong> Drag the corner handles to surround only the math, science, or text calculation. Minimizing border background noise ensures the highest AI extraction precision!
                    </p>

                    {/* INTERACTIVE CROP BOX PANEL */}
                    <div 
                      ref={cropContainerRef}
                      className="relative border rounded-2xl max-h-[350px] overflow-hidden select-none flex items-center justify-center bg-slate-950 border-slate-850"
                    >
                      <img 
                        src={sourceImage} 
                        alt="To Crop" 
                        className="max-h-[350px] object-contain pointer-events-none"
                      />
                      
                      {/* Dark overlay covering the backdrop */}
                      <div className="absolute inset-0 bg-slate-950/65 pointer-events-none"></div>

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
                        {/* Interactive Corner handles */}
                        <div 
                          className="absolute -top-1.5 -left-1.5 w-4.5 h-4.5 bg-indigo-500 rounded-full border border-white cursor-nwse-resize select-none"
                          onTouchStart={(e) => handleHandleMouseDown("tl", e)}
                          onMouseDown={(e) => handleHandleMouseDown("tl", e)}
                        ></div>
                        <div 
                          className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-indigo-500 rounded-full border border-white cursor-nesw-resize select-none"
                          onTouchStart={(e) => handleHandleMouseDown("tr", e)}
                          onMouseDown={(e) => handleHandleMouseDown("tr", e)}
                        ></div>
                        <div 
                          className="absolute -bottom-1.5 -left-1.5 w-4.5 h-4.5 bg-indigo-500 rounded-full border border-white cursor-nesw-resize select-none"
                          onTouchStart={(e) => handleHandleMouseDown("bl", e)}
                          onMouseDown={(e) => handleHandleMouseDown("bl", e)}
                        ></div>
                        <div 
                          className="absolute -bottom-1.5 -right-1.5 w-4.5 h-4.5 bg-indigo-500 rounded-full border border-white cursor-nwse-resize select-none"
                          onTouchStart={(e) => handleHandleMouseDown("br", e)}
                          onMouseDown={(e) => handleHandleMouseDown("br", e)}
                        ></div>

                        {/* Tech crosshairs */}
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
                        className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer border border-slate-800 text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={applyCrop}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase flex items-center gap-2 cursor-pointer shadow"
                      >
                        <Crop className="w-4 h-4" />
                        <span>Extract Text Now</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. LIVE CAMERA VIEWPORT */}
                {!sourceImage && activeTab === "camera" && (
                  <div className="space-y-4">
                    {cameraError ? (
                      <div className="p-5 rounded-2xl border border-rose-950/45 bg-[#170a0e] text-rose-300 flex flex-col items-center text-center">
                        <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
                        <h4 className="font-extrabold text-xs uppercase tracking-wider mb-2">Camera Access Restricted</h4>
                        <p className="text-xs max-w-md leading-relaxed mb-4">{cameraError}</p>
                        <div className="flex flex-wrap gap-3 justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              setCameraError(null);
                              startCamera();
                            }}
                            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-750 font-bold text-xs uppercase flex items-center gap-2 cursor-pointer shadow"
                          >
                            <Camera className="w-4 h-4 text-indigo-400" />
                            <span>Retry Camera</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab("upload")}
                            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase flex items-center gap-2 cursor-pointer shadow"
                          >
                            <Upload className="w-4 h-4" />
                            <span>Switch to File Upload</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="relative rounded-2xl overflow-hidden border border-slate-850 max-h-[350px] bg-slate-950 flex items-center justify-center">
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full max-h-[350px] object-cover"
                          />
                          
                          {/* HIGH TECH CAMERA SCANNING RETICLE */}
                          <div className="absolute inset-0 border border-indigo-500/20 pointer-events-none flex items-center justify-center">
                            <div className="w-[85%] h-[75%] border-2 border-dashed border-indigo-500/35 rounded-2xl relative">
                              {/* Laser bounce scanline */}
                              <motion.div 
                                className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_12px_#6366f1]"
                                animate={{ top: ["5%", "95%", "5%"] }}
                                transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
                              />
                            </div>
                          </div>

                          {/* FLOATING CAMERA CONTROL PANELS */}
                          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4 z-10">
                            <button
                              type="button"
                              onClick={toggleFacingMode}
                              className="p-3 rounded-full bg-slate-900/90 backdrop-blur border border-slate-755 hover:bg-slate-800 text-white cursor-pointer transition-all shadow-md"
                              title="Flip Camera orientation"
                            >
                              <RotateCw className="w-4 h-4" />
                            </button>
                            
                            <button
                              type="button"
                              onClick={capturePhoto}
                              className="px-6 py-3 rounded-full bg-indigo-650 hover:bg-indigo-700 text-white font-black text-xs uppercase flex items-center gap-2 cursor-pointer transition-all shadow-lg border border-indigo-500/30 scale-103"
                            >
                              <Camera className="w-4.5 h-4.5" />
                              <span>Capture Frame</span>
                            </button>
                          </div>
                        </div>

                        {/* EMPTY STATE INTEGRATION UNDER THE ACTIVE CAMERA */}
                        <div className="p-4 rounded-xl border border-slate-850 bg-slate-900/10 text-center flex items-center justify-center gap-2.5">
                          <FileQuestion className="w-4 h-4 text-indigo-400 shrink-0" />
                          <p className="text-[11px] text-slate-400 tracking-wide">
                            Take a picture of a handwritten or printed question to begin.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. GALLERY / FILE DRAG-AND-DROP UPLOAD VIEW */}
                {!sourceImage && activeTab === "upload" && (
                  <div className="space-y-4">
                    {cameraNotice && (
                      <div className="p-3.5 rounded-2xl border border-indigo-500/10 bg-indigo-500/[0.03] text-[#a5b4fc] flex items-center gap-3 text-xs leading-normal">
                        <Info className="w-4.5 h-4.5 text-indigo-400 shrink-0" />
                        <span className="flex-1 font-medium">{cameraNotice}</span>
                        <button
                          type="button"
                          onClick={() => setCameraNotice(null)}
                          className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-400 hover:text-indigo-300 transition shrink-0 cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    <div
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[260px] select-none border-slate-800 bg-[#070b13] hover:border-indigo-500/50 hover:bg-indigo-500/[0.015]"
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                      />
                      
                      {/* GORGEOUS EMPTY STATE CENTER ILLUSTRATION */}
                      <div className="relative mb-4 flex flex-col items-center">
                        <div className="absolute inset-0 rounded-full bg-indigo-500/10 blur-2xl w-20 h-20 -translate-y-2"></div>
                        <div className="p-4 bg-slate-900/60 border border-slate-800 text-indigo-400 rounded-2xl relative shadow-md">
                          <Camera className="w-8 h-8 mx-auto text-indigo-400 animate-pulse" />
                        </div>
                      </div>

                      <h4 className="font-extrabold text-xs uppercase tracking-widest text-slate-300 mb-2">
                        Drag & Drop Question Image
                      </h4>
                      <p className="text-[11px] text-slate-450 max-w-sm mb-4 leading-normal">
                        Take a picture of a handwritten or printed question to begin.
                      </p>
                      
                      <div className="text-[10px] font-mono text-indigo-400/80 tracking-widest uppercase py-1 px-3 rounded-full border border-indigo-500/20 bg-indigo-500/5">
                        PNG • JPEG • WEBP
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. RECENT SCANS TAB DETAIL */}
                {!sourceImage && activeTab === "history" && (
                  <div className="space-y-4">
                    {scanHistory.length === 0 ? (
                      <div className="text-center py-12 flex flex-col items-center justify-center">
                        <Clock className="w-10 h-10 text-slate-600 mb-3 animate-pulse" />
                        <h4 className="font-bold text-xs uppercase tracking-widest text-slate-450">Scan History Empty</h4>
                        <p className="text-xs mt-1 text-slate-500">
                          Captured textbook files & captures will save here automatically.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        <div className="flex justify-between items-center pl-1">
                          <span className="text-[10px] font-mono text-slate-450 uppercase font-bold">
                            Showing last {scanHistory.length} scans
                          </span>
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
                              className="p-4 rounded-2xl border border-slate-850 bg-[#090f19] flex gap-4 hover:border-slate-750 transition-all duration-200"
                            >
                              <img
                                src={item.imagePreview}
                                alt="Scan Cover"
                                className="w-14 h-14 object-cover rounded-xl border border-slate-800 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[10px] font-bold ${
                                    item.confidence === "high" ? "text-emerald-400" : "text-amber-400"
                                  }`}>
                                    {item.confidence === "high" ? "🟢 High Confidence" : "🔴 Low Confidence"}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono">
                                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="text-xs font-semibold truncate text-[#b4c6ef]">
                                  {item.extractedText}
                                </p>
                                <div className="mt-2 text-xs flex gap-3">
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
                                    Review & Edit
                                  </button>
                                  <span className="text-slate-800">•</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onTextScanned(item.extractedText, true);
                                      setIsOpen(false);
                                    }}
                                    className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-400 hover:text-emerald-300 transition"
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

                {/* 5. OCR DYNAMIC SCANNING SCANLINE LOADER */}
                {sourceImage && !isCropping && isOcrProcessing && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    
                    {/* Animated scanning lines backdrop thumbnail */}
                    <div className="relative w-48 h-32 border border-slate-800 rounded-2xl overflow-hidden mb-5 flex items-center justify-center bg-slate-950">
                      <img 
                        src={croppedImage || sourceImage || ""} 
                        alt="Scanned Target" 
                        className="w-full h-full object-cover opacity-35 blur-xs" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-500/10 to-transparent"></div>
                      
                      {/* Floating glowing scanning laser line (Framer Motion driven) */}
                      <motion.div 
                        className="absolute inset-x-0 h-0.5 bg-indigo-500 shadow-[0_0_15px_#6366f1]"
                        animate={{ top: ["5%", "95%", "5%"] }}
                        transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
                      />
                    </div>

                    <div className="relative mb-3 flex items-center justify-center">
                      <div className="w-12 h-12 border-3 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
                      <Sparkles className="w-4 h-4 text-indigo-400 absolute animate-pulse" />
                    </div>

                    <h4 className="font-extrabold text-sm uppercase tracking-wider mb-2 text-indigo-400 animate-pulse">
                      {loadingText}
                    </h4>
                    <p className="text-xs max-w-sm text-slate-400 leading-normal">
                      Reading printing typography, mathematical curves, logic structures and handwriting arrays. Processing values securely on server.
                    </p>
                  </div>
                )}

                {/* 6. EDITOR VIEW & RESULTS PROCESSING STAGE */}
                {sourceImage && !isCropping && !isOcrProcessing && (
                  <div className="space-y-6">
                    
                    {/* CONFIDENCE INDICATOR OR USER FRIENDLY ERROR CONTAINER */}
                    {ocrError ? (
                      
                      /* REQUIREMENT 3: USER FRIENDLY ERROR COMPONENT CARD */
                      <div className="p-5 rounded-2xl border border-rose-950/45 bg-[#170a0e] text-rose-300 flex flex-col gap-4 shadow-lg">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-6 h-6 text-rose-500 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="font-extrabold text-sm text-rose-400 mb-2 leading-snug">
                              {ocrError}
                            </h4>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              Your device captured the image correctly, but the Solviora OCR engine was blocked from parsing the text. Review the technical details log below.
                            </p>
                          </div>
                        </div>

                        {/* REQUIREMENT 3: BUTTONS GROUP WITHIN THE PANICKED CONTAINER */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-rose-950/30">
                          <button
                            type="button"
                            onClick={resetCaptured}
                            className="py-1.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>🔄 Retake Scan</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setOcrError(null);
                              setIsCropping(true); // switch back to crop view directly
                            }}
                            className="py-1.5 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <Crop className="w-3.5 h-3.5" />
                            <span>✂️ Recrop Image</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              resetCaptured();
                              setActiveTab("camera"); // auto direct back to live lens
                            }}
                            className="py-1.5 px-3 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>📷 New Scan</span>
                          </button>
                        </div>

                        {/* REQUIREMENT 3: EXPANDABLE VIEW TECHNICAL DETAILS SECTION FOR DEVELOPERS */}
                        {technicalErrorDetails && (
                          <div className="border-t border-rose-950/20 pt-3">
                            <button
                              type="button"
                              onClick={() => setIsDeveloperDetailsExp(!isDeveloperDetailsExp)}
                              className="text-[9px] font-mono uppercase font-black text-rose-400/70 hover:text-rose-300 flex items-center gap-1 transition select-none"
                            >
                              <span>View Technical Details (Debug Log)</span>
                              {isDeveloperDetailsExp ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>

                            {isDeveloperDetailsExp && (
                              <div className="mt-2 p-3 rounded-xl bg-black border border-slate-850 text-[10px] font-mono text-slate-400 overflow-x-auto max-h-[120px] scrollbar-thin">
                                {technicalErrorDetails}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                    ) : (
                      
                      /* REQUIREMENT 2: HIGH TECH DYNAMIC CONFIDENCE CHIP FLAGS */
                      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-800 bg-[#090f19]">
                        <div className="flex items-center gap-2">
                          {/* FAILED / ERROR STATE */}
                          {ocrError && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-full text-[10px] font-black uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse"></span>
                              <span>❌ OCR Failed</span>
                            </div>
                          )}

                          {/* HIGH CONFIDENCE 90%+ */}
                          {ocrConfidencePercent && ocrConfidencePercent >= 90 && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                              <span>🟢 High Confidence ({ocrConfidencePercent}%)</span>
                            </div>
                          )}

                          {/* MEDIUM CONFIDENCE 60% - 89% */}
                          {ocrConfidencePercent && ocrConfidencePercent >= 60 && ocrConfidencePercent < 90 && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/25 text-amber-400 rounded-full text-[10px] font-black uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                              <span>🟡 Medium Confidence ({ocrConfidencePercent}%)</span>
                            </div>
                          )}

                          {/* LOW CONFIDENCE <60% */}
                          {ocrConfidencePercent && ocrConfidencePercent < 60 && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-full text-[10px] font-black uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse"></span>
                              <span>🔴 Low Confidence ({ocrConfidencePercent}%)</span>
                            </div>
                          )}

                          {isQuestion ? (
                            <span className="text-[9px] font-mono text-indigo-400 px-2 py-0.5 rounded-md border border-indigo-505/20 bg-indigo-500/5">
                              Dynamic Task
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono text-slate-400 px-2 py-0.5 rounded-md border border-slate-800 bg-slate-900/50">
                              Plain Text
                            </span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={resetCaptured}
                            className="px-4 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[10px] uppercase font-black tracking-widest hover:bg-rose-500/25 transition cursor-pointer"
                          >
                            Retake / New Scan
                          </button>
                        </div>
                      </div>
                    )}

                    {/* CONFIDENCE INTERPRETATION NOTES */}
                    {!ocrError && ocrConfidenceReason && (
                      <p className="text-[11px] leading-relaxed text-slate-450 italic mt-0.5">
                        <strong className="text-indigo-400/80 font-mono text-[9px] tracking-wider uppercase mr-1">Assessment note:</strong> 
                        {ocrConfidenceReason}
                      </p>
                    )}

                    {/* TWO COLUMN GRID FOR OCR PREVIEW (LT) & EXTRACED TEXT ZONE (RT) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                      
                      {/* REQUIREMENT 6: OCR PREVIEW LEFT PANEL WITH INTERACTIVE OVERLAYS */}
                      <div className="md:col-span-6 space-y-3.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-450 block">
                            Interactive Selector:
                          </label>
                          {detectedQuestions.length > 1 && (
                            <span className="text-[10px] text-[#818cf8] font-black bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20 animate-pulse">
                              🎯 Click to Select Multiple
                            </span>
                          )}
                        </div>

                        {detectedQuestions.length > 1 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-800 bg-[#070c16] shadow-sm">
                            <div className="text-xs font-bold text-slate-300">
                              Selected Questions: <span className="text-indigo-400 font-extrabold">{selectedQuestionIds.length}</span> / {detectedQuestions.length}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleSelectAll}
                                className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500 hover:text-white transition cursor-pointer"
                              >
                                Select All
                              </button>
                              <button
                                type="button"
                                onClick={handleClearSelection}
                                className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded-lg bg-slate-800 border border-slate-750 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        )}
                        
                        <div className="border border-slate-850 rounded-2xl p-3 bg-[#0a101d] space-y-3 shadow-inner">
                          <div className="relative rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center bg-black">
                            <img
                              src={croppedImage || sourceImage || ""}
                              alt="Captured Source Image"
                              className="w-full h-auto max-h-[300px] object-contain block"
                            />
                            
                            {/* Overlay Questions Boxes if multiple questions exist */}
                            {detectedQuestions.length > 1 && detectedQuestions.map((q, idx) => {
                              const isSelected = selectedQuestionIds.includes(q.id);
                              return (
                                <button
                                  key={q.id}
                                  type="button"
                                  onClick={() => toggleQuestionSelection(q.id)}
                                  className={`absolute transition-all duration-300 rounded-lg flex items-center justify-center group ${
                                    isSelected
                                      ? "border-2 border-indigo-500 bg-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.5)] z-20"
                                      : "border border-dashed border-indigo-400/50 bg-indigo-500/5 hover:border-indigo-400 hover:bg-indigo-500/15 z-10 cursor-pointer"
                                  }`}
                                  style={{
                                    top: `${q.box.ymin}%`,
                                    left: `${q.box.xmin}%`,
                                    width: `${q.box.xmax - q.box.xmin}%`,
                                    height: `${q.box.ymax - q.box.ymin}%`,
                                  }}
                                  title={`Toggle Question ${idx + 1}`}
                                >
                                  {/* Visual numeric indicator badge on corner of box */}
                                  <span className={`absolute -top-2.5 -left-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase font-mono tracking-wider transition-all shadow ${
                                    isSelected
                                      ? "bg-indigo-500 text-white"
                                      : "bg-slate-900 border border-indigo-500/30 text-indigo-300 group-hover:bg-indigo-950 group-hover:text-indigo-200"
                                  }`}>
                                    Q{idx + 1}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Statistics grid values */}
                          <div className="space-y-2 text-[11px] font-mono text-slate-400 pt-1">
                            <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
                              <span className="text-slate-500">Confidence:</span>
                              <span className={`font-bold ${ocrConfidencePercent && ocrConfidencePercent >= 90 ? "text-emerald-400" : (ocrError ? "text-rose-400" : "text-amber-400")}`}>
                                {ocrConfidencePercent ? `${ocrConfidencePercent}%` : (ocrError ? "Failed" : "Pending")}
                              </span>
                            </div>

                            <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
                              <span className="text-slate-500">Questions Detected:</span>
                              <span className="font-bold text-slate-200">{detectedQuestions.length}</span>
                            </div>

                            <div className="flex flex-col gap-1">
                              <span className="text-slate-500">Symbols Detected:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {detectedMathSymbols.length === 0 ? (
                                  <span className="text-[10px] text-slate-600 font-sans italic">None found</span>
                                ) : (
                                  detectedMathSymbols.map((sym, i) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/35 text-indigo-400 font-mono text-[10px]">
                                      {sym}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* REQUIREMENT 4: EXTRACTED TEXT EDITOR BLOCK RIGHT PANEL */}
                      <div className="md:col-span-6 space-y-3.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black uppercase tracking-widest text-[#818cf8] block">
                            Extracted Question Area:
                          </label>
                          
                          {/* Char counter detail */}
                          <span className="text-[9px] font-mono text-slate-500 uppercase">
                            {extractedResult.length} Characters
                          </span>
                        </div>
                        
                        <div className="relative">
                          {/* REQUIREMENT 4: TEXTAREA EDITOR MODULE */}
                          <textarea
                            rows={6}
                            value={extractedResult}
                            onChange={(e) => setExtractedResult(e.target.value)}
                            placeholder="Your extracted question will appear here. You can edit, correct OCR mistakes, or manually type the question."
                            className="w-full font-medium rounded-2xl p-4.5 text-xs outline-none transition-all placeholder-slate-500 border border-slate-800 bg-slate-950 text-[#e2e8f0] focus:border-indigo-500 focus:shadow-[0_0_15px_rgba(99,102,241,0.15)] resize-none"
                          />
                          
                          {/* Mini shortcut float buttons */}
                          <div className="absolute bottom-3 right-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyText(extractedResult)}
                              className="p-1 px-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white hover:bg-slate-850 text-slate-400 transition text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer shadow-md"
                              title="Copy extracted logic payload"
                            >
                              <Copy className="w-3 h-3 text-indigo-400" />
                              <span>Copy</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setExtractedResult("")}
                              className="p-1 px-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-[#f87171] hover:bg-slate-850 text-slate-400 transition text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer shadow-md"
                              title="Wipe text string"
                            >
                              <Trash2 className="w-3 h-3 text-rose-450" />
                              <span>Clear</span>
                            </button>
                          </div>
                        </div>

                        {/* OCR CONFIDENCE USER MANAGE NOTICES */}
                        {ocrConfidence === "low" && !ocrError && (
                          <div className="p-3.5 rounded-xl border border-amber-950/45 bg-[#1a1209] text-amber-300 text-xs leading-relaxed flex gap-2.5">
                            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] opacity-95">
                              ⚠️ <strong>Text revision is suggested:</strong> Gemini flags this capture as lower confidence. 
                              Please fix any spelling, digits, operators (+, -, *, /) or decimal points in the textarea above manually prior to calculating.
                            </p>
                          </div>
                        )}
                      </div>

                    </div>

                    {/* REQUIREMENT 5: PRIMARY & SECONDARY ACTIONS MODULE */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-850/60">
                      
                      {/* Secondary buttons grid for files load & utilities */}
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadToSolver(false)}
                          className="py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800"
                        >
                          <FileText className="w-4 h-4 text-indigo-400" />
                          <span>{detectedQuestions.length > 1 ? "📋 Load Selected" : "📋 Load to Input"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyText(extractedResult)}
                          className="py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-800"
                        >
                          <Copy className="w-4 h-4 text-indigo-400" />
                          <span>📄 Copy Text</span>
                        </button>
                      </div>

                      {/* Primary Solver trigger */}
                      <button
                        type="button"
                        onClick={() => handleLoadToSolver(true)}
                        className="flex-1 py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/10 hover:from-emerald-700 hover:to-teal-600 transition-all scale-100 hover:scale-[1.01]"
                      >
                        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                        <span>{detectedQuestions.length > 1 ? "✨ Solve Selected" : "✨ Solve Immediately"}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                )}

              </div>

              {/* REQUIREMENT 9: FOOTER BANNER DESCRIPTION */}
              <div className="p-4.5 text-center text-[10px] font-sans border-t border-slate-850 bg-slate-950 text-slate-500 tracking-wide font-medium">
                Solviora OCR can recognize mathematics, physics, chemistry, logical reasoning, and word problems.
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
