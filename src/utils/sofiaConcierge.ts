import type { Property } from '../types';
import { matchesPropertyCategory } from './propertyCategories';

type SofiaTurn = { role: 'user' | 'assistant'; content: string };

export interface SofiaFallbackResponse {
  reply: string;
  matchedProperties: Property[];
  suggestedFilters: Record<string, never>;
  totalFound: number;
  assistant: 'catalog';
  resolved: boolean;
}

type CatalogCriterion = { id: string; label: string };

const normalize = (value: string) => value
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’'`]/g, '')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stopWords = new Set([
  'apartamento', 'apartamentos', 'acomodacao', 'acomodacoes', 'hospedagem', 'hospedagens',
  'condominio', 'resort', 'hotel', 'flat', 'suite', 'caldas', 'novas', 'goias', 'go',
  'piscina', 'piscinas', 'termal', 'termais', 'quantas', 'quantos', 'quero', 'queria',
  'pessoas', 'hospedes', 'para', 'com', 'tem', 'qual', 'quais', 'sobre', 'vocês', 'que',
  'regras', 'regra', 'permite', 'permitir', 'permitido', 'permitida', 'pode', 'podem',
  'descer', 'levar', 'bebida', 'bebidas', 'cooler', 'latas', 'lata', 'horario', 'funciona',
  'funcionamento', 'sao', 'faz', 'fazer', 'onde', 'como', 'posso',
  'horas', 'hora', '24', '24h', 'me', 'mostre', 'mostrar', 'favor', 'por',
  'oferece', 'oferecem', 'atracoes', 'estrutura', 'no', 'na', 'do', 'da', 'dos', 'das',
  'quarto', 'quartos', 'dormitorio', 'dormitorios', 'banheiro', 'banheiros', 'cama', 'camas',
  'academia', 'sauna', 'restaurante', 'lanchonete', 'estacionamento', 'hidromassagem', 'jacuzzi', 'ofuro',
  'internet', 'wi', 'fi', 'cozinha', 'parque', 'aquatico', 'ingresso', 'ingressos', 'entrada', 'piscinas',
]);

const questionFillerWords = new Set([
  'o', 'a', 'as', 'os', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas',
  'tem', 'têm', 'possui', 'possuem', 'oferece', 'oferecem', 'permite', 'permitem', 'permitir',
  'permitido', 'permitida', 'pode', 'podem', 'qual', 'quais', 'como', 'funciona', 'funcionam',
  'e', 'que', 'com', 'para', 'condominio', 'resort', 'hotel', 'apartamento', 'apartamentos',
]);

const factsFor = (property: Property) => [
  property.title,
  property.complexName || '',
  property.complexDescription || '',
  property.subtitle,
  property.description,
  ...(property.amenities || []),
  ...(property.propertyAmenities || []),
  ...(property.listingAmenities || []),
  ...(property.rules || []),
  ...(property.highlights || []).flatMap((item) => [item.title, item.description]),
].filter(Boolean).join(' ');

const requestedCondoName = (text: string) => {
  const match = text.match(/(?:condom[ií]nio|resort|hotel)\s+([\p{L}\d][\p{L}\d'’-]*(?:\s+[\p{L}\d][\p{L}\d'’-]*){0,4})/iu);
  if (!match?.[1]) return undefined;
  const endWords = new Set(['com', 'que', 'tem', 'permite', 'permitir', 'permitido', 'permitida', 'pode', 'podem', 'piscina', 'piscinas', 'perto', 'proximo', 'aceita', 'ingresso', 'ingressos', 'bebida', 'bebidas', 'cooler', 'para', 'onde']);
  const words = match[1].replace(/[?!.;,]+$/, '').trim().split(/\s+/);
  const nameWords: string[] = [];
  for (const word of words) {
    if (endWords.has(normalize(word))) break;
    if (normalize(word) !== 'e') nameWords.push(word);
    if (nameWords.length === 4) break;
  }
  return nameWords.join(' ') || undefined;
};

