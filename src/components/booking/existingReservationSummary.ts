export interface ReservationSummary {
  code: string;
  partnerCode?: string | null;
  listingId: string | null;
  propertyDetails?: {
    images: string[];
    description: string;
    condoTitle: string;
    condoDescription: string;
    condoImages: string[];
  } | null;
  property: string | null;
  image: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guests: number | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  totalCents: number | null;
  candidateBalanceCents: number | null;
  outstandingBalanceCents?: number | null;
  balanceStatus: string;
  paymentEnabled: boolean;
  paymentMethods: string[];
  paymentPlans?: {
    full: { methods: string[]; amountCents: number | null };
    deposit: { methods: string[]; amountCents: number | null };
  };
  cardInstallments: number[];
}

export interface CompletedReservationSummary {
  code: string;
  state: 'completed';
  status?: 'booked';
  totalCents?: number;
  outstandingBalanceCents?: number;
  paidCents?: number;
}

export function isCompletedSummary(
  value: unknown,
  code: string,
): value is CompletedReservationSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    item.code !== code ||
    item.state !== 'completed' ||
    Object.keys(item).some(
      (key) =>
        !['code', 'state', 'status', 'totalCents', 'outstandingBalanceCents', 'paidCents'].includes(
          key,
        ),
    ) ||
    (item.status !== undefined && item.status !== 'booked')
  ) {
    return false;
  }

  const hasSettlementDetails =
    item.totalCents !== undefined ||
    item.outstandingBalanceCents !== undefined ||
    item.paidCents !== undefined;
  if (!hasSettlementDetails) return true;

  return (
    nullableInteger(item.totalCents) &&
    nullableInteger(item.outstandingBalanceCents) &&
    nullableInteger(item.paidCents) &&
    typeof item.totalCents === 'number' &&
    typeof item.outstandingBalanceCents === 'number' &&
    typeof item.paidCents === 'number' &&
    item.totalCents === item.outstandingBalanceCents + item.paidCents
  );
}

const nullableString = (value: unknown) => value === null || typeof value === 'string';
const nullableInteger = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
function validPlans(value: unknown, item: Record<string, unknown>): boolean {
  if (value === undefined) {
    if (item.paymentEnabled !== true) return true;
    const candidate = item.candidateBalanceCents;
    const outstanding = item.outstandingBalanceCents;
    return (
      typeof candidate === 'number' &&
      Number.isSafeInteger(candidate) &&
      candidate > 0 &&
      (item.balanceStatus === 'pending_candidate' ||
        item.balanceStatus === 'unrecorded_candidate') &&
      (outstanding === undefined ||
        outstanding === null ||
        (typeof outstanding === 'number' &&
          Number.isSafeInteger(outstanding) &&
          outstanding > 0 &&
          candidate <= outstanding))
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const plans = value as Record<string, unknown>;
  const validPlan = (plan: unknown): plan is { methods: string[]; amountCents: number | null } => {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return false;
    const entry = plan as Record<string, unknown>;
    return (
      Array.isArray(entry.methods) &&
      entry.methods.every((method) => method === 'pix' || method === 'card') &&
      new Set(entry.methods).size === entry.methods.length &&
      (entry.methods.length > 0
        ? typeof entry.amountCents === 'number' &&
          Number.isSafeInteger(entry.amountCents) &&
          entry.amountCents > 0
        : entry.amountCents === null)
    );
  };
  if (!validPlan(plans.full) || !validPlan(plans.deposit)) return false;
  const full = plans.full;
  const deposit = plans.deposit;
  if (
    !Array.isArray(item.paymentMethods) ||
    full.methods.length !== item.paymentMethods.length ||
    !full.methods.every((method, index) => method === (item.paymentMethods as unknown[])[index]) ||
    deposit.methods.some((method) => method !== 'pix')
  )
    return false;
  if (full.methods.length === 0 && deposit.methods.length === 0) return true;
  const candidate = item.candidateBalanceCents;
  const outstanding = item.outstandingBalanceCents;
  if (
    typeof candidate !== 'number' ||
    !Number.isSafeInteger(candidate) ||
    candidate <= 0 ||
    typeof outstanding !== 'number' ||
    !Number.isSafeInteger(outstanding) ||
    outstanding <= 0 ||
    candidate > outstanding
  )
    return false;
  if (full.methods.length > 0 && (full.amountCents !== candidate || candidate !== outstanding))
    return false;
  if (deposit.methods.length === 0) return true;
  const total = item.totalCents;
  return (
    (deposit.amountCents === candidate ||
      (item.balanceStatus === 'unrecorded_candidate' &&
        full.methods.length > 0 &&
        candidate === outstanding)) &&
    typeof total === 'number' &&
    Number.isSafeInteger(total) &&
    total >= 2 &&
    outstanding === total &&
    deposit.amountCents === Math.ceil(total / 2)
  );
}

function validPropertyDetails(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const validImages = (images: unknown) =>
    Array.isArray(images) &&
    images.length <= 12 &&
    images.every((image) => {
      if (typeof image !== 'string') return false;
      try {
        const url = new URL(image);
        return url.protocol === 'https:' && !url.username && !url.password;
      } catch {
        return false;
      }
    });
  return (
    validImages(item.images) &&
    validImages(item.condoImages) &&
    typeof item.description === 'string' &&
    typeof item.condoTitle === 'string' &&
    typeof item.condoDescription === 'string'
  );
}

export function isSummary(value: unknown, code: string): value is ReservationSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    item.code === code &&
    (item.partnerCode === undefined || nullableString(item.partnerCode)) &&
    nullableString(item.listingId) &&
    validPropertyDetails(item.propertyDetails) &&
    nullableString(item.property) &&
    nullableString(item.image) &&
    nullableString(item.checkIn) &&
    nullableString(item.checkOut) &&
    nullableInteger(item.guests) &&
    nullableInteger(item.adults) &&
    nullableInteger(item.children) &&
    nullableInteger(item.infants) &&
    nullableInteger(item.totalCents) &&
    nullableInteger(item.candidateBalanceCents) &&
    (item.outstandingBalanceCents === undefined || nullableInteger(item.outstandingBalanceCents)) &&
    typeof item.balanceStatus === 'string' &&
    typeof item.paymentEnabled === 'boolean' &&
    validPlans(item.paymentPlans, item) &&
    Array.isArray(item.paymentMethods) &&
    item.paymentMethods.every((method) => method === 'pix' || method === 'card') &&
    new Set(item.paymentMethods).size === item.paymentMethods.length &&
    Array.isArray(item.cardInstallments) &&
    item.cardInstallments.every((value) => Number.isInteger(value) && value >= 1 && value <= 6) &&
    new Set(item.cardInstallments).size === item.cardInstallments.length &&
    item.paymentEnabled === item.paymentMethods.length > 0 &&
    item.paymentMethods.includes('card') === item.cardInstallments.length > 0
  );
}
