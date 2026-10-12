/**
 * The window's one tooltip (design.md, Microinteractions): a pop-plane label
 * under the control. It waits 800ms for the pointer, which may only be
 * passing, and shows at once for keyboard focus, which is asking. Text
 * written `Label  K` (two spaces) sets K as a key.
 */
const HOVER_DELAY_MS = 800;
let el: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function render(text: string): void {
  el ??= Object.assign(document.createElement('div'), { className: 'tip' });
  el.setAttribute('role', 'tooltip');
  const [label, key] = text.split('  ');
  el.replaceChildren(document.createTextNode(label));
  if (key) {
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    el.append(kbd);
  }
  if (!el.isConnected) document.body.append(el);
}

function place(anchor: Element): void {
  if (!el) return;
  const a = anchor.getBoundingClientRect();
  const t = el.getBoundingClientRect();
  const left = Math.min(Math.max(8, a.left + a.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
  const below = a.bottom + 6;
  const top = below + t.height > window.innerHeight - 8 ? a.top - t.height - 6 : below;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function hide(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  el?.remove();
}

export function tip(node: HTMLElement, text: string | null | undefined) {
  let current = text;
  const show = (delay: number) => {
    if (!current) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      render(current!);
      place(node);
    }, delay);
  };
  const onEnter = () => show(HOVER_DELAY_MS);
  const onFocus = () => {
    if (node.matches(':focus-visible')) show(0);
  };
  node.addEventListener('mouseenter', onEnter);
  node.addEventListener('mouseleave', hide);
  node.addEventListener('mousedown', hide);
  node.addEventListener('focus', onFocus);
  node.addEventListener('blur', hide);
  return {
    update(next: string | null | undefined) {
      current = next;
    },
    destroy() {
      hide();
      node.removeEventListener('mouseenter', onEnter);
      node.removeEventListener('mouseleave', hide);
      node.removeEventListener('mousedown', hide);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', hide);
    },
  };
}

/**
 * The same tooltip for elements made outside Svelte (a reply's board keys):
 * one listener on the container, the text read from what is under the
 * pointer.
 */
export function tipWithin(node: HTMLElement, options: { selector: string; text: (el: HTMLElement) => string | null | undefined }) {
  let current = options;
  let over: HTMLElement | null = null;
  const onOver = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(current.selector);
    if (target === over) return;
    hide();
    over = target && node.contains(target) ? target : null;
    const text = over ? current.text(over) : null;
    if (!over || !text) return;
    const anchor = over;
    timer = setTimeout(() => {
      render(text);
      place(anchor);
    }, HOVER_DELAY_MS);
  };
  const onLeave = () => {
    over = null;
    hide();
  };
  node.addEventListener('mouseover', onOver);
  node.addEventListener('mouseleave', onLeave);
  node.addEventListener('mousedown', onLeave);
  return {
    update(next: typeof options) {
      current = next;
    },
    destroy() {
      onLeave();
      node.removeEventListener('mouseover', onOver);
      node.removeEventListener('mouseleave', onLeave);
      node.removeEventListener('mousedown', onLeave);
    },
  };
}
