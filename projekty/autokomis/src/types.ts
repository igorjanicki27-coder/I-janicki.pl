export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  price: string; // Keep as string to support both "$199.99" and "199 900 zł" styled inputs
  numericPrice: number; // For clean filtering
  year: number;
  series: string; // e.g., "2026 Series", "Elite Series", "Prestige Series", "Future Series"
  image: string;
  description: string;
  
  // Interactive Live Telemetry parameters (from Screenshot 3)
  condition: string;     // e.g. "Smart Drive", "Excellent", "Nowy"
  vehicleId: string;     // e.g. "AB-1234-XY"
  location: string;      // e.g. "Khulna, BD", "Warszawa, PL", "Poznań, PL"
  driverName: string;    // e.g. "Nazmul H.", "Igor J."
  fuelLevel: number;     // percentage e.g. 72
  engineStatus: string;  // e.g. "Running", "Idle", "Stopped"
  mileage: string;       // e.g. "24,580 km", "12,400 km"
  numericMileage: number; // For clean filtering
  driveMode: string;     // e.g. "Eco Mode", "Sport Mode", "Comfort"
  speed: number;         // e.g. 55 (shown in KM/H speedometer)
  
  // Extra technical details for modal display
  fuelType: 'Benzyna' | 'Diesel' | 'Napęd Elektryczny' | 'Hybryda';
  transmission: 'Automatyczna' | 'Manualna';
  power: number;         // HP (Konie Mechaniczne)
  engineDisplacement: string; // e.g. "3000 cm³", "Elektryczny"
  featured?: boolean;
  heroImage?: string; // Osobne zdjęcie tła dla strony głównej (hero), niezależne od zdjęcia w ogłoszeniach
}

export interface Review {
  id: string;
  author: string;
  role: string;
  content: string;
  rating: number;
  avatar: string;
  bgImage: string;
}

export interface Story {
  id: string;
  title: string;
  subtitle: string;
  image: string;
}

export interface FilterState {
  search: string;
  brand: string;
  series: string;
  maxPrice: number;
  fuelType: string;
  transmission: string;
}

export const INITIAL_VEHICLES: Vehicle[] = [
  {
    id: 'car-1',
    brand: 'Mercedes-Benz',
    model: 'S-Class Saloon',
    price: '195 000 zł',
    numericPrice: 195000,
    year: 2026,
    series: '2026 Series',
    image: '/images/samochod-1.png',
    heroImage: 'https://images.unsplash.com/photo-1603584173870-7f23fd4a2c24?w=1600&auto=format&fit=crop&q=80',
    description: 'Ekskluzywna limuzyna o sportowym designie i bezkompromisowym luksusie. Wyposażona w najbardziej zaawansowane pakiety asystentów jazdy oraz inteligentny napęd.',
    condition: 'Smart Drive',
    vehicleId: 'MB-2026-SL',
    location: 'Warszawa, PL',
    driverName: 'Igor J.',
    fuelLevel: 85,
    engineStatus: 'Running',
    mileage: '4,200 km',
    numericMileage: 4200,
    driveMode: 'Comfort+',
    speed: 75,
    fuelType: 'Hybryda',
    transmission: 'Automatyczna',
    power: 435,
    engineDisplacement: '3000 cm³',
    featured: true
  },
  {
    id: 'car-2',
    brand: 'Mercedes-Maybach',
    model: 'Maybach S-Class',
    price: '249 999 zł',
    numericPrice: 249999,
    year: 2026,
    series: 'Future Series',
    image: '/images/samochod-2.png',
    heroImage: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=1600&auto=format&fit=crop&q=80',
    description: 'Definicja najwyższego poziomu luksusu. Przedłużany rozstaw osi, fotele z funkcją masażu gorącymi kamieniami, lodówka na szampana oraz system nagłośnienia Burmester 4D.',
    condition: 'Idealny',
    vehicleId: 'AB-1234-XY',
    location: 'Khulna, BD',
    driverName: 'Nazmul H.',
    fuelLevel: 72,
    engineStatus: 'Running',
    mileage: '24,580 km',
    numericMileage: 24580,
    driveMode: 'Eco Mode',
    speed: 55,
    fuelType: 'Benzyna',
    transmission: 'Automatyczna',
    power: 503,
    engineDisplacement: '4000 cm³',
    featured: true
  },
  {
    id: 'car-3',
    brand: 'Mercedes-Benz',
    model: 'AMG GT Coupe',
    price: '200 999 zł',
    numericPrice: 200999,
    year: 2025,
    series: 'Elite Series',
    image: '/images/samochod-3.png',
    heroImage: 'https://images.unsplash.com/photo-1614200187524-dc4b892acf16?w=1600&auto=format&fit=crop&q=80',
    description: 'Ekstremalnie dynamiczne sportowe coupe lakierowane w kultowej neonowej zieleni. Posiada karbonowo-ceramiczne hamulce, regulowany spoiler i aktywny wydech AMG.',
    condition: 'Torowy',
    vehicleId: 'GT-580-AMG',
    location: 'Poznań, PL',
    driverName: 'Kamil K.',
    fuelLevel: 45,
    engineStatus: 'Standby',
    mileage: '1,890 km',
    numericMileage: 1890,
    driveMode: 'Sport Class',
    speed: 120,
    fuelType: 'Benzyna',
    transmission: 'Automatyczna',
    power: 585,
    engineDisplacement: '4000 cm³',
    featured: true
  }
];

