"use client";

import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import { AlertTriangle, Calendar, CheckCircle2, Flag, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ReleaseStatusCounts = {
  planned: number;
  blocked: number;
  shipped: number;
  atRisk: number;
  inProgress: number;
};

type TileConfig = {
  key: keyof ReleaseStatusCounts;
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
};

/** Coarse buckets from lifecycle kind mapping (not hardcoded status names). */
const TILES: TileConfig[] = [
  { key: "planned", label: "Early / planned", icon: Calendar, color: "#3b5bdb", bg: "rgba(59, 91, 219, 0.12)" },
  { key: "blocked", label: "Interrupt", icon: AlertTriangle, color: "#ba1a1a", bg: "rgba(186, 26, 26, 0.12)" },
  { key: "shipped", label: "Shipped / closed", icon: CheckCircle2, color: "#40c057", bg: "rgba(64, 192, 87, 0.12)" },
  { key: "atRisk", label: "Branch / risk", icon: Flag, color: "#fab005", bg: "rgba(250, 176, 5, 0.14)" },
  { key: "inProgress", label: "In progress", icon: Package, color: "#228be6", bg: "rgba(34, 139, 230, 0.12)" },
];

export function ReleaseStatusTiles({
  counts,
  heading,
  onTileClick,
}: {
  counts: ReleaseStatusCounts;
  heading: string;
  onTileClick?: (key: keyof ReleaseStatusCounts) => void;
}) {
  const theme = useTheme();

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2.5 }} color="text.primary">
        {heading}
      </Typography>
      <Grid container spacing={2.5} columns={{ xs: 12, sm: 12, md: 12, lg: 10 }}>
        {TILES.map(({ key, label, icon: Icon, color, bg }) => (
          <Grid key={key} size={{ xs: 12, sm: 6, md: 4, lg: 2 }}>
            <Box
              component={onTileClick ? "button" : "div"}
              type={onTileClick ? "button" : undefined}
              onClick={onTileClick ? () => onTileClick(key) : undefined}
              sx={{
                p: 2.5,
                width: "100%",
                height: "100%",
                textAlign: "left",
                borderRadius: 2,
                border: `1px solid ${alpha(color, 0.28)}`,
                bgcolor: theme.palette.mode === "dark" ? alpha(color, 0.08) : bg,
                boxShadow: theme.palette.mode === "dark" ? "0 2px 10px rgba(19,17,32,0.35)" : "0 2px 10px rgba(46,38,61,0.06)",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
                cursor: onTileClick ? "pointer" : "default",
                "&:hover": onTileClick
                  ? {
                      transform: "translateY(-2px)",
                      boxShadow: theme.palette.mode === "dark" ? "0 6px 16px rgba(19,17,32,0.45)" : "0 6px 16px rgba(46,38,61,0.1)",
                    }
                  : undefined,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: alpha(color, 0.16),
                    color,
                  }}
                >
                  <Icon size={20} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: "text.secondary" }}>
                  {label}
                </Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, color, lineHeight: 1.1 }}>
                {counts[key]}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
