import { describe, it, expect } from 'vitest';
import { getCursorState, CURSOR_COLOR_ON_MESH, CURSOR_COLOR_DEFAULT, } from './cursorState.js';

describe('getCursorState', () => {

  it.each([
    { hasHit: true,  isHovering: true,  color: CURSOR_COLOR_ON_MESH, ringVisible: true  },
    { hasHit: true,  isHovering: false, color: CURSOR_COLOR_DEFAULT, ringVisible: false },
    { hasHit: false, isHovering: true,  color: CURSOR_COLOR_DEFAULT, ringVisible: true  },
    { hasHit: false, isHovering: false, color: CURSOR_COLOR_DEFAULT, ringVisible: false },
  ])('hasHit=$hasHit, isHovering=$isHovering', ({ hasHit, isHovering, color, ringVisible }) => {
    expect(getCursorState({ hasHit, isHovering })).toEqual({ color, ringVisible });
  });

  it('as duas cores são diferentes', () => {
    expect(CURSOR_COLOR_ON_MESH).not.toBe(CURSOR_COLOR_DEFAULT);
  });

});