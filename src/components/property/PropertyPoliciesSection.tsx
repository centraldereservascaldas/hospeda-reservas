import React from 'react';

interface PropertyPoliciesSectionProps {
  rules: string[];
}

export const PropertyPoliciesSection: React.FC<PropertyPoliciesSectionProps> = ({ rules }) => (
  <section
    aria-labelledby="property-policies-title"
    className="pt-8 border-t border-neutral-200 space-y-4"
  >
    <h3 id="property-policies-title" className="text-lg font-bold text-neutral-900">
      Regras e Políticas
    </h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-neutral-700">
      <article className="p-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 space-y-2">
        <h4 className="font-bold text-neutral-900">Regras da casa</h4>
        {rules.map((rule, index) => (
          <p key={index} className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" aria-hidden="true" />
            <span>{rule}</span>
          </p>
        ))}
      </article>
      <article className="p-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 space-y-2">
        <h4 className="font-bold text-neutral-900">Política de cancelamento flexível</h4>
        <p className="text-neutral-600 leading-relaxed">
          Cancele até 48 horas antes do check-in para receber reembolso integral. Caso cancele após
          esse prazo, a primeira noite e a taxa de serviço não serão reembolsadas.
        </p>
      </article>
    </div>
  </section>
);
