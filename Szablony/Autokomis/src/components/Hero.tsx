import { ChevronRight } from 'lucide-react';
import React, { useEffect } from 'react';
import { Vehicle, HERO_LOT_IMAGES } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface HeroProps {
  vehicles: Vehicle[];
  activeVehicle: Vehicle | null;
  setActiveVehicle: (v: Vehicle) => void;
  onOpenContact: () => void;
}

export default function Hero({ vehicles, activeVehicle, setActiveVehicle, onOpenContact }: HeroProps) {
  const featuredVehicles = vehicles.filter(v => v.featured);

  // Auto-play interval for changing showcase vehicle every 5 seconds
  useEffect(() => {
    if (featuredVehicles.length === 0) return;
    const interval = setInterval(() => {
      const currentIndex = featuredVehicles.findIndex((v) => v.id === activeVehicle.id);
      const nextIndex = (currentIndex + 1) % featuredVehicles.length;
      setActiveVehicle(featuredVehicles[nextIndex]);
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredVehicles, activeVehicle, setActiveVehicle]);

  // Auto-play interval for lot background images (komis-samochodowy-*.webp)
  const [lotIndex, setLotIndex] = React.useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setLotIndex((prev) => (prev + 1) % HERO_LOT_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section 
      id="hero" 
      className="relative min-h-screen flex flex-col overflow-hidden select-none"
    >
      {/* Background Slides with AnimatePresence for smooth fade-in-out */}
      <div className="absolute inset-0 z-0">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={lotIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.75 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: `url('${HERO_LOT_IMAGES[lotIndex]}')`,
            }}
          />
        </AnimatePresence>
        
        {/* Dark radial and vertical gradient covering the background */}
        <div className="absolute inset-0 bg-radial-at-c from-[#000000]/15 via-[#0c0d0f]/65 to-[#0c0d0f] z-1" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d0f] via-transparent to-[#0c0d0f]/40 z-1" />
      </div>

      {/* Main Hero Container — flex column to push thumbnails to bottom */}
      <div className="w-full max-w-7xl mx-auto px-6 md:px-12 z-10 flex flex-col flex-1">

        {/* Spacer to push content toward center */}
        <div className="flex-1" />

        {/* AUTO-KOMIS + motto + przycisk — dokładnie na środku */}
        <div className="flex flex-col items-center justify-center text-center gap-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-3"
          >
            {/* Main Title heading matching screenshot */}
            <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black font-space text-white tracking-[0.12em] uppercase drop-shadow-lg leading-none">
              AUTO-KOMIS
            </h1>

            {/* Mottos in Polish */}
            <p className="text-xs sm:text-sm md:text-base font-sans text-gray-300 font-light tracking-[0.15em] max-w-xl mx-auto uppercase">
              Kupuj. Sprzedawaj. Wymieniaj.
            </p>
          </motion.div>

          {/* ODKRYJ Button - tuż pod mottem */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <button
              onClick={onOpenContact}
              className="group relative inline-flex items-center gap-2 border border-white/25 bg-white/5 hover:border-white hover:text-white font-space text-xs tracking-[0.2em] font-bold text-white/60 px-8 py-3.5 transition-all uppercase rounded-sm cursor-pointer shadow-xl shadow-black/40"
            >
              <span className="relative z-10 flex items-center gap-1.5">
                ODKRYJ <ChevronRight className="w-4 h-4 text-white/70 group-hover:text-white group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </motion.div>
        </div>

        {/* Bottom spacer */}
        <div className="flex-1" />
      </div>
    </section>
  );
}