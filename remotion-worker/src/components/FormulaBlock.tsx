/**
 * Formula block: KaTeX rendering of `formula` + Math.js live evaluation of
 * `numeric_example` (DSL §4.4, spec: 公式修改直接反映计算结果).
 *
 * numeric_example convention: a mathjs-evaluable expression renders as
 * `<expr> = <result>`; anything else is shown verbatim (free text allowed).
 */
import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {evaluate} from 'mathjs';
import type {Variable} from '../parser/types.js';
import {useTheme} from './ThemeProvider.js';

export function evaluateExample(example: string): string {
  try {
    const result = evaluate(example);
    const num = typeof result === 'number' ? result : Number(result);
    if (Number.isFinite(num)) {
      const rounded = Math.abs(num) >= 1000 ? num.toFixed(1) : Number(num.toPrecision(4));
      return `${example} = ${rounded}`;
    }
    return example;
  } catch {
    return example;
  }
}

export const FormulaBlock: React.FC<{
  formula?: string;
  variables?: Variable[];
  numericExample?: string;
  derivation?: string;
}> = ({formula, variables, numericExample, derivation}) => {
  const {colors, fonts} = useTheme();

  const html = formula
    ? katex.renderToString(formula, {
        throwOnError: false,
        displayMode: true,
        output: 'html',
      })
    : null;

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 36,
      }}
    >
      {html ? (
        <div
          style={{
            color: colors.text,
            fontSize: 56,
            backgroundColor: colors.surface,
            border: `2px solid ${colors.primary}`,
            borderRadius: 20,
            padding: '32px 64px',
          }}
          // KaTeX emits trusted markup from the formula string.
          dangerouslySetInnerHTML={{__html: html}}
        />
      ) : null}

      {variables && variables.length > 0 ? (
        <div style={{display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center'}}>
          {variables.map((v) => (
            <div key={v.symbol} style={{display: 'flex', gap: 12, alignItems: 'baseline'}}>
              <span
                style={{
                  color: colors.accent,
                  fontFamily: fonts.number.family,
                  fontWeight: fonts.number.weight,
                  fontSize: 30,
                }}
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(v.symbol, {throwOnError: false}),
                }}
              />
              <span
                style={{
                  color: colors.textMuted,
                  fontFamily: fonts.body.family,
                  fontWeight: fonts.body.weight,
                  fontSize: 26,
                }}
              >
                {v.meaning}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {numericExample ? (
        <div
          style={{
            color: colors.success,
            fontFamily: fonts.number.family,
            fontWeight: fonts.number.weight,
            fontSize: 34,
          }}
        >
          {evaluateExample(numericExample)}
        </div>
      ) : null}

      {derivation ? (
        <div
          style={{
            color: colors.secondary,
            fontFamily: fonts.body.family,
            fontWeight: fonts.body.weight,
            fontSize: 24,
          }}
        >
          {derivation}
        </div>
      ) : null}
    </div>
  );
};
