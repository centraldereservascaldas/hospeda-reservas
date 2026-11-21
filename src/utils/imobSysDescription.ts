const amenityLabels: Record<string, string> = {
  fogao: 'Fogão',
  geladeira: 'Geladeira',
  frigobar: 'Frigobar',
  piscina: 'Piscina',
};

export function organizeImobSysDescription(description: string): {
  description: string;
  amenities: string[];
} {
  const amenities = new Set<string>();
  const text = description.replace(
    /#([\p{L}\d_]+(?:\/[\p{L}\d_]+)?)/gu,
    (tag, raw: string, offset: number) => {
      const key = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const label = amenityLabels[key];
      if (!label || /\b(?:sem|não|nao)\s*$/iu.test(description.slice(0, offset))) return tag;
      amenities.add(label);
      return '';
    },
  );

  return {
    description: text.replace(/[ \t]{2,}/g, ' ').trim(),
    amenities: [...amenities],
  };
}
