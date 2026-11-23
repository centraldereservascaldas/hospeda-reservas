import type { ReactElement } from 'react';

export function formatPropertyDescription(value: string): ReactElement[] {
  const headingNames = [
    'Horário das Piscinas',
    'Regras do condomínio',
    'Documentação',
    'Manutenção do apartamento',
    'Regimento interno',
    'Localização',
    'Multa de Limpeza',
    'Multa de CHECKOUT',
    'Sala com',
    'Cozinha com',
    'Quarto com',
    'Itens não Inclusos',
    'Itens não inclusos',
    'Aluguel de roupa de cama e banho',
    'Os valores são',
    'Sobre',
  ];
  let normalized = value.replace(/\\n/g, '\n').replace(/\r/g, '\n');
  for (const heading of headingNames) {
    normalized = normalized.replace(new RegExp(`([^\\n])(${heading}:)`, 'gi'), '$1\n$2');
  }
  normalized = normalized
    .replace(/:\s*[-–]\s*/g, ':\n• ')
    .replace(/\s*•\s*/g, '\n• ')
    .replace(/Este é um condomínio/gi, '\nEste é um condomínio')
    .replace(/-(?=\s*(?:guarda roupa|ar-condicionado))/gi, '\n• ')
    .replace(/guarda roupa-\s*ar-condicionado/gi, 'guarda roupa\n• ar-condicionado')
    .replace(/(Os valores são:)\s*(?=R\$)/gi, '$1\n')
    .replace(/(Os valores são:)\s*(R\$)/gi, '$1\n• $2')
    .replace(/(quarto[s]?)(?=R\$)/gi, '$1\n• ')
    .replace(/(R\$\s*\d[\d.,]*\s+para\s+[^R]+?)(?=R\$)/gi, '$1\n• ')
    .replace(/-(?=\s*[A-ZÀ-Ý])/g, '\n• ')
    .replace(/\s+-\s+(?=[A-ZÀ-Ý])/g, '\n• ')
    .replace(/([.!?])\s+(?=[A-ZÀ-Ý])/g, '$1\n');

  const blocks = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return blocks.map((block, index) => {
    const isListItem = block.startsWith('•');
    const content = isListItem ? block.slice(1).trim() : block;
    const heading = /:$/.test(content);
    return (
      <p
        key={`${index}-${content}`}
        className={
          isListItem
            ? 'pl-4 before:mr-2 before:text-orange-700 before:content-["•"]'
            : heading
              ? 'mt-4 font-semibold text-slate-800 first:mt-0'
              : 'mt-2 first:mt-0'
        }
      >
        {content}
      </p>
    );
  });
}
