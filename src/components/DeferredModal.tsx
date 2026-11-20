import React, { useEffect, useState } from 'react';
import { LazyFeatureBoundary } from './LazyFeatureBoundary';

interface DeferredModalProps {
  active: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const DeferredModal: React.FC<DeferredModalProps> = ({ active, children, fallback }) => {
  const [hasOpened, setHasOpened] = useState(active);

  useEffect(() => {
    if (active) setHasOpened(true);
  }, [active]);

  return hasOpened || active ? (
    <LazyFeatureBoundary overlay={active} visible={active} fallback={fallback}>
      {children}
    </LazyFeatureBoundary>
  ) : null;
};
