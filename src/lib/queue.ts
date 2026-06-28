import { logger } from "@/lib/logger";
import { scanService } from "@/lib/services/scan.service";
import { epgService } from "@/lib/services/epg.service";

export type JobType = "SCAN" | "IMPORT" | "REFRESH_EPG" | "HEALTH_CHECK";

export type ScanJobPayload = {
  playlistId: string;
  type?: "IMPORT" | "RESCAN";
  skipOnlineCheck?: boolean;
};

export type EpgJobPayload = {
  playlistId: string;
  epgUrl: string;
};

export type HealthCheckPayload = {
  playlistId: string;
};

export type JobPayload = ScanJobPayload | EpgJobPayload | HealthCheckPayload;

export interface JobQueue {
  enqueue(jobType: JobType, payload: JobPayload): void;
}

async function runJob(jobType: JobType, payload: JobPayload): Promise<void> {
  logger.info(`Job démarré: ${jobType}`, payload);

  try {
    switch (jobType) {
      case "SCAN":
      case "IMPORT": {
        const p = payload as ScanJobPayload;
        const type = jobType === "IMPORT" ? "IMPORT" : (p.type ?? "RESCAN");
        await scanService.scanPlaylist(p.playlistId, type, {
          skipOnlineCheck: p.skipOnlineCheck,
        });
        break;
      }
      case "REFRESH_EPG": {
        const p = payload as EpgJobPayload;
        await epgService.syncPlaylistEpg(p.playlistId, p.epgUrl);
        break;
      }
      case "HEALTH_CHECK": {
        const p = payload as HealthCheckPayload;
        await scanService.scanPlaylist(p.playlistId, "RESCAN", {
          skipOnlineCheck: false,
        });
        break;
      }
    }
    logger.info(`Job terminé: ${jobType}`, payload);
  } catch (error) {
    logger.error(`Job échoué: ${jobType}`, {
      payload,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

class InMemoryJobQueue implements JobQueue {
  enqueue(jobType: JobType, payload: JobPayload): void {
    setTimeout(() => {
      void runJob(jobType, payload);
    }, 0);
  }
}

export const jobQueue: JobQueue = new InMemoryJobQueue();
