export type LegalPageSlug = 'privacidade' | 'termos' | 'cancelamento';

export interface LegalPageSummary {
  slug: LegalPageSlug;
  path: string;
  title: string;
  version: string;
  publishedAt: string;
}

export interface LegalPage extends LegalPageSummary {
  sections: Array<{ title: string; content: string }>;
}

function isLegalPageSlug(value: unknown): value is LegalPageSlug {
  return value === 'privacidade' || value === 'termos' || value === 'cancelamento';
}

function isPublishedDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isLegalPageSummary(value: unknown): value is LegalPageSummary {
  if (typeof value !== 'object' || value === null) return false;
  const page = value as Record<string, unknown>;
  return (
    isLegalPageSlug(page.slug) &&
    page.path === `/${page.slug}` &&
    typeof page.title === 'string' &&
    page.title.trim() !== '' &&
    typeof page.version === 'string' &&
    page.version.trim() !== '' &&
    isPublishedDate(page.publishedAt)
  );
}

export function isLegalPage(value: unknown): value is LegalPage {
  if (!isLegalPageSummary(value)) return false;
  const sections = (value as unknown as { sections?: unknown }).sections;
  return Array.isArray(sections) && sections.length > 0 && sections.every(isLegalPageSection);
}

function isLegalPageSection(value: unknown): value is { title: string; content: string } {
  if (typeof value !== 'object' || value === null) return false;
  const section = value as Record<string, unknown>;
  return (
    typeof section.title === 'string' &&
    section.title.trim() !== '' &&
    typeof section.content === 'string' &&
    section.content.trim() !== ''
  );
}

export function readLegalPageSummaries(value: unknown): LegalPageSummary[] {
  if (typeof value !== 'object' || value === null) return [];
  const pages = (value as Record<string, unknown>).pages;
  if (!Array.isArray(pages)) return [];

  return pages.filter(isLegalPageSummary);
}
