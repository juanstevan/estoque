import { Archivo, Lexend } from "next/font/google";

// The Chaleur design kit's type: Archivo (wide display caps) and Lexend (text).
export const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
export const lexend = Lexend({ subsets: ["latin"], variable: "--font-lexend" });
