import React, { useEffect, useRef, useState } from 'react';
import { 
  Particle, 
  FloatingText, 
  GameStats, 
  GameStatus, 
  TrackingSettings, 
  Point 
} from '../types';
import { soundManager } from './SoundManager';
import { Shield, Sparkles, Activity, AlertCircle, Volume2, VolumeX, Eye, EyeOff, CheckCircle, Scale, Compass } from 'lucide-react';

interface GameProps {
  status: GameStatus;
  settings: TrackingSettings;
  setSettings: React.Dispatch<React.SetStateAction<TrackingSettings>>;
  onGameEnd: (stats: GameStats) => void;
  onGameStart: () => void;
  backToMenu: () => void;
}

interface BalanceTarget {
  id: string;
  x: number;
  y: number;
  vy: number;
  radius: number;
  color: string;
  emoji: string;
  side: 'left' | 'right';
  isCaught: boolean;
  spawnTime: number;
}

export default function BalanceTrainerEngine({
  status,
  settings,
  setSettings,
  onGameEnd,
  onGameStart,
  backToMenu
}: GameProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [motionIntensity, setMotionIntensity] = useState<number>(0);
  const [isMotionDetectedGlobally, setIsMotionDetectedGlobally] = useState<boolean>(true);
  const isMotionDetectedGloballyRef = useRef<boolean>(true);
  
  // Real-time balance and safety guides
  const [postureFeedback, setPostureFeedback] = useState<string>("Inisialisasi core alignment...");
  const [balanceOffset, setBalanceOffset] = useState<number>(50); // 0 (left) to 100 (right), 50 is center

  const [stats, setStats] = useState<GameStats>({
    score: 0,
    lives: 3,
    sliceCount: 0,
    comboCount: 0,
    maxCombo: 0,
    bombsHit: 0,
    highscore: parseInt(localStorage.getItem('balance_highscore') || '0'),
    accuracy: 100,
    fruitsSpawned: 0,
    caloriesBurned: 0,
    sessionTime: 60,
    squatsCount: 0,
    reactionTimes: [],
    movementStreak: 0,
    maxStreak: 0,
    totalBaloonPops: 0,
    avgBalanceStability: 100
  });

  const statsRef = useRef<GameStats>({ ...stats });
  const targetsRef = useRef<BalanceTarget[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const settingsRef = useRef<TrackingSettings>(settings);
  const stateStatusRef = useRef<GameStatus>(status);
  const coreCentroidRef = useRef<{ x: number; y: number; lastActive: number }>({ x: 320, y: 240, lastActive: Date.now() });

  // Stability counters
  const postureSamplesRef = useRef<number[]>([]);
  const lastMotionDetectedTimeRef = useRef<number>(Date.now());
  const gameLoopIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const secondsTimerRef = useRef<number>(60);
  const lastSecondUpdateRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);

  const guidanceTexts = [
    "Core Stabil! 🧘",
    "Keseimbangan Prima! 💎",
    "Sangat Anggun! ✨",
    "Bagus sekali! 👍",
    "Rehab Sempurna! 💚",
    "Sway Teratur! 🌀",
    "Sangat Aman! 🛡️"
  ];

  const targetEmojis = ["🌟", "💎", "🔋", "🧬", "🧘"];
  const targetColors = [
    "rgba(34, 211, 238, 0.7)",  // cyan
    "rgba(52, 211, 153, 0.7)",  // emerald
    "rgba(167, 139, 250, 0.7)", // purple
    "rgba(251, 191, 36, 0.7)"   // amber
  ];

  useEffect(() => {
    settingsRef.current = settings;
    soundManager.setEnabled(settings.soundEnabled);
  }, [settings]);

  useEffect(() => {
    stateStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status === 'PLAYING') {
      const savedHigh = parseInt(localStorage.getItem('balance_highscore') || '0');
      secondsTimerRef.current = settings.therapyLevel === 'rehab' ? 95 : 60;

      const freshStats: GameStats = {
        score: 0,
        lives: settings.therapyLevel === 'normal' ? 3 : 5,
        sliceCount: 0,
        comboCount: 0,
        maxCombo: 0,
        bombsHit: 0,
        highscore: savedHigh,
        accuracy: 100,
        fruitsSpawned: 0,
        caloriesBurned: 0,
        sessionTime: secondsTimerRef.current,
        squatsCount: 0,
        reactionTimes: [],
        movementStreak: 0,
        maxStreak: 0,
        totalBaloonPops: 0,
        avgBalanceStability: 100
      };

      setStats(freshStats);
      statsRef.current = freshStats;
      targetsRef.current = [];
      particlesRef.current = [];
      floatingTextsRef.current = [];
      postureSamplesRef.current = [];
      lastSpawnTimeRef.current = Date.now();
      lastSecondUpdateRef.current = Date.now();
      lastMotionDetectedTimeRef.current = Date.now();
      setIsMotionDetectedGlobally(true);
    }
  }, [status]);

  useEffect(() => {
    setupWebcam();
    return () => {
      stopWebcam();
      if (gameLoopIdRef.current) {
        cancelAnimationFrame(gameLoopIdRef.current);
      }
    };
  }, []);

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const setupWebcam = async (retries = 3, delay = 450) => {
    stopWebcam();
    setCameraError(null);
    try {
      if (retries === 3) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setCameraActive(true);
            startLoop();
          }).catch(playErr => {
            console.error("Video play failed:", playErr);
            if (retries > 0) {
              setTimeout(() => setupWebcam(retries - 1, delay), delay);
            }
          });
        };
      }
    } catch (err: any) {
      console.error(`Camera init failure inside BalanceTrainerEngine (retries left: ${retries}):`, err);
      if (retries > 0 && err.name !== 'NotAllowedError') {
        setTimeout(() => setupWebcam(retries - 1, delay), delay);
      } else {
        setCameraError(
          err.name === 'NotAllowedError'
            ? "Akses kamera ditolak. Silakan izinkan kamera pada browser Anda."
            : "Kamera sedang sibuk atau tidak terdeteksi. Silakan coba hubungkan ulang."
        );
      }
    }
  };

  const spawnTarget = (cW: number) => {
    const isTherapy = settingsRef.current.therapyLevel !== 'normal';
    
    // Therapy level target parameters (huge size and ultra safe velocity parameters)
    let radius = 35;
    if (settingsRef.current.therapyLevel === 'rehab' || settingsRef.current.therapyLevel === 'senior') {
      radius = 55;
    } else if (settingsRef.current.therapyLevel === 'beginner') {
      radius = 45;
    }

    let fallingVelocity = 1.3;
    if (settingsRef.current.therapyLevel === 'rehab') fallingVelocity = 0.65;
    else if (settingsRef.current.therapyLevel === 'senior') fallingVelocity = 0.85;
    else if (settingsRef.current.therapyLevel === 'beginner') fallingVelocity = 1.1;

    // Side selection
    const side: 'left' | 'right' = Math.random() > 0.5 ? 'left' : 'right';
    
    // Align coordinates so left falls on LHS of workspace, right falls RHS
    const xCoord = side === 'left' 
      ? radius + Math.random() * (cW * 0.40 - radius) 
      : (cW * 0.60) + Math.random() * (cW * 0.40 - radius);

    const chosenColor = targetColors[Math.floor(Math.random() * targetColors.length)];
    const chosenEmoji = targetEmojis[Math.floor(Math.random() * targetEmojis.length)];

    const newTarget: BalanceTarget = {
      id: `baltarget-${Date.now()}-${Math.random()}`,
      x: xCoord,
      y: -40,
      vy: fallingVelocity,
      radius,
      color: chosenColor,
      emoji: chosenEmoji,
      side,
      isCaught: false,
      spawnTime: Date.now()
    };

    targetsRef.current.push(newTarget);
    statsRef.current.fruitsSpawned++;
  };

  const startLoop = () => {
    if (gameLoopIdRef.current) cancelAnimationFrame(gameLoopIdRef.current);

    const gridW = 48;
    const gridH = 36;
    let prevFrameData: Uint8ClampedArray | null = null;
    const motionGrid = new Uint8Array(gridW * gridH);

    const tick = () => {
      const video = videoRef.current;
      const mainCanvas = mainCanvasRef.current;
      const offCanvas = offscreenCanvasRef.current;

      if (!video || !mainCanvas || video.paused || video.ended || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        gameLoopIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const ctx = mainCanvas.getContext('2d');
      const offCtx = offCanvas?.getContext('2d');

      if (!ctx || !offCanvas || !offCtx) {
        gameLoopIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const cW = mainCanvas.width;
      const cH = mainCanvas.height;
      const now = Date.now();

      offCanvas.width = gridW;
      offCanvas.height = gridH;

      offCtx.save();
      if (settingsRef.current.mirrorMode) {
        offCtx.translate(gridW, 0);
        offCtx.scale(-1, 1);
      }
      offCtx.drawImage(video, 0, 0, gridW, gridH);
      offCtx.restore();

      const currentFrame = offCtx.getImageData(0, 0, gridW, gridH);
      const currPixels = currentFrame.data;

      let sumX = 0;
      let sumY = 0;
      let motionCount = 0;
      let processedIntensity = 0;

      if (prevFrameData) {
        const baseThreshold = settingsRef.current.threshold;
        for (let y = 0; y < gridH; y++) {
          for (let x = 0; x < gridW; x++) {
            const idx = (y * gridW + x) * 4;
            const diff = Math.abs(currPixels[idx] - prevFrameData[idx]) +
                         Math.abs(currPixels[idx + 1] - prevFrameData[idx + 1]) +
                         Math.abs(currPixels[idx + 2] - prevFrameData[idx + 2]);

            if (diff > baseThreshold) {
              motionGrid[y * gridW + x] = 255;
              processedIntensity++;
              sumX += x;
              sumY += y;
              motionCount++;
            } else {
              motionGrid[y * gridW + x] = Math.max(0, motionGrid[y * gridW + x] - 12);
            }
          }
        }
      }

      prevFrameData = currPixels;

      // Filter and compute torso balance centroid center
      let targetX = coreCentroidRef.current.x;
      let targetY = coreCentroidRef.current.y;

      if (motionCount > 8) {
        targetX = (sumX / motionCount) / gridW * cW;
        targetY = (sumY / motionCount) / gridH * cH;
        coreCentroidRef.current.x += (targetX - coreCentroidRef.current.x) * 0.12; // High smoothing for postural comfort!
        coreCentroidRef.current.y += (targetY - coreCentroidRef.current.y) * 0.12;
        coreCentroidRef.current.lastActive = now;
      }

      // Check balance alignment percentage
      const normalizedSway = Math.max(0, Math.min(100, Math.round((coreCentroidRef.current.x / cW) * 100)));
      setBalanceOffset(normalizedSway);

      // Log centroid samples for average stability percentage calculation
      postureSamplesRef.current.push(normalizedSway);
      if (postureSamplesRef.current.length > 300) {
        postureSamplesRef.current.shift();
      }

      // Track stability percentage (less volatility stands for stronger stability score!)
      if (postureSamplesRef.current.length > 40) {
        const mean = postureSamplesRef.current.reduce((a, b) => a + b, 0) / postureSamplesRef.current.length;
        const variance = postureSamplesRef.current.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / postureSamplesRef.current.length;
        const dev = Math.sqrt(variance);
        // Map deviation onto 100% Core Stability scale (5px dev ~ 90% stability)
        const stabilityScore = Math.max(20, Math.min(100, Math.round(100 - (dev * 5.5))));
        statsRef.current.avgBalanceStability = stabilityScore;
      }

      // Live Posture Warning systems
      const motionPct = Math.min(100, Math.floor((processedIntensity / (gridW * gridH)) * 400));
      setMotionIntensity(motionPct);

      if (stateStatusRef.current === 'PLAYING') {
        statsRef.current.caloriesBurned += 0.00025 + (motionPct * 0.00003);
      }

      if (motionPct > 3) {
        lastMotionDetectedTimeRef.current = now;
        if (!isMotionDetectedGloballyRef.current) {
          isMotionDetectedGloballyRef.current = true;
          setIsMotionDetectedGlobally(true);
        }
      } else {
        if (now - lastMotionDetectedTimeRef.current > 4200) {
          if (isMotionDetectedGloballyRef.current) {
            isMotionDetectedGloballyRef.current = false;
            setIsMotionDetectedGlobally(false);
          }
        }
      }

      // Check sway limits (Safety Alert for high risk or unstable movements)
      if (normalizedSway < 18 || normalizedSway > 82) {
        setPostureFeedback("⚠️ SWAY TERLALU JAUH! Kembalilah ke posisi berdiri tegak secara perlahan.");
      } else if (normalizedSway > 38 && normalizedSway < 62) {
        setPostureFeedback("✅ CENTERED! Core alignment Anda sempurna dan seimbang.");
      } else {
        setPostureFeedback("🔄 LEANING ACTIVE! Keseimbangan dinamis aktif melatih sendi core.");
      }

      // Draw mirrored background webcam
      ctx.save();
      if (settingsRef.current.mirrorMode) {
        ctx.translate(cW, 0);
        ctx.scale(-1, 1);
      }
      ctx.globalAlpha = settingsRef.current.videoOpacity;
      ctx.drawImage(video, 0, 0, cW, cH);
      ctx.restore();

      // Draw heat points
      if (settingsRef.current.showMotionMap) {
        ctx.save();
        const blockW = cW / gridW;
        const blockH = cH / gridH;
        for (let y = 0; y < gridH; y++) {
          for (let x = 0; x < gridW; x++) {
            const opacity = motionGrid[y * gridW + x];
            if (opacity > 30) {
              const rX = settingsRef.current.mirrorMode ? (gridW - 1 - x) : x;
              ctx.fillStyle = `rgba(14, 165, 233, ${opacity / 255 * 0.40})`; // Sky theme map
              ctx.beginPath();
              ctx.arc(rX * blockW + blockW/2, y * blockH + blockH/2, blockW / 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        ctx.restore();
      }

      // Draw Center Posture Grid Guide (Zero-Sensing UI)
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      // Verticals split
      ctx.beginPath();
      ctx.moveTo(cW * 0.40, 0);
      ctx.lineTo(cW * 0.40, cH);
      ctx.moveTo(cW * 0.60, 0);
      ctx.lineTo(cW * 0.60, cH);
      ctx.stroke();

      // Active posture balance compass bar at bottom
      const barY = cH - 45;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(cW * 0.15, barY - 12, cW * 0.70, 24);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cW * 0.15, barY - 12, cW * 0.70, 24);

      // Dead-center guide
      ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.fillRect(cW * 0.42, barY - 10, cW * 0.16, 20);

      // Draw bubble pointer at core centroid X offset
      const pointerX = cW * 0.15 + (normalizedSway / 100) * (cW * 0.70);
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#10b981';
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(pointerX, barY, 13, 0, Math.PI * 2);
      ctx.fill();

      // Specular shine on core bubble and label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(normalizedSway < 15 ? "⚠️" : (normalizedSway > 85 ? "⚠️" : "🧘"), pointerX, barY);
      ctx.restore();

      // Spawning objects
      if (stateStatusRef.current === 'PLAYING') {
        const timeSinceLastSpawn = now - lastSpawnTimeRef.current;
        let spawnInterval = 1900;
        
        if (settingsRef.current.therapyLevel === 'rehab') spawnInterval = 3400;
        else if (settingsRef.current.therapyLevel === 'senior') spawnInterval = 2800;
        else if (settingsRef.current.therapyLevel === 'beginner') spawnInterval = 2200;

        if (timeSinceLastSpawn >= spawnInterval) {
          spawnTarget(cW);
          lastSpawnTimeRef.current = now;
        }

        // Ticker clocked
        if (now - lastSecondUpdateRef.current >= 1000) {
          secondsTimerRef.current = Math.max(0, secondsTimerRef.current - 1);
          statsRef.current.sessionTime = secondsTimerRef.current;
          lastSecondUpdateRef.current = now;

          if (secondsTimerRef.current <= 0) {
            const totalCals = parseFloat(localStorage.getItem('arcade_total_calories') || '0');
            localStorage.setItem('arcade_total_calories', (totalCals + statsRef.current.caloriesBurned).toFixed(2));
            
            // Register score
            const currentHigh = parseInt(localStorage.getItem('balance_highscore') || '0');
            if (statsRef.current.score > currentHigh) {
              localStorage.setItem('balance_highscore', statsRef.current.score.toString());
            }

            // Accuracy
            statsRef.current.accuracy = statsRef.current.fruitsSpawned > 0 
              ? Math.round((statsRef.current.sliceCount / statsRef.current.fruitsSpawned) * 100)
              : 100;

            onGameEnd(statsRef.current);
            return;
          }
        }
      }

      // Draw targets falling blocks & Collision with Body balance indicator
      const targets = targetsRef.current;
      const platformY = cH - 110;

      // Draw visual aligned landing platform at centroid position
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(coreCentroidRef.current.x, coreCentroidRef.current.y);
      ctx.lineTo(coreCentroidRef.current.x, platformY);
      ctx.stroke();

      ctx.restore();

      // Core posture target collector tray
      ctx.save();
      const trayWidth = settingsRef.current.therapyLevel !== 'normal' ? 120 : 80;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#06b6d4';
      ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 3;

      // Draw core landing saucer
      ctx.beginPath();
      ctx.roundRect(coreCentroidRef.current.x - trayWidth / 2, platformY, trayWidth, 18, 8);
      ctx.fill();
      ctx.stroke();

      // Inside text guide
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText("ALIGNED PLATFORM", coreCentroidRef.current.x, platformY + 11);
      ctx.restore();

      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];

        if (stateStatusRef.current === 'PLAYING' && !t.isCaught) {
          t.y += t.vy;

          // Check if target reached platform landing height
          if (t.y >= platformY && t.y <= platformY + 25) {
            const distancePlatform = Math.abs(t.x - coreCentroidRef.current.x);
            
            if (distancePlatform < (trayWidth / 2) + 12) {
              // Successfully caught by body lean (sway core!)
              t.isCaught = true;
              soundManager.playSwipe(); // catch chime trigger
              statsRef.current.score += 25;
              statsRef.current.sliceCount++; // treat slice as caught count

              // Reaction Time logging
              const reaction = now - t.spawnTime;
              statsRef.current.reactionTimes.push(reaction);

              statsRef.current.movementStreak++;
              if (statsRef.current.movementStreak > statsRef.current.maxStreak) {
                statsRef.current.maxStreak = statsRef.current.movementStreak;
              }

              // Comfort messages
              const textMsg = guidanceTexts[Math.floor(Math.random() * guidanceTexts.length)];
              floatingTextsRef.current.push({
                id: `txt-${now}-${Math.random()}`,
                text: textMsg,
                x: t.x,
                y: platformY - 20,
                color: '#34d399', // emerald green comfort
                life: 1,
                maxLife: 45,
                scale: 1.1
              });

              // Sparks layout
              for (let q = 0; q < 10; q++) {
                const angle = Math.random() * Math.PI * 2;
                const spd = 1.5 + Math.random() * 3;
                particlesRef.current.push({
                  x: t.x,
                  y: platformY,
                  vx: Math.cos(angle) * spd,
                  vy: Math.sin(angle) * spd - 2, // burst slightly upwards
                  color: t.color,
                  radius: 3 + Math.random() * 5,
                  opacity: 1,
                  life: 1,
                  maxLife: 20 + Math.random() * 15,
                  gravity: 0.08
                });
              }
            }
          }

          // Offscreen floor misses
          if (t.y > cH + 10) {
            targets.splice(i, 1);
            statsRef.current.movementStreak = 0; // reset active streak
            
            if (settingsRef.current.therapyLevel === 'normal') {
              statsRef.current.lives = Math.max(0, statsRef.current.lives - 1);
              if (statsRef.current.lives === 0) {
                onGameEnd(statsRef.current);
                return;
              }
            }
            continue;
          }
        }

        // Render target
        if (!t.isCaught) {
          ctx.save();
          // Glow and circle token
          ctx.beginPath();
          ctx.fillStyle = t.color;
          ctx.shadowBlur = 10;
          ctx.shadowColor = t.color;
          ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
          ctx.fill();

          // Highlight
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.beginPath();
          ctx.arc(t.x - t.radius*0.25, t.y - t.radius*0.25, t.radius*0.25, 0, Math.PI*2);
          ctx.fill();

          // Emoji overlay representing wellness icon
          ctx.font = `${t.radius * 0.9}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(t.emoji, t.x, t.y + 1);
          ctx.restore();
        } else {
          targets.splice(i, 1);
        }
      }

      // Particle update
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity || 0;
        p.opacity = 1 - p.life / p.maxLife;

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Floating guides draw
      const fTexts = floatingTextsRef.current;
      for (let i = fTexts.length - 1; i >= 0; i--) {
        const ft = fTexts[i];
        ft.life++;
        ft.y -= 1.0;

        if (ft.life >= ft.maxLife) {
          fTexts.splice(i, 1);
          continue;
        }

        const opac = 1 - ft.life / ft.maxLife;
        ctx.save();
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = opac;
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      // Display active centroid core center
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(coreCentroidRef.current.x, coreCentroidRef.current.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Sync stats state
      setStats({ ...statsRef.current });

      gameLoopIdRef.current = requestAnimationFrame(tick);
    };

    gameLoopIdRef.current = requestAnimationFrame(tick);
  };

  const isTherapy = settings.therapyLevel !== 'normal';

  return (
    <div className="flex flex-col gap-4 w-full select-none" id="balance-trainer-engine">
      {/* Target Canvas Feed framing */}
      <div className="w-full relative rounded-3xl overflow-hidden aspect-[4/3] bg-slate-900 border-2 border-white/10 shadow-2xl flex items-center justify-center">
        {/* Semi-transparent loading indicator that doesn't block the screen entirely */}
        {!cameraActive && !cameraError && (
          <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-[10px] text-slate-300 font-bold tracking-wider z-25 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>ALIGNING GYROSCOPE CAMERA...</span>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-950/95 z-20">
            <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20 mb-4">
              <AlertCircle className="w-6 h-6 text-rose-500" />
            </div>
            <h4 className="text-white text-sm font-extrabold uppercase">WEBCAM DISCONNNECTED</h4>
            <p className="text-xs text-rose-300 mt-1.5 max-w-md leading-relaxed">{cameraError}</p>
            <button 
              onClick={setupWebcam}
              className="mt-5 bg-white/10 hover:bg-white/15 px-4 py-2 rounded-xl text-xs text-white uppercase font-bold tracking-wider transition"
            >
              Hubungkan Ulang
            </button>
          </div>
        )}

        <video 
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover hidden"
          playsInline
          muted
        />

        <canvas 
          ref={mainCanvasRef}
          className="absolute inset-0 w-full h-full object-cover"
          width={640}
          height={480}
          id="webcam-balance-canvas"
        />

        <canvas 
          ref={offscreenCanvasRef}
          className="hidden"
          width={48}
          height={36}
        />

        {/* Live HUD Controls */}
        {status === 'PLAYING' && (
          <div className="absolute inset-x-0 top-0 p-4 flex justify-between items-start pointer-events-none select-none z-10">
            <div className="flex flex-col gap-1">
              <div className="flex gap-2.5 bg-emerald-955/70 backdrop-blur-md px-3.5 font-semibold text-white py-1.5 rounded-xl border border-emerald-500/20 items-center">
                <span className="text-[10px] text-emerald-305 uppercase font-black tracking-widest">POSTURE:</span>
                <span className="text-[10px] font-black uppercase text-emerald-400">
                  {isTherapy ? `🔴 REHABILITASI` : '🟢 SEHAT AKTIF'}
                </span>
              </div>
              <div className="px-3 py-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl mt-1 text-[9px] uppercase font-black tracking-wider text-slate-300">
                Stabilitas Core: <span className="text-emerald-400 font-bold">{stats.avgBalanceStability}% Stable</span>
              </div>
            </div>

            <div className="flex flex-col gap-1 items-end">
              <div className="bg-indigo-950/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-indigo-500/20 text-right">
                <span className="text-[9px] text-slate-300 uppercase font-black block tracking-widest">KESEIMBANGAN</span>
                <span className="text-emerald-305 font-mono text-sm font-black">{stats.score} PTS</span>
              </div>
              <div className="bg-white/5 backdrop-blur-md px-3 py-1 rounded-xl border border-white/10 text-[10px] text-slate-300 font-mono font-bold mt-1 uppercase">
                DIKUMPULKAN: {stats.sliceCount} | REKOR: {stats.highscore}
              </div>
            </div>
          </div>
        )}

        {/* Safety overlay notifications */}
        {status === 'PLAYING' && (
          <div className="absolute inset-x-0 bottom-4 mx-auto max-w-sm bg-slate-900/90 border border-white/10 backdrop-blur-md px-4 py-2 rounded-2xl flex items-center justify-between shadow-2xl select-none z-10">
            <span className="text-[9px] bg-emerald-500 text-slate-950 font-black px-2 py-0.5 rounded-lg mr-2 uppercase tracking-wider shrink-0">CORE ASSIST</span>
            <p className="text-[10px] text-slate-100 font-bold leading-tight truncate">
              {postureFeedback}
            </p>
          </div>
        )}

        {/* Countdown Overlays */}
        {status === 'PLAYING' && (
          <div className="absolute top-1/2 left-4 -translate-y-1/2 flex flex-col gap-1 pointer-events-none select-none bg-slate-950/75 backdrop-blur-sm px-3 py-2.5 rounded-2xl border border-white/10">
            <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest leading-none">TIMER</span>
            <span className="font-mono text-lg font-black leading-none text-slate-100">
              {secondsTimerRef.current}s
            </span>
          </div>
        )}
      </div>

      {/* Guide details controls info */}
      <div className="glass w-full rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 select-none font-sans">
        <div className="flex flex-col gap-1 text-center md:text-left">
          <h4 className="text-sm font-black text-emerald-400 flex items-center gap-2 justify-center md:justify-start uppercase tracking-wider">
            <Compass className="w-4 h-4 text-emerald-400 animate-pulse" /> GAME 4 : CORE BALANCE TRAINER
          </h4>
          <p className="text-xs text-slate-300 max-w-md leading-relaxed">
            Miringkan badan Anda secara dinamis ke kiri dan kanan untuk menggeser platform visual penangkap gelembung di layar. Sempurna untuk melatih keseimbangan, otot perut samping (obliques), dan mencegah risiko jatuh bagi lansia.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button 
            onClick={() => setSettings(p => ({ ...p, soundEnabled: !p.soundEnabled }))}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${settings.soundEnabled ? 'bg-sky-955/30 border-sky-500/30 text-sky-405' : 'bg-white/5 border-white/5 text-slate-400'}`}
            title="Audio Pops FX"
          >
            {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button 
            onClick={() => setSettings(p => ({ ...p, showMotionMap: !p.showMotionMap }))}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${settings.showMotionMap ? 'bg-sky-955/30 border-sky-500/30 text-sky-405' : 'bg-white/5 border-white/5 text-slate-400'}`}
            title="Visual Vector Map"
          >
            {settings.showMotionMap ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          <button 
            onClick={() => setSettings(p => ({ ...p, mirrorMode: !p.mirrorMode }))}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer uppercase tracking-wider ${settings.mirrorMode ? 'bg-sky-955/30 border-sky-500/30 text-sky-305' : 'bg-white/5 border-white/10 text-slate-400'}`}
          >
            {settings.mirrorMode ? 'MIRROR: ON' : 'MIRROR: OFF'}
          </button>
        </div>
      </div>
    </div>
  );
}
