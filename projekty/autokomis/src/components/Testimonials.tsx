import { Star, BookOpen, X } from 'lucide-react';
import React, { useState } from 'react';
import { Review, Story } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface TestimonialsProps {
  reviews: Review[];
  stories: Story[];
}

export default function Testimonials({ reviews, stories }: TestimonialsProps) {
  const [activeReviewIdx, setActiveReviewIdx] = useState(0);
  const [showAllStories, setShowAllStories] = useState(false);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);

  const nextReview = () => {
    setActiveReviewIdx((prev) => (prev + 1) % reviews.length);
  };

  const prevReview = () => {
    setActiveReviewIdx((prev) => (prev - 1 + reviews.length) % reviews.length);
  };

  const currentReview = reviews[activeReviewIdx] || reviews[0];

  // For the blog feed, we show either the 3 newest stories or all of them
  const visibleStories = showAllStories ? stories : stories.slice(0, 3);

  return (
    <section id="testimonials" className="bg-[#0c0d0f] py-24 mb-32 relative select-none z-10">
      
      {/* 1. Testimonial Block */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 mb-28">
        
        {/* Subtitle */}
        <div className="text-left mb-6">
          <span className="text-[11px] font-space text-white uppercase tracking-[0.2em] font-medium block mb-3">
            — OPINIE KLIENTÓW —
          </span>
        </div>

        {/* Dynamic Card with background luxury car representation */}
        {/* Fixed layouts & min-height independent of quote length */}
        <div className="relative rounded-2xl overflow-hidden border border-white/5 shadow-2xl bg-neutral-950 p-6 md:p-12 h-[450px] sm:h-[400px] flex items-center justify-center">
          
          {/* Ambient Background image with strong dark cover */}
          <div className="absolute inset-0 z-0">
            <img 
              src={currentReview.bgImage} 
              alt="Luxury car testimonial background" 
              className="w-full h-full object-cover opacity-35"
              referrerPolicy="no-referrer"
            />
            {/* Smooth Radial Dark mask */}
            <div className="absolute inset-0 bg-radial-at-c from-transparent via-[#0c0d0f]/75 to-[#0c0d0f] z-1" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40 z-1" />
          </div>

          {/* Review Content inside Arc overlay */}
          <div className="relative z-10 w-full max-w-2xl text-center flex flex-col justify-between h-full py-2">
            
            {/* User Details */}
            <div className="inline-flex flex-col items-center">
              {/* User Avatar */}
              <div className="relative w-14 h-14 rounded-full border-2 border-white/30 overflow-hidden mb-2">
                <img 
                  src={currentReview.avatar} 
                  alt={currentReview.author} 
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Author Names & Role */}
              <h4 className="text-sm font-bold text-white tracking-wide font-space leading-tight uppercase">
                {currentReview.author}
              </h4>
              <p className="text-[10px] text-white font-mono uppercase tracking-[0.2em] mt-0.5">
                {currentReview.role}
              </p>
            </div>

            {/* Stars rating [e.g. 4.7/5.0] */}
            <div className="flex items-center justify-center gap-1 my-1">
              {[...Array(5)].map((_, i) => (
                <Star 
                  key={i} 
                  className={`w-3.5 h-3.5 ${
                    i < currentReview.rating ? 'fill-white text-white' : 'text-gray-500'
                  }`} 
                />
              ))}
              <span className="text-[9px] text-gray-400 font-mono ml-1">
                [{currentReview.rating === 5 ? '4.8' : '4.7'}/5.0]
              </span>
            </div>

            {/* Quote block text styled beautifully with LOCKED HEIGHT for layout uniformity */}
            <div className="h-[96px] flex items-center justify-center overflow-hidden">
              <blockquote className="text-gray-200 text-xs sm:text-sm font-light font-sans tracking-wide leading-relaxed italic max-w-xl mx-auto overflow-y-auto max-h-[96px] px-4 py-1">
                "{currentReview.content}"
              </blockquote>
            </div>

            {/* Slide buttons */}
            {reviews.length > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button 
                  onClick={prevReview}
                  className="p-1 px-3 border border-white/10 rounded-full bg-black/40 text-gray-400 hover:text-white hover:border-white/30 transition-all cursor-pointer text-xs"
                >
                  ←
                </button>
                <span className="text-[10px] text-gray-500 font-mono">{activeReviewIdx + 1} / {reviews.length}</span>
                <button 
                  onClick={nextReview}
                  className="p-1 px-3 border border-white/10 rounded-full bg-black/40 text-gray-400 hover:text-white hover:border-white/30 transition-all cursor-pointer text-xs"
                >
                  →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Our Stories ("Nasze historie") Blog Section */}
      <div id="blog-stories" className="max-w-7xl mx-auto px-6 md:px-12">
        
        {/* Section title & Carets Row - Replaced OUR SERVICES with BLOG */}
        <div className="flex items-end justify-between border-b border-white/5 pb-6 mb-8">
          <div className="space-y-2">
            <span className="text-[11px] font-space text-white uppercase tracking-[0.2em] font-medium block">
              — BLOG —
            </span>
            <h3 className="text-2xl md:text-3xl font-bold font-space text-white tracking-wide uppercase">
              NASZE HISTORIE
            </h3>
          </div>

          {/* Więcej button */}
          <div className="flex items-center">
            <button
              onClick={() => {
                setShowAllStories(!showAllStories);
                if (showAllStories) {
                  document.getElementById('blog-stories')?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="group flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest font-space border border-white/30 bg-white/5 hover:border-white text-gray-300 hover:text-white rounded-sm cursor-pointer transition-all"
            >
              <span>{showAllStories ? 'POKAŻ MNIEJ' : 'WIĘCEJ'}</span>
              <svg className="w-4 h-4 text-white/70 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
            </button>
          </div>
        </div>

        {/* Responsive Cards Grid */}
        <div className="overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleStories.map((st) => (
              <article
                key={st.id}
                onClick={() => setSelectedStory(st)}
                className="group relative rounded-xl h-60 overflow-hidden border border-white/5 cursor-pointer bg-neutral-900"
              >
                {/* Visual Image */}
                <img 
                  src={st.image} 
                  alt={st.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />

                {/* Cover vignette gradients */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-1" />
                <div className="absolute inset-0 bg-[#0d0e11]/20 group-hover:bg-transparent transition-colors z-1" />

                {/* Card textual content */}
                <div className="absolute bottom-5 left-5 right-5 z-10 space-y-2">
                  <h4 className="text-sm md:text-base font-semibold font-space text-white tracking-wide group-hover:text-white transition-colors leading-tight uppercase">
                    {st.title}
                  </h4>
                  <p className="text-[10px] text-gray-400 tracking-wide font-sans line-clamp-1">
                    {st.subtitle}
                  </p>
                </div>

                {/* Top decorative Book icon */}
                <div className="absolute top-4 left-4 z-10 p-1.5 rounded bg-black/50 border border-white/10 text-white">
                  <BookOpen className="w-3.5 h-3.5" />
                </div>
              </article>
            ))}
          </div>
        </div>


      </div>

      {/* Blog Article Reader Modal */}
      <AnimatePresence>
        {selectedStory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStory(null)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 cursor-pointer"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed inset-4 max-w-2xl mx-auto top-12 bottom-12 bg-[#0e1013] border border-white/10 p-6 md:p-8 rounded-2xl z-50 flex flex-col justify-between overflow-y-auto pointer-events-auto"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                <div>
                  <span className="text-[9px] font-mono text-white uppercase tracking-widest">ARTYKUŁ • CZYTELNIA</span>
                  <h3 className="text-base font-bold font-space text-white uppercase tracking-wider block mt-1">
                    {selectedStory.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedStory(null)}
                  className="p-1.5 border border-white/10 rounded-full text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 space-y-6">
                <div className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/5">
                  <img src={selectedStory.image} alt={selectedStory.title} className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-bold text-white font-space uppercase">
                  {selectedStory.subtitle}
                </p>
                <div className="text-gray-300 text-xs sm:text-sm leading-relaxed font-light space-y-4 font-sans">
                  <p>
                    W obecnych czasach wybór odpowiedniego pojazdu to nie tylko kwestia parametrów technicznych, ale przede wszystkim dopasowanie do własnego stylu życia i wyrobionych przyzwyczajeń. Klasyczna jakość wykończenia, solidność podzespołów oraz nienaganna historia serwisowa stanowią filary bezpiecznego wyboru na rynku aut używanych.
                  </p>
                  <p>
                    W AUTO-KOMISIE stawiamy na pełną transparentność i sprawdzoną jakość. Każdy pojazd trafiający do naszej oferty zostaje rygorystycznie przetestowany pod wieloma kątami. Dbamy o to, aby nasi klienci wyjeżdżali z salonu z poczuciem najwyższego komfortu, pewni swojego technicznego bezpieczeństwa w każdej dalekiej podróży.
                  </p>
                </div>
              </div>

              <div className="border-t border-white/5 pt-4 mt-8 flex justify-end">
                <button
                  onClick={() => setSelectedStory(null)}
                  className="px-5 py-2.5 bg-neutral-900 border border-white/10 hover:border-white/20 text-xs uppercase tracking-widest font-space text-white font-bold rounded cursor-pointer transition-all"
                >
                  Zamknij czytnik
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </section>
  );
}
