export const CURSOR_COLOR_ON_MESH = 0xcc0000;
export const CURSOR_COLOR_DEFAULT = 0xcc6600;


export function getCursorState({ hasHit, isHovering }) {
  return {
    color: hasHit && isHovering ? CURSOR_COLOR_ON_MESH : CURSOR_COLOR_DEFAULT,
    ringVisible: isHovering,
  };
}