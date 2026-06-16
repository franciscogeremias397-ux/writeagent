import { Body, Controller, Delete, Get, Inject, Param, Post } from "@nestjs/common";
import { EditorService } from "./editor.service.js";

@Controller()
export class EditorController {
  constructor(@Inject(EditorService) private readonly editorService: EditorService) {}

  @Get("works/:id/marks")
  listMarks(@Param("id") workId: string) {
    return this.editorService.listMarks(workId);
  }

  @Post("marks")
  createMark(@Body() body: Parameters<EditorService["createMark"]>[0]) {
    return this.editorService.createMark(body);
  }

  @Delete("marks/:id")
  deleteMark(@Param("id") markId: string) {
    return this.editorService.deleteMark(markId);
  }

  @Get("works/:id/versions")
  listVersions(@Param("id") workId: string) {
    return this.editorService.listVersions(workId);
  }

  @Post("editor/apply-rewrite")
  applyRewrite(@Body() body: Parameters<EditorService["applyRewrite"]>[0]) {
    return this.editorService.applyRewrite(body);
  }
}
