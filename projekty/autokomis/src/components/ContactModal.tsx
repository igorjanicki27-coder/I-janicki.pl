import React, { useState, FormEvent } from 'react';
import { Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCarName?: string;
}

export default function ContactModal({ isOpen, onClose, initialCarName = '' }: ContactModalProps) {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', carName: initialCarName, message: '' });
  const [success, setSuccess] = useState(false);

  // Auto-fill car name if provided
  React.useEffect(() => {
    if (initialCarName) {
      setFormData((prev) => ({ ...prev, carName: initialCarName }));
    }
  }, [initialCarName]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSuccess(true);
    setFormData({ name: '', email: '', phone: '', carName: '', message: '' });
    setTimeout(() => {
      setSuccess(false);
      onClose();
    }, 3800);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 pointer-events-auto cursor-pointer"
          />

          {/* Form Content container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="fixed inset-4 max-w-lg mx-auto top-12 bottom-12 bg-[#0e1013] border border-white/10 p-6 md:p-8 rounded-2xl z-50 flex flex-col justify-between pointer-events-auto overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-bold font-space text-white uppercase tracking-wider">
                  Napisz do nas
                </h3>
                <p className="text-xs text-yellow-400 font-mono">Formularz kontaktowy AUTO-KOMIS</p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 border border-white/10 rounded-full text-gray-400 hover:text-white cursor-pointer transition-all focus:outline-none focus-visible:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content box */}
            {success ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-8">
                <div className="w-16 h-16 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 flex items-center justify-center animate-bounce">
                  <Send className="w-6 h-6" />
                </div>
                <h4 className="text-md font-bold text-white font-space uppercase">Wiadomość została wysłana!</h4>
                <p className="text-xs text-gray-400 max-w-sm leading-relaxed">
                  Dziękujemy za kontakt. Nasz doradca motoryzacyjny skontaktuje się z Tobą telefonicznie w ciągu najbliższych 15 minut!
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex-1 space-y-4 py-4">
                <div>
                  <label className="block text-[10px] text-gray-450 uppercase tracking-widest mb-1.5 font-mono">
                    Imię i nazwisko *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="np. Igor Janicki"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-[#121419] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-gray-450 uppercase tracking-widest mb-1.5 font-mono">
                      Adres E-mail *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="np. igor@janicki.pl"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-[#121419] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-450 uppercase tracking-widest mb-1.5 font-mono">
                      Telefon kontaktowy *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="np. +48 600 500 400"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-[#121419] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-gray-450 uppercase tracking-widest mb-1.5 font-mono">
                    Pojazd, który Cię interesuje
                  </label>
                  <input
                    type="text"
                    placeholder="np. Porsche 911 Turbo S"
                    value={formData.carName}
                    onChange={(e) => setFormData({ ...formData, carName: e.target.value })}
                    className="w-full bg-[#121419] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-gray-450 uppercase tracking-widest mb-1.5 font-mono">
                    Treść zapytania / Uwagi
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Chciałbym poznać szczegóły oferty finansowania..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full bg-[#121419] border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400 transition-colors resize-none"
                  />
                </div>

                <div className="p-3.5 bg-yellow-400/5 border border-yellow-400/10 rounded-lg text-[9px] text-gray-400 space-y-1 font-mono">
                  <p className="font-semibold text-white">
                    📞 INFOLINIA SALONU: +48 22 555 auto (2886)
                  </p>
                  <p>Otwarte: Pon - Pt: 9:00 - 19:00, Sob: 10:00 - 15:00. Salon: ul. Prestiżowa 1, Warszawa.</p>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-black border border-gray-600 hover:border-white text-white hover:text-gray-300 font-space font-bold uppercase tracking-widest text-xs transition-colors rounded cursor-pointer focus:outline-none focus-visible:outline-none"
                >
                  WYŚLIJ ZAPYTANIE ↗
                </button>
              </form>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
