'use client';

import { createContext, useContext } from 'react';

export const LaunchpadContext = createContext<{ open: () => void; close: () => void; toggle: () => void; shown: boolean; expanded: boolean; setExpanded: (expanded: boolean) => void }>({ open: () => {}, close: () => {}, toggle: () => {}, shown: false, expanded: false, setExpanded: () => {} });
export const useLaunchpad = () => useContext(LaunchpadContext);
