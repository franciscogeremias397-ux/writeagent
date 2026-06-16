import { Controller, Get, Inject, Post, Query } from "@nestjs/common";
import { BackupsService } from "./backups.service.js";

@Controller("backups")
export class BackupsController {
  constructor(@Inject(BackupsService) private readonly backupsService: BackupsService) {}

  @Post("export")
  exportAll() {
    return this.backupsService.exportAll();
  }

  @Get()
  listBackups() {
    return this.backupsService.listBackups();
  }

  @Post("restore-latest")
  restoreLatest() {
    return this.backupsService.restoreLatest();
  }

  @Post("cleanup-imported")
  cleanupImported() {
    return this.backupsService.cleanupImportedAndVerificationData();
  }

  @Post("reset-starter")
  resetStarter() {
    return this.backupsService.resetToStarterData();
  }

  @Post("clear-cache")
  clearCache(@Query("dryRun") dryRun?: string) {
    return this.backupsService.clearRuntimeCache(dryRun === "true");
  }

  @Post("clear-logs")
  clearLogs(@Query("dryRun") dryRun?: string) {
    return this.backupsService.clearLocalLogs(dryRun === "true");
  }
}
