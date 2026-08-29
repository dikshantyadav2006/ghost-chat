declare module "jsqr" {
  export interface QRLocation {
    x: number;
    y: number;
  }

  export interface QRCode {
    binaryData: number[];
    data: string;
    chunks: { type: number; text: string }[];
    version: number;
    location: {
      topRightCorner: QRLocation;
      topLeftCorner: QRLocation;
      bottomRightCorner: QRLocation;
      bottomLeftCorner: QRLocation;
      topRightFinderPattern: QRLocation;
      topLeftFinderPattern: QRLocation;
      bottomLeftFinderPattern: QRLocation;
    };
  }

  export interface Options {
    inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst";
    canBeUsed?: (data: Uint8ClampedArray) => boolean;
    tryWithoutScanline?: boolean;
  }

  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: Options,
  ): QRCode | null;
}
