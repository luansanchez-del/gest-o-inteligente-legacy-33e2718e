import { createFileRoute } from "@tanstack/react-router";
import { LegacyApp } from "../legacy/legacy-app";

export const Route = createFileRoute("/$")({
  component: LegacyApp,
});
