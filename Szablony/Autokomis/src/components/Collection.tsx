import { ShieldCheck } from 'lucide-react';
import React, { useState, useMemo, useRef } from 'react';
import { Vehicle } from '../types';

interface CollectionProps {
  vehicles: Vehicle[];
  activeVehicleId: string;
  onSelectVehicle: (v: Vehicle) => void;
}

export default function Collection({ vehicles, activeVehicleId, onSelectVehicle }: CollectionProps) {
  const [activeSubCar, setActiveSubCar] = useState<Vehicle | null>(null);
  
  // Carousel scroll ref
  const carouselRef = useRef<HTMLDivElement>(null);

  // Form states on subpage
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '', date: '', notes: '' });

  // Filter 3 newest cars for the main view
  const newestCars = useMemo(() => {
    // Return first 3 vehicles as 'newest'
    return vehicles.slice(0, 3);
  }, [vehicles]);

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmount = 340; // width of a card roughly + gap
      carouselRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSuccess(true);
    setContactForm({ name: '', phone: '', email: '', date: '', notes: '' });
    setTimeout(() => {
      setContactSuccess(false);
    }, 4000);
  };

  // If a car subpage is active, render full screen subpage with luxury information
  if (activeSubCar) {
    return (
      <section id="collection" className="bg-[#0c0d0f] py-16 md:py-24 border-t border-white/5 relative z-20 select-none">
        <div className="max-w-6xl mx-auto px-6">
          {/* Back button */}
          <button
            onClick={() => setActiveSubCar(null)}
            className="flex items-center gap-2 text-xs font-space font-bold text-yellow-400 uppercase tracking-widest hover:text-yellow-300 mb-8 cursor-pointer transition-colors"
          >
            <span>← Powrót do ogłoszeń</span>
          </button>

          {/* Subpage Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-start">
            
            {/* Left Column: Big gallery image and spec */}
            <div className="lg:col-span-7 space-y-6">
              <div className="relative rounded-2xl overflow-hidden aspect-[16/10] bg-black border border-white/10 shadow-2xl">
                <img
                  src={activeSubCar.image}
                  alt={`${activeSubCar.brand} ${activeSubCar.model}`}
                  className="w-full h-full object-cover"
                />
                
                {/* Vintage dark shading */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

                {/* Badges on picture */}
                <span className="absolute top-4 left-4 px-3 py-1 text-xs font-bold tracking-widest font-mono rounded bg-black text-white">
                  {activeSubCar.brand}
                </span>
              </div>

              {/* Title parameters */}
              <div className="border-b border-white/5 pb-6">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                  <h1 className="text-3xl sm:text-4xl font-black font-space text-white tracking-wide uppercase">
                    {activeSubCar.brand} {activeSubCar.model}
                  </h1>
                  <span className="text-2xl sm:text-3xl font-black text-yellow-300 font-space whitespace-nowrap">
                    {activeSubCar.price}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-2 font-mono tracking-widest uppercase">
                  VIN: {activeSubCar.vehicleId} • Rok: {activeSubCar.year} • Seria: {activeSubCar.series || 'Elite Selection'}
                </p>
              </div>

              {/* Description */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold font-space text-yellow-300 uppercase tracking-wider">— Szczegółowy opis pojazdu —</h3>
                <p className="text-gray-300 leading-relaxed font-light text-sm">
                  {activeSubCar.description || `${activeSubCar.brand} ${activeSubCar.model} to kwintesencja sportowych emocji oraz luksusowego komfortu. Prezentowany egzemplarz charakteryzuje się nienagannym stanem technicznym, oryginalnym lakierem oraz precyzyjnie prowadzonym serwisem. Wyposażony we wszystkie najnowsze systemy asystujące rzetelnej telemetrii IoT.`}
                </p>
              </div>

              {/* Tech Spec table with border layout */}
              <div className="space-y-4 pt-4">
                <h3 className="text-sm font-bold font-space text-yellow-400 uppercase tracking-wider">— Specyfikacja Techniczna —</h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-neutral-900 border border-white/5 p-3.5 rounded">
                    <span className="block text-[10px] text-gray-400 font-mono uppercase">Moc silnika</span>
                    <strong className="text-sm font-space text-white">{activeSubCar.power} KM | {activeSubCar.engineDisplacement}</strong>
                  </div>
                  <div className="bg-neutral-900 border border-white/5 p-3.5 rounded">
                    <span className="block text-[10px] text-gray-400 font-mono uppercase">Przebieg certyfikowany</span>
                    <strong className="text-sm font-space text-white">{activeSubCar.mileage}</strong>
                  </div>
                  <div className="bg-neutral-900 border border-white/5 p-3.5 rounded">
                    <span className="block text-[10px] text-gray-400 font-mono uppercase">Skrzynia biegów</span>
                    <strong className="text-sm font-space text-white">{activeSubCar.transmission}</strong>
                  </div>
                  <div className="bg-neutral-900 border border-white/5 p-3.5 rounded">
                    <span className="block text-[10px] text-gray-400 font-mono uppercase">Paliwo / Napęd</span>
                    <strong className="text-sm font-space text-white">{activeSubCar.fuelType}</strong>
                  </div>
                  <div className="bg-neutral-900 border border-white/5 p-3.5 rounded">
                    <span className="block text-[10px] text-gray-400 font-mono uppercase">Klasa / Stan</span>
                    <strong className="text-sm font-space text-white">{activeSubCar.condition}</strong>
                  </div>
                  <div className="bg-neutral-900 border border-white/5 p-3.5 rounded">
                    <span className="block text-[10px] text-gray-400 font-mono uppercase">Lokalizacja</span>
                    <strong className="text-sm font-space text-white truncate block" title={activeSubCar.location}>{activeSubCar.location}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Contact and reservation box */}
            <div className="lg:col-span-5 bg-neutral-900 border border-white/10 p-6 rounded-2xl md:p-8 space-y-6">
              
              <div>
                <h3 className="text-lg font-bold font-space text-white uppercase tracking-wider">
                  Zarezerwuj to auto
                </h3>
                <p className="text-xs text-yellow-400 font-mono">Umów się na bezpłatną jazdę próbną</p>
              </div>

              {contactSuccess ? (
                <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                    ✓
                  </div>
                  <h4 className="text-sm font-bold text-white uppercase font-space">ZGŁOSZENIE PRZYJĘTE</h4>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Dziękujemy! Twój termin jazdy próbnej został wstępnie zarezerwowany. Nasz doradca skontaktuje się z Tobą w ciągu 15 minut w celu potwierdzenia szczegółów.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1.5 font-mono">
                      Twoje imię i nazwisko *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="np. Jan Kowalski"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      className="w-full bg-[#121419] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1.5 font-mono">
                        Telefon kontaktowy *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="+48 999 888 777"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                        className="w-full bg-[#121419] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1.5 font-mono">
                        Data oględzin *
                      </label>
                      <input
                        type="date"
                        required
                        value={contactForm.date}
                        onChange={(e) => setContactForm({ ...contactForm, date: e.target.value })}
                        className="w-full bg-[#121419] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1.5 font-mono">
                      Adres E-mail (Opcjonalnie)
                    </label>
                    <input
                      type="email"
                      placeholder="np. jan@gmail.com"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      className="w-full bg-[#121419] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1.5 font-mono">
                      Wiadomość / Dodatkowe uwagi
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Chcę sprawdzić stan powłoki lakierniczej na miejscu..."
                      value={contactForm.notes}
                      onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                      className="w-full bg-[#121419] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-black border border-gray-600 hover:border-white text-white hover:text-gray-300 font-space font-bold uppercase tracking-widest text-xs transition-colors rounded cursor-pointer"
                  >
                    UMÓW JAZDĘ PRÓBNĄ ↗
                  </button>
                </form>
              )}

              {/* Security guarantee line */}
              <div className="pt-4 border-t border-white/5 space-y-2 text-[10px] text-gray-500 font-mono">
                <p className="flex items-center gap-1.5 text-gray-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" />
                  Gwarancja bezpiecznego zakupu AUTO-KOMIS
                </p>
                <p>Każdy samochód w naszym salonie przechodzi rygorystyczny test 100 punktów kontrolnych przed wystawieniem.</p>
              </div>

            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="collection" className="bg-[#0c0d0f] py-24 border-t border-white/5 relative z-10 select-none">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        
        {/* Section Header exactly formatted as requested */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
          <div className="space-y-3">
            <span className="text-[11px] font-space text-yellow-400 uppercase tracking-[0.2em] font-medium block">
              — OFERTA —
            </span>
            <h2 className="text-3xl md:text-5xl font-black font-space text-white tracking-tight leading-tight uppercase">
              Ogłoszenia
            </h2>
          </div>

          {/* All advertisements button — no action */}
          <div className="flex items-center">
            <button
              onClick={() => {}}
              className="group flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest font-space border border-white/30 bg-white/5 hover:border-white text-gray-300 hover:text-white rounded-sm cursor-pointer transition-all"
            >
              <span>Wszystkie ogłoszenia</span>
              <svg className="w-4 h-4 text-white/70 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
            </button>
          </div>
        </div>

        {/* 3 Newest Responsive Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {newestCars.map((car) => {
              return (
                <div
                  key={car.id}
                  onClick={() => {
                    onSelectVehicle(car);
                    setActiveSubCar(car); // Go to detailed subpage on click
                  }}
                  className="group rounded-xl overflow-hidden cursor-pointer flex flex-col justify-between transition-all bg-[#121419]/45 border border-white/5 hover:border-white/15 self-stretch"
                >
                  {/* Picture area */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-black/40">
                    <img
                      src={car.image}
                      alt={`${car.brand} ${car.model}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                    
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/30 to-transparent opacity-85" />
                    
                    {/* Brand Label */}
                    <span className="absolute top-3 left-3 px-2 py-0.5 text-[9px] uppercase tracking-widest font-mono font-bold rounded-sm border border-white/10 bg-[#0d0e11]/90 text-yellow-300">
                      {car.brand}
                    </span>

                    {/* Engine Horsepower + Displacement */}
                    <div className="absolute bottom-3 right-3 text-[10px] font-mono font-medium bg-black/60 px-2 py-0.5 rounded border border-white/5 text-gray-300">
                      {car.power} KM | {car.engineDisplacement}
                    </div>
                  </div>

                  {/* Textual descriptions */}
                  <div className="p-4 bg-gradient-to-b from-transparent to-[#0d0e11] flex-1 flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white tracking-widest uppercase font-sans truncate pr-2">
                          {car.model}
                        </h4>
                        <span className="text-sm font-bold text-yellow-300 font-space whitespace-nowrap">
                          {car.price}
                        </span>
                      </div>
                      <span className="text-[10px] font-light text-gray-400 uppercase tracking-widest mt-1 block">
                        {car.series || `${car.year} Series`}
                      </span>
                    </div>

                    {/* Simplified footer with only mileage */}
                    <div className="border-t border-white/5 pt-3">
                      <span className="text-[10px] text-gray-500 font-mono">
                        Przebieg: {car.mileage}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
      </div>
    </section>
  );
}