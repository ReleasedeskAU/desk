import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Poppins, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const COLOR_THEME_PREPAINT_SCRIPT = `(() => {
  const themes = ["sky", "indigo", "emerald", "violet", "graphite", "amber"];
  let theme = "sky";
  let mode = "light";
  try {
    const cached = localStorage.getItem("sentinel-color-theme");
    if (themes.includes(cached)) theme = cached;
    const cachedMode = localStorage.getItem("sentinel-theme-mode");
    if (cachedMode === "dark" || cachedMode === "semi-dark") mode = "dark";
  } catch {
    theme = "sky";
    mode = "light";
  }
  const root = document.documentElement;
  root.dataset.colorTheme = theme;
  root.dataset.theme = mode;
  root.classList.add("theme-" + mode);
  root.style.colorScheme = mode;
})();`;

const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-poppins",
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Sentinel — Release Management",
  description: "AI-powered release command center for software engineering teams",
  icons: {
    icon: "/sentinel-logo.png",
    apple: "/sentinel-logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en" data-color-theme="sky" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_THEME_PREPAINT_SCRIPT }} />
      </head>
      <body className={`${poppins.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ClerkProvider
          {...(publishableKey ? { publishableKey } : {})}
          afterSignOutUrl="/sign-in"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
          signInForceRedirectUrl="/dashboard"
          signUpForceRedirectUrl="/dashboard"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
