import React from 'react';
import type {LayoutProps} from './types.js';

/** formula-focus：公式居中放大聚焦，下方变量表与算例（visual 承载整块）。 */
export const FormulaFocusLayout: React.FC<LayoutProps> = ({content}) => {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {content.visual}
    </div>
  );
};
