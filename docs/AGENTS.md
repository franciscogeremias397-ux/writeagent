# Agent 工作流说明

第一版已经实现一个可替换的本地写作内核，位置在：

```txt
packages/shared/src/writing-kernel.ts
```

后端 AI Provider 位置在：

```txt
apps/api/src/modules/ai/ai-provider.service.ts
```

现在逻辑是：

- 有 `OPENAI_API_KEY` 时优先调用 OpenAI Responses API
- 没有 Key 时使用本地模拟写作内核
- OpenAI 调用失败时自动回退到本地模拟写作内核

本地模拟内核跑通完整短篇流程：

1. 主控 Agent 判断任务
2. 风向分析 Agent 匹配赛道
3. 写作记忆 Agent 读取已启用的相关经验
4. 选题 Agent 生成选题卡
5. 结构 Agent 设计情绪曲线、冲突阶梯、信息差和人物卡
6. 场景卡 Agent 拆分场景
7. 提示词 Agent 组装写作提示
8. 正文 Agent 分段生成草稿
9. 测试读者 Agent 评审
10. 编辑改稿 Agent 生成修订建议
11. 复盘沉淀 Agent 写入记忆

后续要接更多模型时，优先扩展 `AiProviderService`，前端页面和写作接口可以保持不变。

## 第一版原则

- 不直接黑盒生成全文
- 先生成选题卡和结构
- 再生成场景卡
- 再按场景生成正文
- 每次改稿都保留版本记录
- 写作记忆会被下一次灵感写作和自动写作读取，结果里会展示本次参考的记忆
