import { useEffect, useRef } from "react";
import { motion } from "motion/react";

interface SplashScreenProps {
  onComplete: () => void;
  key?: string;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Trigger onComplete after 2.8s total duration
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  // Subtle space particles simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Initialize premium soft particles
    const particleCount = 45;
    const particles: Array<{
      x: number;
      y: number;
      radius: number;
      vx: number;
      vy: number;
      alpha: number;
      targetAlpha: number;
      speed: number;
    }> = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2 + 0.8,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        alpha: Math.random() * 0.5 + 0.1,
        targetAlpha: Math.random() * 0.6 + 0.2,
        speed: 0.005 + Math.random() * 0.01,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Create ambient radial light glowing elements
      // Upper Right Pink Glow
      const glow1 = ctx.createRadialGradient(
        width * 0.7,
        height * 0.3,
        0,
        width * 0.7,
        height * 0.3,
        width * 0.5
      );
      glow1.addColorStop(0, "rgba(225, 0, 255, 0.04)");
      glow1.addColorStop(1, "rgba(15, 0, 24, 0)");
      ctx.fillStyle = glow1;
      ctx.fillRect(0, 0, width, height);

      // Bottom Left Indigo Glow
      const glow2 = ctx.createRadialGradient(
        width * 0.2,
        height * 0.8,
        0,
        width * 0.2,
        height * 0.8,
        width * 0.6
      );
      glow2.addColorStop(0, "rgba(126, 87, 255, 0.05)");
      glow2.addColorStop(1, "rgba(15, 0, 24, 0)");
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, width, height);

      // Render the stars/particles with elegant soft pulsing
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around boundaries
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Pulsing opacity
        p.alpha += (p.targetAlpha - p.alpha) * p.speed;
        if (Math.abs(p.alpha - p.targetAlpha) < 0.01) {
          p.targetAlpha = Math.random() * 0.7 + 0.1;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        // Soft outer shadow style glow for slightly larger particles
        if (p.radius > 2.0) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = "rgba(126, 87, 255, 0.6)";
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fill();
      }

      ctx.shadowBlur = 0; // Reset
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <motion.div
      id="solviora-splash-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      style={{
        background: "radial-gradient(circle at center, rgba(140, 20, 37, 0.18) 0%, rgba(15, 0, 24, 1) 100%)",
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0F0018]"
    >
      {/* Particle Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-10"
        style={{ mixBlendMode: "screen" }}
      />

      {/* Centerpiece Branding Container */}
      <div className="relative z-20 flex flex-col items-center text-center px-6">
        
        {/* Soft Radial Backlight for the Logo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* 1. Logo scale + fade */}
        <motion.div
          id="splash-logo-container"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.3,
            duration: 0.9,
            ease: [0.16, 1, 0.3, 1], // premium custom ease-out
          }}
          className="relative w-44 h-44 flex items-center justify-center rounded-full"
        >
          {/* Logo Glowing Ring backplate */}
          <div className="absolute inset-2 rounded-full border border-indigo-500/10 bg-indigo-950/20 shadow-[0_0_40px_rgba(126,87,255,0.15)] backdrop-blur-sm" />

          {/* Precision vector SVG mapping Solviora (Neural S Solver Logo) */}
          <svg
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full relative z-10 drop-shadow-[0_0_20px_rgba(14,165,233,0.35)]"
          >
            <defs>
              {/* Vibrant neon cyan to purple gradient for the 'S' body */}
              <linearGradient id="sBodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00F2FE" />
                <stop offset="60%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#D946EF" />
              </linearGradient>

              {/* Glowing orbital neon path gradient */}
              <linearGradient id="orbitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#9333EA" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
              </linearGradient>

              {/* Holographic light for brain circuit paths */}
              <linearGradient id="neuralPathGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#06B6D4" />
                <stop offset="100%" stopColor="#6366F1" />
              </linearGradient>
            </defs>

            {/* Glowing thin orbit sweeps from bottom left to top right */}
            <path
              d="M 52 148 C 30 115, 30 75, 60 52 C 90 30, 140 38, 162 70 C 172 85, 175 105, 172 122 C 168 140, 155 155, 138 162 C 115 172, 85 168, 68 152"
              stroke="url(#orbitGradient)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="4 2"
            />

            {/* Glowing Stars / Sparkles at Top Right */}
            {/* Primary Star */}
            <path
              d="M 156 36 L 159.5 45 L 168 48.5 L 159.5 52 L 156 61 L 152.5 52 L 144 48.5 L 152.5 45 Z"
              fill="#D946EF"
              className="animate-pulse"
              style={{ animationDuration: "2s" }}
            />
            {/* Secondary Star */}
            <path
              d="M 172 58 L 174 63 L 179 65 L 174 67 L 172 72 L 170 67 L 165 65 L 170 63 Z"
              fill="#60A5FA"
              className="animate-pulse"
              style={{ animationDuration: "1.5s" }}
            />

            {/* Brain circuit node connectors (glowing nodes) on the left side */}
            <g id="neural-brain-overlay" opacity="0.9">
              {/* Connector paths */}
              <path d="M 44 80 Q 56 82 66 75" stroke="url(#neuralPathGradient)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M 42 98 C 50 98, 54 94, 68 91" stroke="url(#neuralPathGradient)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M 46 116 Q 58 112 68 108" stroke="url(#neuralPathGradient)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M 48 132 C 55 132, 60 125, 75 125" stroke="url(#neuralPathGradient)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M 58 145 Q 68 140 82 136" stroke="url(#neuralPathGradient)" strokeWidth="1.5" strokeLinecap="round" />
              
              {/* Brain node circles with glow */}
              <circle cx="44" cy="80" r="3.5" fill="#22D3EE" />
              <circle cx="44" cy="80" r="1.5" fill="#FFFFFF" />

              <circle cx="42" cy="98" r="3" fill="#38BDF8" />
              <circle cx="42" cy="98" r="1" fill="#FFFFFF" />

              <circle cx="46" cy="116" r="3.5" fill="#60A5FA" />
              <circle cx="46" cy="116" r="1.5" fill="#FFFFFF" />

              <circle cx="48" cy="132" r="3" fill="#818CF8" />
              <circle cx="48" cy="132" r="1" fill="#FFFFFF" />

              <circle cx="58" cy="145" r="4" fill="#A78BFA" />
              <circle cx="58" cy="145" r="2" fill="#FFFFFF" />

              {/* Inner cerebral circuit details */}
              <circle cx="54" cy="68" r="2" fill="#22D3EE" opacity="0.8" />
              <circle cx="64" cy="62" r="2" fill="#22D3EE" opacity="0.8" />
            </g>

            {/* Central Fluid S Ribbon, crafted for beautiful high-end shape */}
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
              fill="url(#sBodyGradient)"
            />

            {/* Ambient Math operators inside loops */}
            <g id="math-operators" opacity="0.85">
              {/* Plus (+) in top-right inner space */}
              <path d="M 120 78 H 128 M 124 74 V 82" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
              {/* Minus (-) in mid-right space */}
              <path d="M 143 103 H 151" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
              {/* Multiply (x) in bottom-left space */}
              <path d="M 100 120 L 106 126 M 106 120 L 100 126" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
              {/* Divide (÷) in bottom-mid-right space */}
              <path d="M 117 136 H 125 M 121 132 A 0.8 0.8 0 1 1 121 133 M 121 140 A 0.8 0.8 0 1 1 121 141" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
            </g>
          </svg>
        </motion.div>

        {/* 2. SOLVIORA App Name - glowing into view under the logo */}
        <motion.h2
          id="splash-app-name"
          initial={{ opacity: 0, filter: "blur(6px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{
            delay: 0.7,
            duration: 0.9,
            ease: "easeOut",
          }}
          style={{
            letterSpacing: "0.45em",
            textShadow: "0px 0px 24px rgba(126,87,255,0.7)",
            paddingLeft: "0.45em" // offset the letter spacing to center the text perfectly
          }}
          className="mt-6 text-3xl sm:text-4xl font-black font-display text-white tracking-[0.45em]"
        >
          SOLVIORA
        </motion.h2>

        {/* 3. Tagline - fades in after 500ms delay following name onset */}
        <motion.p
          id="splash-app-tagline"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 1.2, // 500ms after the app name onset (0.7s) -> 1.2s
            duration: 0.8,
            ease: "easeOut",
          }}
          className="mt-4 max-w-sm text-xs sm:text-sm font-medium text-white/75 leading-relaxed tracking-wide"
        >
          Illuminate Solutions. Simplify Possibilities.
        </motion.p>
      </div>

      {/* Decorative premium corner grid notches */}
      <div className="absolute top-8 left-8 text-white/5 font-mono text-[9px] tracking-widest uppercase select-none pointer-events-none">
        SLV_SYS_ON // VER 1.0.3
      </div>
      <div className="absolute bottom-8 right-8 text-white/5 font-mono text-[9px] tracking-widest uppercase select-none pointer-events-none">
        INC_GRID_ACTIVE
      </div>
    </motion.div>
  );
}
