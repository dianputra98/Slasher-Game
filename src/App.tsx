import React, { useState, useEffect } from 'react';
import { GameStatus, TrackingSettings, GameStats } from './types';
import FruitNinjaGame from './components/FruitNinjaGame';
import BodyBasketEngine from './components/BodyBasketEngine';
import BalloonPopEngine from './components/BalloonPopEngine';
import BalanceTrainerEngine from './components/BalanceTrainerEngine';
import StretchingGuide from './components/StretchingGuide';
import GameUI from './components/GameUI';
import { Camera, Flame, Trophy, Activity, Dumbbell, ShieldAlert, Heart } from 'lucide-react';
import { soundManager } from './components/SoundManager';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [status, setStatus] = useState<GameStatus>('START');
  
  // Custom game configurations
  const [settings, setSettings] = useState<TrackingSettings>({
    threshold: 30,
    mirrorMode: true,
    showMotionMap: true,
    trackerType: 'dual',
    videoOpacity: 0.35,
    soundEnabled: true,
    difficulty: 'medium',
    activeGameMode: 'slash_fruits',
    warmupEnabled: true, // Enable Stretching warm-up by default
    therapyLevel: 'normal' // General therapy state: beginner | senior | rehab | normal
  });

  const [stats, setStats] = useState<GameStats>({
    score: 0,
    lives: 3,
    sliceCount: 0,
    comboCount: 0,
    maxCombo: 0,
    bombsHit: 0,
    highscore: 0,
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

  // Load high scores selectively based on mode
  useEffect(() => {
    let key = 'ninja_highscore';
    if (settings.activeGameMode === 'body_basket') key = 'basket_highscore';
    else if (settings.activeGameMode === 'balloon_pop') key = 'balloon_highscore';
    else if (settings.activeGameMode === 'balance_trainer') key = 'balance_highscore';
    
    const saved = localStorage.getItem(key);
    if (saved) {
      setStats(prev => ({ ...prev, highscore: parseInt(saved) }));
    } else {
      setStats(prev => ({ ...prev, highscore: 0 }));
    }
  }, [settings.activeGameMode, status]);

  const handleGameStart = () => {
    setStatus('PLAYING');
  };

  const handleGameEnd = (endStats: GameStats) => {
    setStats(endStats);
    setStatus('GAMEOVER');
  };

  const handleResetHighscore = () => {
    setStats(prev => ({ ...prev, highscore: 0 }));
    soundManager.playHeartLost();
  };

  const handleKalibrasi = () => {
    setStatus('CALIBRATION');
  };

  const handleBackToMenu = () => {
    setStatus('START');
  };

  const handleStartWarmup = () => {
    setStatus('STRETCHING');
  };

  return (
    <div className="min-h-screen bg-slate-950/50 text-slate-100 flex flex-col justify-between py-6 px-4 relative grid-dot">
      {/* Background graphics overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      {/* Upper Navigation Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between border-b border-white/10 pb-5 mb-4 relative z-10 glass px-6 py-4 rounded-2xl select-none">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-sky-450 via-amber-400 to-rose-400 p-2.5 text-slate-950 rounded-xl shadow-md">
            <Dumbbell className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-black tracking-tighter font-sans text-white uppercase italic leading-none">
              MOTION FITNESS <span className="text-sky-450">ARCADE</span>
            </h1>
            <p className="text-[9px] text-slate-400 font-mono tracking-wider mt-0.5 uppercase">
              Webcam Body-Tracking Gym Console
            </p>
          </div>
        </div>

        {/* Dynamic game mode tag indicators */}
        <div className="flex items-center gap-3">
          {status === 'PLAYING' && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-sky-950/45 border border-sky-500/35 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span className="text-[9px] text-sky-400 font-black tracking-widest uppercase">
                {settings.activeGameMode === 'body_basket' ? '🧺 COLLISION ACTIVE' : 
                 settings.activeGameMode === 'balloon_pop' ? '🎈 BALLOON REACH THERAPY' : 
                 settings.activeGameMode === 'balance_trainer' ? '🧘 CORE POSTURE BALANCE' : 
                 '⚔️ SLICING CARDIO'}
              </span>
            </div>
          )}
          <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider bg-white/5 border border-white/10 px-3 py-1 rounded-full">
            Fit Arcade v2.0
          </span>
        </div>
      </header>

      {/* Main Sandbox */}
      <main className="flex-1 flex flex-col items-center justify-center py-4 w-full relative z-10">
        <div className="w-full max-w-4xl flex flex-col gap-6">
          
          {/* STRETCHING WARMUP SCREEN */}
          {status === 'STRETCHING' && (
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="w-full"
              >
                <StretchingGuide 
                  settings={settings}
                  onWarmupComplete={handleGameStart}
                  onExit={handleBackToMenu}
                />
              </motion.div>
            </AnimatePresence>
          )}

          {/* DYNAMIC GAME ENGINE HANDLERS */}
          {settings.activeGameMode === 'slash_fruits' && (status === 'PLAYING' || status === 'CALIBRATION') && (
            <FruitNinjaGame 
              status={status}
              settings={settings}
              setSettings={setSettings}
              onGameEnd={handleGameEnd}
              onGameStart={handleGameStart}
              backToMenu={handleBackToMenu}
            />
          )}

          {settings.activeGameMode === 'body_basket' && (status === 'PLAYING' || status === 'CALIBRATION') && (
            <BodyBasketEngine 
              status={status}
              settings={settings}
              setSettings={setSettings}
              onGameEnd={handleGameEnd}
              onGameStart={handleGameStart}
              backToMenu={handleBackToMenu}
            />
          )}

          {settings.activeGameMode === 'balloon_pop' && (status === 'PLAYING' || status === 'CALIBRATION') && (
            <BalloonPopEngine 
              status={status}
              settings={settings}
              setSettings={setSettings}
              onGameEnd={handleGameEnd}
              onGameStart={handleGameStart}
              backToMenu={handleBackToMenu}
            />
          )}

          {settings.activeGameMode === 'balance_trainer' && (status === 'PLAYING' || status === 'CALIBRATION') && (
            <BalanceTrainerEngine 
              status={status}
              settings={settings}
              setSettings={setSettings}
              onGameEnd={handleGameEnd}
              onGameStart={handleGameStart}
              backToMenu={handleBackToMenu}
            />
          )}

          {/* FRONT-FACING MAIN LOBBY OVERLAYS */}
          {(status === 'START' || status === 'GAMEOVER') && (
            <AnimatePresence mode="wait">
              <motion.div
                key={status}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.3 }}
                className="w-full glass rounded-[36px] p-6 md:p-10 shadow-2xl relative border border-white/10"
              >
                <GameUI 
                  status={status}
                  stats={stats}
                  settings={settings}
                  setSettings={setSettings}
                  onMulaiGame={handleGameStart}
                  onKalibrasi={handleKalibrasi}
                  onResetHighscore={handleResetHighscore}
                  onBackToMenu={handleBackToMenu}
                  onStartWarmup={handleStartWarmup}
                />
              </motion.div>
            </AnimatePresence>
          )}

        </div>
      </main>

      {/* Footer Branding */}
      <footer className="w-full max-w-4xl mx-auto text-center border-t border-white/5 pt-5 mt-6 select-none relative z-10">
        <p className="text-[11px] text-slate-400 font-black uppercase tracking-wider">
          💡 Zero-Sensor Web-Motion Gaming console
        </p>
        <p className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-widest">
          100% Secure Client Camera Sandbox • No Data Uploaded
        </p>
      </footer>
    </div>
  );
}
