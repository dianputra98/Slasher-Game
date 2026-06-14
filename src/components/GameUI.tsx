import React, { useEffect, useState } from 'react';
import { GameStats, TrackingSettings, GameStatus, GameModeSelection } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Sparkles, 
  Activity, 
  Settings, 
  Play, 
  Zap, 
  Flame, 
  Undo,
  Volume2, 
  VolumeX,
  Target, 
  Dumbbell,
  Heart,
  Camera,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { soundManager } from './SoundManager';

interface GameUIProps {
  status: GameStatus;
  stats: GameStats;
  settings: TrackingSettings;
  setSettings: React.Dispatch<React.SetStateAction<TrackingSettings>>;
  onMulaiGame: () => void;
  onKalibrasi: () => void;
  onResetHighscore: () => void;
  onBackToMenu: () => void;
  onStartWarmup: () => void;
}

export default function GameUI({
  status,
  stats,
  settings,
  setSettings,
  onMulaiGame,
  onKalibrasi,
  onResetHighscore,
  onBackToMenu,
  onStartWarmup
}: GameUIProps) {
  const [totalCalsBurned, setTotalCalsBurned] = useState<number>(0);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);

  // Sync general lifetime statistics on menu mount
  useEffect(() => {
    const rawCals = localStorage.getItem('arcade_total_calories');
    if (rawCals) {
      setTotalCalsBurned(parseFloat(rawCals));
    }
  }, [status]);

  const getRank = (score: number) => {
    if (score === 0) return 'Fitness Amateur 🧘';
    if (score < 100) return 'Active Competitor 🏃';
    if (score < 300) return 'Arcade Champion ⚡';
    if (score < 600) return 'Cardio Specialist 🔥';
    return 'Ultimate Elite Athlete 👑';
  };

  const handleResetAllLifetime = () => {
    if (confirm('Yakin ingin mereset seluruh statistik kebugaran Anda? Ini tidak bisa diubah.')) {
      localStorage.removeItem('ninja_highscore');
      localStorage.removeItem('basket_highscore');
      localStorage.removeItem('arcade_total_calories');
      setTotalCalsBurned(0);
      onResetHighscore();
    }
  };

  if (status === 'START') {
    return (
      <div className="flex flex-col items-center justify-center p-2 text-center select-none font-sans" id="lobby-panel">
        
        {/* Header Branding */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative mb-6"
        >
          <div className="w-16 h-16 bg-gradient-to-tr from-sky-400 via-amber-400 to-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10 shadow-[0_0_20px_rgba(251,191,36,0.15)] animate-pulse">
            <Dumbbell className="w-8 h-8 text-slate-950 stroke-[2.5]" />
          </div>
          <span className="text-[10px] bg-sky-950/60 font-black border border-sky-800 text-sky-450 px-3.5 py-1 rounded-full tracking-widest uppercase mb-2 inline-block">
            60 FPS CAMERA MOTION RECOGNITION
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tighter uppercase italic">
            MOTION <span className="text-sky-400 font-black">FITNESS</span> <span className="text-amber-400 font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">ARCADE</span>
          </h1>
          <p className="text-xs text-slate-350 mt-1 max-w-md mx-auto leading-relaxed">
            Nyalakan kamera Anda, lompati visual, goyang badan, dan tumpas kalori langsung dalam game interaktif tanpa sensor fisik tambahan!
          </p>
        </motion.div>

        {/* Lifetime Fitness Stats Overlay Panel */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="grid grid-cols-2 gap-3 w-full max-w-lg bg-white/5 border border-white/10 p-4 rounded-2xl mb-6 text-left select-none relative"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
              <Flame className="w-5 h-5 text-rose-500 animate-pulse" />
            </div>
            <div>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">BURNED LIFESTYLE</p>
              <h4 className="text-base font-black text-rose-400 font-mono italic">{totalCalsBurned.toFixed(1)} <span className="text-[10px] font-sans">KCAL</span></h4>
            </div>
          </div>

          <div className="flex items-center gap-2.5 justify-end border-l border-white/10 pl-3">
            <div className="text-right">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">ATHLETE CLASSIFY</p>
              <h4 className="text-xs font-black text-amber-400 uppercase tracking-tight">{getRank(totalCalsBurned > 100 ? 500 : totalCalsBurned * 4)}</h4>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center border border-amber-400/20">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
          </div>
        </motion.div>

        {/* Dynamic Warmup selection toggle check */}
        <div className="w-full max-w-lg mb-6 glass px-4 py-3 rounded-2xl border border-white/10 flex justify-between items-center text-left select-none">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-sky-400" />
            <div>
              <p className="text-xs font-bold text-slate-100 uppercase tracking-tight">PRE-GAME STRETCHING GUIDE</p>
              <p className="text-[10px] text-slate-400 leading-none">Rekomendasi pemanasan otot 1 menit sebelum bermain.</p>
            </div>
          </div>
          <button 
            onClick={() => {
              soundManager.playSwipe();
              setSettings(p => ({ ...p, warmupEnabled: !p.warmupEnabled }));
            }}
            className={`px-3 py-1.5 rounded-xl border text-[10px] font-extrabold uppercase tracking-wider transition duration-150 cursor-pointer ${settings.warmupEnabled ? 'bg-sky-500/20 text-sky-400 border-sky-400/40' : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'}`}
            id="toggle-warmup"
          >
            {settings.warmupEnabled ? 'REQUIRED ✅' : 'OPTIONAL ❌'}
          </button>
        </div>

        {/* 4 MINI GAME SELECTION CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg mb-6">
          
          {/* GAME CARD 1: SLASH FRUITS */}
          <div 
            onClick={() => {
              soundManager.playSwipe();
              setSettings(p => ({ ...p, activeGameMode: 'slash_fruits' }));
              if (settings.warmupEnabled) {
                onStartWarmup();
              } else {
                onMulaiGame();
              }
            }}
            className={`group rounded-3xl p-4 border text-left cursor-pointer transition-all duration-300 relative overflow-hidden select-none hover:-translate-y-1 ${settings.activeGameMode === 'slash_fruits' ? 'bg-slate-900/60 border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.15)] ring-1 ring-orange-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
            id="card-game-slash"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/10 rounded-full filter blur-xl group-hover:scale-125 transition-all" />
            <div className="flex justify-between items-start mb-2">
              <span className="text-xl">⚔️</span>
              <span className="text-[8px] font-black bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full uppercase tracking-wider border border-orange-500/30">
                SWIFT SLASH
              </span>
            </div>
            <h3 className={`text-sm font-black italic tracking-wide group-hover:text-amber-300 transition-colors ${settings.activeGameMode === 'slash_fruits' ? 'text-orange-400' : 'text-white'}`}>
              1. SLASH FRUITS
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
              Ayunkan tangan cepat untuk memotong buah. Bagus untuk cardio tubuh bagian atas!
            </p>
            <div className="mt-3 flex items-center justify-between text-[9px] border-t border-white/5 pt-1.5 font-semibold">
              <span className="text-slate-400">BEST: {localStorage.getItem('ninja_highscore') || '0'} pts</span>
              <span className="text-orange-450 flex items-center gap-0.5">PLAY <Play className="w-2 h-2 text-orange-400" /></span>
            </div>
          </div>

          {/* GAME CARD 2: BODY BASKET */}
          <div 
            onClick={() => {
              soundManager.playSwipe();
              setSettings(p => ({ ...p, activeGameMode: 'body_basket' }));
              if (settings.warmupEnabled) {
                onStartWarmup();
              } else {
                onMulaiGame();
              }
            }}
            className={`group rounded-3xl p-4 border text-left cursor-pointer transition-all duration-300 relative overflow-hidden select-none hover:-translate-y-1 ${settings.activeGameMode === 'body_basket' ? 'bg-slate-900/60 border-sky-500/40 shadow-[0_0_20px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
            id="card-game-basket"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-sky-500/10 rounded-full filter blur-xl group-hover:scale-125 transition-all" />
            <div className="flex justify-between items-start mb-2">
              <span className="text-xl">🧺</span>
              <span className="text-[8px] font-black bg-sky-500/20 text-sky-450 px-2 py-0.5 rounded-full uppercase tracking-wider border border-sky-500/30">
                SQUATS CORE
              </span>
            </div>
            <h3 className={`text-sm font-black italic tracking-wide group-hover:text-sky-350 transition-colors ${settings.activeGameMode === 'body_basket' ? 'text-sky-400' : 'text-white'}`}>
              2. BODY BASKET
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
              Geser tubuh mendatar untuk menangkap buah. Latihan squat untuk menghindari petir!
            </p>
            <div className="mt-3 flex items-center justify-between text-[9px] border-t border-white/5 pt-1.5 font-semibold">
              <span className="text-slate-400">BEST: {localStorage.getItem('basket_highscore') || '0'} pts</span>
              <span className="text-sky-450 flex items-center gap-0.5">PLAY <Play className="w-2 h-2 text-sky-450" /></span>
            </div>
          </div>

          {/* GAME CARD 3: BALLOON POP */}
          <div 
            onClick={() => {
              soundManager.playSwipe();
              setSettings(p => ({ ...p, activeGameMode: 'balloon_pop' }));
              if (settings.warmupEnabled) {
                onStartWarmup();
              } else {
                onMulaiGame();
              }
            }}
            className={`group rounded-3xl p-4 border text-left cursor-pointer transition-all duration-300 relative overflow-hidden select-none hover:-translate-y-1 ${settings.activeGameMode === 'balloon_pop' ? 'bg-slate-900/60 border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
            id="card-game-balloon"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/10 rounded-full filter blur-xl group-hover:scale-125 transition-all" />
            <div className="flex justify-between items-start mb-2">
              <span className="text-xl">🎈</span>
              <span className="text-[8px] font-black bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full uppercase tracking-wider border border-rose-500/30">
                REACH MOBILITY
              </span>
            </div>
            <h3 className={`text-sm font-black italic tracking-wide group-hover:text-rose-350 transition-colors ${settings.activeGameMode === 'balloon_pop' ? 'text-rose-400' : 'text-white'}`}>
              3. BALLOON POP
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
              Sentuh balon terapung lambat. Didesain untuk shoulder, stretching, dan koordinasi!
            </p>
            <div className="mt-3 flex items-center justify-between text-[9px] border-t border-white/5 pt-1.5 font-semibold">
              <span className="text-slate-400">BEST: {localStorage.getItem('balloon_highscore') || '0'} pts</span>
              <span className="text-rose-450 flex items-center gap-0.5">PLAY <Play className="w-2 h-2 text-rose-400" /></span>
            </div>
          </div>

          {/* GAME CARD 4: BALANCE TRAINER */}
          <div 
            onClick={() => {
              soundManager.playSwipe();
              setSettings(p => ({ ...p, activeGameMode: 'balance_trainer' }));
              if (settings.warmupEnabled) {
                onStartWarmup();
              } else {
                onMulaiGame();
              }
            }}
            className={`group rounded-3xl p-4 border text-left cursor-pointer transition-all duration-300 relative overflow-hidden select-none hover:-translate-y-1 ${settings.activeGameMode === 'balance_trainer' ? 'bg-slate-900/60 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
            id="card-game-balance"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full filter blur-xl group-hover:scale-125 transition-all" />
            <div className="flex justify-between items-start mb-2">
              <span className="text-xl">🧘</span>
              <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-405 px-2 py-0.5 rounded-full uppercase tracking-wider border border-emerald-500/30">
                BALANCE CORE
              </span>
            </div>
            <h3 className={`text-sm font-black italic tracking-wide group-hover:text-emerald-350 transition-colors ${settings.activeGameMode === 'balance_trainer' ? 'text-emerald-400' : 'text-white'}`}>
              4. BALANCE TRAINER
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
              Miringkan badan dengan lembut untuk seimbang. Melatih core stability dan anti-fall lansia!
            </p>
            <div className="mt-3 flex items-center justify-between text-[9px] border-t border-white/5 pt-1.5 font-semibold">
              <span className="text-slate-400">BEST: {localStorage.getItem('balance_highscore') || '0'} pts</span>
              <span className="text-emerald-450 flex items-center gap-0.5">PLAY <Play className="w-2 h-2 text-emerald-400" /></span>
            </div>
          </div>

        </div>

        {/* Quick Settings Bar */}
        <div className="w-full max-w-lg bg-white/5 border border-white/10 p-5 rounded-3xl mb-6 text-left space-y-4">
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <span className="text-[9px] text-sky-400 font-extrabold uppercase tracking-widest block mb-1.5">CAMERA OPTIONS</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    soundManager.playSwipe();
                    setSettings(p => ({ ...p, mirrorMode: !p.mirrorMode }));
                  }}
                  className={`flex-1 py-2 px-2 rounded-xl text-[10px] font-extrabold uppercase border cursor-pointer select-none ${settings.mirrorMode ? 'bg-sky-500/10 text-sky-400 border-sky-400/30' : 'bg-transparent border-white/10 text-slate-450'}`}
                  id="mirror-lobby"
                >
                  Mirrored {settings.mirrorMode ? 'ON' : 'OFF'}
                </button>
                <button 
                  onClick={() => {
                    soundManager.playSwipe();
                    setSettings(p => ({ ...p, soundEnabled: !p.soundEnabled }));
                  }}
                  className={`px-3.5 py-2 rounded-xl border cursor-pointer select-none flex items-center justify-center ${settings.soundEnabled ? 'bg-sky-500/10 text-sky-400 border-sky-400/30' : 'bg-transparent border-white/10 text-slate-450'}`}
                  id="audio-lobby"
                >
                  {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <span className="text-[9px] text-sky-400 font-extrabold uppercase tracking-widest block mb-1.5">DETEKSI TANGAN</span>
              <div className="flex gap-1 bg-black/30 p-0.5 rounded-xl border border-white/5 select-none">
                <button 
                  onClick={() => {
                    soundManager.playSwipe();
                    setSettings(p => ({ ...p, trackerType: 'single' }));
                  }}
                  className={`flex-1 py-1.5 px-1 rounded-lg text-[9px] font-black uppercase cursor-pointer transition ${settings.trackerType === 'single' ? 'bg-sky-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
                  id="tracker-lobby-single"
                >
                  🖐️ 1 Tangan
                </button>
                <button 
                  onClick={() => {
                    soundManager.playSwipe();
                    setSettings(p => ({ ...p, trackerType: 'dual' }));
                  }}
                  className={`flex-1 py-1.5 px-1 rounded-lg text-[9px] font-black uppercase cursor-pointer transition ${settings.trackerType === 'dual' ? 'bg-sky-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
                  id="tracker-lobby-dual"
                >
                  🙌 2 Tangan
                </button>
              </div>
            </div>

            <div>
              <span className="text-[9px] text-sky-400 font-extrabold uppercase tracking-widest block mb-1.5">ARCADE DIFFICULTY</span>
              <div className="flex gap-1 bg-black/30 p-0.5 rounded-xl border border-white/5 select-none">
                {(['easy', 'medium', 'hard'] as const).map((diff) => (
                  <button 
                    key={diff}
                    onClick={() => {
                      soundManager.playSwipe();
                      setSettings(p => ({ ...p, difficulty: diff }));
                    }}
                    className={`flex-1 py-1.5 px-1 rounded-lg text-[9px] font-black uppercase cursor-pointer transition ${settings.difficulty === diff ? 'bg-sky-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
                    id={`diff-lobby-${diff}`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/5">
            <span className="text-[9px] text-sky-400 font-extrabold uppercase tracking-widest block mb-1.5">TERAPI PRESET (THERAPY DIFFICULTY CONFIG)</span>
            <div className="grid grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/5 select-none">
              {(['rehab', 'senior', 'beginner', 'normal'] as const).map((lvl) => {
                const label = lvl === 'rehab' ? '💖 Rehab / Terapi' : 
                              lvl === 'senior' ? '👵 Senior Fit' : 
                              lvl === 'beginner' ? '👶 Newbie Starter' : '🟢 Normal Arcade';
                const desc = lvl === 'rehab' ? 'Sangat lambat, waktu ekstra, tanpa penalty' : 
                             lvl === 'senior' ? 'Gerakan seimbang lambat, target besar' : 
                             lvl === 'beginner' ? 'Pacing santai & ramah pemula' : 'Kecepatan standar tantangan fisik';

                return (
                  <button 
                    key={lvl}
                    onClick={() => {
                      soundManager.playSwipe();
                      setSettings(p => ({ ...p, therapyLevel: lvl }));
                    }}
                    className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase cursor-pointer transition text-left flex flex-col justify-center ${settings.therapyLevel === lvl ? 'bg-sky-500 text-slate-950 font-black shadow-[0_0_10px_rgba(14,165,240,0.3)]' : 'text-slate-450 hover:bg-white/5 hover:text-white'}`}
                  >
                    <span className="font-extrabold text-[10px]">{label}</span>
                    <span className={`text-[8px] font-semibold mt-0.5 lowercase font-sans block truncate ${settings.therapyLevel === lvl ? 'text-slate-950 font-bold opacity-90' : 'text-slate-500'}`}>{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-white/5 flex items-center justify-between">
            <button 
              onClick={() => {
                soundManager.playSwipe();
                onKalibrasi();
              }}
              className="text-xs text-sky-400 hover:text-sky-305 flex items-center gap-1 font-bold cursor-pointer"
              id="lobby-btn-calib"
            >
              <Settings className="w-3.5 h-3.5" /> ADJUST DETECTION AREA (CALIBRATE)
            </button>

            {totalCalsBurned > 0 && (
              <button 
                onClick={handleResetAllLifetime}
                className="text-[10px] text-slate-450 hover:text-rose-400 transition cursor-pointer"
                id="lobby-btn-reset-lifetime"
              >
                Reset All Records
              </button>
            )}
          </div>
        </div>

        {/* Instructions trigger */}
        <button 
          onClick={() => {
            soundManager.playSwipe();
            setShowInstructions(!showInstructions);
          }}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-bold cursor-pointer transition"
          id="btn-toggle-instructions"
        >
          <HelpCircle className="w-4 h-4 text-sky-400" /> Cara Bermain? (How to Play)
        </button>

        <AnimatePresence>
          {showInstructions && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="w-full max-w-lg mt-4 bg-white/5 border border-white/15 p-5 rounded-2xl text-left select-none overflow-hidden text-xs"
            >
              <h4 className="font-extrabold text-white mb-2 uppercase tracking-wide">💡 PETUNJUK MOTION FITNESS:</h4>
              <ul className="space-y-2 list-decimal list-inside text-slate-350">
                <li>Pastikan ruangan Anda memiliki pencahayaan yang cukup.</li>
                <li>Berdiri sejauh 1.5 - 2.5 meter agar seluruh tubuh Anda (dari kepala hingga pinggul) terlihat selamanya di kamera.</li>
                <li>Gunakan gerakan active: ayun tangan Anda di layar utamanya untuk memotong buah, atau geser seluruh tubuh Anda ke samping untuk memindahkan keranjang.</li>
                <li>Ketika tebasan petir mendekat di game Keranjang, secepatnya lakukan jump-squat/jongkok untuk menunduk di bawahnya!</li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    );
  }

  if (status === 'GAMEOVER') {
    const isBasket = settings.activeGameMode === 'body_basket';
    const accuracy = stats.fruitsSpawned > 0 
      ? Math.round((stats.sliceCount / stats.fruitsSpawned) * 100) 
      : 100;

    return (
      <div className="flex flex-col items-center justify-center p-2 text-center select-none font-sans min-h-[460px]" id="gameover-panel">
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-5"
        >
          <span className="text-xs bg-rose-950/80 font-bold border border-rose-800 text-rose-400 px-3.5 py-1 rounded-full tracking-widest uppercase mb-3 inline-block">
            STAGE CONCLUDED
          </span>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-red-400 to-amber-400 tracking-tighter uppercase italic">
            SESI SELESAI!
          </h1>
          <p className="text-xs text-slate-350 mt-1 max-w-sm mx-auto leading-relaxed">
            Kerja bagus! Tubuh Anda bergerak dengan sempurna. Berikut adalah ringkasan hasil latihan fitness Anda:
          </p>
        </motion.div>

        {/* stats bento board */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5 }}
          className="w-full max-w-md bg-white/5 border border-white/10 p-5 rounded-3xl mb-8 text-left space-y-4"
        >
          <div className="grid grid-cols-2 gap-3 pb-3 border-b border-white/5">
            <div className="bg-white/5 p-3.5 rounded-2xl border border-white/5">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">SKOR DIPEROLEH</p>
              <h2 className="text-2xl font-black text-amber-400 font-mono tracking-tight">{stats.score}</h2>
            </div>

            <div className="bg-rose-500/10 p-3.5 rounded-2xl border border-rose-500/20">
              <p className="text-[9px] text-rose-400 font-black uppercase tracking-wider">EST. KALORI HILANG</p>
              <h2 className="text-2xl font-black text-rose-500 font-mono tracking-tight flex items-baseline gap-1 animate-pulse">
                {stats.caloriesBurned.toFixed(1)} <span className="text-xs font-sans text-rose-400">KCAL</span>
              </h2>
            </div>
          </div>

          <div className="space-y-2.5 font-medium text-xs select-none pl-1">
            <div className="flex justify-between items-center text-slate-350">
              <span>Game Mode</span>
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                {settings.activeGameMode === 'body_basket' ? '🧺 Body Basket' : 
                 settings.activeGameMode === 'balloon_pop' ? '🎈 Balloon Pop' : 
                 settings.activeGameMode === 'balance_trainer' ? '🧘 Balance Trainer' : 
                 '⚔️ Slash Fruits'}
              </span>
            </div>

            {settings.activeGameMode === 'slash_fruits' && (
              <>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Buah Terpotong</span>
                  <span className="text-white font-mono font-bold">{stats.sliceCount} kali</span>
                </div>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Combo Sabetan Tertinggi</span>
                  <span className="text-orange-400 font-bold font-mono">x {stats.maxCombo}</span>
                </div>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Rintangan Bom Kena</span>
                  <span className="text-rose-400 font-mono font-bold">{stats.bombsHit} x</span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-white/5 text-slate-400 text-[10px]">
                  <span>Presisi Sabetan Tangan</span>
                  <span className="text-sky-305 font-mono font-bold">{accuracy}% Acc</span>
                </div>
              </>
            )}

            {settings.activeGameMode === 'body_basket' && (
              <>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Buah Tertangkap</span>
                  <span className="text-white font-mono font-bold">{stats.sliceCount} kali</span>
                </div>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Runtunan Squat (Legs)</span>
                  <span className="text-emerald-400 font-bold font-mono">{stats.squatsCount} x Done</span>
                </div>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Rintangan Bom Kena</span>
                  <span className="text-rose-400 font-mono font-bold">{stats.bombsHit} x</span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-white/5 text-slate-400 text-[10px]">
                  <span>Tingkat Kepresisian Gerak</span>
                  <span className="text-sky-305 font-mono font-bold">{accuracy}% Acc</span>
                </div>
              </>
            )}

            {settings.activeGameMode === 'balloon_pop' && (
              <>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Balon Berhasil Di-Pop</span>
                  <span className="text-rose-400 font-mono font-bold">{stats.totalBaloonPops} balon</span>
                </div>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Runtunan Beruntun (Streak)</span>
                  <span className="text-amber-400 font-bold font-mono">x {stats.maxStreak}</span>
                </div>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Waktu Respons Sentuhan</span>
                  <span className="text-sky-400 font-mono font-bold">
                    {stats.reactionTimes && stats.reactionTimes.length > 0 
                      ? `${(stats.reactionTimes.reduce((a: number, b: number) => a + b, 0) / stats.reactionTimes.length / 1000).toFixed(2)} detik` 
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-white/5 text-slate-400 text-[10px]">
                  <span>Akurasi Gerak Jangkau</span>
                  <span className="text-sky-305 font-mono font-bold">{accuracy}% Acc</span>
                </div>
              </>
            )}

            {settings.activeGameMode === 'balance_trainer' && (
              <>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Kapsul Keseimbangan Tertangkap</span>
                  <span className="text-emerald-400 font-mono font-bold">{stats.sliceCount} item</span>
                </div>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Rata-rata Kestabilan Core</span>
                  <span className="text-cyan-400 font-bold font-mono">{stats.avgBalanceStability}% Stable</span>
                </div>
                <div className="flex justify-between items-center text-slate-350">
                  <span>Runtunan Beruntun (Streak)</span>
                  <span className="text-amber-400 font-bold font-mono">x {stats.maxStreak}</span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-white/5 text-slate-400 text-[10px]">
                  <span>Tingkat Keseimbangan Aman</span>
                  <span className="text-emerald-400 font-mono font-bold">SANGAT AMAN / COMFORT</span>
                </div>
              </>
            )}
          </div>

          <div className="p-3 bg-gradient-to-r from-sky-950/40 to-indigo-950/45 border border-sky-850/30 rounded-2xl flex items-center gap-3">
            <span className="text-xl">🏋️</span>
            <div>
              <p className="text-[9px] text-sky-400 font-bold uppercase tracking-wider">Workout Fitness Title</p>
              <h4 className="text-xs font-black text-white uppercase">{getRank(stats.score)}</h4>
            </div>
          </div>
        </motion.div>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="flex flex-col sm:flex-row gap-3 w-full max-w-md"
        >
          <button
            onClick={() => {
              soundManager.playSwipe();
              if (settings.warmupEnabled) {
                onStartWarmup();
              } else {
                onMulaiGame();
              }
            }}
            className="flex-1 bg-sky-500 hover:bg-sky-450 text-white font-extrabold py-3.5 px-6 rounded-2xl cursor-pointer shadow-[0_0_15px_rgba(14,165,233,0.3)] transition flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
            id="btn-play-again-lobby"
          >
            <Undo className="w-4 h-4 text-white" /> MAIN LAGI (PLAY AGAIN)
          </button>

          <button
            onClick={() => {
              soundManager.playSwipe();
              onBackToMenu();
            }}
            className="flex-1 bg-white/5 border border-white/10 text-white hover:bg-white/10 font-extrabold py-3.5 px-6 rounded-2xl cursor-pointer transition flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
            id="btn-back-menu-lobby"
          >
            MENU UTAMA
          </button>
        </motion.div>
      </div>
    );
  }

  return null;
}
