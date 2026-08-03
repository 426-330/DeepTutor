/**
 * Theme provider (DSL §5/§11.3, design D3): the parser-resolved StyleChain is
 * injected via React context; scene/layout components read colors, fonts and
 * effects ONLY from here — zero hardcoded hex in components.
 */
import React, {createContext, useContext} from 'react';
import {resolveGlobalStyle} from '../parser/styleChain.js';
import type {ResolvedStyle} from '../parser/types.js';

const FALLBACK_STYLE = resolveGlobalStyle();

export const ThemeContext = createContext<ResolvedStyle>(FALLBACK_STYLE);

export const ThemeProvider: React.FC<{
  value: ResolvedStyle;
  children: React.ReactNode;
}> = ({value, children}) => (
  <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
);

export const useTheme = (): ResolvedStyle => useContext(ThemeContext);
