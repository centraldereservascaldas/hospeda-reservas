import { useCallback, useEffect, useState } from 'react';
import { readSavedPropertyIds } from '../utils/savedPropertyIds';

const SAVED_PROPERTY_STORAGE_KEY = 'hospeda_wishlist';
type PropertyIdStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function useSavedPropertyIds(storage: PropertyIdStorage = window.localStorage) {
  const [savedPropertyIds, setSavedPropertyIds] = useState<string[]>(() =>
    readSavedPropertyIds(storage.getItem(SAVED_PROPERTY_STORAGE_KEY)),
  );

  useEffect(() => {
    storage.setItem(SAVED_PROPERTY_STORAGE_KEY, JSON.stringify(savedPropertyIds));
  }, [savedPropertyIds, storage]);

  const toggleSavedProperty = useCallback((propertyId: string) => {
    setSavedPropertyIds((current) =>
      current.includes(propertyId)
        ? current.filter((id) => id !== propertyId)
        : [...current, propertyId],
    );
  }, []);

  return { savedPropertyIds, toggleSavedProperty };
}
