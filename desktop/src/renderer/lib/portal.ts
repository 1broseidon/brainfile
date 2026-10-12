/**
 * Lifts an element to the end of the body, out of any pane that clips or
 * scrolls, so a menu opened from inside a pane shows above everything.
 */
export function portal(node: HTMLElement) {
  document.body.append(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
