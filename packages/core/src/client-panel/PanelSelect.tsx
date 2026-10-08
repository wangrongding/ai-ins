import { type KeyboardEvent as ReactKeyboardEvent, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { checkIcon, chevronDownIcon, Icon } from './icons'

export type PanelSelectOption = {
  disabled?: boolean
  /** Short trailing note, e.g. why an option is unavailable. */
  hint?: string
  label: string
  value: string
}

type PanelSelectProps = {
  ariaLabel: string
  /** Stretch the trigger to its container (form fields) instead of hugging the label (toolbars). */
  block?: boolean
  disabled?: boolean
  options: PanelSelectOption[]
  /** The composer sits at the bottom of the panel, so menus open upward by default. */
  placement?: 'bottom' | 'top'
  title?: string
  value: string
  onChange: (value: string) => void
}

/** Close a popup when the pointer goes down anywhere outside `rootRef`. */
export function usePanelDismiss(open: boolean, rootRef: RefObject<HTMLElement | null>, onDismiss: () => void) {
  useEffect(() => {
    if (!open) return

    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onDismiss()
      }
    }

    document.addEventListener('pointerdown', dismissOnOutsidePointer, true)
    return () => document.removeEventListener('pointerdown', dismissOnOutsidePointer, true)
  }, [open, rootRef, onDismiss])
}

/**
 * A listbox-style dropdown that matches the panel theme. A native `<select>`
 * cannot style its arrow spacing or its popup, which renders as the OS menu.
 */
export function PanelSelect({ ariaLabel, block, disabled, options, placement = 'top', title, value, onChange }: PanelSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = options[selectedIndex]

  usePanelDismiss(open, rootRef, () => setOpen(false))

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  function findEnabledIndex(from: number, step: number) {
    for (let offset = 1; offset <= options.length; offset += 1) {
      const index = (from + step * offset + options.length * offset) % options.length
      if (!options[index]?.disabled) return index
    }
    return -1
  }

  function openMenu() {
    if (disabled) return
    setActiveIndex(selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : findEnabledIndex(-1, 1))
    setOpen(true)
  }

  function commit(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    setOpen(false)
    triggerRef.current?.focus()
    if (option.value !== value) onChange(option.value)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') {
      if (!open) return
      // The overlay closes the whole panel on Escape; React's root listener
      // runs first on that same node, so stop it here. Also keep an enclosing
      // popover (the settings dialog) from closing along with this menu.
      event.preventDefault()
      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation()
      setOpen(false)
      return
    }

    if (event.key === 'Tab') {
      setOpen(false)
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openMenu()
        return
      }
      setActiveIndex((current) => findEnabledIndex(current, event.key === 'ArrowDown' ? 1 : -1))
      return
    }

    if (event.key === 'Home' || event.key === 'End') {
      if (!open) return
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? findEnabledIndex(-1, 1) : findEnabledIndex(options.length, -1))
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) {
        commit(activeIndex)
      } else {
        openMenu()
      }
    }
  }

  return (
    <div className={`ai-ins-dropdown${block ? ' ai-ins-dropdown-block' : ''}`} ref={rootRef}>
      <button
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`ai-ins-dropdown-trigger${open ? ' ai-ins-dropdown-trigger-open' : ''}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        title={title}
        type="button"
      >
        <span className="ai-ins-dropdown-value">{selected?.label ?? ''}</span>
        <Icon paths={chevronDownIcon} />
      </button>
      {open ? (
        <ul aria-label={ariaLabel} className={`ai-ins-dropdown-menu ai-ins-dropdown-menu-${placement}`} id={listId} role="listbox">
          {options.map((option, index) => (
            <li
              aria-disabled={option.disabled || undefined}
              aria-selected={option.value === value}
              className={`ai-ins-dropdown-option${index === activeIndex ? ' ai-ins-dropdown-option-active' : ''}${
                option.value === value ? ' ai-ins-dropdown-option-selected' : ''
              }${option.disabled ? ' ai-ins-dropdown-option-disabled' : ''}`}
              id={`${listId}-${index}`}
              key={option.value}
              // Keep focus on the trigger so keyboard navigation keeps working.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(index)}
              onPointerEnter={() => {
                if (!option.disabled) setActiveIndex(index)
              }}
              role="option"
              title={option.disabled ? option.hint : undefined}
            >
              <span className="ai-ins-dropdown-check">{option.value === value ? <Icon paths={checkIcon} /> : null}</span>
              <span className="ai-ins-dropdown-label">{option.label}</span>
              {option.hint ? <span className="ai-ins-dropdown-hint">{option.hint}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
