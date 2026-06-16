import { Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { DatasourcesService } from "./datasources.service.js";

@Controller()
export class DatasourcesController {
  constructor(@Inject(DatasourcesService) private readonly datasourcesService: DatasourcesService) {}

  @Get("datasources")
  listDatasources() {
    return this.datasourcesService.listDatasources();
  }

  @Post("datasources")
  createDatasource(@Body() body: Parameters<DatasourcesService["createDatasource"]>[0]) {
    return this.datasourcesService.createDatasource(body);
  }

  @Patch("datasources/:id")
  updateDatasource(@Param("id") id: string, @Body() body: Parameters<DatasourcesService["updateDatasource"]>[1]) {
    return this.datasourcesService.updateDatasource(id, body);
  }

  @Get("crawler/jobs")
  listJobs() {
    return this.datasourcesService.listJobs();
  }

  @Get("crawler/jobs/:id")
  getJob(@Param("id") id: string) {
    return this.datasourcesService.getJob(id);
  }

  @Post("crawler/jobs/:id/screenshot-correction")
  correctScreenshotJob(@Param("id") id: string, @Body() body: Parameters<DatasourcesService["correctScreenshotJob"]>[1]) {
    return this.datasourcesService.correctScreenshotJob(id, body);
  }

  @Post("crawler/jobs/:id/retry")
  retryCrawlerJob(@Param("id") id: string) {
    return this.datasourcesService.retryCrawlerJob(id);
  }

  @Post("crawler/jobs")
  runCrawlerJob(@Body() body: Parameters<DatasourcesService["runCrawlerJob"]>[0]) {
    return this.datasourcesService.runCrawlerJob(body);
  }

  @Post("datasources/import-csv")
  importCsv(@Body() body: Parameters<DatasourcesService["importCsv"]>[0]) {
    return this.datasourcesService.importCsv(body);
  }

  @Post("datasources/import-text")
  importText(@Body() body: Parameters<DatasourcesService["importText"]>[0]) {
    return this.datasourcesService.importText(body);
  }

  @Post("datasources/authorized-capture")
  runAuthorizedCapture(@Body() body: Parameters<DatasourcesService["runAuthorizedCapture"]>[0]) {
    return this.datasourcesService.runAuthorizedCapture(body);
  }

  @Post("datasources/browser-capture-sessions")
  startBrowserCaptureSession(@Body() body: Parameters<DatasourcesService["startBrowserCaptureSession"]>[0]) {
    return this.datasourcesService.startBrowserCaptureSession(body);
  }

  @Get("datasources/browser-capture-sessions/:id")
  getBrowserCaptureSession(@Param("id") id: string) {
    return this.datasourcesService.getBrowserCaptureSession(id);
  }

  @Post("datasources/browser-capture-sessions/:id/open")
  openBrowserCaptureSession(@Param("id") id: string) {
    return this.datasourcesService.openBrowserCaptureSession(id);
  }

  @Post("datasources/browser-capture-sessions/:id/preview-visible-page")
  previewBrowserCaptureSessionVisiblePage(@Param("id") id: string) {
    return this.datasourcesService.previewBrowserCaptureSessionVisiblePage(id);
  }

  @Post("datasources/browser-capture-sessions/:id/read-visible-page")
  readBrowserCaptureSessionVisiblePage(@Param("id") id: string) {
    return this.datasourcesService.readBrowserCaptureSessionVisiblePage(id);
  }

  @Post("datasources/browser-capture-sessions/:id/visible-text")
  submitBrowserCaptureSession(@Param("id") id: string, @Body() body: Parameters<DatasourcesService["submitBrowserCaptureSession"]>[1]) {
    return this.datasourcesService.submitBrowserCaptureSession(id, body);
  }

  @Post("datasources/import-public-page")
  importPublicPage(@Body() body: Parameters<DatasourcesService["importPublicPage"]>[0]) {
    return this.datasourcesService.importPublicPage(body);
  }

  @Post("datasources/import-screenshot")
  importScreenshot(@Body() body: Parameters<DatasourcesService["importScreenshot"]>[0]) {
    return this.datasourcesService.importScreenshot(body);
  }
}
