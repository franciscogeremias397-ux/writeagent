import { Body, Controller, GoneException, Inject, Post } from "@nestjs/common";
import type { ReviseSceneDraftInput } from "@shenbi/shared";
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
  createFromInspiration() {
    throw new GoneException("旧版灵感写作接口已停用，请使用 /api/generate/full-draft。");
  }

  @Post("auto")
  createFromParameters() {
    throw new GoneException("旧版自动写作接口已停用，请使用 /api/generate/full-draft。");
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
