import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Heart,
  House,
  LoaderCircle,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { FormField } from './FormField';
import { InlineNotice } from './InlineNotice';
import { StatusBadge } from './StatusBadge';
import { InstallmentPicker } from './booking/InstallmentPicker';

type CatalogDomain = {
  name: string;
  description: string;
  components: {
    name: string;
    file: string;
    purpose: string;
    status?: 'observed' | 'proposed' | 'implemented' | 'validated' | 'deprecated';
  }[];
};

const catalogDomains: CatalogDomain[] = [
  {
    name: 'Primitivas compartilhadas',
    description: 'Controles e estados comuns adotados em mais de um domínio.',
    components: [
      {
        name: 'Botão',
        file: 'components/Button.tsx',
        purpose: 'Ações por botão com variantes, tamanho e feedback de carregamento.',
        status: 'implemented',
      },
      {
        name: 'Campo de formulário',
        file: 'components/FormField.tsx',
        purpose:
          'Rótulo, obrigatoriedade, ajuda e erro associados a controles nativos de conta e checkout.',
        status: 'implemented',
      },
      {
        name: 'Aviso de estado',
        file: 'components/InlineNotice.tsx',
        purpose: 'Feedback inline com semântica e variantes de estado.',
        status: 'implemented',
      },
      {
        name: 'Badge de status',
        file: 'components/StatusBadge.tsx',
        purpose:
          'Rótulos compactos de status, reutilizados nas reservas do usuário e do proprietário.',
        status: 'implemented',
      },
      {
        name: 'Estado vazio',
        file: 'components/EmptyState.tsx',
        purpose: 'Orientação quando uma lista ou área não tem conteúdo para mostrar.',
        status: 'implemented',
      },
    ],
  },
  {
    name: 'Estrutura e navegação',
    description: 'Pontos de entrada, orientação entre áreas e elementos persistentes.',
    components: [
      {
        name: 'Cabeçalho',
        file: 'components/Header.tsx',
        purpose: 'Marca, busca, conta e navegação principal.',
      },
      {
        name: 'Navegação mobile',
        file: 'components/MobileBottomNavigation.tsx',
        purpose: 'Acesso às áreas principais em telas estreitas.',
      },
      {
        name: 'Rodapé',
        file: 'components/AppFooter.tsx',
        purpose: 'Links institucionais, preferências e acesso do anfitrião.',
      },
      {
        name: 'Logo CRCN',
        file: 'components/LogoCRCN.tsx',
        purpose: 'Assinatura visual da marca.',
      },
      {
        name: 'Roteador de conteúdo',
        file: 'components/MainContentRouter.tsx',
        purpose: 'Composição das áreas principais do produto.',
      },
    ],
  },
  {
    name: 'Busca e descoberta',
    description: 'Exploração, refinamento da busca, filtros e estados do catálogo.',
    components: [
      {
        name: 'Barra de categorias',
        file: 'components/search/CategoryBar.tsx',
        purpose: 'Categorias e entrada para filtros.',
      },
      {
        name: 'Modal de busca',
        file: 'components/search/SearchModal.tsx',
        purpose: 'Destino, datas e hóspedes.',
      },
      {
        name: 'Widget Stays',
        file: 'components/search/StaysSearchWidget.tsx',
        purpose: 'Busca em destaque e refinamento da consulta.',
      },
      {
        name: 'Modal de filtros',
        file: 'components/search/FilterModal.tsx',
        purpose: 'Critérios avançados para o catálogo.',
      },
      {
        name: 'Filtros ativos',
        file: 'components/search/ActiveSearchFilters.tsx',
        purpose: 'Resumo e remoção de critérios selecionados.',
      },
      {
        name: 'Calendário de busca',
        file: 'components/search/SearchDateCalendar.tsx',
        purpose: 'Seleção de datas na jornada de busca.',
      },
      {
        name: 'Grade do calendário',
        file: 'components/search/CalendarMonthGrid.tsx',
        purpose: 'Dias, disponibilidade e intervalo selecionado.',
      },
      {
        name: 'Sugestões sazonais',
        file: 'components/search/SeasonalDateSuggestions.tsx',
        purpose: 'Atalhos de datas para descoberta.',
      },
      {
        name: 'Resultados flexíveis',
        file: 'components/search/FlexibleDateResults.tsx',
        purpose: 'Resultados quando as datas podem variar.',
      },
      {
        name: 'Paginação',
        file: 'components/search/SearchPagination.tsx',
        purpose: 'Navegação entre resultados.',
      },
      {
        name: 'Estado de disponibilidade',
        file: 'components/search/AvailabilitySearchState.tsx',
        purpose: 'Feedback de busca sem disponibilidade.',
      },
      {
        name: 'Contadores de hóspedes',
        file: 'components/search/GuestCounterList.tsx',
        purpose: 'Seleção acessível de ocupação.',
      },
    ],
  },
  {
    name: 'Catálogo e imóvel',
    description: 'Cartões, detalhes, fotos, disponibilidade, preço e conteúdo do anúncio.',
    components: [
      {
        name: 'Cartão de imóvel',
        file: 'components/property/PropertyCard.tsx',
        purpose: 'Resumo visual do anúncio e ação de salvar.',
      },
      {
        name: 'Grade do catálogo',
        file: 'components/property/PropertyCatalogGrid.tsx',
        purpose: 'Composição responsiva de resultados.',
      },
      {
        name: 'Esqueleto do catálogo',
        file: 'components/property/PropertyCatalogSkeleton.tsx',
        purpose: 'Estado de carregamento dos cartões.',
      },
      {
        name: 'Aviso do catálogo',
        file: 'components/property/CatalogLoadNotice.tsx',
        purpose: 'Erro, atualização e tentativa novamente.',
      },
      {
        name: 'Detalhe do imóvel',
        file: 'components/property/PropertyDetailModal.tsx',
        purpose: 'Conteúdo completo do anúncio.',
      },
      {
        name: 'Cabeçalho do detalhe',
        file: 'components/property/PropertyDetailHeader.tsx',
        purpose: 'Título, avaliação e ações do imóvel.',
      },
      {
        name: 'Grade de fotos',
        file: 'components/property/PropertyPhotoGrid.tsx',
        purpose: 'Apresentação de mídia do anúncio.',
      },
      {
        name: 'Galeria',
        file: 'components/property/PropertyGalleryDialog.tsx',
        purpose: 'Visualização ampliada das fotos.',
      },
      {
        name: 'Painel de reserva',
        file: 'components/property/PropertyBookingPanel.tsx',
        purpose: 'Datas, hóspedes, preço e chamada de reserva.',
      },
      {
        name: 'Seletor de datas',
        file: 'components/property/PropertyDatePickerDialog.tsx',
        purpose: 'Calendário do detalhe do imóvel.',
      },
      {
        name: 'Seletor de hóspedes',
        file: 'components/property/PropertyGuestSelectorDialog.tsx',
        purpose: 'Ocupação para a estadia.',
      },
      {
        name: 'Faixa de disponibilidade',
        file: 'components/property/PropertyAvailabilityStrip.tsx',
        purpose: 'Disponibilidade resumida por data.',
      },
      {
        name: 'Dia de calendário',
        file: 'components/property/CalendarDayButton.tsx',
        purpose: 'Estado e interação de um dia.',
      },
      {
        name: 'Navegação mensal',
        file: 'components/property/CalendarMonthNavigation.tsx',
        purpose: 'Mudança do mês apresentado.',
      },
      {
        name: 'Resumo do preço',
        file: 'components/property/PropertyPriceBreakdown.tsx',
        purpose: 'Composição do valor da estadia.',
      },
      {
        name: 'Comodidades',
        file: 'components/property/PropertyAmenitiesSection.tsx',
        purpose: 'Lista de itens e serviços do imóvel.',
      },
      {
        name: 'Avaliações',
        file: 'components/property/PropertyReviewsSection.tsx',
        purpose: 'Notas e comentários de hóspedes.',
      },
      {
        name: 'Localização',
        file: 'components/property/PropertyLocationSection.tsx',
        purpose: 'Endereço e contexto do destino.',
      },
      {
        name: 'Políticas',
        file: 'components/property/PropertyPoliciesSection.tsx',
        purpose: 'Regras, horários e condições.',
      },
      {
        name: 'Sobre o imóvel',
        file: 'components/property/PropertyOverviewSection.tsx',
        purpose: 'Descrição e destaques do anúncio.',
      },
      {
        name: 'Anfitrião',
        file: 'components/property/PropertyHostSection.tsx',
        purpose: 'Perfil e informações do anfitrião.',
      },
      {
        name: 'Avatar de anfitrião',
        file: 'components/property/HostAvatar.tsx',
        purpose: 'Identificação visual do anfitrião.',
      },
      {
        name: 'Ações do detalhe',
        file: 'components/property/PropertyDetailActions.tsx',
        purpose: 'Ações secundárias do anúncio.',
      },
      {
        name: 'Formatação da descrição',
        file: 'components/booking/formatPropertyDescription.tsx',
        purpose: 'Quebra e apresentação do texto longo de um imóvel.',
      },
    ],
  },
  {
    name: 'Reservas e pagamento',
    description: 'Formulários, resumo da estadia, recuperação e estados de checkout.',
    components: [
      {
        name: 'Checkout',
        file: 'components/booking/CheckoutModal.tsx',
        purpose: 'Fluxo de reserva e pagamento.',
      },
      {
        name: 'Checkout Stays',
        file: 'components/booking/StaysCheckoutModal.tsx',
        purpose: 'Integração de checkout hospedado.',
      },
      {
        name: 'Checkout em página',
        file: 'components/booking/SinglePageCheckout.tsx',
        purpose: 'Fluxo de reserva em página dedicada.',
      },
      {
        name: 'Entrada de checkout',
        file: 'components/booking/CheckoutEntry.tsx',
        purpose: 'Preparação do contexto e encaminhamento para pagamento.',
      },
      {
        name: 'Retomar checkout',
        file: 'components/booking/CheckoutResumePage.tsx',
        purpose: 'Consulta e continuidade de uma compra interrompida.',
      },
      {
        name: 'Checkout de reserva existente',
        file: 'components/booking/ExistingReservationCheckout.tsx',
        purpose: 'Pagamento de saldo ou conclusão de reserva já criada.',
      },
      {
        name: 'Dados do hóspede',
        file: 'components/booking/GuestDetailsForm.tsx',
        purpose: 'Identificação e contato do hóspede.',
      },
      {
        name: 'Campos de reserva existente',
        file: 'components/booking/ExistingReservationGuestFields.tsx',
        purpose: 'Contato associado a uma reserva.',
      },
      {
        name: 'Escolha de pagamento',
        file: 'components/booking/ExistingReservationPaymentChoices.tsx',
        purpose: 'Métodos de pagamento elegíveis.',
      },
      {
        name: 'Formulário Cielo',
        file: 'components/booking/CieloSopCardForm.tsx',
        purpose: 'Entrada segura dos dados de cartão.',
      },
      {
        name: 'Iframe Cielo',
        file: 'components/booking/CieloCheckoutIframe.tsx',
        purpose: 'Superfície de pagamento integrada do provedor.',
      },
      {
        name: 'Formulário Mercado Pago',
        file: 'components/booking/MercadoPagoCardForm.tsx',
        purpose: 'Dados de cartão no provedor.',
      },
      {
        name: 'Identificação Pix',
        file: 'components/booking/PixPayerIdentificationField.tsx',
        purpose: 'Dados do pagador para Pix.',
      },
      {
        name: 'Parcelas',
        file: 'components/booking/InstallmentPicker.tsx',
        purpose: 'Seleção de parcelamento.',
      },
      {
        name: 'Resumo da hospedagem',
        file: 'components/booking/ExistingReservationStayCard.tsx',
        purpose: 'Resumo do imóvel e período.',
      },
      {
        name: 'Condições',
        file: 'components/booking/ExistingReservationConditions.tsx',
        purpose: 'Regras da compra.',
      },
      {
        name: 'Aceite de contrato',
        file: 'components/booking/ExistingReservationContractAcceptance.tsx',
        purpose: 'Confirmação de termos e contrato.',
      },
      {
        name: 'Recuperação de checkout',
        file: 'components/booking/CheckoutRecoveryPage.tsx',
        purpose: 'Retomada e recuperação de uma jornada.',
      },
      {
        name: 'Carregamento de checkout',
        file: 'components/booking/CheckoutLoadingSkeleton.tsx',
        purpose: 'Feedback enquanto a reserva carrega.',
      },
      {
        name: 'Viagens',
        file: 'components/booking/TripsView.tsx',
        purpose: 'Reservas e viagens da conta.',
      },
      {
        name: 'Seletor de ingressos',
        file: 'components/booking/ParkTicketSelector.tsx',
        purpose: 'Seleção de ingressos opcionais.',
      },
      {
        name: 'Rodapé do checkout',
        file: 'components/booking/CheckoutFooter.tsx',
        purpose: 'Ajuda e informações complementares.',
      },
      {
        name: 'Link de suporte',
        file: 'components/booking/CheckoutSupportLink.tsx',
        purpose: 'Acesso ao suporte durante a compra.',
      },
      {
        name: 'Link de contrato',
        file: 'components/booking/CheckoutContractLink.tsx',
        purpose: 'Consulta do documento contratual.',
      },
    ],
  },
  {
    name: 'Conta e suporte',
    description: 'Conta de hóspede, favoritos, avisos, ajuda e preferências.',
    components: [
      {
        name: 'Conta de hóspede',
        file: 'components/account/GuestAccountModal.tsx',
        purpose: 'Acesso e gestão da conta.',
      },
      {
        name: 'Lista de desejos',
        file: 'components/account/WishlistsView.tsx',
        purpose: 'Imóveis salvos pelo hóspede.',
      },
      {
        name: 'Aviso de autenticação',
        file: 'components/account/AuthCallbackNotice.tsx',
        purpose: 'Confirmação ou erro de acesso.',
      },
      {
        name: 'Confirmação de recuperação',
        file: 'components/account/RecoveryLinkConfirmationPage.tsx',
        purpose: 'Conclusão de recuperação de conta.',
      },
      {
        name: 'Assistente Sofia',
        file: 'components/assistant/SofiaAssistantModal.tsx',
        purpose: 'Ajuda conversacional na descoberta.',
      },
      {
        name: 'Atalho Sofia',
        file: 'components/assistant/SofiaAssistantTrigger.tsx',
        purpose: 'Entrada para o assistente.',
      },
      {
        name: 'Preferências de medição',
        file: 'components/MeasurementPreferences.tsx',
        purpose: 'Consentimento e preferências de medição.',
      },
    ],
  },
  {
    name: 'Condomínios e localização',
    description: 'Exploração de condomínios, mapa e conteúdo de localização.',
    components: [
      {
        name: 'Diretório de condomínios',
        file: 'components/condominium/CondominiumDirectory.tsx',
        purpose: 'Busca e navegação entre condomínios.',
      },
      {
        name: 'Detalhe do condomínio',
        file: 'components/condominium/CondominiumDetailModal.tsx',
        purpose: 'Informações, localização e imóveis.',
      },
      {
        name: 'Mapa interativo',
        file: 'components/location/InteractiveMap.tsx',
        purpose: 'Exploração espacial dos anúncios.',
      },
    ],
  },
  {
    name: 'Proprietário e operação',
    description: 'Área do anfitrião e ferramentas administrativas existentes.',
    components: [
      {
        name: 'Painel do anfitrião',
        file: 'components/owner/HostDashboardView.tsx',
        purpose: 'Resumo operacional do proprietário.',
      },
      {
        name: 'Administração de acesso',
        file: 'components/owner/OwnerAccessAdminView.tsx',
        purpose: 'Análise de solicitações e permissões.',
      },
      {
        name: 'Transações',
        file: 'components/owner/OwnerAccountingTransactions.tsx',
        purpose: 'Consulta de transações e conciliação.',
      },
      {
        name: 'Criar anúncio',
        file: 'components/owner/CreateListingModal.tsx',
        purpose: 'Cadastro de novo imóvel.',
      },
    ],
  },
  {
    name: 'Infraestrutura de interface',
    description: 'Composição de overlays, carregamento e páginas auxiliares.',
    components: [
      {
        name: 'Camada de overlays',
        file: 'components/AppOverlayLayer.tsx',
        purpose: 'Montagem de diálogos e modais.',
      },
      {
        name: 'Modal adiado',
        file: 'components/DeferredModal.tsx',
        purpose: 'Carregamento sob demanda de overlays.',
      },
      {
        name: 'Limite de recurso',
        file: 'components/LazyFeatureBoundary.tsx',
        purpose: 'Recuperação de falha em recurso carregado.',
      },
      {
        name: 'Foco de diálogo',
        file: 'components/useDialogFocus.ts',
        purpose: 'Gerenciamento de foco em diálogos.',
      },
      {
        name: 'Confirmação de ação',
        file: 'components/ConfirmationDialog.tsx',
        purpose:
          'Decisão modal para ações consequenciais, com foco, estados pendentes e recuperação de erro controlados pelo consumidor.',
        status: 'implemented',
      },
      {
        name: 'Página não encontrada',
        file: 'components/NotFoundPage.tsx',
        purpose: 'Orientação para rota indisponível.',
      },
      {
        name: 'Documento legal',
        file: 'components/LegalDocumentPage.tsx',
        purpose: 'Leitura de documentos institucionais.',
      },
      {
        name: 'Prévia ImobSys',
        file: 'components/ImobSysPreviewPage.tsx',
        purpose: 'Ferramenta de prévia interna.',
      },
      {
        name: 'Imóvel ImobSys',
        file: 'components/ImobSysPropertyPage.tsx',
        purpose: 'Página de imóvel integrado.',
      },
    ],
  },
  {
    name: 'Prévia e operação interna',
    description:
      'Telas técnicas e previews presentes no app. Não fazem parte da jornada pública de hóspedes.',
    components: [
      {
        name: 'Prévia de checkout Cielo',
        file: 'components/booking/CieloCheckoutPreviewPage.tsx',
        purpose: 'Demonstração local da integração Cielo.',
      },
      {
        name: 'Operações do parceiro',
        file: 'components/booking/PartnerSandboxOperations.tsx',
        purpose: 'Consulta operacional do sandbox de integração.',
      },
      {
        name: 'Checkout de sandbox',
        file: 'components/booking/PartnerSandboxCheckout.tsx',
        purpose: 'Demonstração do checkout de parceiro em ambiente controlado.',
      },
      {
        name: 'Confirmação de pagamento (prévia)',
        file: 'components/booking/PaymentConfirmationPreview.tsx',
        purpose: 'Visualização isolada do estado de pagamento confirmado.',
      },
    ],
  },
];

