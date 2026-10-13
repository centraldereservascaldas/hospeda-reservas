/** Formats Stays listing titles for customers without mutating the source value. */
export function getPublicPropertyTitle(title: string): string {
  return title
    .replace(/^\s*CRCN\s*[-–—:]\s*/i, '')
    .replace(/\bApto?\.?(?=\s|$)/gi, 'Apartamento')
    .replace(/\s*[-–—]\s*/g, ' – ')
    .replace(/\s+/g, ' ')
    .trim();
}