/** Zdjęcia placu komisu samochodowego wyświetlane w tle hero na stronie głównej */
export const HERO_LOT_IMAGES = [
  '/images/komis-samochodowy-1.webp',
  '/images/komis-samochodowy-2.webp',
  '/images/komis-samochodowy-3.webp',
  '/images/komis-samochodowy-4.webp',
  '/images/komis-samochodowy-5.webp',
];

export const INITIAL_REVIEWS: Review[] = [
  {
    id: 'ref-1',
    author: 'Pan A.K.',
    role: 'Klient indywidualny',
    content: 'Od momentu wejścia na plac poczułem, że trafiłem we właściwe miejsce. Doradca pomógł mi dobrać auto idealnie pod moje potrzeby, bez żadnego ciśnienia. Sfinalizowałem zakup w godzinę – auto było gotowe do drogi, umyte, zatankowane. Profesjonalna obsługa i pełna transparentność. Polecam każdemu, kto szuka uczciwego komisu samochodowego.',
    rating: 5,
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=AK&backgroundColor=444444&textColor=ffffff&fontSize=50',
    bgImage: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1200&auto=format&fit=crop&q=80'
  },
  {
    id: 'ref-2',
    author: 'Pan K.S.',
    role: 'Klient biznesowy',
    content: 'Sprzedawałem u nich swoje poprzednie auto i od razu kupiłem nowszy model. Proces wymiany był niesamowicie sprawny – wycena w 15 minut, cała papierkowa robota załatwiona na miejscu. Bez ukrytych kosztów, bez zbędnych formalności. Autokomis godny polecenia – uczciwość na pierwszym miejscu.',
    rating: 5,
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=KS&backgroundColor=555555&textColor=ffffff&fontSize=50',
    bgImage: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&auto=format&fit=crop&q=80'
  },
  {
    id: 'ref-3',
    author: 'Pani M.W.',
    role: 'Klientka detaliczna',
    content: 'Szukałam pierwszego auta dla syna. Panowie z komisu poświęcili nam mnóstwo czasu, pokazali kilka modeli, doradzili, który będzie najlepszy dla młodego kierowcy. Samochód był już po pełnym serwisie, z gwarancją. Czuje się, że zależy im na kliencie, a nie tylko na szybkiej sprzedaży.',
    rating: 5,
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=MW&backgroundColor=666666&textColor=ffffff&fontSize=50',
    bgImage: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=1200&auto=format&fit=crop&q=80'
  }
];

export const INITIAL_STORIES: Story[] = [
  {
    id: 'story-1',
    title: 'Wybierz Odpowiednie Auto Na Swoją Podróż',
    subtitle: 'Znajdź idealny pojazd dopasowany do charakteru Twojej trasy i oczekiwań komfortu.',
    image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'story-2',
    title: 'Wybór Idealnego Klasyka Na Weekend',
    subtitle: 'Odkryj emocje, jakie niosą klasyczne auta sportowe wolne od nadmiernej elektroniki.',
    image: 'https://images.unsplash.com/photo-1542362567-b07e54358753?w=600&auto=format&fit=crop&q=80'
  },
  {
    id: 'story-3',
    title: 'Autonomia a Przyjemność z Jazdy',
    subtitle: 'Czy asystenci jazdy zabierają pasję, czy dają nową wolność za kółkiem?',
    image: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&auto=format&fit=crop&q=80'
  }
];