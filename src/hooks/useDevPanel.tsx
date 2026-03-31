import { createContext, useContext, ReactNode, useState, useMemo, useCallback } from 'react';
import { QueryMode, LanguageName } from '@/types/devPanel';
import { STORAGE_KEYS } from '@/lib/constants';

interface DevPanelContextType {
  isDevMode: boolean;
  toggleDevMode: () => void;
  activeLanguage: LanguageName;
  setActiveLanguage: (lang: LanguageName) => void;
  queryMode: QueryMode;
  setQueryMode: (mode: QueryMode) => void;
}

const DevPanelContext = createContext<DevPanelContextType | undefined>(undefined);

export const DevPanelProvider = ({ children }: { children: ReactNode }) => {
  const [isDevMode, setIsDevMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEYS.DEV_MODE_ENABLED);
      return stored !== null ? stored === 'true' : true; // default true
    }
    return true;
  });

  const [activeLanguage, setActiveLanguageState] = useState<LanguageName>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEYS.DEV_ACTIVE_LANGUAGE);
      if (stored && ['python', 'java', 'nodejs', 'csharp', 'go'].includes(stored)) {
        return stored as LanguageName;
      }
    }
    return 'python';
  });

  const [queryMode, setQueryModeState] = useState<QueryMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEYS.DEV_QUERY_MODE);
      if (stored && ['cql', 'dataapi', 'tableapi'].includes(stored)) {
        return stored as QueryMode;
      }
    }
    return 'cql';
  });

  const toggleDevMode = useCallback(() => {
    setIsDevMode((prev) => {
      const newValue = !prev;
      localStorage.setItem(STORAGE_KEYS.DEV_MODE_ENABLED, String(newValue));
      return newValue;
    });
  }, []);

  const setActiveLanguage = useCallback((lang: LanguageName) => {
    setActiveLanguageState(lang);
    localStorage.setItem(STORAGE_KEYS.DEV_ACTIVE_LANGUAGE, lang);
  }, []);

  const setQueryMode = useCallback((mode: QueryMode) => {
    setQueryModeState(mode);
    localStorage.setItem(STORAGE_KEYS.DEV_QUERY_MODE, mode);
  }, []);

  const contextValue = useMemo(
    () => ({ isDevMode, toggleDevMode, activeLanguage, setActiveLanguage, queryMode, setQueryMode }),
    [isDevMode, toggleDevMode, activeLanguage, setActiveLanguage, queryMode, setQueryMode]
  );

  return (
    <DevPanelContext.Provider value={contextValue}>
      {children}
    </DevPanelContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useDevPanel = () => {
  const context = useContext(DevPanelContext);
  if (context === undefined) {
    throw new Error('useDevPanel must be used within a DevPanelProvider');
  }
  return context;
};
