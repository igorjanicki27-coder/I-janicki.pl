import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { getLockRemainingMs, registerPinAttempt } from '../lib/pin';

interface PinGateProps {
  onUnlock: () => void;
}

export function PinGate({ onUnlock }: PinGateProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [digits, setDigits] = useState(['', '', '', '']);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const lockRemaining = getLockRemainingMs(now);
  const isLocked = lockRemaining > 0;

  const commitCode = (nextDigits: string[]) => {
    const nextCode = nextDigits.join('');
    if (nextCode.length !== 4) return;

    const result = registerPinAttempt(nextCode);
    if (result.ok) {
      onUnlock();
      return;
    }

    setDigits(['', '', '', '']);
    inputRefs.current[0]?.focus();
  };

  const handleChange = (index: number, value: string) => {
    if (isLocked) return;

    const nextValue = value.replace(/\D/g, '').slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = nextValue;
    setDigits(nextDigits);

    if (nextDigits.every(Boolean)) {
      commitCode(nextDigits);
    }

    if (nextValue) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      setDigits((current) => {
        const nextDigits = [...current];
        if (nextDigits[index]) {
          nextDigits[index] = '';
        } else if (index > 0) {
          nextDigits[index - 1] = '';
          inputRefs.current[index - 1]?.focus();
        }
        return nextDigits;
      });
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }

    if (event.key === 'ArrowRight' && index < 3) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (isLocked) return;

    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;

    event.preventDefault();
    const nextDigits = ['','','',''];
    pasted.split('').forEach((digit, index) => {
      nextDigits[index] = digit;
    });
    setDigits(nextDigits);
    if (pasted.length === 4) {
      commitCode(nextDigits);
      return;
    }
    inputRefs.current[pasted.length]?.focus();
  };

  return (
    <div className="min-h-screen w-full overflow-hidden bg-[#050505] text-white selection:bg-emerald-500/30">
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-6">
        <div
          className="w-full max-w-sm rounded-[28px] bg-[linear-gradient(145deg,rgba(21,25,40,0.78),rgba(9,11,18,0.95))] shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_0_1px_rgba(127,64,255,0.18)] backdrop-blur-xl px-6 py-8 sm:px-8 sm:py-10 flex items-center"
          style={{ minHeight: '260px' }}
        >
          <div className="grid w-full grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 4 }).map((_, index) => {
              return (
                <input
                  key={index}
                  ref={(node) => {
                    inputRefs.current[index] = node;
                  }}
                  value={digits[index]}
                  onChange={(event) => handleChange(index, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  onPaste={handlePaste}
                  type="password"
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  disabled={isLocked}
                  aria-label={`Cyfra PIN ${index + 1}`}
                  className="h-16 sm:h-[4.8rem] rounded-2xl border border-white/10 bg-black/35 text-center text-3xl font-semibold tracking-[0.4em] text-white shadow-inner shadow-black/20 outline-none transition focus:border-emerald-400/60 focus:bg-black/45 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
