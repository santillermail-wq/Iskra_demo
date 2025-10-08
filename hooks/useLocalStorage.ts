// FIX: Import `React` to use its namespace for types like `React.Dispatch`.
import React, { useState, useEffect } from 'react';

function getStorageValue<T>(key: string, defaultValue: T): T {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(key);
    if (saved !== null && saved !== 'undefined') {
      try {
        return JSON.parse(saved) as T;
      } catch (error) {
        console.error('Error parsing JSON from localStorage for key:', key, error);
        return defaultValue;
      }
    }
  }
  return defaultValue;
}

export const useLocalStorage = <T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
  const [value, setValue] = useState<T>(() => {
    return getStorageValue(key, initialValue);
  });

  useEffect(() => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error('Error setting localStorage for key:', key, error);
    }
  }, [key, value]);

  return [value, setValue];
};