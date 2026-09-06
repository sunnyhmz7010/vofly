// 知识库文章数据源：knowledge/ 目录下的 .md 文件即文章。
// 文件名（去掉 .md 后缀）就是文章标题，文件内容直接交给 ui/Markdown 渲染。
// 维护方式：增删改 md 文件即可，无需维护任何代码或数据表；内容随版本发布。

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
}

const files = import.meta.glob<string>("/knowledge/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function titleFromPath(path: string): string {
  const base = path.split("/").pop() || "";
  return base.replace(/\.md$/i, "");
}

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = Object.entries(files)
  .map(([path, content]) => {
    const title = titleFromPath(path);
    return { id: title, title, content: content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim() };
  })
  .sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
