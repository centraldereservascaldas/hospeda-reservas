import { Property } from '../types';
import { STAYS_NET_APARTMENTS } from './staysApartments';

export const CATEGORIES = [
  { id: 'all', label: 'Todos os espaços', icon: 'Sparkles' },
  { id: 'waterpark', label: 'Parques Aquáticos Inclusos', icon: 'Waves' },
  { id: 'thermal_24h', label: 'Piscinas Termais 24h', icon: 'Droplets' },
  { id: 'diroma', label: 'Complexo diRoma', icon: 'Crown' },
  { id: 'rio_quente', label: 'Rio Quente & Hot Park', icon: 'Palmtree' },
  { id: 'corumba_lake', label: 'À beira do Lago Corumbá', icon: 'Fish' },
  { id: 'resorts_flats', label: 'Resorts & Flats', icon: 'Home' },
  { id: 'chalets', label: 'Chalés & Casas', icon: 'Trees' },
  { id: 'spa_luxury', label: 'Spa & Relaxamento', icon: 'Mountain' },
];

// Authoritative accommodation catalogue (no mockups)
export const INITIAL_PROPERTIES: Property[] = STAYS_NET_APARTMENTS;

export const INITIAL_RESERVATIONS = [
  {
    id: 'res-101',
    code: 'CRCN-8924',
    propertyId: 'JQ08G',
    propertyTitle: 'Lacqua DiRoma IV',
    propertyLocation: 'Jardim Belvedere, Caldas Novas - GO',
    propertyImage: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
    checkIn: '2026-10-10',
    checkOut: '2026-10-13',
    nights: 3,
    guests: { adults: 4, children: 0, infants: 0, pets: 0 },
    pricePerNight: 350,
    cleaningFee: 150,
    serviceFee: 0,
    discount: 0,
    totalAmount: 1200,
    paymentMethod: 'pix' as const,
    status: 'confirmed' as const,
    createdAt: '2026-09-25',
    hostName: 'Central de Reservas Caldas Novas',
    guestName: 'Hóspede Caldas Novas',
    guestEmail: 'centraldereservascn@gmail.com',
    guestPhone: '(64) 99300-0000',
    staysReservationId: 'STAYS-CN-8924',
    staysLocator: 'JQ08G-OCT26',
    staysSyncStatus: 'synced' as const,
  },
];
