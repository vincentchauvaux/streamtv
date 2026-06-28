import type { SessionUser } from "./auth";
import { recommendationService } from "./services/recommendation.service";

export async function getRecommendations(user: SessionUser, limit = 12) {
  return recommendationService.getRecommendations(user, limit);
}