const navItems = [
  { id: 'visao-geral', label: 'Visão geral' },
  { id: 'fundamentos', label: 'Fundamentos' },
  { id: 'movimento', label: 'Motion' },
  { id: 'espacamento', label: 'Espaçamento e layout' },
  { id: 'acoes', label: 'Botões e ações' },
  { id: 'formularios', label: 'Campos e formulários' },
  { id: 'superficies', label: 'Superfícies e feedback' },
  { id: 'busca', label: 'Busca e navegação' },
  { id: 'hospedagem', label: 'Imóvel e reserva' },
  { id: 'pagamento', label: 'Checkout e conta' },
  { id: 'proprietario', label: 'Painel do proprietário' },
  { id: 'overlays', label: 'Diálogos e overlays' },
  { id: 'inventario', label: 'Inventário de componentes' },
  { id: 'governanca', label: 'Notas de adoção' },
];

const spacingScale = [
  { utility: 'gap-1', px: 4 },
  { utility: 'gap-2', px: 8 },
  { utility: 'gap-3', px: 12 },
  { utility: 'gap-4', px: 16 },
  { utility: 'gap-6', px: 24 },
  { utility: 'gap-8', px: 32 },
  { utility: 'gap-12', px: 48 },
];

const radiusScale = [
  { utility: 'rounded-xs', px: '2 px', usage: 'não encontrado na busca' },
  { utility: 'rounded-sm', px: '4 px', usage: '15 usos' },
  { utility: 'rounded-md', px: '6 px', usage: '7 usos' },
  { utility: 'rounded-lg', px: '8 px', usage: '22 usos' },
  { utility: 'rounded-xl', px: '12 px', usage: '290 usos' },
  { utility: 'rounded-2xl', px: '16 px', usage: '175 usos' },
  { utility: 'rounded-3xl', px: '24 px', usage: '62 usos' },
  { utility: 'rounded-4xl', px: '32 px', usage: 'não encontrado na busca' },
  { utility: 'rounded-full', px: '9999 px', usage: '276 usos' },
];

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7 max-w-3xl">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-700">
        {eyebrow}
      </p>
      <h2 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">{description}</p>
    </div>
  );
}

function SpecimenCard({
  title,
  source,
  children,
  className,
}: {
  title: string;
  source: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6 ${className ?? ''}`}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-bold text-neutral-900">{title}</h3>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-[11px] text-neutral-600">
          {source}
        </span>
      </div>
      {children}
    </article>
  );
}

function TabsSpecimen() {
  const id = useId();
  const [activeTab, setActiveTab] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabs = [
    { label: 'Destino', content: 'Escolha a cidade, região ou condomínio da hospedagem.' },
    { label: 'Datas', content: 'Informe entrada e saída para consultar disponibilidade.' },
    { label: 'Hóspedes', content: 'Defina adultos, crianças e demais ocupantes.' },
  ];

  const focusTab = (index: number) => {
    setActiveTab(index);
    tabRefs.current[index]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Etapas da busca"
        tabIndex={-1}
        onKeyDown={(event) => {
          const lastIndex = tabs.length - 1;
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            focusTab((activeTab + 1) % tabs.length);
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            focusTab((activeTab - 1 + tabs.length) % tabs.length);
          } else if (event.key === 'Home') {
            event.preventDefault();
            focusTab(0);
          } else if (event.key === 'End') {
            event.preventDefault();
            focusTab(lastIndex);
          }
        }}
        className="flex gap-1 overflow-x-auto rounded-xl bg-neutral-100 p-1"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={activeTab === index}
            aria-controls={`${id}-panel`}
            tabIndex={activeTab === index ? 0 : -1}
            onClick={() => setActiveTab(index)}
            className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${activeTab === index ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${activeTab}`}
        tabIndex={0}
        className="mt-3 min-h-20 rounded-xl border border-neutral-200 bg-white p-4 text-sm leading-6 text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
      >
        {tabs[activeTab].content}
      </div>
      <p className="mt-3 text-xs leading-5 text-neutral-600">
        Tabs trocam painéis relacionados. Use setas, Home e End para navegar; áreas principais do
        painel do anfitrião são navegação de página e mantêm links/estado de página.
      </p>
    </div>
  );
}

