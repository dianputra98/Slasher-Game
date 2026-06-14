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
import { Shield, Sparkles, Activity, AlertCircle, Volume2, VolumeX, Eye, EyeOff, CheckCircle, Zap } from 'lucide-react';

interface GameProps {
  status: GameStatus;
  settings: TrackingSettings;
  setSettings: React.Dispatch<React.SetStateAction<TrackingSettings>>;
  onGameEnd: (stats: GameStats) => void;
  onGameStart: () => void;
  backToMenu: () => void;
}

interface Balloon {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  emoji: string;
  isPopped: boolean;
  spawnTime: number;
  popProgress: number; // For fading scale pop ring
}

export default function BalloonPopEngine({
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
  
  // Safety feedback systems
  const [postureFeedback, setPostureFeedback] = useState<string>("Mencari posisi berdiri Anda...");

  const [stats, setStats] = useState<GameStats>({
    score: 0,
    lives: 5, // More generous for older adults/therapy
    sliceCount: 0,
    comboCount: 0,
    maxCombo: 0,
    bombsHit: 0,
    highscore: parseInt(localStorage.getItem('balloon_highscore') || '0'),
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
  const balloonsRef = useRef<Balloon[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const settingsRef = useRef<TrackingSettings>(settings);
  const stateStatusRef = useRef<GameStatus>(status);
  const activeTrackerPointsRef = useRef<{
    left: { x: number; y: number; active: boolean; lastActive: number; trail: Point[] };
    right: { x: number; y: number; active: boolean; lastActive: number; trail: Point[] };
  }>({
    left: { x: 160, y: 240, active: false, lastActive: 0, trail: [] },
    right: { x: 480, y: 240, active: false, lastActive: 0, trail: [] }
  });

  const lastMotionDetectedTimeRef = useRef<number>(Date.now());
  const gameLoopIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const secondsTimerRef = useRef<number>(60);
  const lastSecondUpdateRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);

  const encouragementTexts = [
    "Bagus! 🎉",
    "Hebat! ⭐",
    "Pertahankan gerakan! 🔥",
    "Luar biasa! 🌟",
    "Sentuhan Sempurna! 💪",
    "Mantap sekali! 👍",
    "Bahu Kuat! 🧘",
    "Lengan Sehat! 🥗"
  ];

  const balloonEmojis = ["🎈", "🎈", "🎈", "🎈", "🎈"];
  const balloonColors = [
    "rgba(239, 68, 68, 0.7)",  // Red
    "rgba(59, 130, 246, 0.7)",  // Blue
    "rgba(251, 191, 36, 0.7)",  // Gold
    "rgba(16, 185, 129, 0.7)",  // Green
    "rgba(168, 85, 247, 0.7)",  // Purple
    "rgba(244, 63, 94, 0.7)"    // Pink
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
      const savedHigh = parseInt(localStorage.getItem('balloon_highscore') || '0');
      // Set timer length according to mode (Therapy often grants longer pacing)
      secondsTimerRef.current = settings.therapyLevel === 'rehab' ? 90 : 60;
      
      const freshStats: GameStats = {
        score: 0,
        lives: settings.therapyLevel === 'normal' ? 3 : 5, // More generous for therapy
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
      balloonsRef.current = [];
      particlesRef.current = [];
      floatingTextsRef.current = [];
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
      console.error(`Camera init failure in BalloonPopEngine (retries left: ${retries}):`, err);
      if (retries > 0 && err.name !== 'NotAllowedError') {
        setTimeout(() => setupWebcam(retries - 1, delay), delay);
      } else {
        setCameraError(
          err.name === 'NotAllowedError' 
            ? "Permission Denied. Please approve permission to capture from your webcam inside the URL lock." 
            : "Kamera sedang digunakan sesi lain atau tidak terdeteksi. Silakan coba hubungkan ulang."
        );
      }
    }
  };

  const spawnBalloon = (cW: number, cH: number) => {
    const isTherapy = settingsRef.current.therapyLevel !== 'normal';
    
    // Scale size to the chosen therapy mode
    // Rehab/Senior level balloon sizes are significantly larger and move slower
    let radius = 45;
    if (settingsRef.current.therapyLevel === 'rehab' || settingsRef.current.therapyLevel === 'senior') {
      radius = 65; 
    } else if (settingsRef.current.therapyLevel === 'beginner') {
      radius = 55;
    }

    // Gentle velocity scalars
    let velocityMultiplier = 1.0;
    if (settingsRef.current.therapyLevel === 'rehab') velocityMultiplier = 0.4;
    else if (settingsRef.current.therapyLevel === 'senior') velocityMultiplier = 0.6;
    else if (settingsRef.current.therapyLevel === 'beginner') velocityMultiplier = 0.8;

    const chosenColor = balloonColors[Math.floor(Math.random() * balloonColors.length)];
    const chosenEmoji = balloonEmojis[Math.floor(Math.random() * balloonEmojis.length)];

    const newBalloon: Balloon = {
      id: `balloon-${Date.now()}-${Math.random()}`,
      x: radius + Math.random() * (cW - radius * 2),
      // In Balloon therapy, they pop upwards from the button of the screen
      y: cH + 30,
      vx: (Math.random() - 0.5) * 1.5 * velocityMultiplier,
      vy: -(0.8 + Math.random() * 1.2) * velocityMultiplier,
      radius,
      color: chosenColor,
      emoji: chosenEmoji,
      isPopped: false,
      spawnTime: Date.now(),
      popProgress: 0
    };

    balloonsRef.current.push(newBalloon);
    statsRef.current.fruitsSpawned++;
  };

  const startLoop = () => {
    if (gameLoopIdRef.current) cancelAnimationFrame(gameLoopIdRef.current);

    const gridW = 48;
    const gridH = 36;
    let prevFrameData: Uint8ClampedArray | null = null;
    const motionGrid = new Uint8Array(gridW * gridH);
    const trackers = activeTrackerPointsRef.current;

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

      let sumXLeft = 0, sumYLeft = 0, countLeft = 0;
      let sumXRight = 0, sumYRight = 0, countRight = 0;
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

              if (settingsRef.current.trackerType === 'single') {
                sumXRight += x;
                sumYRight += y;
                countRight++;
              } else {
                if (x < gridW / 2) {
                  sumXLeft += x;
                  sumYLeft += y;
                  countLeft++;
                } else {
                  sumXRight += x;
                  sumYRight += y;
                  countRight++;
                }
              }
            } else {
              motionGrid[y * gridW + x] = Math.max(0, motionGrid[y * gridW + x] - 12);
            }
          }
        }
      }

      prevFrameData = currPixels;

      // Track active center coordinates
      let targetXLeft = trackers.left.x;
      let targetYLeft = trackers.left.y;
      if (countLeft > 4) {
        const centroidX_Grid = sumXLeft / countLeft;
        const centroidY_Grid = sumYLeft / countLeft;
        targetXLeft = (centroidX_Grid / gridW) * cW;
        targetYLeft = (centroidY_Grid / gridH) * cH;
        trackers.left.active = true;
        trackers.left.lastActive = now;
      } else {
        if (now - trackers.left.lastActive > 200) {
          trackers.left.active = false;
        }
      }

      let targetXRight = trackers.right.x;
      let targetYRight = trackers.right.y;
      if (countRight > 4) {
        const centroidX_Grid = sumXRight / countRight;
        const centroidY_Grid = sumYRight / countRight;
        targetXRight = (centroidX_Grid / gridW) * cW;
        targetYRight = (centroidY_Grid / gridH) * cH;
        trackers.right.active = true;
        trackers.right.lastActive = now;
      } else {
        if (now - trackers.right.lastActive > 200) {
          trackers.right.active = false;
        }
      }

      trackers.left.x += (targetXLeft - trackers.left.x) * 0.22;
      trackers.left.y += (targetYLeft - trackers.left.y) * 0.22;
      trackers.right.x += (targetXRight - trackers.right.x) * 0.22;
      trackers.right.y += (targetYRight - trackers.right.y) * 0.22;

      // Append trail particles
      if (trackers.left.active) {
        trackers.left.trail.push({ x: trackers.left.x, y: trackers.left.y });
        if (trackers.left.trail.length > 7) trackers.left.trail.shift();
      } else {
        trackers.left.trail = [];
      }

      if (trackers.right.active) {
        trackers.right.trail.push({ x: trackers.right.x, y: trackers.right.y });
        if (trackers.right.trail.length > 7) trackers.right.trail.shift();
      } else {
        trackers.right.trail = [];
      }

      // Live Posture Warning feedback
      const motionPct = Math.min(100, Math.floor((processedIntensity / (gridW * gridH)) * 400));
      setMotionIntensity(motionPct);

      if (stateStatusRef.current === 'PLAYING') {
        statsRef.current.caloriesBurned += 0.0003 + (motionPct * 0.00004);
      }

      if (motionPct > 4) {
        lastMotionDetectedTimeRef.current = now;
        if (!isMotionDetectedGloballyRef.current) {
          isMotionDetectedGloballyRef.current = true;
          setIsMotionDetectedGlobally(true);
        }
      } else {
        if (now - lastMotionDetectedTimeRef.current > 4000) {
          if (isMotionDetectedGloballyRef.current) {
            isMotionDetectedGloballyRef.current = false;
            setIsMotionDetectedGlobally(false);
          }
        }
      }

      // Analyze safety distance
      if (motionPct > 72) {
        setPostureFeedback("⚠️ TERLALU DEKAT! Coba mundur sedikit agar tubuh terlihat.");
      } else if (motionPct < 2 && now - lastMotionDetectedTimeRef.current > 2500) {
        setPostureFeedback("⚠️ TUBUH TIDAK TERDETEKSI! Silakan berdiri dalam jangkauan kamera.");
      } else {
        setPostureFeedback("✅ GERAKAN BAGUS! Pertahankan posisi dan posture Anda.");
      }

      // Render Camera Feed
      ctx.save();
      if (settingsRef.current.mirrorMode) {
        ctx.translate(cW, 0);
        ctx.scale(-1, 1);
      }
      ctx.globalAlpha = settingsRef.current.videoOpacity;
      ctx.drawImage(video, 0, 0, cW, cH);
      ctx.restore();

      // Render Motion map overlay
      if (settingsRef.current.showMotionMap) {
        ctx.save();
        const blockW = cW / gridW;
        const blockH = cH / gridH;
        for (let y = 0; y < gridH; y++) {
          for (let x = 0; x < gridW; x++) {
            const opacity = motionGrid[y * gridW + x];
            if (opacity > 30) {
              const rX = settingsRef.current.mirrorMode ? (gridW - 1 - x) : x;
              ctx.fillStyle = `rgba(16, 185, 129, ${opacity / 255 * 0.45})`;
              ctx.beginPath();
              ctx.arc(rX * blockW + blockW/2, y * blockH + blockH/2, blockW / 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        ctx.restore();
      }

      // Spawning balloons
      if (stateStatusRef.current === 'PLAYING') {
        const timeSinceLastSpawn = now - lastSpawnTimeRef.current;
        let spawnInterval = 1800;
        
        // Pacing adjustments based on settings/therapyLevel
        if (settingsRef.current.therapyLevel === 'rehab') spawnInterval = 3200;
        else if (settingsRef.current.therapyLevel === 'senior') spawnInterval = 2500;
        else if (settingsRef.current.therapyLevel === 'beginner') spawnInterval = 2000;

        if (timeSinceLastSpawn >= spawnInterval) {
          spawnBalloon(cW, cH);
          lastSpawnTimeRef.current = now;
        }

        // Clock Tick
        if (now - lastSecondUpdateRef.current >= 1000) {
          secondsTimerRef.current = Math.max(0, secondsTimerRef.current - 1);
          statsRef.current.sessionTime = secondsTimerRef.current;
          lastSecondUpdateRef.current = now;

          if (secondsTimerRef.current <= 0) {
            // Calculate final analytics accuracy
            const popCount = statsRef.current.totalBaloonPops;
            const spawned = statsRef.current.fruitsSpawned;
            statsRef.current.accuracy = spawned > 0 ? Math.round((popCount / spawned) * 100) : 100;
            // Record lifetime reward cals
            const existingLifetime = parseFloat(localStorage.getItem('arcade_total_calories') || '0');
            localStorage.setItem('arcade_total_calories', (existingLifetime + statsRef.current.caloriesBurned).toFixed(2));
            
            // Highscore
            const currentHigh = parseInt(localStorage.getItem('balloon_highscore') || '0');
            if (statsRef.current.score > currentHigh) {
              localStorage.setItem('balloon_highscore', statsRef.current.score.toString());
            }

            onGameEnd(statsRef.current);
            return;
          }
        }
      }

      // Draw Balloons and Pop test
      const balloons = balloonsRef.current;
      for (let i = balloons.length - 1; i >= 0; i--) {
        const b = balloons[i];

        if (stateStatusRef.current === 'PLAYING' && !b.isPopped) {
          b.x += b.vx;
          b.y += b.vy;

          // Gently bounce off boundaries
          if (b.x < b.radius || b.x > cW - b.radius) {
            b.vx *= -1;
          }

          // Left tracker check
          const distLeft = Math.hypot(b.x - trackers.left.x, b.y - trackers.left.y);
          // Right tracker check
          const distRight = Math.hypot(b.x - trackers.right.x, b.y - trackers.right.y);

          const leftTouching = trackers.left.active && distLeft < b.radius + 18;
          const rightTouching = trackers.right.active && distRight < b.radius + 18;

          if (leftTouching || rightTouching) {
            b.isPopped = true;
            b.popProgress = 1;
            soundManager.playSwipe(); // soft popping sweep chime

            statsRef.current.score += 15;
            statsRef.current.sliceCount++;
            statsRef.current.totalBaloonPops++;

            // Reaction Time logging
            const reaction = now - b.spawnTime;
            statsRef.current.reactionTimes.push(reaction);

            // Streak logging
            statsRef.current.movementStreak++;
            if (statsRef.current.movementStreak > statsRef.current.maxStreak) {
              statsRef.current.maxStreak = statsRef.current.movementStreak;
            }

            // Floating gentle encouragement text
            const encouragement = encouragementTexts[Math.floor(Math.random() * encouragementTexts.length)];
            floatingTextsRef.current.push({
              id: `text-${now}-${Math.random()}`,
              text: encouragement,
              x: b.x,
              y: b.y - 30,
              color: '#fbbf24', // golden accent
              life: 1,
              maxLife: 50,
              scale: 1.2
            });

            // Sparkle Bubble particles
            for (let k = 0; k < 12; k++) {
              const speed = 2 + Math.random() * 4;
              const angle = Math.random() * Math.PI * 2;
              particlesRef.current.push({
                x: b.x,
                y: b.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: b.color,
                radius: 4 + Math.random() * 6,
                opacity: 1,
                life: 1,
                maxLife: 25 + Math.random() * 20,
                gravity: 0.1
              });
            }
          }

          // Off-screen missed balloons check
          if (b.y < -b.radius * 2) {
            balloons.splice(i, 1);
            // Reset streak but no harsh penality on therapy
            statsRef.current.movementStreak = 0;

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

        // Draw balloon string & body
        if (!b.isPopped) {
          ctx.save();
          // Draw hanging physical string line
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.moveTo(b.x, b.y + b.radius * 0.95);
          ctx.quadraticCurveTo(b.x + Math.sin(now / 150) * 8, b.y + b.radius * 1.5, b.x, b.y + b.radius * 2.1);
          ctx.stroke();

          // Outer glowing shadow
          ctx.shadowBlur = 18;
          ctx.shadowColor = b.color;

          // Draw double-layered balloons for glossy lens sphere look
          ctx.beginPath();
          ctx.fillStyle = b.color;
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fill();

          // Specular highlights
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.beginPath();
          ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.2, 0, Math.PI * 1.8);
          ctx.fill();

          // Draw small triangle base
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y + b.radius * 0.9);
          ctx.lineTo(b.x - 7, b.y + b.radius + 6);
          ctx.lineTo(b.x + 7, b.y + b.radius + 6);
          ctx.closePath();
          ctx.fill();

          // Large emoji centered inside
          ctx.font = `${b.radius * 0.9}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText("🎈", b.x, b.y + 2);

          ctx.restore();
        } else {
          // Play fading out popping ring effect
          b.popProgress += 0.08;
          if (b.popProgress >= 2.0) {
            balloons.splice(i, 1);
          } else {
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 3 / b.popProgress;
            ctx.globalAlpha = Math.max(0, 1 - b.popProgress / 2);
            ctx.arc(b.x, b.y, b.radius * b.popProgress, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // Draw active particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.vY = p.vy;
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

      // Render floating encouragement texts
      const fTexts = floatingTextsRef.current;
      for (let i = fTexts.length - 1; i >= 0; i--) {
        const ft = fTexts[i];
        ft.life++;
        ft.y -= 1.2; // float up

        if (ft.life >= ft.maxLife) {
          fTexts.splice(i, 1);
          continue;
        }

        const opacity = 1 - ft.life / ft.maxLife;
        ctx.save();
        ctx.font = 'black 16px sans-serif';
        if (ft.life > 10) ft.scale = Math.max(1.0, ft.scale - 0.02);
        ctx.textAlign = 'center';
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = opacity;
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 6;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      // Draw hand vector nodes for user feedback
      if (trackers.left.active) {
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#06b6d4';
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(trackers.left.x, trackers.left.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.font = 'black 10px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText("🖐️ TANGAN KIRI", trackers.left.x, trackers.left.y + 30);
        ctx.restore();
      }

      if (trackers.right.active) {
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#fbbf24';
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(trackers.right.x, trackers.right.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.font = 'black 10px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(settingsRef.current.trackerType === 'single' ? "🖐️ TANGAN" : "🖐️ TANGAN KANAN", trackers.right.x, trackers.right.y + 30);
        ctx.restore();
      }

      // Sync React state statistics
      setStats({ ...statsRef.current });

      gameLoopIdRef.current = requestAnimationFrame(tick);
    };

    gameLoopIdRef.current = requestAnimationFrame(tick);
  };

  const isTherapy = settings.therapyLevel !== 'normal';

  return (
    <div className="flex flex-col gap-4 w-full select-none" id="balloon-pop-engine">
      {/* Video display capture area */}
      <div className="w-full relative rounded-3xl overflow-hidden aspect-[4/3] bg-slate-900 border-2 border-white/10 shadow-2xl flex items-center justify-center">
        {/* Semi-transparent loading indicator that doesn't block the screen entirely */}
        {!cameraActive && !cameraError && (
          <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-[10px] text-slate-300 font-bold tracking-wider z-25 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>CONNECTING CAMERA...</span>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-950/95 z-20">
            <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20 mb-4">
              <AlertCircle className="w-6 h-6 text-rose-500" />
            </div>
            <h4 className="text-white text-sm font-extrabold uppercase">WEBCAM ERROR OCCURRED</h4>
            <p className="text-xs text-rose-300 mt-1.5 max-w-md leading-relaxed">{cameraError}</p>
            <button 
              onClick={setupWebcam}
              className="mt-5 bg-white/10 hover:bg-white/15 px-4.5 py-2.5 rounded-xl text-xs text-white uppercase font-black tracking-widest border border-white/5 transition"
            >
              Coba Hubungkan Kembali
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
          id="webcam-balloon-canvas"
        />

        <canvas 
          ref={offscreenCanvasRef}
          className="hidden"
          width={48}
          height={36}
        />

        {/* Live HUD Dashboard metrics */}
        {status === 'PLAYING' && (
          <div className="absolute inset-x-0 top-0 p-4 flex justify-between items-start pointer-events-none select-none z-10">
            {/* Health indicators or Therapy Tag display */}
            <div className="flex flex-col gap-1">
              <div className="flex gap-2.5 bg-sky-950/70 backdrop-blur-md px-3.5 font-semibold text-white py-1.5 rounded-xl border border-sky-500/20 items-center">
                <span className="text-[10px] text-sky-305 uppercase font-black tracking-widest">PASIEN:</span>
                <span className="text-[10px] font-black uppercase text-amber-300">
                  {isTherapy ? `🔴 ${settings.therapyLevel.toUpperCase()} TERAPI` : '🟢 MODE NORMAL'}
                </span>
              </div>
              {settings.therapyLevel === 'normal' ? (
                <div className="flex gap-1 bg-white/5 backdrop-blur-md px-3.5 py-1 rounded-xl border border-white/10 items-center mt-1">
                  {[...Array(3)].map((_, i) => (
                    <span key={i} className={`text-sm ${i < stats.lives ? 'text-rose-500' : 'text-slate-600'}`}>❤️</span>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-0.5 bg-emerald-950/70 border border-emerald-500/20 text-emerald-400 font-bold uppercase text-[9px] rounded-lg mt-1 tracking-wider">
                  Tanpa Penalti Kehabisan Nyawa ✅
                </div>
              )}
            </div>

            {/* Calories / Score */}
            <div className="flex flex-col gap-1 items-end">
              <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/20 text-right flex items-center gap-2">
                <div>
                  <span className="text-[9px] text-slate-300 uppercase font-black block tracking-widest">TELEMETRI</span>
                  <span className="text-amber-300 font-mono text-sm font-black">{stats.score} PTS</span>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/10 mt-1 text-right">
                <span className="text-[9px] text-slate-300 uppercase font-black block tracking-widest">BENDA TERPECAH</span>
                <span className="text-sky-300 font-mono text-sm font-black">{stats.totalBaloonPops} Balon</span>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Banner Safety Posture guidelines overlay */}
        {status === 'PLAYING' && (
          <div className="absolute inset-x-0 bottom-4 mx-auto max-w-md bg-slate-900/90 border border-white/10 backdrop-blur-md px-4 py-2 rounded-2xl flex items-center justify-between shadow-2xl select-none z-10">
            <span className="text-[9px] bg-sky-500 text-slate-950 font-black px-2 py-0.5 rounded-lg mr-2 uppercase tracking-wider shrink-0">SAFETY ADVISOR</span>
            <p className="text-[10px] text-slate-200 font-bold leading-tight truncate">
              {postureFeedback}
            </p>
          </div>
        )}

        {/* Countdown Overlays */}
        {status === 'PLAYING' && (
          <div className="absolute top-1/2 left-4 -translate-y-1/2 flex flex-col gap-1 pointer-events-none select-none bg-slate-950/75 backdrop-blur-sm px-3 py-2.5 rounded-2xl border border-white/10">
            <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest leading-none">REMAINING</span>
            <span className={`font-mono text-lg font-black leading-none ${secondsTimerRef.current <= 10 ? 'text-rose-500 animate-pulse' : 'text-slate-100'}`}>
              {secondsTimerRef.current}s
            </span>
          </div>
        )}
      </div>

      {/* Therapy instructions controls */}
      <div className="glass w-full rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 select-none font-sans">
        <div className="flex flex-col gap-1 text-center md:text-left">
          <h4 className="text-sm font-black text-rose-400 flex items-center gap-2 justify-center md:justify-start uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-rose-400 animate-spin" /> GAME 3 : BALLOON POP THERAPY
          </h4>
          <p className="text-xs text-slate-300 max-w-md leading-relaxed">
            Rentangkan dan angkat tangan Anda untuk menyentuh balon terapung di layar. Mode ini didesain khusus melatih bahu, kelenturan ketiak, dan jangkauan lengan lansia.
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

          <button 
            onClick={() => {
              soundManager.playSwipe();
              setSettings(p => ({ ...p, trackerType: p.trackerType === 'single' ? 'dual' : 'single' }));
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer uppercase tracking-wider ${settings.trackerType === 'single' ? 'bg-amber-955/30 border-amber-500/30 text-amber-300' : 'bg-sky-955/30 border-sky-500/30 text-sky-305'}`}
          >
            {settings.trackerType === 'single' ? '🖐️ 1 TANGAN' : '🙌 2 TANGAN'}
          </button>
        </div>
      </div>
    </div>
  );
}
