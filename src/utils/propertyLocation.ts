export interface PropertyMapLinks {
  embedUrl: string;
  externalUrl: string;
}

export function getPropertyMapLinks(latitude: number, longitude: number): PropertyMapLinks | null {
  const hasValidCoordinates =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) > 0.01 &&
    Math.abs(longitude) > 0.01;

  if (!hasValidCoordinates) return null;

  const mapBounds = new URLSearchParams({
    bbox: `${longitude - 0.008},${latitude - 0.006},${longitude + 0.008},${latitude + 0.006}`,
    layer: 'mapnik',
    marker: `${latitude},${longitude}`,
  });

  return {
    embedUrl: `https://www.openstreetmap.org/export/embed.html?${mapBounds.toString()}`,
    externalUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`,
  };
}
