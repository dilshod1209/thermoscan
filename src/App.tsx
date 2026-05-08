/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState, RefObject, TouchEvent, FormEvent } from 'react';
import { 
  Activity, 
  Battery, 
  ChevronDown, 
  Cpu, 
  Download, 
  HardDrive, 
  Layers, 
  Settings, 
  ShieldAlert, 
  Thermometer, 
  Wifi,
  Focus,
  Bell,
  Search,
  User,
  AlertTriangle,
  CheckCircle2,
  Zap,
  AlertOctagon
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  YAxis, 
  XAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { 
  auth, 
  db,
  loginWithGoogle, 
  logout, 
  logActivity, 
  getUserActivities,
  testConnection,
  loginWithUsername,
  registerWithUsername
} from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { LogOut, History, LogIn, ShieldCheck, UserCheck, Lock, Globe, Server, Scan } from 'lucide-react';

// --- Types ---

interface FluxData {
  time: number;
  value: number;
}

interface ThermalPayload {
  centerTemp: number;
  maxTemp: number;
  avgLuma: number;
  hotspot: { x: number; y: number };
}

// --- Analysis Logic ---

function useThermalAnalysis(videoRef: RefObject<HTMLVideoElement | null>, zoom: number = 1) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [data, setData] = useState<ThermalPayload>({
    centerTemp: 36.7,
    maxTemp: 36.7,
    avgLuma: 0,
    hotspot: { x: 50, y: 50 }
  });

  const smoothPos = useRef({ x: 50, y: 50 });

  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 80;
      canvasRef.current.height = 60;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let animationId: number;

    const analyze = () => {
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = frame.data;
        const w = canvas.width;
        const h = canvas.height;
        
        let maxLuma = 0;
        let totalLuma = 0;
        let bestX = 40;
        let bestY = 30;

        const mapLumaToTemp = (l: number) => 20 + (l / 255) * 75;

        for (let y = 1; y < h - 1; y += 2) {
          for (let x = 1; x < w - 1; x += 2) {
            let neighborLuma = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const idx = ((y + dy) * w + (x + dx)) * 4;
                neighborLuma += (pixels[idx] + pixels[idx+1] + pixels[idx+2]) / 3;
              }
            }
            const avgNeighborLuma = neighborLuma / 9;
            totalLuma += avgNeighborLuma;

            if (avgNeighborLuma > maxLuma) {
              maxLuma = avgNeighborLuma;
              bestX = x;
              bestY = y;
            }
          }
        }

        const avgLuma = totalLuma / ((w-2)*(h-2)/4);
        const centerIdx = (Math.floor(h/2) * w + Math.floor(w/2)) * 4;
        const centerLuma = (pixels[centerIdx] + pixels[centerIdx + 1] + pixels[centerIdx + 2]) / 3;

        const targetXRaw = (bestX / w);
        const targetYRaw = (bestY / h);
        const targetX = (targetXRaw - 0.5) * zoom + 0.5;
        const targetY = (targetYRaw - 0.5) * zoom + 0.5;

        smoothPos.current.x += (targetX * 100 - smoothPos.current.x) * 0.15;
        smoothPos.current.y += (targetY * 100 - smoothPos.current.y) * 0.15;

        setData({
          centerTemp: mapLumaToTemp(centerLuma),
          maxTemp: mapLumaToTemp(maxLuma),
          avgLuma,
          hotspot: { x: smoothPos.current.x, y: smoothPos.current.y }
        });
      }
      animationId = requestAnimationFrame(analyze);
    };

    analyze();
    return () => cancelAnimationFrame(animationId);
  }, [videoRef, zoom]);

  return data;
}

// --- UI Components ---

