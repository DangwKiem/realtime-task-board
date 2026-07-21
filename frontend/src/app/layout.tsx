import type { Metadata } from "next";
import type { ReactNode } from "react";

import AuthProvider from "@/components/auth-provider"


import "./globals.css";


export const metadata: Metadata = {
  title: "Realtime Task Board",
  description:
    "Next.js frontend kết nối FastAPI",
};


interface RootLayoutProps {
  children: ReactNode;
}


export default function RootLayout({
  children,
}: RootLayoutProps) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}