import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusableIn = (root) =>
  Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => !el.hasAttribute('hidden'));

/**
 * Accessible modal dialog: moves focus inside, traps Tab, closes with Escape or a click on the
 * backdrop, locks page scroll and gives focus back to whatever opened it.
 * `initialFocus` is a ref to the element that should receive focus first (default: the first
 * focusable one, which is the close button unless `closable` is false).
 */
export default function Modal({
  title,
  onClose,
  children,
  footer,
  role = 'dialog',
  size = 'md',
  closable = true,
  initialFocus,
  className = '',
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    const first = initialFocus?.current ?? focusableIn(dialog)[0] ?? dialog;
    first.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
    // Focus management only runs when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && closable) {
      event.stopPropagation();
      closeRef.current?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableIn(dialogRef.current);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialogRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closable && event.target === event.currentTarget) closeRef.current?.();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal modal--${size} ${className}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="modal__header">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          {closable && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <Icon name="close" size={20} />
            </button>
          )}
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
