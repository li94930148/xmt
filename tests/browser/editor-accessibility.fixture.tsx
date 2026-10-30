import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import ContentEditor from '../../src/components/ContentEditor';

const root = document.getElementById('root');
if (!root) throw new Error('editor accessibility fixture root is missing');

createRoot(root).render(
  <main className="space-y-8 p-8">
    <section aria-labelledby="outline-title">
      <h1 id="outline-title">选题大纲验收</h1>
      <ContentEditor ariaLabel="选题大纲" value="<p><strong>粗体段落</strong> 普通文字</p>" onChange={() => undefined} collaborationEnabled={false} />
    </section>
    <section aria-labelledby="body-title">
      <h2 id="body-title">正文默认名称验收</h2>
      <ContentEditor value="<p>正文内容</p>" onChange={() => undefined} collaborationEnabled={false} />
    </section>
    <section aria-labelledby="legacy-title">
      <h2 id="legacy-title">旧版选题大纲验收</h2>
      <ContentEditor mode="legacy" ariaLabel="旧版选题大纲" value="<p><strong>旧版粗体</strong> 普通文字</p>" onChange={() => undefined} />
    </section>
    <section aria-labelledby="readonly-title">
      <h2 id="readonly-title">只读正文验收</h2>
      <ContentEditor mode="readonly" ariaLabel="历史只读正文" value="<p>历史正文</p>" />
    </section>
    <section aria-labelledby="basic-toolbar-title">
      <h2 id="basic-toolbar-title">基础工具栏分组名称验收</h2>
      <ContentEditor toolbarVariant="basic" ariaLabel="基础工具栏验收" value="<p>基础工具栏内容</p>" onChange={() => undefined} collaborationEnabled={false} />
    </section>
  </main>,
);
