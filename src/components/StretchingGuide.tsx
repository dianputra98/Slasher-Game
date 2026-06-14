import React, { useEffect, useRef, useState } from 'react';
import { TrackingSettings } from '../types';
import { soundManager } from './SoundManager';
import { Check, ShieldCheck, Flame, ArrowRight, Play, AlertCircle } from 'lucide-react';

interface StretchingProps {
  settings: TrackingSettings;
  onWarmupComplete: () => void;
  onExit: () => void;
}

interface StretchPose {
  id: string;
  title: string;
  instruction: string;
  color: string;
  targetEmoji: string;
  checkType: 'hands_up' | 'lean_left' | 'lean_right' | 'squat';
}

export default function StretchingGuide({ settings, onWarmupComplete, onExit }: StretchingProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopIdRef = useRef<number | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [poseIndex, setPoseIndex] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0); // 0 to 100%
  const [activeIntensity, setActiveIntensity] = useState(0);

  const poses: StretchPose[] = [
    {
      id: 'hands_up',
      title: 'SKY REACH STRETCH',
      instruction: 'Reach both your hands high up in the air! Simulates arm and core flex.',
      color: '#38bdf8', // Sky
      targetEmoji: '🙌',
      checkType: 'hands_up'
    },
    {
      id: 'lean_left',
      title: 'LATERAL LEAN LEFT',
      instruction: 'Lean your upper body toward the left side. Warms up obliques and spine.',
      color: '#a855f7', // Purple
      targetEmoji: '👈',
      checkType: 'lean_left'
    },
    {
      id: 'lean_right',
      title: 'LATERAL LEAN RIGHT',
      instruction: 'Lean your upper body toward the right side. Balances core flexibility.',
      color: '#eab308', // Yellow
      targetEmoji: '👉',
      checkType: 'lean_right'
    },
    {
      id: 'squat',
      title: 'DYNAMIC LIGHT SQUAT',
      instruction: 'Lower your body down into a gentle squat coordinate. Activates quadriceps.',
      color: '#f43f5e', // Rose
      targetEmoji: '🧘',
      checkType: 'squat'
    }
  ];

  const currentPose = poses[poseIndex];

  useEffect(() => {
    setupCamera();
    return () => {
      stopCamera();
      if (loopIdRef.current) cancelAnimationFrame(loopIdRef.current);
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const setupCamera = async (retries = 3, delay = 450) => {
    stopCamera();
    setCameraError(null);
    try {
      if (retries === 3) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });
      streamRef.current = ms;
      if (videoRef.current) {
        videoRef.current.srcObject = ms;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setCameraActive(true);
            startWarmupLoop();
          }).catch(playErr => {
            console.error("Video play failed:", playErr);
            if (retries > 0) {
              setTimeout(() => setupCamera(retries - 1, delay), delay);
            }
          });
        };
      }
    } catch (err: any) {
      console.error(`Camera access failed inside dynamic warm-up (retries left: ${retries}): `, err);
      if (retries > 0 && err.name !== 'NotAllowedError') {
        setTimeout(() => setupCamera(retries - 1, delay), delay);
      } else {
        setCameraError(
          err.name === 'NotAllowedError' 
            ? 'Permission denied. Please enable your camera to do dynamic warmups!'
            : 'Camera is currently busy or unavailable. Please click skip or refresh.'
        );
      }
    }
  };

  const startWarmupLoop = () => {
    if (loopIdRef.current) cancelAnimationFrame(loopIdRef.current);

    const gridW = 48;
    const gridH = 36;
    let prevFrame: Uint8ClampedArray | null = null;
    const motionGrid = new Uint8Array(gridW * gridH);

    // Track active points
    let smoothCentroidX = 320;
    let smoothCentroidY = 240;
    let smoothHandsY = 480;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const offCanvas = offCanvasRef.current;

      if (!video || !canvas || !offCanvas || video.paused || video.ended || video.readyState < 2) {
        loopIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const ctx = canvas.getContext('2d');
      const offCtx = offCanvas.getContext('2d');

      if (!ctx || !offCtx) {
        loopIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const cW = canvas.width;
      const cH = canvas.height;

      offCanvas.width = gridW;
      offCanvas.height = gridH;

      // Draw mirrored video downsampled
      offCtx.save();
      if (settings.mirrorMode) {
        offCtx.translate(gridW, 0);
        offCtx.scale(-1, 1);
      }
      offCtx.drawImage(video, 0, 0, gridW, gridH);
      offCtx.restore();

      const currentPixels = offCtx.getImageData(0, 0, gridW, gridH).data;

      let sumX = 0;
      let sumY = 0;
      let motionCount = 0;
      let maxMotionY = 0; // low coordinate
      let minMotionY = gridH; // high coordinate

      if (prevFrame) {
        for (let y = 0; y < gridH; y++) {
          for (let x = 0; x < gridW; x++) {
            const idx = (y * gridW + x) * 4;
            const diff = Math.abs(currentPixels[idx] - prevFrame[idx]) +
                         Math.abs(currentPixels[idx + 1] - prevFrame[idx + 1]) +
                         Math.abs(currentPixels[idx + 2] - prevFrame[idx + 2]);

            if (diff > settings.threshold) {
              motionGrid[y * gridW + x] = 255;
              sumX += x;
              sumY += y;
              motionCount++;

              if (y > maxMotionY) maxMotionY = y;
              if (y < minMotionY) minMotionY = y;
            } else {
              motionGrid[y * gridW + x] = Math.max(0, motionGrid[y * gridW + x] - 15);
            }
          }
        }
      }

      prevFrame = currentPixels;

      // Convert captured info
      const intensity = Math.min(100, Math.floor((motionCount / (gridW * gridH)) * 500));
      setActiveIntensity(intensity);

      // Centroid math mapping to actual size
      if (motionCount > 5) {
        const targetX = (sumX / motionCount) / gridW * cW;
        const targetY = (sumY / motionCount) / gridH * cH;
        const targetMinY = (minMotionY / gridH) * cH;

        smoothCentroidX += (targetX - smoothCentroidX) * 0.15;
        smoothCentroidY += (targetY - smoothCentroidY) * 0.15;
        smoothHandsY += (targetMinY - smoothHandsY) * 0.2; // tracking high hand points
      }

      // 1. Draw camera feed as background with lower opacity
      ctx.clearRect(0, 0, cW, cH);
      ctx.save();
      if (settings.mirrorMode) {
        ctx.translate(cW, 0);
        ctx.scale(-1, 1);
      }
      ctx.globalAlpha = 0.45;
      ctx.drawImage(video, 0, 0, cW, cH);
      ctx.restore();

      // 2. Render beautiful neon motion overlay pixels
      if (settings.showMotionMap) {
        ctx.fillStyle = 'rgba(14, 165, 233, 0.4)'; // glowing sky color
        for (let y = 0; y < gridH; y++) {
          for (let x = 0; x < gridW; x++) {
            const opacity = motionGrid[y * gridW + x] / 255;
            if (opacity > 0.15) {
              ctx.save();
              ctx.globalAlpha = opacity * 0.55;
              const rX = (x / gridW) * cW;
              const rY = (y / gridH) * cH;
              const pixelW = cW / gridW;
              const pixelH = cH / gridH;
              ctx.beginPath();
              ctx.arc(rX + pixelW / 2, rY + pixelH / 2, pixelW * 0.8, 0, Math.PI * 2);
              ctx.fillStyle = currentPose.color;
              ctx.fill();
              ctx.restore();
            }
          }
        }
      }

      // Check pose achievements
      let currentlyAchieving = false;
      const poseType = currentPose.checkType;

      if (poseType === 'hands_up') {
        // High motion (close to top of screen, e.g. Y < 33% of height)
        currentlyAchieving = smoothHandsY < cH * 0.35 && motionCount > 8;
      } else if (poseType === 'lean_left') {
        // Centroid shifts left side (< 40% of screen width)
        currentlyAchieving = smoothCentroidX < cW * 0.43 && motionCount > 8;
      } else if (poseType === 'lean_right') {
        // Centroid shifts right side (> 60% of screen width)
        currentlyAchieving = smoothCentroidX > cW * 0.57 && motionCount > 8;
      } else if (poseType === 'squat') {
        // Centroid falls downward (> 60% of vertical depth)
        currentlyAchieving = smoothCentroidY > cH * 0.62 && motionCount > 8;
      }

      // Progress accumulation
      if (currentlyAchieving) {
        setHoldProgress(p => {
          const next = p + 2.5; // reaches 100 in 40 frames (~0.6 seconds of hold strength)
          if (next >= 100) {
            soundManager.playStretchingSuccess();
            // Go to next pose or complete
            setTimeout(() => {
              setPoseIndex(curIdx => {
                const nextIdx = curIdx + 1;
                if (nextIdx >= poses.length) {
                  onWarmupComplete();
                }
                return nextIdx;
              });
              setHoldProgress(0);
            }, 100);
            return 100;
          }
          return next;
        });
      } else {
        setHoldProgress(p => Math.max(0, p - 1.5)); // slight cooling down
      }

      // Draw aesthetic overlay markers for pose guidance
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = currentPose.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = currentPose.color;

      // Draw Target Boundaries or indicators based on Pose type
      if (poseType === 'hands_up') {
        // High-level bar
        ctx.beginPath();
        ctx.moveTo(0, cH * 0.35);
        ctx.lineTo(cW, cH * 0.35);
        ctx.stroke();

        // Arrow icons floating high
        ctx.fillStyle = currentPose.color;
        ctx.font = '28px sans-serif';
        ctx.fillText('⬆️', cW / 2 - 14, cH * 0.22);
      } else if (poseType === 'lean_left') {
        // Vertical left box
        ctx.strokeRect(20, 20, cW * 0.4, cH - 40);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
        ctx.fillRect(20, 20, cW * 0.4, cH - 40);

        ctx.fillStyle = currentPose.color;
        ctx.font = '28px sans-serif';
        ctx.fillText('⬅️', cW * 0.2 - 14, cH / 2);
      } else if (poseType === 'lean_right') {
        // Vertical right box
        ctx.strokeRect(cW * 0.6, 20, cW * 0.4 - 20, cH - 40);
        ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
        ctx.fillRect(cW * 0.6, 20, cW * 0.4 - 20, cH - 40);

        ctx.fillStyle = currentPose.color;
        ctx.font = '28px sans-serif';
        ctx.fillText('➡️', cW * 0.8 - 14, cH / 2);
      } else if (poseType === 'squat') {
        // Low horizontals
        ctx.beginPath();
        ctx.moveTo(0, cH * 0.6);
        ctx.lineTo(cW, cH * 0.6);
        ctx.stroke();

        ctx.fillStyle = currentPose.color;
        ctx.font = '28px sans-serif';
        ctx.fillText('⬇️ SQUAT DOWN', cW / 2 - 100, cH * 0.75);
      }

      // Draw smooth tracking centroid tracker (glowing neon circle)
      ctx.beginPath();
      ctx.arc(smoothCentroidX, smoothCentroidY, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = currentPose.color;
      ctx.stroke();

      // Hand tracker visualizer in sky stretch
      if (poseType === 'hands_up') {
        ctx.beginPath();
        ctx.arc(cW / 2, smoothHandsY, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();

      loopIdRef.current = requestAnimationFrame(tick);
    };

    tick();
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto items-center relative z-10" id="warmup-screen">
      {/* Upper Status Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full px-2">
        <div className="glass rounded-2xl p-4 flex items-center justify-between select-none border border-sky-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-500/10 rounded-full flex items-center justify-center border border-sky-400/30">
              <span className="text-xl animate-pulse">🧘</span>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">FITNESS CORE</p>
              <h4 className="text-sm font-black text-white uppercase tracking-tight">DYNAMIC WARM-UP ACTIVE</h4>
            </div>
          </div>
          <span className="text-[10px] bg-sky-500/20 text-sky-400 border border-sky-500/30 px-3 py-1 rounded-full font-bold uppercase tracking-widest">
            {poseIndex + 1} / {poses.length} POSES
          </span>
        </div>

        <div className="glass rounded-2xl p-4 flex items-center justify-between select-none border border-rose-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-400/10 rounded-full flex items-center justify-center border border-amber-400/30">
              <Flame className="w-5 h-5 text-amber-400 animate-bounce" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">CALORIES BOOSTER</p>
              <h4 className="text-sm font-black text-amber-400 uppercase tracking-tight">+5.0 KCAL BONUS OUTCOME</h4>
            </div>
          </div>
          <button 
            onClick={onWarmupComplete}
            className="flex items-center gap-1.5 text-xs font-black bg-white/5 border border-white/10 hover:bg-white/10 text-white px-3 py-1.5 rounded-xl uppercase tracking-wider cursor-pointer"
            id="btn-skip-warmup"
          >
            SKIP WARMUP <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Guidance Banner */}
      <div className="w-full glass rounded-[32px] p-6 border border-white/10 text-center select-none shadow-xl flex flex-col items-center">
        <div 
          className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-3 border font-extrabold shadow-lg"
          style={{ 
            backgroundColor: `${currentPose.color}25`, 
            borderColor: `${currentPose.color}60`,
            boxShadow: `0 0 15px ${currentPose.color}20` 
          }}
        >
          {currentPose.targetEmoji}
        </div>
        <h2 
          className="text-2xl font-black italic tracking-tight uppercase"
          style={{ color: currentPose.color }}
        >
          {currentPose.title}
        </h2>
        <p className="text-sm text-slate-350 mt-1.5 max-w-lg mx-auto">
          {currentPose.instruction}
        </p>

        {/* Action holding feedback meter */}
        <div className="w-full max-w-md mt-4">
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="font-bold text-slate-450 uppercase tracking-wider">POSTURE LOCK HOLD:</span>
            <span className="font-mono font-black" style={{ color: currentPose.color }}>{Math.floor(holdProgress)}% MATCHED</span>
          </div>
          <div className="h-3 bg-white/5 border border-white/10 rounded-full overflow-hidden p-0.5">
            <div 
              className="h-full rounded-full transition-all duration-75"
              style={{ 
                width: `${holdProgress}%`, 
                backgroundColor: currentPose.color,
                boxShadow: `0 0 10px ${currentPose.color}`
              }}
            />
          </div>
        </div>
      </div>

      {/* Viewport Frame */}
      <div className="relative w-full aspect-[4/3] max-w-3xl bg-slate-950/80 rounded-[32px] overflow-hidden border border-white/15 shadow-2 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
        <video 
          ref={videoRef}
          className="hidden"
          playsInline
          muted
        />
        <canvas 
          ref={canvasRef}
          width="640"
          height="480"
          className="w-full h-full object-cover rounded-[30px]"
        />
        <canvas 
          ref={offCanvasRef}
          className="hidden"
        />

        {/* Wave detection warning fallback overlay */}
        {activeIntensity < 4 && (
          <div className="absolute inset-x-0 bottom-8 mx-auto max-w-xs bg-amber-950/90 border border-amber-800/50 backdrop-blur-md px-4 py-3 rounded-2xl flex items-center gap-3 shadow-2xl animate-bounce select-none pointer-events-none">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-xs text-slate-200 font-bold uppercase tracking-wide">
              No motion detected! Move in front of camera
            </p>
          </div>
        )}

        {/* Mirror indicator tag */}
        <span className="absolute top-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[9px] text-slate-400 font-bold uppercase tracking-widest border border-white/5 select-none">
          CAMERA TRACK {settings.mirrorMode ? 'MIRRORED' : 'STANDARD'}
        </span>
      </div>

      <div className="w-full flex justify-center pb-4">
        <button 
          onClick={onExit}
          className="bg-white/5 hover:bg-white/10 text-white font-extrabold px-6 py-3 rounded-xl border border-white/10 uppercase tracking-widest text-xs transition duration-150 cursor-pointer"
          id="btn-warmup-abort"
        >
          QUIT WARMUP
        </button>
      </div>
    </div>
  );
}
