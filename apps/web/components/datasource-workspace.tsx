"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Database, Eye, ExternalLink, FileImage, FileText, Globe, Monitor, RefreshCw, Search, Upload, X } from "lucide-react";
import type { AuthorizedCaptureResult, BrowserCaptureSession, CrawlerJobRecord, CsvImportResult, DatasourceRecord, DatasourceType } from "@shenbi/shared";
import { Badge, Button, Card, CardHeader, FieldLabel, GhostButton, SelectInput, TextInput } from "@/components/ui";
import {
  createDatasource,
  correctDatasourceScreenshotJob,
  getCrawlerJobs,
  getDatasources,
  getBrowserCaptureSession,
  importDatasourceCsv,
  importDatasourcePublicPage,
  importDatasourceScreenshot,
  importDatasourceText,
  openBrowserCaptureSession,
  previewBrowserCaptureSessionVisiblePage,
  retryDatasourceCrawlerJob,
  runAuthorizedDatasourceCapture,
  startBrowserCaptureSession,
  submitBrowserCaptureSessionVisibleText,
  updateDatasource
} from "@/lib/api";

const sampleCsv = `平台,作品名,题材,热度,增长率,机会分,饱和度,阅读量,收益,完读率,收藏,标签,原因
番茄短故事,她在废墟上开花,女性成长,96,12.4,91,48,1320000,438.6,71.2,50200,"现实女性,亲情冲突,反击",亲情冲突和克制反击仍有稳定读者反馈
番茄短故事,雾灯之后,悬疑惊悚,93,8.6,88,62,186000,36.8,58.4,6200,"强钩子,身份反转",短篇里强钩子和反转结尾更容易被读完`;

const sampleManualText = `番茄短故事｜女性成长｜热度96｜增长12.4｜机会91｜饱和48｜标签：现实女性、亲情冲突、反击｜原因：亲情冲突和克制反击仍有稳定读者反馈
番茄短故事 悬疑惊悚 热度93 增长8.6 机会88 饱和62 标签：强钩子、身份反转 原因：短篇里强钩子和反转结尾更容易被读完`;

const fanqieWriterZoneUrl = "https://fanqienovel.com/writer/zone";

const fanqieCsvTemplate = `平台,作品名,题材,阅读量,收益,完读率,收藏,评论反馈,评论关键词,发布时间
番茄小说,示例作品,女性成长,120000,438.6,71.2,6200,"读者喜欢克制反击，中段略慢","克制反击,节奏慢,亲情冲突",2026-06-14`;

const fanqieVisibleTextTemplate = `番茄作者后台可见数据
作品名：示例作品
题材：女性成长
阅读量：12万
收益：438.6
完读率：71.2%
收藏：6200
评论反馈：读者喜欢克制反击，中段略慢
评论关键词：克制反击、节奏慢、亲情冲突`;

const fanqieSelfTestVisibleText = `番茄作者后台可见数据自测
作品名：她把旧姓还给雨夜
平台：番茄小说
题材：女性成长
阅读量：18.6万
收益：812.5
完读率：73.4%
收藏：9400
评论反馈：读者喜欢女主克制反击和亲情冲突，中段有人反馈节奏略慢
评论关键词：克制反击、亲情冲突、节奏慢、现实质感

作品名：雾灯之后
平台：番茄小说
题材：悬疑惊悚
阅读量：9.8万
收益：356.2
完读率：61.5%
收藏：4100
评论反馈：强钩子和身份反转能留住读者，结尾信息差需要更清晰回收
评论关键词：强钩子、身份反转、信息差、反转

番茄短故事｜现实女性｜热度96｜增长12.4｜机会91｜饱和48｜标签：现实女性、亲情冲突、克制反击｜原因：授权样例显示克制反击和现实质感反馈稳定`;

const typeLabels: Record<DatasourceType, string> = {
  public_page: "公开页面",
  csv: "CSV 文件",
  screenshot: "截图",
  manual: "手动录入"
};

const statusLabels: Record<CrawlerJobRecord["status"], string> = {
  success: "成功",
  waiting: "等待",
  failed: "失败",
  running: "运行中"
};

type DatasourceFilter = DatasourceType | "all";
type JobStatusFilter = CrawlerJobRecord["status"] | "all";
type CsvFieldMapping = Record<string, string>;
type BrowserCaptureReadInfo = {
  visibleTextLength: number;
  capturedAt?: string;
  pageUrl?: string;
  imported: boolean;
};

