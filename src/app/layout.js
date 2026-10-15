import "./globals.css";
import { LanguageProvider } from "../context/LanguageContext";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  title: "CareBridge — India-Wide Multilingual Telemedicine Platform",
  description:
    "Connect with verified doctors, book scheduled appointments, and consult via secure video in English and Hindi from anywhere in India.",
  keywords: [
    "CareBridge",
    "telemedicine India",
    "online doctor consultation",
    "video doctor appointment",
    "multilingual telehealth",
    "verified doctors India",
  ],
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col selection:bg-brand-mint selection:text-brand-emerald-dark">
        <LanguageProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
