import { Body, Controller, Inject, Post } from "@nestjs/common";
import type { GeneratePlanInput, ReviseSceneDraftInput } from "@shenbi/shared";
import { WritingWorkflowService } from "./writing-workflow.service.js";

type RewriteBody = {
  markId: string;
  selectedText: string;
  feedback: string;
};

@Controller("writing")
export class WritingController {
  constructor(@Inject(WritingWorkflowService) private readonly writingWorkflow: WritingWorkflowService) {}

  @Post("inspiration")
  createFromInspiration(@Body() body: GeneratePlanInput) {
    return this.writingWorkflow.createFromInspiration(body);
  }

  @Post("auto")
  createFromParameters(@Body() body: GeneratePlanInput) {
    return this.writingWorkflow.createFromParameters(body);
  }

  @Post("rewrite-mark")
  rewriteMark(@Body() body: RewriteBody) {
    return this.writingWorkflow.rewriteMark(body);
  }

  @Post("revise-scene")
  reviseScene(@Body() body: ReviseSceneDraftInput) {
    return this.writingWorkflow.reviseScene(body);
  }
}
