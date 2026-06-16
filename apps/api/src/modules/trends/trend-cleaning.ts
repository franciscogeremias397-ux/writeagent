const importedFieldLabels = [
  "评论反馈",
  "评论关键词",
  "评论摘要",
  "读者反馈",
  "评论区反馈",
  "阅读量",
  "阅读",
  "播放量",
  "曝光",
  "收益",
  "收入",
  "完读率",
  "完读",
  "收藏",
  "订阅",
  "字数",
  "作品名",
  "作品",
  "书名",
  "标题",
  "平台",
  "标签",
  "关键词",
  "原因",
  "理由",
  "备注",
  "热度",
  "增长率",
  "机会分",
  "饱和度"
];

export function cleanTrendGenre(value: string) {
  const trimmed = value.trim();
  const fieldPattern = importedFieldLabels.map(escapeRegExp).join("|");
  const fieldIndex = trimmed.search(new RegExp(`\\s*(?:${fieldPattern})\\s*[:：=]`, "u"));
  const withoutImportedFields = fieldIndex > 0 ? trimmed.slice(0, fieldIndex) : trimmed;
  const clean = withoutImportedFields.replace(/(赛道|风向|趋势)$/u, "").trim();

  return clean || trimmed;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
