import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import type { StoryPlan } from "@shenbi/shared";
import { type CreateWorkInput, type UpdateWorkInput, WorksService } from "./works.service.js";

@Controller("works")
export class WorksController {
  constructor(@Inject(WorksService) private readonly worksService: WorksService) {}

  @Get()
  listWorks() {
    return this.worksService.listWorks();
  }

  @Get(":id")
  getWork(@Param("id") id: string) {
    return this.worksService.getWork(id);
  }

  @Post()
  createWork(@Body() body: CreateWorkInput) {
    return this.worksService.createWork(body);
  }

  @Patch(":id")
  updateWork(@Param("id") id: string, @Body() body: UpdateWorkInput) {
    return this.worksService.updateWork(id, body);
  }

  @Delete(":id")
  deleteWork(@Param("id") id: string) {
    return this.worksService.deleteWork(id);
  }

  @Post("from-plan")
  savePlan(@Body() plan: StoryPlan) {
    return this.worksService.savePlan(plan);
  }

  @Post(":id/full-text")
  updateFullText(@Param("id") id: string, @Body() body: { fullText?: string; storyPlan?: StoryPlan }) {
    return this.worksService.updateFullText(id, body.fullText ?? "", body.storyPlan);
  }

  @Post(":id/export-workspace")
  exportWorkspace(@Param("id") id: string) {
    return this.worksService.exportWorkspace(id);
  }
}
