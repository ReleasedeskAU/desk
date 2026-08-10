"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import { Rocket, Sparkles } from "lucide-react";
import Link from "next/link";
import { MaterioCard } from "./MaterioCard";

type UpgradePlanCardProps = {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function UpgradePlanCard({
  title = "Explore releases",
  description = "Open the release portfolio to review status, readiness, and blockers from your seeded workspace data.",
  ctaLabel = "Browse releases",
  ctaHref = "/releases",
}: UpgradePlanCardProps) {
  const theme = useTheme();

  return (
    <MaterioCard
      sx={{
        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.16)} 0%, ${alpha(theme.palette.primary.main, 0.04)} 100%)`,
        borderColor: alpha(theme.palette.primary.main, 0.24),
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", py: 1 }}>
        <Box
          sx={{
            width: 88,
            height: 88,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            color: "primary.main",
            mb: 2,
          }}
        >
          <Rocket size={40} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }} gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 280 }}>
          {description}
        </Typography>
        <Button
          component={Link}
          href={ctaHref}
          variant="contained"
          color="primary"
          startIcon={<Sparkles size={16} />}
          sx={{ px: 3 }}
        >
          {ctaLabel}
        </Button>
      </Box>
    </MaterioCard>
  );
}
