import type { Metadata } from "next";
import "./globals.css";
import "./dashboard.css";
export const metadata: Metadata = { title: "CommerceDesk — Commerce, connected", description: "A unified commerce and customer operations workspace." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
