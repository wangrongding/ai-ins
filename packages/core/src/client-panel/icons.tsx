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
      className={`ai-ins-icon-button${success ? ' ai-ins-icon-button-success' : ''}`}
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

export const plusIcon = ['M12 5v14', 'M5 12h14']

export const minusIcon = ['M5 12h14']

export const slidersIcon = ['M4 6h10', 'M18 6h2', 'M16 4v4', 'M4 12h4', 'M12 12h8', 'M10 10v4', 'M4 18h12', 'M20 18h0', 'M18 16v4']

export const chevronDownIcon = ['m6 9 6 6 6-6']

export const chevronRightIcon = ['m9 18 6-6-6-6']

export const externalLinkIcon = ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6']

export const closeIcon = ['M18 6 6 18', 'm6 6 12 12']

export const refreshIcon = ['M21 12a9 9 0 1 1-2.64-6.36L21 8', 'M21 3v5h-5']

export const searchIcon = ['m21 21-4.3-4.3', 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z']

export const globeIcon = ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z']

export const helpIcon = ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01']

export const pinIcon = [
  'M12 17v5',
  'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
]

export const pinOffIcon = [
  'M12 17v5',
  'M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89',
  'm2 2 20 20',
  'M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11',
]

export const trashIcon = ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2']
