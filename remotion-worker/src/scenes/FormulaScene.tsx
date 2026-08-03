import React from 'react';
import {FormulaBlock} from '../components/FormulaBlock.js';
import type {Variable} from '../parser/types.js';
import type {SceneProps} from './types.js';
import {SceneShell} from './SceneShell.js';

/** formula — KaTeX 公式 + 变量表 + Math.js 实时计算算例（§4.4）。 */
export const FormulaScene: React.FC<SceneProps> = ({scene}) => {
  return (
    <SceneShell
      scene={scene}
      content={{
        visual: (
          <FormulaBlock
            formula={scene.slots.formula as string | undefined}
            variables={scene.slots.variables as Variable[] | undefined}
            numericExample={scene.slots.numeric_example as string | undefined}
            derivation={scene.slots.derivation as string | undefined}
          />
        ),
      }}
    />
  );
};
