import { Decision } from "../../generated/prisma";
import { DEFAULT_THRESHOLD, REVIEW_MARGIN } from "../config/constants";

export function decideVerification(finalScore: number, threshold: number = DEFAULT_THRESHOLD): Decision {
  if (finalScore >= threshold) return "VERIFIED";
  if (finalScore >= threshold - REVIEW_MARGIN) return "PENDING_SUPERVISOR_REVIEW";
  return "REJECTED";
}
