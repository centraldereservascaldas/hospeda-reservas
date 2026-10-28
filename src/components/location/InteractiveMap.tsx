import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Property, Currency } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import { getCatalogAmenities, getPropertyAmenitySummary } from '../../utils/propertyAmenities';
import { getPropertyDisplayPrice } from '../../utils/propertyDisplayPrice';
import { Check, MapPin, Minus, Plus, Star, X, LocateFixed, ExternalLink } from 'lucide-react';

interface InteractiveMapProps {
  properties: Property[];
  currency: Currency;
  hasSearchDates: boolean;
  availabilityConfirmed?: boolean;
  searchGuestCount?: number;
  showTotalWithTaxes: boolean;
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
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  properties,
  currency,
  hasSearchDates,
  availabilityConfirmed = false,
  searchGuestCount = 1,
  showTotalWithTaxes,
  onSelectProperty,
  selectedProperty,
}) => {
  const activePropertyDetailsId = `map-property-details-${useId().replace(/:/g, '')}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledIntoViewRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const draggedSincePointerDown = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [center, setCenter] = useState(() =>
    project(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, INITIAL_ZOOM),
  );
  const [activeProperty, setActiveProperty] = useState<Property | null>(selectedProperty);
  const [failedTiles, setFailedTiles] = useState<string[]>([]);

  const validProperties = useMemo(() => properties.filter(isValidCoordinate), [properties]);
  const shouldReflowCompactPins = size.width <= 639 && size.height <= 180;
  const isCompactMap = size.width <= 360 && size.height <= 180;
  const activePropertyDisplayPrice = activeProperty
    ? getPropertyDisplayPrice(activeProperty, hasSearchDates, showTotalWithTaxes)
    : null;
  const activePropertyAmenitySummary = activeProperty
    ? getPropertyAmenitySummary(
        getCatalogAmenities(
          activeProperty.amenities,
          activeProperty.listingAmenities,
          activeProperty.propertyAmenities,
        ),
      )
    : null;

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
    if (!size.width || !size.height || hasScrolledIntoViewRef.current) return;
    if (typeof window.requestAnimationFrame !== 'function') return;

    const frame = window.requestAnimationFrame(() => {
      const element = containerRef.current;
      if (!element?.scrollIntoView) return;

      const reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      element.scrollIntoView({
        block: window.innerHeight <= 400 ? 'start' : 'center',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
      hasScrolledIntoViewRef.current = true;
    });

    return () => window.cancelAnimationFrame?.(frame);
  }, [size.width, size.height]);

  useEffect(() => {
    setActiveProperty(selectedProperty);
  }, [selectedProperty]);

  useEffect(() => {
    if (!activeProperty) return;

    const currentProperty = validProperties.find((property) => property.id === activeProperty.id);
    if (!currentProperty) {
      setActiveProperty(null);
    } else if (currentProperty !== activeProperty) {
      setActiveProperty(currentProperty);
    }
  }, [activeProperty, validProperties]);

  const fitProperties = useCallback(
    (targetZoom = zoom) => {
      if (!size.width || !size.height) return;
      if (validProperties.length === 0) {
        setZoom(INITIAL_ZOOM);
        setCenter(project(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, INITIAL_ZOOM));
        return;
      }
      const projected = validProperties.map((property) =>
        project(property.location.lat, property.location.lng, targetZoom),
      );
      const minX = Math.min(...projected.map((point) => point.x));
      const maxX = Math.max(...projected.map((point) => point.x));
      const minY = Math.min(...projected.map((point) => point.y));
      const maxY = Math.max(...projected.map((point) => point.y));
      const padding = size.height <= 180 ? 32 : 96;
      const spanX = Math.max(maxX - minX, 80);
      const spanY = Math.max(maxY - minY, 80);
      const fitScale = Math.min(
        (size.width - padding * 2) / spanX,
        (size.height - padding * 2) / spanY,
        1,
      );
      const nextZoom = Math.max(
        4,
        Math.min(17, targetZoom + Math.floor(Math.log2(Math.max(fitScale, 0.01)))),
      );
      const finalPoints = validProperties.map((property) =>
        project(property.location.lat, property.location.lng, nextZoom),
      );
      const xs = finalPoints.map((point) => point.x);
      const ys = finalPoints.map((point) => point.y);
      setZoom(nextZoom);
      setCenter({
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      });
    },
    [size, validProperties, zoom],
  );

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
    const southwest = unproject(
      { x: center.x - size.width / 2, y: center.y + size.height / 2 },
      zoom,
    );
    const northeast = unproject(
      { x: center.x + size.width / 2, y: center.y - size.height / 2 },
      zoom,
    );
    return { west: southwest.lng, south: southwest.lat, east: northeast.lng, north: northeast.lat };
  }, [center, size, zoom]);

  const pinPositions = useMemo(() => {
    const positionsByCoordinate = new Map<
      string,
      Array<{ property: Property; x: number; y: number }>
    >();

    validProperties.forEach((property) => {
      const point = project(property.location.lat, property.location.lng, zoom);
      const position = {
        property,
        x: point.x - center.x + size.width / 2,
        y: point.y - center.y + size.height / 2,
      };
      const coordinateKey = `${property.location.lat},${property.location.lng}`;
      const group = positionsByCoordinate.get(coordinateKey) || [];
      group.push(position);
      positionsByCoordinate.set(coordinateKey, group);
    });

    const positions = [...positionsByCoordinate.values()]
      .flatMap((group) => {
        if (group.length === 1) {
          const position = group[0]!;
          return [
            {
              ...position,
              anchorX: position.x,
              anchorY: position.y,
              isSpread: false,
              isSpreadGroupLead: false,
              isReflowed: false,
            },
          ];
        }

        const radius = Math.max(56, (group.length * 100) / (2 * Math.PI));
        return group.map((position, index) => {
          const angle = (2 * Math.PI * index) / group.length;
          return {
            ...position,
            anchorX: position.x,
            anchorY: position.y,
            x: position.x + Math.cos(angle) * radius,
            y: position.y + Math.sin(angle) * radius,
            isSpread: true,
            isSpreadGroupLead: index === 0,
            isReflowed: false,
          };
        });
      })
      .filter(
        ({ x, y }) => x >= -100 && x <= size.width + 100 && y >= -100 && y <= size.height + 100,
      );

    if (!shouldReflowCompactPins || positions.length > 6 || positions.length === 0) {
      return positions;
    }

    const compactPinWidth = Math.max(
      44,
      Math.min(isCompactMap ? 72 : 136, Math.floor((size.width - 16) / positions.length - 4)),
    );
    const firstPinCenter = 8 + compactPinWidth / 2;
    const lastPinCenter = size.width - 8 - compactPinWidth / 2;

    return positions.map((position, index) => ({
      ...position,
      anchorX: position.x,
      anchorY: position.y,
      x:
        positions.length === 1
          ? size.width / 2
          : firstPinCenter + ((lastPinCenter - firstPinCenter) * index) / (positions.length - 1),
      y: size.height * 0.52,
      isReflowed: true,
    }));
  }, [validProperties, zoom, center, size, shouldReflowCompactPins, isCompactMap]);

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
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
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

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomAt(zoom + (event.deltaY < 0 ? 1 : -1), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  const openMap = () => {
    if (!visibleBounds) return;
    const { west, south, east, north } = visibleBounds;
    window.open(
      `https://www.openstreetmap.org/?mlat=${(south + north) / 2}&mlon=${(west + east) / 2}#map=${zoom}/${(south + north) / 2}/${(west + east) / 2}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  // The map canvas is a keyboard-operable composite widget; arrow keys pan the map.
  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  return (
    <div
      ref={containerRef}
      role="application"
      aria-roledescription="mapa interativo"
      aria-label="Mapa interativo das acomodações"
      aria-describedby="accommodation-map-keyboard-help"
      className="relative h-[calc(100dvh-250px)] min-h-[420px] max-h-[850px] w-full scroll-mt-[66px] overflow-hidden rounded-3xl border border-neutral-200 bg-[#e8eee9] shadow-inner touch-pinch-zoom focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 max-[639px]:h-[calc(100dvh-280px)] max-[639px]:min-h-[calc(100dvh-280px)] [@media(max-height:400px)]:h-[220px] [@media(max-height:400px)]:min-h-[220px] [@media(max-width:639px)_and_(max-height:400px)]:h-[145px] [@media(max-width:639px)_and_(max-height:400px)]:min-h-[145px] [@media(max-width:639px)_and_(max-height:400px)]:scroll-mt-[104px]"
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
        if (event.target !== event.currentTarget) return;
        const pan = 100;
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setCenter((point) => ({ ...point, y: point.y - pan }));
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setCenter((point) => ({ ...point, y: point.y + pan }));
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          setCenter((point) => ({ ...point, x: point.x - pan }));
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          setCenter((point) => ({ ...point, x: point.x + pan }));
        }
      }}
      tabIndex={0}
    >
      <p id="accommodation-map-keyboard-help" className="sr-only">
        Com o mapa em foco, use as setas para movê-lo. Use Tab para acessar os imóveis e os
        controles do mapa.
        {pinPositions.some(({ isSpread }) => isSpread) &&
          ' Imóveis na mesma coordenada aparecem afastados visualmente e ligados ao ponto original.'}
      </p>
      <div className="absolute inset-0" aria-hidden="true">
        {tileLayout.map((tile) => (
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            draggable={false}
            onError={() =>
              setFailedTiles((current) =>
                current.includes(tile.key) ? current : [...current, tile.key],
              )
            }
            className="absolute h-64 w-64 max-w-none bg-[#e7ece8]"
            style={{
              left: tile.left,
              top: tile.top,
              visibility: failedTiles.includes(tile.key) ? 'hidden' : 'visible',
            }}
          />
        ))}
      </div>

      {pinPositions.some(({ isSpread, isReflowed }) => isSpread || isReflowed) && (
        <svg
          aria-hidden="true"
          focusable="false"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          {pinPositions
            .filter(({ isSpread, isReflowed }) => isSpread || isReflowed)
            .map(({ property, anchorX, anchorY, x, y }) => (
              <g key={`spread-link-${property.id}`}>
                <line x1={anchorX} y1={anchorY} x2={x} y2={y} stroke="white" strokeWidth="4" />
                <line
                  x1={anchorX}
                  y1={anchorY}
                  x2={x}
                  y2={y}
                  stroke="#c2410c"
                  strokeDasharray="2 3"
                  strokeWidth="1.5"
                />
              </g>
            ))}
          {pinPositions
            .filter(({ isSpreadGroupLead, isReflowed }) => isSpreadGroupLead || isReflowed)
            .map(({ property, anchorX, anchorY }) => (
              <circle
                key={`spread-anchor-${property.id}`}
                cx={anchorX}
                cy={anchorY}
                r="4"
                fill="white"
                stroke="#c2410c"
                strokeWidth="2"
              />
            ))}
        </svg>
      )}

      {pinPositions.map(({ property, x, y }) => {
        const isActive = activeProperty?.id === property.id;
        const displayTitle = getPublicPropertyTitle(property.title);
        const displayPrice = getPropertyDisplayPrice(property, hasSearchDates, showTotalWithTaxes);
        const pinPrice =
          displayPrice.kind === 'quote' || displayPrice.kind === 'reference'
            ? formatCurrency(displayPrice.amount, currency)
            : displayPrice.kind === 'select-dates'
              ? 'Ver preço'
              : 'Consultar';
        const pinPriceUnit =
          displayPrice.kind === 'quote'
            ? displayPrice.detail.startsWith('Total da estadia')
              ? 'total'
              : '/ noite'
            : displayPrice.kind === 'reference'
              ? '/ noite'
              : '';
        const accessiblePriceLabel =
          displayPrice.kind === 'quote'
            ? `${pinPrice}, ${displayPrice.detail}`
            : displayPrice.kind === 'reference'
              ? `${pinPrice} por noite, tarifa de referência`
              : displayPrice.message;
        const availabilityLabel = availabilityConfirmed
          ? `, disponível nas datas selecionadas para ${searchGuestCount} ${searchGuestCount === 1 ? 'hóspede' : 'hóspedes'}`
          : '';
        return (
          <button
            key={property.id}
            type="button"
            aria-label={`${displayTitle}, ${accessiblePriceLabel}${availabilityLabel}`}
            aria-pressed={isActive}
            aria-expanded={isActive}
            aria-controls={isActive ? activePropertyDetailsId : undefined}
            data-map-pin="true"
            onClick={() => {
              if (draggedSincePointerDown.current) return;
              setActiveProperty(property);
            }}
            className={`absolute z-10 inline-flex min-h-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden whitespace-nowrap rounded-full border-2 border-white px-3 py-1.5 text-xs font-extrabold shadow-lg transition-transform hover:z-20 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600 ${isCompactMap ? 'px-1 text-[10px]' : ''} ${isActive ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'}`}
            style={{
              left: x,
              top: y,
              ...(shouldReflowCompactPins
                ? {
                    width: `${Math.max(44, Math.min(isCompactMap ? 72 : 136, Math.floor((size.width - 16) / pinPositions.length - 4)))}px`,
                  }
                : {}),
            }}
          >
            <span>{pinPrice}</span>
            {pinPriceUnit && !isCompactMap && (
              <span
                aria-hidden="true"
                className={`ml-0.5 text-[9px] font-bold ${isActive ? 'text-white/75' : 'text-neutral-500'}`}
              >
                {pinPriceUnit}
              </span>
            )}
          </button>
        );
      })}

      <div
        role="status"
        aria-label={`${pinPositions.length} ${pinPositions.length === 1 ? 'acomodação' : 'acomodações'} no mapa`}
        className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-2xl border border-white/90 bg-white/90 px-3 py-2 text-xs font-bold text-neutral-800 shadow-md backdrop-blur-sm sm:left-4 sm:top-4 sm:px-4 [@media(max-width:639px)_and_(max-height:400px)]:max-w-[calc(100%-12rem)] [@media(max-width:360px)_and_(max-height:400px)]:top-0"
      >
        <MapPin className="h-4 w-4 shrink-0 text-orange-600" />
        <span
          aria-hidden="true"
          className="truncate [@media(max-width:639px)_and_(max-height:400px)]:hidden"
        >
          {pinPositions.length === 1
            ? '1 acomodação no mapa'
            : `${pinPositions.length} acomodações no mapa`}
        </span>
        <span
          aria-hidden="true"
          className="hidden truncate [@media(max-width:639px)_and_(max-height:400px)]:inline"
        >
          {pinPositions.length} {pinPositions.length === 1 ? 'imóvel' : 'imóveis'}
        </span>
      </div>

      {(validProperties.length === 0 ||
        (size.width > 0 && size.height > 0 && pinPositions.length === 0)) && (
        <div className="absolute left-1/2 top-1/2 z-20 flex w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-2xl border border-white/90 bg-white/95 px-5 py-4 text-center shadow-xl backdrop-blur-md">
          <p role="status" aria-live="polite" className="text-sm font-semibold text-neutral-800">
            {validProperties.length === 0
              ? 'Estes imóveis não têm coordenadas para aparecer no mapa. Use “Ver Lista” para consultar os resultados.'
              : 'Nenhum imóvel aparece nesta área do mapa. Enquadre os resultados para ver todos.'}
          </p>
          {validProperties.length > 0 && (
            <button
              type="button"
              onClick={() => fitProperties(INITIAL_ZOOM)}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-neutral-950 px-4 py-2 text-xs font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              Mostrar todos no mapa
            </button>
          )}
        </div>
      )}

      <div className="absolute right-3 top-3 z-20 flex flex-col gap-2 sm:right-4 sm:top-4 [@media(min-width:400px)_and_(max-height:400px)]:top-0 [@media(min-width:400px)_and_(max-height:400px)]:flex-row [@media(max-width:639px)_and_(max-height:400px)]:flex-row [@media(max-width:639px)_and_(max-height:400px)]:gap-1 [@media(max-width:639px)_and_(max-height:400px)]:top-0">
        <button
          type="button"
          onClick={() => zoomAt(zoom + 1)}
          aria-label="Aumentar zoom"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white bg-white/95 text-neutral-800 shadow-md hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomAt(zoom - 1)}
          aria-label="Diminuir zoom"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white bg-white/95 text-neutral-800 shadow-md hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => fitProperties(INITIAL_ZOOM)}
          aria-label="Enquadrar acomodações"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white bg-white/95 text-neutral-800 shadow-md hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          <LocateFixed className="h-4 w-4" />
        </button>
      </div>

      {tileLayout.length > 0 && failedTiles.length === tileLayout.length && (
        <div
          role="status"
          className="absolute inset-x-4 top-16 z-20 mx-auto max-w-sm rounded-xl bg-white/95 p-3 text-center text-xs text-neutral-700 shadow-lg"
        >
          Não foi possível carregar o mapa. Verifique sua conexão; os apartamentos continuam
          disponíveis na lista.
        </div>
      )}

      <div
        className="absolute bottom-2 left-2 z-10 rounded bg-white/85 px-1.5 py-1 text-[11px] text-neutral-700 shadow-sm [@media(max-width:639px)_and_(max-height:400px)]:bottom-0"
        onPointerDown={(event) => event.stopPropagation()}
      >
        ©{' '}
        <a
          className="underline"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>{' '}
        contributors
      </div>
      <button
        type="button"
        onClick={openMap}
        className="absolute bottom-2 right-2 z-10 flex min-h-11 items-center gap-1 rounded bg-white/90 px-3 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 [@media(max-width:639px)_and_(max-height:400px)]:bottom-0"
      >
        Abrir mapa <ExternalLink className="h-3 w-3" />
      </button>

      {activeProperty && (
        <div
          id={activePropertyDetailsId}
          role="region"
          aria-labelledby={`${activePropertyDetailsId}-title`}
          className="absolute bottom-10 left-1/2 z-30 w-[min(20rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-white bg-white/95 p-3 shadow-2xl backdrop-blur-xl sm:bottom-12 max-[639px]:top-3 max-[639px]:bottom-auto max-[639px]:max-h-[calc(100%-1.5rem)] max-[639px]:overflow-y-auto max-[639px]:overscroll-contain"
        >
          <div className="relative mb-2 aspect-[16/9] overflow-hidden rounded-xl bg-neutral-100 max-[639px]:h-20 max-[639px]:aspect-auto [@media(max-height:400px)]:hidden">
            {activeProperty.images[0] && (
              <img
                src={activeProperty.images[0]}
                alt={getPublicPropertyTitle(activeProperty.title)}
                className="h-full w-full object-cover"
              />
            )}
            {activeProperty.reviewsSynced && activeProperty.reviewCount > 0 && (
              <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-bold">
                <Star className="h-3 w-3 fill-current" />
                {activeProperty.rating.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-start gap-2">
            <p
              id={`${activePropertyDetailsId}-title`}
              className="min-w-0 flex-1 truncate text-sm font-extrabold text-neutral-900"
            >
              {getPublicPropertyTitle(activeProperty.title)}
            </p>
            <button
              type="button"
              onClick={() => setActiveProperty(null)}
              aria-label="Fechar detalhes do marcador"
              className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="truncate text-xs text-neutral-500">
            {activeProperty.location.neighborhood}, {activeProperty.location.city}
          </p>
          {availabilityConfirmed && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800">
              <Check aria-hidden="true" className="h-3 w-3 shrink-0" />
              Disponível nas datas selecionadas para {searchGuestCount}{' '}
              {searchGuestCount === 1 ? 'hóspede' : 'hóspedes'}
            </p>
          )}
          {activePropertyAmenitySummary &&
            activePropertyAmenitySummary.visibleAmenities.length > 0 && (
              <ul
                aria-label={`Comodidades de ${getPublicPropertyTitle(activeProperty.title)}`}
                className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-semibold text-neutral-700 max-[639px]:hidden"
              >
                {activePropertyAmenitySummary.visibleAmenities.map((amenity) => (
                  <li key={amenity}>{amenity}</li>
                ))}
                {activePropertyAmenitySummary.remainingCount > 0 && (
                  <li className="text-neutral-500">
                    mais {activePropertyAmenitySummary.remainingCount}
                  </li>
                )}
              </ul>
            )}
          {activePropertyDisplayPrice && (
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-neutral-200 pt-2">
              <div className="min-w-0">
                {'amount' in activePropertyDisplayPrice ? (
                  <>
                    <strong className="text-sm">
                      {formatCurrency(activePropertyDisplayPrice.amount, currency)}
                    </strong>
                    <span className="ml-1 text-xs text-neutral-600">
                      {activePropertyDisplayPrice.detail}
                    </span>
                    {activePropertyDisplayPrice.kind === 'reference' && (
                      <p className="mt-0.5 text-[11px] text-neutral-500">
                        {activePropertyDisplayPrice.note}
                      </p>
                    )}
                  </>
                ) : (
                  <span className="text-xs font-semibold text-neutral-600">
                    {activePropertyDisplayPrice.message}
                  </span>
                )}
              </div>
              <button
                type="button"
                data-property-detail-trigger={activeProperty.id}
                onClick={() => onSelectProperty(activeProperty)}
                className="min-h-11 shrink-0 rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                Ver detalhes
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
};
