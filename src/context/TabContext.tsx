import React, { createContext, useContext, useState, ReactNode } from 'react';

type TabType = 'canvas' | 'feedback';

interface TabContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

export const useTabContext = () => {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTabContext must be used within a TabProvider');
  }
  return context;
};

interface TabProviderProps {
  children: ReactNode;
}

export const TabProvider: React.FC<TabProviderProps> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<TabType>('canvas');

  return (
    <TabContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabContext.Provider>
  );
}; 