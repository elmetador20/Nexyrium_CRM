import { z } from "zod";
import { ACQUISITION_SOURCES } from "./acquisition-source";

export const acquisitionSourceSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim().toLowerCase() || undefined : value,
  z.enum(ACQUISITION_SOURCES).optional(),
);
