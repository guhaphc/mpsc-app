import type { ReactNode } from "react";
import "./globals.css";

export const metadata={title:"MPSC ALL-IN-ONE",description:"Complete MPSC Preparation Platform"};

export default function RootLayout({children}:{children:ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}