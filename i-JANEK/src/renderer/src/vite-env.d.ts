/// <reference types="vite/client" />

declare global {
  interface Window {
    janek: import('@shared/ipc').JanekApi
  }
}

export {}
