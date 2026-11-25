export type PortalSection = 'overview' | 'content' | 'properties' | 'reservations' | 'affiliates' | 'integrations';

export type EditorialPage = {
  id: string;
  title: string;
  path: string;
  status: 'Publicado' | 'Rascunho' | 'Em revisão';
  updatedAt: string;
  owner: string;
  summary: string;
};

export const portalNavigation: Array<{ id: PortalSection; label: string; group: string }> = [
  { id: 'overview', label: 'Visão geral', group: 'Workspace' },
  { id: 'content', label: 'Conteúdo do site', group: 'Gestão do site' },
  { id: 'properties', label: 'Imóveis', group: 'Gestão do site' },
  { id: 'reservations', label: 'Reservas', group: 'Acompanhamento' },
  { id: 'affiliates', label: 'Afiliados', group: 'Acompanhamento' },
  { id: 'integrations', label: 'Integrações', group: 'Sistema' },
];

export const demoPages: EditorialPage[] = [
  {
    id: 'home',
    title: 'Página inicial',
    path: '/',
    status: 'Publicado',
    updatedAt: 'Hoje, 09:42',
    owner: 'Equipe de conteúdo',
    summary: 'Apresentação da marca, destaques e atalhos de busca.',
  },
  {
    id: 'about',
    title: 'Sobre a Central',
    path: '/sobre',
    status: 'Em revisão',
    updatedAt: 'Ontem, 16:18',
    owner: 'Marina Costa',
    summary: 'História, atendimento e informações institucionais.',
  },
  {
    id: 'contact',
    title: 'Fale conosco',
    path: '/contato',
    status: 'Rascunho',
    updatedAt: '18 nov, 14:06',
    owner: 'Lucas Mendes',
    summary: 'Canais de atendimento e formulário de contato.',
  },
];

export const demoProperties = [
  { name: 'Refúgio das Águas', location: 'Caldas Novas, GO', origin: 'Conteúdo próprio', status: 'Completo', initials: 'RA', tone: 'peach' },
  { name: 'Jardim do Cerrado', location: 'Rio Quente, GO', origin: 'Catálogo integrado', status: 'Revisar fotos', initials: 'JC', tone: 'sage' },
  { name: 'Vista das Termas', location: 'Caldas Novas, GO', origin: 'Conteúdo próprio', status: 'Rascunho', initials: 'VT', tone: 'lavender' },
];

export const demoReservations = [
  { code: 'DEMO-24081', property: 'Refúgio das Águas', dates: '22–25 nov, 2026', status: 'Confirmada', channel: 'Site próprio', updated: 'há 12 min' },
  { code: 'DEMO-24076', property: 'Jardim do Cerrado', dates: '28 nov–02 dez, 2026', status: 'Aguardando confirmação', channel: 'Origem pendente', updated: 'há 38 min' },
  { code: 'DEMO-24069', property: 'Vista das Termas', dates: '05–08 dez, 2026', status: 'Confirmada', channel: 'Afiliado demonstrativo', updated: 'há 1 h' },
];

export const demoAffiliates = [
  { name: 'Rota de Descobertas', type: 'Criador de conteúdo', status: 'Aguardando análise', initials: 'RD' },
  { name: 'Viaje em Família', type: 'Parceiro local', status: 'Em análise', initials: 'VF' },
];
