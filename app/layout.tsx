import type { Metadata } from "next";
import { PageTransition } from "@/components/page-transition";
import "./globals.css";
export const metadata: Metadata = {
  title: "Ambagan — Save in ambagan",
  description: "Non-custodial testnet savings powered by Paiflow",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Alex+Brush&family=Anonymous+Pro:wght@700&family=Chivo:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Dancing+Script:wght@600;700&family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Poppins:wght@300;500;600&family=Roboto+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <PageTransition />
        {children}
      </body>
    </html>
  );
}
