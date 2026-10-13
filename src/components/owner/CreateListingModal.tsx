import React, { useId, useRef, useState } from 'react';
import { X, Sparkles, Check } from 'lucide-react';
import { Property, Currency } from '../../types';
import { CATEGORIES } from '../../data/mockProperties';
import { useDialogFocus } from '../useDialogFocus';

interface CreateListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProperty: (property: Property) => void;
  currency: Currency;
}

const PRESET_PHOTOS = [
  { label: 'Casa de Praia Moderna', url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Cabana Rústica Alpina', url: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Cobertura Duplex Urbana', url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Refúgio na Mata', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Bangalô com Piscina', url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80' },
];

export const CreateListingModal: React.FC<CreateListingModalProps> = ({
  isOpen,
  onClose,
  onAddProperty,
  currency,
}) => {
  const fieldId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, { initialFocusRef: titleRef });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('waterpark');
  const [city, setCity] = useState('Caldas Novas');
  const [state, setState] = useState('Goiás');
  const [pricePerNight, setPricePerNight] = useState(380);
  const [cleaningFee, setCleaningFee] = useState(90);
  const [bedrooms, setBedrooms] = useState(1);
  const [beds, setBeds] = useState(2);
  const [bathrooms, setBathrooms] = useState(1);
  const [maxGuests, setMaxGuests] = useState(4);
  const [selectedPhoto, setSelectedPhoto] = useState(PRESET_PHOTOS[0].url);
  const [customPhotoUrl, setCustomPhotoUrl] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const mainPhoto = customPhotoUrl.trim() || selectedPhoto;
    const additionalPhotos = [
      mainPhoto,
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80',
    ];

    const newProp: Property = {
      id: `stays-user-${Date.now()}`,
      staysListingId: `STAYS-USER-${Date.now()}`,
      staysSynced: true,
      title,
      subtitle: `Resort / Flat termal em ${city}, ${state}`,
      description: description || 'Acomodação cadastrada na Central de Reservas Caldas Novas com piscinas quentes termais e infraestrutura completa de lazer.',
      category,
      propertyType: 'entire_place',
      location: {
        city,
        state,
        country: 'Brasil',
        neighborhood: 'Bairro do Turista / Caldas Novas',
        address: 'Avenida das Águas Quentes, 500',
        lat: -17.7400,
        lng: -48.6250,
      },
      pricePerNight: Number(pricePerNight),
      cleaningFee: Number(cleaningFee),
      serviceFeeRate: 0.10,
      rating: 5.0,
      reviewCount: 1,
      isSuperhost: true,
      isGuestFavorite: true,
      instantBook: true,
      images: additionalPhotos,
      bedrooms: Number(bedrooms),
      beds: Number(beds),
      bathrooms: Number(bathrooms),
      maxGuests: Number(maxGuests),
      amenities: [
        'Piscinas termais naturais 24h',
        'Ar-condicionado',
        'Acesso a parque aquático',
        'Wi-Fi rápido',
        'Estacionamento privativo',
        'Copa com micro-ondas e frigobar',
      ],
      highlights: [
        {
          icon: 'Sparkles',
          title: 'Novo Imóvel na Central CRCN',
          description: 'Imóvel auditado pela equipe Central de Reservas Caldas Novas.',
        },
      ],
      sleepingArrangements: [
        { roomName: 'Quarto Principal', bedType: '1 cama queen', icon: 'BedDouble' },
        { roomName: 'Sala de Estar', bedType: '1 sofá-cama casal', icon: 'Bed' },
      ],
      rules: [
        'Check-in a partir das 14:00',
        'Check-out até 11:00',
        'Uso de pulseira do condomínio',
      ],
      host: {
        name: 'Proprietário Parceiro CRCN',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        joinedYear: 2026,
        isSuperhost: true,
        responseTime: 'menos de 5 minutos',
        responseRate: '100%',
        bio: 'Proprietário parceiro da Central de Reservas Caldas Novas.',
      },
      reviews: [
        {
          id: `rev-init-${Date.now()}`,
          authorName: 'Hóspede Família',
          authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
          rating: 5,
          date: 'Recente',
          comment: 'Flat impecável e muito confortável! As piscinas quentinhas agradaram toda a família.',
          categories: { cleanliness: 5, accuracy: 5, communication: 5, location: 5, checkIn: 5, value: 5 },
        },
      ],
    };

    onAddProperty(newProp);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="min-h-screen py-8 px-3 sm:px-6 flex justify-center items-start"
      >
        <div ref={dialogRef} data-dialog-focus-root role="dialog" aria-modal="true" aria-labelledby={`${fieldId}-title`} tabIndex={-1} className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-neutral-100 animate-in zoom-in-95 duration-200">
          
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" />
              <h2 id={`${fieldId}-title`} className="text-base font-bold text-neutral-900">Anunciar Nova Acomodação</h2>
            </div>
            <button
              type="button"
              aria-label="Fechar formulário de anúncio"
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
            
            {/* Title */}
            <div>
              <label htmlFor={`${fieldId}-listing-title`} className="block text-xs font-bold text-neutral-900 mb-1">
                Título atrativo do anúncio *
              </label>
              <input
                ref={titleRef}
                id={`${fieldId}-listing-title`}
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Chalé na Montanha com Lareira e Vista Panorâmica"
                className="w-full p-3 rounded-xl border border-neutral-300 focus:border-neutral-900 outline-none text-xs sm:text-sm font-semibold"
              />
            </div>

            {/* Category & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor={`${fieldId}-category`} className="block text-xs font-bold text-neutral-900 mb-1">Categoria</label>
                <select
                  id={`${fieldId}-category`}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 outline-none text-xs"
                >
                  {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${fieldId}-city`} className="block text-xs font-bold text-neutral-900 mb-1">Cidade</label>
                <input
                  id={`${fieldId}-city`}
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 outline-none text-xs"
                />
              </div>

              <div>
                <label htmlFor={`${fieldId}-state`} className="block text-xs font-bold text-neutral-900 mb-1">Estado</label>
                <input
                  id={`${fieldId}-state`}
                  type="text"
                  required
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 outline-none text-xs"
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${fieldId}-nightly-price`} className="block text-xs font-bold text-neutral-900 mb-1">
                  Preço por noite ({currency})
                </label>
                <input
                  id={`${fieldId}-nightly-price`}
                  type="number"
                  min="50"
                  max="50000"
                  required
                  value={pricePerNight}
                  onChange={(e) => setPricePerNight(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 outline-none text-xs font-bold"
                />
              </div>

              <div>
                <label htmlFor={`${fieldId}-cleaning-fee`} className="block text-xs font-bold text-neutral-900 mb-1">
                  Taxa de limpeza ({currency})
                </label>
                <input
                  id={`${fieldId}-cleaning-fee`}
                  type="number"
                  min="0"
                  value={cleaningFee}
                  onChange={(e) => setCleaningFee(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 outline-none text-xs font-bold"
                />
              </div>
            </div>

            {/* Capacity Specs */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 border border-neutral-200 rounded-xl">
                <label htmlFor={`${fieldId}-bedrooms`} className="text-[10px] text-neutral-600 uppercase font-bold block">Quartos</label>
                <input
                  id={`${fieldId}-bedrooms`}
                  type="number"
                  min="1"
                  max="20"
                  value={bedrooms}
                  onChange={(e) => setBedrooms(Number(e.target.value))}
                  className="w-full text-center font-bold outline-none"
                />
              </div>

              <div className="p-2 border border-neutral-200 rounded-xl">
                <label htmlFor={`${fieldId}-beds`} className="text-[10px] text-neutral-600 uppercase font-bold block">Camas</label>
                <input
                  id={`${fieldId}-beds`}
                  type="number"
                  min="1"
                  max="30"
                  value={beds}
                  onChange={(e) => setBeds(Number(e.target.value))}
                  className="w-full text-center font-bold outline-none"
                />
              </div>

              <div className="p-2 border border-neutral-200 rounded-xl">
                <label htmlFor={`${fieldId}-bathrooms`} className="text-[10px] text-neutral-600 uppercase font-bold block">Banhos</label>
                <input
                  id={`${fieldId}-bathrooms`}
                  type="number"
                  min="1"
                  max="20"
                  value={bathrooms}
                  onChange={(e) => setBathrooms(Number(e.target.value))}
                  className="w-full text-center font-bold outline-none"
                />
              </div>

              <div className="p-2 border border-neutral-200 rounded-xl">
                <label htmlFor={`${fieldId}-max-guests`} className="text-[10px] text-neutral-600 uppercase font-bold block">Hóspedes</label>
                <input
                  id={`${fieldId}-max-guests`}
                  type="number"
                  min="1"
                  max="30"
                  value={maxGuests}
                  onChange={(e) => setMaxGuests(Number(e.target.value))}
                  className="w-full text-center font-bold outline-none"
                />
              </div>
            </div>

            {/* Photos selection */}
            <div>
              <p id={`${fieldId}-photo-label`} className="block text-xs font-bold text-neutral-900 mb-2">
                Foto principal da acomodação
              </p>
              <div role="group" aria-labelledby={`${fieldId}-photo-label`} className="grid grid-cols-5 gap-2 mb-3">
                {PRESET_PHOTOS.map((preset) => (
                  <button
                    key={preset.url}
                    type="button"
                    aria-label={`Selecionar foto: ${preset.label}`}
                    aria-pressed={selectedPhoto === preset.url && !customPhotoUrl}
                    onClick={() => {
                      setSelectedPhoto(preset.url);
                      setCustomPhotoUrl('');
                    }}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      selectedPhoto === preset.url && !customPhotoUrl
                        ? 'border-orange-500 scale-105 shadow-md'
                        : 'border-transparent opacity-75 hover:opacity-100'
                    }`}
                  >
                    <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                    {selectedPhoto === preset.url && !customPhotoUrl && (
                      <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white stroke-[3]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <input
                id={`${fieldId}-custom-photo-url`}
                aria-label="URL da foto principal personalizada"
                type="url"
                value={customPhotoUrl}
                onChange={(e) => setCustomPhotoUrl(e.target.value)}
                placeholder="Ou cole a URL de uma imagem direta (opcional)..."
                className="w-full p-2.5 rounded-xl border border-neutral-300 text-xs outline-none"
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor={`${fieldId}-description`} className="block text-xs font-bold text-neutral-900 mb-1">
                Descrição do espaço
              </label>
              <textarea
                id={`${fieldId}-description`}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva a experiência, vista, comodidades exclusivas e detalhes especiais..."
                className="w-full p-2.5 rounded-xl border border-neutral-300 text-xs focus:border-neutral-900 outline-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-full border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs shadow-md shadow-orange-500/25 transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                Publicar Anúncio
              </button>
            </div>

          </form>

        </div>
      </div>
    </div>
  );
};
