import { Property, StaysConfig, StaysApiLog, StaysPriceCalculationRequest, StaysPriceCalculationResponse } from '../types';

const CONFIG_KEY = 'stays_net_config';
const LOGS_KEY = 'stays_net_api_logs';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isHighlight = (value: unknown): value is Property['highlights'][number] =>
  isRecord(value) && typeof value.icon === 'string' &&
  typeof value.title === 'string' && typeof value.description === 'string';

const isSleepingArrangement = (value: unknown): value is Property['sleepingArrangements'][number] =>
  isRecord(value) && typeof value.roomName === 'string' &&
  typeof value.bedType === 'string' && typeof value.icon === 'string';

const isReview = (value: unknown): value is Property['reviews'][number] => {
  if (!isRecord(value) || !isRecord(value.categories)) return false;
  return typeof value.id === 'string' && typeof value.authorName === 'string' &&
    isFiniteNumber(value.rating) && typeof value.date === 'string' &&
    typeof value.comment === 'string' &&
    Object.values(value.categories).every((score) => score === undefined || isFiniteNumber(score));
};

const isProperty = (value: unknown): value is Property => {
  if (!isRecord(value) || !isRecord(value.location) || !isRecord(value.host)) return false;
  const propertyType = value.propertyType;
  const calendarIsValid = value.calendar === undefined || (Array.isArray(value.calendar) && value.calendar.every((day) =>
    isRecord(day) && typeof day.date === 'string' && isFiniteNumber(day.avail) &&
    (day.price === undefined || isFiniteNumber(day.price)) &&
    (day.minStay === undefined || isFiniteNumber(day.minStay)) &&
    (day.closedToArrival === undefined || typeof day.closedToArrival === 'boolean') &&
    (day.closedToDeparture === undefined || typeof day.closedToDeparture === 'boolean')));
  return typeof value.id === 'string' && typeof value.title === 'string' &&
    typeof value.subtitle === 'string' && typeof value.description === 'string' &&
    typeof value.category === 'string' &&
    (propertyType === 'entire_place' || propertyType === 'private_room' || propertyType === 'cabin' || propertyType === 'villa') &&
    typeof value.location.city === 'string' && typeof value.location.state === 'string' &&
    typeof value.location.country === 'string' && typeof value.location.neighborhood === 'string' &&
    typeof value.location.address === 'string' && isFiniteNumber(value.location.lat) &&
    isFiniteNumber(value.location.lng) && isFiniteNumber(value.pricePerNight) &&
    isFiniteNumber(value.cleaningFee) && isFiniteNumber(value.serviceFeeRate) &&
    isFiniteNumber(value.rating) && isFiniteNumber(value.reviewCount) &&
    typeof value.isSuperhost === 'boolean' && typeof value.isGuestFavorite === 'boolean' &&
    typeof value.instantBook === 'boolean' && isStringArray(value.images) &&
    isFiniteNumber(value.bedrooms) && isFiniteNumber(value.beds) &&
    isFiniteNumber(value.bathrooms) && isFiniteNumber(value.maxGuests) &&
    isStringArray(value.amenities) && Array.isArray(value.highlights) && value.highlights.every(isHighlight) &&
    Array.isArray(value.sleepingArrangements) && value.sleepingArrangements.every(isSleepingArrangement) &&
    isStringArray(value.rules) && Array.isArray(value.reviews) && value.reviews.every(isReview) &&
    typeof value.host.name === 'string' && typeof value.host.avatar === 'string' &&
    isFiniteNumber(value.host.joinedYear) && typeof value.host.isSuperhost === 'boolean' &&
    typeof value.host.responseTime === 'string' && typeof value.host.responseRate === 'string' &&
    typeof value.host.bio === 'string' && calendarIsValid;
};

const isStaysApiLog = (value: unknown): value is StaysApiLog =>
  isRecord(value) && typeof value.id === 'string' && typeof value.timestamp === 'string' &&
  ['GET', 'POST', 'PUT', 'DELETE'].includes(String(value.method)) &&
  typeof value.endpoint === 'string' && typeof value.status === 'number' &&
  typeof value.durationMs === 'number' && typeof value.success === 'boolean';

