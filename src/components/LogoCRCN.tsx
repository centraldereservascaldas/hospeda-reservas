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
    sm: { icon: 34, title: 'text-sm', sub: 'text-[9px]', subtitle: 'text-[10px]' },
    md: { icon: 44, title: 'text-base', sub: 'text-[10px]', subtitle: 'text-[11px]' },
    lg: { icon: 56, title: 'text-lg', sub: 'text-[11px]', subtitle: 'text-[13px]' },
    xl: { icon: 72, title: 'text-2xl', sub: 'text-xs', subtitle: 'text-sm' },
  }[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Exact Vector Emblem of the Attendant with Headset and Split Circle */}
      <div 
        className={`relative flex items-center justify-center rounded-2xl p-1 transition-all ${
          variant === 'glass' 
            ? 'bg-white/70 backdrop-blur-xl border border-white/80 shadow-[0_8px_20px_-4px_rgba(249,115,22,0.25)]' 
            : 'bg-white shadow-sm'
        }`}
        style={{ width: dimensions.icon + 10, height: dimensions.icon + 10 }}
      >
        <svg
          width={dimensions.icon}
          height={dimensions.icon}
          viewBox="0 0 160 160"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-xs"
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
          <path
            d="M 72 92 L 80 114 L 88 92 Z"
            fill="#ffffff"
          />

          {/* Tie in Onyx */}
          <path
            d="M 77 106 L 83 106 L 85 126 L 75 126 Z"
            fill="#18181b"
          />

          {/* Head & Neck Silhouette */}
          <path
            d="M 68 84 L 68 96 L 92 96 L 92 84 Z"
            fill="#18181b"
          />
          <circle
            cx="80"
            cy="62"
            r="22"
            fill="#18181b"
          />
          {/* Inner face cutout */}
          <ellipse
            cx="80"
            cy="62"
            rx="16"
            ry="18"
            fill="#ffffff"
          />

          {/* Headset Band in Hot Springs Orange */}
          <path
            d="M 63 60 C 63 46 70 38 80 38 C 90 38 97 46 97 60"
            stroke="#f97316"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Headset Left Ear Cushion */}
          <rect
            x="59"
            y="54"
            width="6"
            height="16"
            rx="3"
            fill="#f97316"
          />

          {/* Headset Right Ear Cushion */}
          <rect
            x="95"
            y="54"
            width="6"
            height="16"
            rx="3"
            fill="#f97316"
          />

          {/* Headset Microphone Arm & Mic */}
          <path
            d="M 98 64 C 98 78 89 84 81 83"
            stroke="#f97316"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <circle
            cx="79"
            cy="83"
            r="4"
            fill="#ea580c"
          />
        </svg>
      </div>

      {/* Typography from Logo */}
      {showText && (
        <div className={`flex flex-col text-left leading-none select-none ${responsiveText ? 'hidden md:flex' : ''}`}>
          <span className={`font-black tracking-[0.16em] text-neutral-900 ${dimensions.title}`}>
            CENTRAL
          </span>
          <div className="flex items-center gap-1 my-0.5">
            <span className="h-[1px] w-2 bg-orange-500/80 inline-block" />
            <span className={`font-extrabold uppercase tracking-widest text-orange-500 ${dimensions.sub}`}>
              DE RESERVAS
            </span>
            <span className="h-[1px] w-2 bg-orange-500/80 inline-block" />
          </div>
          <span className={`font-extrabold uppercase tracking-[0.18em] text-orange-600 ${dimensions.subtitle}`}>
            CALDAS NOVAS
          </span>
        </div>
      )}
    </div>
  );
};