export function DatasourceWorkspace() {
  const [datasources, setDatasources] = useState<DatasourceRecord[]>([]);
  const [jobs, setJobs] = useState<CrawlerJobRecord[]>([]);
  const [message, setMessage] = useState("正在读取数据源。");
  const [lastImportResult, setLastImportResult] = useState<CsvImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [datasourceQuery, setDatasourceQuery] = useState("");
  const [datasourceTypeFilter, setDatasourceTypeFilter] = useState<DatasourceFilter>("all");
  const [jobQuery, setJobQuery] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState<JobStatusFilter>("all");
  const [sourceName, setSourceName] = useState("手动新增数据源");
  const [sourceType, setSourceType] = useState<DatasourceType>("manual");
  const [sourceDetail, setSourceDetail] = useState("");
  const [frequency, setFrequency] = useState("手动");
  const [sourceEnabled, setSourceEnabled] = useState(true);
  const [note, setNote] = useState("用于记录后续要接入的数据来源。");
  const [csvName, setCsvName] = useState("题材热度 CSV");
  const [csvText, setCsvText] = useState(sampleCsv);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvFieldMappings, setCsvFieldMappings] = useState<CsvFieldMapping>({});
  const [publicPageName, setPublicPageName] = useState("公开榜单页面");
  const [publicPageUrl, setPublicPageUrl] = useState("");
  const [authorizedPageUrl, setAuthorizedPageUrl] = useState(fanqieWriterZoneUrl);
  const [authorizedVisibleText, setAuthorizedVisibleText] = useState("");
  const [browserCaptureSession, setBrowserCaptureSession] = useState<BrowserCaptureSession | null>(null);
  const [browserCapturePreview, setBrowserCapturePreview] = useState("");
  const [browserCaptureReadInfo, setBrowserCaptureReadInfo] = useState<BrowserCaptureReadInfo | null>(null);
  const [manualName, setManualName] = useState("平台文字粘贴");
  const [manualText, setManualText] = useState(sampleManualText);
  const [screenshotName, setScreenshotName] = useState("作者后台截图导入");
  const [screenshotFileName, setScreenshotFileName] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState("");
  const [screenshotText, setScreenshotText] = useState("");
  const [correctionTexts, setCorrectionTexts] = useState<Record<string, string>>({});
  const [correctingJobId, setCorrectingJobId] = useState("");
  const [retryingJobId, setRetryingJobId] = useState("");
  const [runningSourceId, setRunningSourceId] = useState("");
  const [togglingSourceId, setTogglingSourceId] = useState("");
  const authorizedVisibleTextRef = useRef<HTMLTextAreaElement | null>(null);
  const screenshotCorrectionRef = useRef<HTMLTextAreaElement | null>(null);

  const refresh = async () => {
    const [nextDatasources, nextJobs] = await Promise.all([getDatasources(), getCrawlerJobs()]);
    setDatasources(nextDatasources);
    setJobs(nextJobs);
  };

  useEffect(() => {
    refresh()
      .then(() => setMessage("已读取后端数据源和采集日志。"))
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "数据源服务暂时不可用。");
      });
  }, []);

  const handleCreateDatasource = async () => {
    setLoading(true);
    setMessage("正在新增数据源。");

    try {
      const result = await createDatasource({
        name: sourceName,
        type: sourceType,
        sourceDetail,
        frequency,
        note,
        enabled: sourceEnabled
      });
      await refresh();
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增数据源失败。");
    } finally {
      setLoading(false);
    }
  };

  const handleImportCsv = async () => {
    setLoading(true);
    setMessage("正在按字段映射导入 CSV，并提取可用的趋势数据。");

    try {
      const result = await importDatasourceCsv({ name: csvName, fileName: csvFileName, csvText, fieldMappings: csvFieldMappings });
      await refresh();
      setLastImportResult(result);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CSV 导入失败。");
    } finally {
      setLoading(false);
    }
  };

  const handleCsvFile = (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (!/\.(csv|txt)$/iu.test(file.name) && file.type && !["text/csv", "text/plain", "application/vnd.ms-excel"].includes(file.type)) {
      setMessage("请选择 CSV 或 TXT 文件。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setCsvText(result);
      setCsvFileName(file.name);
      setCsvName((currentName) => {
        const fallbackName = file.name.replace(/\.[^.]+$/u, "") || "题材热度 CSV";
        return currentName.trim() && currentName !== "题材热度 CSV" ? currentName : fallbackName;
      });
      setMessage(`已读取 CSV 文件：${file.name}。请先查看字段和预览，再确认导入。`);
    };
    reader.onerror = () => setMessage("读取 CSV 文件失败，请重新选择。");
    reader.readAsText(file);
  };

  const handleImportText = async () => {
    setLoading(true);
    setMessage("正在读取粘贴文字，并提取可用的趋势数据。");

    try {
      const result = await importDatasourceText({ name: manualName, rawText: manualText });
      await refresh();
      setLastImportResult(result);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "粘贴文字导入失败。");
    } finally {
      setLoading(false);
    }
  };

  const handleImportPublicPage = async () => {
    if (!publicPageUrl.trim()) {
      setMessage("请先填写公开网页地址。");
      return;
    }

    setLoading(true);
    setMessage("正在读取公开网页，并提取题材趋势线索。");

    try {
      const result = await importDatasourcePublicPage({ name: publicPageName, url: publicPageUrl });
      await refresh();
      setLastImportResult(result);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "公开网页采集失败。");
    } finally {
      setLoading(false);
    }
  };

  const handleScreenshotFile = (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("请选择 PNG、JPG、WEBP 或 GIF 截图。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setScreenshotDataUrl(result);
      setScreenshotFileName(file.name);
      setScreenshotName((currentName) => {
        const fallbackName = file.name.replace(/\.[^.]+$/u, "") || "作者后台截图导入";
        return currentName.trim() && currentName !== "作者后台截图导入" ? currentName : fallbackName;
      });
      setMessage(`已选择截图：${file.name}`);
    };
    reader.onerror = () => setMessage("读取截图失败，请重新选择。");
    reader.readAsDataURL(file);
  };

  const handleImportScreenshot = async () => {
    if (!screenshotDataUrl) {
      setMessage("请先选择一张截图。");
      return;
    }

    setLoading(true);
    setMessage(screenshotText.trim() ? "正在保存截图，并导入校正文字。" : "正在保存截图，并登记 OCR 占位任务。");

    try {
      const result = await importDatasourceScreenshot({
        name: screenshotName,
        fileName: screenshotFileName,
        dataUrl: screenshotDataUrl,
        recognizedText: screenshotText
      });
      await refresh();
      setLastImportResult(result);
      if (result.recognizedText?.trim()) {
        setScreenshotText(result.recognizedText.trim());
        setMessage(`${result.message} 已把识别文字放到校正框，方便你复核。文件：${result.storedPath}`);
      } else {
        setMessage(`${result.message} 文件：${result.storedPath}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "截图导入失败。");
    } finally {
      setLoading(false);
    }
  };

  const handleCorrectWaitingScreenshot = async (job: CrawlerJobRecord) => {
    const recognizedText = correctionTexts[job.id]?.trim() ?? "";

    if (!recognizedText) {
      setMessage("请先在等待截图卡片里粘贴截图文字或校正后的文字。");
      return;
    }

    setLoading(true);
    setCorrectingJobId(job.id);
    setMessage("正在按这段校正文字补全截图任务。");

    try {
      const result = await correctDatasourceScreenshotJob(job.id, { recognizedText });
      await refresh();
      setLastImportResult(result);
      setCorrectionTexts((current) => {
        const next = { ...current };
        delete next[job.id];
        return next;
      });
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "截图校正失败。");
    } finally {
      setCorrectingJobId("");
      setLoading(false);
    }
  };

  const handleRetryCrawlerJob = async (job: CrawlerJobRecord) => {
    setLoading(true);
    setRetryingJobId(job.id);
    setMessage("正在重试这条公开网页采集任务。");

    try {
      const result = await retryDatasourceCrawlerJob(job.id);
      await refresh();
      setLastImportResult(result);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重试采集任务失败。");
    } finally {
      setRetryingJobId("");
      setLoading(false);
    }
  };

  const handleRunDatasource = async (datasource: DatasourceRecord) => {
    if (datasource.type !== "public_page" || !datasource.sourceDetail) {
      setMessage("这条数据源没有可采集的公开网址。");
      return;
    }

    setLoading(true);
    setRunningSourceId(datasource.id);
    setMessage(`正在采集数据源：${datasource.name}`);

    try {
      const result = await importDatasourcePublicPage({ name: datasource.name, url: datasource.sourceDetail });
      await refresh();
      setLastImportResult(result);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "运行数据源采集失败。");
    } finally {
      setRunningSourceId("");
      setLoading(false);
    }
  };

  const handleToggleDatasource = async (datasource: DatasourceRecord) => {
    setLoading(true);
    setTogglingSourceId(datasource.id);
    setMessage(datasource.enabled ? `正在停用数据源：${datasource.name}` : `正在启用数据源：${datasource.name}`);

    try {
      const result = await updateDatasource(datasource.id, { enabled: !datasource.enabled });
      setDatasources((current) => current.map((item) => (item.id === result.datasource.id ? result.datasource : item)));
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新数据源状态失败。");
    } finally {
      setTogglingSourceId("");
      setLoading(false);
    }
  };

  const filteredDatasources = useMemo(() => {
    return datasources.filter((datasource) => {
      const matchesType = datasourceTypeFilter === "all" || datasource.type === datasourceTypeFilter;
      const matchesText = matchesSearch(datasourceQuery, [
        datasource.name,
        datasource.sourceDetail,
        datasource.note,
        datasource.frequency,
        typeLabels[datasource.type],
        datasource.enabled ? "启用" : "停用",
        datasource.persisted ? "已保存" : "临时"
      ]);

      return matchesType && matchesText;
    });
  }, [datasourceQuery, datasourceTypeFilter, datasources]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesStatus = jobStatusFilter === "all" || job.status === jobStatusFilter;
      const matchesText = matchesSearch(jobQuery, [
        job.name,
        job.failureReason,
        statusLabels[job.status],
        jobTypeLabel(job.type),
        job.lastRunAt
      ]);

      return matchesStatus && matchesText;
    });
  }, [jobQuery, jobStatusFilter, jobs]);

  const waitingScreenshotJobs = useMemo(() => jobs.filter((job) => job.type === "screenshot" && job.status === "waiting"), [jobs]);
  const csvPreview = useMemo(() => buildCsvPreview(csvText), [csvText]);

  useEffect(() => {
    setCsvFieldMappings(buildAutoCsvFieldMappings(csvPreview));
  }, [csvPreview]);

  const stats = useMemo(() => {
    const enabledCount = datasources.filter((datasource) => datasource.enabled).length;
    const importedRows = jobs.reduce((sum, job) => sum + job.successCount, 0);
    const successCount = jobs.filter((job) => job.status === "success").length;
    const waitingCount = jobs.filter((job) => job.status === "waiting").length;
    const failedCount = jobs.filter((job) => job.status === "failed").length;

    return {
      enabledCount,
      importedRows,
      successCount,
      waitingCount,
      failedCount
    };
  }, [datasources, jobs]);

  const hasDatasourceFilters = datasourceQuery.trim() || datasourceTypeFilter !== "all";
  const hasJobFilters = jobQuery.trim() || jobStatusFilter !== "all";
  const fanqieAuthorizedDatasource = useMemo(
    () =>
      datasources.find((datasource) => {
        const text = [datasource.name, datasource.note, datasource.sourceDetail].filter(Boolean).join(" ");
        return /番茄.*授权|授权.*番茄|fanqienovel\.com\/writer\/zone/u.test(text);
      }),
    [datasources]
  );
  const authorizedVisibleTextReady = authorizedVisibleText.trim().length > 0;

  const resetDatasourceFilters = () => {
    setDatasourceQuery("");
    setDatasourceTypeFilter("all");
  };

  const resetJobFilters = () => {
    setJobQuery("");
    setJobStatusFilter("all");
  };

  const createFanqieAuthorizedTask = async () => {
    const fanqieTask = {
      name: "番茄作者后台授权学习",
      type: "manual" as DatasourceType,
      sourceDetail: fanqieWriterZoneUrl,
      frequency: "登录后自动读取可见数据",
      enabled: true,
      note: "本地授权采集任务：用户自行完成登录、验证码和平台确认，Agent 只读取已经显示在浏览器里的作品表现、评论反馈、榜单和活动信息；不保存账号、密码、Cookie。"
    };

    setSourceName(fanqieTask.name);
    setSourceType(fanqieTask.type);
    setSourceDetail(fanqieTask.sourceDetail);
    setFrequency(fanqieTask.frequency);
    setSourceEnabled(fanqieTask.enabled);
    setNote(fanqieTask.note);
    setLoading(true);
    setMessage("正在创建番茄作者后台授权学习任务。");

    try {
      const result = await createDatasource(fanqieTask);
      await refresh();
      setMessage(`${result.message} 下一步接入本地浏览器执行器后，这条任务会负责读取你已登录后可见的数据。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建番茄授权学习任务失败。");
    } finally {
      setLoading(false);
    }
  };

  const startFanqieBrowserCapture = async () => {
    const pageUrl = authorizedPageUrl.trim() || fanqieWriterZoneUrl;

    setLoading(true);
    setMessage("正在创建番茄后台浏览器采集会话。");

    try {
      const result = await startBrowserCaptureSession({
        datasourceId: fanqieAuthorizedDatasource?.id,
        name: "番茄作者后台浏览器采集",
        pageUrl,
        platform: "番茄小说"
      });
      const openedResult = await openBrowserCaptureSession(result.session.id);
      await refresh();
      setBrowserCaptureSession(openedResult.session);
      setBrowserCapturePreview("");
      setBrowserCaptureReadInfo(null);
      if (result.capture) {
        setLastImportResult(result.capture);
      }
      setMessage(`${openedResult.message}${openedResult.nextStep ? ` ${openedResult.nextStep}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建浏览器采集会话失败。");
    } finally {
      setLoading(false);
    }
  };

  const refreshFanqieBrowserCapture = async () => {
    if (!browserCaptureSession) {
      setMessage("请先启动浏览器采集会话。");
      return;
    }

    setLoading(true);
    setMessage("正在刷新浏览器采集会话。");

    try {
      const result = await getBrowserCaptureSession(browserCaptureSession.id);
      await refresh();
      setBrowserCaptureSession(result.session);
      setMessage(`${result.message}${result.nextStep ? ` ${result.nextStep}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新浏览器采集会话失败。");
    } finally {
      setLoading(false);
    }
  };

  const previewFanqieBrowserVisiblePage = async () => {
    if (!browserCaptureSession) {
      setMessage("请先启动本地浏览器采集。");
      return;
    }

    setLoading(true);
    setMessage("正在读取本地浏览器当前可见页，读取后会先放到本页复核。");

    try {
      const result = await previewBrowserCaptureSessionVisiblePage(browserCaptureSession.id);
      await refresh();
      setBrowserCaptureSession(result.session);
      setBrowserCapturePreview(result.visibleTextPreview ?? "");
      setAuthorizedVisibleText(result.visibleText ?? "");
      setBrowserCaptureReadInfo({
        visibleTextLength: result.visibleTextLength,
        capturedAt: result.capturedAt,
        pageUrl: result.pageUrl,
        imported: false
      });
      setMessage(`${result.message}${result.nextStep ? ` ${result.nextStep}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取当前可见页失败。");
    } finally {
      setLoading(false);
    }
  };

  const runFanqieAuthorizedCapture = async () => {
    const visibleText = authorizedVisibleTextRef.current?.value ?? authorizedVisibleText;

    if (browserCaptureSession && visibleText.trim()) {
      setLoading(true);
      setMessage("正在把已复核的可见内容导入学习链路。");

      try {
        const result = await submitBrowserCaptureSessionVisibleText(browserCaptureSession.id, {
          visibleText,
          pageUrl: browserCaptureReadInfo?.pageUrl || authorizedPageUrl.trim() || fanqieWriterZoneUrl
        });
        await refresh();
        setBrowserCaptureSession(result.session);
        if (result.capture) {
          setLastImportResult(result.capture);
        }
        setBrowserCaptureReadInfo((current) =>
          current
            ? {
                ...current,
                imported: true
              }
            : {
                visibleTextLength: visibleText.length,
                pageUrl: authorizedPageUrl.trim() || fanqieWriterZoneUrl,
                imported: true
              }
        );
        setMessage(`${result.message}${result.nextStep ? ` ${result.nextStep}` : ""}`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "浏览器采集回填失败。");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setMessage(visibleText.trim() ? "正在识别番茄后台可见页数据。" : "正在登记番茄后台等待采集任务。");

    try {
      const result = await runAuthorizedDatasourceCapture({
        name: "番茄作者后台授权采集",
        pageUrl: authorizedPageUrl.trim() || fanqieWriterZoneUrl,
        visibleText
      });
      await refresh();
      setLastImportResult(result);
      setMessage(`${result.message}${result.nextStep ? ` ${result.nextStep}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "授权采集执行失败。");
    } finally {
      setLoading(false);
    }
  };

  const runFanqieAuthorizedSelfTest = async () => {
    setLoading(true);
    setAuthorizedVisibleText(fanqieSelfTestVisibleText);
    setBrowserCapturePreview(fanqieSelfTestVisibleText.replace(/\s+/g, " ").slice(0, 260));
    setBrowserCaptureReadInfo({
      visibleTextLength: fanqieSelfTestVisibleText.length,
      capturedAt: new Date().toISOString(),
      pageUrl: "local://fanqie-authorized-self-test",
      imported: false
    });
    setMessage("正在用本地样例跑授权采集自测。");

    try {
      const result = await runAuthorizedDatasourceCapture({
        name: "番茄授权采集本地自测",
        pageUrl: "local://fanqie-authorized-self-test",
        visibleText: fanqieSelfTestVisibleText
      });
      await refresh();
      setLastImportResult(result);
      setBrowserCaptureReadInfo({
        visibleTextLength: fanqieSelfTestVisibleText.length,
        capturedAt: new Date().toISOString(),
        pageUrl: result.pageUrl ?? "local://fanqie-authorized-self-test",
        imported: result.job.status === "success"
      });
      setMessage(`${result.message}${result.nextStep ? ` ${result.nextStep}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "授权采集自测失败。");
    } finally {
      setLoading(false);
    }
  };

  const prepareFanqieVisibleText = () => {
    setManualName("番茄后台可见页识别");
    setManualText(fanqieVisibleTextTemplate);
    setMessage("已准备番茄后台可见页识别模板。它是浏览器自动采集接入前的兜底入口，不是最终的自动化形态。");
    document.getElementById("manual-import")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const prepareFanqieScreenshot = () => {
    setScreenshotName("番茄作者后台可见页截图");
    setSourceType("screenshot");
    setMessage("已准备番茄后台截图识别入口。Agent 会优先读图识别，可见文字不清楚时再等你校正。");
    document.getElementById("screenshot-import")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const prepareFanqieCsv = () => {
    setCsvName("番茄作者后台作品表现");
    setCsvText(fanqieCsvTemplate);
    setCsvFileName("");
    setMessage("已准备番茄后台表格模板。这个入口只作为已有表格时的补充方式。");
    document.getElementById("csv-import")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid min-w-0 gap-5">
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SourceStat icon={<Database size={18} />} label="数据源" value={datasources.length} detail={`${stats.enabledCount} 个启用`} />
        <SourceStat icon={<CheckCircle2 size={18} />} label="成功任务" value={stats.successCount} detail={`累计识别 ${stats.importedRows} 行`} />
        <SourceStat icon={<Clock3 size={18} />} label="等待处理" value={stats.waitingCount} detail={waitingDetail(stats.waitingCount, waitingScreenshotJobs.length)} />
        <SourceStat icon={<AlertCircle size={18} />} label="失败任务" value={stats.failedCount} detail="可按原因排查" />
      </section>

      <Card>
        <CardHeader title="番茄作者后台授权学习" eyebrow="你登录，Agent 学习可见数据" action={<Badge>不需要账号密码</Badge>} />
        <div className="grid min-w-0 gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 text-sm leading-7 text-muted">
            <div className="grid gap-3">
              <p>
                正式方向不是让你反复导出文件，而是把番茄后台变成一个本地授权采集任务：你自己完成登录和验证码，Agent 只读取浏览器里已经可见的作品表现、评论反馈、榜单和活动信息，然后自动写入风向标、作品表现、写作记忆和个人策略。
              </p>
              <p>
                当前可以启动本地执行器浏览器。它不会保存账号、密码或 Cookie；你登录后停在作品数据、评论或活动页，先读取当前页复核，再导入学习链路。
              </p>
            </div>
            <BrowserCaptureSteps session={browserCaptureSession} readInfo={browserCaptureReadInfo} hasVisibleText={authorizedVisibleTextReady} />
          </div>
          <div className="grid gap-2">
            <Button disabled={loading} onClick={startFanqieBrowserCapture}>
              <Monitor size={16} />
              {loading ? "启动中" : "启动本地浏览器采集"}
            </Button>
            <Button disabled={loading || !browserCaptureSession} onClick={previewFanqieBrowserVisiblePage}>
              <Eye size={16} />
              {loading ? "读取中" : "读取当前页"}
            </Button>
            <Button disabled={loading || !authorizedVisibleTextReady} onClick={runFanqieAuthorizedCapture}>
              <FileText size={16} />
              {loading ? "导入中" : "导入当前可见内容"}
            </Button>
            <GhostButton disabled={loading} onClick={runFanqieAuthorizedSelfTest}>
              <CheckCircle2 size={16} />
              {loading ? "自测中" : "运行本地自测"}
            </GhostButton>
            <GhostButton disabled={loading || !browserCaptureSession} onClick={refreshFanqieBrowserCapture}>
              <RefreshCw size={16} />
              刷新会话
            </GhostButton>
            <a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink"
              href={fanqieWriterZoneUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} />
              外部浏览器打开
            </a>
            <GhostButton disabled={loading} onClick={createFanqieAuthorizedTask}>
              <Database size={16} />
              {loading ? "创建中" : "创建授权采集任务"}
            </GhostButton>
            <GhostButton onClick={prepareFanqieScreenshot}>
              <FileImage size={16} />
              可见页截图识别
            </GhostButton>
            <GhostButton onClick={prepareFanqieVisibleText}>
              <FileText size={16} />
              可见文字识别兜底
            </GhostButton>
            <GhostButton onClick={prepareFanqieCsv}>
              <Upload size={16} />
              已有表格再导入
            </GhostButton>
          </div>
        </div>
        <div className="grid gap-4 border-t border-line p-5">
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="grid gap-2">
              <FieldLabel>授权页面</FieldLabel>
              <TextInput value={authorizedPageUrl} onChange={(event) => setAuthorizedPageUrl(event.target.value)} />
            </div>
            <BrowserCapturePanel session={browserCaptureSession} preview={browserCapturePreview} readInfo={browserCaptureReadInfo} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
            <div className="grid gap-2">
              <FieldLabel>当前页可见内容 / 手动校正</FieldLabel>
              <textarea
                ref={authorizedVisibleTextRef}
                className="min-h-24 w-full min-w-0 resize-y rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-ink"
                value={authorizedVisibleText}
                onChange={(event) => setAuthorizedVisibleText(event.target.value)}
                placeholder="点击“读取当前页”后，可见文字会放到这里；也可以手动粘贴：作品名：示例 阅读量：12万 收益：438 完读率：71% 题材：女性成长 评论反馈：中段略慢"
              />
              <p className="text-xs leading-5 text-muted">
                {browserCaptureReadInfo?.visibleTextLength
                  ? `${browserCaptureReadInfo.imported ? "已导入" : "待读入"}：${browserCaptureReadInfo.visibleTextLength} 个字符。`
                  : "读取后先在这里复核，不会绕过登录、验证码或平台确认。"}
              </p>
            </div>
            <div className="grid gap-2">
              <Button disabled={loading || !browserCaptureSession} onClick={previewFanqieBrowserVisiblePage}>
                <Eye size={16} />
                {loading ? "读取中" : "读取当前页"}
              </Button>
              <Button disabled={loading || !authorizedVisibleTextReady} onClick={runFanqieAuthorizedCapture}>
                <FileText size={16} />
                导入当前可见内容
              </Button>
              <GhostButton disabled={loading || !browserCaptureSession} onClick={refreshFanqieBrowserCapture}>
                <RefreshCw size={16} />
                刷新会话
              </GhostButton>
            </div>
          </div>
        </div>
      </Card>

      {lastImportResult ? <ImportResultSummary result={lastImportResult} /> : null}

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader
            title="数据源列表"
            eyebrow={`当前显示 ${filteredDatasources.length} / ${datasources.length} 个来源`}
            action={
              <GhostButton onClick={() => refresh().then(() => setMessage("已刷新数据源。"))}>
                <RefreshCw size={16} />
                刷新
              </GhostButton>
            }
          />
          <p className="break-words border-b border-line px-5 py-3 text-sm text-muted">{message}</p>
          <div className="grid min-w-0 gap-3 border-b border-line p-5 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <TextInput
                className="w-full pl-9"
                value={datasourceQuery}
                onChange={(event) => setDatasourceQuery(event.target.value)}
                placeholder="搜索名称、备注、类型"
              />
            </label>
            <SelectInput value={datasourceTypeFilter} onChange={(event) => setDatasourceTypeFilter(event.target.value as DatasourceFilter)}>
              <option value="all">全部类型</option>
              <option value="manual">手动录入</option>
              <option value="csv">CSV 文件</option>
              <option value="public_page">公开页面</option>
              <option value="screenshot">截图</option>
            </SelectInput>
            <GhostButton disabled={!hasDatasourceFilters} onClick={resetDatasourceFilters}>
              <X size={16} />
              清空
            </GhostButton>
          </div>
          <div className="grid gap-3 p-5">
            {filteredDatasources.map((datasource) => (
              <div key={datasource.id} className="grid min-w-0 gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-[minmax(0,1fr)_120px_120px_90px_180px] md:items-start">
                <div className="min-w-0">
                  <p className="break-words font-medium">{datasource.name}</p>
                  {datasource.sourceDetail ? <p className="mt-1 break-all text-xs text-muted">来源：{datasource.sourceDetail}</p> : null}
                  {displayDatasourceNote(datasource) ? <p className="mt-1 break-words text-sm leading-6 text-muted">{displayDatasourceNote(datasource)}</p> : null}
                </div>
                <span className="text-sm text-muted">{typeLabels[datasource.type]}</span>
                <span className="text-sm text-muted">{datasource.frequency}</span>
                <div className="flex flex-wrap gap-2">
                  <Badge>{datasource.enabled ? "启用" : "停用"}</Badge>
                  <Badge>{datasource.persisted ? "已保存" : "临时"}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <GhostButton disabled={loading || togglingSourceId === datasource.id} onClick={() => handleToggleDatasource(datasource)}>
                    {datasource.enabled ? <X size={16} /> : <CheckCircle2 size={16} />}
                    {togglingSourceId === datasource.id ? "保存中" : datasource.enabled ? "停用" : "启用"}
                  </GhostButton>
                  {canRunDatasource(datasource) ? (
                    <GhostButton disabled={loading || runningSourceId === datasource.id || !datasource.enabled} onClick={() => handleRunDatasource(datasource)}>
                      <RefreshCw size={16} />
                      {runningSourceId === datasource.id ? "采集中" : "采集"}
                    </GhostButton>
                  ) : null}
                </div>
              </div>
            ))}
            {filteredDatasources.length === 0 ? <EmptyNote>没有找到符合条件的数据源。</EmptyNote> : null}
          </div>
        </Card>

        <Card id="source-create">
          <CardHeader title="新增数据源" />
          <div className="grid gap-4 p-5">
            <div className="grid gap-2">
              <FieldLabel>名称</FieldLabel>
              <TextInput value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <FieldLabel>类型</FieldLabel>
              <SelectInput value={sourceType} onChange={(event) => setSourceType(event.target.value as DatasourceType)}>
                <option value="manual">手动录入</option>
                <option value="csv">CSV 文件</option>
                <option value="public_page">公开页面</option>
                <option value="screenshot">截图</option>
              </SelectInput>
            </div>
            <div className="grid gap-2">
              <FieldLabel>URL 或文件说明</FieldLabel>
              <TextInput
                value={sourceDetail}
                onChange={(event) => setSourceDetail(event.target.value)}
                placeholder={sourceType === "public_page" ? "https://example.com/rank" : "例如：番茄后台 6 月收益 CSV"}
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel>频率</FieldLabel>
              <TextInput value={frequency} onChange={(event) => setFrequency(event.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input className="size-4 rounded border-line" type="checkbox" checked={sourceEnabled} onChange={(event) => setSourceEnabled(event.target.checked)} />
              启用这个数据源
            </label>
            <div className="grid gap-2">
              <FieldLabel>备注</FieldLabel>
              <textarea
                className="min-h-24 w-full min-w-0 rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-ink"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <Button disabled={loading} onClick={handleCreateDatasource}>
              <Database size={16} />
              新增数据源
            </Button>
          </div>
        </Card>
      </section>

      {waitingScreenshotJobs.length > 0 ? (
        <Card>
          <CardHeader title="等待校正的截图" eyebrow="截图没有识别出可用文字时，会先停在这里" action={<Badge>{waitingScreenshotJobs.length} 条</Badge>} />
          <div className="grid gap-3 p-5">
            {waitingScreenshotJobs.map((job) => (
              <div key={job.id} className="grid min-w-0 gap-4 rounded-md border border-line bg-paper p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                <div className="min-w-0">
                  <p className="break-words font-medium text-ink">{job.name}</p>
                  <p className="mt-1 break-words text-sm leading-6 text-muted">{job.failureReason || "等待你补充截图里的文字。"}</p>
                  {job.sourceDetail ? <p className="mt-1 break-all text-xs text-muted">原图：{job.sourceDetail}</p> : null}
                  <p className="mt-1 text-xs text-muted">记录时间：{job.lastRunAt}</p>
                </div>
                <div className="grid gap-3">
                  <textarea
                    className="min-h-24 w-full min-w-0 rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-ink"
                    value={correctionTexts[job.id] ?? ""}
                    onChange={(event) =>
                      setCorrectionTexts((current) => ({
                        ...current,
                        [job.id]: event.target.value
                      }))
                    }
                    placeholder="粘贴校正文字，例如：作品名：她把旧姓还给雨夜 阅读量：12万 收益：438 完读率：71% 题材：女性成长 评论反馈：中段略慢 评论关键词：克制反击、节奏慢"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={loading || correctingJobId === job.id || !(correctionTexts[job.id] ?? "").trim()} onClick={() => handleCorrectWaitingScreenshot(job)}>
                      <CheckCircle2 size={16} />
                      {correctingJobId === job.id ? "校正中" : "提交校正"}
                    </Button>
                    <GhostButton
                      onClick={() => {
                        setScreenshotName(job.name);
                        document.getElementById("screenshot-import")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        window.setTimeout(() => screenshotCorrectionRef.current?.focus(), 250);
                      }}
                    >
                      <FileImage size={16} />
                      重新上传
                    </GhostButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="公开网页采集" action={<Badge>公开页面</Badge>} />
        <div className="grid min-w-0 gap-4 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="grid h-fit gap-4">
            <div className="grid gap-2">
              <FieldLabel>采集名称</FieldLabel>
              <TextInput value={publicPageName} onChange={(event) => setPublicPageName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <FieldLabel>公开网址</FieldLabel>
              <TextInput value={publicPageUrl} onChange={(event) => setPublicPageUrl(event.target.value)} placeholder="https://example.com/rank" />
            </div>
            <Button disabled={loading || !publicPageUrl.trim()} onClick={handleImportPublicPage}>
              <Globe size={16} />
              读取公开网页
            </Button>
          </div>
          <div className="rounded-md border border-line bg-paper p-4 text-sm leading-7 text-muted">
            适合放公开榜单、公开活动页、公开热门作品列表。系统会读取页面文字，提取题材、标签、热度线索，并把结果写入风向标和采集日志。
          </div>
        </div>
      </Card>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card id="csv-import">
          <CardHeader title="CSV 导入" action={<Badge>支持作品表现和评论反馈</Badge>} />
          <div className="grid gap-4 p-5">
            <div className="grid gap-2">
              <FieldLabel>导入名称</FieldLabel>
              <TextInput value={csvName} onChange={(event) => setCsvName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <FieldLabel>选择 CSV 文件</FieldLabel>
              <input
                className="w-full min-w-0 rounded-md border border-line bg-white p-3 text-sm"
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(event) => handleCsvFile(event.target.files?.[0])}
              />
              <p className="text-xs leading-5 text-muted">
                {csvFileName ? `已读取：${csvFileName}` : "也可以不选文件，直接在下面粘贴 CSV 内容。"}
              </p>
            </div>
            <div className="grid gap-2">
              <FieldLabel>CSV 内容</FieldLabel>
              <textarea
                className="min-h-64 w-full min-w-0 rounded-md border border-line bg-white p-3 font-mono text-xs leading-6 outline-none focus:border-ink"
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
                placeholder={"作品名,平台,题材,阅读量,收益,完读率,评论反馈,评论关键词\n她把旧姓还给雨夜,番茄短故事,女性成长,12万,438,71%,读者说女主反击克制但中段略慢,克制反击、节奏慢"}
              />
            </div>
            <CsvPreviewPanel
              preview={csvPreview}
              fieldMappings={csvFieldMappings}
              onFieldMappingChange={(fieldLabel, header) =>
                setCsvFieldMappings((current) => ({
                  ...current,
                  [fieldLabel]: header
                }))
              }
            />
            <Button disabled={loading} onClick={handleImportCsv}>
              <Upload size={16} />
              按映射导入 CSV
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="快速入口" />
          <div className="grid gap-3 p-5">
            <button className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-white p-4 text-left hover:border-ink" onClick={handleImportCsv}>
              <Upload size={18} />
              <span className="min-w-0 break-words">导入当前 CSV</span>
            </button>
            <button className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-white p-4 text-left hover:border-ink" onClick={handleImportText}>
              <FileText size={18} />
              <span className="min-w-0 break-words">导入粘贴文字</span>
            </button>
            <button className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-white p-4 text-left hover:border-ink" onClick={handleImportPublicPage}>
              <Globe size={18} />
              <span className="min-w-0 break-words">读取公开网页</span>
            </button>
            <button className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-white p-4 text-left hover:border-ink" onClick={() => setSourceType("screenshot")}>
              <FileImage size={18} />
              <span className="min-w-0 break-words">准备截图来源</span>
            </button>
            <button className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-white p-4 text-left hover:border-ink" onClick={() => setSourceType("manual")}>
              <Database size={18} />
              <span className="min-w-0 break-words">准备手动录入</span>
            </button>
          </div>
        </Card>
      </section>

      <Card id="manual-import">
        <CardHeader title="粘贴平台文字" action={<Badge>支持一行一个题材</Badge>} />
        <div className="grid min-w-0 gap-4 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="grid h-fit gap-4">
            <div className="grid gap-2">
              <FieldLabel>导入名称</FieldLabel>
              <TextInput value={manualName} onChange={(event) => setManualName(event.target.value)} />
            </div>
            <Button disabled={loading} onClick={handleImportText}>
              <Upload size={16} />
              导入粘贴文字
            </Button>
            <p className="break-words text-sm leading-6 text-muted">可以直接复制榜单、评论摘要或作者后台整理文字。尽量保留“平台、题材、热度、作品名、阅读量、收益、完读率、评论反馈、评论关键词”这些词，系统会自动识别。</p>
          </div>
          <textarea
            className="min-h-56 w-full min-w-0 rounded-md border border-line bg-white p-3 text-sm leading-7 outline-none focus:border-ink"
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
          />
        </div>
      </Card>

      <Card id="screenshot-import">
        <CardHeader title="截图导入" action={<Badge>自动识别 + 手动校正</Badge>} />
        <div className="grid min-w-0 gap-4 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="grid h-fit gap-4">
            <div className="grid gap-2">
              <FieldLabel>导入名称</FieldLabel>
              <TextInput value={screenshotName} onChange={(event) => setScreenshotName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <FieldLabel>截图文件</FieldLabel>
              <input
                className="w-full min-w-0 rounded-md border border-line bg-white p-3 text-sm"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => handleScreenshotFile(event.target.files?.[0])}
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel>截图文字 / 手动校正</FieldLabel>
              <textarea
                ref={screenshotCorrectionRef}
                className="min-h-40 w-full min-w-0 rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none focus:border-ink"
                value={screenshotText}
                onChange={(event) => setScreenshotText(event.target.value)}
                placeholder="可以留空让系统自动识别截图；也可以手动校正：作品名：她把旧姓还给雨夜 阅读量：12万 收益：438 完读率：71% 题材：女性成长 评论反馈：读者说女主反击克制但中段略慢 评论关键词：克制反击、节奏慢"
              />
              <p className="text-xs leading-5 text-muted">配置 Kimi/OpenAI Key 后会自动读图；没有 Key 时会先保存截图，等待你补充文字。</p>
            </div>
            <Button disabled={loading || !screenshotDataUrl} onClick={handleImportScreenshot}>
              <Upload size={16} />
              {screenshotText.trim() ? "上传并导入文字" : "上传并尝试识别"}
            </Button>
          </div>
          <div className="grid min-h-48 place-items-center rounded-md border border-dashed border-line bg-paper p-4">
            {screenshotDataUrl ? (
              <Image
                src={screenshotDataUrl}
                alt={screenshotFileName || "截图预览"}
                width={420}
                height={288}
                unoptimized
                className="max-h-72 max-w-full rounded-md border border-line object-contain"
              />
            ) : (
              <div className="grid justify-items-center gap-2 text-center text-sm text-muted">
                <FileImage size={28} />
                <span>选择截图后会显示预览</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="采集任务日志" eyebrow={`当前显示 ${filteredJobs.length} / ${jobs.length} 条任务`} />
        <div className="grid min-w-0 gap-3 border-b border-line p-5 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <TextInput className="w-full pl-9" value={jobQuery} onChange={(event) => setJobQuery(event.target.value)} placeholder="搜索任务、原因、时间" />
          </label>
          <SelectInput value={jobStatusFilter} onChange={(event) => setJobStatusFilter(event.target.value as JobStatusFilter)}>
            <option value="all">全部状态</option>
            <option value="success">成功</option>
            <option value="waiting">等待</option>
            <option value="running">运行中</option>
            <option value="failed">失败</option>
          </SelectInput>
          <GhostButton disabled={!hasJobFilters} onClick={resetJobFilters}>
            <X size={16} />
            清空
          </GhostButton>
        </div>
        <div className="grid gap-3 p-5">
          {filteredJobs.map((job) => (
            <div key={job.id} className="grid min-w-0 gap-3 rounded-md border border-line bg-white p-4 md:grid-cols-[minmax(0,1fr)_96px_96px_90px_170px_96px] md:items-center">
              <div className="min-w-0">
                <p className="break-words font-medium">{job.name}</p>
                {job.failureReason ? <p className="mt-1 break-words text-sm leading-6 text-muted">{job.failureReason}</p> : null}
                {job.sourceDetail ? <p className="mt-1 break-all text-xs text-muted">来源：{job.sourceDetail}</p> : null}
              </div>
              <Badge className={statusBadgeClass(job.status)}>{statusLabels[job.status]}</Badge>
              <span className="text-sm text-muted">{jobTypeLabel(job.type)}</span>
              <span className="text-sm text-muted">{job.successCount} 条</span>
              <span className="text-sm text-muted">{job.lastRunAt}</span>
              {canRetryJob(job) ? (
                <GhostButton disabled={loading || retryingJobId === job.id} onClick={() => handleRetryCrawlerJob(job)}>
                  <RefreshCw size={16} />
                  {retryingJobId === job.id ? "重试中" : "重试"}
                </GhostButton>
              ) : (
                <span className="text-xs text-muted">-</span>
              )}
            </div>
          ))}
          {filteredJobs.length === 0 ? <EmptyNote>没有找到符合条件的采集任务。</EmptyNote> : null}
        </div>
      </Card>
    </div>
  );
}

function BrowserCaptureSteps({
  session,
  readInfo,
  hasVisibleText
}: {
  session: BrowserCaptureSession | null;
  readInfo: BrowserCaptureReadInfo | null;
  hasVisibleText: boolean;
}) {
  const steps = [
    {
      label: "启动执行器",
      detail: session ? "本地临时浏览器会话已创建。" : "打开本机浏览器窗口。",
      done: Boolean(session),
      active: !session
    },
    {
      label: "登录并停在目标页",
      detail: readInfo?.visibleTextLength ? `已读取 ${readInfo.visibleTextLength} 个字符。` : "你完成登录、验证码和平台确认。",
      done: Boolean(readInfo?.visibleTextLength),
      active: Boolean(session && !readInfo?.visibleTextLength)
    },
    {
      label: "导入学习链路",
      detail: readInfo?.imported ? "可见内容已进入趋势、作品表现和写作记忆链路。" : hasVisibleText ? "复核后点击导入当前可见内容。" : "待读取或粘贴可见内容。",
      done: Boolean(readInfo?.imported || session?.status === "success"),
      active: hasVisibleText && !readInfo?.imported
    }
  ];

  return (
    <div className="grid gap-2 md:grid-cols-3">
      {steps.map((step, index) => (
        <div key={step.label} className={step.done ? "rounded-md border border-line bg-white p-3" : step.active ? "rounded-md border border-ink bg-white p-3" : "rounded-md border border-line bg-paper p-3"}>
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            {step.done ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
            {index + 1}. {step.label}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">{step.detail}</p>
        </div>
      ))}
    </div>
  );
}

function BrowserCapturePanel({ session, preview, readInfo }: { session: BrowserCaptureSession | null; preview: string; readInfo: BrowserCaptureReadInfo | null }) {
  if (!session) {
    return (
      <div className="grid gap-2 rounded-md border border-line bg-paper p-4 text-sm leading-6 text-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-ink">本地浏览器会话</span>
          <Badge>未启动</Badge>
        </div>
        <p>启动后会在本机打开一个临时浏览器窗口，登录态只保留在本次会话中。</p>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-2 rounded-md border border-line bg-paper p-4 text-sm leading-6 text-muted">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink">本地浏览器会话</span>
        <Badge className={statusBadgeClass(session.status)}>{statusLabels[session.status]}</Badge>
      </div>
      <div className="grid gap-1">
        <p className="break-all text-xs">页面：{session.pageUrl}</p>
        <p className="break-words">{session.lastMessage}</p>
        {session.nextStep ? <p className="break-words text-xs">{session.nextStep}</p> : null}
        {readInfo?.capturedAt ? (
          <p className="text-xs text-muted">
            最近读取：{formatLocalDateTime(readInfo.capturedAt)} · {readInfo.visibleTextLength} 个字符 · {readInfo.imported ? "已导入" : "待导入"}
          </p>
        ) : null}
        {readInfo?.pageUrl ? <p className="break-all text-xs text-muted">读取页：{readInfo.pageUrl}</p> : null}
      </div>
      {preview ? (
        <div className="rounded-md border border-line bg-white p-3">
          <p className="mb-1 text-xs font-medium text-ink">最近读取预览</p>
          <p className="break-words text-xs leading-5 text-muted">{preview}</p>
        </div>
      ) : null}
    </div>
  );
}

function formatLocalDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", { hour12: false });
}

function SourceStat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: number; detail: string }) {
  return (
    <div className="grid gap-3 rounded-md border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3 text-muted">
        <span className="text-sm">{label}</span>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold text-ink">{value}</p>
        <p className="mt-1 text-xs text-muted">{detail}</p>
      </div>
    </div>
  );
}

type CsvPreview = {
  headers: string[];
  rows: string[][];
  recognizedFields: Array<{ label: string; matchedHeader?: string }>;
  totalRows: number;
};

function CsvPreviewPanel({
  preview,
  fieldMappings,
  onFieldMappingChange
}: {
  preview: CsvPreview;
  fieldMappings: CsvFieldMapping;
  onFieldMappingChange: (fieldLabel: string, header: string) => void;
}) {
  const visibleHeaders = preview.headers.slice(0, 8);
  const visibleRows = preview.rows.slice(0, 5).map((row) => row.slice(0, 8));
  const matchedCount = preview.recognizedFields.filter((field) => fieldMappings[field.label]).length;

  return (
    <div className="grid gap-3 rounded-md border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">字段识别与预览</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {preview.headers.length ? `识别到 ${preview.headers.length} 个字段、${preview.totalRows} 行数据。` : "还没有识别到 CSV 表头。"}
          </p>
        </div>
        <Badge>{matchedCount} 个关键字段</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {preview.recognizedFields.map((field) => (
          <Badge key={field.label} className={fieldMappings[field.label] ? "border-[#b7dfc5] bg-[#effaf2] text-[#25633a]" : undefined}>
            {field.label}
            {fieldMappings[field.label] ? `：${fieldMappings[field.label]}` : "：未识别"}
          </Badge>
        ))}
      </div>

      {preview.headers.length ? (
        <div className="grid gap-3 rounded-md border border-line bg-white p-3">
          <div>
            <p className="text-sm font-medium text-ink">字段映射</p>
            <p className="mt-1 text-xs leading-5 text-muted">左边是系统要理解的字段，右边选择你 CSV 里对应的表头。</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {preview.recognizedFields.map((field) => (
              <label key={field.label} className="grid min-w-0 gap-1">
                <span className="text-xs font-medium text-muted">{field.label}</span>
                <SelectInput value={fieldMappings[field.label] ?? ""} onChange={(event) => onFieldMappingChange(field.label, event.target.value)}>
                  <option value="">不导入这个字段</option>
                  {preview.headers.map((header, index) => (
                    <option key={`${field.label}-${header}-${index}`} value={header}>
                      {header || `字段 ${index + 1}`}
                    </option>
                  ))}
                </SelectInput>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {visibleHeaders.length ? (
        <div className="overflow-x-auto rounded-md border border-line bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-paper text-ink">
              <tr>
                {visibleHeaders.map((header, index) => (
                  <th key={`${header}-${index}`} className="whitespace-nowrap border-b border-line px-3 py-2 font-medium">
                    {header || `字段 ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-line last:border-b-0">
                  {visibleHeaders.map((_, cellIndex) => (
                    <td key={cellIndex} className="max-w-52 truncate px-3 py-2 text-muted">
                      {row[cellIndex] || "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-md border border-line bg-white p-3 text-sm leading-6 text-muted">粘贴或选择 CSV 后，这里会显示字段和前 5 行数据。</p>
      )}

      {preview.headers.length > 8 ? <p className="text-xs leading-5 text-muted">预览只显示前 8 个字段，完整内容仍会按原 CSV 导入。</p> : null}
    </div>
  );
}

function ImportResultSummary({ result }: { result: CsvImportResult }) {
  const queueText = result.queueMode ? queueModeLabel(result.queueMode, result.queueJobId) : "本地直接处理";
  const affectedWorks = result.worksUpdated + result.worksCreated;
  const learningCount = (result.learningCreated?.memoriesCreated ?? 0) + (result.learningCreated?.strategiesCreated ?? 0);
  const captureResult = result as Partial<AuthorizedCaptureResult>;
  const sourceDetail = captureResult.pageUrl || result.job.sourceDetail || result.datasource.sourceDetail || "本地输入";
  const captureMode = captureResult.captureMode ? captureModeLabel(captureResult.captureMode) : jobTypeLabel(result.job.type);

  return (
    <Card>
      <CardHeader title="最近一次导入结果" eyebrow={result.datasource.name} action={<Badge>{result.persisted ? "已保存" : "本地文件"}</Badge>} />
      <div className="grid min-w-0 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-6">
        <ResultMetric label="识别行数" value={`${result.parsedRows} 行`} detail={`任务：${statusLabels[result.job.status]}`} />
        <ResultMetric label="趋势数据" value={`${result.trendsCreated} 条`} detail="会进入风向标" />
        <ResultMetric label="作品表现" value={`${affectedWorks} 部`} detail={`更新 ${result.worksUpdated}，新建 ${result.worksCreated}`} />
        <ResultMetric
          label="学习沉淀"
          value={result.learningCreated ? `${learningCount} 条` : "未触发"}
          detail={result.learningCreated ? `${result.learningCreated.memoriesCreated} 记忆，${result.learningCreated.strategiesCreated} 策略` : "等待作品表现或授权数据"}
        />
        <ResultMetric label="处理方式" value={queueText} detail={result.job.lastRunAt} />
        <ResultMetric label="来源" value={captureMode} detail={sourceDetail} />
      </div>
      <p className="break-words border-t border-line px-5 py-3 text-sm leading-6 text-muted">{result.message}</p>
      {result.job.status === "failed" && result.job.failureReason ? (
        <p className="break-words border-t border-line bg-paper px-5 py-3 text-sm leading-6 text-ink">诊断：{result.job.failureReason}</p>
      ) : null}
      {captureResult.nextStep ? <p className="break-words border-t border-line px-5 py-3 text-sm leading-6 text-muted">下一步：{captureResult.nextStep}</p> : null}
      {result.learningCreated?.memoryRules.length || result.learningCreated?.strategyRules.length ? (
        <div className="grid gap-2 border-t border-line px-5 py-3 text-xs leading-5 text-muted">
          {result.learningCreated.memoryRules.map((rule) => (
            <p key={`memory-${rule}`} className="break-words">记忆：{rule}</p>
          ))}
          {result.learningCreated.strategyRules.map((rule) => (
            <p key={`strategy-${rule}`} className="break-words">策略：{rule}</p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function captureModeLabel(mode: AuthorizedCaptureResult["captureMode"]) {
  const labels: Record<AuthorizedCaptureResult["captureMode"], string> = {
    visible_text: "授权可见页",
    screenshot: "授权截图",
    waiting: "等待读取"
  };

  return labels[mode];
}

function ResultMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-paper p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-ink">{value}</p>
      <p className="mt-1 break-words text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-line bg-paper p-4 text-sm text-muted">{children}</p>;
}

function matchesSearch(query: string, values: Array<string | undefined>) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return values
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalizedQuery));
}

function jobTypeLabel(type: CrawlerJobRecord["type"]) {
  return type === "public_rank" ? "公开榜单" : typeLabels[type];
}

function statusBadgeClass(status: CrawlerJobRecord["status"]) {
  if (status === "success") {
    return "border-ink bg-white text-ink";
  }

  if (status === "failed") {
    return "border-ink bg-ink text-white";
  }

  if (status === "running") {
    return "border-ink bg-paper text-ink";
  }

  return "bg-paper";
}

function waitingDetail(waitingCount: number, screenshotCount: number) {
  if (waitingCount === 0) {
    return "暂无待处理";
  }

  if (screenshotCount > 0) {
    return `含 ${screenshotCount} 个截图校正`;
  }

  return "查看日志处理";
}

function canRetryJob(job: CrawlerJobRecord) {
  return job.status === "failed" && (job.type === "public_page" || job.type === "public_rank") && Boolean(job.sourceDetail);
}

function canRunDatasource(datasource: DatasourceRecord) {
  return datasource.type === "public_page" && Boolean(datasource.sourceDetail);
}

function displayDatasourceNote(datasource: DatasourceRecord) {
  return datasource.note?.replace(/^来源：[^。]+。?/u, "").trim();
}

function queueModeLabel(queueMode: NonNullable<CsvImportResult["queueMode"]>, queueJobId?: string) {
  if (queueMode === "redis") {
    return queueJobId ? `本地队列 #${queueJobId}` : "本地队列";
  }

  return "本地直接处理";
}

const csvFieldAliases = [
  { label: "平台", aliases: ["平台", "渠道", "来源平台"] },
  { label: "作品名", aliases: ["作品名", "标题", "书名", "作品名称"] },
  { label: "题材", aliases: ["题材", "类型", "赛道", "分类"] },
  { label: "热度", aliases: ["热度", "热度值", "热度指数"] },
  { label: "阅读量", aliases: ["阅读量", "阅读", "播放量", "浏览量"] },
  { label: "收益", aliases: ["收益", "收入", "稿费"] },
  { label: "完读率", aliases: ["完读率", "读完率", "完成率"] },
  { label: "评论反馈", aliases: ["评论反馈", "反馈", "评论摘要", "读者反馈"] },
  { label: "评论关键词", aliases: ["评论关键词", "关键词", "评论标签"] }
];

function buildCsvPreview(csvText: string): CsvPreview {
  const rows = parseCsvRows(csvText)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1);

  return {
    headers,
    rows: dataRows,
    recognizedFields: csvFieldAliases.map((field) => ({
      label: field.label,
      matchedHeader: headers.find((header) => field.aliases.some((alias) => normalizeCsvHeader(header) === normalizeCsvHeader(alias)))
    })),
    totalRows: dataRows.length
  };
}

function buildAutoCsvFieldMappings(preview: CsvPreview): CsvFieldMapping {
  return Object.fromEntries(preview.recognizedFields.map((field) => [field.label, field.matchedHeader ?? ""]));
}

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

function normalizeCsvHeader(header: string) {
  return header.trim().replace(/[\s_/-]+/gu, "").toLowerCase();
}
