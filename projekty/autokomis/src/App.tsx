import { useState, useEffect } from 'react';
import { 
  Vehicle, 
  Review, 
  Story, 
  INITIAL_VEHICLES, 
  INITIAL_REVIEWS, 
  INITIAL_STORIES 
} from './types';
import { Phone } from 'lucide-react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Collection from './components/Collection';
import Testimonials from './components/Testimonials';
import CTA from './components/CTA';
import AdminPanel from './components/AdminPanel';
import ContactModal from './components/ContactModal';

export default function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reviews] = useState<Review[]>(INITIAL_REVIEWS);
  const [stories] = useState<Story[]>(INITIAL_STORIES);
  
  const [activeVehicle, setActiveVehicle] = useState<Vehicle | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  // Load state from localStorage on init
  useEffect(() => {
    // --- Migration: force reload from defaults if stored data has old image paths ---
    const storedVehiclesRaw = localStorage.getItem('autoza_vehicles');
    if (storedVehiclesRaw) {
      try {
        const parsed = JSON.parse(storedVehiclesRaw) as Vehicle[];
        const hasOldPaths = parsed.some(
          (v) => typeof v.image === 'string' && v.image.includes('komis-samochodowy')
        );
        if (hasOldPaths) {
          // Remove stale cache so that updated INITIAL_VEHICLES are loaded
          localStorage.removeItem('autoza_vehicles');
          console.log('[Auto-Komis] Migration: removed stale autoza_vehicles from localStorage');
        }
      } catch {}
    }
    const storedVehicles = localStorage.getItem('autoza_vehicles');
    if (storedVehicles) {
      try {
        const parsed = JSON.parse(storedVehicles) as Vehicle[];
        if (parsed.length > 0) {
          setVehicles(parsed);
          // Set active vehicle to first stored
          setActiveVehicle(parsed[0]);
          return;
        }
      } catch (err) {
        console.error('Error parsing stored vehicles, resetting to stock defaults', err);
      }
    }
    // Fall back to predefined lists
    setVehicles(INITIAL_VEHICLES);
    setActiveVehicle(INITIAL_VEHICLES[0]);
  }, []);

  // Update overall vehicles database
  const handleUpdateVehicles = (newVehicles: Vehicle[]) => {
    setVehicles(newVehicles);
    localStorage.setItem('autoza_vehicles', JSON.stringify(newVehicles));

    // Handle active vehicle safeguard
    if (activeVehicle) {
      const isStillAlive = newVehicles.find((car) => car.id === activeVehicle.id);
      if (isStillAlive) {
        setActiveVehicle(isStillAlive);
      } else if (newVehicles.length > 0) {
        setActiveVehicle(newVehicles[0]);
      } else {
        setActiveVehicle(null);
      }
    } else if (newVehicles.length > 0) {
      setActiveVehicle(newVehicles[0]);
    }
  };

  // Sync / update single vehicle parameters (like speed revving or battery charging)
  const handleUpdateSingleVehicle = (updated: Vehicle) => {
    const nextList = vehicles.map((car) => car.id === updated.id ? updated : car);
    handleUpdateVehicles(nextList);
  };

  // Hard Reset DB
  const handleResetToDefaults = () => {
    localStorage.removeItem('autoza_vehicles');
    setVehicles(INITIAL_VEHICLES);
    setActiveVehicle(INITIAL_VEHICLES[0]);
  };

  // Scroll and highlight shortcut
  const handleSearchShortcut = () => {
    const el = document.getElementById('collection');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!activeVehicle || vehicles.length === 0) {
    return (
      <div className="min-h-screen bg-[#0c0d0f] flex items-center justify-center text-center p-6 font-space text-white">
        <div className="space-y-4">
          <div className="w-12 h-12 rounded-full border-t-2 border-yellow-400 animate-spin mx-auto" />
          <h2 className="text-xl font-bold tracking-widest uppercase text-yellow-400">INICJOWANIE SILNIKA AUTO-KOMIS...</h2>
          <p className="text-xs text-gray-400">Ładowanie diagnostyki elektronicznej i modeli samochodów...</p>
        </div>
      </div>
    );
  }

  // Filter vehicles with featured key for top header carousel
  const featuredOnly = vehicles.filter((v) => v.featured);
  const galleryFeed = featuredOnly.length > 0 ? featuredOnly : vehicles.slice(0, 5);

  return (
    <div className="relative min-h-screen bg-[#0c0d0f] text-[#f3f4f6] font-sans antialiased selection:bg-white selection:text-black flex flex-col">
      
      {/* 1. Header Navigation */}
      <Navbar 
        onSearchTrigger={handleSearchShortcut}
      />

      {/* 2. Hero Background Slider and Marquees */}
      <Hero 
        vehicles={vehicles}
        activeVehicle={activeVehicle}
        setActiveVehicle={setActiveVehicle}
        onOpenContact={() => setContactOpen(true)}
      />

      {/* 3. Car Search & Comprehensive Filter Grid Section */}
      <Collection 
        vehicles={vehicles}
        activeVehicleId={activeVehicle.id}
        onSelectVehicle={setActiveVehicle}
      />

      {/* 5. User testimonials and Polish stories */}
      <Testimonials 
        reviews={reviews}
        stories={stories}
      />

      {/* Spacer to push CTA to bottom */}
      <div className="flex-1 min-h-0" />

      {/* 6. High contrast Vintage picture banner & CTA Popup form */}
      <CTA 
        onOpenAdmin={() => setAdminOpen(true)}
        isAdminActive={adminOpen}
        onOpenContact={() => setContactOpen(true)}
      />

      {/* 7. Slide Over Control Hub Panel */}
      <AdminPanel 
        isOpen={adminOpen}
        onClose={() => setAdminOpen(false)}
        vehicles={vehicles}
        onUpdateVehicles={handleUpdateVehicles}
        onResetToDefaults={handleResetToDefaults}
      />

      {/* 8. Centralized Contact Form Dialog */}
      <ContactModal 
        isOpen={contactOpen} 
        onClose={() => setContactOpen(false)} 
        initialCarName={activeVehicle ? `${activeVehicle.brand} ${activeVehicle.model}` : ''}
      />

      {/* 9. Floating Contact Action Button */}
      <button
        id="floating-contact-btn"
        onClick={() => setContactOpen(true)}
        className="fixed bottom-6 right-6 z-40 p-4 rounded-full bg-black/20 backdrop-blur-xl text-white shadow-2xl transition-all hover:scale-110 active:scale-95 duration-300 cursor-pointer border border-white/30 hover:border-white/60 flex items-center justify-center animate-jump-once focus:outline-none focus-visible:outline-none"
        title="Skontaktuj się z nami"
      >
        <Phone className="w-5 h-5 text-white" />
      </button>

    </div>
  );
}