const namedProperty = (text: string, properties: Property[]) => {
  const query = normalize(text);
  const terms = [...new Set(query.split(' ').filter((word) => word.length >= 4 && !stopWords.has(word) && !['permite', 'permitido', 'permitida', 'descer', 'bebida', 'bebidas', 'cooler'].includes(word)))];
  if (!terms.length) return undefined;
  const explicitCondoTerms = requestedCondoName(text)?.split(' ').map(normalize).filter((word) => word.length >= 3 && !['do', 'da', 'dos', 'das'].includes(word)) || [];

  const ranked = properties
    .map((property) => {
      const title = normalize(property.title);
      const complex = normalize(property.complexName || '');
      const titleTerms = new Set(`${title} ${complex}`.split(' '));
      const overlap = terms.filter((word) => titleTerms.has(word));
      const score = overlap.reduce((sum, word) => sum + (complex.includes(word) ? 3 : 1), 0);
      return { property, score, overlapCount: overlap.length };
    })
    .filter((item) => item.score > 0
      && item.overlapCount >= Math.ceil(terms.length * 0.5)
      && explicitCondoTerms.every((word) => new Set(`${normalize(item.property.title)} ${normalize(item.property.complexName || '')}`.split(' ')).has(word)))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return undefined;
  const sameScoreOtherCondo = ranked.find((item) =>
    item.score === best.score && normalize(item.property.complexName || item.property.title) !== normalize(best.property.complexName || best.property.title)
  );
  return sameScoreOtherCondo ? undefined : best.property;
};

const criteriaFor = (query: string): CatalogCriterion[] => {
  const criteria: CatalogCriterion[] = [];
  if (/piscina.{0,18}(?:24\s*h|24\s*horas)|(?:24\s*h|24\s*horas).{0,18}piscina/.test(query)) {
    criteria.push({ id: 'pools_24h', label: 'piscina 24 horas' });
  } else if (/piscina|parque aquatico|aguas termais/.test(query)) {
    criteria.push({ id: 'pool_access', label: 'acesso a piscinas' });
  }
  if (/descer com (?:a )?bebida|levar (?:a )?bebida|bebidas? permitidas|(?:permite|permitido|permitida).{0,20}(?:descer|levar|bebida|cooler)|pode.{0,15}(?:cooler|bebida)/.test(query)) {
    criteria.push({ id: 'beverages_allowed', label: 'bebidas permitidas' });
  }
  if (/ingresso|entrada.{0,20}inclus|parque aquatico inclus/.test(query)) {
    criteria.push({ id: 'waterpark_included', label: 'ingressos de parque incluídos' });
  }
  if (/centro da cidade|no centro|perto do centro|proximo do centro/.test(query)) {
    criteria.push({ id: 'near_center', label: 'perto do centro' });
  }
  if (/pet|animal de estimacao|aceita animais/.test(query)) {
    criteria.push({ id: 'pet_friendly', label: 'aceita pets' });
  }
  if (/hidromassagem|jacuzzi|ofuro/.test(query)) {
    criteria.push({ id: 'hot_tub', label: 'hidromassagem ou jacuzzi' });
  }
  return criteria;
};

const guestCount = (query: string) => {
  const match = query.match(/\b(\d{1,2})\s*(?:pessoas?|hospedes|adultos?|pax)\b/) || query.match(/\bpara\s+(\d{1,2})\b/);
  if (match) return Math.max(1, Number(match[1]));
  if (query.includes('casal')) return 2;
  if (query.includes('familia')) return 4;
  return undefined;
};

const isCapacityQuestion = (text: string) => /\b(capacidade|cabem?|comportam?|hospedes|pessoas)\b/.test(normalize(text));

const condoProperties = (property: Property, properties: Property[]) => {
  const condoName = normalize(property.complexName || property.title);
  return properties.filter((item) => normalize(item.complexName || item.title) === condoName);
};

const capacitySummary = (property: Property, properties: Property[], allUnits = false) => {
  const units = condoProperties(property, properties).filter((item) => item.maxGuests > 0);
  if (!allUnits || units.length <= 1) {
    return `A ficha de ${property.title} informa capacidade para até ${property.maxGuests} hóspedes.`;
  }
  const list = units.map((unit) => `${unit.title}: até ${unit.maxGuests} hóspedes`).join('; ');
  return `No condomínio ${property.complexName || property.title}, encontrei ${units.length} apartamentos no catálogo: ${list}.`;
};

const explicitBeverageRestriction = (property: Property) => {
  const lines = factsFor(property).split(/[\n.!;]+/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => {
    const normalized = normalize(line);
    const mentionsBeverage = /\b(bebidas?|cooler|latas?)\b/.test(normalized);
    const forbids = /\bnao\s+(?:e\s+)?(?:permitid[oa]|permite|pode)\b|\bproibid[oa]\b/.test(normalized);
    return mentionsBeverage && forbids;
  });
};

