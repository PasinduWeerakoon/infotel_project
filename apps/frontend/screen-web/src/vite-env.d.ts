/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL of the stall screen API in AWS. Same host as the page when not set. */
  readonly VITE_SCREENS_WS_URL?: string;
  /** Test environments only: Games web app address. When set, game logos show a QR code */
  readonly VITE_QR_GAMES_URL?: string;
  /** Test environments only: Treasure Hunt web app address. When set, stall logos show a QR code */
  readonly VITE_QR_HUNT_URL?: string;
}
