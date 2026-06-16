type WorkflowSmokeResult = {
  ok: boolean;
  summary: string;
  steps: Array<{
    label: string;
    ok: boolean;
    detail: string;
    nextStep?: string;
  }>;
  nextStep?: string;
};

const rawApiBase = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:3001";
const apiBase = rawApiBase.replace(/\/+$/, "").replace(/\/api$/, "");

main().catch((error: unknown) => {
  console.error("\n[失败] 主流程检查没有跑通。");
  console.error(error instanceof Error ? error.message : "出现未知错误。");
  console.error("下一步：先确认已启动神笔马良，再运行 pnpm local:doctor 看是哪一项环境没准备好。");
  process.exit(1);
});

async function main() {
  console.log("\n神笔马良主流程检查\n");

  const result = await request<WorkflowSmokeResult>("POST", "/api/settings/test-workflow");

  for (const step of result.steps) {
    console.log(`${step.ok ? "[正常]" : "[需处理]"} ${step.label}：${step.detail}`);

    if (step.nextStep) {
      console.log(`  下一步：${step.nextStep}`);
    }
  }

  console.log(`\n${result.summary}`);

  if (result.nextStep) {
    console.log(`下一步：${result.nextStep}`);
  }

  if (!result.ok) {
    process.exit(1);
  }
}

async function request<T>(method: "POST", path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      signal: controller.signal
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${method} ${path} 返回 ${response.status}：${text.slice(0, 240)}`);
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${method} ${path} 等待超过 20 秒。`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
