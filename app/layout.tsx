import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingModal from "@/components/FloatingModal";
import GlobalSuccessToast from "@/components/GlobalSuccessToast";
import AppearanceController from "@/components/AppearanceController";

export const metadata: Metadata = {
  title: "CampusVoice",
  description: "Your Voice. Your Space. Your Story.",
  icons: { icon: "/campusvoice-logo.jpg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppearanceController />
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        {modal}
        <Footer />
        <Suspense fallback={null}>
          <GlobalSuccessToast />
        </Suspense>
      </body>
    </html>
  );
}
