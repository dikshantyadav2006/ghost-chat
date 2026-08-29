import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import UnreadTitle from "@/components/UnreadTitle";
import Toasts from "@/components/Toast";
import PwaBootstrap from "@/components/PwaBootstrap";
import CallModal from "@/components/CallModal";

const SITE_URL = "https://chat.dikshantyadav.in";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "GhostChat - End-to-End Encrypted Messaging & File Sharing",
    template: "%s | GhostChat",
  },
  description:
    "End-to-end encrypted messaging, file sharing, voice notes, voice calls and video calls. No permanent server-side message storage.",
  keywords: [
    "chat app",
    "encrypted chat",
    "private messaging",
    "file sharing",
    "ghostchat",
    "p2p chat",
    "secure messaging",
  ],
  applicationName: "GhostChat",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "GhostChat",
    title: "GhostChat - End-to-End Encrypted Messaging & File Sharing",
    description: "End-to-end encrypted messaging, file sharing, voice notes, voice calls and video calls.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "GhostChat - End-to-end encrypted messaging and file sharing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GhostChat",
    description: "End-to-end encrypted messaging and file sharing.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GhostChat",
  },
};

export const viewport: Viewport = {
  themeColor: "#121315",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full w-full">
        <PwaBootstrap />
        <UnreadTitle />
        {children}
        <Toasts />
        <CallModal />
      </body>
    </html>
  );
}
