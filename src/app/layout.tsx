import type { Metadata } from "next";
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/instrument-sans/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "BookLeaf Author Support",
  description: "Author support and communication portal for BookLeaf Publishing",
  icons: { icon: "/logo.png" }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
