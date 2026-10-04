import type { Metadata, Viewport } from "next";
import { Russo_One, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const display = Russo_One({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
  weight: "400",
});

const body = Nunito_Sans({
  variable: "--font-body",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Бастион — фэнтезийная башенная защита",
  description:
    "«Бастион»: расставляйте башни, стрите казармы и ведите героя в бой. 12 карт кампании, 6 башен, бесконечный режим и дерево улучшений.",
  icons: {
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='#1a2317'/><path d='M32 6 54 14v16c0 14-10 22-22 28C20 52 10 44 10 30V14z' fill='#e8b54d'/><path d='M32 12 48 17.5V30c0 10.5-7 16.8-16 21.8-9-5-16-11.3-16-21.8V17.5z' fill='#8c2f2a'/><rect x='29' y='24' width='6' height='18' rx='2' fill='#f3e9d2'/><rect x='23' y='30' width='18' height='6' rx='2' fill='#f3e9d2'/></svg>`,
      ),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${display.variable} ${body.variable} antialiased bg-[#10150e] text-[#f3e9d2] font-[family-name:var(--font-body)]`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