const poolHoursFact = (property: Property) => factsFor(property)
  .split(/[\n.!;]+/)
  .map((line) => line.trim())
  .find((line) => /piscin/i.test(line) && /24\s*h(?:oras?)?|funcion[ae]?\s+24\s*h/i.test(normalize(line)));

const condoSummary = (property: Property) => (property.complexDescription || '')
  .split(/\n+/)
  .map((line) => line.replace(/^\s*[✓✔✗x↓→•-]+\s*/, '').trim())
  .filter((line) => line.length > 4)
  .slice(0, 4);

const response = (reply: string, matchedProperties: Property[] = [], totalFound = 0, resolved = true): SofiaFallbackResponse => ({
  reply, matchedProperties, totalFound, suggestedFilters: {}, assistant: 'catalog', resolved,
});

export function buildSofiaFallback(message: string, history: SofiaTurn[], properties: Property[]): SofiaFallbackResponse {
  const query = normalize(message);
  const turns = history.slice(-10);
  const lastUserTurn = [...turns].reverse().find((turn) => turn.role === 'user');
  const lastAssistantTurn = [...turns].reverse().find((turn) => turn.role === 'assistant');
  const assistantAnsweredCapacity = Boolean(lastAssistantTurn && /\b(capacidade|hospedes|acomoda|comporta)\b/.test(normalize(lastAssistantTurn.content)));
  const isCapacityFollowUp = Boolean(isCapacityQuestion(lastUserTurn?.content || '') && assistantAnsweredCapacity);
  const wasAskedForPoolCondo = Boolean(
    lastUserTurn && /quantas?\s+(?:piscinas?|piscina\s+termal)|numero\s+de\s+piscinas?/.test(normalize(lastUserTurn.content)) &&
    lastAssistantTurn && /qual[\s\S]{0,80}condominio/.test(normalize(lastAssistantTurn.content)),
  );
  const isFollowUp = /^(?:e|mas|tambem|nesse caso|entao|isso|ele|ela|nesse|nessa)\b/.test(query);
  const explicitCondoName = requestedCondoName(message);
  const condoMention = explicitCondoName
    ? properties.find((item) => normalize(item.complexName || item.title).includes(normalize(explicitCondoName)))
    : undefined;
  const contextProperty = isFollowUp
    ? [...turns].reverse().map((turn) => namedProperty(turn.content, properties)).find(Boolean)
    : undefined;
  const guests = guestCount(query);
  const criteria = criteriaFor(query);
  const identifiedProperty = namedProperty(message, properties) || condoMention || contextProperty;
  const hasDirectQuestionCue = /\b(tem|possui|permite|permitem|pode|podem|quantas|quantos|qual|quais|como|funciona|aceita|deixa|e permitido)\b/.test(query);
  const capacityIntent = isCapacityQuestion(message) || (isFollowUp && isCapacityFollowUp);
  const isDirectPropertyQuestion = Boolean(identifiedProperty && (hasDirectQuestionCue || capacityIntent));
  const explicitSearchVerb = /\b(quero|queria|busco|procuro|encontre|encontrar|sugira|recomende|me mostre|opcoes|opcao)\b/.test(query)
    || /\bquais?\s+(?:apartamentos?|acomodacoes?|hospedagens?)\b/.test(query);
  const isGuestCapacitySearch = guests !== undefined && !hasDirectQuestionCue;
  const isCriteriaSearch = criteria.length > 0 && !identifiedProperty && !hasDirectQuestionCue;
  const isNewSearch = !isDirectPropertyQuestion && (explicitSearchVerb || isGuestCapacitySearch || isCriteriaSearch);

  if (isNewSearch) {
    const condo = identifiedProperty;
    const condoName = requestedCondoName(message);
    if (guests === undefined && criteria.length === 0 && !condo && !condoName) {
      return response('Posso procurar para você. Quantas pessoas vão se hospedar e qual comodidade é indispensável? Assim evito sugerir opções aleatórias.');
    }
    const candidates = properties
      .filter((property) => guests === undefined || property.maxGuests >= guests)
      .filter((property) => !condo || normalize(property.complexName || property.title).includes(normalize(condo.complexName || condo.title)))
      .filter((property) => !condoName || condo || normalize(property.complexName || property.title).includes(normalize(condoName)))
      .filter((property) => criteria.every((criterion) => matchesPropertyCategory(property, criterion.id)))
      .sort((a, b) => a.maxGuests - b.maxGuests || b.rating - a.rating || a.pricePerNight - b.pricePerNight);
    const matches = candidates.slice(0, 4);
    const resultLabel = candidates.length === 1 ? 'acomodação cadastrada' : 'acomodações cadastradas';
    const filtersDescription = criteria.map((criterion) => criterion.label).join(', ');
    const guestDescription = guests ? ` para até ${guests} hóspedes` : '';
    const criteriaDescription = filtersDescription ? ` com ${filtersDescription}` : '';
    if (!candidates.length) {
      const constraints = [guests ? `${guests} hóspedes` : '', filtersDescription].filter(Boolean).join(' e ');
      return response(`Não encontrei acomodações no catálogo que confirmem ${constraints || 'esses critérios'}. Posso ampliar a busca se você quiser retirar algum critério.`, [], 0);
    }
    return response(
      `Encontrei ${candidates.length} ${resultLabel}${guestDescription}${criteriaDescription}${condo ? ` em ${condo.complexName || condo.title}` : condoName ? ` em ${condoName}` : ''}. Mostro até 4 opções; preço e disponibilidade precisam ser confirmados para as datas da viagem.`,
      matches,
      candidates.length,
    );
  }

  const poolQuestion = /quantas?\s+(?:piscinas?|piscina\s+termal)|numero\s+de\s+piscinas?|quantidade\s+de\s+piscinas?/.test(query) || wasAskedForPoolCondo;
  const poolHoursQuestion = /(?:horario.{0,24}piscinas?|piscinas?.{0,28}(?:24\s*h|funcionam|funciona|ficam)|(?:24\s*h|24\s*horas).{0,28}piscinas?|quantas?.{0,30}(?:funcionam|ficam).{0,15}24)/.test(query)
    || Boolean(isFollowUp && contextProperty && /\bhorario\b/.test(query));
  if (poolHoursQuestion) {
    const property = identifiedProperty || (wasAskedForPoolCondo ? namedProperty(lastUserTurn?.content || '', properties) : undefined);
    const fact = property && poolHoursFact(property);
    return response(fact
      ? `Na descrição de ${property!.complexName || property!.title} consta: “${fact}”.`
      : property
        ? `Não encontrei o horário das piscinas na descrição cadastrada de ${property.complexName || property.title}.`
        : 'Qual condomínio você quer consultar? Assim verifico o horário das piscinas na descrição cadastrada.');
  }
  if (poolQuestion) {
    const property = identifiedProperty || (wasAskedForPoolCondo ? namedProperty(lastUserTurn?.content || '', properties) : undefined);
    const poolCount = property && factsFor(property).match(/\b(\d{1,2})\s+piscinas?\b/i);
    const condoName = requestedCondoName(message);
    return response(poolCount
      ? `A ficha de ${property!.complexName || property!.title} informa ${poolCount[1]} piscinas. Como a informação vem do cadastro do imóvel, confirme com o condomínio se precisar de uma contagem atualizada.`
      : condoName || wasAskedForPoolCondo
        ? `Não encontrei a quantidade de piscinas de ${condoName || message.trim()} nas informações cadastradas. Posso ajudar com outro dado que esteja na ficha do imóvel.`
        : 'De qual condomínio você quer saber a quantidade de piscinas? Não encontrei um condomínio específico na sua pergunta.');
  }

  const property = identifiedProperty;
  const asksCapacity = capacityIntent;
  if (property && asksCapacity) {
    const specificUnit = /\b(?:apto|apartamento|suite|su[ií]te)\s*(?:n(?:o|º)?\s*)?\d+\b/i.test(message);
    const asksForMultipleUnits = /\bapartamentos\b/.test(query) || (isFollowUp && isCapacityFollowUp);
    return response(capacitySummary(property, properties, asksForMultipleUnits || !specificUnit));
  }

  if (property && hasDirectQuestionCue && /\b(quartos?|dormitorios?)\b/.test(query) && property.bedrooms > 0) {
    return response(`A ficha de ${property.title} informa ${property.bedrooms} ${property.bedrooms === 1 ? 'quarto' : 'quartos'}.`);
  }
  if (property && hasDirectQuestionCue && /\b(banheiros?|casas de banho)\b/.test(query) && property.bathrooms > 0) {
    return response(`A ficha de ${property.title} informa ${property.bathrooms} ${property.bathrooms === 1 ? 'banheiro' : 'banheiros'}.`);
  }
  if (property && hasDirectQuestionCue && /\b(camas?|leitos?)\b/.test(query) && property.beds > 0) {
    return response(`A ficha de ${property.title} informa ${property.beds} ${property.beds === 1 ? 'cama' : 'camas'}.`);
  }

  if (property && criteria.length) {
    if (criteria.some((criterion) => criterion.id === 'beverages_allowed')) {
      const restriction = explicitBeverageRestriction(property);
      if (restriction) return response(`A descrição de ${property.complexName || property.title} informa: “${restriction}”.`);
    }
    const matching = criteria.filter((criterion) => matchesPropertyCategory(property, criterion.id));
    const missing = criteria.filter((criterion) => !matchesPropertyCategory(property, criterion.id));
    if (!missing.length) return response(`A ficha de ${property.complexName || property.title} confirma: ${matching.map((item) => item.label).join(', ')}.`);
    return response(`Não encontrei confirmação na ficha de ${property.complexName || property.title} para: ${missing.map((item) => item.label).join(', ')}. Os dados cadastrados confirmam apenas comodidades descritas explicitamente.`);
  }

  if (property && /\b(o que tem|o que oferece|quais atracoes|estrutura do condominio|estrutura do resort)\b/.test(query)) {
    const summary = condoSummary(property);
    return response(summary.length
      ? `Na descrição do condomínio ${property.complexName || property.title} constam: ${summary.join('; ')}.`
      : `Não encontrei uma descrição detalhada do condomínio ${property.complexName || property.title} no catálogo.`);
  }

  const questionCriteria = criteriaFor(query);
  const amenityQuestion = /\b(tem|possui|oferece|permite|permitido|permitida|aceita|funciona|funcionamento)\b/.test(query);
  if (property && amenityQuestion && questionCriteria.length) {
    if (questionCriteria.some((criterion) => criterion.id === 'beverages_allowed')) {
      const restriction = explicitBeverageRestriction(property);
      if (restriction) return response(`A descrição de ${property.complexName || property.title} informa: “${restriction}”.`);
    }
    const missing = questionCriteria.filter((criterion) => !matchesPropertyCategory(property, criterion.id));
    if (!missing.length) return response(`A ficha de ${property.complexName || property.title} confirma: ${questionCriteria.map((item) => item.label).join(', ')}.`);
    return response(`Não encontrei confirmação na ficha de ${property.complexName || property.title} para: ${missing.map((item) => item.label).join(', ')}. Não vou presumir essa informação sem ela estar cadastrada.`);
  }

  if (property && hasDirectQuestionCue) {
    const propertyNameWords = new Set(normalize(`${property.title} ${property.complexName || ''}`).split(' '));
    const requestedTerms = [...new Set(query.split(' ').filter((word) =>
      word.length >= 4 && !questionFillerWords.has(word) && !propertyNameWords.has(word) && !/^\d+$/.test(word)
    ))];
    if (requestedTerms.length) {
      const sourceLines = [
        ...(property.complexDescription || '').split(/[\n.!;]+/),
        ...(property.propertyAmenities || []),
        ...(property.amenities || []),
        ...(property.rules || []),
        ...(property.highlights || []).flatMap((item) => [item.title, item.description]),
      ].map((line) => line.trim()).filter(Boolean);
      const matches = sourceLines.filter((line) => {
        const normalizedLine = normalize(line);
        return requestedTerms.some((term) => normalizedLine.includes(term));
      }).slice(0, 2);
      if (matches.length) return response(`Na ficha de ${property.complexName || property.title} consta: ${matches.join('; ')}.`);
      return response(`Não encontrei essa informação na ficha cadastrada de ${property.complexName || property.title}. Se quiser, pergunte sobre outro item específico do condomínio.`);
    }
  }

  return response('Posso buscar opções por número de hóspedes, condomínio e comodidades cadastradas — como piscina 24h, bebidas permitidas, ingressos incluídos ou proximidade do centro. O que é mais importante para sua estadia?', [], 0, false);
}
