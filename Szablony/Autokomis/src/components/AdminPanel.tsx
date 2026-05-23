import { Plus, Trash2, X, RotateCcw, Copy, Sparkles, AlertCircle } from 'lucide-react';
import React, { useState, useEffect, FormEvent } from 'react';
import { Vehicle } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  onUpdateVehicles: (newVehicles: Vehicle[]) => void;
  onResetToDefaults: () => void;
}

const BRAND_PRESETS = ['Mercedes-Benz', 'Mercedes-Maybach', 'Audi', 'Alfa Romeo', 'Porsche', 'Tesla', 'BMW', 'Ferrari', 'Jaguar', 'Hyundai', 'Opel'];
const FUEL_TYP_OPTIONS: { value: Vehicle['fuelType']; label: string }[] = [
  { value: 'Benzyna', label: 'Benzyna' },
  { value: 'Diesel', label: 'Diesel' },
  { value: 'Napęd Elektryczny', label: 'Elektryczny' },
  { value: 'Hybryda', label: 'Hybryda' },
];

export default function AdminPanel({ isOpen, onClose, vehicles, onUpdateVehicles, onResetToDefaults }: AdminPanelProps) {
  const [editingCarId, setEditingCarId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Vehicle>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  // Load selected car coordinates into form
  useEffect(() => {
    if (editingCarId) {
      const selected = vehicles.find((v) => v.id === editingCarId);
      if (selected) {
        setFormData({ ...selected });
      }
    } else {
      // Empty form for new car
      setFormData({
        brand: 'Mercedes-Benz',
        model: '',
        price: '150 000 zł',
        numericPrice: 150000,
        year: 2025,
        series: 'Elite Series',
        image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',
        description: 'Nowoczesne, luksusowe auto sportowe o doskonałych parametrach jezdnych.',
        condition: 'Smart Drive',
        vehicleId: `AB-${Math.floor(1000 + Math.random() * 9000)}-XX`,
        location: 'Warszawa, PL',
        driverName: 'Igor J.',
        fuelLevel: 80,
        engineStatus: 'Running',
        mileage: '12,500 km',
        numericMileage: 12500,
        driveMode: 'Eco Mode',
        speed: 80,
        fuelType: 'Benzyna',
        transmission: 'Automatyczna',
        power: 320,
        featured: true,
      });
    }
  }, [editingCarId, vehicles, isOpen]);

  // Save changes
  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.brand || !formData.model) {
      alert('Proszę podać markę i model pojazdu.');
      return;
    }

    let updatedList: Vehicle[];
    if (editingCarId) {
      // Update
      updatedList = vehicles.map((car) =>
        car.id === editingCarId ? ({ ...car, ...formData } as Vehicle) : car
      );
      setFeedback('Poprawnie zaktualizowano pojazd!');
    } else {
      // Create new
      const newCar: Vehicle = {
        ...(formData as Omit<Vehicle, 'id'>),
        id: `car-${Date.now()}`,
      };
      updatedList = [newCar, ...vehicles];
      setFeedback('Nowa oferta została dodana pomyślnie!');
      setEditingCarId(null);
    }

    onUpdateVehicles(updatedList);
    setTimeout(() => setFeedback(null), 3000);
  };

  // Duplicate a car
  const handleDuplicate = (car: Vehicle) => {
    const duplicated: Vehicle = {
      ...car,
      id: `car-${Date.now()}`,
      model: `${car.model} (Kopia)`,
      vehicleId: `AB-${Math.floor(1000 + Math.random() * 9000)}-CL`,
    };
    onUpdateVehicles([duplicated, ...vehicles]);
    setFeedback(`Duplikacja zakończona sukcesem!`);
    setTimeout(() => setFeedback(null), 3500);
  };

  // Delete a car
  const handleDelete = (carId: string) => {
    if (confirm('Czy na pewno chcesz usunąć tę ofertę z komisu?')) {
      const filtered = vehicles.filter((v) => v.id !== carId);
      onUpdateVehicles(filtered);
      if (editingCarId === carId) {
        setEditingCarId(null);
      }
      setFeedback('Oferta została usunięta.');
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Blur */}
          <motion.div
            id="admin-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 pointer-events-auto"
          />

          {/* Slide panel */}
          <motion.div
            id="admin-slide-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-[#0e1013] border-l border-white/5 shadow-2xl z-50 flex flex-col pointer-events-auto overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-[#121419]/90">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-300" />
                <div>
                  <h2 className="text-lg font-bold font-space text-white uppercase tracking-wider">
                    Panel Modułu Komis
                  </h2>
                  <p className="text-xs text-gray-400">Dodawaj, edytuj i zarządzaj ofertami na żywo</p>
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="p-1 rounded-full border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inner Content Grid */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              
              {feedback && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-4 py-3 rounded-lg flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  {feedback}
                </div>
              )}

              {/* Actions row */}
              <div className="flex gap-2 flex-wrap justify-between items-center bg-white/5 p-4 rounded-xl border border-white/5">
                <div className="text-xs text-gray-300">
                  Łącznie w bazie: <strong className="text-white text-sm">{vehicles.length}</strong> pojazdów
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCarId(null);
                      setFormData({
                        brand: 'Mercedes-Benz',
                        model: '',
                        price: '150 000 zł',
                        numericPrice: 150000,
                        year: 2025,
                        series: 'Elite Series',
                        image: 'https://images.unsplash.com/photo-1542362567-b07e54358753?w=800&auto=format&fit=crop&q=80',
                        description: 'Eleganckie auto o wyśmienitych osiągach.',
                        condition: 'Smart Drive',
                        vehicleId: `AB-${Math.floor(1000 + Math.random() * 9000)}-XX`,
                        location: 'Warszawa, PL',
                        driverName: 'Igor J.',
                        fuelLevel: 80,
                        engineStatus: 'Running',
                        mileage: '12,500 km',
                        numericMileage: 12500,
                        driveMode: 'Comfort Mode',
                        speed: 70,
                        fuelType: 'Benzyna',
                        transmission: 'Automatyczna',
                        power: 280,
                        featured: true,
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black border border-gray-600 hover:border-white text-white hover:text-gray-300 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    Nowy pojazd
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Czy chcesz zresetować bazę ofert do fabrycznych ustawień? Nadpisze to wszystkie dokonane zmiany.')) {
                        onResetToDefaults();
                        setEditingCarId(null);
                        setFeedback('Przywrócono domyślne pojazdy pokazowe!');
                        setTimeout(() => setFeedback(null), 3000);
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs tracking-wider transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Resetuj bazę
                  </button>
                </div>
              </div>

              {/* Edit Existing Automobile List */}
              <div>
                <h3 className="text-xs font-bold font-space uppercase tracking-wider text-yellow-300 mb-3">— Kliknij pojazd aby go edytować —</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {vehicles.map((car) => (
                    <div
                      key={car.id}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs gap-2 transition-all cursor-pointer ${
                        editingCarId === car.id
                          ? 'border-yellow-400 bg-yellow-400/5'
                          : 'border-white/5 bg-[#121419] hover:bg-white/5'
                      }`}
                      onClick={() => setEditingCarId(car.id)}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <img 
                          src={car.image} 
                          alt={car.model} 
                          className="w-10 h-10 object-cover rounded"
                          referrerPolicy="no-referrer"
                        />
                        <div className="truncate">
                          <p className="font-bold text-white leading-tight truncate">{car.brand} {car.model}</p>
                          <p className="text-gray-400 text-[10px]">{car.year} • <span className="text-yellow-300">{car.price}</span></p>
                        </div>
                      </div>

                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(car)}
                          title="Sklonuj pojazd"
                          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(car.id)}
                          title="Usuń ofertę"
                          className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form definition */}
              <form onSubmit={handleSave} className="space-y-6 pt-4 border-t border-white/5">
                <div className="flex justify-between items-center bg-yellow-400/5 p-3 rounded-lg border border-yellow-400/20">
                  <span className="text-xs sm:text-sm font-semibold text-white font-space flex items-center gap-1.5">
                    {editingCarId ? '📝 TRYB EDYCJI OFERTY' : '✨ DODAWANIE NOWEJ OFERTY'}
                  </span>
                  {editingCarId && (
                    <button
                      type="button"
                      onClick={() => setEditingCarId(null)}
                      className="text-[10px] text-yellow-300 hover:text-yellow-300 tracking-wider uppercase font-space"
                    >
                      Przełącz na Dodawanie Nowego +
                    </button>
                  )}
                </div>

                {/* Grid Inputs 1 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-space text-gray-400 uppercase tracking-widest mb-1">
                      Marka *
                    </label>
                    <select
                      value={formData.brand || 'Mercedes-Benz'}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      className="w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:ring-1 focus:ring-yellow-400 outline-none"
                    >
                      {BRAND_PRESETS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-space text-gray-400 uppercase tracking-widest mb-1">
                      Model pojazdu *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="np. GT Coupe"
                      value={formData.model || ''}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      className="w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:ring-1 focus:ring-yellow-400 outline-none"
                    />
                  </div>
                </div>

                {/* Grid Inputs 2 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-space text-gray-400 uppercase tracking-widest mb-1">
                      Cena (Wyświetlana tekstowo)
                    </label>
                    <input
                      type="text"
                      placeholder="np. $159.99 lub 799 000 zł"
                      value={formData.price || ''}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:ring-1 focus:ring-yellow-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-space text-gray-400 uppercase tracking-widest mb-1">
                      Cena numeryczna do filtrów (zł)
                    </label>
                    <input
                      type="number"
                      placeholder="np. 159990"
                      value={formData.numericPrice || ''}
                      onChange={(e) => setFormData({ ...formData, numericPrice: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:ring-1 focus:ring-yellow-400 outline-none"
                    />
                  </div>
                </div>

                {/* Series / Year */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-space text-gray-400 uppercase tracking-widest mb-1">
                      Seria / Dopisek
                    </label>
                    <input
                      type="text"
                      placeholder="np. Elite Series"
                      value={formData.series || ''}
                      onChange={(e) => setFormData({ ...formData, series: e.target.value })}
                      className="w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:ring-1 focus:ring-yellow-400 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-space text-gray-400 uppercase tracking-widest mb-1">
                      Rocznik produkcji
                    </label>
                    <input
                      type="number"
                      placeholder="np. 2026"
                      value={formData.year || ''}
                      onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || 2026 })}
                      className="w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:ring-1 focus:ring-yellow-400 outline-none"
                    />
                  </div>
                </div>

                {/* Specs */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-space text-gray-400 uppercase tracking-wider mb-1">
                      Skrzynia
                    </label>
                    <select
                      value={formData.transmission || 'Automatyczna'}
                      onChange={(e) => setFormData({ ...formData, transmission: e.target.value as any })}
                      className="w-full bg-[#121419] border border-white/10 rounded-lg px-2 py-1.5 text-white text-[11px] outline-none"
                    >
                      <option value="Automatyczna">Automat (As)</option>
                      <option value="Manualna">Spis manualny</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-space text-gray-400 uppercase tracking-wider mb-1">
                      Paliwo
                    </label>
                    <select
                      value={formData.fuelType || 'Benzyna'}
                      onChange={(e) => setFormData({ ...formData, fuelType: e.target.value as any })}
                      className="w-full bg-[#121419] border border-white/10 rounded-lg px-2 py-1.5 text-white text-[11px] outline-none"
                    >
                      {FUEL_TYP_OPTIONS.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-space text-gray-400 uppercase tracking-wider mb-1">
                      Moc (KM)
                    </label>
                    <input
                      type="number"
                      placeholder="350"
                      value={formData.power || ''}
                      onChange={(e) => setFormData({ ...formData, power: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[#121419] border border-white/10 rounded-lg px-2 py-1.5 text-white text-[11px] outline-none"
                    />
                  </div>
                </div>

                {/* Banner / Image */}
                <div>
                  <label className="block text-[11px] font-space text-gray-400 uppercase tracking-widest mb-1">
                    Adres zdjęcia auta (URL z Unsplash itp.)
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={formData.image || ''}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    className="w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-white text-xs outline-none focus:ring-1 focus:ring-yellow-400"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          image:
                            'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&auto=format&fit=crop&q=80',
                        })
                      }
                      className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-1 border border-white/5 rounded text-gray-400 hover:text-white"
                    >
                      ⚡ Podgląd (Czarna limuzyna BMW)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          image:
                            'https://images.unsplash.com/photo-1542282088-fe8426682b8f?w=800&auto=format&fit=crop&q=80',
                        })
                      }
                      className="text-[10px] bg-white/5 hover:bg-white/10 px-2 py-1 border border-white/5 rounded text-gray-400 hover:text-white"
                    >
                      ⚡ Podgląd (Czerwone Audi A8)
                    </button>
                  </div>
                </div>

                {/* Interactive telemetry specs */}
                <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-4">
                  <h4 className="text-[11px] font-space font-semibold uppercase text-yellow-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                    Zdalne Parametry Telemetrii (Screenshot 3)
                  </h4>
                  <p className="text-[10px] text-gray-400">
                    Poniższe dane zaktualizują animowane wskaźniki i licznik prędkości po zaznaczeniu tego auta!
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1 font-mono">Stan pojazdu</label>
                      <input
                        type="text"
                        value={formData.condition || 'Smart Drive'}
                        onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                        placeholder="np. Smart Drive, Bardzo dobry"
                        className="w-full bg-[#0d0e11] border border-white/5 rounded px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1 font-mono">VIN / Rejestracja</label>
                      <input
                        type="text"
                        value={formData.vehicleId || 'AB-1234-XY'}
                        onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                        placeholder="np. PL-0941-K4"
                        className="w-full bg-[#0d0e11] border border-white/5 rounded px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1 font-mono">Lokalizacja</label>
                      <input
                        type="text"
                        value={formData.location || 'Warszawa, PL'}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        className="w-full bg-[#0d0e11] border border-white/5 rounded px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1 font-mono">Dyspozytor / Kierowca</label>
                      <input
                        type="text"
                        value={formData.driverName || 'Igor J.'}
                        onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                        className="w-full bg-[#0d0e11] border border-white/5 rounded px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1 font-mono">Przebieg (Tekst)</label>
                      <input
                        type="text"
                        value={formData.mileage || '24,580 km'}
                        onChange={(e) => setFormData({ ...formData, mileage: e.target.value })}
                        className="w-full bg-[#0d0e11] border border-white/5 rounded px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1 font-mono">Przebieg (Liczba)</label>
                      <input
                        type="number"
                        value={formData.numericMileage || 0}
                        onChange={(e) => setFormData({ ...formData, numericMileage: parseInt(e.target.value) || 0 })}
                        className="w-full bg-[#0d0e11] border border-white/5 rounded px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>
                  </div>

                  {/* Speed & Fuel sliders */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1 font-mono">
                        <span>Poziom paliwa / baterii</span>
                        <span className="text-yellow-300">{formData.fuelLevel}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={formData.fuelLevel ?? 80}
                        onChange={(e) => setFormData({ ...formData, fuelLevel: parseInt(e.target.value) })}
                        className="w-full accent-yellow-400 bg-[#0d0e11]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1 font-mono">
                        <span>Prędkość pokazowa</span>
                        <span className="text-yellow-300">{formData.speed} km/h</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="240"
                        value={formData.speed ?? 120}
                        onChange={(e) => setFormData({ ...formData, speed: parseInt(e.target.value) })}
                        className="w-full accent-yellow-400 bg-[#0d0e11]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1 font-mono">Status silnika</label>
                      <select
                        value={formData.engineStatus || 'Running'}
                        onChange={(e) => setFormData({ ...formData, engineStatus: e.target.value })}
                        className="w-full bg-[#0d0e11] border border-white/5 rounded px-2.5 py-1.5 text-white text-xs outline-none"
                      >
                        <option value="Running">Pracuje (Running)</option>
                        <option value="Standby">Gotowość (Standby)</option>
                        <option value="Off">Wyłączony (Off)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1 font-mono">Profil jazdy</label>
                      <input
                        type="text"
                        value={formData.driveMode || 'Eco Mode'}
                        onChange={(e) => setFormData({ ...formData, driveMode: e.target.value })}
                        className="w-full bg-[#0d0e11] border border-white/5 rounded px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-space text-gray-400 uppercase tracking-widest mb-1">
                    Wyczerpujący opis pojazdu
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Opisz unikalne zalety oraz historię serwisową..."
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-[#121419] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:ring-1 focus:ring-yellow-400 outline-none"
                  />
                </div>

                {/* Featured in Carousel */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="featured"
                    checked={formData.featured || false}
                    onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                    className="w-4 h-4 accent-yellow-400 rounded cursor-pointer"
                  />
                  <label htmlFor="featured" className="text-xs text-gray-300 font-space uppercase select-none cursor-pointer">
                    Promowany w karuzeli nagłówkowej (Hero Slider)
                  </label>
                </div>

                {/* Save button */}
                <button
                  type="submit"
                  className="w-full py-3 rounded-lg bg-black border border-gray-600 hover:border-white text-white hover:text-gray-300 font-space font-bold uppercase tracking-wider text-xs transition-shadow shadow-lg shadow-white/10 cursor-pointer"
                >
                  {editingCarId ? 'Zapisz zmiany w bazie' : 'Dodaj pojazd do oferty komisu'}
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
