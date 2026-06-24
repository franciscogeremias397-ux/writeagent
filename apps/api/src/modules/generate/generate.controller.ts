import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import type { FullDraftInput, StoryOutlineInput } from "@shenbi/shared";
import { GenerateService } from "./generate.service.js";

@Controller("generate")
export class GenerateController {
  constructor(@Inject(GenerateService) private readonly generateService: GenerateService) {}

  @Post("full-draft")
  createFullDraft(@Body() body: FullDraftInput) {
    return this.generateService.startFullDraftJob(body);
  }

  @Post("story-outline")
  createStoryOutline(@Body() body: StoryOutlineInput) {
    return this.generateService.createStoryOutline(body);
  }

  @Get("jobs/:jobId")
  getFullDraftJob(@Param("jobId") jobId: string) {
    return this.generateService.getFullDraftJob(jobId);
  }

  @Post("jobs/:jobId/resume")
  resumeFullDraftJob(@Param("jobId") jobId: string) {
    return this.generateService.resumeFullDraftJob(jobId);
  }
}