const errorMessage = (value: unknown, fallback: string): string =>
  isRecord(value) && typeof value.message === 'string' ? value.message : fallback;

export const DEFAULT_STAYS_CONFIG: StaysConfig = {
  accountDomain: 'crcn.stays.net',
  clientId: '',
  clientSecret: '',
  environment: 'production',
  autoSyncListings: false,
  autoSyncReservations: false,
  webhookUrl: '',
  isConnected: false,
  lastSyncTimestamp: '',
};

class StaysApiService {
  private config: StaysConfig;
  private logs: StaysApiLog[] = [];

  constructor() {
    this.config = this.loadConfig();
    this.logs = this.loadLogs();
  }

  public getConfig(): StaysConfig {
    return { ...this.config };
  }

  public saveConfig(newConfig: Partial<StaysConfig>): StaysConfig {
    this.config = { ...this.config, ...newConfig, clientId: '', clientSecret: '', webhookUrl: '', isConnected: false };
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to save Stays config:', e);
    }
    return { ...this.config };
  }

  private loadConfig(): StaysConfig {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isRecord(parsed)) {
          return {
            ...DEFAULT_STAYS_CONFIG,
            accountDomain: typeof parsed.accountDomain === 'string' ? parsed.accountDomain : DEFAULT_STAYS_CONFIG.accountDomain,
            environment: parsed.environment === 'sandbox' ? 'sandbox' : 'production',
            autoSyncListings: parsed.autoSyncListings === true,
            autoSyncReservations: parsed.autoSyncReservations === true,
            lastSyncTimestamp: typeof parsed.lastSyncTimestamp === 'string' ? parsed.lastSyncTimestamp : null,
          };
        }
      }
    } catch (e) {
      console.warn('Error loading Stays config from localStorage:', e);
    }
    return DEFAULT_STAYS_CONFIG;
  }

  private loadLogs(): StaysApiLog[] {
    try {
      const saved = localStorage.getItem(LOGS_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.filter(isStaysApiLog).slice(0, 50) : [];
      }
    } catch (e) {
      // ignore
    }
    return [];
  }

  public getLogs(): StaysApiLog[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    try {
      localStorage.removeItem(LOGS_KEY);
    } catch (e) {
      // ignore
    }
  }

  private recordLog(log: Omit<StaysApiLog, 'id' | 'timestamp'>) {
    const entry: StaysApiLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      ...log,
    };
    this.logs = [entry, ...this.logs.slice(0, 49)];
    try {
      localStorage.setItem(LOGS_KEY, JSON.stringify(this.logs));
    } catch (e) {
      // ignore
    }
  }

  public getBaseUrl(): string {
    const domain = this.config.accountDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (this.config.environment === 'sandbox') {
      return 'https://play.stays.net/external/v1';
    }
    return `https://${domain || 'crcn.stays.net'}/external/v1`;
  }

  public getAuthHeader(): string {
    return '[credenciais somente no servidor]';
  }

  /**
   * Test connection to Stays.net External API
   */
  public async testConnection(customConfig?: Partial<StaysConfig>): Promise<{
    success: boolean;
    latencyMs: number;
    message: string;
    accountInfo?: {
      companyName: string;
      tier: string;
      version: string;
      activeListings: number;
    };
  }> {
    const targetConfig = { ...this.config, ...customConfig, clientId: '', clientSecret: '' };
    const startTime = Date.now();

    const response = await fetch('/api/stays/status');
    const status: unknown = await response.json();
    const latencyMs = Date.now() - startTime;
    if (!response.ok || !isRecord(status) || status.connected !== true) {
      this.saveConfig({ ...targetConfig, isConnected: false });
      return {
        success: false,
        latencyMs,
        message: errorMessage(status, 'Não foi possível validar a conexão real com Stays.net.'),
      };
    }

    this.saveConfig({ ...targetConfig, isConnected: true, lastSyncTimestamp: new Date().toISOString() });
    return {
      success: true,
      latencyMs,
      message: 'Conexão autenticada com Stays.net confirmada pelo backend.',
      accountInfo: {
        companyName: targetConfig.accountDomain,
        tier: 'Stays External API',
        version: 'v1',
        activeListings: typeof status.totalProperties === 'number' && Number.isFinite(status.totalProperties)
          ? status.totalProperties : 0,
      },
    };
  }

  /**
   * Calculate price and fees for reservation via Stays.net API
   * POST /external/v1/booking/calculate-price
   */
  public async calculatePrice(params: StaysPriceCalculationRequest, baseDailyRate: number): Promise<StaysPriceCalculationResponse> {
    void baseDailyRate;
    const response = await fetch('/api/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingIds: [params.listingId],
        from: params.checkInDate,
        to: params.checkOutDate,
        guests: (Number(params.guests.adults) || 0) + (Number(params.guests.children) || 0) + (Number(params.guests.infants) || 0),
      }),
    });
    const quote: unknown = await response.json();
    if (!response.ok || !isRecord(quote) || quote.source !== 'stays-live') {
      throw new Error(errorMessage(quote, 'Cotação oficial da Stays indisponível.'));
    }

    if (typeof quote.currency !== 'string' || typeof quote.nights !== 'number' ||
      typeof quote.dailyRate !== 'number' || typeof quote.baseTotal !== 'number' ||
      typeof quote.discount !== 'number' || typeof quote.total !== 'number' ||
      ![quote.nights, quote.dailyRate, quote.baseTotal, quote.discount, quote.total].every(Number.isFinite) ||
      quote.nights < 1 || quote.dailyRate <= 0 || quote.total <= 0) {
      throw new Error('A cotação oficial da Stays retornou dados inválidos.');
    }

    const fees = Array.isArray(quote.fees) ? quote.fees : [];

    return {
      available: true,
      currency: quote.currency,
      nights: quote.nights,
      dailyPriceAverage: quote.dailyRate,
      subtotal: quote.baseTotal,
      fees: fees.filter(isRecord).map((fee) => {
        const title = isRecord(fee._mstitle) && typeof fee._mstitle.pt_BR === 'string' ? fee._mstitle.pt_BR : '';
        const internalName = typeof fee.internalName === 'string' ? fee.internalName : '';
        const amount = isRecord(fee._mcval) && typeof fee._mcval.BRL === 'number' && Number.isFinite(fee._mcval.BRL)
          ? fee._mcval.BRL : 0;
        return {
          type: /clean|limpez/i.test(`${internalName} ${title}`) ? 'cleaning' : 'other',
          amount,
          name: title || internalName || 'Taxa incluída',
        };
      }),
      discount: quote.discount,
      total: quote.total,
    };
  }

  /**
   * Sync and fetch all listings from Stays.net PMS
   * GET /external/v1/content/listings
   */
  public async fetchListings(): Promise<{
    success: boolean;
    listings: Property[];
    syncedAt: string;
    total: number;
    source: string;
  }> {
    const startTime = Date.now();
    try {
      const response = await fetch('/api/accommodations');
      const json: unknown = await response.json();
      if (!response.ok || !isRecord(json) || !Array.isArray(json.data) || !json.data.every(isProperty)) {
        throw new Error(errorMessage(json, 'O catálogo de acomodações retornou dados inválidos.'));
      }
      const listings: Property[] = json.data;
      const source = typeof json.source === 'string' ? json.source : 'unknown';
      const live = source === 'stays-live' && listings.length > 0;
      const syncedAt = new Date().toISOString();

      if (live) {
        localStorage.setItem('hospeda_properties', JSON.stringify(listings));
        localStorage.setItem('hospeda_properties_source', 'stays-live');
      }

      this.saveConfig({ lastSyncTimestamp: live ? syncedAt : this.config.lastSyncTimestamp, isConnected: live });
      this.recordLog({
        method: 'GET',
        endpoint: '/api/accommodations',
        status: response.status,
        durationMs: Date.now() - startTime,
        responseBody: { count: listings.length, source },
        success: live,
      });

      return { success: live, listings, syncedAt, total: listings.length, source };
    } catch (error) {
      this.recordLog({
        method: 'GET',
        endpoint: '/api/accommodations',
        status: 0,
        durationMs: Date.now() - startTime,
        success: false,
        responseBody: { message: error instanceof Error ? error.message : 'Request failed' },
      });
      throw error;
    }
  }

}

export const staysApi = new StaysApiService();
