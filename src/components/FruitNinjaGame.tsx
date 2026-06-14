import React, { useEffect, useRef, useState } from 'react';
import { 
  Fruit, 
  FruitType, 
  Particle, 
  FloatingText, 
  SlashEffect, 
  GameStats, 
  GameStatus, 
  TrackingSettings, 
  Point 
} from '../types';
import { soundManager } from './SoundManager';
import { Shield, Sparkles, Activity, AlertCircle, RefreshCw, Volume2, VolumeX, Eye, EyeOff, Play, Zap } from 'lucide-react';

interface GameProps {
  status: GameStatus;
  settings: TrackingSettings;
  setSettings: React.Dispatch<React.SetStateAction<TrackingSettings>>;
  onGameEnd: (stats: GameStats) => void;
  onGameStart: () => void;
  backToMenu: () => void;
}

export default function FruitNinjaGame({
  status,
  settings,
  setSettings,
  onGameEnd,
  onGameStart,
  backToMenu
}: GameProps) {
  // Refs for tracking video and canvas elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // States
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [motionIntensity, setMotionIntensity] = useState<number>(0); // active movement meter
  const [calibrationCounter, setCalibrationCounter] = useState<number>(0);
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    lives: 3,
    sliceCount: 0,
    comboCount: 0,
    maxCombo: 0,
    bombsHit: 0,
    highscore: parseInt(localStorage.getItem('ninja_highscore') || '0'),
    accuracy: 100,
    fruitsSpawned: 0,
    caloriesBurned: 0,
    sessionTime: 0,
    squatsCount: 0
  });

  // Gameplay Engine Mutable Values (held in refs for 60fps rendering without React re-render lag)
  const statsRef = useRef<GameStats>({ ...stats });
  const fruitsRef = useRef<Fruit[]>([]);
  const fruitHalvesRef = useRef<any[]>([]); // for split fruits anim
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const slashesRef = useRef<SlashEffect[]>([]);
  const settingsRef = useRef<TrackingSettings>(settings);
  const stateStatusRef = useRef<GameStatus>(status);
  const activeTrackerPointsRef = useRef<{
    left: { x: number; y: number; active: boolean; lastActive: number; trail: Point[] };
    right: { x: number; y: number; active: boolean; lastActive: number; trail: Point[] };
  }>({
    left: { x: 160, y: 240, active: false, lastActive: 0, trail: [] },
    right: { x: 480, y: 240, active: false, lastActive: 0, trail: [] }
  });

  // Track motion detection health
  const lastMotionDetectedTimeRef = useRef<number>(Date.now());
  const isMotionDetectedGloballyRef = useRef<boolean>(true);
  const [isMotionDetectedGlobally, setIsMotionDetectedGlobally] = useState<boolean>(true);

  // Spawn settings
  const spawnTimerRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);
  const gameLoopIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Keep settings ref in sync
  useEffect(() => {
    settingsRef.current = settings;
    soundManager.setEnabled(settings.soundEnabled);
  }, [settings]);

  // Keep stateStatusRef up-to-date to prevent trapped closures
  useEffect(() => {
    stateStatusRef.current = status;
  }, [status]);

  // Handle game state transitions from outer menu
  useEffect(() => {
    if (status === 'PLAYING') {
      // Complete reset
      const savedHigh = parseInt(localStorage.getItem('ninja_highscore') || '0');
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
        sessionTime: 0,
        squatsCount: 0
      };
      setStats(freshStats);
      statsRef.current = freshStats;
      fruitsRef.current = [];
      fruitHalvesRef.current = [];
      particlesRef.current = [];
      floatingTextsRef.current = [];
      slashesRef.current = [];
      lastSpawnTimeRef.current = Date.now();
      spawnTimerRef.current = 1500; // spawn every 1.5s initially
      lastMotionDetectedTimeRef.current = Date.now();
      isMotionDetectedGloballyRef.current = true;
      setIsMotionDetectedGlobally(true);
    }
  }, [status]);

  // Request camera and setup stream
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
            // Start rendering & tracking
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
      console.error(`Error accessing camera (retries left: ${retries}): `, err);
      if (retries > 0 && err.name !== 'NotAllowedError') {
        setTimeout(() => setupWebcam(retries - 1, delay), delay);
      } else {
        setCameraError(
          err.name === 'NotAllowedError' 
            ? 'Akses kamera ditolak. Berikan izin di browser Anda untuk bermain.' 
            : 'Kamera sedang digunakan oleh sesi lain atau tidak ditemukan. Sila sambung kembali.'
        );
      }
    }
  };

  // Launch Fruit logic
  const spawnFruitBunch = (canvasWidth: number, canvasHeight: number) => {
    const diffSetting = settingsRef.current.difficulty;
    let maxQuantity = 1;

    // Difficulty scaling
    const currentScore = statsRef.current.score;
    if (diffSetting === 'easy') {
      maxQuantity = currentScore > 200 ? 2 : 1;
    } else if (diffSetting === 'medium') {
      maxQuantity = currentScore > 400 ? 3 : currentScore > 100 ? 2 : 1;
    } else { // hard
      maxQuantity = currentScore > 500 ? 4 : currentScore > 200 ? 3 : 2;
    }

    const countToSpawn = Math.floor(Math.random() * maxQuantity) + 1;
    statsRef.current.fruitsSpawned += countToSpawn;

    // Fruit definitions
    const fruitTypes: { type: FruitType; title: string; color: string; emoji: string; radius: number; pts: number }[] = [
      { type: 'apple', title: 'Apel', color: '#ff3344', emoji: '🍎', radius: 34, pts: 10 },
      { type: 'orange', title: 'Jeruk', color: '#ffa31a', emoji: '🍊', radius: 32, pts: 10 },
      { type: 'watermelon', title: 'Semangka', color: '#10b981', emoji: '🍉', radius: 46, pts: 15 },
      { type: 'banana', title: 'Pisang', color: '#facc15', emoji: '🍌', radius: 30, pts: 10 },
      { type: 'coconut', title: 'Kelapa', color: '#a1a1aa', emoji: '🥥', radius: 36, pts: 20 },
    ];

    for (let i = 0; i < countToSpawn; i++) {
      // Spawn either fruit or bomb (bombs start spawning with high probability on hard or after score > 50)
      const isBombChance = currentScore > 40 ? (settingsRef.current.difficulty === 'easy' ? 0.08 : settingsRef.current.difficulty === 'medium' ? 0.16 : 0.28) : 0;
      const isBomb = Math.random() < isBombChance;

      let spawnedItem: Fruit;

      if (isBomb) {
        spawnedItem = {
          id: `item-${Date.now()}-${Math.random()}`,
          type: 'bomb',
          title: 'BOM',
          color: '#3f3f46',
          emoji: '💣',
          x: canvasWidth * (0.2 + Math.random() * 0.6),
          y: canvasHeight + 40,
          vx: (Math.random() - 0.5) * 5, // slightly horizontal move
          vy: -(12 + Math.random() * 5), // fly up
          radius: 34,
          isSliced: false,
          angle: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.08,
          isBomb: true,
          pointsValue: -20
        };
      } else {
        const template = fruitTypes[Math.floor(Math.random() * fruitTypes.length)];
        spawnedItem = {
          id: `item-${Date.now()}-${Math.random()}`,
          type: template.type,
          title: template.title,
          color: template.color,
          emoji: template.emoji,
          x: canvasWidth * (0.15 + Math.random() * 0.7),
          y: canvasHeight + 40,
          vx: (Math.random() - 0.5) * 7,
          vy: -(14 + Math.random() * 6), // fly up with realistic gravity
          radius: template.radius,
          isSliced: false,
          angle: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.1,
          isBomb: false,
          pointsValue: template.pts
        };
      }

      fruitsRef.current.push(spawnedItem);
    }
  };

  // Main Motion Engine + Graphics Loop
  const startLoop = () => {
    if (gameLoopIdRef.current) cancelAnimationFrame(gameLoopIdRef.current);
    
    // Core parameters for frame-differencing matrix
    const gridW = 48;
    const gridH = 36;
    let prevFrameData: Uint8ClampedArray | null = null;
    const motionGrid = new Uint8Array(gridW * gridH); // decay trackers

    // Smooth trace vectors
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

      // Ensure offscreen dimensions match downsampled grid size
      offCanvas.width = gridW;
      offCanvas.height = gridH;

      // 1. Capture dynamic frame differencing
      offCtx.save();
      if (settingsRef.current.mirrorMode) {
        offCtx.translate(gridW, 0);
        offCtx.scale(-1, 1);
      }
      offCtx.drawImage(video, 0, 0, gridW, gridH);
      offCtx.restore();

      const currentFrame = offCtx.getImageData(0, 0, gridW, gridH);
      const currPixels = currentFrame.data;

      // Reset active indices statistics
      let sumXLeft = 0;
      let sumYLeft = 0;
      let countLeft = 0;

      let sumXRight = 0;
      let sumYRight = 0;
      let countRight = 0;

      let processedIntensity = 0;

      if (prevFrameData) {
        // Calculate sensitivity threshold multiplier
        const baseThreshold = settingsRef.current.threshold;

        for (let y = 0; y < gridH; y++) {
          for (let x = 0; x < gridW; x++) {
            const idx = (y * gridW + x) * 4;
            // RGB change
            const diff = Math.abs(currPixels[idx] - prevFrameData[idx]) +
                         Math.abs(currPixels[idx + 1] - prevFrameData[idx + 1]) +
                         Math.abs(currPixels[idx + 2] - prevFrameData[idx + 2]);

            // Motion check
            if (diff > baseThreshold) {
              motionGrid[y * gridW + x] = 255; // peak active glow
              processedIntensity++;

              // Split screen left & right or consolidate for single hand mode
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
              // Decay glow trails
              motionGrid[y * gridW + x] = Math.max(0, motionGrid[y * gridW + x] - 12);
            }
          }
        }
      }

      // Read current intensity as percentage of screen moving
      const intensityPct = Math.min(100, Math.floor((processedIntensity / (gridW * gridH)) * 400));
      setMotionIntensity(intensityPct);
      if (stateStatusRef.current === 'PLAYING') {
        statsRef.current.caloriesBurned += 0.0006 + (intensityPct * 0.00005);
      }

      // Track last motion event to warn if screen is frozen
      if (intensityPct > 3) {
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

      // Save previous screen frames
      prevFrameData = currPixels;

      // 2. Hand Centroid Estimation using linear interpolation
      // Map grid space (48x36) to render workspace (640x480)
      if (countLeft > 4) {
        const targetX = (sumXLeft / countLeft) / gridW * cW;
        const targetY = (sumYLeft / countLeft) / gridH * cH;
        
        // Rapid approach with elastic tracking
        trackers.left.x += (targetX - trackers.left.x) * 0.22;
        trackers.left.y += (targetY - trackers.left.y) * 0.22;
        
        // Play quick sweep acoustic chime if distance sweeped is large (fast slash speed!)
        const dist = Math.hypot(targetX - trackers.left.x, targetY - trackers.left.y);
        if (dist > 35 && stateStatusRef.current === 'PLAYING') {
          soundManager.playSwipe();
        }

        trackers.left.active = true;
        trackers.left.lastActive = now;
      } else {
        // slow decay towards static resting center Left
        if (now - trackers.left.lastActive > 800) {
          trackers.left.active = false;
        }
      }

      if (countRight > 4) {
        const targetX = (sumXRight / countRight) / gridW * cW;
        const targetY = (sumYRight / countRight) / gridH * cH;
        
        trackers.right.x += (targetX - trackers.right.x) * 0.22;
        trackers.right.y += (targetY - trackers.right.y) * 0.22;

        const dist = Math.hypot(targetX - trackers.right.x, targetY - trackers.right.y);
        if (dist > 35 && stateStatusRef.current === 'PLAYING') {
          soundManager.playSwipe();
        }

        trackers.right.active = true;
        trackers.right.lastActive = now;
      } else {
        if (now - trackers.right.lastActive > 800) {
          trackers.right.active = false;
        }
      }

      // Handle pointer trailers
      if (trackers.left.active) {
        trackers.left.trail.push({ x: trackers.left.x, y: trackers.left.y });
        if (trackers.left.trail.length > 10) trackers.left.trail.shift();
      } else {
        if (trackers.left.trail.length > 0) trackers.left.trail.shift();
      }

      if (trackers.right.active) {
        trackers.right.trail.push({ x: trackers.right.x, y: trackers.right.y });
        if (trackers.right.trail.length > 10) trackers.right.trail.shift();
      } else {
        if (trackers.right.trail.length > 0) trackers.right.trail.shift();
      }

      // Draw background camera frame under the fruits
      ctx.clearRect(0, 0, cW, cH);
      
      ctx.save();
      ctx.globalAlpha = settingsRef.current.videoOpacity;
      if (settingsRef.current.mirrorMode) {
        ctx.translate(cW, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, cW, cH);
      ctx.restore();

      // Draw futuristic virtual background grids to make the game feel extremely premium
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'; // very dark tint
      ctx.fillRect(0, 0, cW, cH);

      // Aesthetic background sci-fi circles & border glows
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, cW - 20, cH - 20);

      // 3. Render Motion Heat map overlay (if enabled in settings)
      if (settingsRef.current.showMotionMap) {
        const cellW = cW / gridW;
        const cellH = cH / gridH;
        for (let y = 0; y < gridH; y++) {
          for (let x = 0; x < gridW; x++) {
            const val = motionGrid[y * gridW + x];
            if (val > 30) {
              const alpha = (val / 255) * 0.4;
              ctx.fillStyle = `rgba(34, 211, 238, ${alpha})`; // neon cyan movement spots
              ctx.fillRect(x * cellW, y * cellH, cellW - 0.5, cellH - 0.5);
            }
          }
        }
      }

      // 4. Update and Render Gameplay objects (Fruits, Bombs, Slices, Floating Texts)
      if (stateStatusRef.current === 'PLAYING') {
        // Adjust spawning interval
        const currentScore = statsRef.current.score;
        let diffInterval = 1800; // easy
        if (settingsRef.current.difficulty === 'medium') {
          diffInterval = currentScore > 300 ? 1000 : 1400;
        } else if (settingsRef.current.difficulty === 'hard') {
          diffInterval = currentScore > 400 ? 700 : currentScore > 1500 ? 550 : 1100;
        }
        
        if (now - lastSpawnTimeRef.current > diffInterval) {
          spawnFruitBunch(cW, cH);
          lastSpawnTimeRef.current = now;
        }

        // Keep local score in sync for React UI representation
        if (now % 10 === 0) {
          setStats({ ...statsRef.current });
        }
      }

      // Track slice collision detection
      const activeFruits = fruitsRef.current;
      const ongoingSlices: { fx: number; fy: number; tx: number; ty: number; hit: boolean }[] = [];

      // Check grid-based movement collision (checks if a fruit overlaps with an active motion grid cell)
      activeFruits.forEach((fruit) => {
        if (fruit.isSliced) return;

        // Map fruit center to 48x36 grid index
        const fGridX = Math.floor((fruit.x / cW) * gridW);
        const fGridY = Math.floor((fruit.y / cH) * gridH);

        let hitRecorded = false;
        let collisionX = fruit.x;
        let collisionY = fruit.y;

        // Scan neighborhood grid around the fruit
        const scanRadius = Math.max(1, Math.round(fruit.radius / (cW / gridW)));
        
        for (let dy = -scanRadius; dy <= scanRadius; dy++) {
          for (let dx = -scanRadius; dx <= scanRadius; dx++) {
            const gx = fGridX + dx;
            const gy = fGridY + dy;
            if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
              const motionVal = motionGrid[gy * gridW + gx];
              if (motionVal > 140) { // High movement change detected!
                hitRecorded = true;
                collisionX = (gx + 0.5) / gridW * cW;
                collisionY = (gy + 0.5) / gridH * cH;
                break;
              }
            }
          }
          if (hitRecorded) break;
        }

        if (hitRecorded) {
          // Slice fruit!
          fruit.isSliced = true;
          fruit.slicedTime = now;
          
          if (fruit.isBomb) {
            // EXPLOSION BOMB OVERRIDE!
            statsRef.current.bombsHit++;
            statsRef.current.score = Math.max(0, statsRef.current.score + fruit.pointsValue);
            statsRef.current.lives = Math.max(0, statsRef.current.lives - 1);
            
            soundManager.playExplosion();

            // Bomb visual blast wave
            for (let i = 0; i < 40; i++) {
              particlesRef.current.push({
                x: fruit.x,
                y: fruit.y,
                vx: (Math.random() - 0.5) * 24,
                vy: (Math.random() - 0.5) * 24,
                color: i % 2 === 0 ? '#fb923c' : '#ef4444', // fiery orange and red
                radius: 4 + Math.random() * 8,
                opacity: 1,
                life: 0,
                maxLife: 40 + Math.random() * 30,
                gravity: 0.15
              });
            }

            floatingTextsRef.current.push({
              id: `float-${now}-${Math.random()}`,
              text: 'BOMBASTIK! -20 XP',
              x: fruit.x,
              y: fruit.y - 20,
              color: '#ef4444',
              life: 0,
              maxLife: 45,
              scale: 1.4
            });

            // Trigger flash effect
            slashesRef.current.push({
              id: `flash-${now}`,
              x1: 0,
              y1: cH / 2,
              x2: cW,
              y2: cH / 2,
              color: 'rgba(255, 255, 255, 0.95)',
              life: 0,
              maxLife: 15,
              width: cH
            });

            // Check if lives exhausted
            if (statsRef.current.lives <= 0) {
              onGameOverTrigger();
            }
          } else {
            // Sliced normal fruit
            statsRef.current.sliceCount++;
            statsRef.current.score += fruit.pointsValue;
            statsRef.current.caloriesBurned += 0.12;
            const prevCals = parseFloat(localStorage.getItem('arcade_total_calories') || '0');
            localStorage.setItem('arcade_total_calories', (prevCals + 0.12).toFixed(2));

            // Manage Combos! (if sliced within narrow interval of other fruits)
            statsRef.current.comboCount++;
            
            let comboBonus = 0;
            let comboScoreText = `+${fruit.pointsValue}`;

            if (statsRef.current.comboCount > 2) {
              comboBonus = statsRef.current.comboCount * 5;
              statsRef.current.score += comboBonus;
              comboScoreText = `COMBO x${statsRef.current.comboCount}! +${fruit.pointsValue + comboBonus}`;
              
              if (statsRef.current.comboCount > statsRef.current.maxCombo) {
                statsRef.current.maxCombo = statsRef.current.comboCount;
              }
              soundManager.playCombo(statsRef.current.comboCount);
            } else {
              soundManager.playSlice();
            }

            // High Score Check
            if (statsRef.current.score > statsRef.current.highscore) {
              const oldHigh = statsRef.current.highscore;
              statsRef.current.highscore = statsRef.current.score;
              localStorage.setItem('ninja_highscore', statsRef.current.score.toString());
              if (oldHigh > 0 && oldHigh < statsRef.current.score && oldHigh + 20 >= statsRef.current.score) {
                soundManager.playHighScore();
              }
            }

            floatingTextsRef.current.push({
              id: `float-${now}-${Math.random()}`,
              text: comboScoreText,
              x: fruit.x,
              y: fruit.y - 12,
              color: fruit.color,
              life: 0,
              maxLife: 35,
              scale: statsRef.current.comboCount > 2 ? 1.3 : 1.0
            });

            // Create splitting animation mesh
            const sliceAngle = Math.random() * Math.PI;
            fruit.sliceAngle = sliceAngle;

            // Generate fruit halves splits
            fruitHalvesRef.current.push({
              type: fruit.type,
              color: fruit.color,
              emoji: fruit.emoji,
              x: fruit.x - Math.cos(sliceAngle) * 8,
              y: fruit.y - Math.sin(sliceAngle) * 8,
              vx: fruit.vx - Math.cos(sliceAngle) * 4 - 2,
              vy: fruit.vy - 3,
              radius: fruit.radius,
              angle: fruit.angle,
              side: 'left',
              rotationSpeed: -0.12,
              opacity: 1
            });

            fruitHalvesRef.current.push({
              type: fruit.type,
              color: fruit.color,
              emoji: fruit.emoji,
              x: fruit.x + Math.cos(sliceAngle) * 8,
              y: fruit.y + Math.sin(sliceAngle) * 8,
              vx: fruit.vx + Math.cos(sliceAngle) * 4 + 2,
              vy: fruit.vy - 3,
              radius: fruit.radius,
              angle: fruit.angle,
              side: 'right',
              rotationSpeed: 0.12,
              opacity: 1
            });

            // Splash particles
            for (let i = 0; i < 18; i++) {
              particlesRef.current.push({
                x: fruit.x,
                y: fruit.y,
                vx: (Math.random() - 0.5) * 12 + fruit.vx,
                vy: (Math.random() - 0.5) * 12 + (fruit.vy * 0.4),
                color: fruit.color,
                radius: 3 + Math.random() * 6,
                opacity: 0.95,
                life: 0,
                maxLife: 25 + Math.random() * 20,
                gravity: 0.4
              });
            }

            // Create beautiful slice line slash
            slashesRef.current.push({
              id: `slash-${now}-${Math.random()}`,
              x1: fruit.x - Math.cos(sliceAngle) * 45,
              y1: fruit.y - Math.sin(sliceAngle) * 45,
              x2: fruit.x + Math.cos(sliceAngle) * 45,
              y2: fruit.y + Math.sin(sliceAngle) * 45,
              color: '#ffffff',
              life: 0,
              maxLife: 14,
              width: 3.5
            });
          }
        }
      });

      // Update real fruits position
      fruitsRef.current = activeFruits.filter((fruit) => {
        // Physics update
        fruit.x += fruit.vx;
        fruit.y += fruit.vy;
        fruit.vy += 0.35; // GRAVITY
        fruit.angle += fruit.rotationSpeed;

        // Render unsliced fruits as juicy neon custom graphics
        if (!fruit.isSliced) {
          ctx.save();
          ctx.shadowBlur = 12;
          ctx.shadowColor = fruit.color;

          ctx.translate(fruit.x, fruit.y);
          ctx.rotate(fruit.angle);

          // Render beautiful 2D fruit vector drawings or stylized glowing shapes
          ctx.beginPath();
          ctx.arc(0, 0, fruit.radius, 0, Math.PI * 2);
          ctx.fillStyle = fruit.color;
          ctx.fill();

          // Shiny specular reflect line
          ctx.beginPath();
          ctx.ellipse(-fruit.radius * 0.3, -fruit.radius * 0.3, fruit.radius * 0.2, fruit.radius * 0.4, Math.PI / 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.fill();

          // Render Emoji in the center
          ctx.shadowBlur = 0;
          ctx.font = `${fruit.radius * 1.1}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(fruit.emoji, 0, 0);

          ctx.restore();
        }

        // Drop combo tracking if fruit falls past base screen
        if (fruit.y > cH + 100) {
          if (!fruit.isSliced && !fruit.isBomb) {
            // MISSED FRUIT penalizes lives in PLAYING mode
            if (stateStatusRef.current === 'PLAYING') {
              statsRef.current.lives = Math.max(0, statsRef.current.lives - 1);
              soundManager.playHeartLost();

              // Red danger prompt text
              floatingTextsRef.current.push({
                id: `miss-${now}-${Math.random()}`,
                text: 'LUPUT! -❤️',
                x: fruit.x,
                y: cH - 50,
                color: '#f43f5e',
                life: 0,
                maxLife: 30,
                scale: 1.2
              });

              if (statsRef.current.lives <= 0) {
                onGameOverTrigger();
              }
            }
          }
          return false; // delete from screen
        }

        return !fruit.isSliced;
      });

      // Reset Combo multiplier count if no fruits sliced for 2.2 seconds
      if (now % 60 === 0 && statsRef.current.comboCount > 0) {
        statsRef.current.comboCount = 0;
      }

      // Render Cut Fruit Halves with spinning physics
      fruitHalvesRef.current = fruitHalvesRef.current.filter((half) => {
        half.x += half.vx;
        half.y += half.vy;
        half.vy += 0.45; // custom gravity
        half.angle += half.rotationSpeed;
        half.opacity -= 0.02;

        if (half.opacity <= 0 || half.y > cH + 100) {
          return false;
        }

        ctx.save();
        ctx.globalAlpha = half.opacity;
        ctx.translate(half.x, half.y);
        ctx.rotate(half.angle);

        // Draw outer shell
        ctx.beginPath();
        if (half.side === 'left') {
          ctx.arc(0, 0, Math.max(0, half.radius), Math.PI / 2, -Math.PI / 2);
        } else {
          ctx.arc(0, 0, Math.max(0, half.radius), -Math.PI / 2, Math.PI / 2);
        }
        ctx.fillStyle = half.color;
        ctx.fill();

        // Draw inner fruit flash
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (half.side === 'left') {
          ctx.arc(0, 0, Math.max(0, half.radius * 0.85), Math.PI / 2, -Math.PI / 2);
        } else {
          ctx.arc(0, 0, Math.max(0, half.radius * 0.85), -Math.PI / 2, Math.PI / 2);
        }
        ctx.fill();

        // Draw text emoji overlay with half clip
        ctx.font = `${half.radius * 0.9}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.beginPath();
        if (half.side === 'left') {
          ctx.rect(-half.radius * 1.5, -half.radius * 1.5, half.radius * 1.5, half.radius * 3);
        } else {
          ctx.rect(0, -half.radius * 1.5, half.radius * 1.5, half.radius * 3);
        }
        ctx.clip();
        ctx.fillText(half.emoji, 0, 0);

        ctx.restore();
        return true;
      });

      // Update and Draw Slasher trail particles
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.gravity) p.vy += p.gravity;
        p.life++;
        p.opacity = Math.max(0, 1 - (p.life / p.maxLife));

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0, p.radius * p.opacity), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();

        return p.life < p.maxLife;
      });

      // Slices visual effects
      slashesRef.current = slashesRef.current.filter((slash) => {
        slash.life++;
        const prog = slash.life / slash.maxLife;
        const currentAlpha = 1 - prog;

        ctx.save();
        ctx.strokeStyle = slash.color;
        ctx.lineWidth = slash.width * (1 - prog * 0.5);
        ctx.globalAlpha = currentAlpha;
        ctx.shadowBlur = 10;
        ctx.shadowColor = slash.color;
        
        ctx.beginPath();
        ctx.moveTo(slash.x1, slash.y1);
        ctx.lineTo(slash.x2, slash.y2);
        ctx.stroke();
        ctx.restore();

        return slash.life < slash.maxLife;
      });

      // Render Hand Tracking Skeletons & markers on foreground
      if (trackers.left.active) {
        drawGlowCursor(ctx, trackers.left.x, trackers.left.y, '#22d3ee', trackers.left.trail); // cyanish neon
      }
      if (trackers.right.active) {
        drawGlowCursor(ctx, trackers.right.x, trackers.right.y, '#f43f5e', trackers.right.trail); // redish pink neon
      }

      // Draw skeleton linkage if both hands active
      if (trackers.left.active && trackers.right.active) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(trackers.left.x, trackers.left.y);
        ctx.lineTo(trackers.right.x, trackers.right.y);
        ctx.stroke();

        // Connect both to center chest pivot for a humanoid skeleton look!
        const chestX = (trackers.left.x + trackers.right.x) * 0.5;
        const chestY = Math.max(trackers.left.y, trackers.right.y) + 120;
        ctx.beginPath();
        ctx.lineTo(trackers.left.x, trackers.left.y);
        ctx.lineTo(chestX, chestY);
        ctx.lineTo(trackers.right.x, trackers.right.y);
        ctx.stroke();

        // Chest core micro core
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#38bdf8';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.beginPath();
        ctx.arc(chestX, chestY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Render Floating Text indications (e.g. "+10", "LUPUT!")
      floatingTextsRef.current = floatingTextsRef.current.filter((ft) => {
        ft.life++;
        ft.y -= 1.4; // move slowly upward

        const progress = ft.life / ft.maxLife;
        const alpha = 1 - progress;

        ctx.save();
        ctx.fillStyle = ft.color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = ft.color;
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(18 * ft.scale)}px "Space Grotesk", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();

        return ft.life < ft.maxLife;
      });

      // Continue game execution frames
      gameLoopIdRef.current = requestAnimationFrame(tick);
    };

    gameLoopIdRef.current = requestAnimationFrame(tick);
  };

  // Draw cyber glow pointer + trails
  const drawGlowCursor = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, trail: Point[]) => {
    ctx.save();
    
    // Draw trail
    if (trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) {
        ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 14;
      ctx.shadowColor = color;
      ctx.stroke();
    }

    // Outer ring pulse
    const pulseRadius = 14 + Math.sin(Date.now() / 100) * 3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, pulseRadius), 0, Math.PI * 2);
    ctx.stroke();

    // Solid inner core
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Trigger game loss sequence
  const onGameOverTrigger = () => {
    // Terminate state
    if (gameLoopIdRef.current) cancelAnimationFrame(gameLoopIdRef.current);
    soundManager.playGameOver();
    onGameEnd({ ...statsRef.current });
  };

  // Switch difficulty UI handler
  const handleDifficultyToggle = (diff: 'easy' | 'medium' | 'hard') => {
    setSettings(prev => ({ ...prev, difficulty: diff }));
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto items-center relative z-10">
      {/* Upper Panel Status Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full px-2">
        {/* Status Kamera */}
        <div className="glass rounded-2xl p-4 flex items-center justify-between shadow-lg select-none">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'} shadow-[0_0_10px_rgba(52,211,153,0.5)]`} />
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Camera Feed</p>
              <h4 className="text-sm font-black text-white uppercase tracking-wide">
                {cameraActive ? 'LIVE READY' : 'DISCONNECTED'}
              </h4>
            </div>
          </div>
          <button 
            onClick={setupWebcam}
            title="Reconnect Camera"
            className="p-2 hover:bg-white/10 rounded-xl text-sky-400 hover:text-sky-300 transition-colors cursor-pointer border border-white/5 bg-white/5"
            id="btn-reconnect-webcam"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Status Gerakan Tubuh / Sensitivitas */}
        <div className="glass rounded-2xl p-4 flex flex-col justify-between shadow-lg select-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-sky-400 animate-pulse" />
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Frame Motion</p>
                <h4 className="text-sm font-black text-white">
                  {motionIntensity > 3 ? `${motionIntensity}% INTENSITY` : 'CALCULATING...'}
                </h4>
              </div>
            </div>
            {isMotionDetectedGlobally ? (
              <span className="text-[10px] bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-lg font-bold tracking-wider">OK</span>
            ) : (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-lg font-bold animate-pulse tracking-wider">STILL</span>
            )}
          </div>
          {/* Progress bar of motion strength */}
          <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-sky-400 h-full transition-all duration-75"
              style={{ width: `${Math.min(100, motionIntensity)}%` }}
            />
          </div>
        </div>

        {/* Skor Dashboard */}
        <div className="glass rounded-2xl p-4 flex items-center justify-between shadow-lg select-none">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Score</p>
              <h4 className="text-sm font-black text-white">
                SCORE: <span className="text-amber-400 font-mono text-base font-black">{stats.score}</span>
              </h4>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Difficulty</p>
            <span className="capitalize text-[10px] font-black text-sky-400 px-2.5 py-0.5 bg-white/5 rounded-full border border-white/10 tracking-widest">
              {settings.difficulty}
            </span>
          </div>
        </div>
      </div>

      {/* Camera Warnings */}
      {cameraError && (
        <div className="w-full bg-rose-950/60 border border-rose-500/30 text-rose-200 px-4 py-3 rounded-2xl flex items-center gap-3 text-sm font-sans block max-w-4xl" id="camera-error-banner">
          <AlertCircle className="w-5 h-5 text-rose-450 shrink-0 animate-bounce" />
          <div className="flex-1">
            <p className="font-medium">{cameraError}</p>
          </div>
          <button 
            onClick={setupWebcam}
            className="bg-rose-500 hover:bg-rose-450 text-white text-xs font-black uppercase px-4 py-2 rounded-xl cursor-pointer transition border border-rose-400"
            id="btn-retry-camera"
          >
            Retry Feed
          </button>
        </div>
      )}

      {/* Main Interactive Screen Segment */}
      <div className="relative w-full aspect-[4/3] max-w-3xl bg-slate-950/80 rounded-[32px] overflow-hidden border border-white/15 shadow-2xl">
        {/* Hidden video stream element used for frame grabbing */}
        <video 
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover hidden"
          playsInline
          muted
        />

        {/* The canvas rendering our beautiful custom design element */}
        <canvas 
          ref={mainCanvasRef}
          className="absolute inset-0 w-full h-full object-cover"
          width={640}
          height={480}
          id="webcam-ninja-canvas"
        />

        {/* Invisible canvas for offscreen pixels computations */}
        <canvas 
          ref={offscreenCanvasRef}
          className="hidden"
          width={48}
          height={36}
        />

        {/* UI Overlay Indicators during gameplay */}
        {status === 'PLAYING' && (
          <div className="absolute inset-x-0 top-0 p-4 flex justify-between items-start pointer-events-none select-none">
            {/* Lives Heart system */}
            <div className="flex gap-2.5 bg-white/5 backdrop-blur-md px-3 font-semibold text-white py-2 rounded-2xl border border-white/10 items-center">
              <span className="text-[10px] text-slate-300 uppercase font-black tracking-widest mr-1">LIVES:</span>
              {[...Array(3)].map((_, i) => (
                <span 
                  key={i} 
                  className={`text-xl transition-all duration-300 ${i < stats.lives ? 'text-rose-500 scale-100 animate-pulse' : 'text-slate-600 scale-75 opacity-30'}`}
                >
                  ❤️
                </span>
              ))}
            </div>

            {/* Live stats */}
            <div className="flex flex-col gap-1 items-end">
              <div className="bg-white/5 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/10 text-right flex items-center gap-2">
                <div>
                  <span className="text-[9px] text-slate-300 uppercase font-black block tracking-widest">CALORIES</span>
                  <span className="text-rose-400 font-mono text-sm font-black">{stats.caloriesBurned.toFixed(1)} KCAL</span>
                </div>
                <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-ping" />
              </div>
              <div className="bg-white/5 backdrop-blur-md px-3 py-1 rounded-xl border border-white/10 text-[10px] text-sky-305 font-mono font-bold mt-1 uppercase">
                Slices: {stats.sliceCount} | Best: {stats.highscore}
              </div>
            </div>
          </div>
        )}

        {/* Calibration instructions overlay */}
        {status === 'CALIBRATION' && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none">
            <div className="w-16 h-16 bg-sky-500/20 rounded-full flex items-center justify-center border border-sky-400/30 shadow-[0_0_15px_rgba(14,165,233,0.3)] mb-4 animate-pulse">
              <Shield className="w-8 h-8 text-sky-400" />
            </div>
            <h3 className="text-xl font-black text-white mb-2 font-sans uppercase tracking-tight">CAMERA CALIBRATION</h3>
            <p className="text-sm text-slate-300 max-w-sm mb-6 leading-relaxed">
              Wave your hand or shake your body to align the motion trails tracker. Adjust sensitivity below to adapt to your room lighting.
            </p>

            <div className="w-full max-w-sm bg-white/5 border border-white/10 p-5 rounded-2xl mb-6">
              <label className="text-xs text-sky-300 font-bold mb-3 block text-left uppercase tracking-wider">
                Ambang Batas Deteksi (Sensitivitas): {settings.threshold}
              </label>
              <input 
                type="range"
                min="15"
                max="80"
                value={settings.threshold}
                onChange={(e) => setSettings(prev => ({ ...prev, threshold: parseInt(e.target.value) }))}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-sky-400"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-mono uppercase tracking-wider">
                <span>Highly Sensitive (15)</span>
                <span>Standard (35)</span>
                <span>Less Sensitive (80)</span>
              </div>
            </div>

            <button 
              onClick={backToMenu}
              className="bg-sky-500 hover:bg-sky-400 text-white font-extrabold px-6 py-3 rounded-xl cursor-pointer shadow-[0_0_15px_rgba(14,165,233,0.3)] transition-all font-sans uppercase tracking-widest text-xs"
              id="btn-confirm-calibration"
            >
              SAVE & GO BACK
            </button>
          </div>
        )}

        {/* Movement check reminder for users */}
        {!isMotionDetectedGlobally && status === 'PLAYING' && (
          <div className="absolute inset-x-0 bottom-12 mx-auto max-w-xs bg-sky-950/90 border border-sky-800/40 backdrop-blur-md px-4 py-3 rounded-xl flex items-center gap-3 shadow-2xl animate-bounce select-none pointer-events-none">
            <AlertCircle className="w-5 h-5 text-sky-400 shrink-0" />
            <p className="text-xs text-slate-200 font-medium">
              No motion detected! Please wave your hands in front of the camera.
            </p>
          </div>
        )}
      </div>

      {/* Bottom Panel Custom controls and toggle guides */}
      <div className="glass w-full rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 select-none font-sans">
        <div className="flex flex-col gap-1 text-center md:text-left">
          <h4 className="text-sm font-black text-white flex items-center gap-2 justify-center md:justify-start uppercase tracking-wider">
            <Zap className="w-4 h-4 text-sky-400" /> SLICING INSTRUCTIONS
          </h4>
          <p className="text-xs text-slate-300 max-w-md leading-relaxed">
            Quickly swipe your hand across the objects. The neon motion circles highlight active points on screen. Remember to dodge the black electrical bombs!
          </p>
        </div>

        {/* Dashboard Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* Sound enable toggle */}
          <button 
            onClick={() => setSettings(p => ({ ...p, soundEnabled: !p.soundEnabled }))}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${settings.soundEnabled ? 'bg-sky-950/30 border-sky-500/30 text-sky-400' : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200'}`}
            title="FX Audio Enable"
            id="btn-toggle-game-audio"
          >
            {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Draw movement markers map toggle */}
          <button 
            onClick={() => setSettings(p => ({ ...p, showMotionMap: !p.showMotionMap }))}
            className={`p-3 rounded-xl border transition-all cursor-pointer ${settings.showMotionMap ? 'bg-sky-950/30 border-sky-500/30 text-sky-400' : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200'}`}
            title="Toggle Heatmap Vectors"
            id="btn-toggle-motion-map"
          >
            {settings.showMotionMap ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* Mirror mode toggler */}
          <button 
            onClick={() => setSettings(p => ({ ...p, mirrorMode: !p.mirrorMode }))}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer uppercase tracking-wider ${settings.mirrorMode ? 'bg-sky-950/30 border-sky-500/30 text-sky-300' : 'bg-white/5 border-white/10 text-slate-400'}`}
            id="btn-toggle-mirror"
          >
            {settings.mirrorMode ? 'MIRROR: ON' : 'MIRROR: OFF'}
          </button>

          {/* Hands tracker mode selector (1 vs 2 hands) */}
          <button 
            onClick={() => {
              soundManager.playSwipe();
              setSettings(p => ({ ...p, trackerType: p.trackerType === 'single' ? 'dual' : 'single' }));
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer uppercase tracking-wider ${settings.trackerType === 'single' ? 'bg-amber-955/30 border-amber-500/30 text-amber-300' : 'bg-sky-955/30 border-sky-500/30 text-sky-305'}`}
            id="btn-toggle-hands"
          >
            {settings.trackerType === 'single' ? '🖐️ 1 TANGAN' : '🙌 2 TANGAN'}
          </button>
        </div>
      </div>
    </div>
  );
}
