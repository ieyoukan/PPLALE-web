'use client';

import { useEffect } from 'react';
import { setUpPwa } from '@/lib/pwa';

/** In the root layout, so the install prompt is kept whichever page the visit starts on. */
export function PwaSetup() {
  useEffect(setUpPwa, []);
  return null;
}
