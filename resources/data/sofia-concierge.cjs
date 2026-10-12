var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/utils/sofiaConcierge.ts
var sofiaConcierge_exports = {};
__export(sofiaConcierge_exports, {
  buildSofiaFallback: () => buildSofiaFallback
});
var __sofiaExports = __toCommonJS(sofiaConcierge_exports);
__sofiaExports.buildSofiaFallback = buildSofiaFallback;
module.exports = __sofiaExports;

// src/utils/propertyCategories.ts
var normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
function matchesPropertyCategory(property, categoryId) {
  if (categoryId === "all") return true;
  if (normalize(property.category) === normalize(categoryId)) return true;
  const text = normalize([
    property.title,
    property.complexName,
    property.complexDescription,
    property.subtitle,
    property.description,
    property.location?.neighborhood,
    property.location?.address,
    ...property.amenities || [],
    ...property.listingAmenities || [],
    ...property.propertyAmenities || [],
    ...(property.highlights || []).flatMap((highlight) => [highlight.title, highlight.description])
  ].filter(Boolean).join(" "));
  const location = normalize([
    property.location?.neighborhood,
    property.location?.address
  ].filter(Boolean).join(" "));
  const rulesAndDescription = normalize([
    property.description,
    property.complexDescription,
    ...property.rules || [],
    ...(property.highlights || []).flatMap((highlight) => [highlight.title, highlight.description])
  ].filter(Boolean).join(" "));
  switch (categoryId) {
    case "pools_24h":
      return /piscinas?.{0,45}(?:24\s*h(?:oras?)?|funcionamento 24)|(?:24\s*h(?:oras?)?).{0,45}piscinas?/.test(text);
    case "pool_access":
      return /piscinas?/.test(text);
    case "beverages_allowed": {
      const explicitlyAllowed = /(?:permitid[oa]|pode)\s+(?:descer|levar|entrar)(?:\s+com)?\s+(?:(?:seu|sua)\s+)?(?:cooler|bebidas?|latas?)(?:\s|,|\.|$)/.test(rulesAndDescription);
      const explicitlyForbidden = /(?:nao\s+(?:e\s+)?(?:permitid[oa]|permite)|nao\s+pode|proibid[oa])\s+(?:descer|levar|entrar)(?:\s+com)?\s+(?:(?:seu|sua)\s+)?(?:cooler|bebidas?|latas?)/.test(rulesAndDescription) || /(?:bebidas?|cooler|latas?).{0,20}(?:nao\s+permitid[oa]|proibid[oa])/.test(rulesAndDescription);
      return explicitlyAllowed && !explicitlyForbidden;
    }
    case "near_center":
      return /\bcentro\b|setor central|regiao central/.test(location) || /(?:ate|a|aproximadamente)?\s*[0-3](?:[.,]\d+)?\s*km\s+(?:do|de|ate o)\s+centro/.test(normalize(property.description));
    case "waterpark_included":
      return /(?:ingressos?|entrada|acesso).{0,50}(?:inclus[oa]s?|gratuit[oa]s?|cortesia).{0,45}(?:parque|acqua|hot park)|(?:parque aquatico|hot park).{0,55}(?:inclus[oa]s?|gratuit[oa]s?|cortesia)/.test(text);
    case "family_friendly":
      return Number(property.maxGuests) >= 4;
    case "pet_friendly":
      return /aceita animais?|permite animais?|aceita pet|pet friendly/.test(rulesAndDescription);
    case "hot_tub":
      return /hidromassagem|ofuro|jacuzzi/.test(text);
    default:
      return false;
  }
}

