import { Shield } from 'lucide-react';
import React from 'react';

interface CTAProps {
  onOpenAdmin: () => void;
  isAdminActive: boolean;
  onOpenContact: () => void;
}

export default function CTA({ onOpenAdmin, isAdminActive, onOpenContact }: CTAProps) {
  return (
    <section id="cta" className="bg-[#070809] py-0 relative select-none z-10 overflow-hidden">
      
      {/* Abstract background ambient flare */}
      <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.03] blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 md:px-12">
        
        {/* Redesigned High-contrast Luxury Photo Banner based on requested layout */}
        <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-neutral-950 min-h-[460px] flex flex-col group">
          
          {/* Cover image - clean, no gradients or overlays creating edge shadows */}
          <div className="absolute inset-0 z-0">
            <img 
              src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1600&auto=format&fit=crop&q=80" 
              alt="Classic vintage sports car rear rear light trail in absolute darkness" 
              className="w-full h-full object-cover opacity-30 group-hover:scale-103 transition-transform duration-[6000ms]"
              referrerPolicy="no-referrer"
            />
            {/* Very subtle uniform darkening for readability only, no side gradients */}
            <div className="absolute inset-0 bg-black/20" />
          </div>

          {/* Main Layout - heading top, KONTAKT centered, texts bottom-right */}
          <div className="z-10 flex flex-col flex-1">
            
            {/* Top: Bold pure text heading — absolute in card */}
            <div className="absolute top-4 left-4">
              <h2 className="text-4xl sm:text-6xl lg:text-7xl font-black font-space text-white leading-[1.0] uppercase tracking-normal select-none">
                Sprzedajemy <br />
                <span className="text-white">marzenia</span>
              </h2>
            </div>

            {/* Center: KONTAKT button only — perfectly centered in full card height */}
            <div className="flex flex-1 items-center justify-center pt-4">
              <button
                id="cta-contact-btn"
                onClick={onOpenContact}
                className="group flex items-center gap-3 px-10 py-4 border border-white/20 hover:border-white bg-white/10 text-white hover:bg-white/20 font-space text-base sm:text-lg font-bold tracking-[0.15em] uppercase rounded-lg cursor-pointer transition-all duration-300 hover:scale-105"
              >
                <span>KONTAKT</span>
                <span className="text-lg">↗</span>
              </button>
            </div>

          </div>

            {/* Bottom-right: description texts — absolutely positioned in card */}
            <div className="absolute bottom-4 right-4 text-right z-20">
              <p className="text-sm sm:text-base font-sans text-gray-300 font-light tracking-wide leading-relaxed">
                Sprzedaj samochód.
              </p>
              <p className="text-sm sm:text-base font-sans text-gray-300 font-light tracking-wide leading-relaxed">
                Kup niezapomniane chwile.
              </p>
            </div>

        </div>

        {/* Simplified Centered Polish Footer */}
        {/* format requested: "@2026 | Design & Development by Igor Janicki | Dokumenty" */}
        <footer className="mt-16 py-1 border-t border-white/5 flex flex-col sm:flex-row items-center relative">
          
          {/* Centered text label */}
          <div className="w-full text-center text-[11px] font-mono text-gray-500 tracking-wider">
            @2026 | Design & Development by Igor Janicki | Dokumenty
          </div>

          {/* Shield Admin trigger moved elegantly to the absolute bottom-right corner as a discreet icon Only */}
          <div className="absolute left-0 flex items-center">
            <button
              id="footer-admin-trigger"
              onClick={() => {}}
              title="Panel Administratora"
              className={`p-2.5 rounded-full text-gray-600 hover:text-gray-400 transition-all cursor-pointer ${
                isAdminActive 
                  ? 'scale-105' 
                  : ''
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
            </button>
          </div>
          
        </footer>

      </div>
    </section>
  );
}