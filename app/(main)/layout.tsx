import { AppShell } from "@/components/layout/AppShell";
import { MuiThemeProvider } from "@/components/providers/MuiThemeProvider";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <MuiThemeProvider>
      <AppShell>{children}</AppShell>
    </MuiThemeProvider>
  );
}
