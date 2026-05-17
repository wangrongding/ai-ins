import type { ReactNode } from 'react'

type IconButtonProps = {
  children: ReactNode
  disabled?: boolean
  label: string
  success?: boolean
  onClick: () => void
}

export function Icon({ paths }: { paths: string[] }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      {paths.map((path) => (
        <path d={path} key={path} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      ))}
    </svg>
  )
}

export function IconButton({ children, disabled, label, success, onClick }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`wbx-ai-ins-icon-button${success ? ' wbx-ai-ins-icon-button-success' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

export const copyIcon = [
  'M8 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z',
  'M4 14H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1',
]

export const checkIcon = ['M20 6 9 17l-5-5']

export const codeIcon = ['M7 8 3 12l4 4', 'm17 8 4 4-4 4', 'm14 4-4 16']

export const maximizeIcon = ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M16 21h3a2 2 0 0 0 2-2v-3', 'M3 16v3a2 2 0 0 0 2 2h3']

export const minimizeIcon = ['M8 3v3a2 2 0 0 1-2 2H3', 'M16 3v3a2 2 0 0 0 2 2h3', 'M16 21v-3a2 2 0 0 1 2-2h3', 'M8 21v-3a2 2 0 0 0-2-2H3']

export const arrowDownIcon = ['M12 5v14', 'm19 12-7 7-7-7']

export const sunIcon = [
  'M12 4V2',
  'M12 22v-2',
  'm4.95-14.95 1.41-1.41',
  'M5.64 18.36l1.41-1.41',
  'M20 12h2',
  'M2 12h2',
  'm16.36 18.36-1.41-1.41',
  'M5.64 5.64l1.41 1.41',
  'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
]

export const moonIcon = ['M20.99 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.78 9.79Z']

export const folderIcon = [
  'M3 7h5l2 2h11v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z',
  'M3 7V5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v2',
]