// src/utils/sofiaConcierge.ts
var normalize2 = (value) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’'`]/g, "").replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s]/gu, " ").replace(/\s+/g, " ").trim();
var stopWords = /* @__PURE__ */ new Set([
  "apartamento",
  "apartamentos",
  "acomodacao",
  "acomodacoes",
  "hospedagem",
  "hospedagens",
  "condominio",
  "resort",
  "hotel",
  "flat",
  "suite",
  "caldas",
  "novas",
  "goias",
  "go",
  "piscina",
  "piscinas",
  "termal",
  "termais",
  "quantas",
  "quantos",
  "quero",
  "queria",
  "pessoas",
  "hospedes",
  "para",
  "com",
  "tem",
  "qual",
  "quais",
  "sobre",
  "voc\xEAs",
  "que",
  "regras",
  "regra",
  "permite",
  "permitir",
  "permitido",
  "permitida",
  "pode",
  "podem",
  "descer",
  "levar",
  "bebida",
  "bebidas",
  "cooler",
  "latas",
  "lata",
  "horario",
  "funciona",
  "funcionamento",
  "sao",
  "faz",
  "fazer",
  "onde",
  "como",
  "posso",
  "horas",
  "hora",
  "24",
  "24h",
  "me",
  "mostre",
  "mostrar",
  "favor",
  "por",
  "oferece",
  "oferecem",
  "atracoes",
  "estrutura",
  "no",
  "na",
  "do",
  "da",
  "dos",
  "das",
  "quarto",
  "quartos",
  "dormitorio",
  "dormitorios",
  "banheiro",
  "banheiros",
  "cama",
  "camas",
  "academia",
  "sauna",
  "restaurante",
  "lanchonete",
  "estacionamento",
  "hidromassagem",
  "jacuzzi",
  "ofuro",
  "internet",
  "wi",
  "fi",
  "cozinha",
  "parque",
  "aquatico",
  "ingresso",
  "ingressos",
  "entrada",
  "piscinas"
]);
var questionFillerWords = /* @__PURE__ */ new Set([
  "o",
  "a",
  "as",
  "os",
  "um",
  "uma",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "no",
  "na",
  "nos",
  "nas",
  "tem",
  "t\xEAm",
  "possui",
  "possuem",
  "oferece",
  "oferecem",
  "permite",
  "permitem",
  "permitir",
  "permitido",
  "permitida",
  "pode",
  "podem",
  "qual",
  "quais",
  "como",
  "funciona",
  "funcionam",
  "e",
  "que",
  "com",
  "para",
  "condominio",
  "resort",
  "hotel",
  "apartamento",
  "apartamentos"
]);
var factsFor = (property) => [
  property.title,
  property.complexName || "",
  property.complexDescription || "",
  property.subtitle,
  property.description,
  ...property.amenities || [],
  ...property.propertyAmenities || [],
  ...property.listingAmenities || [],
  ...property.rules || [],
  ...(property.highlights || []).flatMap((item) => [item.title, item.description])
].filter(Boolean).join(" ");
var requestedCondoName = (text) => {
  const match = text.match(/(?:condom[ií]nio|resort|hotel)\s+([A-Za-zÀ-ÖØ-öø-ÿ\d][A-Za-zÀ-ÖØ-öø-ÿ\d'’-]*(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ\d][A-Za-zÀ-ÖØ-öø-ÿ\d'’-]*){0,4})/iu);
  if (!match?.[1]) return void 0;
  const endWords = /* @__PURE__ */ new Set(["com", "que", "tem", "permite", "permitir", "permitido", "permitida", "pode", "podem", "piscina", "piscinas", "perto", "proximo", "aceita", "ingresso", "ingressos", "bebida", "bebidas", "cooler", "para", "onde"]);
  const words = match[1].replace(/[?!.;,]+$/, "").trim().split(/\s+/);
  const nameWords = [];
  for (const word of words) {
    if (endWords.has(normalize2(word))) break;
    if (normalize2(word) !== "e") nameWords.push(word);
    if (nameWords.length === 4) break;
  }
  return nameWords.join(" ") || void 0;
};
var namedProperty = (text, properties) => {
  const query = normalize2(text);
  const terms = [...new Set(query.split(" ").filter((word) => word.length >= 4 && !stopWords.has(word) && !["permite", "permitido", "permitida", "descer", "bebida", "bebidas", "cooler"].includes(word)))];
  if (!terms.length) return void 0;
  const explicitCondoTerms = requestedCondoName(text)?.split(" ").map(normalize2).filter((word) => word.length >= 3 && !["do", "da", "dos", "das"].includes(word)) || [];
  const ranked = properties.map((property) => {
    const title = normalize2(property.title);
    const complex = normalize2(property.complexName || "");
    const titleTerms = new Set(`${title} ${complex}`.split(" "));
    const overlap = terms.filter((word) => titleTerms.has(word));
    const score = overlap.reduce((sum, word) => sum + (complex.includes(word) ? 3 : 1), 0);
    return { property, score, overlapCount: overlap.length };
  }).filter((item) => item.score > 0 && item.overlapCount >= Math.ceil(terms.length * 0.5) && explicitCondoTerms.every((word) => new Set(`${normalize2(item.property.title)} ${normalize2(item.property.complexName || "")}`.split(" ")).has(word))).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return void 0;
  const sameScoreOtherCondo = ranked.find(
    (item) => item.score === best.score && normalize2(item.property.complexName || item.property.title) !== normalize2(best.property.complexName || best.property.title)
  );
  return sameScoreOtherCondo ? void 0 : best.property;
};
var criteriaFor = (query) => {
  const criteria = [];
  if (/piscina.{0,18}(?:24\s*h|24\s*horas)|(?:24\s*h|24\s*horas).{0,18}piscina/.test(query)) {
    criteria.push({ id: "pools_24h", label: "piscina 24 horas" });
  } else if (/piscina|parque aquatico|aguas termais/.test(query)) {
    criteria.push({ id: "pool_access", label: "acesso a piscinas" });
  }
  if (/descer com (?:a )?bebida|levar (?:a )?bebida|bebidas? permitidas|(?:permite|permitido|permitida).{0,20}(?:descer|levar|bebida|cooler)|pode.{0,15}(?:cooler|bebida)/.test(query)) {
    criteria.push({ id: "beverages_allowed", label: "bebidas permitidas" });
  }
  if (/ingresso|entrada.{0,20}inclus|parque aquatico inclus/.test(query)) {
    criteria.push({ id: "waterpark_included", label: "ingressos de parque inclu\xEDdos" });
  }
  if (/centro da cidade|no centro|perto do centro|proximo do centro/.test(query)) {
    criteria.push({ id: "near_center", label: "perto do centro" });
  }
  if (/pet|animal de estimacao|aceita animais/.test(query)) {
    criteria.push({ id: "pet_friendly", label: "aceita pets" });
  }
  if (/hidromassagem|jacuzzi|ofuro/.test(query)) {
    criteria.push({ id: "hot_tub", label: "hidromassagem ou jacuzzi" });
  }
  return criteria;
};
var guestCount = (query) => {
  const match = query.match(/\b(\d{1,2})\s*(?:pessoas?|hospedes|adultos?|pax)\b/) || query.match(/\bpara\s+(\d{1,2})\b/);
  if (match) return Math.max(1, Number(match[1]));
  if (query.includes("casal")) return 2;
  if (query.includes("familia")) return 4;
  return void 0;
};
var isCapacityQuestion = (text) => /\b(capacidade|cabem?|comportam?|hospedes|pessoas)\b/.test(normalize2(text));
var condoProperties = (property, properties) => {
  const condoName = normalize2(property.complexName || property.title);
  return properties.filter((item) => normalize2(item.complexName || item.title) === condoName);
};
var capacitySummary = (property, properties, allUnits = false) => {
  const units = condoProperties(property, properties).filter((item) => item.maxGuests > 0);
  if (!allUnits || units.length <= 1) {
    return `A ficha de ${property.title} informa capacidade para at\xE9 ${property.maxGuests} h\xF3spedes.`;
  }
  const list = units.map((unit) => `${unit.title}: at\xE9 ${unit.maxGuests} h\xF3spedes`).join("; ");
  return `No condom\xEDnio ${property.complexName || property.title}, encontrei ${units.length} apartamentos no cat\xE1logo: ${list}.`;
};
var explicitBeverageRestriction = (property) => {
  const lines = factsFor(property).split(/[\n.!;]+/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => {
    const normalized = normalize2(line);
    const mentionsBeverage = /\b(bebidas?|cooler|latas?)\b/.test(normalized);
    const forbids = /\bnao\s+(?:e\s+)?(?:permitid[oa]|permite|pode)\b|\bproibid[oa]\b/.test(normalized);
    return mentionsBeverage && forbids;
  });
};
var poolHoursFact = (property) => factsFor(property).split(/[\n.!;]+/).map((line) => line.trim()).find((line) => /piscin/i.test(line) && /24\s*h(?:oras?)?|funcion[ae]?\s+24\s*h/i.test(normalize2(line)));
var condoSummary = (property) => (property.complexDescription || "").split(/\n+/).map((line) => line.replace(/^\s*[✓✔✗x↓→•-]+\s*/, "").trim()).filter((line) => line.length > 4).slice(0, 4);
var response = (reply, matchedProperties = [], totalFound = 0, resolved = true) => ({
  reply,
  matchedProperties,
  totalFound,
  suggestedFilters: {},
  assistant: "catalog",
  resolved
});
function buildSofiaFallback(message, history, properties) {
  const query = normalize2(message);
  const turns = history.slice(-10);
  const lastUserTurn = [...turns].reverse().find((turn) => turn.role === "user");
  const lastAssistantTurn = [...turns].reverse().find((turn) => turn.role === "assistant");
  const assistantAnsweredCapacity = Boolean(lastAssistantTurn && /\b(capacidade|hospedes|acomoda|comporta)\b/.test(normalize2(lastAssistantTurn.content)));
  const isCapacityFollowUp = Boolean(isCapacityQuestion(lastUserTurn?.content || "") && assistantAnsweredCapacity);
  const wasAskedForPoolCondo = Boolean(
    lastUserTurn && /quantas?\s+(?:piscinas?|piscina\s+termal)|numero\s+de\s+piscinas?/.test(normalize2(lastUserTurn.content)) && lastAssistantTurn && /qual[\s\S]{0,80}condominio/.test(normalize2(lastAssistantTurn.content))
  );
  const isFollowUp = /^(?:e|mas|tambem|nesse caso|entao|isso|ele|ela|nesse|nessa)\b/.test(query);
  const explicitCondoName = requestedCondoName(message);
  const condoMention = explicitCondoName ? properties.find((item) => normalize2(item.complexName || item.title).includes(normalize2(explicitCondoName))) : void 0;
  const contextProperty = isFollowUp ? [...turns].reverse().map((turn) => namedProperty(turn.content, properties)).find(Boolean) : void 0;
  const guests = guestCount(query);
  const criteria = criteriaFor(query);
  const identifiedProperty = namedProperty(message, properties) || condoMention || contextProperty;
  const hasDirectQuestionCue = /\b(tem|possui|permite|permitem|pode|podem|quantas|quantos|qual|quais|como|funciona|aceita|deixa|e permitido)\b/.test(query);
  const capacityIntent = isCapacityQuestion(message) || isFollowUp && isCapacityFollowUp;
  const isDirectPropertyQuestion = Boolean(identifiedProperty && (hasDirectQuestionCue || capacityIntent));
  const explicitSearchVerb = /\b(quero|queria|busco|procuro|encontre|encontrar|sugira|recomende|me mostre|opcoes|opcao)\b/.test(query) || /\bquais?\s+(?:apartamentos?|acomodacoes?|hospedagens?)\b/.test(query);
  const isGuestCapacitySearch = guests !== void 0 && !hasDirectQuestionCue;
  const isCriteriaSearch = criteria.length > 0 && !identifiedProperty && !hasDirectQuestionCue;
  const isNewSearch = !isDirectPropertyQuestion && (explicitSearchVerb || isGuestCapacitySearch || isCriteriaSearch);
  if (isNewSearch) {
    const condo = identifiedProperty;
    const condoName = requestedCondoName(message);
    if (guests === void 0 && criteria.length === 0 && !condo && !condoName) {
      return response("Posso procurar para voc\xEA. Quantas pessoas v\xE3o se hospedar e qual comodidade \xE9 indispens\xE1vel? Assim evito sugerir op\xE7\xF5es aleat\xF3rias.");
    }
    const candidates = properties.filter((property2) => guests === void 0 || property2.maxGuests >= guests).filter((property2) => !condo || normalize2(property2.complexName || property2.title).includes(normalize2(condo.complexName || condo.title))).filter((property2) => !condoName || condo || normalize2(property2.complexName || property2.title).includes(normalize2(condoName))).filter((property2) => criteria.every((criterion) => matchesPropertyCategory(property2, criterion.id))).sort((a, b) => a.maxGuests - b.maxGuests || b.rating - a.rating || a.pricePerNight - b.pricePerNight);
    const matches = candidates.slice(0, 4);
    const resultLabel = candidates.length === 1 ? "acomoda\xE7\xE3o cadastrada" : "acomoda\xE7\xF5es cadastradas";
    const filtersDescription = criteria.map((criterion) => criterion.label).join(", ");
    const guestDescription = guests ? ` para at\xE9 ${guests} h\xF3spedes` : "";
    const criteriaDescription = filtersDescription ? ` com ${filtersDescription}` : "";
    if (!candidates.length) {
      const constraints = [guests ? `${guests} h\xF3spedes` : "", filtersDescription].filter(Boolean).join(" e ");
      return response(`N\xE3o encontrei acomoda\xE7\xF5es no cat\xE1logo que confirmem ${constraints || "esses crit\xE9rios"}. Posso ampliar a busca se voc\xEA quiser retirar algum crit\xE9rio.`, [], 0);
    }
    return response(
      `Encontrei ${candidates.length} ${resultLabel}${guestDescription}${criteriaDescription}${condo ? ` em ${condo.complexName || condo.title}` : condoName ? ` em ${condoName}` : ""}. Mostro at\xE9 4 op\xE7\xF5es; pre\xE7o e disponibilidade precisam ser confirmados para as datas da viagem.`,
      matches,
      candidates.length
    );
  }
  const poolQuestion = /quantas?\s+(?:piscinas?|piscina\s+termal)|numero\s+de\s+piscinas?|quantidade\s+de\s+piscinas?/.test(query) || wasAskedForPoolCondo;
  const poolHoursQuestion = /(?:horario.{0,24}piscinas?|piscinas?.{0,28}(?:24\s*h|funcionam|funciona|ficam)|(?:24\s*h|24\s*horas).{0,28}piscinas?|quantas?.{0,30}(?:funcionam|ficam).{0,15}24)/.test(query) || Boolean(isFollowUp && contextProperty && /\bhorario\b/.test(query));
  if (poolHoursQuestion) {
    const property2 = identifiedProperty || (wasAskedForPoolCondo ? namedProperty(lastUserTurn?.content || "", properties) : void 0);
    const fact = property2 && poolHoursFact(property2);
    return response(fact ? `Na descri\xE7\xE3o de ${property2.complexName || property2.title} consta: \u201C${fact}\u201D.` : property2 ? `N\xE3o encontrei o hor\xE1rio das piscinas na descri\xE7\xE3o cadastrada de ${property2.complexName || property2.title}.` : "Qual condom\xEDnio voc\xEA quer consultar? Assim verifico o hor\xE1rio das piscinas na descri\xE7\xE3o cadastrada.");
  }
  if (poolQuestion) {
    const property2 = identifiedProperty || (wasAskedForPoolCondo ? namedProperty(lastUserTurn?.content || "", properties) : void 0);
    const poolCount = property2 && factsFor(property2).match(/\b(\d{1,2})\s+piscinas?\b/i);
    const condoName = requestedCondoName(message);
    return response(poolCount ? `A ficha de ${property2.complexName || property2.title} informa ${poolCount[1]} piscinas. Como a informa\xE7\xE3o vem do cadastro do im\xF3vel, confirme com o condom\xEDnio se precisar de uma contagem atualizada.` : condoName || wasAskedForPoolCondo ? `N\xE3o encontrei a quantidade de piscinas de ${condoName || message.trim()} nas informa\xE7\xF5es cadastradas. Posso ajudar com outro dado que esteja na ficha do im\xF3vel.` : "De qual condom\xEDnio voc\xEA quer saber a quantidade de piscinas? N\xE3o encontrei um condom\xEDnio espec\xEDfico na sua pergunta.");
  }
  const property = identifiedProperty;
  const asksCapacity = capacityIntent;
  if (property && asksCapacity) {
    const specificUnit = /\b(?:apto|apartamento|suite|su[ií]te)\s*(?:n(?:o|º)?\s*)?\d+\b/i.test(message);
    const asksForMultipleUnits = /\bapartamentos\b/.test(query) || isFollowUp && isCapacityFollowUp;
    return response(capacitySummary(property, properties, asksForMultipleUnits || !specificUnit));
  }
  if (property && hasDirectQuestionCue && /\b(quartos?|dormitorios?)\b/.test(query) && property.bedrooms > 0) {
    return response(`A ficha de ${property.title} informa ${property.bedrooms} ${property.bedrooms === 1 ? "quarto" : "quartos"}.`);
  }
  if (property && hasDirectQuestionCue && /\b(banheiros?|casas de banho)\b/.test(query) && property.bathrooms > 0) {
    return response(`A ficha de ${property.title} informa ${property.bathrooms} ${property.bathrooms === 1 ? "banheiro" : "banheiros"}.`);
  }
  if (property && hasDirectQuestionCue && /\b(camas?|leitos?)\b/.test(query) && property.beds > 0) {
    return response(`A ficha de ${property.title} informa ${property.beds} ${property.beds === 1 ? "cama" : "camas"}.`);
  }
  if (property && criteria.length) {
    if (criteria.some((criterion) => criterion.id === "beverages_allowed")) {
      const restriction = explicitBeverageRestriction(property);
      if (restriction) return response(`A descri\xE7\xE3o de ${property.complexName || property.title} informa: \u201C${restriction}\u201D.`);
    }
    const matching = criteria.filter((criterion) => matchesPropertyCategory(property, criterion.id));
    const missing = criteria.filter((criterion) => !matchesPropertyCategory(property, criterion.id));
    if (!missing.length) return response(`A ficha de ${property.complexName || property.title} confirma: ${matching.map((item) => item.label).join(", ")}.`);
    return response(`N\xE3o encontrei confirma\xE7\xE3o na ficha de ${property.complexName || property.title} para: ${missing.map((item) => item.label).join(", ")}. Os dados cadastrados confirmam apenas comodidades descritas explicitamente.`);
  }
  if (property && /\b(o que tem|o que oferece|quais atracoes|estrutura do condominio|estrutura do resort)\b/.test(query)) {
    const summary = condoSummary(property);
    return response(summary.length ? `Na descri\xE7\xE3o do condom\xEDnio ${property.complexName || property.title} constam: ${summary.join("; ")}.` : `N\xE3o encontrei uma descri\xE7\xE3o detalhada do condom\xEDnio ${property.complexName || property.title} no cat\xE1logo.`);
  }
  const questionCriteria = criteriaFor(query);
  const amenityQuestion = /\b(tem|possui|oferece|permite|permitido|permitida|aceita|funciona|funcionamento)\b/.test(query);
  if (property && amenityQuestion && questionCriteria.length) {
    if (questionCriteria.some((criterion) => criterion.id === "beverages_allowed")) {
      const restriction = explicitBeverageRestriction(property);
      if (restriction) return response(`A descri\xE7\xE3o de ${property.complexName || property.title} informa: \u201C${restriction}\u201D.`);
    }
    const missing = questionCriteria.filter((criterion) => !matchesPropertyCategory(property, criterion.id));
    if (!missing.length) return response(`A ficha de ${property.complexName || property.title} confirma: ${questionCriteria.map((item) => item.label).join(", ")}.`);
    return response(`N\xE3o encontrei confirma\xE7\xE3o na ficha de ${property.complexName || property.title} para: ${missing.map((item) => item.label).join(", ")}. N\xE3o vou presumir essa informa\xE7\xE3o sem ela estar cadastrada.`);
  }
  if (property && hasDirectQuestionCue) {
    const propertyNameWords = new Set(normalize2(`${property.title} ${property.complexName || ""}`).split(" "));
    const requestedTerms = [...new Set(query.split(" ").filter(
      (word) => word.length >= 4 && !questionFillerWords.has(word) && !propertyNameWords.has(word) && !/^\d+$/.test(word)
    ))];
    if (requestedTerms.length) {
      const sourceLines = [
        ...(property.complexDescription || "").split(/[\n.!;]+/),
        ...property.propertyAmenities || [],
        ...property.amenities || [],
        ...property.rules || [],
        ...(property.highlights || []).flatMap((item) => [item.title, item.description])
      ].map((line) => line.trim()).filter(Boolean);
      const matches = sourceLines.filter((line) => {
        const normalizedLine = normalize2(line);
        return requestedTerms.some((term) => normalizedLine.includes(term));
      }).slice(0, 2);
      if (matches.length) return response(`Na ficha de ${property.complexName || property.title} consta: ${matches.join("; ")}.`);
      return response(`N\xE3o encontrei essa informa\xE7\xE3o na ficha cadastrada de ${property.complexName || property.title}. Se quiser, pergunte sobre outro item espec\xEDfico do condom\xEDnio.`);
    }
  }
  return response("Posso buscar op\xE7\xF5es por n\xFAmero de h\xF3spedes, condom\xEDnio e comodidades cadastradas \u2014 como piscina 24h, bebidas permitidas, ingressos inclu\xEDdos ou proximidade do centro. O que \xE9 mais importante para sua estadia?", [], 0, false);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildSofiaFallback
});
