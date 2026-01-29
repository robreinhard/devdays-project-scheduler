'use client';

import * as React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { useServerInsertedHTML } from 'next/navigation';
import theme from './theme';

// Create Emotion cache for client-side
const createEmotionCache = () => {
  return createCache({ key: 'mui' });
};

interface ThemeRegistryProps {
  children: React.ReactNode;
}

const ThemeRegistry = ({ children }: ThemeRegistryProps) => {
  const [emotionCache] = React.useState(() => {
    const cache = createEmotionCache();
    cache.compat = true;
    return cache;
  });

  useServerInsertedHTML(() => {
    const names = Object.keys(emotionCache.inserted);
    if (names.length === 0) {
      return null;
    }

    let styles = '';
    for (const name of names) {
      const inserted = emotionCache.inserted[name];
      if (typeof inserted === 'string') {
        styles += inserted;
      }
    }

    return (
      <style
        key={emotionCache.key}
        data-emotion={`${emotionCache.key} ${names.join(' ')}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
};

export default ThemeRegistry;