function TokenRow({ name, value, color }: { name: string; value: string; color?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-neutral-200 p-3">
      {color && (
        <span
          aria-hidden="true"
          className="h-10 w-10 shrink-0 rounded-lg border border-black/10"
          style={{ background: color }}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-neutral-900">{name}</span>
        <code className="mt-0.5 block break-all text-xs text-neutral-500">{value}</code>
      </span>
    </div>
  );
}

const lifecycleLabels = {
  observed: 'Observado no código',
  proposed: 'Proposto',
  implemented: 'Implementado',
  validated: 'Validado',
  deprecated: 'Em descontinuação',
} as const;

function ComponentEntry({
  name,
  file,
  purpose,
  status = 'observed',
}: CatalogDomain['components'][number]) {
  const lifecycleStyles = {
    observed: 'bg-neutral-100 text-neutral-700',
    proposed: 'bg-violet-50 text-violet-800',
    implemented: 'bg-blue-50 text-blue-800',
    validated: 'bg-emerald-50 text-emerald-800',
    deprecated: 'bg-amber-50 text-amber-900',
  } as const;

  return (
    <article className="grid gap-2 border-t border-neutral-200 py-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)] sm:gap-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold text-neutral-900">{name}</h4>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${lifecycleStyles[status]}`}
          >
            {lifecycleLabels[status]}
          </span>
        </div>
        <code className="mt-1 block break-all text-[11px] text-neutral-500">{`src/${file}`}</code>
      </div>
      <p className="text-sm leading-5 text-neutral-600">{purpose}</p>
    </article>
  );
}

export function DesignSystemPage({
  isAdmin,
  isDevelopment,
}: {
  isAdmin: boolean;
  isDevelopment: boolean;
}) {
  const [activeSection, setActiveSection] = useState('visao-geral');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewInstallments, setPreviewInstallments] = useState(3);
  const [motionDemoKey, setMotionDemoKey] = useState(0);
  const [isMotionDemoSelected, setIsMotionDemoSelected] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const totalComponents = catalogDomains.reduce(
    (total, domain) => total + domain.components.length,
    0,
  );

  useEffect(() => {
    let animationFrameId = 0;

    const updateActiveSection = () => {
      const activeItem =
        [...navItems].reverse().find(({ id }) => {
          const section = document.getElementById(id);
          return section !== null && section.getBoundingClientRect().top <= 140;
        }) ?? navItems[0];

      setActiveSection((currentSection) =>
        currentSection === activeItem.id ? currentSection : activeItem.id,
      );
    };

    const scheduleActiveSectionUpdate = () => {
      if (animationFrameId !== 0) return;

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = 0;
        updateActiveSection();
      });
    };

    window.addEventListener('scroll', scheduleActiveSectionUpdate, { passive: true });
    window.addEventListener('resize', scheduleActiveSectionUpdate);
    scheduleActiveSectionUpdate();

    return () => {
      window.removeEventListener('scroll', scheduleActiveSectionUpdate);
      window.removeEventListener('resize', scheduleActiveSectionUpdate);

      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(motionPreference.matches);

    updateMotionPreference();
    motionPreference.addEventListener('change', updateMotionPreference);

    return () => motionPreference.removeEventListener('change', updateMotionPreference);
  }, []);

  const filteredDomains = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (!normalizedSearch) return catalogDomains;
    return catalogDomains
      .map((domain) => ({
        ...domain,
        components: domain.components.filter((component) =>
          `${component.name} ${component.file} ${component.purpose} ${domain.name}`
            .toLocaleLowerCase('pt-BR')
            .includes(normalizedSearch),
        ),
      }))
      .filter((domain) => domain.components.length > 0);
  }, [searchTerm]);

  const navigateTo = (id: string) => {
    setActiveSection(id);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a
            href="/"
            className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-orange-600"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-white">
              <Sparkles aria-hidden="true" size={20} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">Hospeda Reservas</span>
              <span className="block text-xs text-neutral-500">Design system</span>
            </span>
          </a>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${isDevelopment ? 'bg-blue-50 text-blue-800' : 'bg-emerald-50 text-emerald-800'}`}
            >
              {isDevelopment
                ? 'Ambiente local'
                : isAdmin
                  ? 'Acesso administrativo'
                  : 'Referência interna'}
            </span>
            <a
              href="/"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 text-sm font-semibold hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-orange-600"
            >
              <X aria-hidden="true" size={16} />
              <span className="hidden sm:inline">Sair</span>
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full min-w-0 max-w-[1600px] grid-cols-[minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-b border-neutral-200 bg-white/70 p-4 sm:p-6 lg:sticky lg:top-[65px] lg:h-[calc(100dvh-65px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">
            Navegação
          </p>
          <nav
            aria-label="Seções do design system"
            className="flex gap-2 overflow-x-auto lg:flex-col"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                aria-current={activeSection === item.id ? 'location' : undefined}
                className={`shrink-0 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${activeSection === item.id ? 'bg-orange-50 text-orange-800' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-7 hidden rounded-2xl border border-orange-100 bg-orange-50/70 p-4 lg:block">
            <p className="text-xs font-bold text-orange-950">Fonte do inventário</p>
            <p className="mt-1 text-xs leading-5 text-orange-900/80">
              Componentes existentes em <code>src/components</code>. Os exemplos visuais mostram
              padrões encontrados no código.
            </p>
          </div>
        </aside>

        <main className="min-w-0 max-w-full overflow-hidden px-4 py-7 sm:px-7 sm:py-10 lg:px-12 lg:py-12">
          <section id="visao-geral" className="scroll-mt-24">
            <div className="overflow-hidden rounded-[2rem] bg-neutral-950 text-white shadow-xl">
              <div className="grid min-w-0 gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(250px,0.8fr)] lg:p-12">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-orange-100">
                    <Sparkles aria-hidden="true" size={14} /> Referência interna de produto
                  </span>
                  <h1 className="mt-5 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
                    Design system
                    <br />
                    <span className="text-orange-300">Hospeda Reservas</span>
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300 sm:text-base">
                    Um mapa vivo do frontend React principal da aplicação Hospeda Reservas,
                    integrado à API Laravel. Inclui padrões e componentes do site de hospedagem e
                    deixa o blog Astro fora deste catálogo.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigateTo('fundamentos')}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-orange-500 px-5 text-sm font-bold text-white transition hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Explorar fundamentos <ArrowDownRight aria-hidden="true" size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateTo('inventario')}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Ver componentes <ArrowDownRight aria-hidden="true" size={16} />
                    </button>
                  </div>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 self-end min-[420px]:grid-cols-2">
                  <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <span className="text-3xl font-bold">{totalComponents}</span>
                    <span className="mt-1 block text-xs text-neutral-300">
                      componentes mapeados
                    </span>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <span className="text-3xl font-bold">{catalogDomains.length}</span>
                    <span className="mt-1 block text-xs text-neutral-300">áreas do produto</span>
                  </div>
                  <div className="col-span-full flex min-w-0 items-start gap-3 rounded-2xl border border-orange-200/15 bg-orange-400/10 p-4 text-sm leading-5 text-orange-50">
                    <CircleHelp
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-orange-300"
                      size={18}
                    />
                    <span>
                      O inventário mapeia componentes existentes. As prévias de fluxos são
                      estáticas; as seções de motion e espaçamento têm demonstrações isoladas. Elas
                      não executam jornadas reais e nem todo padrão já foi consolidado em uma API
                      compartilhada.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="fundamentos" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="01 · Fundamentos"
              title="Identidade e tokens observados"
              description="Valores extraídos das folhas globais atuais. Itens sem token semântico continuam sendo exemplos de uso, não decisões finais de escala."
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecimenCard title="Cores de marca e interface" source="brand-theme.css · index.css">
                <div className="grid gap-2 sm:grid-cols-2">
                  <TokenRow name="Acento CRCN" value="--crcn-accent · #ea580c" color="#ea580c" />
                  <TokenRow
                    name="Foco visível"
                    value="--color-focus-ring → --crcn-accent · #ea580c"
                    color="#ea580c"
                  />
                  <TokenRow
                    name="Halo suave de foco"
                    value="--color-focus-ring-soft · #ffedd5 · implementado"
                    color="#ffedd5"
                  />
                  <TokenRow
                    name="Borda de foco"
                    value="--color-focus-border · #fb923c · implementado"
                    color="#fb923c"
                  />
                  <TokenRow
                    name="Fundo da página"
                    value="--crcn-color-page · #ffffff"
                    color="#ffffff"
                  />
                  <TokenRow
                    name="Borda glass"
                    value="--crcn-glass-border · rgba(148,163,184,.3)"
                    color="rgba(148,163,184,.3)"
                  />
                  <TokenRow
                    name="Faixa de calendário"
                    value="--color-calendar-range · #ffedd5"
                    color="#ffedd5"
                  />
                  <TokenRow
                    name="Texto da seleção"
                    value="--color-calendar-range-foreground · #7c2d12"
                    color="#7c2d12"
                  />
                  <TokenRow
                    name="Dia indisponível"
                    value="--color-calendar-unavailable · #fff1f2"
                    color="#fff1f2"
                  />
                  <TokenRow
                    name="Texto indisponível"
                    value="--color-calendar-unavailable-foreground · #be123c"
                    color="#be123c"
                  />
                </div>
              </SpecimenCard>
              <SpecimenCard title="Tipografia e geometria" source="index.css · tailwind v4">
                <div className="grid gap-2">
                  <TokenRow name="Família principal" value="Plus Jakarta Sans · pesos 300–800" />
                  <TokenRow name="caption" value="0.75rem / 1rem (12px / 16px)" />
                  <TokenRow name="Largura de busca" value="--search-bar-width · 53.125rem" />
                  <TokenRow name="Altura de segmento" value="--search-bar-segment-height · 4rem" />
                  <TokenRow
                    name="Tamanho de dia (desktop)"
                    value="--search-calendar-day-size · 3.25rem"
                  />
                  <TokenRow
                    name="Espaço lateral do header"
                    value="12px base · 32px a partir de 640px · 48px a partir de 1440px"
                  />
                </div>
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                  <strong>Leitura:</strong> valores de tipografia, raios, sombras e espaçamento
                  ainda aparecem também como utilitários locais. A escala comum precisa de validação
                  antes de ser tratada como norma.
                </div>
              </SpecimenCard>
              <SpecimenCard title="Superfícies liquid glass" source="index.css · utilities">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="liquid-glass rounded-2xl p-5">
                    <p className="font-bold">liquid-glass</p>
                    <p className="mt-1 text-xs text-neutral-600">Superfície translúcida base</p>
                  </div>
                  <div className="liquid-glass-card rounded-2xl p-5">
                    <p className="font-bold">liquid-glass-card</p>
                    <p className="mt-1 text-xs text-neutral-600">Cartões e painéis</p>
                  </div>
                  <div className="liquid-glass-pill rounded-2xl p-5">
                    <p className="font-bold">liquid-glass-pill</p>
                    <p className="mt-1 text-xs text-neutral-600">Pílulas e chips</p>
                  </div>
                  <div className="liquid-glass-dark rounded-2xl p-5 text-white">
                    <p className="font-bold">liquid-glass-dark</p>
                    <p className="mt-1 text-xs text-white/70">Superfície escura</p>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-neutral-500">
                  As utilidades também incluem <code>liquid-glass-button</code>,{' '}
                  <code>liquid-glass-input</code> e <code>liquid-glass-accent</code>.
                </p>
              </SpecimenCard>
              <SpecimenCard
                title="Tamanhos de ícone observados"
                source="lucide-react · src/components"
              >
                <div className="flex flex-wrap items-center gap-5 text-neutral-700">
                  <span className="flex items-center gap-2">
                    <Search aria-hidden="true" size={16} /> 16 px
                  </span>
                  <span className="flex items-center gap-2">
                    <MapPin aria-hidden="true" size={20} /> 20 px
                  </span>
                  <span className="flex items-center gap-2">
                    <House aria-hidden="true" size={24} /> 24 px
                  </span>
                  <span className="flex items-center gap-2">
                    <Heart aria-hidden="true" size={20} className="text-orange-600" /> Lucide
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-neutral-600">
                  A biblioteca é compartilhada, mas os tamanhos ainda variam conforme a função e o
                  componente. A referência de movimento fica na seção Motion.
                </p>
              </SpecimenCard>
            </div>
          </section>

          <section id="movimento" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="02 · Movimento"
              title="Motion observado no produto"
              description="Demonstrações vivas de padrões já encontrados no frontend. Valores e exemplos são evidência do código atual, não uma escala de motion aprovada."
            />
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-5 text-blue-950">
              <CircleHelp aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
              <p>
                Preferência do sistema:{' '}
                <strong>
                  {prefersReducedMotion ? 'movimento reduzido ativo' : 'movimento normal'}
                </strong>
                . Os exemplos respeitam <code>prefers-reduced-motion</code>; altere a preferência do
                sistema operacional ou navegador para comparar.
              </p>
            </div>
            <div className="grid gap-5 xl:grid-cols-3">
              <SpecimenCard
                title="Entrada de popover"
                source="src/index.css · .search-popover-enter"
              >
                <div className="flex min-h-32 items-center justify-center rounded-xl bg-neutral-100 p-4">
                  <div
                    key={motionDemoKey}
                    className="search-popover-enter rounded-xl border border-neutral-200 bg-white p-4 shadow-lg"
                  >
                    <p className="text-sm font-bold">Escolha suas datas</p>
                    <p className="mt-1 text-xs text-neutral-600">A busca mantém o contexto.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMotionDemoKey((key) => key + 1)}
                  className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-neutral-300 px-4 text-sm font-semibold hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                >
                  Reproduzir entrada
                </button>
                <p className="mt-3 text-xs leading-5 text-neutral-600">
                  220 ms · cubic-bezier(0.2, 0, 0, 1). Orienta a aparição do painel; o conteúdo e a
                  ação seguem disponíveis sem animação.
                </p>
              </SpecimenCard>
              <SpecimenCard title="Estado de carregamento" source="Tailwind · animate-spin">
                <div className="flex min-h-32 items-center justify-center rounded-xl bg-neutral-100 p-4">
                  <div role="status" className="flex items-center gap-3 text-sm font-semibold">
                    <LoaderCircle
                      aria-hidden="true"
                      className="h-5 w-5 animate-spin text-orange-700"
                    />
                    Carregando resultados
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-neutral-600">
                  Feedback enquanto a tarefa está pendente. O texto preserva o estado quando a
                  rotação do ícone é desativada por movimento reduzido.
                </p>
              </SpecimenCard>
              <SpecimenCard
                title="Seleção e feedback"
                source="src/index.css · calendário e checkout"
              >
                <div className="flex min-h-32 items-center justify-center rounded-xl bg-neutral-100 p-4">
                  <button
                    type="button"
                    onClick={() => setIsMotionDemoSelected((selected) => !selected)}
                    aria-pressed={isMotionDemoSelected}
                    className={`min-h-11 rounded-full border px-5 text-sm font-semibold transition-colors duration-150 ease-in active:scale-[0.98] ${isMotionDemoSelected ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-neutral-300 bg-white text-neutral-800 hover:border-orange-400 hover:bg-orange-50'}`}
                  >
                    Alternar seleção
                  </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-neutral-600">
                  Transições curtas de cor e pressão comunicam resposta sem atrasar a ação. A
                  seleção permanece expressa pelo estado acessível do controle.
                </p>
              </SpecimenCard>
            </div>
            <div className="mt-5 grid gap-4 rounded-2xl border border-neutral-200 bg-white p-5 text-sm leading-6 text-neutral-700 md:grid-cols-2">
              <div>
                <h3 className="font-bold text-neutral-950">Regras observadas</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    CSS e View Transitions são usados para popovers, busca e navegação de
                    categorias.
                  </li>
                  <li>
                    O modo reduzido remove deslocamentos, animações e transições não essenciais.
                  </li>
                  <li>
                    Rolagens iniciadas pelo app usam comportamento automático com movimento
                    reduzido.
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-neutral-950">Decisões ainda abertas</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Tokens de duração e easing são candidatos, ainda sem escala aprovada.</li>
                  <li>
                    Transições geométricas e View Transitions precisam de validação em repetição e
                    interrupção.
                  </li>
                  <li>
                    Confira o inventário e suas limitações em{' '}
                    <code>docs/design-system-motion-audit.md</code>.
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section id="espacamento" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="03 · Espaçamento e layout"
              title="Escala espacial e medidas observadas"
              description="O Tailwind já fornece a escala-base de 4 px. As amostras mostram utilities e medidas globais encontradas no código, sem declarar uma nova escala como padrão do produto."
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecimenCard
                title="Escala-base de espaçamento"
                source="Tailwind CSS 4.3.3 · --spacing: 0.25rem"
              >
                <div className="grid gap-3">
                  {spacingScale.map((step) => (
                    <div
                      key={step.utility}
                      className="grid grid-cols-[4rem_1fr_3.5rem] items-center gap-3"
                    >
                      <code className="text-xs font-semibold text-neutral-700">{step.utility}</code>
                      <div className="h-3 rounded-full bg-neutral-100">
                        <div
                          aria-hidden="true"
                          className="h-3 rounded-full bg-orange-500"
                          style={{ width: `${step.px}px` }}
                        />
                      </div>
                      <span className="text-right text-xs text-neutral-600">{step.px} px</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-neutral-600">
                  Amostra dos passos recorrentes. O tema oferece mais valores; um passo serve para
                  padding, gap ou margin conforme a função. O desenho não prescreve uso por
                  componente.
                </p>
              </SpecimenCard>
              <SpecimenCard
                title="Raios disponíveis no tema"
                source="Tailwind CSS 4.3.3 · theme.css"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {radiusScale.map((radius) => (
                    <div key={radius.utility} className="grid justify-items-center gap-2">
                      <div
                        aria-hidden="true"
                        className={`h-16 w-20 border-2 border-orange-300 bg-orange-50 ${radius.utility}`}
                      />
                      <code className="text-xs font-semibold text-neutral-700">
                        {radius.utility}
                      </code>
                      <span className="text-xs text-neutral-500">{radius.px}</span>
                      <span className="text-center text-[10px] text-neutral-500">
                        {radius.usage}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-neutral-600">
                  As utilities do tema cobrem os raios recorrentes; valores arbitrários permanecem
                  candidatos a revisão, não a substituição automática.
                </p>
              </SpecimenCard>
              <SpecimenCard
                title="Variáveis semânticas de layout"
                source="src/index.css · :root e media queries"
              >
                <div className="grid gap-2">
                  <TokenRow name="Gutter do header" value="12 px base · 32 px ≥640 · 48 px ≥1440" />
                  <TokenRow
                    name="Largura de busca e calendário"
                    value="850 px cada · papéis separados"
                  />
                  <TokenRow name="Espaço entre meses" value="24 px · --search-calendar-gap" />
                  <TokenRow
                    name="Altura do segmento de busca"
                    value="64 px · --search-bar-segment-height"
                  />
                  <TokenRow
                    name="Padding do segmento de busca"
                    value="24 px · --search-bar-segment-padding"
                  />
                  <TokenRow name="Dia do calendário" value="52 px desktop · 43 px até 639 px" />
                  <TokenRow
                    name="Largura máxima do header"
                    value="1280 px · --header-expanded-width"
                  />
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Como ler e adotar as medidas"
                source="docs/design-system-layout-audit.md"
              >
                <ul className="grid gap-2 text-sm leading-5 text-neutral-700">
                  <li>
                    <strong>Padding</strong> cria respiro dentro de uma superfície.
                  </li>
                  <li>
                    <strong>Gap</strong> separa elementos irmãos quando a composição permite.
                  </li>
                  <li>
                    <strong>Margin</strong> posiciona um elemento em relação ao fluxo externo.
                  </li>
                  <li>
                    <strong>Raio e borda</strong> descrevem geometria e contorno, não a escala de
                    espaçamento.
                  </li>
                </ul>
                <div className="mt-4 rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-950">
                  Escalas semânticas extras e migrações continuam em análise. Consulte a auditoria
                  para ver os valores observados, as exceções e o plano de validação.
                </div>
              </SpecimenCard>
            </div>
          </section>

          <section id="acoes" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="04 · Interação"
              title="Botões e ações"
              description="Ações comuns usam agora uma API inicial compartilhada. Links continuam sendo elementos próprios, e superfícies glass especializadas permanecem locais quando a composição pede."
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecimenCard
                title="Ação principal e secundária"
                source="Header · checkout · formulários"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" className="shadow-sm">
                    Continuar
                  </Button>
                  <button
                    type="button"
                    className="liquid-glass-button min-h-11 rounded-full px-5 text-sm font-semibold text-neutral-800 transition hover:bg-orange-50"
                  >
                    Ver detalhes
                  </button>
                  <Button variant="secondary" disabled>
                    Indisponível
                  </Button>
                  <Button variant="primary" loading loadingLabel="Salvando">
                    Salvando
                  </Button>
                </div>
                <p className="mt-5 text-xs text-neutral-500">
                  Amostras de documentação. A chamada principal recebe destaque laranja; ações
                  secundárias aparecem em superfícies claras/glass.
                </p>
              </SpecimenCard>
              <SpecimenCard
                title="Ações com ícone e seleção"
                source="CategoryBar · PropertyCard · calendários"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    aria-label="Salvar imóvel"
                    className="liquid-glass-button flex h-11 w-11 items-center justify-center rounded-full text-neutral-800 hover:text-orange-700"
                  >
                    <Heart aria-hidden="true" size={19} />
                  </button>
                  <button
                    type="button"
                    aria-pressed="true"
                    className="flex min-h-11 items-center gap-2 rounded-full bg-orange-50 px-4 text-sm font-semibold text-orange-800"
                  >
                    <Check aria-hidden="true" size={16} />
                    Selecionado
                  </button>
                  <button
                    type="button"
                    className="flex min-h-11 items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 text-sm font-semibold hover:bg-neutral-50"
                  >
                    <SlidersHorizontal aria-hidden="true" size={16} />
                    Filtros
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-900">
                      2
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Próximo mês"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white"
                  >
                    <ChevronDown aria-hidden="true" className="-rotate-90" size={17} />
                  </button>
                </div>
                <p className="mt-5 text-xs text-neutral-500">
                  Botões somente com ícone precisam de nome acessível e alvo de interação adequado
                  ao contexto.
                </p>
              </SpecimenCard>
              <SpecimenCard
                title="Hover, foco e pressionado"
                source="Estados de interação observados"
                className="xl:col-span-2"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="min-h-11 rounded-full border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-800 transition-colors hover:border-orange-400 hover:bg-orange-50 hover:text-orange-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 active:bg-orange-100"
                  >
                    Passe o ponteiro ou use Tab
                  </button>
                  <a
                    href="#inventario"
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-orange-800 underline decoration-orange-300 underline-offset-4 transition-colors hover:bg-orange-50 hover:text-orange-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                  >
                    Link interativo
                  </a>
                  <a
                    href="#inventario"
                    className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 transition-colors hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                  >
                    Cartão clicável
                  </a>
                  <button
                    type="button"
                    aria-pressed="true"
                    className="min-h-11 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                  >
                    Aba ativa
                  </button>
                  <button
                    type="button"
                    disabled
                    className="min-h-11 cursor-not-allowed rounded-full border border-neutral-200 bg-neutral-100 px-5 text-sm font-semibold text-neutral-400"
                  >
                    Desabilitado
                  </button>
                  <span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900">
                    Selecionado é um estado persistente
                  </span>
                </div>
                <ul className="mt-5 grid gap-2 text-xs leading-5 text-neutral-600 sm:grid-cols-2">
                  <li>Hover dá retorno a botões, links, abas e cartões sem deslocar o layout.</li>
                  <li>Foco visível oferece o mesmo reconhecimento para navegação por teclado.</li>
                  <li>Pressionado é breve; selecionado permanece após a interação.</li>
                  <li>Desabilitado não sugere uma ação disponível nem recebe hover interativo.</li>
                </ul>
              </SpecimenCard>
            </div>
          </section>

          <section id="formularios" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="05 · Entrada de dados"
              title="Campos e formulários"
              description="Formulários são compostos por labels explícitos, estados de foco e mensagens próximas ao campo. A estrutura varia por fluxo e domínio."
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecimenCard
                title="Texto, seleção e busca"
                source="CreateListingModal · SearchModal"
              >
                <div className="grid gap-4">
                  <FormField
                    label="Nome do imóvel"
                    id="design-system-property-name"
                    required
                    hint="Use um nome reconhecível no catálogo."
                  >
                    <input
                      type="text"
                      required
                      defaultValue="Apartamento com piscina"
                      className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-normal outline-none transition-colors hover:border-neutral-400 focus:border-neutral-900"
                    />
                  </FormField>
                  <FormField label="Categoria · select nativo" id="design-system-category">
                    <div className="relative mt-1.5">
                      <select
                        defaultValue="apartamento"
                        className="min-h-11 w-full appearance-none rounded-xl border border-neutral-300 bg-white px-3 pr-10 text-sm font-normal outline-none transition-colors hover:border-neutral-400 focus:border-orange-600 focus-visible:ring-2 focus-visible:ring-orange-600/20"
                      >
                        <option value="apartamento">Apartamento</option>
                        <option value="casa">Casa</option>
                      </select>
                      <ChevronDown
                        aria-hidden="true"
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
                        size={17}
                      />
                    </div>
                  </FormField>
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Destino
                    <div className="relative">
                      <Search
                        aria-hidden="true"
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                        size={17}
                      />
                      <input
                        type="search"
                        placeholder="Cidade, região ou imóvel"
                        className="liquid-glass-input min-h-11 w-full rounded-full pl-10 pr-4 text-sm outline-none focus:border-neutral-900"
                      />
                    </div>
                  </label>
                  <p className="text-xs leading-5 text-neutral-600">
                    O widget de busca também usa dropdown customizado com listbox e busca. Consulte{' '}
                    <code className="break-all">src/components/search/StaysSearchWidget.tsx</code> e
                    o seletor de parcelas em{' '}
                    <code className="break-all">src/components/booking/InstallmentPicker.tsx</code>.
                  </p>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Dropdown customizado · seleção de parcelas"
                source="StaysSearchWidget · InstallmentPicker"
              >
                <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-gradient-to-b from-white to-orange-50/30 p-4 sm:p-5">
                  <span
                    id="design-system-installments-label"
                    className="block text-sm font-bold text-neutral-900"
                  >
                    Parcelas no cartão
                  </span>
                  <p className="mt-1 text-xs leading-5 text-neutral-600">
                    Selecione uma opção para atualizar o valor antes de confirmar.
                  </p>
                  <InstallmentPicker
                    labelledBy="design-system-installments-label"
                    value={previewInstallments}
                    onChange={setPreviewInstallments}
                    options={[
                      { installments: 1, label: 'À vista · R$ 1.040,00' },
                      { installments: 3, label: '3× de R$ 346,67 · sem juros' },
                      { installments: 6, label: '6× de R$ 173,33 · sem juros' },
                    ]}
                  />
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-white/80 px-3 py-2.5 text-xs ring-1 ring-neutral-200/80">
                    <span className="text-neutral-600">Opção selecionada</span>
                    <StatusBadge tone="info">{previewInstallments}×</StatusBadge>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-neutral-600">
                  Esta amostra usa o seletor real do checkout: foco retorna ao acionador, Escape
                  fecha o menu e setas/Home/End percorrem as opções. O filtro de condomínios é um
                  combobox diferente, com busca e resultados próprios.
                </p>
              </SpecimenCard>
              <SpecimenCard
                title="Combobox pesquisável · condomínio"
                source="StaysSearchWidget · prévia visual do padrão"
              >
                <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_16px_36px_-24px_rgba(15,23,42,0.35)]">
                  <div className="flex min-h-12 items-center gap-3 border-b border-neutral-100 px-4">
                    <Search aria-hidden="true" className="text-orange-700" size={17} />
                    <span className="flex-1 text-sm font-semibold text-neutral-900">
                      Caldas Novas
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="rotate-180 text-orange-700"
                      size={17}
                    />
                  </div>
                  <div className="p-3">
                    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-orange-300 bg-orange-50/40 px-3 ring-2 ring-orange-600/10">
                      <Search aria-hidden="true" className="text-neutral-500" size={16} />
                      <span className="text-sm text-neutral-500">Buscar condomínio</span>
                      <kbd className="ml-auto rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">
                        digite
                      </kbd>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="flex min-h-11 items-center justify-between rounded-xl bg-orange-50 px-3 text-sm font-bold text-orange-950 ring-1 ring-inset ring-orange-200">
                        <span className="flex items-center gap-2">
                          <MapPin aria-hidden="true" size={15} /> Lago Azul
                        </span>
                        <Check aria-hidden="true" className="text-orange-800" size={16} />
                      </div>
                      <div className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-neutral-700">
                        <MapPin aria-hidden="true" className="text-neutral-400" size={15} />
                        Thermas Place
                      </div>
                      <div className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-neutral-700">
                        <MapPin aria-hidden="true" className="text-neutral-400" size={15} />
                        Riviera Park
                      </div>
                    </div>
                    <p className="mt-2 border-t border-neutral-100 px-1 pt-2 text-xs text-neutral-500">
                      3 opções · escolha uma para filtrar a busca
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-neutral-600">
                  Padrão de combobox pesquisável usado na busca. A amostra documenta aparência e
                  hierarquia; a interação real, inclusive teclado e resultados, permanece no widget.
                </p>
              </SpecimenCard>
              <SpecimenCard title="Estados de campo" source="global focus · validação local">
                <div className="grid gap-4">
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Foco visível · use Tab
                    <input
                      type="text"
                      value="Caldas Novas"
                      readOnly
                      className="min-h-11 rounded-xl border border-neutral-900 bg-white px-3 text-sm font-normal outline-2 outline-offset-2 outline-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                    />
                  </label>
                  <FormField
                    label="Erro · aria-invalid e mensagem associada"
                    id="design-system-invalid-email"
                    error="Informe um email válido."
                  >
                    <input
                      type="email"
                      defaultValue="email-invalido"
                      className="mt-1.5 min-h-11 rounded-xl border border-rose-600 bg-white px-3 text-sm font-normal outline-none hover:border-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
                    />
                  </FormField>
                  <label className="grid gap-1.5 text-sm font-semibold">
                    Sucesso · mensagem persistente
                    <input
                      type="text"
                      aria-describedby="property-success"
                      readOnly
                      value="Apartamento Lago Azul"
                      className="min-h-11 rounded-xl border border-emerald-600 bg-emerald-50/40 px-3 text-sm font-normal"
                    />
                    <span id="property-success" className="text-xs font-medium text-emerald-800">
                      Nome disponível para continuar.
                    </span>
                  </label>
                  <label className="grid gap-1.5 text-sm font-semibold text-neutral-500">
                    Desabilitado
                    <input
                      type="text"
                      disabled
                      value="Indisponível nesta etapa"
                      className="min-h-11 cursor-not-allowed rounded-xl border border-neutral-200 bg-neutral-100 px-3 text-sm font-normal"
                    />
                  </label>
                  <label className="flex min-h-11 items-center gap-3 text-sm text-neutral-700">
                    <input type="checkbox" defaultChecked className="h-4 w-4 accent-orange-600" />
                    Aceito as condições desta reserva
                  </label>
                  <p role="status" aria-live="polite" className="text-xs text-neutral-600">
                    Salvando alterações… Preserve o valor e comunique o resultado sem mover o foco.
                  </p>
                </div>
              </SpecimenCard>
            </div>
          </section>

          <section id="superficies" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="06 · Apresentação"
              title="Superfícies, chips e feedback"
              description="Elementos de agrupamento e estados aparecem principalmente como composição local. Estas amostras mostram os padrões mais recorrentes encontrados."
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecimenCard
                title="Resumo de imóvel e preço"
                source="PropertyCard · PropertyPriceBreakdown"
              >
                <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                  <div className="relative flex h-40 items-end bg-gradient-to-br from-orange-100 via-amber-50 to-sky-100 p-4">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-700">
                      Piscina · Caldas Novas
                    </span>
                    <button
                      type="button"
                      aria-label="Salvar Apartamento Lago Azul"
                      className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-neutral-800"
                    >
                      <Heart aria-hidden="true" size={18} />
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold">Apartamento no Lago Azul</h3>
                        <p className="mt-1 text-sm text-neutral-500">2 quartos · até 6 hóspedes</p>
                      </div>
                      <span className="flex items-center gap-1 text-sm font-semibold">
                        <Star
                          aria-hidden="true"
                          className="fill-amber-400 text-amber-500"
                          size={15}
                        />
                        4,9
                      </span>
                    </div>
                    <p className="mt-4 text-sm">
                      <strong>R$ 320</strong> <span className="text-neutral-500">por noite</span>
                    </p>
                  </div>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Badges, filtros e estados"
                source="ActiveSearchFilters · catalog"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800">
                    Piscina
                  </span>
                  <span className="inline-flex min-h-9 items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 text-xs font-semibold">
                    <MapPin aria-hidden="true" size={13} />
                    Caldas Novas
                    <button
                      type="button"
                      aria-label="Remover filtro Caldas Novas"
                      className="ml-1 rounded-full p-1 hover:bg-neutral-100"
                    >
                      <X aria-hidden="true" size={13} />
                    </button>
                  </span>
                  <StatusBadge tone="success">Disponível</StatusBadge>
                  <StatusBadge tone="warning">Aguardando confirmação</StatusBadge>
                  <StatusBadge tone="danger">Indisponível</StatusBadge>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Calendário e seleção de datas"
                source="SearchDateCalendar · CalendarDayButton"
              >
                <div className="max-w-sm rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <button
                      type="button"
                      aria-label="Mês anterior"
                      className="h-10 w-10 rounded-full hover:bg-neutral-100"
                    >
                      <ArrowDownRight aria-hidden="true" className="rotate-45" size={16} />
                    </button>
                    <p className="font-bold">Novembro 2026</p>
                    <button
                      type="button"
                      aria-label="Próximo mês"
                      className="h-10 w-10 rounded-full hover:bg-neutral-100"
                    >
                      <ArrowUpRight aria-hidden="true" className="rotate-45" size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
                    {'D S T Q Q S S'.split(' ').map((day, index) => (
                      <span key={`${day}-${index}`} className="py-2">
                        {day}
                      </span>
                    ))}
                    {Array.from({ length: 30 }, (_, index) => (
                      <button
                        key={index}
                        type="button"
                        aria-pressed={index === 12 || index === 13}
                        className={`aspect-square rounded-full text-xs ${index === 12 || index === 13 ? 'bg-orange-600 font-bold text-white' : index === 19 ? 'text-neutral-300 line-through' : 'hover:bg-orange-50'}`}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-neutral-500">
                  No widget compacto há exceções responsivas documentadas para manter a grade
                  semanal em telas estreitas.
                </p>
              </SpecimenCard>
              <SpecimenCard
                title="Estado vazio e carregamento"
                source="CatalogLoadNotice · Skeleton"
              >
                <div className="grid gap-3">
                  <div
                    role="status"
                    className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                  >
                    <p className="font-semibold">Buscando hospedagens</p>
                    <p className="mt-1 text-sm text-neutral-600">
                      Estamos atualizando os resultados para essas datas.
                    </p>
                    <div
                      aria-hidden="true"
                      className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-200"
                    >
                      <div className="h-full w-2/3 rounded-full bg-orange-500" />
                    </div>
                  </div>
                  <EmptyState
                    headingLevel="h4"
                    density="compact"
                    icon={<Search className="h-5 w-5" />}
                    title="Nenhum resultado com estes filtros"
                    description="Remova um filtro ou escolha outras datas para continuar explorando."
                    action={
                      <a
                        href="#busca"
                        className="inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-bold text-orange-800 underline decoration-orange-300 underline-offset-4 hover:text-orange-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                      >
                        Rever busca e filtros
                      </a>
                    }
                  />
                </div>
              </SpecimenCard>
            </div>
          </section>

          <section id="busca" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="07 · Busca e descoberta"
              title="Navegação, categorias e filtros"
              description="Padrões usados para entrar na busca, alternar categorias e entender quais critérios estão ativos."
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecimenCard title="Cabeçalho e busca compacta" source="Header · StaysSearchWidget">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 sm:p-4">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-extrabold text-neutral-900">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 text-white">
                        <House aria-hidden="true" size={18} />
                      </span>
                      Hospeda
                    </span>
                    <button
                      type="button"
                      className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-full border border-neutral-200 bg-white px-4 text-left text-sm shadow-sm sm:max-w-md"
                    >
                      <span className="truncate font-semibold">Para onde você vai?</span>
                      <Search aria-hidden="true" className="shrink-0 text-orange-600" size={17} />
                    </button>
                    <button
                      type="button"
                      className="liquid-glass-button min-h-11 rounded-full px-4 text-sm font-semibold"
                    >
                      Entrar
                    </button>
                  </div>
                  <div className="mt-4 grid gap-2 rounded-2xl border border-neutral-200 bg-white p-3 sm:grid-cols-3">
                    <div className="rounded-xl px-3 py-2">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                        Destino
                      </span>
                      <span className="mt-1 block truncate text-sm font-semibold">
                        Caldas Novas
                      </span>
                    </div>
                    <div className="rounded-xl border-y border-neutral-100 px-3 py-2 sm:border-x sm:border-y-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                        Datas
                      </span>
                      <span className="mt-1 block truncate text-sm font-semibold">
                        Adicionar datas
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl px-3 py-2">
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                          Hóspedes
                        </span>
                        <span className="mt-1 block text-sm font-semibold">2 hóspedes</span>
                      </span>
                      <button
                        type="button"
                        aria-label="Buscar acomodações"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-600 text-white"
                      >
                        <Search aria-hidden="true" size={17} />
                      </button>
                    </div>
                  </div>
                </div>
              </SpecimenCard>
              <SpecimenCard title="Barra de categorias" source="CategoryBar">
                <div className="flex gap-5 overflow-x-auto pb-2">
                  {[
                    ['Todos', 'selected'],
                    ['Piscinas', 'default'],
                    ['Apartamentos', 'default'],
                    ['Parques', 'default'],
                    ['Família', 'default'],
                  ].map(([label, state]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={state === 'selected'}
                      className={`flex min-w-16 shrink-0 flex-col items-center gap-2 border-b-2 px-1 pb-2 text-xs font-semibold ${state === 'selected' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800'}`}
                    >
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-full ${state === 'selected' ? 'bg-orange-50 text-orange-700' : 'bg-neutral-100 text-neutral-600'}`}
                      >
                        {label === 'Piscinas' ? (
                          <Sparkles aria-hidden="true" size={18} />
                        ) : label === 'Apartamentos' ? (
                          <House aria-hidden="true" size={18} />
                        ) : label === 'Parques' ? (
                          <MapPin aria-hidden="true" size={18} />
                        ) : label === 'Família' ? (
                          <Heart aria-hidden="true" size={18} />
                        ) : (
                          <Search aria-hidden="true" size={18} />
                        )}
                      </span>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="flex min-h-11 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-sm font-semibold"
                  >
                    <SlidersHorizontal aria-hidden="true" size={16} />
                    Filtros
                  </button>
                  <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 text-sm">
                    <MapPin aria-hidden="true" className="text-orange-600" size={15} />
                    Caldas Novas
                    <button
                      type="button"
                      aria-label="Remover destino"
                      className="rounded-full p-1 hover:bg-neutral-100"
                    >
                      <X aria-hidden="true" size={14} />
                    </button>
                  </span>
                  <span className="inline-flex min-h-11 items-center rounded-full border border-neutral-200 bg-white px-3 text-sm">
                    2–5 dez · 2 hóspedes
                  </span>
                </div>
              </SpecimenCard>
              <SpecimenCard title="Tabs com painel associado" source="SearchModal · tabs ARIA">
                <TabsSpecimen />
              </SpecimenCard>
              <SpecimenCard
                title="Resultados e carregar mais"
                source="PropertyCatalogGrid · SearchPagination"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <div className="h-28 rounded-xl bg-gradient-to-br from-cyan-100 to-sky-300" />
                    <p className="mt-3 font-bold">Flat com piscina termal</p>
                    <p className="mt-1 text-xs text-neutral-500">Caldas Novas · 2 hóspedes</p>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                    <div className="h-28 rounded-xl bg-gradient-to-br from-orange-100 to-amber-300" />
                    <p className="mt-3 font-bold">Apartamento no centro</p>
                    <p className="mt-1 text-xs text-neutral-500">Caldas Novas · 4 hóspedes</p>
                  </div>
                </div>
                <div role="status" aria-live="polite" className="mt-4 text-center">
                  <p className="text-sm text-neutral-600">
                    12 acomodações carregadas. Há mais resultados.
                  </p>
                  <button
                    type="button"
                    className="mt-3 min-h-11 rounded-full border border-neutral-300 bg-white px-5 text-sm font-bold hover:bg-neutral-50"
                  >
                    Carregar mais
                  </button>
                </div>
                <div
                  role="alert"
                  className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"
                >
                  Não foi possível carregar a próxima página. Seus resultados foram mantidos.{' '}
                  <button type="button" className="font-bold underline">
                    Tentar novamente
                  </button>
                </div>
              </SpecimenCard>
            </div>
          </section>

          <section id="hospedagem" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="08 · Imóvel e reserva"
              title="Detalhe, disponibilidade e preço"
              description="Peças que ajudam a avaliar uma hospedagem, escolher datas e entender o valor antes de seguir para a reserva."
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecimenCard
                title="Cabeçalho do imóvel"
                source="PropertyDetailHeader · PropertyDetailActions"
              >
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <h3 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                    Apartamento no Lago Azul
                  </h3>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-neutral-600">
                    <span className="inline-flex items-center gap-1 font-bold text-neutral-900">
                      <Star
                        aria-hidden="true"
                        className="fill-amber-400 text-amber-500"
                        size={15}
                      />
                      4,92
                    </span>
                    <button type="button" className="min-h-11 underline underline-offset-2">
                      18 avaliações
                    </button>
                    <span>·</span>
                    <span>Caldas Novas, GO</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800">
                      Anfitrião destaque
                    </span>
                    <button
                      type="button"
                      className="min-h-10 rounded-full border border-neutral-200 px-3 text-sm font-semibold"
                    >
                      Compartilhar
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded-full border border-neutral-200 px-3 text-sm font-semibold"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Painel de reserva e composição de preço"
                source="PropertyBookingPanel · PropertyPriceBreakdown"
              >
                <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <p className="text-xl font-extrabold">
                    R$ 320 <span className="text-sm font-normal text-neutral-500">por noite</span>
                  </p>
                  <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-neutral-300 text-sm">
                    <button type="button" className="border-r border-neutral-300 p-3 text-left">
                      <span className="block text-[10px] font-bold uppercase text-neutral-500">
                        Check-in
                      </span>
                      <span className="mt-1 block font-semibold">2 dez</span>
                    </button>
                    <button type="button" className="p-3 text-left">
                      <span className="block text-[10px] font-bold uppercase text-neutral-500">
                        Check-out
                      </span>
                      <span className="mt-1 block font-semibold">5 dez</span>
                    </button>
                    <button
                      type="button"
                      className="col-span-2 flex items-center justify-between border-t border-neutral-300 p-3 text-left"
                    >
                      <span>
                        <span className="block text-[10px] font-bold uppercase text-neutral-500">
                          Hóspedes
                        </span>
                        <span className="mt-1 block font-semibold">2 hóspedes</span>
                      </span>
                      <ChevronDown aria-hidden="true" size={16} />
                    </button>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>R$ 320 × 3 noites</span>
                      <span>R$ 960</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Taxa de limpeza</span>
                      <span>R$ 80</span>
                    </div>
                    <div className="flex justify-between border-t border-neutral-200 pt-3 font-bold">
                      <span>Total</span>
                      <span>R$ 1.040</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-4 min-h-12 w-full rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700"
                  >
                    Continuar para reserva
                  </button>
                  <p className="mt-2 text-center text-xs text-neutral-500">
                    Você ainda não será cobrado
                  </p>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Comodidades, políticas e avaliações"
                source="PropertyAmenitiesSection · PropertyPoliciesSection · PropertyReviewsSection"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <h4 className="font-bold">O que este lugar oferece</h4>
                    <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                      <li className="flex items-center gap-2">
                        <Check aria-hidden="true" className="text-emerald-700" size={15} />
                        Piscina termal
                      </li>
                      <li className="flex items-center gap-2">
                        <Check aria-hidden="true" className="text-emerald-700" size={15} />
                        Wi-Fi
                      </li>
                      <li className="flex items-center gap-2">
                        <Check aria-hidden="true" className="text-emerald-700" size={15} />
                        Cozinha equipada
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <h4 className="font-bold">Regras da hospedagem</h4>
                    <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                      <li>Entrada após 14h</li>
                      <li>Até 6 hóspedes</li>
                      <li>Não é permitido fumar</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-neutral-200 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Star aria-hidden="true" className="fill-amber-400 text-amber-500" size={15} />
                    4,92 · 18 avaliações
                  </div>
                  <p className="mt-2 text-sm leading-5 text-neutral-600">
                    “Apartamento confortável e muito bem localizado.”
                  </p>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Galeria e disponibilidade"
                source="PropertyPhotoGrid · PropertyGalleryDialog · PropertyAvailabilityStrip"
              >
                <div className="grid grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl">
                  <div className="col-span-2 row-span-2 flex min-h-48 items-end bg-gradient-to-br from-sky-200 via-blue-100 to-cyan-300 p-3 text-sm font-semibold text-sky-950">
                    Foto principal
                  </div>
                  <div className="flex min-h-24 items-end bg-gradient-to-br from-orange-100 to-amber-300 p-2 text-xs font-semibold text-amber-950">
                    Piscina
                  </div>
                  <div className="flex min-h-24 items-end bg-gradient-to-br from-emerald-100 to-teal-300 p-2 text-xs font-semibold text-emerald-950">
                    Quarto
                  </div>
                  <div className="flex min-h-24 items-end bg-gradient-to-br from-rose-100 to-orange-200 p-2 text-xs font-semibold text-rose-950">
                    Sala
                  </div>
                  <button
                    type="button"
                    className="flex min-h-24 items-end bg-gradient-to-br from-violet-100 to-sky-200 p-2 text-left text-xs font-bold text-violet-950"
                  >
                    Ver todas as fotos
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-md bg-orange-100 px-2 py-1 text-orange-900">
                    Selecionado
                  </span>
                  <span className="rounded-md bg-neutral-100 px-2 py-1 text-neutral-600">
                    Disponível
                  </span>
                  <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-700 line-through">
                    Indisponível
                  </span>
                </div>
              </SpecimenCard>
            </div>
          </section>

          <section id="pagamento" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="09 · Checkout e conta"
              title="Formulários de compra e viagens"
              description="Composição de dados do hóspede, escolha de pagamento, resumo, aceite e estados de uma reserva."
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecimenCard
                title="Identificação do hóspede"
                source="GuestDetailsForm · ExistingReservationGuestFields"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-semibold">
                    Nome completo
                    <input
                      defaultValue="Marina Oliveira"
                      className="min-h-11 rounded-xl border border-neutral-300 px-3 font-normal outline-none focus:border-orange-600"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    CPF
                    <input
                      defaultValue="000.000.000-00"
                      className="min-h-11 rounded-xl border border-neutral-300 px-3 font-normal outline-none focus:border-orange-600"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
                    Email
                    <input
                      type="email"
                      defaultValue="marina@email.com"
                      className="min-h-11 rounded-xl border border-neutral-300 px-3 font-normal outline-none focus:border-orange-600"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    Celular
                    <input
                      type="tel"
                      defaultValue="(64) 99999-0000"
                      className="min-h-11 rounded-xl border border-neutral-300 px-3 font-normal outline-none focus:border-orange-600"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold">
                    Observações
                    <textarea
                      rows={2}
                      placeholder="Alguma informação para a hospedagem?"
                      className="rounded-xl border border-neutral-300 p-3 font-normal outline-none focus:border-orange-600"
                    />
                  </label>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Cartões de escolha · métodos de pagamento"
                source="ExistingReservationPaymentChoices · InstallmentPicker"
              >
                <fieldset className="space-y-3">
                  <legend className="mb-3 text-base font-bold">Como deseja pagar?</legend>
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-orange-600 bg-orange-50 p-4">
                    <input
                      type="radio"
                      name="payment-method"
                      defaultChecked
                      className="accent-orange-600"
                    />
                    <span className="flex-1">
                      <span className="block font-bold">Pix</span>
                      <span className="mt-1 block text-sm text-neutral-600">Aprovação rápida</span>
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-emerald-800">
                      Selecionado
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
                    <input type="radio" name="payment-method" className="accent-orange-600" />
                    <span className="flex-1">
                      <span className="block font-bold">Cartão de crédito</span>
                      <span className="mt-1 block text-sm text-neutral-600">
                        Parcelamento disponível
                      </span>
                    </span>
                    <span className="text-sm text-neutral-500">até 6×</span>
                  </label>
                </fieldset>
                <p className="mt-3 text-xs leading-5 text-neutral-600">
                  Para escolhas exclusivas, mantenha um grupo de rádios nativos com nome e
                  descrição. Use <code>aria-pressed</code> em botões de alternância, não como
                  substituto genérico para seleção de formulário.
                </p>
                <div className="mt-4">
                  <span
                    id="design-system-payment-installments"
                    className="block text-sm font-semibold"
                  >
                    Parcelas
                  </span>
                  <InstallmentPicker
                    labelledBy="design-system-payment-installments"
                    value={previewInstallments}
                    onChange={setPreviewInstallments}
                    options={[
                      { installments: 1, label: 'À vista · R$ 1.040,00' },
                      { installments: 3, label: '3× de R$ 346,67' },
                      { installments: 6, label: '6× de R$ 173,33' },
                    ]}
                  />
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Resumo, contrato e segurança"
                source="ExistingReservationStayCard · ContractAcceptance · CheckoutFooter"
              >
                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="flex gap-3">
                    <div className="h-20 w-24 shrink-0 rounded-xl bg-gradient-to-br from-sky-100 to-cyan-300" />
                    <div className="min-w-0">
                      <p className="font-bold">Apartamento no Lago Azul</p>
                      <p className="mt-1 text-sm text-neutral-600">
                        2–5 dez · 2 hóspedes · 3 noites
                      </p>
                      <p className="mt-2 text-sm font-bold">Total: R$ 1.040,00</p>
                    </div>
                  </div>
                  <label className="mt-4 flex items-start gap-3 border-t border-neutral-200 pt-4 text-sm leading-5">
                    <input type="checkbox" className="mt-1 accent-orange-600" />
                    <span>Li e aceito as condições da reserva e o contrato de hospedagem.</span>
                  </label>
                  <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
                    <CircleHelp aria-hidden="true" size={15} />
                    Pagamento processado em ambiente seguro
                  </p>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Cartão de viagem e estado da reserva"
                source="TripsView · ExistingReservationSummary"
              >
                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                        Próxima viagem
                      </p>
                      <h4 className="mt-1 font-bold">Caldas Novas, Goiás</h4>
                      <p className="mt-1 text-sm text-neutral-600">2–5 de dezembro · 3 noites</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                      Confirmada
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
                    <button
                      type="button"
                      className="min-h-10 rounded-full border border-neutral-200 px-4 text-sm font-semibold"
                    >
                      Ver detalhes
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded-full border border-neutral-200 px-4 text-sm font-semibold"
                    >
                      Falar com suporte
                    </button>
                  </div>
                </div>
              </SpecimenCard>
            </div>
          </section>

          <section id="proprietario" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="10 · Proprietário e operação"
              title="Painéis, tabelas e estados administrativos"
              description="Exemplos das superfícies de gestão de anúncios, reservas, valores e solicitações de acesso."
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecimenCard
                title="Indicadores do anfitrião"
                source="HostDashboardView · AmountCard"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm">
                    <span className="text-xs font-semibold text-neutral-500">Reservas</span>
                    <strong className="mt-2 block text-2xl">12</strong>
                    <span className="mt-1 block text-xs text-emerald-700">3 neste mês</span>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm">
                    <span className="text-xs font-semibold text-neutral-500">Receita prevista</span>
                    <strong className="mt-2 block text-2xl">R$ 8.420</strong>
                    <span className="mt-1 block text-xs text-neutral-500">Período selecionado</span>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm">
                    <span className="text-xs font-semibold text-neutral-500">Anúncios</span>
                    <strong className="mt-2 block text-2xl">4</strong>
                    <span className="mt-1 block text-xs text-neutral-500">
                      1 precisa de atenção
                    </span>
                  </div>
                </div>
                <nav
                  aria-label="Seções do painel do anfitrião"
                  className="mt-4 flex gap-2 overflow-x-auto border-b border-neutral-200 pb-2"
                >
                  {['Visão geral', 'Propriedades', 'Reservas', 'Calendário', 'Contabilidade'].map(
                    (sectionName, index) => (
                      <button
                        key={sectionName}
                        type="button"
                        aria-current={index === 0 ? 'page' : undefined}
                        className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${index === 0 ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
                      >
                        {sectionName}
                      </button>
                    ),
                  )}
                </nav>
              </SpecimenCard>
              <SpecimenCard
                title="Tabela e filtro de propriedades"
                source="OwnerAccountingTransactions · HostDashboardView"
              >
                <label className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 p-3 text-sm">
                  <span className="font-semibold">Propriedade</span>
                  <span className="relative">
                    <select
                      defaultValue="all"
                      aria-label="Filtrar por propriedade"
                      className="min-h-10 appearance-none rounded-lg border border-neutral-300 bg-white py-2 pl-3 pr-9 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                    >
                      <option value="all">Todas as propriedades</option>
                      <option>Apartamento Lago Azul</option>
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
                      size={16}
                    />
                  </span>
                </label>
                <div className="overflow-x-auto rounded-xl border border-neutral-200">
                  <table className="w-full min-w-[440px] border-collapse text-left text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                      <tr>
                        <th className="p-3">Reserva</th>
                        <th className="p-3">Período</th>
                        <th className="p-3">Valor</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-neutral-200">
                        <td className="p-3 font-semibold">#HR-2048</td>
                        <td className="p-3">2–5 dez</td>
                        <td className="p-3">R$ 1.040</td>
                        <td className="p-3">
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">
                            Pago
                          </span>
                        </td>
                      </tr>
                      <tr className="border-t border-neutral-200">
                        <td className="p-3 font-semibold">#HR-2041</td>
                        <td className="p-3">10–12 dez</td>
                        <td className="p-3">R$ 680</td>
                        <td className="p-3">
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">
                            Parcial
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
                  <span>2 registros · ordenação e seleção dependem do contexto.</span>
                  <nav aria-label="Paginação de exemplo" className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled
                      className="min-h-10 rounded-lg border border-neutral-200 px-3 text-neutral-400"
                    >
                      Anterior
                    </button>
                    <span aria-current="page" className="font-semibold text-neutral-900">
                      Página 1
                    </span>
                    <button
                      type="button"
                      className="min-h-10 rounded-lg border border-neutral-200 px-3 font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                      Próxima
                    </button>
                  </nav>
                </div>
                <p className="mt-3 text-xs leading-5 text-neutral-500">
                  Exemplo de tabela semântica com rolagem horizontal. Não é um grid ARIA; paginação
                  e ações de linha devem indicar escopo e estado atual.
                </p>
              </SpecimenCard>
              <SpecimenCard
                title="Solicitação de acesso e permissões"
                source="OwnerAccessAdminView · OwnerRequestCard"
              >
                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">Carlos Henrique</p>
                      <p className="mt-1 text-sm text-neutral-600">
                        carlos@email.com · solicitou acesso de anfitrião
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
                      Pendente
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="min-h-10 rounded-full bg-emerald-700 px-4 text-sm font-bold text-white"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded-full border border-rose-200 px-4 text-sm font-semibold text-rose-800"
                    >
                      Recusar
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded-full border border-neutral-200 px-4 text-sm font-semibold"
                    >
                      Ver cadastro
                    </button>
                  </div>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Calendário operacional"
                source="HostDashboardView · Owner calendar"
              >
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  <div className="col-span-7 mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      className="h-9 w-9 rounded-full hover:bg-neutral-100"
                      aria-label="Mês anterior"
                    >
                      ‹
                    </button>
                    <strong>Dezembro 2026</strong>
                    <button
                      type="button"
                      className="h-9 w-9 rounded-full hover:bg-neutral-100"
                      aria-label="Próximo mês"
                    >
                      ›
                    </button>
                  </div>
                  {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, index) => (
                    <span key={`${day}-${index}`} className="py-2 font-semibold text-neutral-500">
                      {day}
                    </span>
                  ))}
                  {Array.from({ length: 35 }, (_, index) => (
                    <span
                      key={index}
                      className={`rounded-lg py-2 ${index === 8 ? 'bg-emerald-100 text-emerald-900' : index === 15 ? 'bg-amber-100 text-amber-900' : index === 22 ? 'bg-rose-100 text-rose-900' : 'text-neutral-700'}`}
                    >
                      {index < 31 ? index + 1 : ''}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  Verde: confirmado · âmbar: aguardando · vermelho: bloqueio
                </p>
              </SpecimenCard>
            </div>
          </section>

          <section id="overlays" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="11 · Diálogos e suporte"
              title="Overlays, avisos e assistência"
              description="Superfícies temporárias e mensagens que ajudam a avançar, recuperar uma ação ou entender uma escolha."
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecimenCard
                title="Diálogo de tarefa"
                source="GuestAccountModal · CondominiumDetailModal"
              >
                <div className="rounded-3xl bg-neutral-800/90 p-4 sm:p-6">
                  <div className="mx-auto max-w-sm rounded-3xl border border-white/70 bg-white p-5 shadow-2xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 id="sample-dialog-title" className="text-lg font-bold">
                          Entrar na sua conta
                        </h3>
                        <p className="mt-1 text-sm text-neutral-600">
                          Acesse reservas e imóveis salvos.
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Fechar diálogo"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-neutral-100"
                      >
                        <X aria-hidden="true" size={18} />
                      </button>
                    </div>
                    <label className="mt-4 grid gap-1 text-sm font-semibold">
                      Email
                      <input
                        type="email"
                        placeholder="voce@email.com"
                        className="min-h-11 rounded-xl border border-neutral-300 px-3 font-normal"
                      />
                    </label>
                    <button
                      type="button"
                      className="mt-4 min-h-11 w-full rounded-xl bg-orange-600 font-bold text-white"
                    >
                      Continuar
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-neutral-500">
                  Diálogos verdadeiros também precisam controlar foco, retorno ao acionador, Escape
                  e interação com o fundo.
                </p>
              </SpecimenCard>
              <SpecimenCard title="Confirmação consequencial" source="ConfirmationDialog">
                <div className="rounded-3xl bg-neutral-800/90 p-4 sm:p-6">
                  <div className="mx-auto max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl sm:p-6">
                    <h3 className="text-lg font-extrabold text-neutral-950">
                      Revogar link de visitante?
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-neutral-700">
                      O link deixará de retomar o pedido como visitante. A reserva e o pagamento
                      permanecem inalterados.
                    </p>
                    <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
                      <Button variant="secondary">Cancelar</Button>
                      <Button variant="danger">Revogar link</Button>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-neutral-500">
                  O consumidor fornece a consequência específica, bloqueia a repetição durante o
                  envio e mantém o diálogo aberto se a ação falhar.
                </p>
              </SpecimenCard>
              <SpecimenCard
                title="Avisos de estado"
                source="CatalogLoadNotice · AvailabilitySearchState · AuthCallbackNotice"
              >
                <div className="grid gap-3">
                  <InlineNotice
                    variant="info"
                    role="group"
                    icon={<CircleHelp aria-hidden="true" size={18} />}
                  >
                    <strong>Atualizando consulta.</strong> Os preços podem mudar até a confirmação.
                  </InlineNotice>
                  <InlineNotice
                    variant="error"
                    role="group"
                    icon={<CircleHelp aria-hidden="true" size={18} />}
                  >
                    <strong>Não foi possível carregar.</strong> Tente novamente; seus dados
                    continuam salvos.
                  </InlineNotice>
                  <InlineNotice
                    variant="success"
                    role="group"
                    icon={<Check aria-hidden="true" size={18} />}
                  >
                    <strong>Solicitação enviada.</strong> Você receberá uma atualização sobre o
                    acesso.
                  </InlineNotice>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Toast e ajuda contextual · propostas"
                source="Não localizados como componentes compartilhados"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Toast · exemplo proposto
                    </p>
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-lg"
                    >
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-emerald-700"
                        size={18}
                      />
                      <div>
                        <p className="font-semibold text-neutral-900">Alteração salva</p>
                        <p className="mt-1 text-sm text-neutral-600">
                          A confirmação permanente também deve ficar no contexto da tarefa.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Ajuda contextual · exemplo proposto
                    </p>
                    <div className="relative inline-flex items-start gap-3">
                      <button
                        type="button"
                        aria-label="O que é uma diária?"
                        aria-describedby="design-system-tooltip-example"
                        className="peer flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-sm font-bold hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                      >
                        i
                      </button>
                      <p
                        id="design-system-tooltip-example"
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-56 rounded-xl bg-neutral-900 px-3 py-2 text-sm text-white opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100"
                      >
                        Uma diária corresponde a uma noite de hospedagem.
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-neutral-600">
                  Não foram encontrados componentes compartilhados de toast ou tooltip. A ajuda não
                  pode depender só de hover, e um toast não substitui mensagens persistentes em
                  erros ou ações críticas.
                </p>
              </SpecimenCard>
              <SpecimenCard title="Preferências e consentimento" source="MeasurementPreferences">
                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">Preferências de medição</h3>
                      <p className="mt-1 text-sm leading-5 text-neutral-600">
                        Escolha separadamente quais categorias de medição permitir.
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Fechar preferências"
                      className="rounded-full p-2 hover:bg-neutral-100"
                    >
                      <X aria-hidden="true" size={17} />
                    </button>
                  </div>
                  <label className="mt-4 flex min-h-11 items-center gap-3 border-t border-neutral-100 pt-3 text-sm">
                    <input type="checkbox" className="accent-orange-600" />
                    Analytics (medição de uso)
                  </label>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" className="accent-orange-600" />
                    Publicidade
                  </label>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="min-h-10 rounded-full border border-neutral-200 px-4 text-sm font-semibold"
                    >
                      Recusar
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded-full bg-orange-600 px-4 text-sm font-bold text-white"
                    >
                      Salvar escolhas
                    </button>
                  </div>
                </div>
              </SpecimenCard>
              <SpecimenCard
                title="Assistente e suporte contextual"
                source="SofiaAssistantModal · CheckoutSupportLink"
              >
                <div className="max-w-md rounded-3xl border border-orange-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-800">
                      <Sparkles aria-hidden="true" size={18} />
                    </span>
                    <div>
                      <p className="font-bold">Sofia</p>
                      <p className="text-xs text-neutral-500">Assistente de hospedagem</p>
                    </div>
                  </div>
                  <div className="my-4 max-w-[85%] rounded-2xl rounded-tl-sm bg-neutral-100 p-3 text-sm leading-5">
                    Posso ajudar a encontrar uma hospedagem para suas datas. O que é mais importante
                    para você?
                  </div>
                  <div className="flex gap-2">
                    <input
                      aria-label="Escreva sua mensagem"
                      placeholder="Escreva uma mensagem…"
                      className="min-h-11 min-w-0 flex-1 rounded-full border border-neutral-200 px-4 text-sm"
                    />
                    <button
                      type="button"
                      aria-label="Enviar mensagem"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-600 text-white"
                    >
                      <ArrowUpRight aria-hidden="true" size={17} />
                    </button>
                  </div>
                </div>
              </SpecimenCard>
            </div>
          </section>

          <section id="inventario" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="12 · Catálogo"
              title="Inventário de componentes"
              description="Componentes localizados no código do frontend Laravel/React. Pesquise por nome, arquivo, descrição ou área para achar a origem; os exemplos visuais não são automaticamente APIs compartilhadas ou componentes validados."
            />
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative block min-w-0 flex-1">
                <span className="sr-only">Pesquisar componentes</span>
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                  size={17}
                />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar botão, calendário, proprietário…"
                  className="min-h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-3 text-sm outline-none focus:border-orange-600"
                />
              </label>
              <p aria-live="polite" className="shrink-0 text-sm text-neutral-600">
                {filteredDomains.reduce((total, domain) => total + domain.components.length, 0)} de{' '}
                {totalComponents} componentes
              </p>
            </div>
            <div className="space-y-5">
              {filteredDomains.map((domain) => (
                <details
                  key={domain.name}
                  open={Boolean(searchTerm.trim())}
                  className="rounded-2xl border border-neutral-200 bg-white px-5 shadow-sm sm:px-6"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 focus-visible:outline-2 focus-visible:outline-orange-600">
                    <span>
                      <span className="block font-bold">{domain.name}</span>
                      <span className="mt-1 block text-sm text-neutral-500">
                        {domain.description}
                      </span>
                    </span>
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                      {domain.components.length}
                    </span>
                  </summary>
                  <div className="pb-2">
                    {domain.components.map((component) => (
                      <ComponentEntry key={component.file} {...component} />
                    ))}
                  </div>
                </details>
              ))}
              {filteredDomains.length === 0 && (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
                  <p className="font-semibold">Nenhum componente encontrado</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Tente outro nome ou termo de busca.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section id="governanca" className="mt-14 scroll-mt-24 sm:mt-20">
            <SectionHeading
              eyebrow="13 · Como usar"
              title="Notas de adoção"
              description="A página registra o que existe hoje para ajudar a reutilização. A consolidação do sistema deve ser feita por etapas, com evidência e sem abstrair diferenças legítimas entre fluxos."
            />
            <div className="grid gap-4 md:grid-cols-3">
              <article className="rounded-2xl border border-neutral-200 bg-white p-5">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-700">
                  Observar
                </span>
                <h3 className="mt-2 font-bold">Padrão existente</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Consulte os componentes de origem antes de criar um novo elemento ou copiar
                  estilos locais.
                </p>
              </article>
              <article className="rounded-2xl border border-neutral-200 bg-white p-5">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-700">
                  Compor
                </span>
                <h3 className="mt-2 font-bold">API reutilizável</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Extraia primitivas quando apresentação e comportamento realmente se repetirem.
                </p>
              </article>
              <article className="rounded-2xl border border-neutral-200 bg-white p-5">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-700">
                  Validar
                </span>
                <h3 className="mt-2 font-bold">Acessibilidade e estados</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Revise teclado, foco, zoom, contraste, carregamento, erro, vazio e sucesso para
                  cada componente alterado.
                </p>
              </article>
            </div>
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
              <h3 className="font-bold">Checklist de adoção por componente</h3>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-neutral-600 sm:grid-cols-2">
                <li>
                  Identifique fonte, consumidor real e estados alcançáveis antes de reutilizar.
                </li>
                <li>Confira teclado, foco visível, leitor de tela, zoom e conteúdo longo.</li>
                <li>Compare touch e ponteiro; nenhuma ação depende só de hover ou tooltip.</li>
                <li>Respeite movimento reduzido, alvos touch e reflow em telas estreitas.</li>
                <li>
                  Use estado vazio para ausência de conteúdo; loading e erro precisam de feedback
                  próprio.
                </li>
                <li>
                  Use radio para uma escolha exclusiva; tabs exigem painel associado e teclado de
                  tabs.
                </li>
                <li>
                  Áreas principais continuam navegação, com destino e estado atual identificáveis.
                </li>
                <li>Toast e tooltip neste catálogo são propostas, não componentes existentes.</li>
                <li>Não chame uma amostra de validada sem conferir o consumidor no navegador.</li>
              </ul>
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
              <article className="rounded-2xl border border-neutral-200 bg-white p-5">
                <h3 className="font-bold">Ciclo de vida e evidência</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  O status descreve o que foi verificado. Encontrar um padrão no código não prova
                  que ele virou contrato compartilhado; implementar também não significa que todos
                  os estados e consumidores foram validados.
                </p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ['Observado', 'Encontrado em arquivo ou uso existente.'],
                    ['Proposto', 'Recomendação que ainda aguarda decisão e adoção.'],
                    [
                      'Implementado',
                      'Existe como código reutilizável; validação pode estar pendente.',
                    ],
                    [
                      'Validado',
                      'Estados e critérios nomeados foram conferidos, com ambiente e método.',
                    ],
                  ].map(([status, meaning]) => (
                    <div key={status} className="rounded-xl bg-neutral-50 p-3">
                      <dt className="text-xs font-bold text-neutral-900">{status}</dt>
                      <dd className="mt-1 text-xs leading-5 text-neutral-600">{meaning}</dd>
                    </div>
                  ))}
                </dl>
              </article>
              <article className="rounded-2xl border border-neutral-200 bg-white p-5">
                <h3 className="font-bold">Primitivas compartilhadas e consumidores</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
                  <li>
                    <code>Button</code>: catálogo, paginação, aviso de catálogo e viagens.
                  </li>
                  <li>
                    <code>FormField</code>: conta/login e formulários de dados do hóspede no
                    checkout.
                  </li>
                  <li>
                    <code>InlineNotice</code>: catálogo e alertas de carregamento em painéis do
                    proprietário/admin.
                  </li>
                  <li>
                    <code>StatusBadge</code>: reservas do usuário e cartões/listas do painel do
                    anfitrião.
                  </li>
                  <li>
                    <code>EmptyState</code>: catálogo, viagens e painel do anfitrião.
                  </li>
                </ul>
                <p className="mt-3 border-t border-neutral-100 pt-3 text-xs leading-5 text-neutral-500">
                  Mapeamento conferido nos imports do frontend. A lista não representa adoção em
                  toda a aplicação nem validação visual de cada consumidor.
                </p>
              </article>
            </div>
            <p className="mt-5 text-xs leading-5 text-neutral-500">
              Atualizado em 27/11/2026. Inventário do frontend React principal, construído a partir
              dos arquivos de <code>src/components</code>, folhas <code>src/index.css</code> e{' '}
              <code>public/brand-theme.css</code>. O blog Astro em <code>blog/</code> tem escopo
              visual próprio e não está incluído. Consulte{' '}
              <code>docs/design-system-deepening-checklist.md</code> para execução por painéis e
              waves; o <code>docs/design-system-checklist.md</code> mantém o inventário geral e as
              demais pendências.
            </p>
          </section>
          <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 py-6 text-xs text-neutral-500">
            <span>Hospeda Reservas · Referência interna</span>
            <a
              href="/"
              className="font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-4"
            >
              Voltar ao site
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
