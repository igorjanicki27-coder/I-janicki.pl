import { Menu, Search, X } from 'lucide-react';
import React, { useState } from 'react';

interface NavbarProps {
  onSearchTrigger: () => void;
}

export default function Navbar({ onSearchTrigger }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 px-1 py-[14px] md:px-2 bg-black/30 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between max-w-7xl mx-auto w-full relative">
          
          {/* Left Side: MENU Button (icon only) */}
          <div className="flex items-center">
            <button 
              id="navbar-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex items-center justify-center p-1 text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

          {/* Center Logo exactly centered in nav */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center hover:opacity-90 transition-opacity cursor-pointer select-none">
            <span className="text-xl sm:text-2xl font-black tracking-[0.2em] font-space text-white uppercase whitespace-nowrap">
              AUTO-KOMIS
            </span>
          </div>

          {/* Right Side: Znajdź samochód */}
          <div className="flex items-center">
            <button 
              id="navbar-search-btn"
              onClick={onSearchTrigger}
              className="flex items-center gap-1 px-1.5 py-1.5 rounded-md border border-white/10 bg-white/5 hover:border-white transition-all cursor-pointer text-gray-300 hover:text-white text-xs tracking-wide font-space"
            >
              <span className="hidden md:inline">Znajdź samochód</span>
              <Search className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Backdrop & Sheet - outside nav to avoid filter containing block bug */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex flex-col items-center overflow-y-auto pt-24 pb-12">
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="absolute top-6 right-6 p-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="flex flex-col gap-6 text-center select-none font-space text-lg text-white">
            <span className="text-sm font-semibold tracking-[0.3em] uppercase text-yellow-400 mb-4">— MENU —</span>
            <a 
              href="#hero" 
              onClick={() => setMobileMenuOpen(false)} 
              className="text-2xl hover:text-white font-medium tracking-wider transition-colors"
            >
              Strona Główna
            </a>
            <a 
              href="#collection" 
              onClick={() => setMobileMenuOpen(false)} 
              className="text-2xl hover:text-white font-medium tracking-wider transition-colors"
            >
              Oferta
            </a>
            <a 
              href="#testimonials" 
              onClick={() => setMobileMenuOpen(false)} 
              className="text-2xl hover:text-white font-medium tracking-wider transition-colors"
            >
              Opinie
            </a>
            <a 
              href="#testimonials" 
              onClick={() => setMobileMenuOpen(false)} 
              className="text-2xl hover:text-white font-medium tracking-wider transition-colors"
            >
              Blog
            </a>
            <a 
              href="#cta" 
              onClick={() => setMobileMenuOpen(false)} 
              className="text-2xl hover:text-white font-medium tracking-wider transition-colors"
            >
              Kup marzenia
            </a>
          </div>
        </div>
      )}
    </>
  );
}