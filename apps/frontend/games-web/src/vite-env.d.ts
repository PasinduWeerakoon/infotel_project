/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Test environments only: the main display link (both games' QR codes, then the live wheel or box).
   * When set, opening the games web address on a big screen goes there.
   */
  readonly VITE_TEST_DISPLAY_URL?: string;
}
