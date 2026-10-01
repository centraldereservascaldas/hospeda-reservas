import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Property, Currency } from '../types';
import { formatCurrency } from '../utils/formatters';
import { MapPin, Minus, Plus, Star, X, LocateFixed, ExternalLink } from 'lucide-react';

interface InteractiveMapProps {
  properties: Property[];
  currency: Currency;
  onSelectProperty: (property: Property) => void;
  selectedProperty: Property | null;
}

type Point = { x: number; y: number };
type Bounds = { west: number; south: number; east: number; north: number };

const TILE_SIZE = 256;
const INITIAL_ZOOM = 13;
const DEFAULT_CENTER = { lat: -17.744, lng: -48.625 };
const MAX_MERCATOR_LAT = 85.05112878;

const project = (lat: number, lng: number, zoom: number): Point => {
  const safeLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * scale,
    y: ((1 - Math.asinh(Math.tan((safeLat * Math.PI) / 180)) / Math.PI) / 2) * scale,
  };
};

const unproject = (point: Point, zoom: number) => {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (point.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * point.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat, lng };
};

const isValidCoordinate = (property: Property) => {
  const { lat, lng } = property.location;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  properties,
  currency,
  onSelectProperty,
  selectedProperty,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const draggedSincePointerDown = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [center, setCenter] = useState(() => project(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, INITIAL_ZOOM));
  const [activeProperty, setActiveProperty] = useState<Property | null>(selectedProperty);
  const [failedTiles, setFailedTiles] = useState<string[]>([]);

  const validProperties = useMemo(() => properties.filter(isValidCoordinate), [properties]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setActiveProperty(selectedProperty);
  }, [selectedProperty]);

  useEffect(() => {
    if (activeProperty && !validProperties.some((property) => property.id === activeProperty.id)) {
      setActiveProperty(null);
    }
  }, [activeProperty, validProperties]);

  const fitProperties = useCallback((targetZoom = zoom) => {
    if (!size.width || !size.height) return;
    if (validProperties.length === 0) {
      setZoom(INITIAL_ZOOM);
      setCenter(project(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, INITIAL_ZOOM));
      return;
    }
    const projected = validProperties.map((property) => project(property.location.lat, property.location.lng, targetZoom));
    const minX = Math.min(...projected.map((point) => point.x));
    const maxX = Math.max(...projected.map((point) => point.x));
    const minY = Math.min(...projected.map((point) => point.y));
    const maxY = Math.max(...projected.map((point) => point.y));
    const padding = 96;
    const spanX = Math.max(maxX - minX, 80);
    const spanY = Math.max(maxY - minY, 80);
    const fitScale = Math.min((size.width - padding * 2) / spanX, (size.height - padding * 2) / spanY, 1);
    const nextZoom = Math.max(4, Math.min(17, targetZoom + Math.floor(Math.log2(Math.max(fitScale, 0.01)))));
    const finalPoints = validProperties.map((property) => project(property.location.lat, property.location.lng, nextZoom));
    const xs = finalPoints.map((point) => point.x);
    const ys = finalPoints.map((point) => point.y);
    setZoom(nextZoom);
    setCenter({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
  }, [size, validProperties, zoom]);

  useEffect(() => {
    if (size.width && size.height) fitProperties(INITIAL_ZOOM);
  // Fit once when the filtered set or map dimensions change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, validProperties]);

  const tileLayout = useMemo(() => {
    if (!size.width || !size.height) return [];
    const topLeft = { x: center.x - size.width / 2, y: center.y - size.height / 2 };
    const minTileX = Math.floor(topLeft.x / TILE_SIZE);
    const maxTileX = Math.floor((topLeft.x + size.width) / TILE_SIZE);
    const minTileY = Math.floor(topLeft.y / TILE_SIZE);
    const maxTileY = Math.floor((topLeft.y + size.height) / TILE_SIZE);
    const worldTiles = 2 ** zoom;
    const tiles = [];
    for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
      if (tileY < 0 || tileY >= worldTiles) continue;
      for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
        const wrappedX = ((tileX % worldTiles) + worldTiles) % worldTiles;
        tiles.push({
          key: `${zoom}/${tileX}/${tileY}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
          left: tileX * TILE_SIZE - (center.x - size.width / 2),
          top: tileY * TILE_SIZE - (center.y - size.height / 2),
        });
      }
    }
    return tiles;
  }, [center, size, zoom]);

  const visibleBounds = useMemo<Bounds | null>(() => {
    if (!size.width || !size.height) return null;
    const southwest = unproject({ x: center.x - size.width / 2, y: center.y + size.height / 2 }, zoom);
    const northeast = unproject({ x: center.x + size.width / 2, y: center.y - size.height / 2 }, zoom);
    return { west: southwest.lng, south: southwest.lat, east: northeast.lng, north: northeast.lat };
  }, [center, size, zoom]);

  const pinPositions = useMemo(() => validProperties.map((property) => {
    const point = project(property.location.lat, property.location.lng, zoom);
    return {
      property,
      x: point.x - center.x + size.width / 2,
      y: point.y - center.y + size.height / 2,
    };
  }).filter(({ x, y }) => x >= -50 && x <= size.width + 50 && y >= -50 && y <= size.height + 50), [validProperties, zoom, center, size]);

  const zoomAt = (nextZoom: number, anchor?: Point) => {
    const clampedZoom = Math.max(5, Math.min(18, nextZoom));
    if (clampedZoom === zoom) return;
    const focalPoint = anchor || { x: size.width / 2, y: size.height / 2 };
    const worldPoint = {
      x: center.x + focalPoint.x - size.width / 2,
      y: center.y + focalPoint.y - size.height / 2,
    };
    const geographic = unproject(worldPoint, zoom);
    const projectedAtNewZoom = project(geographic.lat, geographic.lng, clampedZoom);
    setCenter({
      x: projectedAtNewZoom.x - focalPoint.x + size.width / 2,
      y: projectedAtNewZoom.y - focalPoint.y + size.height / 2,
    });
    setZoom(clampedZoom);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    draggedSincePointerDown.current = false;
    if ((event.target as HTMLElement).closest('button')) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved) draggedSincePointerDown.current = true;
    setCenter((current) => ({ x: current.x - dx, y: current.y - dy }));
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
  };

  const onPointerUp = () => { dragRef.current = null; };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomAt(zoom + (event.deltaY < 0 ? 1 : -1), { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const openMap = () => {
    if (!visibleBounds) return;
    const { west, south, east, north } = visibleBounds;
    window.open(`https://www.openstreetmap.org/?mlat=${(south + north) / 2}&mlon=${(west + east) / 2}#map=${zoom}/${(south + north) / 2}/${(west + east) / 2}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Mapa interativo das acomodações"
      className="relative h-[calc(100dvh-250px)] min-h-[420px] max-h-[850px] w-full overflow-hidden rounded-3xl border border-neutral-200 bg-[#e8eee9] shadow-inner touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={handleWheel}
      onDoubleClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        zoomAt(zoom + 1, { x: event.clientX - rect.left, y: event.clientY - rect.top });
      }}
      onKeyDown={(event) => {
        const pan = 100;
        if (event.key === 'ArrowUp') setCenter((point) => ({ ...point, y: point.y - pan }));
        if (event.key === 'ArrowDown') setCenter((point) => ({ ...point, y: point.y + pan }));
        if (event.key === 'ArrowLeft') setCenter((point) => ({ ...point, x: point.x - pan }));
        if (event.key === 'ArrowRight') setCenter((point) => ({ ...point, x: point.x + pan }));
      }}
      tabIndex={0}
    >
      <div className="absolute inset-0" aria-hidden="true">
        {tileLayout.map((tile) => (
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            draggable={false}
            onError={() => setFailedTiles((current) => current.includes(tile.key) ? current : [...current, tile.key])}
            className="absolute h-64 w-64 max-w-none bg-[#e7ece8]"
            style={{ left: tile.left, top: tile.top, visibility: failedTiles.includes(tile.key) ? 'hidden' : 'visible' }}
          />
        ))}
      </div>

      {pinPositions.map(({ property, x, y }) => {
        const isActive = activeProperty?.id === property.id;
        return (
          <button
            key={property.id}
            type="button"
            aria-label={`${property.title}, ${formatCurrency(property.pricePerNight, currency)} por noite`}
            aria-pressed={isActive}
            onClick={() => {
              if (draggedSincePointerDown.current) return;
              setActiveProperty(property);
            }}
            className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white px-3 py-1.5 text-xs font-extrabold shadow-lg transition-transform hover:z-20 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600 ${isActive ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'}`}
            style={{ left: x, top: y }}
          >
            {formatCurrency(property.pricePerNight, currency)}
          </button>
        );
      })}

      <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-2xl border border-white/90 bg-white/90 px-3 py-2 text-xs font-bold text-neutral-800 shadow-md backdrop-blur-sm sm:left-4 sm:top-4 sm:px-4">
        <MapPin className="h-4 w-4 shrink-0 text-orange-600" />
        <span className="truncate">{pinPositions.length} acomodações neste mapa</span>
      </div>

      <div className="absolute right-3 top-3 z-20 flex flex-col gap-2 sm:right-4 sm:top-4">
        <button type="button" onClick={() => zoomAt(zoom + 1)} aria-label="Aumentar zoom" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white bg-white/95 text-neutral-800 shadow-md hover:bg-white"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => zoomAt(zoom - 1)} aria-label="Diminuir zoom" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white bg-white/95 text-neutral-800 shadow-md hover:bg-white"><Minus className="h-4 w-4" /></button>
        <button type="button" onClick={() => fitProperties(INITIAL_ZOOM)} aria-label="Enquadrar acomodações" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white bg-white/95 text-neutral-800 shadow-md hover:bg-white"><LocateFixed className="h-4 w-4" /></button>
      </div>

      {tileLayout.length > 0 && failedTiles.length === tileLayout.length && (
        <div role="status" className="absolute inset-x-4 top-16 z-20 mx-auto max-w-sm rounded-xl bg-white/95 p-3 text-center text-xs text-neutral-700 shadow-lg">
          Não foi possível carregar o mapa. Verifique sua conexão; os apartamentos continuam disponíveis na lista.
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-10 rounded bg-white/85 px-1.5 py-1 text-[10px] text-neutral-700 shadow-sm" onPointerDown={(event) => event.stopPropagation()}>
        © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
      </div>
      <button type="button" onClick={openMap} className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded bg-white/90 px-2 py-1.5 text-[10px] font-semibold text-neutral-700 shadow-sm hover:bg-white">
        Abrir mapa <ExternalLink className="h-3 w-3" />
      </button>

      {activeProperty && (
        <div className="absolute bottom-10 left-1/2 z-30 w-[min(20rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-white bg-white/95 p-3 shadow-2xl backdrop-blur-xl sm:bottom-12">
          <div className="relative mb-2 aspect-[16/9] overflow-hidden rounded-xl bg-neutral-100">
            {activeProperty.images[0] && <img src={activeProperty.images[0]} alt={activeProperty.title} className="h-full w-full object-cover" />}
            <button type="button" onClick={() => setActiveProperty(null)} aria-label="Fechar detalhes do marcador" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white"><X className="h-4 w-4" /></button>
            <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold"><Star className="h-3 w-3 fill-current" />{activeProperty.rating.toFixed(2)}</span>
          </div>
          <p className="truncate text-sm font-extrabold text-neutral-900">{activeProperty.title}</p>
          <p className="truncate text-xs text-neutral-500">{activeProperty.location.neighborhood}, {activeProperty.location.city}</p>
          <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-2">
            <div><strong className="text-sm">{formatCurrency(activeProperty.pricePerNight, currency)}</strong><span className="text-xs text-neutral-500"> / noite*</span></div>
            <button type="button" onClick={() => onSelectProperty(activeProperty)} className="rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700">Ver detalhes</button>
          </div>
          <p className="mt-1 text-[10px] text-neutral-500">*Preço-base; o valor da estadia depende das datas.</p>
        </div>
      )}
    </div>
  );
};
