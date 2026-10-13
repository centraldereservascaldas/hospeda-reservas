import React, { useEffect, useState } from 'react';
import { LazyFeatureBoundary } from './LazyFeatureBoundary';

interface DeferredModalProps {
  active: boolean;
  children: React.ReactNode;
}

export const DeferredModal: React.FC<DeferredModalProps> = ({ active, children }) => {
  const [hasOpened, setHasOpened] = useState(active);

  useEffect(() => {
    if (active) setHasOpened(true);
  }, [active]);

  return hasOpened ? (
    <LazyFeatureBoundary overlay={active} visible={active}>
      {children}
    </LazyFeatureBoundary>
  ) : null;
};
