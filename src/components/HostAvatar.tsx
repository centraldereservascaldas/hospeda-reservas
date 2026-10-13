import React, { useEffect, useState } from 'react';
import { LogoCRCN } from './LogoCRCN';

interface HostAvatarProps {
  src?: string;
  alt: string;
  className?: string;
}

export const HostAvatar: React.FC<HostAvatarProps> = ({ src, alt, className = '' }) => {
  const [hasError, setHasError] = useState(!src);

  useEffect(() => setHasError(!src), [src]);

  return (
    <div
      className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${className}`}
    >
      <LogoCRCN showText={false} size="sm" variant="light" className="scale-[0.82]" />
      {src && !hasError && (
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          className="absolute inset-0 z-10 h-full w-full rounded-full object-cover"
        />
      )}
    </div>
  );
};
