import React, { useEffect, useRef, useState } from 'react';
import { 
  BasketItem, 
  Particle, 
  FloatingText, 
  GameStats, 
  GameStatus, 
  TrackingSettings, 
  Point 
} from '../types';
import { soundManager } from './SoundManager';
import { Shield, Sparkles, Activity, AlertCircle, RefreshCw, Volume2, VolumeX, Eye, EyeOff, Play, Zap, Flame, ShieldAlert, Timer } from 'lucide-react';

interface BasketProps {
  status: GameStatus;
  settings: TrackingSettings;
  setSettings: React.Dispatch<React.SetStateAction<TrackingSettings>>;
  onGameEnd: (stats: GameStats) => void;
  onGameStart: () => void;
  backToMenu: () => void;
}

export default function BodyBasketEngine({
  status,
  settings,
  setSettings,
  onGameEnd,
  onGameStart,
  backToMenu
}: BasketProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [motionIntensity, setMotionIntensity] = useState<number>(0);
  const [isMotionDetected, setIsMotionDetected] = useState<boolean>(true);

  // Stats
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    lives: 3,
    sliceCount: 0,
    comboCount: 0,
    maxCombo: 0,
    bombsHit: 0,
    highscore: parseInt(localStorage.getItem('basket_highscore') || '0'),
    accuracy: 100,
    fruitsSpawned: 0,
    caloriesBurned: 0,
    sessionTime: 60, // 60 seconds arcade timer mode
    squatsCount: 0
  });

  // Mutable values in refs
  const statsRef = useRef<GameStats>({ ...stats });
  const itemsRef = useRef<BasketItem[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const settingsRef = useRef<TrackingSettings>(settings);
  const stateStatusRef = useRef<GameStatus>(status);
  const streamRef = useRef<MediaStream | null>(null);
  const gameLoopIdRef = useRef<number | null>(null);

  // Dynamic squat & dodge system states
  const squatDetectedRef = useRef<boolean>(false);
  const [isSquatActive, setIsSquatActive] = useState<boolean>(false);

  // Overhead duck obstacle sequence
  const obstacleActiveRef = useRef<boolean>(false);
  const obstacleXRef = useRef<number>(0);
  const obstacleYRef = useRef<number>(140);
  const obstacleSpeedRef = useRef<number>(5);
  const [hasDodgedSuccess, setHasDodgedSuccess] = useState<boolean | null>(null);
  const obstacleTimerRef = useRef<number>(0);

  // Basket coordinates
  const basketXRef = useRef<number>(320);
  const basketYRef = useRef<number>(430);
  const basketWidthRef = useRef<number>(110);
  const basketHeightRef = useRef<number>(25);

  const lastMotionDetectedTimeRef = useRef<number>(Date.now());
  const spawnTimerRef = useRef<number>(0);
  const secondsTimerRef = useRef<number>(60);
  const lastSecondUpdateRef = useRef<number>(0);

  // Mirror setting and audio sync
  useEffect(() => {
    settingsRef.current = settings;
    soundManager.setEnabled(settings.soundEnabled);
  }, [settings]);

  // Keep stateStatusRef in sync with prop to prevent stale closure inside frame tick loops
  useEffect(() => {
    stateStatusRef.current = status;
  }, [status]);

  // Restart / Reset trigger
  useEffect(() => {
    if (status === 'PLAYING') {
      const savedHigh = parseInt(localStorage.getItem('basket_highscore') || '0');
      const freshStats = {
        score: 0,
        lives: 3,
        sliceCount: 0,
        comboCount: 0,
        maxCombo: 0,
        bombsHit: 0,
        highscore: savedHigh,
        accuracy: 100,
        fruitsSpawned: 0,
        caloriesBurned: 0,
        sessionTime: 60, // 60s countdown
        squatsCount: 0
      };
      setStats(freshStats);
      statsRef.current = freshStats;
      itemsRef.current = [];
      particlesRef.current = [];
      floatingTextsRef.current = [];
      basketXRef.current = 320;
      secondsTimerRef.current = 60;
      lastSecondUpdateRef.current = Date.now();
      spawnTimerRef.current = 1000;
      lastMotionDetectedTimeRef.current = Date.now();
      setIsMotionDetected(true);
      obstacleActiveRef.current = false;
      setHasDodgedSuccess(null);
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

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
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
      console.error(`Camera setup error in basket (retries left: ${retries}): `, err);
      if (retries > 0 && err.name !== 'NotAllowedError') {
        setTimeout(() => setupWebcam(retries - 1, delay), delay);
      } else {
        setCameraError(
          err.name === 'NotAllowedError' 
            ? 'Kamera diblokir. Harap berikan izin akses kamera.'
            : 'Kamera sedang sibuk atau tidak terdeteksi. Silakan coba hubungkan ulang.'
        );
      }
    }
  };

  const spawnItem = (canvasWidth: number, canvasHeight: number) => {
    const diff = settingsRef.current.difficulty;
    let speedMult = 1.0;
    if (diff === 'easy') speedMult = 0.85;
    else if (diff === 'hard') speedMult = 1.25;

    // Obstacle or bonus options
    const roll = Math.random();
    let itemType: 'apple' | 'banana' | 'orange' | 'watermelon' | 'coconut' | 'bomb' | 'star' | 'stone' = 'apple';
    let title = 'Apel';
    let emoji = '🍎';
    let color = '#ff3344';
    let pts = 10;
    let isSp = false;

    if (roll < 0.12) {
      itemType = 'bomb';
      title = 'BOM';
      emoji = '💣';
      color = '#3f3f46';
      pts = -15;
    } else if (roll < 0.22) {
      itemType = 'stone';
      title = 'BATU';
      emoji = '🪨';
      color = '#78716c';
      pts = -10;
    } else if (roll < 0.30) {
      itemType = 'star';
      title = 'STAR';
      emoji = '⭐';
      color = '#fbbf24';
      pts = 35;
      isSp = true;
    } else {
      // Normal healthy fruits
      const fruitOptions = [
        { type: 'apple' as const, t: 'Apel', e: '🍎', c: '#ff4444', p: 10 },
        { type: 'banana' as const, t: 'Pisang', e: '🍌', c: '#facc15', p: 10 },
        { type: 'orange' as const, t: 'Jeruk', e: '🍊', c: '#f97316', p: 10 },
        { type: 'watermelon' as const, t: 'Semangka', e: '🍉', c: '#10b981', p: 15 },
        { type: 'coconut' as const, t: 'Kelapa', e: '🥥', c: '#a1a1aa', p: 20 },
      ];
      const selected = fruitOptions[Math.floor(Math.random() * fruitOptions.length)];
      itemType = selected.type;
      title = selected.t;
      emoji = selected.e;
      color = selected.c;
      pts = selected.p;
    }

    const newItem: BasketItem = {
      id: `basket-${Date.now()}-${Math.random()}`,
      type: itemType,
      title,
      color,
      emoji,
      x: 40 + Math.random() * (canvasWidth - 80),
      y: -30,
      vy: (4.0 + Math.random() * 3.5) * speedMult + (statsRef.current.score > 200 ? 1.5 : 0),
      radius: itemType === 'watermelon' ? 24 : 17,
      pointsValue: pts,
      isPowerup: isSp
    };

    itemsRef.current.push(newItem);
    statsRef.current.fruitsSpawned++;
  };

  const createParticles = (x: number, y: number, color: string, num: number = 8) => {
    for (let i = 0; i < num; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 2,
        color,
        radius: 2.5 + Math.random() * 3.5,
        opacity: 1,
        life: 0,
        maxLife: 20 + Math.floor(Math.random() * 15),
        gravity: 0.12
      });
    }
  };

  const addFloatingText = (text: string, x: number, y: number, color: string) => {
    floatingTextsRef.current.push({
      id: `text-${Date.now()}-${Math.random()}`,
      text,
      x,
      y,
      color,
      life: 0,
      maxLife: 35,
      scale: 1.0
    });
  };

  const triggerOverheadObstacle = (cW: number) => {
    obstacleActiveRef.current = true;
    obstacleXRef.current = -80;
    obstacleYRef.current = 145; // upper danger zone
    obstacleSpeedRef.current = 5 + Math.random() * 3.5;
    setHasDodgedSuccess(null);
    soundManager.playHurt();
  };

  // Main Motion Arcade Basket Engine
  const startLoop = () => {
    if (gameLoopIdRef.current) cancelAnimationFrame(gameLoopIdRef.current);

    const gridW = 48;
    const gridH = 36;
    let prevFrameData: Uint8ClampedArray | null = null;
    const motionGrid = new Uint8Array(gridW * gridH);

    // Filter tracking positions
    let smoothCentroidX = 320;
    let smoothCentroidY = 240;

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

      // 1. Frame differencing
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

      if (prevFrameData) {
        const threshold = settingsRef.current.threshold;
        for (let y = 0; y < gridH; y++) {
          for (let x = 0; x < gridW; x++) {
            const idx = (y * gridW + x) * 4;
            const diff = Math.abs(currPixels[idx] - prevFrameData[idx]) +
                         Math.abs(currPixels[idx + 1] - prevFrameData[idx + 1]) +
                         Math.abs(currPixels[idx + 2] - prevFrameData[idx + 2]);

            if (diff > threshold) {
              motionGrid[y * gridW + x] = 255;
              sumX += x;
              sumY += y;
              motionCount++;
            } else {
              motionGrid[y * gridW + x] = Math.max(0, motionGrid[y * gridW + x] - 14);
            }
          }
        }
      }

      prevFrameData = currPixels;

      // Motion intensities
      const intensityPct = Math.min(100, Math.floor((motionCount / (gridW * gridH)) * 400));
      setMotionIntensity(intensityPct);

      // Heartbeat checks
      if (intensityPct > 3) {
        lastMotionDetectedTimeRef.current = now;
        if (!isMotionDetected) setIsMotionDetected(true);
      } else {
        if (now - lastMotionDetectedTimeRef.current > 4000) {
          if (isMotionDetected) setIsMotionDetected(false);
        }
      }

      // 2. Active coordinates mapping
      if (motionCount > 4) {
        const targetX = (sumX / motionCount) / gridW * cW;
        const targetY = (sumY / motionCount) / gridH * cH;

        // Slide interpolation
        smoothCentroidX += (targetX - smoothCentroidX) * 0.16;
        smoothCentroidY += (targetY - smoothCentroidY) * 0.16;

        // Dynamic calorie calculation based on speed
        const swayDistance = Math.hypot(targetX - smoothCentroidX, targetY - smoothCentroidY);
        if (swayDistance > 8 && stateStatusRef.current === 'PLAYING') {
          statsRef.current.caloriesBurned += (swayDistance * 0.00035); // dynamic sways burn calories
        }
      }

      // 3. Basket sliding
      // Basket moves corresponding to horizontal center of camera movement
      basketXRef.current += (smoothCentroidX - basketXRef.current) * 0.20;
      // Clamps
      basketXRef.current = Math.max(40, Math.min(cW - 40, basketXRef.current));

      // 4. Squat and crouch pose checks
      // If motion center drops beyond 62% vertical height, player is crouching/squatting!
      const squatted = smoothCentroidY > cH * 0.58 && motionCount > 8;
      if (squatted !== squatDetectedRef.current) {
        squatDetectedRef.current = squatted;
        setIsSquatActive(squatted);

        if (squatted && stateStatusRef.current === 'PLAYING') {
          statsRef.current.squatsCount++;
          // Calories burst for squat movement (cardio burner!)
          statsRef.current.caloriesBurned += 0.35; // 0.35 kcal per leg muscle active squat!
          addFloatingText('SQUAT! +0.35 KCAL', basketXRef.current, basketYRef.current - 45, '#34d399');
          soundManager.playCatch();
        }
      }

      // Baseline metabolism calories
      if (stateStatusRef.current === 'PLAYING') {
        statsRef.current.caloriesBurned += 0.00085; // baseline warm-up burn per tick
      }

      // 5. Drawing phase
      ctx.clearRect(0, 0, cW, cH);

      // Render camera background
      ctx.save();
      if (settingsRef.current.mirrorMode) {
        ctx.translate(cW, 0);
        ctx.scale(-1, 1);
      }
      ctx.globalAlpha = settingsRef.current.videoOpacity;
      ctx.drawImage(video, 0, 0, cW, cH);
      ctx.restore();

      // Render body motion layout tracers behind
      if (settingsRef.current.showMotionMap) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.35)'; // rosy glow
        for (let y = 0; y < gridH; y++) {
          for (let x = 0; x < gridW; x++) {
            const op = motionGrid[y * gridW + x] / 255;
            if (op > 0.15) {
              ctx.save();
              ctx.globalAlpha = op * 0.45;
              const rX = (x / gridW) * cW;
              const rY = (y / gridH) * cH;
              ctx.beginPath();
              ctx.arc(rX + (cW/gridW)/2, rY + (cH/gridH)/2, (cW/gridW) * 0.82, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
        }
      }

      // Draw aesthetic boundary channels
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(35, 0); ctx.lineTo(35, cH);
      ctx.moveTo(cW - 35, 0); ctx.lineTo(cW - 35, cH);
      ctx.stroke();

      // 6. Game Mode Gameplay Actions
      if (stateStatusRef.current === 'PLAYING') {
        // Countdown clock ticker
        if (now - lastSecondUpdateRef.current >= 1000) {
          secondsTimerRef.current = Math.max(0, secondsTimerRef.current - 1);
          statsRef.current.sessionTime = secondsTimerRef.current;
          lastSecondUpdateRef.current = now;

          // Random obstacle generator (every ~10-15 seconds)
          if (secondsTimerRef.current > 6 && secondsTimerRef.current % 12 === 0 && !obstacleActiveRef.current) {
            triggerOverheadObstacle(cW);
          }

          if (secondsTimerRef.current <= 0) {
            // End session
            saveHighScoreSession();
            onGameEnd({ ...statsRef.current });
          }
        }

        // Object spawner countdown
        spawnTimerRef.current -= 16.66; // approx time per frame
        if (spawnTimerRef.current <= 0) {
          spawnItem(cW, cH);
          const scoreScalar = Math.max(450, 1000 - statsRef.current.score * 1.5);
          spawnTimerRef.current = scoreScalar + Math.random() * 650;
        }

        // Draw overhead caution warnings when obstacle approaches
        if (obstacleActiveRef.current && !hasDodgedSuccess) {
          ctx.save();
          ctx.fillStyle = squatDetectedRef.current ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)';
          ctx.fillRect(0, 140, cW, 35);

          // Danger boundary Line
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.strokeStyle = squatDetectedRef.current ? '#10b981' : '#f43f5e';
          ctx.beginPath();
          ctx.moveTo(0, 140); ctx.lineTo(cW, 140);
          ctx.moveTo(0, 175); ctx.lineTo(cW, 175);
          ctx.stroke();

          // Flash texts
          ctx.restore();
        }
      }

      // Handle items updating
      const items = itemsRef.current;
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];

        if (stateStatusRef.current === 'PLAYING') {
          item.y += item.vy;

          // A. Check Collision with Basket at bottom
          // Basket dimensions: X centered, Y coordinate=430, W=110, H=25
          const basketMinX = basketXRef.current - basketWidthRef.current / 2;
          const basketMaxX = basketXRef.current + basketWidthRef.current / 2;
          const basketMinY = basketYRef.current;
          const basketMaxY = basketYRef.current + basketHeightRef.current;

          const collideX = item.x >= basketMinX - item.radius && item.x <= basketMaxX + item.radius;
          const collideY = item.y + item.radius >= basketMinY && item.y - item.radius <= basketMaxY;

          if (collideX && collideY) {
            // CATCHED!
            items.splice(i, 1);

            if (item.type === 'bomb') {
              soundManager.playExplosion();
              statsRef.current.bombsHit++;
              statsRef.current.lives = Math.max(0, statsRef.current.lives - 1);
              statsRef.current.score = Math.max(0, statsRef.current.score + item.pointsValue);

              createParticles(item.x, item.y, '#f59e0b', 20); // fire sparks
              addFloatingText('-1 NYAWA 💥', item.x, item.y - 15, '#ef4444');

              if (statsRef.current.lives <= 0) {
                saveHighScoreSession();
                onGameEnd({ ...statsRef.current });
              }
            } else if (item.type === 'stone') {
              soundManager.playHurt();
              statsRef.current.score = Math.max(0, statsRef.current.score + item.pointsValue);
              createParticles(item.x, item.y, '#a1a1aa', 10);
              addFloatingText('-10 SCORE 🪨', item.x, item.y - 15, '#fb923c');
            } else if (item.type === 'star') {
              soundManager.playHighScore();
              statsRef.current.score += item.pointsValue;
              statsRef.current.caloriesBurned += 0.85; // mega points bonus kCal
              createParticles(item.x, item.y, '#eab308', 22);
              addFloatingText('+35 STAR! +0.8kCal ⭐', item.x, item.y - 20, '#fbbf24');
            } else {
              // Regular Fruits
              soundManager.playCatch();
              statsRef.current.sliceCount++;
              statsRef.current.score += item.pointsValue;
              statsRef.current.caloriesBurned += 0.15; // +0.15 kcal per fruit caught!

              statsRef.current.comboCount++;
              if (statsRef.current.comboCount > statsRef.current.maxCombo) {
                statsRef.current.maxCombo = statsRef.current.comboCount;
              }

              createParticles(item.x, item.y, item.color, 12);
              addFloatingText(`+${item.pointsValue} ${item.title}`, item.x, item.y - 15, item.color);
            }
            setStats({ ...statsRef.current });
            continue;
          }

          // B. Check missed item
          if (item.y > cH + 30) {
            items.splice(i, 1);
            if (!item.isBomb && !item.isPowerup && item.type !== 'stone') {
              // Missed healthy food -> drop combo
              statsRef.current.comboCount = 0;
              setStats({ ...statsRef.current });
            }
            continue;
          }
        }

        // Draw falling item
        ctx.save();
        ctx.font = `${item.radius * 2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.emoji, item.x, item.y);

        // Neon orbit indicator rings
        ctx.strokeStyle = item.color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Update and Draw Obstacle Beam sequences
      if (obstacleActiveRef.current && stateStatusRef.current === 'PLAYING') {
        obstacleXRef.current += obstacleSpeedRef.current;

        // Visual lightning bolt
        ctx.save();
        ctx.strokeStyle = squatDetectedRef.current ? '#10b981' : '#f43f5e';
        ctx.lineWidth = 5;
        ctx.shadowBlur = 15;
        ctx.shadowColor = squatDetectedRef.current ? '#10b981' : '#f43f5e';

        // Draw jagged bolt across the danger row
        ctx.beginPath();
        let currX = obstacleXRef.current - 120;
        let currY = obstacleYRef.current;
        ctx.moveTo(currX, currY);
        for (let j = 0; j < 6; j++) {
          currX += 20;
          currY = obstacleYRef.current + (j % 2 === 0 ? 15 : -15);
          ctx.lineTo(currX, currY);
        }
        ctx.stroke();

        ctx.font = '24px Arial';
        ctx.fillText('⚡', obstacleXRef.current - 60, obstacleYRef.current + 10);
        ctx.restore();

        // Check crash: If the laser passes the middle of screen and player failed to Crouch!
        const beamCenter = obstacleXRef.current - 60;
        if (beamCenter >= cW / 2 - 40 && beamCenter <= cW / 2 + 40 && setHasDodgedSuccess === null) {
          if (squatDetectedRef.current) {
            setHasDodgedSuccess(true);
            statsRef.current.score += 25;
            statsRef.current.caloriesBurned += 1.2; // squat dodge reward kCal
            soundManager.playStretchingSuccess();
            addFloatingText('PERFECT DODGE! +25', cW / 2, 100, '#10b981');
          } else {
            setHasDodgedSuccess(false);
            soundManager.playHurt();
            statsRef.current.lives = Math.max(0, statsRef.current.lives - 1);
            statsRef.current.score = Math.max(0, statsRef.current.score - 20);
            createParticles(cW / 2, obstacleYRef.current, '#f43f5e', 25);
            addFloatingText('CRASHED! -1 NYAWA ⚡', cW / 2, 120, '#f43f5e');

            if (statsRef.current.lives <= 0) {
              saveHighScoreSession();
              onGameEnd({ ...statsRef.current });
            }
          }
          setStats({ ...statsRef.current });
        }

        // Out of frame
        if (obstacleXRef.current > cW + 120) {
          obstacleActiveRef.current = false;
          setHasDodgedSuccess(null);
        }
      }

      // Draw Particles
      const ptsArr = particlesRef.current;
      for (let i = ptsArr.length - 1; i >= 0; i--) {
        const p = ptsArr[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.gravity) p.vy += p.gravity;
        p.life++;
        p.opacity = Math.max(0, 1 - p.life / p.maxLife);

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0, p.radius * p.opacity), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();

        if (p.life >= p.maxLife) {
          ptsArr.splice(i, 1);
        }
      }

      // Draw floating numbers
      const fTexts = floatingTextsRef.current;
      for (let i = fTexts.length - 1; i >= 0; i--) {
        const ft = fTexts[i];
        ft.y -= 0.85;
        ft.life++;

        ctx.save();
        ctx.fillStyle = ft.color;
        ctx.font = `bold ${14 * ft.scale}px sans-serif`;
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'black';
        ctx.globalAlpha = Math.max(0, 1 - ft.life / ft.maxLife);
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();

        if (ft.life >= ft.maxLife) {
          fTexts.splice(i, 1);
        }
      }

      // 7. Draw the Basket and indicators
      ctx.save();
      // Side boundaries shadow glow
      ctx.fillStyle = squatDetectedRef.current ? 'rgba(52, 211, 153, 0.25)' : 'rgba(56, 189, 248, 0.25)';
      ctx.shadowBlur = 20;
      ctx.shadowColor = squatDetectedRef.current ? '#34d399' : '#38bdf8';

      // Draw beautiful stylized basket bucket
      const bX = basketXRef.current;
      const bY = basketYRef.current;
      const bW = basketWidthRef.current;
      const bH = basketHeightRef.current;

      // Draw shiny neon bottom bar
      ctx.beginPath();
      ctx.roundRect(bX - bW / 2, bY, bW, bH, 10);
      ctx.fillStyle = squatDetectedRef.current ? '#34d399' : '#38bdf8';
      ctx.fill();

      // Net lines inside basket
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let offset = -bW / 2 + 15; offset < bW / 2; offset += 16) {
        ctx.moveTo(bX + offset, bY + bH);
        ctx.lineTo(bX + offset * 0.7, bY + bH + 28);
      }
      ctx.stroke();

      // Bottom support bar
      ctx.lineWidth = 3;
      ctx.strokeStyle = squatDetectedRef.current ? '#059669' : '#0284c7';
      ctx.beginPath();
      ctx.moveTo(bX - bW / 2.7, bY + bH + 28);
      ctx.lineTo(bX + bW / 2.7, bY + bH + 28);
      ctx.stroke();

      // Human/Torso target tracker bubble above the basket to represent the player
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(smoothCentroidX, smoothCentroidY, 15, 0, Math.PI * 2);
      ctx.fillStyle = squatDetectedRef.current ? '#34d399' : '#38bdf8';
      ctx.fill();
      ctx.restore();

      // SQAUGHT WARNING TEXT ON SCREEN
      if (obstacleActiveRef.current && !hasDodgedSuccess) {
        ctx.save();
        ctx.fillStyle = squatDetectedRef.current ? '#34d399' : '#f43f5e';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          squatDetectedRef.current ? '🔒 SQUAT POSITION LOCKED!' : '⚠️ WATCH OUT! DUCK QUICK (SQUAT)!',
          cW / 2, obstacleYRef.current - 22
        );
        ctx.restore();
      }

      // Draw Calibration markers or help on CALIBRATION stage
      if (stateStatusRef.current === 'CALIBRATION') {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, cW, cH);

        // Core instructions
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MENYELARASKAN GERAKAN BADAN (CALIBRATION)', cW / 2, cH / 2 - 45);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.fillText('Geser badanmu ke kiri/kanan. Keranjang harus mengikuti gerakan dadamu.', cW / 2, cH / 2 - 15);

        // Tracking box
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.strokeRect(cW / 2 - 120, cH / 2 + 10, 240, 80);

        // Green tracking circle
        ctx.beginPath();
        ctx.arc(smoothCentroidX, Math.max(cH / 2 + 50, smoothCentroidY), 15, 0, Math.PI * 2);
        ctx.fillStyle = '#34d399';
        ctx.fill();

        ctx.restore();
      }

      // Save previous frames
      prevFrameData = currPixels;

      gameLoopIdRef.current = requestAnimationFrame(tick);
    };

    tick();
  };

  const saveHighScoreSession = () => {
    const curHigh = parseInt(localStorage.getItem('basket_highscore') || '0');
    if (statsRef.current.score > curHigh) {
      localStorage.setItem('basket_highscore', statsRef.current.score.toString());
      soundManager.playHighScore();
    }
    // Also save accumulated calories to local storage
    const totCals = parseFloat(localStorage.getItem('arcade_total_calories') || '0');
    localStorage.setItem('arcade_total_calories', (totCals + statsRef.current.caloriesBurned).toFixed(2));
  };

  return (
    <div className="flex flex-col gap-5 items-center w-full" id="basket-game-engine">
      
      {/* Header telemetry info panel */}
      {status === 'PLAYING' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full animate-fade-in text-xs">
          
          <div className="glass bg-slate-900/40 p-3 rounded-2xl flex items-center justify-between border border-white/5 select-none relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-sky-500/5 rounded-full filter blur-xl" />
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">SKOR ARCADES</p>
              <h2 className="text-xl font-black text-white tracking-tight">{stats.score}</h2>
            </div>
            <span className="text-amber-400 font-bold font-mono">HIGHEST: {stats.highscore}</span>
          </div>

          <div className="glass bg-slate-900/40 p-3 rounded-2xl flex items-center justify-between border border-white/5 select-none relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-full filter blur-xl" />
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">CALORIES BURNT</p>
              <h2 className="text-xl font-black text-rose-500 tracking-tight flex items-center gap-1">
                {stats.caloriesBurned.toFixed(1)} <span className="text-xs font-bold text-rose-400 font-sans">KCAL</span>
              </h2>
            </div>
            <Flame className="w-5 h-5 text-rose-500 animate-pulse shrink-0" />
          </div>

          <div className="glass bg-slate-900/40 p-3 rounded-2xl flex items-center justify-between border border-white/5 select-none text-left">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">SQUATS / DUCKS</p>
              <h2 className="text-xl font-black text-emerald-400 tracking-tight">{stats.squatsCount} x</h2>
            </div>
            <div className={`w-2.5 h-2.5 rounded-full ${isSquatActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
          </div>

          <div className="glass bg-slate-900/40 p-3 rounded-2xl flex items-center justify-between border border-white/5 select-none text-left">
            <div>
              <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">TIMER REMAINING</p>
              <h2 className="text-xl font-black text-amber-400 tracking-tight flex items-center gap-1.5 font-mono">
                <Timer className="w-4 h-4 text-amber-400" /> {stats.sessionTime} <span className="text-xs font-sans text-amber-500">SEC</span>
              </h2>
            </div>
            <div className={`w-2 h-2 rounded-full ${stats.sessionTime <= 10 ? 'bg-rose-500 animate-ping' : 'bg-amber-400 animate-pulse'}`} />
          </div>

        </div>
      )}

      {/* Main Canvas Area */}
      <div className="relative w-full aspect-[4/3] max-w-3xl bg-slate-950/80 rounded-[32px] overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] z-10">
        
        {/* Core webcam feeds */}
        <video 
          ref={videoRef}
          className="hidden"
          playsInline
          muted
        />
        <canvas 
          ref={mainCanvasRef}
          width="640"
          height="480"
          className="w-full h-full object-cover rounded-[30px]"
        />
        <canvas 
          ref={offscreenCanvasRef}
          className="hidden"
        />

        {/* Warning missing body bounds tag */}
        {!isMotionDetected && (
          <div className="absolute inset-x-0 bottom-8 mx-auto max-w-sm bg-rose-950/90 border border-rose-800/40 backdrop-blur-md px-5 py-4 rounded-3xl flex items-center gap-3.5 shadow-22 animate-bounce select-none pointer-events-none text-left">
            <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
            <div>
              <p className="text-xs text-slate-100 font-black uppercase tracking-wide">
                GERAKAN TUBUH TIDAK TERDETEKSI!
              </p>
              <p className="text-[10px] text-slate-300 font-medium">
                Berdirilah sedikit menjauh agar kamera bisa merekam badan Anda secara penuh.
              </p>
            </div>
          </div>
        )}

        {/* Squat popup badge */}
        {isSquatActive && status === 'PLAYING' && (
          <div className="absolute top-4 left-4 bg-emerald-500 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border border-emerald-400 shadow shadow-emerald-500/20 flex items-center gap-1.5 animate-pulse">
            <Flame className="w-4 h-4 text-slate-950 animate-bounce" /> SQUAT POWER UP
          </div>
        )}

        {/* Lives indicators */}
        {status === 'PLAYING' && (
          <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl flex items-center gap-2.5 border border-white/5 select-none font-bold text-xs uppercase tracking-widest text-slate-250">
            LIVES: 
            <div className="flex gap-1">
              {[...Array(3)].map((_, idx) => (
                <span 
                  key={idx} 
                  className={`text-base transition-all duration-300 ${idx < stats.lives ? 'opacity-100 scale-100 filter drop-shadow-[0_0_4px_rgba(239,68,68,0.6)]' : 'opacity-25 scale-75'}`}
                >
                  ❤️
                </span>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Floating control toolbar below game */}
      <div className="flex items-center gap-3 mt-1.5 z-20">
        <button 
          onClick={backToMenu}
          className="bg-white/5 border border-white/10 hover:bg-white/10 text-white font-extrabold px-5 py-2.5 rounded-xl uppercase tracking-widest text-xs transition-all duration-150 cursor-pointer"
          id="btn-basket-quit"
        >
          MENU UTAMA
        </button>

        <button 
          onClick={() => {
            soundManager.playSwipe();
            setSettings(p => ({ ...p, mirrorMode: !p.mirrorMode }));
          }}
          className={`font-semibold px-4 py-2.5 rounded-xl border text-xs uppercase tracking-widest transition-all duration-150 cursor-pointer ${settings.mirrorMode ? 'bg-sky-500/10 text-sky-400 border-sky-400/30' : 'bg-white/5 text-slate-400 border-white/10'}`}
          id="btn-basket-mirror"
        >
          MIRROR {settings.mirrorMode ? 'ON' : 'OFF'}
        </button>

        <button 
          onClick={() => {
            soundManager.playSwipe();
            setSettings(p => ({ ...p, showMotionMap: !p.showMotionMap }));
          }}
          className={`font-semibold px-4 py-2.5 rounded-xl border text-xs uppercase tracking-widest transition-all duration-150 cursor-pointer ${settings.showMotionMap ? 'bg-rose-500/10 text-rose-400 border-rose-400/30' : 'bg-white/5 text-slate-400 border-white/10'}`}
          id="btn-basket-motion"
        >
          SKELETON {settings.showMotionMap ? 'ON' : 'OFF'}
        </button>
      </div>

    </div>
  );
}
