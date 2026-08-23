import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Vercel App",
    description: "A Next.js starter ready to deploy on Vercel.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
          <html lang="en" className="h-full antialiased">
                <body className="min-h-full flex flex-col font-sans">{children}
                </body>
          </html>
        );
}
