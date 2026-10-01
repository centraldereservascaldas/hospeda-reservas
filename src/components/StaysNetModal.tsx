import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ExternalLink, 
  Key, 
  Server, 
  Globe, 
  Terminal, 
  ShieldCheck, 
  Layers, 
  Zap, 
  Code2, 
  Copy, 
  Check, 
  Play,
  Database,
  Sliders,
  Send,
  Sparkles
} from 'lucide-react';
import { staysApi } from '../services/staysApi';
import { crcnBackendApi } from '../services/crcnBackendApi';
import { StaysConfig, StaysApiLog, Property } from '../types';
import { StaysSearchWidget } from './StaysSearchWidget';

interface StaysNetModalProps {
  isOpen: boolean;
  onClose: () => void;
  properties: Property[];
  onSyncProperties?: (pulledListings: Property[]) => void;
  onShowToast: (msg: string) => void;
}

export const StaysNetModal: React.FC<StaysNetModalProps> = ({
  isOpen,
  onClose,
  properties,
  onSyncProperties,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'sync' | 'explorer' | 'widget' | 'logs'>('widget');
  const [config, setConfig] = useState<StaysConfig>(staysApi.getConfig());
  const [isTesting, setIsTesting] = useState(false);
  const [copiedWidgetHtml, setCopiedWidgetHtml] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    message: string;
    accountInfo?: any;
  } | null>(null);

  // Endpoint Explorer state
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('calculate_price');
  const [isExecutingApi, setIsExecutingApi] = useState(false);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState<number | null>(null);

  // Logs state
  const [logs, setLogs] = useState<StaysApiLog[]>(staysApi.getLogs());

  if (!isOpen) return null;

  const handleSaveConfig = () => {
    staysApi.saveConfig({ ...config, clientId: '', clientSecret: '', isConnected: false });
    onShowToast('Configurações da Stays.net API salvas com sucesso!');
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await staysApi.testConnection();
      setTestResult(res);
      setConfig((prev) => ({ ...prev, clientId: '', clientSecret: '', isConnected: res.success, lastSyncTimestamp: res.success ? new Date().toISOString() : prev.lastSyncTimestamp }));
      if (res.success) {
        setConfig((prev) => ({ ...prev, isConnected: true, lastSyncTimestamp: new Date().toISOString() }));
        onShowToast('Conexão com Stays.net bem-sucedida!');
      } else {
        onShowToast('Erro ao conectar com Stays.net');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: err?.message || 'Falha na comunicação com a API Stays.net',
      });
    } finally {
      setIsTesting(false);
      setLogs(staysApi.getLogs());
    }
  };

  const handleSyncListings = async () => {
    setIsSyncing(true);
    try {
      const res = await staysApi.fetchListings();
      if (res.success && res.listings) {
        setSyncCount(res.listings.length);
        if (onSyncProperties) onSyncProperties(res.listings);
        onShowToast(`🎉 ${res.listings.length} apartamentos puxados com sucesso da Stays.net!`);
      }
    } catch {
      onShowToast('Erro ao puxar apartamentos da Stays.net.');
    } finally {
      setIsSyncing(false);
      setLogs(staysApi.getLogs());
    }
  };

  // Endpoint definitions for the explorer
  const ENDPOINTS = [
    {
      id: 'calculate_price',
      method: 'POST',
      path: '/external/v1/booking/calculate-price',
      title: 'Calcular Cotação e Taxas',
      desc: 'Calcula o valor da reserva com diárias dinâmicas, taxas de limpeza e descontos no Stays PMS.',
      sampleBody: {
        listingId: 'LH20J',
        checkInDate: '2026-11-19',
        checkOutDate: '2026-11-21',
        guests: { adults: 2, children: 0, infants: 0 },
      },
    },
    {
      id: 'get_listings',
      method: 'GET',
      path: '/external/v1/content/listings?limit=10&status=active',
      title: 'Listar Imóveis Ativos',
      desc: 'Retorna a lista de acomodações cadastradas na Central de Reservas Caldas Novas no Stays.',
      sampleBody: null,
    },
    {
      id: 'calendar_availability',
      method: 'GET',
      path: '/external/v1/calendar/listing/LH20J?from=2026-11-19&to=2026-11-21',
      title: 'Disponibilidade e Calendário',
      desc: 'Consulta o calendário de diárias, bloqueios e estadia mínima de um imóvel.',
      sampleBody: null,
    },
    {
      id: 'book_request',
      method: 'POST',
      path: '/external/v1/book-request',
      title: 'Iniciar Checkout / Book Request',
      desc: 'Inicia um checkout real na Stays; a execução está desativada neste explorador para evitar criar uma sessão de hóspede de teste.',
      sampleBody: {
        aptid: 'LH20J',
        from: '2026-11-19',
        to: '2026-11-21',
        persons: 2,
        client: { email: 'hospede@example.com', fName: 'Nome', lName: 'Sobrenome' },
      },
    },
  ];

  const currentEndpointDef = ENDPOINTS.find((e) => e.id === selectedEndpoint) || ENDPOINTS[0];

  const handleExecuteApi = async () => {
    setIsExecutingApi(true);
    setApiResponse(null);
    setApiLatency(null);
    const start = Date.now();

    try {
      if (selectedEndpoint === 'calculate_price') {
        const res = await staysApi.calculatePrice(currentEndpointDef.sampleBody as any, 780);
        setApiResponse(res);
      } else if (selectedEndpoint === 'get_listings') {
        const response = await fetch('/api/accommodations');
        const json = await response.json();
        if (!response.ok || json.source !== 'stays-live') throw new Error('Não foi possível carregar anúncios ao vivo da Stays.');
        setApiResponse({ total: json.count, results: json.data });
      } else if (selectedEndpoint === 'calendar_availability') {
        const calendar = await crcnBackendApi.getAccommodationCalendar('LH20J', '2026-11-19', '2026-11-21');
        setApiResponse({ listingId: 'LH20J', calendar });
      } else {
        throw new Error('O book-request inicia um checkout real na Stays e não será fingido pelo painel de teste. Use a cotação e o botão de reserva da acomodação.');
      }
      setApiLatency(Date.now() - start);
    } catch (err: any) {
      setApiResponse({ error: true, message: err?.message || 'Falha ao executar chamada' });
    } finally {
      setIsExecutingApi(false);
      setLogs(staysApi.getLogs());
    }
  };

  const getCurlSnippet = () => {
    const url = `${staysApi.getBaseUrl()}${currentEndpointDef.path}`;
    return `# Autenticação protegida no backend.\nEndpoint Stays: ${currentEndpointDef.method} ${url}`;
  };
  const handleCopyCurl = () => {
    navigator.clipboard?.writeText(getCurlSnippet());
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-neutral-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl border border-neutral-200/90 shadow-2xl overflow-hidden">
        
        {/* Header with Crisp Glass and Stays.net Branding */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-orange-200/80 bg-gradient-to-r from-orange-50 via-amber-50/60 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/30 border border-white/50">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-neutral-950 tracking-tight">
                  Integração Stays.net External API
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                  config.isConnected 
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' 
                    : 'bg-amber-50 text-amber-800 border border-amber-300'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${config.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  {config.isConnected ? 'Conectado' : 'Aguardando Teste'}
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 text-[10px] font-bold">
                  {config.environment === 'sandbox' ? 'Playground / Sandbox' : 'Produção'}
                </span>
              </div>
              <p className="text-xs text-neutral-600 font-medium">
                Sincronização em tempo real de acomodações, tarifas e reservas com o PMS da Central de Reservas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://stays.net/external-api/#introduction"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-orange-700 hover:text-orange-800 bg-orange-100 hover:bg-orange-200/80 rounded-full border border-orange-200 transition-colors"
            >
              <span>Doc Oficial</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-950 border border-neutral-200 flex items-center justify-center transition-all cursor-pointer shadow-xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-neutral-200 bg-neutral-50/90 backdrop-blur-md overflow-x-auto">
          {[
            { id: 'widget', label: 'Motor de Reserva (Widget)', icon: Globe },
            { id: 'sync', label: `Apartamentos Stays (${properties.length})`, icon: RefreshCw },
            { id: 'explorer', label: 'Explorador da API', icon: Terminal },
            { id: 'overview', label: 'Conexão & Credenciais', icon: Key },
            { id: 'logs', label: `Logs (${logs.length})`, icon: Code2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-b-2 whitespace-nowrap ${
                  isActive
                    ? 'border-orange-500 text-orange-600 bg-white/80 shadow-xs'
                    : 'border-transparent text-neutral-500 hover:text-neutral-900 hover:bg-white/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-orange-600' : 'text-neutral-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: OVERVIEW & CREDENTIALS */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in">
              {/* Architecture Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent border border-orange-200/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-orange-600" />
                    <h3 className="text-sm font-bold text-neutral-900">
                      Integração Stays.net External API v1 Ativa
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-600 max-w-xl leading-relaxed">
                    O backend consulta imóveis, disponibilidade e preços oficiais da Stays.net. A confirmação e o pagamento da reserva são concluídos no checkout hospedado pela Stays; este painel não cria reservas nem emite vouchers.
                  </p>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs shadow-md shadow-orange-500/25 border border-white/40 transition-all cursor-pointer hover:scale-105 disabled:opacity-50 flex-shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Testando Conexão...' : 'Testar Conexão Agora'}</span>
                </button>
              </div>

              {/* Handshake Result Alert */}
              {testResult && (
                <div className={`p-4 rounded-2xl border flex items-start gap-3 animate-in zoom-in-95 ${
                  testResult.success
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50/80 border-rose-200 text-rose-800'
                }`}>
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 text-xs">
                    <p className="font-bold">{testResult.message}</p>
                    {testResult.success && (
                      <p className="text-emerald-700/80">
                        Latência da API: <span className="font-mono font-bold">{testResult.latencyMs}ms</span> • Endpoint validado: <code className="font-mono font-bold">{staysApi.getBaseUrl()}</code>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Credentials Form */}
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/80 p-5 shadow-xs space-y-4">
                <h4 className="text-xs font-black text-neutral-800 uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 text-orange-500" />
                  Credenciais de Autenticação Stays.net
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                      Domínio da Conta Stays (Account Subdomain)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={config.accountDomain}
                        onChange={(e) => setConfig({ ...config, accountDomain: e.target.value })}
                        placeholder="centraldereservascn.stays.net"
                        className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50/90 border border-neutral-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none font-mono"
                      />
                      <Globe className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-2.5" />
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-1">Conta definida por STAYS_BASE_URL no ambiente do servidor.</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                      Ambiente da API
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, environment: 'sandbox' })}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          config.environment === 'sandbox'
                            ? 'bg-orange-50 border-orange-400 text-orange-700 shadow-xs'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        🧪 Sandbox (Playground)
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, environment: 'production' })}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          config.environment === 'production'
                            ? 'bg-orange-50 border-orange-400 text-orange-700 shadow-xs'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        🚀 Produção
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                      Client ID (API Key)
                    </label>
                    <input
                      type="text"
                      value=""
                      readOnly
                      placeholder="Configurado no servidor (.env)"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50/90 border border-neutral-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                      Client Secret (Chave Secreta)
                    </label>
                    <input
                      type="password"
                      value=""
                      readOnly
                      placeholder="Configurado no servidor (.env)"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-50/90 border border-neutral-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2">
                    <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                      Webhook Stays
                    </label>
                    <p className="text-[10px] text-neutral-500 mt-1">
                      A sincronização de reservas não está habilitada. Configure a URL pública e a validação criptográfica após receber da Stays os dados de ativação e a chave pública.
                    </p>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    onClick={handleSaveConfig}
                    className="px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    Salvar Configurações
                  </button>
                </div>
              </div>

              {/* Supported API Capabilities */}
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/80 p-5 shadow-xs">
                <h4 className="text-xs font-black text-neutral-800 uppercase tracking-wider mb-3">
                  Módulos e Recursos Suportados
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-1">
                    <p className="font-bold text-neutral-900">🏨 Imóveis & Fotos</p>
                    <p className="text-neutral-500 text-[11px]">Consulta do catálogo de imóveis, comodidades, regras e fotos retornados pela API.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-1">
                    <p className="font-bold text-neutral-900">📅 Calendário & Bloqueios</p>
                    <p className="text-neutral-500 text-[11px]">Disponibilidade e preço são revalidados pela Stays ao solicitar o checkout; a confirmação final ocorre na plataforma.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-1">
                    <p className="font-bold text-neutral-900">🎟️ Reservas & Checkout</p>
                    <p className="text-neutral-500 text-[11px]">Redirecionamento para checkout seguro hospedado pela Stays. Este painel não cria reservas nem emite vouchers.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROPERTIES SYNC */}
          {activeTab === 'sync' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="p-5 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-white/90 backdrop-blur-xl border border-orange-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-sm font-black text-neutral-900">
                      Puxar Apartamentos da Stays.net PMS
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-600 max-w-xl">
                    Importa instantaneamente todos os flats, apartamentos termais, tarifas dinâmicas, fotos e regras de hospedagem diretamente da conta Stays (<code className="font-mono font-bold text-orange-600">{config.accountDomain}</code>) para o feed da Central de Reservas.
                  </p>
                  <p className="text-[11px] text-neutral-500 pt-1">
                    Última sincronização: <span className="font-bold text-neutral-800">{config.lastSyncTimestamp ? new Date(config.lastSyncTimestamp).toLocaleString('pt-BR') : 'Nunca'}</span>
                    {' • '}Endpoint: <code className="font-mono text-neutral-700 font-bold">GET /external/v1/content/listings</code>
                  </p>
                </div>
                <button
                  onClick={handleSyncListings}
                  disabled={isSyncing}
                  className="flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs shadow-lg shadow-orange-500/30 transition-all cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-50 flex-shrink-0"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Puxando da Stays...' : '📥 Puxar Apartamentos da Stays Agora'}</span>
                </button>
              </div>

              {/* Mapped Properties Table */}
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/80 overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 border-b border-neutral-100 flex items-center justify-between bg-white/50">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-black text-neutral-800 uppercase tracking-wider">
                      Apartamentos Cadastrados na Stays.net ({properties.length})
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[10px] font-extrabold">
                      Central de Reservas Caldas Novas
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Sincronizados com PMS
                  </span>
                </div>

                <div className="divide-y divide-neutral-100 max-h-96 overflow-y-auto">
                  {properties.map((prop) => (
                    <div key={prop.id} className="p-3.5 hover:bg-orange-50/40 flex items-center justify-between gap-4 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={prop.images[0]}
                          alt={prop.title}
                          className="w-12 h-12 rounded-xl object-cover border border-neutral-200/80 flex-shrink-0 shadow-2xs"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-neutral-900 truncate">{prop.title}</p>
                          <p className="text-[11px] text-neutral-500 truncate">{prop.subtitle} • {prop.location.neighborhood}</p>
                          <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-0.5">
                            <span className="font-mono bg-orange-50 border border-orange-200/80 px-1.5 py-0.5 rounded text-orange-700 font-bold">
                              ID: {prop.staysListingId || prop.id}
                            </span>
                            <span>•</span>
                            <span className="text-neutral-700 font-semibold">Diária: R$ {prop.pricePerNight}</span>
                            <span>•</span>
                            <span>{prop.maxGuests} hóspedes</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Ativo no PMS
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: API EXPLORER & SWAGGER TESTER */}
          {activeTab === 'explorer' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Explorador de Endpoints Stays.net (API Playground)
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Teste em tempo real os métodos do Stays.net External API diretamente do seu navegador.
                  </p>
                </div>

                <button
                  onClick={handleCopyCurl}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition-all cursor-pointer"
                >
                  {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCurl ? 'cURL Copiado!' : 'Copiar cURL'}</span>
                </button>
              </div>

              {/* Endpoint Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {ENDPOINTS.map((endpoint) => {
                  const isSelected = selectedEndpoint === endpoint.id;
                  return (
                    <button
                      key={endpoint.id}
                      onClick={() => {
                        setSelectedEndpoint(endpoint.id);
                        setApiResponse(null);
                      }}
                      className={`text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-orange-50/90 border-orange-400 shadow-xs'
                          : 'bg-white/70 border-neutral-200/80 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          endpoint.method === 'GET' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {endpoint.method}
                        </span>
                        <span className="text-xs font-bold text-neutral-900 truncate">
                          {endpoint.title}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 line-clamp-1">{endpoint.desc}</p>
                    </button>
                  );
                })}
              </div>

              {/* Active Endpoint Details */}
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/80 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2 overflow-x-auto font-mono text-xs text-neutral-800">
                    <span className="font-extrabold text-orange-600">{currentEndpointDef.method}</span>
                    <span className="text-neutral-400">{staysApi.getBaseUrl()}</span>
                    <span className="font-bold text-neutral-900">{currentEndpointDef.path}</span>
                  </div>

                  <button
                    onClick={handleExecuteApi}
                    disabled={isExecutingApi}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs shadow-md shadow-orange-500/25 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Play className={`w-3.5 h-3.5 fill-white ${isExecutingApi ? 'animate-spin' : ''}`} />
                    <span>{isExecutingApi ? 'Chamando Stays API...' : 'Executar Chamada'}</span>
                  </button>
                </div>

                {/* Request Payload */}
                {currentEndpointDef.sampleBody && (
                  <div>
                    <p className="text-[11px] font-bold text-neutral-600 mb-1.5">Corpo da Requisição (Request Payload):</p>
                    <pre className="p-3 rounded-xl bg-neutral-900 text-neutral-100 font-mono text-[11px] overflow-x-auto max-h-48 border border-neutral-800">
                      {JSON.stringify(currentEndpointDef.sampleBody, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Response Payload */}
                {apiResponse && (
                  <div className="animate-in fade-in space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-neutral-700 flex items-center gap-2">
                        <span>Resposta da Stays.net API</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${apiResponse.error ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {apiResponse.error ? 'Falha / não executada' : 'Resposta recebida'}
                        </span>
                      </p>
                      {apiLatency && (
                        <span className="text-[11px] font-mono text-neutral-500">
                          Tempo: <span className="font-bold text-neutral-800">{apiLatency}ms</span>
                        </span>
                      )}
                    </div>
                    <pre className="p-3.5 rounded-xl bg-neutral-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-72 border border-neutral-800 shadow-inner">
                      {JSON.stringify(apiResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: MOTOR DE RESERVA WIDGET */}
          {activeTab === 'widget' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-neutral-900">
                      Motor de Reservas Stays.net (Widget Oficial)
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                      Ativo no App
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500">
                    O widget gerado via stays.net para a Central de Reservas Caldas Novas foi integrado com suporte duplo: pesquisa no catálogo local e envio direto ao portal oficial.
                  </p>
                </div>

                <a
                  href="https://www.centraldereservascaldas.com.br/pt/search"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold transition-all border border-orange-200/80"
                >
                  <span>Abrir centraldereservascaldas.com.br</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Live Interactive Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-neutral-700">
                  <span>Prévia Interativa do Motor de Busca:</span>
                  <span className="text-[11px] text-neutral-400 font-normal">
                    Experimente alternar datas e hóspedes
                  </span>
                </div>
                <StaysSearchWidget
                  variant="hero"
                  onSearchInApp={(params) => {
                    onShowToast(`Pesquisa Stays: ${params.checkIn} a ${params.checkOut} para ${params.persons} hóspedes`);
                    onClose();
                  }}
                />
              </div>

              {/* Technical Specifications & Code Embed */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-900 text-neutral-100 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold text-white">Código HTML do Widget (stays.net)</span>
                  </div>
                  <button
                    onClick={() => {
                      const code = `<!--
###########
Widget generated via stays.net
You are free to change its formating and layout to your needs
###########
This widget does not update automaticaly once its Iframe was generated,
you will need to setup a new one if content changes
###########
-->
<div class="container-fluid">
\t<form role="search" id="widgetStaysSearchForm" action="https://www.centraldereservascaldas.com.br/pt/search">
\t\t<input type="hidden" name="wpl" value="">
\t\t<div class="row">
\t\t\t<!--Arrival-->
\t\t\t<div class="col-sm col-md col-lg">
\t\t\t\t<div class="input-group date" id="from">
\t\t\t\t\t<div class="input-group-prepend">
\t\t\t\t\t\t<span class="input-group-text"><i class="fa fa-calendar" aria-hidden="true"></i></span>
\t\t\t\t\t</div>
\t\t\t\t\t<input class="form-control form-control-lg" placeholder="Check-in" type="text" autocomplete="off" required>
\t\t\t\t</div>
\t\t\t\t<input name="from" value="" type="hidden">
\t\t\t</div>
\t\t\t<!--Departure-->
\t\t\t<div class="col-sm col-md col-lg">
\t\t\t\t<div class="input-group date" id="to">
\t\t\t\t\t<div class="input-group-prepend">
\t\t\t\t\t\t<span class="input-group-text"><i class="fa fa-calendar" aria-hidden="true"></i></span>
\t\t\t\t\t</div>
\t\t\t\t\t<input class="form-control form-control-lg" placeholder="Checkout" type="text" autocomplete="off" required>
\t\t\t\t</div>
\t\t\t\t<input name="to" value="" type="hidden">
\t\t\t</div>
\t\t\t<!--Guest Count-->
\t\t\t<div class="col-sm col-md col-lg">
\t\t\t\t<div class="input-group">
\t\t\t\t\t<div class="input-group-prepend">
\t\t\t\t\t\t<span class="input-group-text"><i class="fa fa-users" aria-hidden="true"></i></span>
\t\t\t\t\t</div>
\t\t\t\t\t<select class="form-control form-control-lg" name="persons" required>
\t\t\t\t\t\t<option value="" class="text-muted">Hóspedes</option>
\t\t\t\t\t\t<option value="1">1 Pessoa</option>
\t\t\t\t\t\t<option value="2">2 Pessoas</option>
\t\t\t\t\t\t<option value="3">3 Pessoas</option>
\t\t\t\t\t\t<option value="4">4 Pessoas</option>
\t\t\t\t\t\t<option value="5">5 Pessoas</option>
\t\t\t\t\t\t<option value="6">6 Pessoas</option>
\t\t\t\t\t\t<option value="7">7 Pessoas</option>
\t\t\t\t\t\t<option value="8">8 Pessoas</option>
\t\t\t\t\t\t<option value="9">9 Pessoas</option>
\t\t\t\t\t\t<option value="10">10 Pessoas</option>
\t\t\t\t\t\t<option value="11">11 Pessoas</option>
\t\t\t\t\t\t<option value="12">12 Pessoas</option>
\t\t\t\t\t\t<option value="13">13 Pessoas</option>
\t\t\t\t\t\t<option value="14">14 Pessoas</option>
\t\t\t\t\t\t<option value="15">15 Pessoas</option>
\t\t\t\t\t\t<option value="16">16 Pessoas</option>
\t\t\t\t\t\t<option value="17">17 Pessoas</option>
\t\t\t\t\t</select>
\t\t\t\t</div>
\t\t\t</div>
\t\t\t<!--Submit Button-->
\t\t\t<div class="col-sm col-md col-lg">
\t\t\t\t<button class="btn btn-info btn-lg btn-block" type="submit">
\t\t\t\t\t<span class="fa fa-search"></span>
\t\t\t\t\tPesquisar
\t\t\t\t</button>
\t\t\t</div>
\t\t</div>
\t</form>
</div>`;
                      navigator.clipboard.writeText(code);
                      setCopiedWidgetHtml(true);
                      onShowToast('Código HTML copiado com sucesso!');
                      setTimeout(() => setCopiedWidgetHtml(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 transition-all cursor-pointer"
                  >
                    {copiedWidgetHtml ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Copiar HTML</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="font-mono text-[11px] leading-relaxed text-neutral-300 bg-black/50 p-3.5 rounded-xl overflow-x-auto max-h-52 border border-neutral-800/80">
                  <pre>{`<!-- Form Action -->
action="https://www.centraldereservascaldas.com.br/pt/search"

<!-- Campos Mapeados -->
• from    : Data de Check-in (DD/MM/YYYY)
• to      : Data de Checkout (DD/MM/YYYY)
• persons : Quantidade de hóspedes (1 a 17)
• wpl     : Token de posicionamento do widget Stays`}</pre>
                </div>
              </div>

              {/* Key Features Integrated */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-white border border-neutral-200/80 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
                    <span className="text-orange-500">1.</span>
                    <span>No Hero da Página</span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Posicionado no topo da tela de exploração para conversão máxima logo no primeiro contato.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white border border-neutral-200/80 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
                    <span className="text-orange-500">2.</span>
                    <span>No Modal de Busca</span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Acessível ao clicar na barra de busca do cabeçalho com aba dedicada "Motor Stays.net".
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white border border-neutral-200/80 space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
                    <span className="text-orange-500">3.</span>
                    <span>Redirecionamento Oficial</span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Submete os parâmetros diretamente ao portal centraldereservascaldas.com.br/pt/search.
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: REALTIME LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Registro de Chamadas HTTP (Stays.net Logs)
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Todas as transações entre a Central de Reservas e a Stays.net External API
                  </p>
                </div>
                <button
                  onClick={() => {
                    staysApi.clearLogs();
                    setLogs([]);
                    onShowToast('Logs limpos com sucesso.');
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-all cursor-pointer"
                >
                  Limpar Logs
                </button>
              </div>

              {logs.length === 0 ? (
                <div className="p-8 text-center bg-white/60 rounded-2xl border border-white/80">
                  <Code2 className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-neutral-600">Nenhum log registrado ainda.</p>
                  <p className="text-[11px] text-neutral-400 mt-1">Execute uma chamada no Explorador ou faça uma reserva teste.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl bg-white/80 backdrop-blur-md border border-neutral-200/80 text-xs font-mono space-y-1.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            log.method === 'GET' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {log.method}
                          </span>
                          <span className="font-bold text-neutral-900">{log.endpoint}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                          <span>{log.durationMs}ms</span>
                          <span>•</span>
                          <span>{log.timestamp}</span>
                          <span className={`px-1.5 py-0.5 rounded font-bold ${
                            log.status >= 200 && log.status < 300
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {log.status}
                          </span>
                        </div>
                      </div>
                      {log.responseBody && (
                        <div className="p-2 bg-neutral-900 text-neutral-200 rounded-lg text-[10px] overflow-x-auto max-h-24">
                          {JSON.stringify(log.responseBody, null, 2)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-neutral-50/90 border-t border-neutral-200/60 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Conexão Segura com Stays.net Open API • Central de Reservas Caldas Novas</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-neutral-900 text-white font-bold text-xs hover:bg-neutral-800 cursor-pointer transition-all"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