// --- Header ---
const LoginPage = ({ onSuccess, onGoogleLogin, error: externalError }: { onSuccess: () => void, onGoogleLogin: () => Promise<void>, error: string | null }) => {
  const [step, setStep] = useState<'idle' | 'scanning' | 'decrypting' | 'success'>('idle');
  const [isRegister, setIsRegister] = useState(false);
  const [progress, setProgress] = useState(0);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);

  const startSimulation = () => {
    setStep('scanning');
    let p = 0;
    const interval = setInterval(() => {
      p += 2;
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        setStep('decrypting');
        setTimeout(() => {
          setStep('success');
          setTimeout(() => onSuccess(), 600);
        }, 1500);
      }
    }, 40);
  };

  const handleGoogleAuth = async () => {
    setAuthError(null);
    try {
      await onGoogleLogin();
      startSimulation();
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setAuthError(err.message || "Google Auth xatosi.");
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    
    if (!formData.username || !formData.password) {
      setAuthError("Foydalanuvchi ismi va parolni kiriting.");
      return;
    }

    if (formData.password.length < 6) {
      setAuthError("Parol juda qisqa (kamida 6 ta belgi bo'lishi kerak).");
      return;
    }

    try {
      if (isRegister) {
        await registerWithUsername(formData.username, formData.password);
      } else {
        await loginWithUsername(formData.username, formData.password);
      }
      startSimulation();
    } catch (err: any) {
      let message = "Kirishda xatolik yuz berdi.";
      
      if (err.message && !err.code) {
        message = err.message;
      } else {
        switch (err.code) {
          case 'auth/email-already-in-use':
            message = "Ushbu foydalanuvchi ismi allaqachon band.";
            break;
          case 'auth/invalid-email':
            message = "Foydalanuvchi ismi noto'g'ri shaklda.";
            break;
          case 'auth/weak-password':
            message = "Parol juda zaif (kamida 6 ta belgi bo'lishi kerak).";
            break;
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            message = "Foydalanuvchi ismi yoki parol noto'g'ri.";
            break;
          case 'auth/operation-not-allowed':
            message = "Tizim sozlanmagan. Firebase Console-da 'Email/Password' provayderini yoqing.";
            break;
          case 'auth/too-many-requests':
            message = "Juda ko'p urinish. Iltimos, birozdan keyin qayta urinib ko'ring.";
            break;
        }
      }
      
      setAuthError(message);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Dynamic Data Stream Background */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-20 pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ y: -100, x: Math.random() * 100 + '%' }}
            animate={{ y: '110vh' }}
            transition={{ 
              duration: Math.random() * 5 + 5, 
              repeat: Infinity, 
              ease: "linear",
              delay: Math.random() * 5
            }}
            className="absolute text-[8px] font-mono text-[#00F2FF] whitespace-nowrap"
            style={{ writingMode: 'vertical-rl' }}
          >
            {Math.random().toString(16).substring(2, 15).toUpperCase()}
            {Math.random().toString(16).substring(2, 15).toUpperCase()}
          </motion.div>
        ))}
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,242,255,0.05)_0%,transparent_80%)] z-1" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg bg-[#0f172a]/40 border border-white/5 p-1 px-1 rounded-[3rem] backdrop-blur-3xl shadow-[0_50px_100px_rgba(0,0,0,0.8)] relative z-20"
      >
        <div className="bg-[#0f172a]/60 border border-white/10 rounded-[2.8rem] p-10 relative overflow-hidden">
          {/* Glass Overlay Light */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00F2FF]/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#FF5A00]/5 blur-3xl pointer-events-none" />

          {/* Card Content */}
          <div className="flex flex-col items-center mb-8">
            <motion.div 
              className="relative mb-6"
              whileHover={{ scale: 1.05 }}
            >
              <div className="w-16 h-16 bg-gradient-to-br from-[#FF5A00] to-[#E65100] rounded-2xl flex items-center justify-center shadow-[0_0_40px_rgba(255,90,0,0.3)]">
                <Thermometer className="w-8 h-8 text-white" />
              </div>
            </motion.div>
            
            <h1 className="text-2xl font-black text-white mb-2 tracking-tighter text-center uppercase">
              {isRegister ? 'Ro\'yxatdan o\'tish' : 'Tizimga Kirish'}
            </h1>
          </div>

          {step === 'idle' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-[#00F2FF] transition-colors" />
                  <input 
                    type="text" 
                    placeholder="FOYDALANUVCHI ISMI" 
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-[11px] font-black text-white focus:bg-white/10 focus:border-[#00F2FF]/40 outline-none transition-all placeholder:text-white/10 tracking-[0.1em]"
                  />
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-[#00F2FF] transition-colors" />
                  <input 
                    type="password" 
                    placeholder="PAROL" 
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-[11px] font-black text-white focus:bg-white/10 focus:border-[#00F2FF]/40 outline-none transition-all placeholder:text-white/10 tracking-[0.1em]"
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="group relative w-full h-14 bg-[#00F2FF] hover:bg-white text-[#020617] rounded-2xl font-black text-[11px] tracking-[0.3em] uppercase transition-all shadow-[0_10px_30px_rgba(0,242,255,0.15)] overflow-hidden"
              >
                 {isRegister ? 'TASDIQLASH' : 'KIRISH'}
              </button>

              <div className="flex justify-center">
                <button 
                  type="button"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setAuthError(null);
                  }}
                  className="text-[10px] font-black text-white/30 uppercase tracking-widest hover:text-[#00F2FF] transition-colors"
                >
                  {isRegister ? "Akkaunt bormi? Kirish" : "Ro'yxatdan o'tish"}
                </button>
              </div>

              {(authError || externalError) && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center"
                >
                  <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">{authError || externalError}</span>
                </motion.div>
              )}
            </form>
          ) : (
            <div className="flex flex-col items-center py-10">
               <div className="relative w-40 h-40 mb-10 flex items-center justify-center">
                  {/* Outer Rings */}
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 border border-[#00F2FF]/10 rounded-full border-dashed"
                  />
                  <motion.div 
                    animate={{ rotate: -360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-4 border border-[#FF5A00]/10 rounded-full border-dashed"
                  />
                  
                  {/* Scanner Face */}
                  <div className="relative w-28 h-28 bg-[#00F2FF]/5 rounded-3xl border border-[#00F2FF]/20 flex items-center justify-center overflow-hidden">
                    <Scan className="w-12 h-12 text-[#00F2FF] animate-pulse" />
                    
                    {step === 'scanning' && (
                      <motion.div 
                        initial={{ top: '-10%' }}
                        animate={{ top: '110%' }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute left-0 w-full h-1 bg-[#00F2FF] shadow-[0_0_20px_#00F2FF] z-10"
                      />
                    )}
                  </div>

                  {/* Corner Brackets */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00F2FF]" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#00F2FF]" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#FF5A00]" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#FF5A00]" />
               </div>

               <div className="text-center w-full max-w-[300px]">
                  <div className="flex items-center justify-center gap-3 mb-4">
                     <div className="w-1.5 h-1.5 rounded-full bg-[#00F2FF] animate-ping" />
                     <span className="text-[14px] font-black text-white uppercase tracking-[0.4em]">
                        {step === 'scanning' ? 'Scanning Face...' : step === 'decrypting' ? 'Decrypting Biometrics...' : 'Identity Confirmed'}
                     </span>
                  </div>
                  
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-3">
                     <motion.div 
                        initial={{ width: '0%' }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-gradient-to-r from-[#00F2FF] to-blue-500"
                     />
                  </div>
                  <div className="flex justify-between text-[8px] font-bold text-white/20 uppercase tracking-widest px-1">
                     <span>B-Link // Active</span>
                     <span className="tabular-nums">{progress}% Completed</span>
                  </div>
               </div>
            </div>
          )}

          <div className="mt-12 flex items-center justify-between opacity-20 group-hover:opacity-40 transition-opacity">
            <div className="flex items-center gap-3">
               <ShieldCheck className="w-4 h-4 text-[#00F2FF]" />
               <div className="flex flex-col">
                  <span className="text-[7px] font-black uppercase tracking-widest text-[#00F2FF]">Encrypted Link</span>
                  <span className="text-[6px] font-bold uppercase tracking-[0.4em] text-white">TLS 1.3 Active</span>
               </div>
            </div>
            <div className="flex flex-col items-end">
               <span className="text-[7px] font-black uppercase tracking-widest text-[#FF5A00]">Personnel Only</span>
               <span className="text-[6px] font-bold uppercase tracking-[0.4em] text-white">Auth Lvl 04 Required</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Footer Info */}
      <div className="absolute bottom-10 left-10 flex gap-10 opacity-20">
         <div className="flex flex-col">
            <span className="text-[8px] font-black text-white uppercase tracking-widest">Station ID</span>
            <span className="text-[10px] font-mono text-[#00F2FF]">NK-42-X</span>
         </div>
         <div className="flex flex-col">
            <span className="text-[8px] font-black text-white uppercase tracking-widest">Network Status</span>
            <span className="text-[10px] font-mono text-green-400">ENCRYPTED</span>
         </div>
      </div>
    </div>
  );
};

// --- Header ---
const Header = ({ user, isOnline, onOpenCabinet }: { user: FirebaseUser | null, isOnline: boolean, onOpenCabinet: () => void }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-20 bg-[#0f172a] border-b border-[#FF5A00]/20 flex items-center justify-between px-8 z-50 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/4 w-96 h-1 bg-[#00F2FF]/20 blur-xl" />
      
      <div className="flex items-center gap-5">
        <div className="relative">
          <div className="w-12 h-12 bg-gradient-to-br from-[#FF5A00] to-[#E65100] rounded-xl flex items-center justify-center font-black text-2xl shadow-[0_0_20px_rgba(255,90,0,0.4)] transform hover:rotate-12 transition-transform">
            <Thermometer className="w-7 h-7 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#00F2FF] rounded-full border-2 border-[#0f172a] flex items-center justify-center">
            <Zap className="w-2.5 h-2.5 text-[#0f172a] fill-current" />
          </div>
        </div>
        <div className="flex flex-col">
          <h1 className="text-xl font-black tracking-tighter text-white flex items-center gap-2">
            THERMOSCAN <span className="text-[#00F2FF]">AI</span>
          </h1>
          <span className="text-[9px] text-[#FF5A00] font-black tracking-[0.4em] uppercase opacity-80">Industrial Monitoring Suite</span>
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-12 hidden md:flex items-center bg-white/5 border border-white/5 rounded-xl px-4 h-11 group focus-within:border-[#00F2FF]/40 transition-all">
        <Search className="w-4 h-4 text-white/30 mr-3" />
        <div className="flex items-center gap-4 w-full">
           <span className="text-[10px] font-black text-[#00F2FF] bg-[#00F2FF]/10 px-2 py-0.5 rounded">GPS: 42.4678° N, 59.6134° E</span>
           <div className="h-4 w-[1px] bg-white/10" />
           <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Nukus, Qoraqalpogʻiston</span>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="flex flex-col items-end">
           <span className="text-lg font-black text-white tabular-nums tracking-wider">{time.toLocaleTimeString()}</span>
           <div className="flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#00F2FF] animate-pulse' : 'bg-red-500'}`} />
             <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isOnline ? 'text-[#00F2FF]' : 'text-red-500'}`}>
               {isOnline ? 'System Connected' : 'Offline Mode'}
             </span>
           </div>
        </div>
        
        <div className="flex items-center gap-4 pl-8 border-l border-white/10">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-white/40 uppercase">Operator</span>
            <span className="text-xs font-black text-white uppercase tracking-tighter">{user?.displayName || 'DilshodByte'}</span>
          </div>
          <div 
            onClick={onOpenCabinet}
            className="w-10 h-10 bg-white/5 rounded-full border border-white/10 flex items-center justify-center group cursor-pointer hover:border-[#00F2FF]/40 transition-all overflow-hidden"
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-white/40 group-hover:text-[#00F2FF] transition-colors" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

const LineStat = ({ label, data, color }: { label: string, data: FluxData[], color: string }) => (
  <div className="bg-[#1e293b]/40 border border-white/5 p-3 rounded-lg overflow-hidden flex flex-col h-40">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">{label}</span>
      <span className="text-[8px] text-white/20">60 min</span>
    </div>
    <div className="flex-1 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
          <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
);

// --- Alerts Table ---
const AlertsTable = ({ onAction }: { onAction: (type: 'alert', description: string) => void }) => {
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'OVERHEAT':
        return 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]';
      case 'WARNING':
        return 'text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.7)]';
      default:
        return 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.7)]';
    }
  };

  return (
    <div className="bg-[#1e293b]/60 border border-white/10 rounded-xl overflow-hidden mt-4">
      <div className="px-5 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
        <span className="text-[11px] font-bold text-white/80 uppercase tracking-widest">Faol Ogohlantirishlar</span>
        <span className="text-[10px] text-orange-400 font-bold tracking-widest">4 TAFAVUT ANIQLANDI</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0f172a]/40 text-white/30 uppercase text-[9px] font-bold tracking-widest">
            <tr>
              <th className="px-5 py-3">Bino / Zona</th>
              <th className="px-5 py-3">Holat</th>
              <th className="px-5 py-3">Tafsif / Sabab</th>
              <th className="px-5 py-3 text-right">Amal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {[
              { zone: 'Bino A - Unit 04', status: 'OVERHEAT', cause: 'Podshipnik ishqalanmoqda', action: 'Tekshirish' },
              { zone: 'Bino C - Conv V2', status: 'WARNING', cause: 'Yuqori yuklama aniqlandi', action: 'Sovitish' },
              { zone: 'Main Feed', status: 'STABLE', cause: 'Reja asosida ishlash', action: 'Navbat' },
            ].map((item, i) => (
              <tr key={i} className="hover:bg-white/5 transition-colors group">
                <td className="px-5 py-3 font-bold text-white/80 flex items-center gap-2">
                  <AlertTriangle className={`w-3 h-3 ${getStatusStyle(item.status)}`} />
                  {item.zone}
                </td>
                <td className={`px-5 py-3 font-black tracking-widest ${getStatusStyle(item.status)}`}>{item.status}</td>
                <td className="px-5 py-3 text-white/60 font-medium">{item.cause}</td>
                <td className="px-5 py-3 text-right">
                  <button 
                    onClick={() => onAction('alert', `${item.zone} uchun ${item.action} bajarildi`)}
                    className="px-3 py-1 bg-white/5 hover:bg-[#00F2FF] transition-all rounded text-[9px] font-black uppercase text-white/60 hover:text-[#0f172a] border border-white/10"
                  >
                    {item.action}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ActionPanel = ({ 
  zoom, 
  sensitivity, 
  onSensitivityChange,
  palette,
  onPaletteChange,
  onAction
}: { 
  zoom: number, 
  sensitivity: number, 
  onSensitivityChange: (val: number) => void,
  palette: string,
  onPaletteChange: (p: 'ironbow' | 'rainbow' | 'grayscale') => void,
  onAction: (type: 'report' | 'snapshot', description: string) => void
}) => {
  return (
    <div className="flex flex-col gap-5">
      {/* AI Stability Predictor */}
      <div className="bg-[#1e293b]/60 border border-white/10 rounded-2xl p-6 flex flex-col items-center relative overflow-hidden group shadow-xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00F2FF]/40 to-transparent opacity-50" />
        <span className="text-[11px] font-black text-white/40 uppercase tracking-[0.4em] mb-8">AI Predictor</span>
        
        <div className="relative w-44 h-44 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 filter drop-shadow-[0_0_15px_rgba(0,242,255,0.2)]">
            <circle cx="88" cy="88" r="76" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="14" />
            <motion.circle 
              cx="88" cy="88" r="76" fill="transparent" 
              stroke="#00F2FF" strokeWidth="14" 
              strokeDasharray={477} 
              initial={{ strokeDashoffset: 477 }}
              animate={{ strokeDashoffset: 477 * (1 - 0.982) }}
              transition={{ duration: 2, ease: "easeOut" }}
              strokeLinecap="round"
              className="drop-shadow-[0_0_12px_#00F2FF]"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-4xl font-black text-white tracking-tighter">98.2%</span>
            <span className="text-[10px] font-black text-[#00F2FF] tracking-[0.2em] uppercase mt-1">Stable</span>
          </div>
        </div>
        <p className="mt-6 text-[10px] text-white/40 text-center leading-relaxed font-medium uppercase tracking-wider">
          Kelgusi 60 daqiqa uchun <br/> favqulodda vaziyat ehtimoli: <span className="text-green-500 font-black">&lt; 1.2%</span>
        </p>
      </div>

      {/* Palette Selection */}
      <div className="bg-[#1e293b]/60 border border-white/10 rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] flex items-center gap-2">
            <Layers className="w-3 h-3" /> Palitra tanlash
          </span>
          <div className="grid grid-cols-3 gap-2">
             {(['ironbow', 'rainbow', 'grayscale'] as const).map((p) => (
                <button 
                  key={p}
                  onClick={() => onPaletteChange(p)}
                  className={`py-2 rounded-lg text-[9px] font-black uppercase transition-all border ${
                    palette === p 
                      ? 'bg-[#FF5A00] border-[#FF5A00] text-white shadow-[0_0_15px_rgba(255,90,0,0.3)]' 
                      : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {p === 'ironbow' ? 'Iron' : p === 'rainbow' ? 'Rain' : 'Gray'}
                </button>
             ))}
          </div>
        </div>

        {/* Filter Sensitivity Slider */}
        <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
          <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Sezuvchanlik</span>
          <div className="flex items-center gap-4">
             <input 
              type="range" 
              min="0.5" 
              max="3.0" 
              step="0.1" 
              value={sensitivity} 
              onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-[#FF5A00]"
            />
            <span className="text-xs font-black text-[#FF5A00] w-8 tabular-nums">{sensitivity.toFixed(1)}x</span>
          </div>
        </div>

        {/* System Controls */}
        <div className="flex flex-col gap-2 pt-4 border-t border-white/5">
          <button 
            onClick={() => onAction('report', 'PDF Hisobot yaratildi')}
            className="w-full py-3 bg-[#FF5A00]/10 border border-[#FF5A00]/20 rounded-xl text-[10px] font-black text-[#FF5A00] uppercase tracking-widest hover:bg-[#FF5A00] hover:text-white transition-all shadow-sm"
          >
            PDF Hisobotini Yaratish
          </button>
          <button 
            onClick={() => onAction('snapshot', 'Termal Snapshot olindi')}
            className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white/60 uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
          >
            Snapshotni olish
          </button>
        </div>
      </div>
    </div>
  );
};

const ThermalView = ({ 
  videoRef, 
  thermalData, 
  zoom, 
  range, 
  onRangeChange,
  palette = 'ironbow'
}: { 
  videoRef: RefObject<HTMLVideoElement | null>, 
  thermalData: ThermalPayload, 
  zoom: number,
  range: { min: number, max: number },
  onRangeChange: (range: { min: number, max: number }) => void,
  palette?: 'ironbow' | 'rainbow' | 'grayscale'
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrag = (type: 'min' | 'max', info: { point: { x: number } }) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const percent = Math.min(Math.max((info.point.x - rect.left) / rect.width, 0), 1);
    const temp = Math.round(20 + percent * 75); // 20-95 range

    if (type === 'min') {
      onRangeChange({ ...range, min: Math.min(temp, range.max - 5) });
    } else {
      onRangeChange({ ...range, max: Math.max(temp, range.min + 5) });
    }
  };

  return (
    <div className="bg-[#1e293b]/60 border border-white/10 rounded-2xl overflow-hidden relative group h-[520px] shadow-2xl">
      <div className="absolute top-5 left-6 z-20 flex items-center justify-between right-6 pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full bg-[#FF5A00] animate-pulse shadow-[0_0_15px_#FF5A00]" />
          <div className="flex flex-col">
            <span className="text-[12px] font-black text-white uppercase tracking-[0.2em]">Live AR Analytics</span>
            <span className="text-[8px] font-bold text-[#00F2FF] uppercase tracking-widest">{palette.toUpperCase()} MODE ACTIVE</span>
          </div>
        </div>
        <div className="flex gap-2 pointer-events-auto">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="bg-black/60 border border-white/10 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-white/80 hover:text-[#00F2FF] transition-all flex items-center gap-2 backdrop-blur-sm"
          >
            {isExpanded ? 'Yashirish' : 'Tahlil'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      
      <div className="absolute inset-0 z-0">
        <div 
          className="w-full h-full transition-transform duration-500 ease-out origin-center" 
          style={{ transform: `scale(${zoom})`, filter: `url(#thermal-${palette})` }}
        >
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        </div>
        
        {/* Dynamic Scanlines */}
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px]" />
      </div>

      {/* AI Object Detection Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
         <motion.div 
           animate={{ scale: [1, 1.02, 1], opacity: [0.8, 1, 0.8] }}
           transition={{ duration: 4, repeat: Infinity }}
           className="w-64 h-48 border-2 border-[#00F2FF]/40 rounded-lg relative"
         >
            <div className="absolute -top-3 -left-3 w-6 h-6 border-t-4 border-l-4 border-[#00F2FF]" />
            <div className="absolute -top-3 -right-3 w-6 h-6 border-t-4 border-r-4 border-[#00F2FF]" />
            <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-4 border-l-4 border-[#00F2FF]" />
            <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-4 border-r-4 border-[#00F2FF]" />
            
            <div className="absolute top-2 left-2 bg-[#00F2FF]/20 backdrop-blur-sm border border-[#00F2FF]/40 p-2 rounded flex flex-col gap-1">
               <div className="flex items-center gap-2">
                 <Focus className="w-3 h-3 text-[#00F2FF]" />
                 <span className="text-[10px] font-black text-white uppercase tabular-nums">MOTOR_UNIT_04</span>
               </div>
               <div className="h-[1px] bg-[#00F2FF]/20" />
               <span className="text-[8px] font-bold text-[#00F2FF] uppercase">Tracking Active</span>
            </div>
         </motion.div>
      </div>

      {/* Expanded Data Panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="absolute top-16 left-6 right-6 z-30 bg-[#0f172a]/90 backdrop-blur-xl border border-[#00F2FF]/30 p-6 rounded-xl grid grid-cols-2 gap-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
          >
            <div className="flex flex-col gap-1 border-l-2 border-[#00F2FF] pl-4">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">O'rtacha Yorqinlik</span>
              <span className="text-xl font-black text-[#00F2FF] tabular-nums">{thermalData.avgLuma.toFixed(2)} %</span>
            </div>
            <div className="flex flex-col gap-1 border-l-2 border-[#FF5A00] pl-4">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Maksimal Harorat</span>
              <span className="text-xl font-black text-[#FF5A00] tabular-nums">{thermalData.maxTemp.toFixed(1)}°C</span>
            </div>
            <div className="flex flex-col gap-1 border-l-2 border-white/10 pl-4">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Hotspot X</span>
              <span className="text-base font-black text-white/80 tabular-nums">{thermalData.hotspot.x.toFixed(2)} %</span>
            </div>
            <div className="flex flex-col gap-1 border-l-2 border-white/10 pl-4">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Hotspot Y</span>
              <span className="text-base font-black text-white/80 tabular-nums">{thermalData.hotspot.y.toFixed(2)} %</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="w-40 h-40 border border-[#00F2FF]/10 rounded-full flex items-center justify-center relative">
          <div className="w-12 h-[2px] bg-[#00F2FF]/40 absolute left-0" />
          <div className="w-12 h-[2px] bg-[#00F2FF]/40 absolute right-0" />
          <div className="h-12 w-[2px] bg-[#00F2FF]/40 absolute top-0" />
          <div className="h-12 w-[2px] bg-[#00F2FF]/40 absolute bottom-0" />
          
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
             <div className="text-2xl font-black text-[#00F2FF] tabular-nums drop-shadow-[0_0_15px_rgba(0,242,255,0.8)] flex flex-col items-center">
               <span>{thermalData.centerTemp.toFixed(1)}°C</span>
               <div className="h-1 w-1 bg-[#00F2FF] rounded-full mt-1 shadow-[0_0_5px_#00F2FF]" />
             </div>
          </div>
        </div>
      </div>

      {/* Interactive Thermal Scale Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-80 flex flex-col gap-3 z-20">
        <div className="flex justify-between px-2">
          <span className="text-[10px] font-black text-white bg-black/60 px-2 py-1 rounded border border-white/10 shadow-lg">{range.min}°C</span>
          <span className="text-[10px] font-black text-white bg-black/60 px-2 py-1 rounded border border-white/10 shadow-lg">{range.max}°C</span>
        </div>
        <div ref={containerRef} className="relative h-3 bg-gradient-to-r from-indigo-950 via-[#FF5A00] to-white rounded-full border border-white/20 shadow-2xl">
          <div 
            className="absolute h-full border-x-2 border-white/40 pointer-events-none"
            style={{ 
              left: `${((range.min - 20) / 75) * 100}%`, 
              right: `${100 - ((range.max - 20) / 75) * 100}%` 
            }}
          />
          
          <motion.div 
            drag="x"
            dragConstraints={containerRef}
            dragElastic={0}
            dragMomentum={false}
            onDrag={(_, info) => handleDrag('min', info)}
            className="absolute top-1/2 -translate-y-1/2 -ml-2.5 w-5 h-5 bg-white rounded-full border-2 border-[#00F2FF] cursor-pointer shadow-[0_0_10px_rgba(0,242,255,0.5)] z-30"
            style={{ left: `${((range.min - 20) / 75) * 100}%` }}
          />

          <motion.div 
            drag="x"
            dragConstraints={containerRef}
            dragElastic={0}
            dragMomentum={false}
            onDrag={(_, info) => handleDrag('max', info)}
            className="absolute top-1/2 -translate-y-1/2 -ml-2.5 w-5 h-5 bg-white rounded-full border-2 border-[#FF5A00] cursor-pointer shadow-[0_0_10px_rgba(255,90,0,0.5)] z-30"
            style={{ left: `${((range.max - 20) / 75) * 100}%` }}
          />
        </div>
        <div className="text-[8px] text-center text-white/30 font-black uppercase tracking-[0.3em]">Adjust Thermal Sensitivity Range</div>
      </div>
    </div>
  );
};

// --- SVG Filters ---
const ThermalFilters = ({ sensitivity = 1.0, range }: { sensitivity?: number, range: { min: number, max: number } }) => {
  const scale = 55 / Math.max(range.max - range.min, 1);
  const offset = (20 - range.min) / Math.max(range.max - range.min, 1);
  const s = sensitivity;

  return (
    <svg width="0" height="0" className="absolute">
      <defs>
        {/* Ironbow Palette */}
        <filter id="thermal-ironbow">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" result="grain" />
          <feColorMatrix type="matrix" 
            values={`${0.2126 * s * scale} ${0.7152 * s * scale} ${0.0722 * s * scale} 0 ${offset} 
                    ${0.2126 * s * scale} ${0.7152 * s * scale} ${0.0722 * s * scale} 0 ${offset} 
                    ${0.2126 * s * scale} ${0.7152 * s * scale} ${0.0722 * s * scale} 0 ${offset} 
                    0 0 0 1 0`} result="luma" />
          <feComponentTransfer in="luma">
            <feFuncR type="table" tableValues="0.0 0.5 0.0 1.0 1.0 1.0" />
            <feFuncG type="table" tableValues="0.0 0.0 0.0 0.6 1.0 1.0" />
            <feFuncB type="table" tableValues="0.0 0.5 1.0 0.0 0.0 1.0" />
          </feComponentTransfer>
          <feBlend in2="grain" mode="screen" />
        </filter>

        {/* Rainbow Palette */}
        <filter id="thermal-rainbow">
          <feColorMatrix type="matrix" 
            values={`${0.2126 * s * scale} ${0.7152 * s * scale} ${0.0722 * s * scale} 0 ${offset} 
                    ${0.2126 * s * scale} ${0.7152 * s * scale} ${0.0722 * s * scale} 0 ${offset} 
                    ${0.2126 * s * scale} ${0.7152 * s * scale} ${0.0722 * s * scale} 0 ${offset} 
                    0 0 0 1 0`} result="luma" />
          <feComponentTransfer in="luma">
            <feFuncR type="table" tableValues="0 0 0 0 1 1 1" />
            <feFuncG type="table" tableValues="0 0 1 1 1 0 0" />
            <feFuncB type="table" tableValues="0 1 1 0 0 0 1" />
          </feComponentTransfer>
        </filter>

        {/* Grayscale Palette */}
        <filter id="thermal-grayscale">
          <feColorMatrix type="matrix" 
            values={`${0.2126 * s * scale} ${0.7152 * s * scale} ${0.0722 * s * scale} 0 ${offset} 
                    ${0.2126 * s * scale} ${0.7152 * s * scale} ${0.0722 * s * scale} 0 ${offset} 
                    ${0.2126 * s * scale} ${0.7152 * s * scale} ${0.0722 * s * scale} 0 ${offset} 
                    0 0 0 1 0`} />
        </filter>
      </defs>
    </svg>
  );
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [zoom, setZoom] = useState(1);
  const [sensitivity, setSensitivity] = useState(1.0);
  const [thermalRange, setThermalRange] = useState({ min: 25, max: 90 });
  const [palette, setPalette] = useState<'ironbow' | 'rainbow' | 'grayscale'>('ironbow');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isCabinetOpen, setIsCabinetOpen] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false); // New state to wait for simulation
  const [isFirestoreConnected, setIsFirestoreConnected] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'info' | 'error' } | null>(null);
  
  const thermalData = useThermalAnalysis(videoRef, zoom);
  const [history, setHistory] = useState<{ temp: FluxData[], hum: FluxData[], flux: FluxData[] }>({
    temp: [], hum: [], flux: []
  });

  // Mock user or anonymous user if not authenticated to bypass login screen
  const effectiveUser = user || {
    uid: 'guest-operator',
    displayName: 'Mehmon Operator',
    email: 'guest@thermoscan.ai',
    photoURL: null
  };

  const lastVoiceAlert = useRef(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setIsAuthReady(false);
      } else {
        setIsAuthReady(true);
      }
      setIsLoading(false);
    });

    // Monitor Firestore connection
    const testConnect = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        setIsFirestoreConnected(true);
      } catch (err: any) {
        if (err.code === 'unavailable' || (err.message && err.message.includes('offline'))) {
          setIsFirestoreConnected(false);
        }
      }
    };
    testConnect();
    const interval = setInterval(testConnect, 30000); // Check every 30s

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Fetch activities when cabinet opens
  useEffect(() => {
    if (isCabinetOpen && effectiveUser) {
      getUserActivities(effectiveUser.uid).then(setActivities);
    }
  }, [isCabinetOpen, effectiveUser]);

  // Handle logging
  const handleAction = async (type: 'snapshot' | 'report' | 'alert', description: string) => {
    if (effectiveUser) {
      if (type === 'snapshot') {
        takeSnapshot();
      } else if (type === 'report') {
        generateReport();
      }
      
      await logActivity(effectiveUser.uid, type, 'MOTOR_UNIT_04', description);
      if (isCabinetOpen) {
        getUserActivities(effectiveUser.uid).then(setActivities);
      }
    }
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    
    // Create canvas to capture frame
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx && videoRef.current) {
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Flash effect
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 150);
      
      // Download image
      const dataURL = canvas.toDataURL('image/jpeg');
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = `thermoscan_snapshot_${Date.now()}.jpg`;
      link.click();
      
      showNotification('Snapshot xotiraga saqlandi', 'success');
      playAlertSound();
    }
  };

  const generateReport = () => {
    showNotification('PDF Hisobot shakllantirilmoqda...', 'info');
    setTimeout(() => {
      showNotification('Hisobot muvaffaqiyatli yaratildi va bazaga saqlandi', 'success');
    }, 2000);
  };

  const showNotification = (message: string, type: 'success' | 'info' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Audio initialize function
  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      setAudioEnabled(true);
      
      // Initial voice greeting
      const msg = new SpeechSynthesisUtterance("ThermoScan AI tizimi faollashtirildi. Barcha datchiklar ulanmoqda.");
      msg.lang = 'uz-UZ';
      window.speechSynthesis.speak(msg);
    }
  };

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await loginWithGoogle();
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("Kirish oynasi yopildi. Iltimos, qaytadan urinib ko'ring.");
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError("Brauzer bildirishnomasi bloklandi. Iltimos, popup oynalarga (Google Auth) ruxsat bering.");
      } else {
        setLoginError("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
      }
    }
  };

  // Beep sound generator
  const playAlertSound = () => {
    if (!audioCtxRef.current || !audioEnabled) return;
    const osc = audioCtxRef.current.createOscillator();
    const gain = audioCtxRef.current.createGain();
    osc.connect(gain);
    gain.connect(audioCtxRef.current.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, audioCtxRef.current.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtxRef.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 0.2);
    osc.start();
    osc.stop(audioCtxRef.current.currentTime + 0.2);
    
    // Vibration
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  };

  // Voice Alert
  const triggerVoiceAlert = (text: string) => {
    if (!audioEnabled || Date.now() - lastVoiceAlert.current < 15000) return;
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'uz-UZ';
    window.speechSynthesis.speak(msg);
    lastVoiceAlert.current = Date.now();
    handleAction('alert', text);
  };

  useEffect(() => {
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err: any) {
        console.error('Kamera xatosi:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          showNotification('Kamera ruxsati rad etildi. Iltimos, brauzer sozlamalaridan kameraga ruxsat bering.', 'error');
        } else {
          showNotification('Kameraga ulanishda xatolik yuz berdi.', 'error');
        }
      }
    }
    if (effectiveUser) start();
  }, [effectiveUser]);

  useEffect(() => {
    if (thermalData.maxTemp > 80) {
      playAlertSound();
      triggerVoiceAlert("Diqqat! B zonasida kritik issiqlik aniqlandi. Harorat me'yordan yuqori.");
    } else if (thermalData.maxTemp > 75) {
      playAlertSound();
    }
  }, [thermalData.maxTemp]);

  useEffect(() => {
    const timer = setInterval(() => {
      setHistory(prev => ({
        temp: [...prev.temp, { time: Date.now(), value: thermalData.centerTemp + (Math.random() - 0.5) * 5 }].slice(-30),
        hum: [...prev.hum, { time: Date.now(), value: 45 + Math.random() * 10 }].slice(-30),
        flux: [...prev.flux, { time: Date.now(), value: (thermalData.avgLuma / 2.5) + (Math.random() * 5) }].slice(-30)
      }));
    }, 500);
    return () => clearInterval(timer);
  }, [thermalData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#00F2FF]/20 border-t-[#00F2FF] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans flex flex-col selection:bg-[#00F2FF]/30 overflow-x-hidden">
      <ThermalFilters sensitivity={sensitivity} range={thermalRange} />
      <Header 
        user={effectiveUser} 
        isOnline={isFirestoreConnected}
        onOpenCabinet={() => setIsCabinetOpen(true)} 
      />

      {/* Screen Flash Overlay */}
      <AnimatePresence>
        {isFlashing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white z-[200] pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className={`fixed top-20 left-1/2 -translate-x-1/2 z-[150] px-6 py-3 rounded-xl border flex items-center gap-3 shadow-2xl backdrop-blur-xl ${
              notification.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-400' :
              notification.type === 'info' ? 'bg-[#00F2FF]/20 border-[#00F2FF]/30 text-[#00F2FF]' :
              'bg-red-500/20 border-red-500/30 text-red-400'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> :
             notification.type === 'info' ? <Zap className="w-4 h-4" /> :
             <AlertTriangle className="w-4 h-4" />}
            <span className="text-[11px] font-black uppercase tracking-widest">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cabinet Modal */}
      <AnimatePresence>
        {isCabinetOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCabinetOpen(false)}
              className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-[#1e293b] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#00F2FF] flex items-center justify-center bg-white/5">
                    {effectiveUser.photoURL ? (
                      <img src={effectiveUser.photoURL} alt="User" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-white/20" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xl font-black text-white">{effectiveUser.displayName}</span>
                    <span className="text-xs text-white/40">{effectiveUser.email}</span>
                  </div>
                </div>
                <button 
                  onClick={logout}
                  className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all flex items-center gap-2 text-[10px] font-black uppercase"
                >
                  <LogOut className="w-4 h-4" /> Chiqish
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4">
                <div className="flex items-center gap-3 mb-2">
                  <History className="w-5 h-5 text-[#00F2FF]" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-white/80">Oxirgi harakatlar</h3>
                </div>
                
                {activities.length === 0 ? (
                  <div className="p-10 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center opacity-30">
                     <span className="text-xs font-bold uppercase">Harakatlar hali mavjud emas</span>
                  </div>
                ) : (
                  activities.map((act) => (
                    <div key={act.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-[#00F2FF]/20 transition-all">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${
                          act.type === 'snapshot' ? 'bg-blue-500/20 text-blue-400' :
                          act.type === 'report' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {act.type === 'snapshot' ? <Layers className="w-4 h-4" /> :
                           act.type === 'report' ? <Download className="w-4 h-4" /> :
                           <AlertTriangle className="w-4 h-4" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white/80">{act.description}</span>
                          <span className="text-[10px] text-white/30 uppercase font-black">{act.zone} // {new Date(act.timestamp?.toDate ? act.timestamp.toDate() : act.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => {
                          showNotification(`${act.type === 'snapshot' ? 'Log' : 'Hisobot'} qayta yuklanmoqda...`, 'info');
                          playAlertSound();
                        }}
                        className="p-3 bg-white/5 border border-white/5 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-[#00F2FF]/10 hover:text-[#00F2FF] transition-all"
                        title="Yuklab olish"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              
              <div className="p-6 bg-white/5 border-t border-white/5 flex justify-center">
                 <button onClick={() => setIsCabinetOpen(false)} className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white transition-all">Yopish</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {!audioEnabled && (
        <div className="bg-[#FF5A00]/20 border-b border-[#FF5A00]/30 px-6 py-3 flex items-center justify-between animate-pulse">
           <div className="flex items-center gap-4">
             <AlertOctagon className="w-5 h-5 text-[#FF5A00]" />
             <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-widest text-white">Audio Tizim Kutish Rejimida</span>
                <span className="text-[9px] font-bold text-[#FF5A00]/80 uppercase">Ovozli ogohlantirishlarni yoqish uchun bosing</span>
             </div>
           </div>
           <button 
             onClick={initAudio}
             className="bg-[#FF5A00] hover:bg-[#FF5A00]/80 text-white text-[10px] font-black px-6 py-2 rounded-lg uppercase transition-all shadow-[0_0_15px_rgba(255,90,0,0.4)]"
           >
             Yoqish
           </button>
        </div>
      )}

      <main className="flex-1 p-6 grid grid-cols-12 gap-8 max-w-[1920px] mx-auto w-full">
        {/* Left Column: Stats */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          <div className="flex items-center gap-3 mb-2 px-2">
            <Activity className="w-5 h-5 text-[#00F2FF]" />
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-white/60">Live Telemetry</h2>
          </div>
          <LineStat label="HARORAT (°C)" data={history.temp} color="#FF5A00" />
          <LineStat label="NAMLIK (%)" data={history.hum} color="#00F2FF" />
          <LineStat label="ISSIQLIK OQIMI (W/m²)" data={history.flux} color="#FFD600" />
          
          <div className="mt-4 p-5 bg-[#FF5A00]/5 border border-[#FF5A00]/20 rounded-2xl relative overflow-hidden group shadow-lg">
             <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
               <Zap className="w-16 h-16 text-[#FF5A00]" />
             </div>
             <span className="text-[10px] font-black text-[#FF5A00] uppercase mb-3 block tracking-[0.3em] text-center opacity-70">Efficiency Index</span>
             <div className="flex items-baseline justify-center gap-2">
               <span className="text-3xl font-black text-white tabular-nums">0.94</span>
               <span className="text-[10px] text-white/30 uppercase font-black tracking-widest">CoE / avg</span>
             </div>
          </div>
        </div>

        {/* Center Column: Thermal View + Alerts */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
          <ThermalView 
            videoRef={videoRef} 
            thermalData={thermalData} 
            zoom={zoom} 
            range={thermalRange}
            onRangeChange={setThermalRange}
            palette={palette}
          />
          <AlertsTable onAction={handleAction} />
        </div>

        {/* Right Column: AI & Zones */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          <ActionPanel 
            zoom={zoom} 
            sensitivity={sensitivity} 
            onSensitivityChange={setSensitivity} 
            palette={palette}
            onPaletteChange={setPalette}
            onAction={handleAction}
          />
          
          {/* External Links / Settings */}
          <div className="mt-auto pt-8 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
               <button className="flex flex-col items-center justify-center p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all group">
                 <Settings className="w-5 h-5 text-white/30 group-hover:text-white transition-colors mb-2" />
                 <span className="text-[9px] font-black uppercase text-white/40 group-hover:text-white transition-colors">Config</span>
               </button>
               <button className="flex flex-col items-center justify-center p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all group">
                 <Cpu className="w-5 h-5 text-white/30 group-hover:text-[#00F2FF] transition-colors mb-2" />
                 <span className="text-[9px] font-black uppercase text-white/40 group-hover:text-white transition-colors">Hardware</span>
               </button>
            </div>
            <div className="p-4 bg-[#00F2FF]/5 border border-[#00F2FF]/10 rounded-2xl flex items-center justify-between">
               <div className="flex flex-col">
                  <span className="text-[9px] font-black text-white/40 uppercase">License Status</span>
                  <span className="text-[10px] font-black text-[#00F2FF] uppercase">Enterprise Activated</span>
               </div>
               <CheckCircle2 className="w-5 h-5 text-[#00F2FF] opacity-60" />
            </div>
          </div>
        </div>
      </main>

      {/* Decorative Frame */}
      <div className="fixed inset-0 pointer-events-none border-[16px] border-[#0f172a] z-50 opacity-20" />
      
      {/* HUD Info */}
      <div className="fixed bottom-4 left-6 z-50 text-[10px] font-black text-white/10 uppercase tracking-[0.5em] pointer-events-none">
        THERMOSCAN AI v4.2.0 // INDUSTRIAL GRADE AR MONITORING
      </div>
    </div>
  );
}
