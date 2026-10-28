import React from 'react';
import { Clock } from 'lucide-react';
import type { Property } from '../../types';
import { HostAvatar } from './HostAvatar';

interface PropertyHostSectionProps {
  host: Property['host'];
}

export const PropertyHostSection: React.FC<PropertyHostSectionProps> = ({ host }) => {
  const normalizedHostName = host.name.trim().toLocaleLowerCase('pt-BR');
  const isCentralReservationsHost = normalizedHostName.includes('central de reservas caldas novas');

  if (!host.name.trim() || isCentralReservationsHost) return null;

  return (
    <section aria-labelledby="property-host-title" className="pt-6">
      <div className="flex items-start gap-4">
        <HostAvatar src={host.avatar} alt={host.name} className="shadow-sm" />
        <div className="min-w-0">
          <h3 id="property-host-title" className="text-base font-bold text-neutral-900">
            Hospedado por {host.name}
          </h3>
          <p className="text-xs text-neutral-500">
            Cadastrado em {host.joinedYear} •{' '}
            {host.isSuperhost ? 'Superhost verificado' : 'Anfitrião'}
          </p>
          <p className="text-sm text-neutral-700 mt-2 italic leading-relaxed">"{host.bio}"</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-neutral-600">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              Tempo de resposta: {host.responseTime}
            </span>
            <span>Taxa de resposta: {host.responseRate}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
