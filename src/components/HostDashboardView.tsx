import React, { useState } from 'react';
import { Property, Reservation, Currency } from '../types';
import { formatCurrency } from '../utils/formatters';
import { 
  Sparkles, 
  PlusCircle, 
  DollarSign, 
  Calendar, 
  Star, 
  TrendingUp, 
  Eye, 
  CheckCircle2, 
  Clock, 
  Home,
  Users,
  Zap,
  RefreshCw,
  Sliders
} from 'lucide-react';

interface HostDashboardViewProps {
  properties: Property[];
  reservations: Reservation[];
  currency: Currency;
  onOpenCreateListing: () => void;
  onSelectProperty: (property: Property) => void;
}

export const HostDashboardView: React.FC<HostDashboardViewProps> = ({
  properties,
  reservations,
  currency,
  onOpenCreateListing,
  onSelectProperty,
}) => {
  const totalEarnings = reservations.reduce((acc, r) => acc + (r.status === 'confirmed' ? r.totalAmount * 0.88 : 0), 14820);
  const activeBookingsCount = reservations.filter((r) => r.status === 'confirmed').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 min-h-[75vh] space-y-10">
      
      {/* Host Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-neutral-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-600 text-xs font-bold border border-orange-200/60">
              Painel do Anfitrião
            </span>
            <span className="text-xs text-neutral-400 font-semibold">• Superhost Platinum</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight mt-1">
            Gestão de Imóveis & Reservas
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Monitore seus ganhos, check-ins de hóspedes e gerencie a visibilidade dos seus anúncios.
          </p>
        </div>

        <button
          onClick={onOpenCreateListing}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold shadow-md shadow-orange-500/25 transition-all cursor-pointer hover:scale-105 active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Cadastrar Nova Acomodação</span>
        </button>
      </div>

      {/* KPI Metrics in Liquid Glass */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl border border-white/80 bg-white/70 backdrop-blur-2xl shadow-[0_10px_30px_-8px_rgba(0,0,0,0.06)] space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold text-neutral-600">Ganhos no mês</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-neutral-900">
            {formatCurrency(totalEarnings, currency)}
          </p>
          <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            +18% em relação ao mês anterior
          </p>
        </div>

        <div className="p-5 rounded-3xl border border-white/80 bg-white/70 backdrop-blur-2xl shadow-[0_10px_30px_-8px_rgba(0,0,0,0.06)] space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold text-neutral-600">Reservas confirmadas</span>
            <div className="w-8 h-8 rounded-xl bg-orange-500/15 text-orange-600 flex items-center justify-center border border-orange-500/20">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-neutral-900">
            {activeBookingsCount + 8}
          </p>
          <p className="text-[11px] text-neutral-500">
            Taxa de ocupação estimada: 84%
          </p>
        </div>

        <div className="p-5 rounded-3xl border border-white/80 bg-white/70 backdrop-blur-2xl shadow-[0_10px_30px_-8px_rgba(0,0,0,0.06)] space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold text-neutral-600">Avaliação geral</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center border border-amber-500/20">
              <Star className="w-4 h-4 fill-amber-500" />
            </div>
          </div>
          <p className="text-2xl font-black text-neutral-900">
            4.97 ★
          </p>
          <p className="text-[11px] text-neutral-500">
            Baseado em 340+ avaliações de hóspedes
          </p>
        </div>

        <div className="p-5 rounded-3xl border border-white/80 bg-white/70 backdrop-blur-2xl shadow-[0_10px_30px_-8px_rgba(0,0,0,0.06)] space-y-2">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold text-neutral-600">Tempo de resposta</span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-600 flex items-center justify-center border border-sky-500/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-neutral-900">
            15 min
          </p>
          <p className="text-[11px] text-sky-600 font-bold">
            100% de taxa de resposta aos hóspedes
          </p>
        </div>
      </div>

      {/* Availability and reservation management status */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-white/70 border border-orange-200/80 backdrop-blur-2xl shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/25 flex-shrink-0">
            <Zap className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-neutral-900">
                Gestão de acomodações e reservas
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sincronização Ativa
              </span>
            </div>
            <p className="text-xs text-neutral-600 max-w-2xl leading-relaxed">
              As acomodações, tarifas, calendários e reservas são atualizados automaticamente.
            </p>
            <div className="flex items-center gap-3 text-[11px] text-neutral-500 pt-1">
              <span>Acomodações conectadas: <strong className="text-neutral-800">{properties.length}</strong></span>
              <span>•</span>
            </div>
          </div>
        </div>

      </div>

      {/* Your Listings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <Home className="w-5 h-5 text-neutral-700" />
            <span>Seus Espaços Cadastrados ({properties.length})</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.slice(0, 6).map((prop) => (
            <div
              key={prop.id}
              className="group bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={prop.images[0]}
                    alt={prop.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-bold text-neutral-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Ativo para reservas
                  </div>
                </div>

                <div className="p-4 space-y-1">
                  <p className="text-[11px] text-neutral-400 font-semibold uppercase">{prop.location.city}, {prop.location.state}</p>
                  <h3 className="font-bold text-sm text-neutral-900 line-clamp-1">{prop.title}</h3>
                  <div className="flex items-center justify-between pt-2 text-xs">
                    <span className="font-bold text-neutral-900">
                      {formatCurrency(prop.pricePerNight, currency)} <span className="font-normal text-neutral-500">/ noite</span>
                    </span>
                    <span className="text-neutral-500">★ {prop.rating.toFixed(2)} ({prop.reviewCount})</span>
                  </div>
                </div>
              </div>

              <div className="p-4 pt-0">
                <button
                  onClick={() => onSelectProperty(prop)}
                  className="w-full py-2 rounded-xl border border-neutral-200 hover:border-neutral-900 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Visualizar página do anúncio</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Reservations Received */}
      <div className="pt-6 border-t border-neutral-100">
        <h2 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-neutral-700" />
          <span>Últimas Reservas de Hóspedes Recebidas</span>
        </h2>

        <div className="bg-white rounded-3xl border border-neutral-200 overflow-hidden divide-y divide-neutral-100 text-xs shadow-2xs">
          {reservations.map((res) => (
            <div key={res.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <img
                  src={res.propertyImage}
                  alt={res.propertyTitle}
                  className="w-12 h-12 rounded-xl object-cover"
                />
                <div>
                  <span className="font-bold text-neutral-900 text-sm block">{res.guestName}</span>
                  <span className="text-neutral-500">{res.propertyTitle} • {res.checkIn} a {res.checkOut} ({res.nights} noites)</span>
                </div>
              </div>

              <div className="flex items-center gap-4 sm:text-right">
                <div>
                  <span className="text-[10px] text-neutral-400 block uppercase font-bold">Líquido</span>
                  <span className="font-extrabold text-sm text-emerald-600">
                    {formatCurrency(res.totalAmount * 0.88, currency)}
                  </span>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                  res.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'
                }`}>
                  {res.status === 'confirmed' ? 'Confirmada' : 'Cancelada'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
