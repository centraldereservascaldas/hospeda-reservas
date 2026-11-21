/** Formats Stays listing titles for customers without mutating the source value. */
export function getPublicPropertyTitle(title: string): string {
  return title
    .replace(/^\s*CRCN\s*[-–—:]\s*/i, '')
    .replace(/\bApto?\.?(?=\s|$)/gi, 'Apartamento')
    .replace(/(\bApartamento\s+)0+(?=\d+\b)/gi, '$1')
    .replace(/\s*[-–—]\s*/g, ' – ')
    .replace(/\s+/g, ' ')
    .trim();
}
