import React from 'react';

interface LogoCRCNProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark' | 'glass';
  responsiveText?: boolean;
}

export const LogoCRCN: React.FC<LogoCRCNProps> = ({
  className = '',
  showText = true,
  size = 'md',
  variant = 'glass',
  responsiveText = false,
}) => {
  // Dimensions map
  const dimensions = {
    sm: { icon: 36, title: 'text-sm', sub: 'text-[9px]', subtitle: 'text-[10px]' },
    md: { icon: 48, title: 'text-base', sub: 'text-[10px]', subtitle: 'text-[11px]' },
    lg: { icon: 56, title: 'text-lg', sub: 'text-[11px]', subtitle: 'text-[13px]' },
    xl: { icon: 72, title: 'text-2xl', sub: 'text-xs', subtitle: 'text-sm' },
  }[size];

  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      {/* Exact Vector Emblem of the Attendant with Headset and Split Circle */}
      <div
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[0.95rem] p-1 transition-all ${
          variant === 'glass'
            ? 'border border-neutral-200/90 bg-white/85 shadow-[0_8px_24px_-10px_rgba(194,65,12,0.48),inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-xl'
            : variant === 'dark'
              ? 'border border-white/20 bg-neutral-950 shadow-lg'
              : 'border border-neutral-200/90 bg-white shadow-[0_5px_16px_-10px_rgba(15,23,42,0.5)]'
        }`}
        style={{ width: dimensions.icon + 10, height: dimensions.icon + 10 }}
      >
        <svg
          width={dimensions.icon}
          height={dimensions.icon}
          viewBox="0 0 160 160"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="block drop-shadow-xs"
        >
          {/* Outer Ring Left Arc - Onyx Black */}
          <path
            d="M 80 14 A 66 66 0 0 0 80 146"
            stroke="#18181b"
            strokeWidth="11"
            strokeLinecap="round"
          />

          {/* Outer Ring Right Arc - Hot Springs Golden Orange */}
          <path
            d="M 80 14 A 66 66 0 0 1 80 146"
            stroke="#f97316"
            strokeWidth="11"
            strokeLinecap="round"
          />

          {/* Suit Collar / Shoulders */}
          <path
            d="M 44 126 C 44 102 58 92 73 92 L 87 92 C 102 92 116 102 116 126 Z"
            fill="#18181b"
          />

          {/* White Shirt / Neck opening */}
          <path d="M 72 92 L 80 114 L 88 92 Z" fill="#ffffff" />

          {/* Tie in Onyx */}
          <path d="M 77 106 L 83 106 L 85 126 L 75 126 Z" fill="#18181b" />

          {/* Head & Neck Silhouette */}
          <path d="M 68 84 L 68 96 L 92 96 L 92 84 Z" fill="#18181b" />
          <circle cx="80" cy="62" r="22" fill="#18181b" />
          {/* Inner face cutout */}
          <ellipse cx="80" cy="62" rx="16" ry="18" fill="#ffffff" />

          {/* Headset Band in Hot Springs Orange */}
          <path
            d="M 63 60 C 63 46 70 38 80 38 C 90 38 97 46 97 60"
            stroke="#f97316"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Headset Left Ear Cushion */}
          <rect x="59" y="54" width="6" height="16" rx="3" fill="#f97316" />

          {/* Headset Right Ear Cushion */}
          <rect x="95" y="54" width="6" height="16" rx="3" fill="#f97316" />

          {/* Headset Microphone Arm & Mic */}
          <path
            d="M 98 64 C 98 78 89 84 81 83"
            stroke="#f97316"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="79" cy="83" r="4" fill="#ea580c" />
        </svg>
      </div>

      {/* Typography from Logo */}
      {showText && (
        <div
          className={`min-w-0 flex-col items-center justify-center select-none text-center leading-none ${responsiveText ? 'hidden md:flex' : 'flex'}`}
        >
          <span
            className={`w-full whitespace-nowrap font-black tracking-[0.12em] text-neutral-900 ${dimensions.title}`}
          >
            CENTRAL
          </span>
          <div className="my-0.5 flex w-full items-center justify-center gap-1.5">
            <span className="inline-block h-px w-2.5 bg-orange-500/70" />
            <span
              className={`whitespace-nowrap font-extrabold uppercase tracking-[0.14em] text-orange-600 ${dimensions.sub}`}
            >
              DE RESERVAS
            </span>
            <span className="inline-block h-px w-2.5 bg-orange-500/70" />
          </div>
          <span
            className={`w-full whitespace-nowrap font-extrabold uppercase tracking-[0.13em] text-orange-700 ${dimensions.subtitle}`}
          >
            CALDAS NOVAS
          </span>
        </div>
      )}
    </div>
  );
};
