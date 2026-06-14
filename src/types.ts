export interface Point {
  x: number;
  y: number;
}

export type FruitType = 'apple' | 'banana' | 'orange' | 'watermelon' | 'coconut' | 'bomb' | 'star' | 'lightning' | 'stone';

export interface Fruit {
  id: string;
  type: FruitType;
  title: string;
  color: string;
  emoji: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isSliced: boolean;
  slicedTime?: number;
  angle: number;
  rotationSpeed: number;
  sliceAngle?: number;
  isBomb: boolean;
  pointsValue: number;
}

export interface BasketItem {
  id: string;
  type: FruitType;
  title: string;
  color: string;
  emoji: string;
  x: number;
  y: number;
  vy: number;
  radius: number;
  pointsValue: number;
  isPowerup?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  opacity: number;
  life: number;
  maxLife: number;
  gravity?: number;
  rotation?: number;
  rotationSpeed?: number;
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface SlashEffect {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  life: number;
  maxLife: number;
  width: number;
}

export interface GameStats {
  score: number;
  lives: number;
  sliceCount: number;
  comboCount: number;
  maxCombo: number;
  bombsHit: number;
  highscore: number;
  accuracy: number;
  fruitsSpawned: number;
  // Fitness Stats & Calorie Estimations
  caloriesBurned: number;
  sessionTime: number; // in seconds
  squatsCount: number;
  // Therapy metrics
  reactionTimes: number[]; // Reaction times for popup events
  movementStreak: number;
  maxStreak: number;
  totalBaloonPops: number;
  avgBalanceStability: number; // For Game 4 balance rating (0-100)
}

export type GameStatus = 'START' | 'CALIBRATION' | 'STRETCHING' | 'PLAYING' | 'GAMEOVER';

export type TrackerType = 'dual' | 'single' | 'grid';

export type GameModeSelection = 'slash_fruits' | 'body_basket' | 'balloon_pop' | 'balance_trainer';

export type TherapyLevel = 'beginner' | 'senior' | 'rehab' | 'normal';

export interface TrackingSettings {
  threshold: number; // Sensitivity of pixel frame differencing (lower = more sensitive)
  mirrorMode: boolean; // Mirror video feed
  showMotionMap: boolean; // Draw red/neon motion dots behind active pixels
  trackerType: TrackerType; // "dual" for Left/Right hand, "single" for main body center, "grid" for matrix collisions
  videoOpacity: number; // Transparency of video background
  soundEnabled: boolean; // Game audio triggers
  difficulty: 'easy' | 'medium' | 'hard';
  activeGameMode: GameModeSelection; // Active fitness mini-game
  warmupEnabled: boolean; // Pre-game dynamic stretching stretching requirement
  therapyLevel: TherapyLevel; // Therapy settings level
}
