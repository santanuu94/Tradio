import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tradio | Autonomous AI Trading Dashboard",
  description: "Tradio - Autonomous paper-trading, market regime analysis & genetic evolution dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="sky" />
        <div className="sun" />
        {children}
      </body>
    </html>
  );
}
