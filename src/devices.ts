/**
 * The screens an actor can record on. Viewports are CSS pixels of the real screen; a recording
 * is made at that size (WebKit pads rather than scales anything larger).
 */

export interface Device {
  id: string;
  label: string;
  browserName: "chromium" | "webkit";
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent: string;
}

const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const PIXEL_7_UA = "Mozilla/5.0 (Linux; Android 16; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
// Chrome on a tablet sends no "Mobile" token.
const PIXEL_TABLET_UA = "Mozilla/5.0 (Linux; Android 16; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export const DEVICES: readonly Device[] = [
  { id: "iphone-se", label: "iPhone SE", browserName: "webkit", viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA },
  { id: "iphone-15", label: "iPhone 15", browserName: "webkit", viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA },
  { id: "pixel-7", label: "Pixel 7", browserName: "chromium", viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: PIXEL_7_UA },
  { id: "tablet-landscape", label: "Pixel Tablet (landscape)", browserName: "chromium", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, userAgent: PIXEL_TABLET_UA },
  { id: "tablet-portrait", label: "Pixel Tablet (portrait)", browserName: "chromium", viewport: { width: 800, height: 1280 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, userAgent: PIXEL_TABLET_UA },
  { id: "ipad-landscape", label: "iPad (landscape)", browserName: "webkit", viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, userAgent: IPAD_UA },
  { id: "desktop", label: "Desktop", browserName: "chromium", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, userAgent: DESKTOP_UA },
];
