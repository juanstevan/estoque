import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Estoque — Inventário e Armazém",
  description: "Sistema interno de gestão de inventário e armazém",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="app-shell min-h-full flex flex-col">
        <AppNav />
        <main style={{ flex: 1 }}>{children}</main>
      </body>
    </html>
  );
}
