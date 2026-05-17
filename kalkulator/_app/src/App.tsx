import { useEffect, useState } from 'react';
import { PinGate } from './components/PinGate';
import Kalkulator from './pages/Kalkulator';
import { isPinUnlocked, getLockRemainingMs } from './lib/pin';
import loginLogoUrl from './assets/logo-login.png';

export default function App() {
  const [unlocked, setUnlocked] = useState(() => isPinUnlocked());
  const [isRevealVisible, setIsRevealVisible] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isPinUnlocked() || getLockRemainingMs() > 0) {
        setUnlocked(isPinUnlocked());
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isRevealVisible) return;
    const revealTimer = window.setTimeout(() => {
      setUnlocked(true);
      setIsRevealVisible(false);
    }, 2000);

    return () => window.clearTimeout(revealTimer);
  }, [isRevealVisible]);

  const handleUnlock = () => {
    setIsRevealVisible(true);
  };

  if (isRevealVisible) {
    return (
      <div className="min-h-screen w-full overflow-hidden bg-[#050505] text-white selection:bg-emerald-500/30">
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-6">
          <div className="w-full max-w-sm rounded-[28px] bg-[linear-gradient(145deg,rgba(21,25,40,0.78),rgba(9,11,18,0.95))] shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_0_1px_rgba(127,64,255,0.18)] backdrop-blur-xl px-6 py-8 sm:px-8 sm:py-10 flex items-center justify-center">
            <img
              src={loginLogoUrl}
              alt="Logo"
              className="h-56 w-56 sm:h-64 sm:w-64 object-contain pin-reveal-logo"
            />
          </div>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return <PinGate onUnlock={handleUnlock} />;
  }

  return <Kalkulator />;
}
