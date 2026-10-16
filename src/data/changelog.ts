export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  impactScope?: string[];
  changes: {
    type: 'feature' | 'improvement' | 'fix' | 'security';
    description: string;
  }[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: '9.1.43',
    date: '2026-10-16',
    title: '避免自动保存与状态或版本写入争用',
    impactScope: ['创作详情', '正文保存', '状态与版本操作'],
    changes: [
      { type: 'fix', description: '状态变更和小修/另开版本前先确认自动保存；未确认时不提交后续写入，确认后使用最新正文。' },
    ],
  },
  {
    version: '9.1.42',
    date: '2026-10-16',
    title: '保护审核中的稿件不被并发操作覆盖',
    impactScope: ['创作详情', '审核提交', '版本与删除操作'],
    changes: [
      { type: 'fix', description: '审核等待服务端确认期间，正文、版本切换/保存、状态更新与删除统一锁定；快速重复操作不会产生并发稿件写入。' },
    ],
  },
  {
    version: '9.1.41',
    date: '2026-10-16',
    title: '让创作审核提交更可靠',
    impactScope: ['创作详情', '正文保存', '审核反馈'],
    changes: [
      { type: 'fix', description: '提交审核前确认正文已保存；审核请求期间锁定正文并防止重复提交，失败保留草稿可重试，成功后立即更新审核状态。' },
    ],
  },
  {
    version: '9.1.40',
    date: '2026-10-16',
    title: '保护工作台免受不完整摘要回包影响',
    impactScope: ['移动工作台', '摘要读取恢复'],
    changes: [
      { type: 'fix', description: '摘要 HTTP 200 回包缺少必需列表时显示可重试提示，避免移动首页渲染崩溃；正常回包后恢复首页。' },
    ],
  },
  {
    version: '9.1.39',
    date: '2026-10-16',
    title: '让官方导出部分解析遗漏可见',
    impactScope: ['Creator Agent', '官方导出', '数据质量提示'],
    changes: [
      { type: 'improvement', description: '部分作品行未通过解析时，最近同步展示采集器报告的读取、接收、拒绝和重复数量及提示；质量摘要只作诊断，不覆盖指标事实。' },
      { type: 'fix', description: '官方导出回执在上传队列中保留质量报告，重试后仍可读取。' },
    ],
  },
  {
    version: '9.1.38',
    date: '2026-10-16',
    title: '修复成就检查挂起与导出数据静默漏收',
    impactScope: ['成就检查', '抖音官方导出', '数据质量'],
    changes: [
      { type: 'fix', description: '已获得的成就只跳过当前项目，接口继续检查并授予后续符合条件的成就。' },
      { type: 'fix', description: '官方导出解析失败或所有数据行均被拒绝时整批失败关闭，避免部分数据成功入库造成静默漏收。' },
    ],
  },
  {
    version: '9.1.37',
    date: '2026-10-16',
    title: '选题操作防重复提交并提升登录可访问性',
    impactScope: ['选题详情', '移动端操作', '登录页', '文字对比度'],
    changes: [
      { type: 'fix', description: '桌面阶段推进及移动端保存、阶段推进、补齐阶段记录和审核增加同步互斥，避免慢网下快速重复点击造成多次写入。' },
      { type: 'improvement', description: '写入等待服务端确认期间禁用对应操作并显示处理中状态。' },
      { type: 'fix', description: '登录页三个布局为账号、密码输入框补齐显式标签关联，备案链接切换到满足对比度的主题文字令牌。' },
    ],
  },
  {
    version: '9.1.36',
    date: '2026-10-16',
    title: '选题审核与看板操作支持防重复提交',
    impactScope: ['选题审核', '桌面/移动看板', '重复提交保护'],
    changes: [
      { type: 'fix', description: '桌面审核和桌面/移动看板阶段操作增加同步互斥，避免慢网下重复写入。' },
      { type: 'improvement', description: '提交期间锁定相关表单或同一选题操作，并显示处理中状态，服务端确认后再恢复。' },
    ],
  },
  {
    version: '9.1.35',
    date: '2026-10-16',
    title: '移动消息中心支持完整分页与全局已读',
    impactScope: ['移动端消息中心', '全局未读数', '历史消息恢复'],
    changes: [
      { type: 'improvement', description: '移动端按页加载消息并使用服务端全账号摘要显示未读数量。' },
      { type: 'fix', description: '全部已读覆盖所有账号消息；请求失败时保留状态并支持安全重试。' },
    ],
  },
  {
    version: '9.1.34',
    date: '2026-10-16',
    title: '首页待处理任务读取状态更准确',
    impactScope: ['工作台', '待处理消息', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '消息尚未读取确认或读取失败时不再误显示空任务，错误提示保持至只读重试成功。' },
      { type: 'improvement', description: '仅有消息任务的负责人首页显示明确的读取中状态。' },
    ],
  },
  {
    version: '9.1.33',
    date: '2026-10-16',
    title: '模板保存期间保护表单内容',
    impactScope: ['选题模板', '保存与更新', '内容保护'],
    changes: [
      { type: 'fix', description: '模板写入等待服务端确认期间锁定字段与取消入口，避免已确认保存后清空等待期间的新输入。' },
      { type: 'improvement', description: '模板表单公开忙碌状态，写入确认后再进入清空和列表恢复流程。' },
    ],
  },
  {
    version: '9.1.32',
    date: '2026-10-16',
    title: '知识库分类与资料独立恢复',
    impactScope: ['知识库', '分类筛选', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '分类读取失败时知识库资料结果仍可使用，分类管理在目录恢复前保持关闭。' },
      { type: 'improvement', description: '分类读取提供独立重试；搜索或筛选变化只刷新资料结果。' },
    ],
  },
  {
    version: '9.1.31',
    date: '2026-10-16',
    title: '资料分类列表读取恢复',
    impactScope: ['资料列表', '分类筛选', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '分类读取失败不再使资料列表整体不可用；资料列表独立加载。' },
      { type: 'improvement', description: '分类读取失败可只读重试，当前分类筛选不会被误显示为空或全部分类。' },
    ],
  },
  {
    version: '9.1.30',
    date: '2026-10-16',
    title: '资料详情审计记录读取恢复',
    impactScope: ['资料详情', '审计记录', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '审计记录读取失败不再让资料详情整页不可用；详情主记录独立完成加载。' },
      { type: 'improvement', description: '审计记录错误可见且可只读重试，不会重复读取详情或执行资料写入。' },
    ],
  },
  {
    version: '9.1.29',
    date: '2026-10-16',
    title: '选题提报负责人名单读取恢复',
    impactScope: ['选题提报', '本机草稿', '负责人选择'],
    changes: [
      { type: 'fix', description: '负责人名单读取失败时不再静默退化，表单可继续使用且显示清晰的恢复提示。' },
      { type: 'improvement', description: '负责人名单提供只读重试，已有草稿和负责人选择会保留。' },
    ],
  },
  {
    version: '9.1.28',
    date: '2026-10-16',
    title: '选题负责人名单读取恢复',
    impactScope: ['选题详情', '负责人选择', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '负责人名单读取失败时，选题详情仍保持可用，不再误报为整页读取失败。' },
      { type: 'improvement', description: '负责人名单状态可见并支持只读重试，当前负责人信息在名单暂不可用时仍会保留。' },
    ],
  },
  {
    version: '9.1.27',
    date: '2026-10-16',
    title: '发布/成片剧本历史读取恢复',
    impactScope: ['发布详情', '成片详情', '剧本版本历史', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '剧本版本历史读取失败时不再误显示为空；详情主记录仍可用，并提供只重试历史读取的入口。' },
      { type: 'improvement', description: '版本保存后的历史回读失败会明确说明，不会要求重复创建已确认版本。' },
    ],
  },
  {
    version: '9.1.26',
    date: '2026-10-16',
    title: '日报归档成员名单读取恢复',
    impactScope: ['日报总结归档', '成员筛选', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '成员名单读取失败时明确说明筛选选项可能不完整，并提供只重新读取名单的重试。' },
      { type: 'security', description: '归档筛选状态按账号与权限范围隔离；迟到的旧成员名单不会覆盖当前账号内容。' },
    ],
  },
  {
    version: '9.1.25',
    date: '2026-10-16',
    title: '复盘负责人名单读取恢复与账号隔离',
    impactScope: ['复盘新建', '复盘行动项负责人', '权限范围', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '成员名单读取失败时明确说明负责人选项可能不完整，并提供重新加载入口。' },
      { type: 'security', description: '仅在当前账号具备 user:view 时读取成员目录；账号切换后忽略旧账号的迟到响应。' },
    ],
  },
  {
    version: '9.1.24',
    date: '2026-10-16',
    title: '消息读取恢复与未知状态提示',
    impactScope: ['消息中心', '工作台状态提示', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '消息中心同一账号、筛选和页码刷新失败时保留最近一次成功结果并提供重试；查询范围变化后不展示旧列表。' },
      { type: 'improvement', description: '工作台未知选题状态显示“状态待确认”，避免与进行中状态混淆。' },
    ],
  },
  {
    version: '9.1.23',
    date: '2026-10-16',
    title: '团队日报刷新保护',
    impactScope: ['团队日报', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '团队日报刷新失败时保留同一查询范围内最近一次成功结果；日期切换后忽略旧请求迟到回包，避免误示为空或覆盖当前内容。' },
      { type: 'improvement', description: '旧结果明确标注可能不是最新并支持只读重试；切换日期后不显示旧日期数据。' },
    ],
  },
  {
    version: '9.1.22',
    date: '2026-10-16',
    title: '首页最近变化刷新保护',
    impactScope: ['工作台', '最近变化'],
    changes: [
      { type: 'fix', description: '最近变化刷新失败时保留最近一次成功读取的内容，并明确标注内容可能不是最新。' },
      { type: 'improvement', description: '最近变化增加手动刷新入口；刷新期间旧内容仍可查看，失败后可只读重试。' },
    ],
  },
  {
    version: '9.1.21',
    date: '2026-10-15',
    title: '全站未保存修改离页保护',
    impactScope: ['选题与复盘', '创作与发布', '侧栏导航', '浏览器后退与退出登录'],
    changes: [
      { type: 'fix', description: '侧栏导航、浏览器后退和退出登录遵循页面未保存保护；取消离开后仍可继续当前修改。' },
      { type: 'fix', description: '保存或协作交接尚未完成时阻止离开；刷新/关闭页面提醒继续生效，窄屏网页编辑页纳入保护。' },
    ],
  },
  {
    version: '9.1.20',
    date: '2026-10-15',
    title: '协作与同步异常恢复',
    impactScope: ['Creator Agent 同步', '实时协作', '创作建议', '分布式任务'],
    changes: [
      { type: 'fix', description: 'Creator Agent 账号同步使用数据库时钟租约，失去运行进程后过期占用可自动结束并恢复重试。' },
      { type: 'fix', description: 'Yjs 对暂时性协调不可用/写入冲突保留并退避重试；未带时区的数据库时间按北京时间解析。' },
      { type: 'fix', description: '分布式任务在等待当前续租结果后再报告完成或租约失效。' },
    ],
  },
  {
    version: '9.1.19',
    date: '2026-10-15',
    title: '详情读取结果归属保护',
    impactScope: ['选题/创作/成片/发布详情', '资料详情', '复盘详情'],
    changes: [
      { type: 'fix', description: '详情首屏及历史、审计、风险等附属读取绑定当前记录；切换页面后，旧请求不能覆盖新详情。' },
      { type: 'fix', description: '选题、成片和发布的写后刷新只更新原记录；复盘手动刷新失败时保留最近一次成功的风险内容。' },
    ],
  },
  {
    version: '9.1.18',
    date: '2026-10-15',
    title: '首页准确计数与复盘离页保护',
    impactScope: ['桌面与手机首页', '权限入口', '复盘结论'],
    changes: [
      { type: 'fix', description: '手机首页读取完整进行中数量和三条最近选题，包含已通过选题；读取失败不显示为零，团队与个人范围标注准确。' },
      { type: 'fix', description: '切换账号后立即隐藏旧摘要和旧权限，迟到响应不能恢复旧创建入口；桌面新建选题按实际权限展示，灵感预览补齐三条。' },
      { type: 'fix', description: '复盘返回列表前提示未保存结论，取消保留原文；刷新或关闭时也会提醒，确认保存后解除提醒。' },
    ],
  },
  {
    version: '9.1.17',
    date: '2026-10-15',
    title: '保护提报草稿、复盘结论和创作资料',
    impactScope: ['选题提报', '复盘结论与行动项', '创作资料'],
    changes: [
      { type: 'fix', description: '提报等待时暂时锁定内容与草稿切换，快速重复点击只提交一次；本机草稿未清理成功时明确提示已提报。' },
      { type: 'fix', description: '复盘快照和行动项更新保留未保存结论，保存回执不覆盖新输入；发布前要求保存结论，行动项两个编辑入口正确同步。' },
      { type: 'fix', description: '复盘筛选与账号切换时忽略过期读取；创作资料读取成功、编辑器就绪后才允许添加，插入期间保护选择和关闭操作。' },
    ],
  },
  {
    version: '9.1.16',
    date: '2026-10-15',
    title: '日报权限、导出说明与批注菜单修正',
    impactScope: ['日报与报告中心', '数据导出', '编辑器批注'],
    changes: [
      { type: 'fix', description: '日报填写与团队入口按实际权限展示；无提交权限时仍能只读查看已有日报，并说明下一步。' },
      { type: 'improvement', description: '准确说明 JSON 文件只含对应模块数据，下载提示改为文件已生成并开始下载；CSV 状态和平台使用中文名称。' },
      { type: 'fix', description: '批注操作菜单脱离页面裁切，窄屏下保持可见；滚动或按 Escape 后关闭。' },
    ],
  },
  {
    version: '9.1.15',
    date: '2026-10-14',
    title: '统一浮层顺序与编辑菜单定位',
    impactScope: ['弹窗与提示', '全局搜索', '编辑器菜单', '移动壳层'],
    changes: [
      { type: 'improvement', description: '统一弹窗、提示、搜索和编辑菜单的显示顺序，弹窗打开时提示和全局搜索仍可操作。' },
      { type: 'fix', description: '编辑菜单脱离玻璃卡片裁切，随滚动调整位置，颜色面板保持在可见区域。' },
    ],
  },
  {
    version: '9.1.14',
    date: '2026-10-14',
    title: '日报提交保护与状态反馈修正',
    impactScope: ['日报归档', '提交反馈'],
    changes: [
      { type: 'fix', description: '准确显示日报的草稿、提交、审核、退回和归档状态；未知值提示待确认。' },
      { type: 'improvement', description: '提交失败后保留页面内重试说明，成功重试后不再同时显示旧失败通知。' },
      { type: 'fix', description: '提交期间锁定正文与刷新，快速重复触发只写入一次，失败后恢复编辑和重试。' },
    ],
  },
  {
    version: '9.1.13',
    date: '2026-10-14',
    title: '业务状态改用中文标签',
    impactScope: ['资料详情', '创作详情', '选题列表'],
    changes: [
      { type: 'improvement', description: '将资料可见范围、资料状态、创作审核状态和选题阶段翻译为中文业务用语；遇到未知值时显示待确认提示，不泄漏服务端代码。' },
    ],
  },
  {
    version: '9.1.12',
    date: '2026-10-14',
    title: '弹窗中的操作反馈可见',
    impactScope: ['操作反馈', '确认弹窗', '无障碍播报'],
    changes: [
      { type: 'fix', description: '将桌面与移动端全局通知层提升到确认弹窗之上，失败反馈仍可见、可关闭；桌面通知补充礼貌播报。' },
    ],
  },
  {
    version: '9.1.11',
    date: '2026-10-14',
    title: '登录页操作与语言收敛',
    impactScope: ['登录页', '跨分辨率可用性'],
    changes: [
      { type: 'improvement', description: '移除尚未接通的微信、企微和邮箱登录占位按钮；把重复的英文系统尾注统一为中文说明。' },
      { type: 'fix', description: '扩展登录页亮暗主题和 320px/390px 浏览器回归，并按文字透明度计算真实对比度。' },
    ],
  },
  {
    version: '9.1.10',
    date: '2026-10-14',
    title: '首页内容阶段服务端聚合',
    impactScope: ['首页内容流', '个人待办与读取失败恢复', '亮暗主题可读性'],
    changes: [
      { type: 'improvement', description: '首页一次读取各选题阶段的准确数量和有界预览；个人续写稿件按当前操作人汇总，避免分页遗漏；失败状态提供单一重试提示。阶段摘要在亮暗主题均通过 4.5:1 对比度回归。' },
      { type: 'fix', description: '无已配置成就时隐藏无法执行的“检查新成就”操作。' },
    ],
  },
  {
    version: '9.1.9',
    date: '2026-10-13',
    title: '成就页空状态与可访问性优化',
    impactScope: ['成就系统', '权限提示、无障碍与文档元数据'],
    changes: [
      { type: 'fix', description: '按管理权限提供正确的空成就下一步，并说明积分榜当前状态；补齐筛选名称、标题层级、计分文本对比度及中文页面元数据。' },
    ],
  },
  {
    version: '9.1.8',
    date: '2026-10-13',
    title: '全局与移动导航文字对比度修正',
    impactScope: ['全局导航', '无障碍与主题对比'],
    changes: [
      { type: 'fix', description: '全局搜索快捷键、移动端标题和未选中导航标签改用 Studio 次级文字令牌，提升深色主题下的可读性。' },
    ],
  },
  {
    version: '9.1.7',
    date: '2026-10-13',
    title: '选题编辑保存时机修正',
    impactScope: ['选题管理', '大纲编辑'],
    changes: [
      { type: 'fix', description: '仅修改选题信息时不再依赖未挂载的大纲编辑器；编辑大纲时等待编辑器准备完成后开放保存与版本留档。' },
    ],
  },
  {
    version: '9.1.6',
    date: '2026-10-13',
    title: '选题阶段补齐后再推进',
    impactScope: ['选题管理', '阶段推进'],
    changes: [
      { type: 'fix', description: '创作或成片制作记录缺失时，先补齐当前阶段再推进；状态、历史和下一阶段记录不会部分写入。' },
      { type: 'fix', description: '移动端推进成功后同步已创建的目标阶段记录，避免短暂显示错误的缺失提醒。' },
      { type: 'improvement', description: '选题编辑器保存入口暂不可用时，说明当前修改未保存与可采取的操作，不暴露内部状态名。' },
    ],
  },
  {
    version: '9.1.5',
    date: '2026-10-13',
    title: '移动个人页角色名称规范化',
    impactScope: ['移动端', '角色名称'],
    changes: [
      { type: 'fix', description: '内置角色显示名称与数据库角色表一致；未知角色显示“自定义角色”，未分配角色有明确提示，不再误显示为普通人员或暴露内部代码。' },
    ],
  },
  {
    version: '9.1.4',
    date: '2026-10-13',
    title: '发布管理操作与搜索更易用',
    impactScope: ['发布管理', '抖音数据关联', '可访问性'],
    changes: [
      { type: 'fix', description: '发布记录删除、抖音数据刷新和作品关联增加同步单飞保护，避免快速连点重复写入；等待确认时锁定相关操作入口。' },
      { type: 'improvement', description: '发布列表与抖音候选搜索补充明确的辅助技术名称和稳定控件标识。' },
    ],
  },
  {
    version: '9.1.3',
    date: '2026-10-13',
    title: '编辑提示与发布操作更稳妥',
    impactScope: ['创作编辑', '成片制作', '发布管理'],
    changes: [
      { type: 'improvement', description: '离开编辑页面前，明确说明尚未确认保存的最后修改可能无法恢复；重试、继续编辑和放弃离开的操作保持不变。' },
      { type: 'fix', description: '发布记录保存等待期间锁定表单并拦截重复提交，避免快速连点创建重复记录。' },
    ],
  },
  {
    version: '9.1.2',
    date: '2026-10-13',
    title: '工作台入口与选题筛选体验优化',
    impactScope: ['桌面工作台', '选题管理', '可访问性'],
    changes: [
      { type: 'fix', description: '首页任务区入口准确标注为“进入选题管理”，不再把选题列表说成全部跨模块任务。' },
      { type: 'improvement', description: '完善桌面列表/看板与移动选题筛选控件标识/名称、用户菜单账号/角色读屏名称，并为动画标题保留静态读屏文本。' },
    ],
  },
  {
    version: '9.1.1',
    date: '2026-10-13',
    title: '首页补充可信的创作者数据',
    impactScope: ['桌面工作台', '抖音数据', '权限可见范围'],
    changes: [
      { type: 'feature', description: '桌面首页最近变化区域可选显示近 7 天播放变化和最近一次粉丝总数，并标注统计口径与更新时间。' },
      { type: 'security', description: '仅已有创作者数据查看权限时读取；无账号、无指标时不显示数字，读取失败支持单独只读重试。' },
    ],
  },
  {
    version: '9.1.0',
    date: '2026-10-13',
    title: '首页最近变化可追溯',
    impactScope: ['工作台', '稿件版本', '稿件批注', '选题状态历史'],
    changes: [
      { type: 'feature', description: '首页最近变化改为展示可核验的稿件版本、批注/回复和选题状态历史，并提供站内直达。' },
      { type: 'security', description: '摘要沿用现有内容可见范围，限制字段白名单且不返回稿件或评论正文；读取失败可独立重试。' },
    ],
  },
  {
    version: '9.0.7',
    date: '2026-10-13',
    title: '内容复盘入口权限一致',
    impactScope: ['导航', '内容复盘', '权限可见范围'],
    changes: [
      { type: 'fix', description: '内容复盘导航入口改用页面路由相同的查看权限，避免账号能看到入口却被页面拒绝访问。' },
    ],
  },
  {
    version: '9.0.6',
    date: '2026-10-13',
    title: '首页复盘数据准确呈现',
    impactScope: ['工作台', '数据复盘', '权限可见范围'],
    changes: [
      { type: 'fix', description: '内容流复盘阶段改为显示真实复盘总数和最多三条复盘摘要，不再以已发布记录数和固定占位内容代替。' },
      { type: 'improvement', description: '首页复盘摘要复用复盘列表的既有可见范围；读取异常单独标记为不可用，不影响工作台其他内容。' },
    ],
  },
  {
    version: '9.0.5',
    date: '2026-10-13',
    title: '发布归档来源创作版本可追溯',
    impactScope: ['发布归档', '成片制作', '发布管理', '创作版本历史'],
    changes: [
      { type: 'feature', description: '归档详情可回到来源选题，展示成片/发布剧本来源创作版本并查看归档正文快照；来源缺失时明确不推断。' },
    ],
  },
  {
    version: '9.0.4',
    date: '2026-10-13',
    title: '创作初稿来源大纲版本直达',
    impactScope: ['创作管理', '选题管理', '大纲版本追溯'],
    changes: [
      { type: 'feature', description: '从创作来源卡直达选题大纲准确历史版本；桌面自动展开、移动网页只读展示，来源缺失时不回退到当前大纲。' },
    ],
  },
  {
    version: '9.0.3',
    date: '2026-10-13',
    title: '保护历史剧本的创作来源',
    impactScope: ['成片制作', '发布管理', '创作版本历史'],
    changes: [
      { type: 'fix', description: '创作版本清理与删除会检查成片/发布剧本逐版本来源，仍被历史卡引用的创作来源不会被清除。' },
    ],
  },
  {
    version: '9.0.2',
    date: '2026-10-13',
    title: '成片与发布历史版本来源直达',
    impactScope: ['成片制作', '发布管理', '跨模块版本追溯'],
    changes: [
      { type: 'feature', description: '每条成片或发布剧本历史显示其保存时记录的创作来源版本，并可打开对应版本；来源缺失时明确不推断。' },
    ],
  },
  {
    version: '9.0.1',
    date: '2026-10-13',
    title: '创作初稿关联大纲版本',
    impactScope: ['创作管理', '选题大纲', '来源追溯'],
    changes: [
      { type: 'feature', description: '创作初稿来源快照在且仅在精确匹配唯一显式大纲版本时显示版本号；旧记录、基线或歧义匹配不猜测。' },
    ],
  },
  {
    version: '9.0.0',
    date: '2026-10-13',
    title: '选题、拍摄与发布文稿版本历史',
    impactScope: ['选题管理', '成片制作', '发布管理', '稿件版本历史'],
    changes: [
      { type: 'feature', description: '选题大纲、拍摄剧本和发布文稿可显式保存小版本或大版本，并查看准确的只读历史内容。' },
      { type: 'improvement', description: '首次建立版本历史时保留未改动前基线；未知的旧记录时间和操作人保持未记录，不推测回填。' },
    ],
  },
  {
    version: '8.5.23',
    date: '2026-10-13',
    title: '选题流程阶段标签单行显示',
    impactScope: ['选题管理', '桌面表格', '响应式布局'],
    changes: [
      { type: 'fix', description: '审核、通过、创作、成片、发布和完成标签横向单行显示，避免在选题表格中逐字换行。' },
    ],
  },
  {
    version: '8.5.22',
    date: '2026-10-13',
    title: '移动选题详情与日期可读性修复',
    impactScope: ['移动工作台', '选题管理', '响应式布局'],
    changes: [
      { type: 'fix', description: '选题详情操作栏避开固定底部导航；选题列表和详情统一显示北京时间日期。' },
    ],
  },
  {
    version: '8.5.21',
    date: '2026-10-13',
    title: '移动创作写入期间编辑保护',
    impactScope: ['移动工作台', '创作管理', '写入反馈'],
    changes: [
      { type: 'fix', description: '稿件保存/提交等待期间暂时锁定编辑和选题，避免服务端旧正文与用户继续编辑的内容发生覆盖竞态。' },
    ],
  },
  {
    version: '8.5.20',
    date: '2026-10-13',
    title: '移动创作新建与写入保护',
    impactScope: ['移动工作台', '创作管理', '写入反馈'],
    changes: [
      { type: 'fix', description: '新建稿件会加载可关联选题，读取失败可重试；保存与提交阻止快速重复写入，失败保留正文并支持明确重试。' },
    ],
  },
  {
    version: '8.5.19',
    date: '2026-10-12',
    title: '移动日报重复操作保护',
    impactScope: ['移动工作台', '个人日报', '重复操作保护'],
    changes: [
      { type: 'fix', description: '提交期间同步拦截重复点击；接口延迟时同一日报只会保存一次，失败后仍可明确重试。' },
    ],
  },
  {
    version: '8.5.18',
    date: '2026-10-12',
    title: '移动日报账号切换隔离',
    impactScope: ['移动工作台', '个人日报', '账号隔离'],
    changes: [
      { type: 'fix', description: '切换账号后立即卸载旧日报状态；迟到的旧账号读取不能覆盖当前日报，保存成功后也不会继续以新账号身份提交。' },
    ],
  },
  {
    version: '8.5.17',
    date: '2026-10-12',
    title: '移动选题列表读取恢复',
    impactScope: ['移动工作台', '选题管理', '读取恢复'],
    changes: [
      { type: 'fix', description: '选题列表读取失败不再误显示成无匹配结果；明确提示失败并提供重试，已有缓存会标明可能过期。' },
    ],
  },
  {
    version: '8.5.16',
    date: '2026-10-12',
    title: '移动创作列表刷新状态',
    impactScope: ['移动工作台', '创作管理', '读取恢复'],
    changes: [
      { type: 'fix', description: '创作列表刷新失败时明确说明展示的是上次成功读取的数据；显式重试成功后清除过期提示，切换账号时丢弃旧请求与列表。' },
    ],
  },
  {
    version: '8.5.15',
    date: '2026-10-12',
    title: '移动选题资料读取恢复',
    impactScope: ['移动工作台', '选题资料', '读取恢复'],
    changes: [
      { type: 'fix', description: '选题关联资料读取失败时明确提示并提供安全重试，不再误显示为空；权限初始化不会重复发起资料读取。' },
    ],
  },
  {
    version: '8.5.14',
    date: '2026-10-12',
    title: '选题保存失败可重试',
    impactScope: ['选题管理', '保存反馈'],
    changes: [
      { type: 'fix', description: '选题大纲保存失败时明确提示并保留当前修改，释放保存状态后可显式重试。' },
    ],
  },
  {
    version: '8.5.13',
    date: '2026-10-12',
    title: '编辑器浮层滚动收起',
    impactScope: ['稿件编辑', '操作可达性'],
    changes: [
      { type: 'improvement', description: '工具栏下拉菜单在触发按钮滚出可视区后自动收起，避免遮挡页面其它操作。' },
    ],
  },
  {
    version: '8.5.12',
    date: '2026-10-12',
    title: '编辑器批注对话框体验',
    impactScope: ['稿件编辑', '无障碍体验'],
    changes: [
      { type: 'improvement', description: '新增与编辑批注使用统一 Studio 对话框，支持 Escape 取消并为输入补齐可访问名称。' },
      { type: 'fix', description: '修复窄屏批注对话框被页面动画或滚动容器移出视口的问题。' },
    ],
  },
  {
    version: '8.5.10',
    date: '2026-10-12',
    title: '作品库桌面键盘导航',
    impactScope: ['作品库', '可访问性'],
    changes: [
      { type: 'improvement', description: '桌面作品标题现在是可键盘聚焦的详情链接，Enter 可打开准确作品复盘。' },
      { type: 'fix', description: '保留整行鼠标导航，同时避免链接点击触发行级重复导航。' },
    ],
  },
  {
    version: '8.5.9',
    date: '2026-10-12',
    title: '发布管理窄屏操作可达性',
    impactScope: ['发布管理', '响应式布局', '可访问性'],
    changes: [
      { type: 'improvement', description: '发布列表横向滚动时固定抖音关联、编辑、打开链接和删除操作。' },
      { type: 'fix', description: '操作名称包含发布内容标题；320px 验证固定操作可达且其余字段仍可滚动。' },
    ],
  },
  {
    version: '8.5.8',
    date: '2026-10-12',
    title: '创作列表窄屏操作可达性',
    impactScope: ['创作管理', '响应式布局', '可访问性'],
    changes: [
      { type: 'improvement', description: '创作表格横向浏览时将查看和编辑操作固定在右侧，不必滚到末列才能操作。' },
      { type: 'fix', description: '查看/编辑操作添加对应选题名称；320px 浏览器验证操作可见且其他字段仍可滚动。' },
    ],
  },
  {
    version: '8.5.7',
    date: '2026-10-12',
    title: '创作弹窗交互与窄屏体验',
    impactScope: ['创作管理', '可访问性', '响应式布局'],
    changes: [
      { type: 'improvement', description: '创作新建与编辑弹窗统一使用 Studio 对话框，并补齐标题关联、对话框语义和 Escape 关闭。' },
      { type: 'fix', description: '窄屏弹窗内容现在可在操作区上方滚动；保存过程中关闭入口受保护。' },
    ],
  },
  {
    version: '8.5.6',
    date: '2026-10-12',
    title: '首次登录改密体验',
    impactScope: ['登录', '亮暗主题', '可访问性'],
    changes: [
      { type: 'fix', description: '首次登录强制改密弹窗在浅色和深色主题下均使用 Studio 令牌保持清晰可读。' },
      { type: 'fix', description: '认证态刚更新时保留改密流程，避免提前跳转离开弹窗；隔离浏览器覆盖三种登录布局。' },
    ],
  },
  {
    version: '8.5.5',
    date: '2026-10-12',
    title: '按钮动效接入主题令牌',
    impactScope: ['设置中心', 'React Bits', '亮暗主题'],
    changes: [
      { type: 'improvement', description: 'AI 按钮和边框、星光、电流、火花及光泽效果统一使用 Studio 语义颜色。' },
      { type: 'fix', description: '画布和悬停动效现在按最近的主题作用域解析 CSS 颜色，隔离浏览器核对亮暗主题实际颜色与对比度。' },
    ],
  },
  {
    version: '8.5.4',
    date: '2026-10-12',
    title: '文字动效接入主题令牌',
    impactScope: ['设置中心', 'React Bits', '亮暗主题'],
    changes: [
      { type: 'improvement', description: '渐变、闪光与聚焦文字效果改用 Studio 主题变量，亮暗主题下随令牌变化。' },
      { type: 'fix', description: '文字槽不再订阅独立全局主题状态，隔离浏览器验证两主题渐变实际解析色值并保持不保存偏好。' },
    ],
  },
  {
    version: '8.5.3',
    date: '2026-10-12',
    title: '外观预览统一主题令牌',
    impactScope: ['设置中心', '外观与动效', '主题预览'],
    changes: [
      { type: 'improvement', description: '外观中心亮暗预览和开发验收矩阵统一解析 Studio 背景、边框和文字令牌。' },
      { type: 'fix', description: '320px 隔离浏览器回归验证两种主题的令牌计算、矩阵标签对比度与无横向溢出，不保存个人设置。' },
    ],
  },
  {
    version: '8.5.2',
    date: '2026-10-12',
    title: '手机浏览器可查看历史资料快照',
    impactScope: ['创作历史追溯', '手机浏览器', '资料草稿'],
    changes: [
      { type: 'improvement', description: '手机浏览器查看历史创作版本时展示对应的只读资料快照；旧记录的未记录与明确空快照分别说明。' },
      { type: 'fix', description: '历史页面不会加载或展示当前可编辑资料草稿；Android 原生显示仍留待专项处理。' },
    ],
  },
  {
    version: '8.5.1',
    date: '2026-10-12',
    title: '手机成片页可查看创作来源版本',
    impactScope: ['成片制作', '创作历史追溯', '选题列表响应式'],
    changes: [
      { type: 'improvement', description: '手机宽度下可从成片详情直接打开其引用的创作版本，沿用安全离开检查。' },
      { type: 'fix', description: '桌面与手机浏览器的成片/发布来源入口均验证进入准确历史版本，不读取当前资料草稿。' },
      { type: 'improvement', description: '补充选题列表窄窗口下批量操作条可见性回归。' },
    ],
  },
  {
    version: '8.5.0',
    date: '2026-10-12',
    title: '保留创作资料版本快照',
    impactScope: ['创作版本历史', '创作资料', '来源追溯'],
    changes: [
      { type: 'improvement', description: '显式创建创作版本时，同步保存当时独立资料草稿的准确快照。' },
      { type: 'fix', description: '桌面历史版本只显示该版本资料快照；旧记录未采集和明确空白分别说明，不以当前草稿替代。' },
      { type: 'improvement', description: '新增可空历史快照字段，不猜测或回填升级前的资料内容。' },
    ],
  },
  {
    version: '8.4.8',
    date: '2026-10-12',
    title: '让来源版本时间准确稳定',
    impactScope: ['成片制作', '发布管理', '创作版本追溯'],
    changes: [
      { type: 'fix', description: '创作来源按精确版本提供时间：当前稿使用最近更新时间，历史稿使用对应快照时间。' },
      { type: 'fix', description: '成片编辑不再改变其关联创作版本的时间线时间。' },
      { type: 'fix', description: '历史创作预览明确标出资料区是当前整理草稿，不冒充历史材料快照。' },
    ],
  },
  {
    version: '8.4.7',
    date: '2026-10-12',
    title: '隔离创作资料稿件范围',
    impactScope: ['创作资料草稿', '生产记录切换', '来源引用'],
    changes: [
      { type: 'fix', description: '创作详情、历史分页和创作资料面板都会忽略已切换记录的旧响应。' },
      { type: 'fix', description: '切换时待保存资料仍写回原稿；离开后才返回的来源插入结果被安全丢弃。' },
    ],
  },
  {
    version: '8.4.6',
    date: '2026-10-12',
    title: '保护 Creator Center 账号范围与绑定码',
    impactScope: ['Creator Dashboard', '账号切换', '一次性绑定码'],
    changes: [
      { type: 'fix', description: 'Creator Dashboard 账号切换期间不显示旧范围数据，并丢弃晚返回的旧账号请求。' },
      { type: 'fix', description: '一次性绑定码创建使用同步锁防止快速重复请求，绑定码有效期按服务端返回的真实截止时间显示。' },
      { type: 'fix', description: '创建失败会显示错误并保留上次已确认的绑定码；明确重试成功后才替换为新码。' },
    ],
  },
  {
    version: '8.4.5',
    date: '2026-10-12',
    title: '避免运营报告旧列表覆盖新结果',
    impactScope: ['Creator Center 运营报告', '生成/删除互斥', '读取恢复'],
    changes: [
      { type: 'fix', description: '报告列表重载期间锁定生成和删除；删除确认打开时禁止并行重载，避免读取与写入竞争。' },
      { type: 'fix', description: '忽略较早返回的列表响应；生成或删除确认后旧读取不会覆盖当前结果。' },
    ],
  },
  {
    version: '8.4.4',
    date: '2026-10-12',
    title: '让消息已读数量与实际处理一致',
    impactScope: ['站内消息', '批量已读反馈', '账号数据边界'],
    changes: [
      { type: 'fix', description: '单条已读按当前账号更新；批量已读拒绝格式错误的 ID 参数，有效 ID 去重，并且只更新当前账号的消息。' },
      { type: 'fix', description: '接口及桌面成功提示显示服务端确认的实际更新数，不再按请求 ID 数量虚报。' },
      { type: 'fix', description: '已确认的已读/清空操作会使旧列表读取失效，避免过期汇总覆盖成功结果。' },
    ],
  },
  {
    version: '8.4.3',
    date: '2026-10-12',
    title: '让角色及其权限映射一起删除',
    impactScope: ['用户与角色管理', '角色权限', '删除反馈'],
    changes: [
      { type: 'fix', description: '角色权限映射和角色记录删除现同一事务提交；后续步骤失败会整体回滚，角色仍被用户使用时保留原有拒绝保护。' },
      { type: 'fix', description: '角色存在性、系统内置保护和使用人数在删除事务中重新确认，只有整体成功后才清理权限缓存。' },
    ],
  },
  {
    version: '8.4.2',
    date: '2026-10-12',
    title: '确保选题编辑及详情读回一起确认',
    impactScope: ['选题管理', '编辑反馈', '实时更新'],
    changes: [
      { type: 'fix', description: '选题更新和详情读回现位于同一事务；若更新后的详情无法读取，写入整体回滚，避免接口报错但选题已经变更。' },
      { type: 'fix', description: '详情确认事务提交后才发送实时更新事件，失败时不会广播未确认的部分状态。' },
    ],
  },
  {
    version: '8.4.1',
    date: '2026-10-12',
    title: '确保灵感评论、投票和删除完整提交',
    impactScope: ['灵感池', '评论', '投票', '删除反馈'],
    changes: [
      { type: 'fix', description: '灵感评论、投票计数和灵感连同评论/投票记录均在同一事务中提交；任一步失败都会回滚，避免重复评论、投票数漂移或只清理部分记录。' },
      { type: 'fix', description: '投票数按已保存的投票记录同步，变更结果在提交后广播；删除继续使用原有创建者/管理员/权限判断。' },
    ],
  },
  {
    version: '8.4.0',
    date: '2026-10-12',
    title: '补齐成片与发布的归档同步恢复',
    impactScope: ['成片制作', '发布管理', '发布归档', '保存反馈'],
    changes: [
      { type: 'feature', description: '新增成片/发布归档同步重试入口，使用已保存内容重建归档，不重复提交主记录。' },
      { type: 'fix', description: '归档刷新失败时明确区分“剧本已保存”和“归档待同步”；详情重新打开后仍能识别脚本快照落后。' },
    ],
  },
  {
    version: '8.3.3',
    date: '2026-10-12',
    title: '确保创作版本与历史快照一起保存',
    impactScope: ['创作管理', '版本历史', '来源追溯'],
    changes: [
      { type: 'fix', description: '创作新版本与旧稿历史快照现在同一事务提交；历史记录失败时，正文和版本号保持原样，可安全重试。' },
      { type: 'fix', description: '历史保留清理失败不会再把已确认保存误报为失败；清理可重试，保存结果仍以事务提交为准。' },
    ],
  },
  {
    version: '8.3.2',
    date: '2026-10-12',
    title: '完善资料、日报、复盘、用户管理与模板页可靠性',
    impactScope: ['资料库', '选题资料关联', '日报', '复盘', '用户与账户安全', '通知偏好', '内容资产页', '选题模板', '保存反馈'],
    changes: [
      { type: 'fix', description: '资料创建、更新、回收/恢复、标签、关联与文件元数据变更，连同选题资料关联/解除，均与操作记录在同一事务提交；审计失败整体回滚，真正的重复关联仍返回冲突。' },
      { type: 'fix', description: '日报提交和审核的状态更新与对应操作记录在同一事务提交；隔离日志失败会整体回滚，重试只留下准确的一条操作记录。' },
      { type: 'fix', description: '复盘创建、编辑、指标快照、行动项、发布及归档与各自操作记录在同一事务提交，日志失败时对应业务写入整体回滚。' },
      { type: 'fix', description: '用户创建、更新和删除、密码修改及个人资料更新与活动日志同事务提交；停用用户时也在同一事务撤销活动会话，任一失败均整体回滚。' },
      { type: 'fix', description: '通知偏好页暗色辅助文字与设置分类标题改用 Studio 次级文字令牌；窄屏权限申请上下排列，保存及状态按钮文字不再被拆行。' },
      { type: 'fix', description: '内容资产页提高卡片元数据、统计和来源说明的文字对比度，统一使用 Studio 次级文字令牌。' },
      { type: 'fix', description: '选题模板页辅助信息改用 Studio 次级文字令牌提升对比度；保存成功后的列表读取失败只提供 GET 重试，不重复提交。' },
    ],
  },
  {
    version: '8.3.1',
    date: '2026-10-12',
    title: '修正创作资料保存结果反馈',
    impactScope: ['桌面创作', '创作资料', '保存反馈'],
    changes: [
      { type: 'fix', description: '创作资料保存成功后直接返回已确认的内容和版本，不再因随后读取失败而误报保存失败或引发重复重试冲突。' },
    ],
  },
  {
    version: '8.3.0',
    date: '2026-10-12',
    title: '打通资料分类管理与知识库新增',
    impactScope: ['资料库', '知识库', '分类管理'],
    changes: [
      { type: 'feature', description: '资料库与知识库分类支持新增、改名、移动和删除；知识库新增资料后直接打开详情。' },
      { type: 'fix', description: '分类调整时同步重建后代路径并拒绝循环；写入确认后的列表刷新失败只重试读取，避免重复操作。' },
    ],
  },
  {
    version: '8.2.3',
    date: '2026-10-12',
    title: '说明资料来源回收后的内容保留',
    impactScope: ['桌面创作', '创作资料', '来源追溯'],
    changes: [
      { type: 'improvement', description: '明确原资料更新或移入回收站后，已复制到资料草稿的内容仍会保留；回收的来源记录可能无法打开。' },
    ],
  },
  {
    version: '8.2.2',
    date: '2026-10-12',
    title: '窄屏生产审阅右键回归校准',
    impactScope: ['生产审阅', '窄屏浏览器回归'],
    changes: [
      { type: 'improvement', description: '右键菜单回归通过目标编辑器定位点击，让浏览器自动滚动到可见区域，避免窗口缩放后使用失效的屏外坐标。' },
    ],
  },
  {
    version: '8.2.1',
    date: '2026-10-12',
    title: '区分资料草稿与正式稿的来源状态',
    impactScope: ['桌面创作', '创作资料', '来源追溯'],
    changes: [
      { type: 'improvement', description: '资料选择器分别显示来源已加入资料草稿、已引用到正文或两处均有，避免混淆独立整理内容与正式创作正文。' },
    ],
  },
  {
    version: '8.2.0',
    date: '2026-10-12',
    title: '创作资料保留引用来源并隔离正式正文',
    impactScope: ['桌面创作', '创作资料', '资料引用来源'],
    changes: [
      { type: 'improvement', description: '创作资料草稿明确独立于正式正文；从资料库加入草稿时保留原文和来源链接，显式引用到正文才写入创作正文。' },
    ],
  },
  {
    version: '8.1.0',
    date: '2026-10-12',
    title: '创作初稿保留选题大纲来源',
    impactScope: ['选题管理', '桌面创作', '移动创作', '来源追溯'],
    changes: [
      { type: 'feature', description: '从选题大纲创建创作初稿时保留不可漂移的原文快照；桌面与移动创作详情均可回看，旧稿来源未知时不猜测。' },
      { type: 'fix', description: '提交过期选题大纲时服务端拒绝建稿，避免正文与来源快照错配。' },
    ],
  },
  {
    version: '8.0.1',
    date: '2026-10-09',
    title: '跨端精确追溯引用的历史创作版本',
    impactScope: ['桌面网页', '移动网页', '成片制作', '发布管理', '创作版本历史'],
    changes: [
      { type: 'fix', description: '桌面和移动网页从成片或发布查看历史来源时展示准确的只读版本；版本不可用时不再用当前稿冒充来源，移动网页返回当前稿先等待数据加载。' },
    ],
  },
  {
    version: '8.0.0',
    date: '2026-10-09',
    title: '成片与发布剧本来源追溯',
    impactScope: ['成片制作', '发布管理', '发布归档', '创作版本历史'],
    changes: [
      { type: 'improvement', description: '独立剧本会记录首次保存时引用的已审核创作版本，来源随归档保留；历史来源未知时不猜测、不回填。' },
    ],
  },
  {
    version: '7.8.47',
    date: '2026-10-09',
    title: '独立剧本空白内容保留修正',
    impactScope: ['成片制作', '发布管理', '剧本分支'],
    changes: [
      { type: 'fix', description: '保存为空白的成片/发布独立剧本不会再回退显示创作原稿。' },
    ],
  },
  {
    version: '7.8.46',
    date: '2026-10-09',
    title: '编辑器选区菜单文字对比度修正',
    impactScope: ['创作编辑器', '颜色面板', '亮暗主题'],
    changes: [
      { type: 'fix', description: '文字颜色与高亮面板标题改用 Studio 次级文字令牌，亮暗主题均达到可读对比度。' },
    ],
  },
  {
    version: '7.8.45',
    date: '2026-10-09',
    title: '命令面板窄屏与暗色对比修正',
    impactScope: ['命令面板', '窄屏', '亮暗主题'],
    changes: [
      { type: 'fix', description: '320px 下 ESC 提示不再被面板裁切，命令辅助文字在暗色主题保持可读。' },
    ],
  },
  {
    version: '7.8.44',
    date: '2026-10-09',
    title: '创作详情窄屏操作回归',
    impactScope: ['创作详情', '移动网页', '响应式验收'],
    changes: [
      { type: 'improvement', description: '补齐 320px 移动网页的核心操作可见性回归，并修正桌面窄视口浮层测试入口。' },
    ],
  },
  {
    version: '7.8.43',
    date: '2026-10-09',
    title: '创作者作品详情读取失败恢复',
    impactScope: ['Creator Center', '作品复盘详情', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '详情读取失败可返回作品库或只读重试，不再停留在无恢复操作的通用错误页。' },
    ],
  },
  {
    version: '7.8.42',
    date: '2026-10-09',
    title: '创作者作品列表读取失败恢复',
    impactScope: ['Creator Center', '抖音作品库', '分页恢复'],
    changes: [
      { type: 'fix', description: '作品列表初次失败可重试，刷新保留已加载内容，分页失败可重试原游标。' },
    ],
  },
  {
    version: '7.8.41',
    date: '2026-10-09',
    title: '创作者趋势读取失败恢复',
    impactScope: ['Creator Center', '趋势中心', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '趋势读取失败可显式重试；同周期刷新失败保留已确认数据，切换周期不混显旧图表。' },
    ],
  },
  {
    version: '7.8.40',
    date: '2026-10-09',
    title: '抖音数据驾驶舱分项读取恢复',
    impactScope: ['Creator Center', '抖音数据驾驶舱', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '驾驶舱、同步记录和采集端状态独立恢复；不把未知状态显示成离线或零值。' },
    ],
  },
  {
    version: '7.8.39',
    date: '2026-10-09',
    title: '运营报告列表读取状态修正',
    impactScope: ['运营复盘报告', 'Creator Center', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '报告读取失败不再误示为空；账号范围与报告列表独立恢复。' },
    ],
  },
  {
    version: '7.8.38',
    date: '2026-10-09',
    title: '工作台部分读取失败与未知值修正',
    impactScope: ['首页工作台', '阶段统计', '失败恢复'],
    changes: [
      { type: 'fix', description: '首页数据读取失败不再显示为 0 或空状态；保留成功分区并允许显式只读重试。' },
    ],
  },
  {
    version: '7.8.37',
    date: '2026-10-09',
    title: '报告中心合并与导出契约修正',
    impactScope: ['报告中心', 'CSV/JSON 导出', '权限边界'],
    changes: [
      { type: 'fix', description: '导出适配真实响应结构；周报与导出入口统一到报告中心，继续受既有 export:data 权限保护。' },
    ],
  },
  {
    version: '7.8.36',
    date: '2026-10-09',
    title: '数据导出状态与防重复反馈',
    impactScope: ['数据导出', '失败恢复', '重复下载保护'],
    changes: [
      { type: 'fix', description: '导出失败持续显示可恢复状态，快速重复触发被同步拦截；成功/空结果提供明确的页面内反馈。' },
    ],
  },
  {
    version: '7.8.35',
    date: '2026-10-09',
    title: '周报复制结果反馈修正',
    impactScope: ['周报生成', '剪贴板反馈', '失败恢复'],
    changes: [
      { type: 'fix', description: '剪贴板兜底复制被浏览器拒绝时不再误报成功；明确提示失败并保留重试入口。' },
    ],
  },
  {
    version: '7.8.34',
    date: '2026-10-09',
    title: '数据复盘读取状态与恢复',
    impactScope: ['数据复盘', '指标状态准确性', '选题数据明细', '周报生成'],
    changes: [
      { type: 'fix', description: '读取失败时不再把未知指标显示为零或把周报呈现为空白；保留最近成功数据、标明统计周期，并提供只读重试。' },
    ],
  },
  {
    version: '7.8.33',
    date: '2026-10-09',
    title: '团队活动日志读取恢复',
    impactScope: ['团队活动日志', '成员筛选', '读取异常恢复'],
    changes: [
      { type: 'fix', description: '日志读取失败时不再误示为空，保留最近成功记录并提供只读重试；成员筛选失败可独立恢复。' },
    ],
  },
  {
    version: '7.8.32',
    date: '2026-10-09',
    title: '发布归档读取恢复',
    impactScope: ['发布归档', '读取异常恢复', '统计准确性'],
    changes: [
      { type: 'fix', description: '归档读取失败时不再误报为空或零数量；保留已加载内容并支持只读重试。' },
    ],
  },
  {
    version: '7.8.31',
    date: '2026-10-09',
    title: '资料详情删除安全反馈',
    impactScope: ['资料详情', '删除确认', '重复提交保护'],
    changes: [
      { type: 'fix', description: '删除请求处理中避免重复提交或误关确认；失败保留详情并可重试。' },
    ],
  },
  {
    version: '7.8.30',
    date: '2026-10-09',
    title: '创作详情右键菜单边界修复',
    impactScope: ['创作详情', '编辑器右键菜单', '亮暗主题', '窄屏定位'],
    changes: [
      { type: 'fix', description: '右键菜单和颜色子菜单脱离会裁切的稿件卡片，按视口边界完整显示；右键事件在编辑器布局时即可响应。' },
    ],
  },
  {
    version: '7.8.29',
    date: '2026-10-09',
    title: '复盘详情核心写入失败恢复验证',
    impactScope: ['复盘中心', '结论与快照', '发布与归档', '写入恢复'],
    changes: [
      { type: 'improvement', description: '结论、快照、发布和归档的失败/重试与跨操作互斥加入自动化回归，确保写入失败不会误改状态或重复提交。' },
    ],
  },
  {
    version: '7.8.28',
    date: '2026-10-09',
    title: '复盘详情操作防重复提交',
    impactScope: ['复盘中心', '行动项更新', '日报风险转行动项', '写入互斥'],
    changes: [
      { type: 'fix', description: '复盘详情写入共用同步互斥，行动项失败后保留内容供重试；日报风险转换仅在服务端确认后清空当前表单。' },
    ],
  },
  {
    version: '7.8.27',
    date: '2026-10-09',
    title: '行动项创建失败保留输入',
    impactScope: ['复盘行动项', '创建反馈', '重复操作保护'],
    changes: [
      { type: 'fix', description: '创建失败保留标题和说明；服务端确认后才清空，请求期间锁定表单并阻止重复提交。' },
    ],
  },
  {
    version: '7.8.26',
    date: '2026-10-09',
    title: '复盘创建防重复与失败恢复',
    impactScope: ['复盘中心', '创建反馈', '重复操作保护'],
    changes: [
      { type: 'fix', description: '新建复盘使用同步锁避免快速重复提交；失败保留表单与输入，成功后进入服务端确认的详情。' },
    ],
  },
  {
    version: '7.8.25',
    date: '2026-10-09',
    title: '复盘详情与日报风险读取恢复',
    impactScope: ['复盘中心', '日报风险', '读取错误恢复'],
    changes: [
      { type: 'fix', description: '详情读取失败不再误报不存在；风险失败不再误示无风险，保留旧数据并提供只读重试，读取不确定时暂停风险转换。' },
    ],
  },
  {
    version: '7.8.24',
    date: '2026-10-09',
    title: '复盘读取错误恢复与数据保留',
    impactScope: ['复盘中心', '行动项', '读取错误恢复'],
    changes: [
      { type: 'fix', description: '复盘列表/行动项读取失败时显示可恢复错误，不再误示为空；刷新失败保留最近一次成功数据。' },
    ],
  },
  {
    version: '7.8.23',
    date: '2026-10-09',
    title: '人员操作日志读取恢复',
    impactScope: ['人员管理', '操作日志', '读取错误恢复'],
    changes: [
      { type: 'fix', description: '操作日志读取失败时显示可恢复错误，不再误示为空；已有记录在刷新失败时保留，重试只发起读取。' },
    ],
  },
  {
    version: '7.8.22',
    date: '2026-10-09',
    title: '人员管理写入互斥与安全删除',
    impactScope: ['人员管理', '重复操作保护', '删除确认与重试'],
    changes: [
      { type: 'improvement', description: '启用/禁用与创建、编辑、删除共用同步锁；删除失败可安全重试，成功后立即更新当前列表。' },
    ],
  },
  {
    version: '7.8.21',
    date: '2026-10-09',
    title: '角色权限操作结果与读取恢复',
    impactScope: ['角色权限', '成功/失败反馈', '重复操作保护', '窄屏可用性'],
    changes: [
      { type: 'fix', description: '角色或权限读取失败不再误示为空；写入确认和后续列表刷新分开反馈，删除可确认/重试并在成功后立即更新。' },
    ],
  },
  {
    version: '7.8.20',
    date: '2026-10-09',
    title: '首页公告板结果反馈与权限边界',
    impactScope: ['公告板', '成功/失败反馈', '重复操作保护', '公告管理权限'],
    changes: [
      { type: 'fix', description: '公告板读取错误不再伪装成空列表；创建/删除在服务端确认后即时保留结果，后续列表失败只读恢复，删除需二次确认并沿用既有管理权限。' },
    ],
  },
  {
    version: '7.8.19',
    date: '2026-10-09',
    title: '移动网页通知偏好安全保存',
    impactScope: ['移动网页', '通知偏好', '重复提交保护', '失败重试'],
    changes: [
      { type: 'fix', description: '移动网页通知偏好保存期间增加同步互斥并锁定选项切换；失败后保留选择供重试，避免页面状态与在途写入不一致。' },
    ],
  },
  {
    version: '7.8.18',
    date: '2026-10-09',
    title: '设置中心备份删除确认与安全恢复',
    impactScope: ['备份管理', '删除二次确认', '重复操作保护', '只读列表恢复'],
    changes: [
      { type: 'fix', description: '旧备份入口现在要求二次确认并锁定并发写入；服务端确认删除后立即更新当前列表，后续列表失败时保留确认说明且只读重试。' },
    ],
  },
  {
    version: '7.8.17',
    date: '2026-10-09',
    title: '桌面个人设置写入防重复提交',
    impactScope: ['通知偏好', '个人资料', '账号安全', '重复提交保护', '失败重试'],
    changes: [
      { type: 'fix', description: '桌面通知偏好、个人资料和密码更新在请求期间使用同步互斥；失败保留可重试输入，密码仅在确认成功后清空。' },
    ],
  },
  {
    version: '7.8.16',
    date: '2026-10-09',
    title: '移动个人资料防重复保存',
    impactScope: ['移动网页', '个人资料', '重复提交保护', '失败重试'],
    changes: [
      { type: 'fix', description: '个人资料保存期间使用同步锁阻止重复请求；失败时保留姓名和邮箱输入，允许显式重试。' },
    ],
  },
  {
    version: '7.8.15',
    date: '2026-10-09',
    title: '选题模板读取恢复与操作去重',
    impactScope: ['选题模板', '首次读取错误态', '只读重试', '重复提交保护'],
    changes: [
      { type: 'fix', description: '模板列表初次读取失败时不再显示为空列表并可重试；新增、编辑、删除和列表重载使用同步锁防止并发重复操作。' },
    ],
  },
  {
    version: '7.8.14',
    date: '2026-10-09',
    title: '创作建议反馈防重复写入',
    impactScope: ['创作建议', '暂不采用反馈', '采纳反馈', '快速重复操作保护'],
    changes: [
      { type: 'fix', description: '暂不采用与采纳反馈分别按依据锁定请求；快速重复点击只产生一次反馈写入，不同建议状态互不覆盖，失败仍可重试。' },
    ],
  },
  {
    version: '7.8.13',
    date: '2026-10-09',
    title: '资料创建确认与详情读取恢复',
    impactScope: ['资料库', '创建结果确认', '详情读取重试', '防止重复创建'],
    changes: [
      { type: 'fix', description: '资料创建以服务端成功响应为准；详情暂时不可读时保留创建确认并只重试读取，不误报资料不存在或诱导重复创建。' },
    ],
  },
  {
    version: '7.8.12',
    date: '2026-10-09',
    title: '灵感投票防重复切换',
    impactScope: ['灵感库', '点赞与取消', '快速重复点击保护', '辅助状态'],
    changes: [
      { type: 'fix', description: '投票处理中锁定当前灵感，快速连点不会重复切换；投票按钮显示当前按压状态，失败时恢复原计数并允许重试。' },
    ],
  },
  {
    version: '7.8.11',
    date: '2026-10-09',
    title: '资料删除确认与列表恢复',
    impactScope: ['资料库', '发布归档', '删除状态即时更新', '只读重载'],
    changes: [
      { type: 'fix', description: '资料删除成功后即时移除当前项；列表刷新失败时持续说明已确认结果并提供只读重载。发布归档删除也立即更新当前列表，避免依赖额外读取。' },
    ],
  },
  {
    version: '7.8.10',
    date: '2026-10-09',
    title: '桌面日报部分提交安全恢复',
    impactScope: ['日报', '草稿版本保留', '提交失败重试', '重复创建保护'],
    changes: [
      { type: 'fix', description: '日报草稿保存成功后立即保留服务端记录及最新版本；若后续提交失败，持续说明草稿已保存，重试沿用同一日报和最新版本。' },
    ],
  },
  {
    version: '7.8.9',
    date: '2026-10-09',
    title: '选题批量操作结果与列表恢复',
    impactScope: ['选题管理', '批量审核与删除', '部分失败保护', '只读列表重载'],
    changes: [
      { type: 'fix', description: '批量审核/删除按逐项服务端结果保留成功变化与失败项选择；列表刷新失败时持续说明已确认数量，重载只读取列表且不会重复已成功操作。' },
    ],
  },
  {
    version: '7.8.8',
    date: '2026-10-09',
    title: '抖音关联操作确认与列表恢复',
    impactScope: ['发布管理', '抖音自动关联', '手工关联与解除', '只读列表重载'],
    changes: [
      { type: 'fix', description: '抖音自动关联和手工关联/解除经服务端确认后，若发布列表刷新失败，会持续说明已完成的操作并提供只读重载，避免重复操作。' },
    ],
  },
  {
    version: '7.8.7',
    date: '2026-10-09',
    title: '备份创建确认与清单恢复',
    impactScope: ['备份管理', '创建备份', '只读重载', '状态确认'],
    changes: [
      { type: 'fix', description: '备份创建成功后若清单读取失败，会持续说明备份已创建并提供只读重载，避免因列表未更新而重复创建。' },
      { type: 'improvement', description: '备份清单读取失败时不再伪装成没有备份文件。' },
    ],
  },
  {
    version: '7.8.6',
    date: '2026-10-09',
    title: '人员管理写入确认与刷新反馈',
    impactScope: ['人员管理', '创建与编辑', '列表重载', '表单可访问性'],
    changes: [
      { type: 'fix', description: '创建和编辑经服务端确认后独立反馈；用户列表读取失败时保留成功结果并提供只读重载，防止重复写入。' },
      { type: 'improvement', description: '人员表单字段标签与输入框关联，辅助技术可以通过字段名称识别控件。' },
    ],
  },
  {
    version: '7.8.5',
    date: '2026-10-09',
    title: '成片制作写入确认与列表恢复',
    impactScope: ['成片制作列表', '创建、删除与完成', '重复操作保护', '移动端只读恢复'],
    changes: [
      { type: 'fix', description: '创建、删除和完成制作计划后以服务端写入确认为准；本地即时保留可确认结果，列表读取失败时持续说明已完成并允许只读重载。' },
    ],
  },
  {
    version: '7.8.4',
    date: '2026-10-09',
    title: '选题资料关联即时更新与重复操作保护',
    impactScope: ['选题详情', '资料关联与解除', '即时页面反馈', '重复操作保护', '隔离浏览器回归'],
    changes: [
      { type: 'fix', description: '关联或解除关联经服务端确认后立即更新选题资料列表，不再依赖额外读取；写入处理中阻止重复和冲突操作。' },
    ],
  },
  {
    version: '7.8.3',
    date: '2026-10-09',
    title: '匿名意见写入与列表刷新结果分离',
    impactScope: ['匿名意见管理', '状态与公开切换', '回复与删除', '只读重试', '隔离浏览器回归'],
    changes: [
      { type: 'fix', description: '状态、公开切换、回复与删除获服务端确认后立即更新当前页面；列表刷新失败时持续说明已完成的操作，并提供只读重载，避免重复提交。' },
    ],
  },
  {
    version: '7.8.2',
    date: '2026-10-09',
    title: '运营复盘报告写入与刷新反馈分离',
    impactScope: ['运营复盘报告', '生成与删除确认', '只读重试', '重复操作保护', '隔离浏览器回归'],
    changes: [
      { type: 'fix', description: '生成或删除报告获服务端确认后，列表刷新失败会明确保留操作成功结果；删除行立即移除，重试只重新加载报告，不会重复写入。' },
    ],
  },
  {
    version: '7.8.1',
    date: '2026-10-09',
    title: '灵感提交即时确认与防重复',
    impactScope: ['灵感池', '创建结果反馈', '重复提交保护', '实时协作兼容', '隔离浏览器回归'],
    changes: [
      { type: 'fix', description: '提交灵感后直接显示服务端确认的记录并提示成功，不再依赖实时广播；提交过程中防止重复请求。' },
    ],
  },
  {
    version: '7.8.0',
    date: '2026-10-09',
    title: '日历创建与刷新结果分离',
    impactScope: ['排期日历', '创建结果确认', '只读重试', '重复操作保护', '移动端隔离回归'],
    changes: [
      { type: 'fix', description: '日历事件创建经服务端确认后，即使日历读取失败也会持续说明事件已创建；重试只重新读取，不会重复创建。' },
    ],
  },
  {
    version: '7.7.0',
    date: '2026-10-09',
    title: '发布写入与列表刷新结果分离',
    impactScope: ['发布管理', '创建更新删除反馈', '列表重试', '重复操作保护', '隔离浏览器回归'],
    changes: [
      { type: 'fix', description: '发布记录创建、更新或删除经服务端确认后，列表读取失败会说明已完成的操作并提供只读重试；删除行立即从当前页面移除，不会诱导重复提交。' },
    ],
  },
  {
    version: '7.6.0',
    date: '2026-10-09',
    title: '创作列表写入结果与刷新反馈',
    impactScope: ['创作管理', '操作成功反馈', '失败重试', '重复提交保护', '隔离浏览器回归'],
    changes: [
      { type: 'fix', description: '创作记录已保存或创建后，后续列表刷新失败不再误报写入失败；保留确认过的更新字段，明确提示已确认的创建，并提供只重试列表读取的入口。保存期间防止重复提交。' },
    ],
  },
  {
    version: '7.5.0',
    date: '2026-10-09',
    title: '首页待审核稿件工作列表',
    impactScope: ['负责人首页', '稿件审核入口', '创作数据范围', 'OpenAPI 合同', '隔离浏览器回归'],
    changes: [
      { type: 'improvement', description: '桌面与移动首页展示当前账号已有权限范围内的待审核稿件并直达处理；列表不是专属审核人指派，不返回稿件正文，也不改变现有审核规则。' },
    ],
  },
  {
    version: '7.4.0',
    date: '2026-10-09',
    title: '首页创作者同步异常提醒',
    impactScope: ['负责人首页', '创作者数据同步', '今日任务优先级', '账号定向跳转', '隔离浏览器回归'],
    changes: [
      { type: 'improvement', description: '管理员/负责人可在首页查看各账号最新同步失败或部分失败结果，并定向打开对应的数据驾驶舱。运行中的新同步会抑制旧失败，完整成功后异常自动移除；错误原文不显示。首屏保留消息、同步异常、审核、今日发布各一项。' },
    ],
  },
  {
    version: '7.3.0',
    date: '2026-10-09',
    title: '今日发布与待处理消息直达',
    impactScope: ['首页工作台', '多平台发布待办', '消息中心筛选', '北京时间显示', '隔离浏览器回归'],
    changes: [
      { type: 'improvement', description: '首页新增今日待发布/已定时的平台任务，显示北京时间日期与时分；同一选题任一平台已发布即移出待办，发布异常视为已处理。管理角色可直达当前账号未读且有关联页面的待处理消息；消息中心筛选与该口径一致。' },
    ],
  },
  {
    version: '7.2.0',
    date: '2026-10-09',
    title: '首页关注事项精确汇总',
    impactScope: ['首页工作台', '服务端关注事项汇总', '权限范围', 'OpenAPI 合同', '隔离回归'],
    changes: [
      { type: 'feature', description: '首页使用需登录的服务端汇总显示逾期、两日内截止和阶段卡点数量，并按现有权限统计全部可见或个人选题；总数去重，最多 8 条预览不影响统计，加载失败可单独重试。' },
    ],
  },
  {
    version: '7.1.0',
    date: '2026-10-09',
    title: '工作台按职责安排今日重点',
    impactScope: ['工作台', '任务优先级', '角色化文案', '隔离浏览器回归'],
    changes: [
      { type: 'improvement', description: '工作台任务区根据职责与实际权限调整标题、说明和排序：编辑/负责人优先待审事项，负责人显示团队今日重点，个人创作角色优先自己的稿件；发布操作只在已有权限时进入任务队列。' },
    ],
  },
  {
    version: '7.0.0',
    date: '2026-10-09',
    title: '工作台阶段停留时间',
    impactScope: ['工作台内容流', '选题阶段记录', '数据库迁移', '历史数据保护', '隔离回归'],
    changes: [
      { type: 'improvement', description: '工作台阶段卡为最新三条选题展示停留时长；新建、灵感转选题及真实阶段迁移记录北京时间，普通内容编辑不重置。历史数据不从不一致的历史时间推算，缺少可信起点时显示“阶段时间待确认”。新增可空字段并由 SAFE_EXPAND 迁移添加。' },
    ],
  },
  {
    version: '6.1.25',
    date: '2026-10-09',
    title: '工作台待办直达与内容流补齐',
    impactScope: ['工作台', '选题审核', '权限边界', '内容流阶段预览', '隔离浏览器回归'],
    changes: [
      { type: 'improvement', description: '首页待办“开始审核”直达现有选题审核弹窗，审核过程仍需用户明确确认；无权限或选题已非待审时不打开、不写入。内容流阶段卡展示当前有界列表中的三条最新创建选题，不增加全量拉取。' },
    ],
  },
  {
    version: '6.1.24',
    date: '2026-10-09',
    title: '操作结果反馈与番茄钟通知去重',
    impactScope: ['拍摄与选题操作', '灵感投票', '设置中心', '品牌设置', '番茄钟通知', '隔离浏览器回归'],
    changes: [
      { type: 'fix', description: '拍摄状态、选题模板及选题详情写入成功后若刷新失败，会保留已确认结果并提示重载确认，避免重复提交；灵感投票失败恢复原状态并显示错误反馈。番茄钟到时按页面可见性与通知偏好只选择站内提示或桌面通知之一。隔离浏览器确认品牌 Logo 选图仅改本页预览，保存失败保留预览并可重试，只有显式保存成功才持久化；设置中心通知偏好表格分隔线使用 Studio 边框令牌，浅/深主题均可见。' },
    ],
  },
  {
    version: '6.1.23',
    date: '2026-10-08',
    title: '主题对比、选题操作与编辑器浮层适配',
    impactScope: ['登录页', '知识库与创作报告', '选题管理', '编辑器浮层', '响应式浏览器回归', '权限管理'],
    changes: [
      { type: 'fix', description: '登录页三种布局统一使用主题颜色令牌；知识库分类、创作数据徽标/状态/趋势提示、旧报告提醒/异常/等级徽标、工作台/协作/审批状态、登录安全、消息通知、看板阶段与逾期文字、移动网络/错误提示、备份与名次徽标、编辑器批注/保存状态和危险操作采用主题对比令牌；选题列表下一步操作移入标题行，避免被固定操作列遮挡；编辑器主工具栏、选区颜色/高亮浮层及右键颜色/高亮子菜单按视口空间翻转并限制高度，避免被裁切。拍摄/发布详情的按钮与通过状态使用适配主题的令牌，关键操作增加 320px 验收；移动主操作/选中态、通知徽标及报告导航选中态统一到主题令牌，共用危险确认改用主题适配按钮；数据复盘排行、选题审核、移动消息筛选、日历日期、日报归档与分页当前页也使用亮暗主题对比令牌，并补充浏览器回归；报告生成入口收敛到统一主按钮。拍摄指标浅色主题渐变、登录/关于页品牌标记、发布完成图标、资料选中态、成就头像、选题阶段推进和编辑器离开失败弹窗补充双主题浏览器对比检查，相关对比度达到 4.5:1；拍摄详情返回按钮补无障碍名称。全站 B4/B5 审计仍继续。' },
      { type: 'improvement', description: '共用确认弹窗的 warning 操作使用主题适配的 amber 语义按钮，默认确认收敛到统一主按钮；审批流默认模板、管理员角色图标和系统内置徽标改用 primary 对比令牌；发布列表互动数据和来源小字、创作资料保存失败重试入口改用主题对比令牌；角色管理卡片通过 390px 单行与无横向溢出回归。亮暗主题隔离浏览器对比回归通过，资料保存失败后的重试恢复已验证，拍摄确认仅打开后取消且未推进业务状态。' },
      { type: 'improvement', description: '匿名意见箱提交图标在亮暗主题改用 cyan-soft/cyan-contrast 令牌，通过 3:1 非文本图形对比回归；B4/B5 全站审计继续。' },
      { type: 'improvement', description: '匿名意见管理表格将行操作固定于横向滚动视口右侧，并在窄屏换行显示；亮/暗主题 × 320/390/1440px 浏览器回归通过，页面无横向溢出，状态文字与删除图标对比达标。回复弹窗仅打开后取消，未修改意见。' },
      { type: 'improvement', description: '复盘列表的“详情”操作固定在横向表格可见区域；亮/暗主题和 320/390/1440px 浏览器回归通过，移动端滚动后不被底部导航遮挡。' },
      { type: 'improvement', description: '权限角色卡片补充 320px 验收、无障碍操作名称和亮暗主题删除悬停对比；选题列表查看/删除操作提供包含选题标题的无障碍名称，删除悬停使用有效的语义令牌。隔离回归覆盖 320/390px 与桌面多分辨率/缩放，亮暗主题图标对比达标。' },
    ],
  },
  {
    version: '6.1.22',
    date: '2026-10-08',
    title: '核心操作响应式验收',
    impactScope: ['选题详情', '创作详情', '浏览器回归'],
    changes: [
      { type: 'improvement', description: '增加核心操作在不同桌面宽度及 80%–125% 浏览器缩放下的可见与防裁切回归。' },
    ],
  },
  {
    version: '6.1.21',
    date: '2026-10-08',
    title: '审批流提示中文化',
    impactScope: ['审批流设计', '规则校验提示'],
    changes: [
      { type: 'improvement', description: '风险级别、规则原因和建议说明使用中文，并按实际阶段规则结果显示风险，不改变审批策略。' },
    ],
  },
  {
    version: '6.1.20',
    date: '2026-10-08',
    title: '选题只读提示',
    impactScope: ['选题详情', '只读账号提示'],
    changes: [
      { type: 'improvement', description: '只读账号会看到当前账号仅可查看此选题的说明，不再看到权限术语或类似禁用按钮的提示。' },
    ],
  },
  {
    version: '6.1.19',
    date: '2026-10-08',
    title: '创作创建阶段一致性',
    impactScope: ['创作记录创建', '选题阶段推进', '选题历史'],
    changes: [
      { type: 'fix', description: '创建已通过的创作记录时，在事务内复核选题阶段，避免过期请求留下阶段不一致的记录。' },
      { type: 'improvement', description: '阶段推进、历史和创作记录原子保存，任一写入失败均回滚。' },
    ],
  },
  {
    version: '6.1.18',
    date: '2026-10-08',
    title: '选题状态过期保护',
    impactScope: ['选题审核', '阶段推进', '选题历史与阶段记录'],
    changes: [
      { type: 'fix', description: '选题审核与阶段推进使用原状态条件更新；过期请求不会覆盖先提交的新状态。' },
      { type: 'improvement', description: '冲突请求会提示刷新重试，且不会重复创建创作稿或写入选题历史。' },
    ],
  },
  {
    version: '6.1.17',
    date: '2026-09-30',
    title: '创作状态审计留痕',
    impactScope: ['创作状态更新', '选题详情动态', '操作日志'],
    changes: [
      { type: 'fix', description: '提交审核、审核通过等状态变化写入选题历史与操作日志，记录前后状态、创作记录编号和操作者。' },
      { type: 'improvement', description: '状态审计与阶段交接同事务提交；普通状态变化不创建内容版本，重复或过期并发请求不重复记账。' },
    ],
  },
  {
    version: '6.1.16',
    date: '2026-09-30',
    title: '存量阶段记录核验与补建',
    impactScope: ['选题详情', '阶段工作记录', '选题历史与操作日志'],
    changes: [
      { type: 'fix', description: '选题详情识别当前阶段缺少的创作稿、成片或发布记录；有编辑权限时可幂等补齐，不改变选题阶段。' },
      { type: 'improvement', description: '已完成但缺发布记录时只提示核查历史；子记录、选题历史与操作日志同事务保存，无数据库迁移或历史回填。' },
    ],
  },
  {
    version: '6.1.15',
    date: '2026-09-30',
    title: '成片状态审计留痕',
    impactScope: ['成片状态更新', '选题详情历史', '操作日志'],
    changes: [
      { type: 'fix', description: '成片状态变化写入选题历史与操作日志，记录状态前后值、成片记录编号和操作者。' },
      { type: 'improvement', description: '状态及审计记录同事务保存；无变化和重复完成不重复生成状态记录。' },
    ],
  },
  {
    version: '6.1.14',
    date: '2026-09-30',
    title: '选题多份本机草稿续写',
    impactScope: ['桌面选题提报', '移动选题提报', '本机草稿恢复'],
    changes: [
      { type: 'feature', description: '提报页可保存多份本机草稿，支持新建、选择续写和删除。' },
      { type: 'improvement', description: '桌面与移动端共用账号隔离草稿；旧版单草稿安全迁移，提交成功只清理当前草稿。' },
      { type: 'improvement', description: '隔离回归覆盖迁移、存储失败、权限拒绝、草稿切换/删除与提交恢复；无服务端或数据库变化。' },
    ],
  },
  {
    version: '6.1.13',
    date: '2026-09-30',
    title: '自定义审批阶段交接一致性',
    impactScope: ['选题阶段', '自定义审批流', '阶段记录与历史'],
    changes: [
      { type: 'fix', description: '自定义审批推进阶段时同步补齐对应阶段记录，并将操作者和阶段变化记入选题历史与操作日志。' },
      { type: 'improvement', description: '事务内重新核对选题当前阶段；已有稿件/子记录保持不变，发布完成继续遵守多平台处理规则。' },
      { type: 'fix', description: '严格审批模式不再把本次新写入的记录用于自身判定，成功审批不会阻断当前或同节点后续审批。' },
      { type: 'improvement', description: '隔离 SQLite/API 覆盖权限拒绝、阶段记录创建与复用、未处理发布阻断和发布异常完成；无数据库迁移或历史回填。' },
    ],
  },
  {
    version: '6.1.12',
    date: '2026-09-30',
    title: '多平台发布归档入口',
    impactScope: ['资料中心', '发布归档', '多平台发布数据'],
    changes: [
      { type: 'feature', description: '资料中心新增独立发布归档入口，按选题展示归档并标注涉及平台与发布记录数。' },
      { type: 'improvement', description: '详情逐条展示各平台数据和对应发布记录链接；旧版单平台归档继续兼容，指标不跨平台相加。' },
      { type: 'fix', description: '保留原归档可见范围，只有具备删除权限时才显示删除操作，并明确删除只影响归档快照。' },
      { type: 'improvement', description: '发布平台名称改为中文显示，导航只高亮当前最具体入口。' },
      { type: 'improvement', description: '隔离 API 与 Playwright 桌面/移动回归通过；无数据库迁移或历史回填。' },
    ],
  },
  {
    version: '6.1.11',
    date: '2026-09-30',
    title: '多平台发布数据与归档',
    impactScope: ['发布数据', '周报', '选题归档', '主题内容资产'],
    changes: [
      { type: 'improvement', description: '多平台指标与周报按发布记录独立计算；已关联的抖音作品使用有效发布口径。' },
      { type: 'fix', description: '选题归档保留全部已发布平台及各自指标，并继续提供最近一条记录兼容字段。' },
      { type: 'improvement', description: '主题内容资产标出指标对应的平台和发布记录号，可直达对应发布详情。' },
      { type: 'improvement', description: '隔离 API 与 Playwright 桌面/移动回归通过；无数据库迁移。' },
    ],
  },
  {
    version: '6.1.10',
    date: '2026-09-30',
    title: '多平台发布完成规则',
    impactScope: ['多平台发布', '选题阶段一致性'],
    changes: [
      { type: 'improvement', description: '任一平台成功发布即完成选题；没有成功发布时，全部平台发布异常也按已处理完成。' },
      { type: 'fix', description: '仍有待发布或已定时记录时，单个平台异常不会提前完成选题；手动推进同样受发布结果约束。' },
      { type: 'improvement', description: '隔离 SQLite/API 回归覆盖多平台成功、异常待处理、全异常处理完及完成态保护；无数据库迁移。' },
    ],
  },
  {
    version: '6.1.9',
    date: '2026-09-30',
    title: '发布状态更正与阶段历史',
    impactScope: ['选题历史', '创作审核', '成片制作', '发布管理'],
    changes: [
      { type: 'fix', description: '人工更正发布状态时记录操作人和更正前后状态；已有权限及更正能力不变。' },
      { type: 'improvement', description: '创作、成片和发布的自动阶段交接写入选题历史；更正发布子状态不会让已完成选题倒退。' },
      { type: 'improvement', description: '隔离 SQLite/API 回归覆盖状态更正留痕、自动交接历史和完成阶段保持；无数据库迁移。' },
    ],
  },
  {
    version: '6.1.8',
    date: '2026-09-30',
    title: '成片交接后的状态保护',
    impactScope: ['成片制作', '选题阶段一致性'],
    changes: [
      { type: 'fix', description: '成片完成并流转到发布环节后，不能再退回制作中或更换关联选题。' },
      { type: 'fix', description: '成片状态仅接受计划中、制作中、已完成和已取消，未知状态会被拒绝。' },
      { type: 'improvement', description: '隔离 SQLite/API 回归覆盖完成态保护、无效状态拒绝及完成后仍可修正文案；无数据库变化。' },
    ],
  },
  {
    version: '6.1.7',
    date: '2026-09-30',
    title: '选题草稿跨桌面与手机续写',
    impactScope: ['桌面端提报选题', '移动端提报选题', '本机草稿恢复'],
    changes: [
      { type: 'improvement', description: '桌面与移动端按当前账号共用本机提报草稿；桌面输入也会自动保存，旧版桌面草稿可继续编辑。' },
      { type: 'fix', description: '提交失败优先保留可恢复副本；本机存储不可用时明确提示，提报权限不足时不会展示本机草稿。' },
      { type: 'improvement', description: '通过桌面/移动浏览器、恢复/迁移、权限拒绝、存储空间不足、提交失败与成功清理回归；无数据库变化。' },
    ],
  },
  {
    version: '6.1.6',
    date: '2026-09-30',
    title: '内容阶段交接更可靠',
    impactScope: ['创作审核', '成片制作', '发布管理'],
    changes: [
      { type: 'fix', description: '创作审核、成片完成和发布完成仅按选题当前阶段推进，不能跳过必要环节。' },
      { type: 'fix', description: '重复保存不会让选题倒退、重置已有发布状态或覆盖发布侧已修改的文案。' },
      { type: 'improvement', description: '补充隔离数据库工作流回归，覆盖正常推进、越级拒绝和重复操作保护；没有数据库结构或业务数据变化。' },
    ],
  },
  {
    version: '6.1.5',
    date: '2026-09-30',
    title: '创作阶段与稿件交接一致',
    impactScope: ['桌面端开始创作', '移动端开始创作', '选题阶段一致性'],
    changes: [
      { type: 'fix', description: '已通过选题先通过阶段事务补建或复用初始稿件，再进入编辑；推进失败不再留下游离草稿。' },
      { type: 'improvement', description: '创作中但历史稿件缺失时可补齐，并为桌面与移动端的一键开工增加重复提交保护。' },
      { type: 'improvement', description: '新增交接合同、选题 API 与桌面/移动 Playwright 浏览器回归；没有数据库结构或业务数据变更。' },
    ],
  },
  {
    version: '6.1.4',
    date: '2026-09-30',
    title: '操作失败提示优化',
    impactScope: ['操作失败提示', '内容上传'],
    changes: [
      { type: 'improvement', description: '服务暂时无法处理、功能暂时找不到或提交内容过大时，显示清楚的中文说明和重试建议。' },
      { type: 'improvement', description: '补充真实 HTTP 错误响应回归，检查 404、内容超限及错误信息脱敏。' },
    ],
  },
  {
    version: '6.1.3',
    date: '2026-09-30',
    title: '操作反馈与版本更新说明',
    impactScope: ['选题批量操作', '版本更新提示'],
    changes: [
      { type: 'fix', description: '批量处理按实际结果显示完成状态；部分成功会说明失败数量，全部失败显示错误并提示重试。' },
      { type: 'improvement', description: '版本提醒改为页面顶部轻提示，不再用全屏弹窗打断操作；完整内容可在设置中的更新说明查看。' },
      { type: 'fix', description: '合并更新说明中重复的 v2.20.5 历史记录，保留两次更新的修复内容，避免同一版本重复显示。' },
    ],
  },
  {
    version: '6.1.2',
    date: '2026-09-30',
    title: '选题流程状态回归保护',
    impactScope: ['选题状态推进', '创作/拍摄/发布流程记录'],
    changes: [
      { type: 'improvement', description: '补充集成回归保护，验证流程记录按需补建、已有创作稿复用、无效推进反馈与失败回滚；不改变运行逻辑。' },
      { type: 'improvement', description: '更新弹窗标题改为“版本更新”，避免在日常界面显示英文系统术语。' },
    ],
  },
  {
    version: '6.1.1',
    date: '2026-09-30',
    title: 'Web 端结构化诊断日志',
    impactScope: ['Web 故障定位', '浏览器日志脱敏'],
    changes: [
      { type: 'feature', description: '登录、Socket、前端 API、错误边界、权限、通知和运行环境诊断使用统一结构化浏览器控制台记录。' },
      { type: 'security', description: '日志只输出白名单事件与字段；不输出令牌、原始标识、错误消息或堆栈，也不向外部服务发送遥测。' },
    ],
  },
  {
    version: '6.1.0',
    date: '2026-09-30',
    title: 'API 与 Agent 结构化日志',
    impactScope: ['API 请求追踪', '登录限流诊断', '协作故障定位', 'Creator Agent 诊断', '敏感日志治理'],
    changes: [
      { type: 'feature', description: '活跃 API 与 Creator Agent 本地运行日志使用结构化事件，便于定位接口、协作和采集阶段问题。' },
      { type: 'security', description: 'API 与 Agent 日志使用白名单字段；不记录凭据、SQL/原始异常、URL、账号/设备标识、IP、UA 或协作房间标识。' },
    ],
  },
  {
    version: '6.0.3',
    date: '2026-09-30',
    title: 'Redis 异常终止恢复验收',
    impactScope: ['创作协作', 'Redis 故障恢复验收'],
    changes: [
      { type: 'improvement', description: '本机隔离 Redis 被强制终止后重启，Socket.IO stream 记录仍保留且双 API 协作恢复；不代表生产 HA 或断电恢复已验收。' },
    ],
  },
  {
    version: '6.0.2',
    date: '2026-09-30',
    title: '协作事件 AOF 恢复验收',
    impactScope: ['创作协作', 'Redis 故障恢复验收'],
    changes: [
      { type: 'improvement', description: '扩展隔离集成测试，验证 Redis 重启后 Socket.IO stream 记录保留并恢复双进程协作；不代表生产持久化或 HA 已验收。' },
    ],
  },
  {
    version: '6.0.1',
    date: '2026-09-30',
    title: '官方导入并发验收',
    impactScope: ['Creator Agent 官方导入', '多实例并发安全'],
    changes: [
      { type: 'improvement', description: '补充双进程并发提交同一官方导出批次的回归验证；业务处理、数据库结构与用户操作均无变化。' },
    ],
  },
  {
    version: '6.0.0',
    date: '2026-09-30',
    title: '分布式任务租约基础',
    impactScope: ['后台任务并发安全', '跨实例运行基础'],
    changes: [
      { type: 'feature', description: '新增共享数据库任务租约、自动续期、过期接管和单调 fencing token；此底座尚未接入具体生产任务。' },
      { type: 'security', description: '租约丢失会中止任务信号；双进程隔离测试覆盖互斥、续租、崩溃后的过期恢复与旧持有者隔离。生产仍保持单实例。' },
    ],
  },
  {
    version: '5.0.3',
    date: '2026-09-30',
    title: '站内消息实时同步',
    impactScope: ['消息中心', '实时通知'],
    changes: [
      { type: 'fix', description: '实时消息使用数据库实际生成的消息 ID，确保消息中心操作命中对应持久记录。' },
      { type: 'improvement', description: '消息在持久化成功后推送；隔离双实例验收覆盖用户隔离、已读及断线后恢复。' },
    ],
  },
  {
    version: '5.0.2',
    date: '2026-09-30',
    title: '多实例采集互斥',
    impactScope: ['短视频数据采集', '后台任务并发安全'],
    changes: [
      { type: 'security', description: '标准账号同步同一时刻只允许运行一个任务；账号忙时提示稍后重试，不会误报已接收。' },
      { type: 'improvement', description: '保留任务失败后的原编号重试；迁移先检查历史冲突，不自动删除或改写任务。' },
    ],
  },
  {
    version: '5.0.1',
    date: '2026-09-29',
    title: '跨实例协作真实 Redis 验收',
    impactScope: ['创作协作', '跨实例房间广播', '成员状态'],
    changes: [
      { type: 'improvement', description: '增加两个独立服务进程的 Redis Streams 集成验收，覆盖房间事件、跨实例成员查询和 Redis 恢复后的广播。' },
      { type: 'security', description: 'Redis 中断时协作入口关闭，恢复后才重新接受协作；生产仍默认单实例，sticky session 和完整负载均衡验收待完成。' },
    ],
  },
  {
    version: '5.0.0',
    date: '2026-09-29',
    title: '协作跨实例协调准备',
    impactScope: ['创作协作', '服务端运行配置', '协作成员状态'],
    changes: [
      { type: 'improvement', description: '增加可选的跨实例 Socket.IO 协调与共享持久状态冲突恢复；默认继续单实例运行。' },
      { type: 'security', description: '多实例配置缺少 Redis 协调时启动失败，不会静默降级；真实 Redis 联调与生产启用仍未完成。' },
    ],
  },
  {
    version: '4.5.0',
    date: '2026-09-29',
    title: '创作建议与选题提交关联',
    impactScope: ['数据指导创作', '选题提报', '发布效果追踪'],
    changes: [
      { type: 'feature', description: '正式提报后将用户明确采用的创作依据与选题 ID 关联，便于后续观察对应发布数据。' },
      { type: 'security', description: '提报时复核账号权限与最新证据；过期依据不产生归因，普通提报保持原路径。' },
    ],
  },
  {
    version: '4.4.0',
    date: '2026-09-29',
    title: '创作建议采纳反馈',
    impactScope: ['数据指导创作', '选题提报', '采纳反馈'],
    changes: [
      { type: 'feature', description: '可记录创作依据已用于选题草稿或暂不采用，并查看本账号成员反馈汇总。' },
      { type: 'improvement', description: '反馈绑定到明确样本证据版本；只保存汇总指标，不复制样本标题。' },
    ],
  },
  {
    version: '4.3.0',
    date: '2026-09-29',
    title: '协作更新本机恢复',
    impactScope: ['创作协作', '协作保存反馈', '页面重开恢复'],
    changes: [
      { type: 'feature', description: '浏览器会暂存尚未获确认的协作增量；重新打开稿件后先同步服务器，再恢复并重发待确认内容。' },
      { type: 'improvement', description: '服务端确认后清理本机副本；恢复失败会提醒并暂时锁定编辑，防止旧正文覆盖待恢复内容。' },
    ],
  },
  {
    version: '4.2.0',
    date: '2026-09-29',
    title: '协作更新确认与重试',
    impactScope: ['创作协作', '协作保存反馈', '断线恢复'],
    changes: [
      { type: 'improvement', description: 'Yjs 更新只有在服务端确认持久化后才从待发送队列移除；保存失败或确认超时会保留并退避重试。' },
      { type: 'improvement', description: '断线恢复后先接收服务端文档状态，再补发未确认更新；正式正文仍由原自动保存负责。' },
    ],
  },
  {
    version: '4.1.0',
    date: '2026-09-29',
    title: '协作运行态持久化',
    impactScope: ['创作协作', '协作恢复', '编辑器状态反馈'],
    changes: [
      { type: 'feature', description: '服务端先保存已接收的协作更新，再同步给其他协作者；重启后可从检查点恢复运行态。' },
      { type: 'improvement', description: '持久化、恢复或容量异常会明确提示；正式正文仍由原自动保存负责，Android 原生专项未包含。' },
    ],
  },
  {
    version: '4.0.0',
    date: '2026-09-29',
    title: '指标单一真源与抖音优先口径',
    impactScope: ['发布管理', '数据分析', '内容资产', '复盘'],
    changes: [
      { type: 'feature', description: '发布记录成为表现数据归属；抖音官方数据优先，手工数据只补官方缺项并标明每项来源。' },
      { type: 'improvement', description: '月报、周报、发布归档、主题资产和复盘快照使用同一套发布级指标规则；无法确认归属的旧记录保留但不计入。' },
    ],
  },
  {
    version: '3.8.0',
    date: '2026-09-29',
    title: '品牌化配置与默认主题',
    impactScope: ['系统设置', '品牌配置', '主题偏好'],
    changes: [
      { type: 'feature', description: '系统管理新增暗色/亮色默认主题；仅对当前浏览器尚未保存个人主题的用户生效。' },
      { type: 'improvement', description: '兼容旧系统设置记录，个人已选主题继续优先；Android 原生端及推送按计划延期到未来专项。' },
    ],
  },
  {
    version: '3.7.0',
    date: '2026-09-29',
    title: '移动端稿件批注',
    impactScope: ['移动创作页', '稿件批注与审阅建议'],
    changes: [
      { type: 'feature', description: '移动创作页支持查看稿件批注/建议线程、围绕选中文字发起讨论、回复和结束讨论，并可定位原文。' },
      { type: 'improvement', description: '继续沿用稿件权限和版本隔离；Android 推送提供方尚未配置，保持默认关闭。' },
    ],
  },
  {
    version: '3.6.0',
    date: '2026-09-29',
    title: '协作批注与审阅建议',
    impactScope: ['生产稿件', '版本协作', '讨论与审阅'],
    changes: [
      { type: 'feature', description: '稿件支持按版本隔离的批注讨论和审阅建议，包含线程回复、结束讨论及接受/拒绝建议；历史版本只读。' },
      { type: 'improvement', description: '接受建议前会精确核对原文并等待正文保存确认，只有正文已保存后才更新采纳状态。' },
    ],
  },
  {
    version: '3.5.0',
    date: '2026-09-29',
    title: '全局内容搜索',
    impactScope: ['命令面板', '稿件/资料/日报/复盘', '选题与成员检索'],
    changes: [
      { type: 'feature', description: '顶部命令搜索和 Ctrl/⌘K 现在支持稿件正文、资料全文、日报与条目、复盘摘要/行动项/指标，同时保留选题、成员与页面搜索。' },
      { type: 'improvement', description: '仅在输入至少 2 个字符后并行搜索，每个来源最多展示 8 条；部分来源故障时保留其他结果并提供重试，日报结果可直达对应日期归档。' },
    ],
  },
  {
    version: '3.4.0',
    date: '2026-09-28',
    title: '作品表现驱动选题构思',
    impactScope: ['抖音运营概览', '作品复盘', '桌面与移动提报选题'],
    changes: [
      { type: 'feature', description: '按账号内可比作品分析显式标签与问句标题，展示样本、累计播放中位数及对照依据；样本不足或数据过期时不生成推荐。' },
      { type: 'feature', description: '有权限的用户可从建议进入提报页，重新核验数据后手动追加创作依据，保留已有草稿内容，不自动提交。' },
    ],
  },
  {
    version: '3.3.54',
    date: '2026-09-28',
    title: '选题详情维度录入',
    impactScope: ['桌面与移动选题详情', '主题内容资产维度'],
    changes: [
      { type: 'improvement', description: '桌面和移动选题详情可直接登记、查看与移除城市、人物和项目；沿用既有选题权限、归属校验与操作历史，不自动关联历史资料。' },
      { type: 'improvement', description: '窄屏下选题流程进度改为组件内横向滚动，避免桌面详情缩窄时造成页面横向溢出。' },
    ],
  },
  {
    version: '3.3.53',
    date: '2026-09-28',
    title: '选题内容资产维度登记与聚合',
    impactScope: ['主题内容资产', '选题维度历史', '迁移 017'],
    changes: [
      { type: 'feature', description: '选题负责人可显式登记城市、人物、项目并按维度筛选和聚合主题、稿件、可见资料、拍摄与发布数量；所有权和 topic:update 双重校验，历史内容不自动回填。' },
    ],
  },
  {
    version: '3.3.52',
    date: '2026-09-28',
    title: '主题内容资产按选题聚合',
    impactScope: ['资料中心', '主题/稿件/资料关联', '分析权限范围'],
    changes: [
      { type: 'feature', description: '新增主题资产总览，按明确关联汇总稿件、资料、拍摄、发布和最近数据；按现有权限过滤，失败显示服务端说明并可重试，不猜测城市或人物关系。' },
    ],
  },
  {
    version: '3.3.51',
    date: '2026-09-28',
    title: '选题草稿续写与失败恢复',
    impactScope: ['桌面与移动选题提报', '本机草稿'],
    changes: [
      { type: 'fix', description: '桌面与移动端选题草稿可保存后续写；提报失败保留草稿，成功后清理。移动端本机存储失败会明确提示。' },
    ],
  },
  {
    version: '3.3.50',
    date: '2026-09-28',
    title: '选题列表与看板合并',
    impactScope: ['桌面与移动选题管理', '内容生产导航'],
    changes: [
      { type: 'improvement', description: '选题页可切换列表和看板，共用筛选；5 个内容/协作分析页集中到内容实验室，旧地址继续可用，独立排期日历保持原样。' },
    ],
  },
  {
    version: '3.3.49',
    date: '2026-09-28',
    title: '消息与人员列表分页',
    impactScope: ['消息中心', '人员管理', '列表接口'],
    changes: [
      { type: 'improvement', description: '消息列表按页加载并在服务端筛选，准确显示全局计数并支持跨页全部已读；人员管理增加全范围服务端搜索和分页。' },
    ],
  },
  {
    version: '3.3.48',
    date: '2026-09-28',
    title: '移动端选题一键开工',
    impactScope: ['移动端选题详情', '移动端创作编辑'],
    changes: [
      { type: 'feature', description: '审核通过或创作中的选题可直接创建/复用创作稿件，带入选题大纲并从编辑页返回原选题。' },
    ],
  },
  {
    version: '3.3.47',
    date: '2026-09-28',
    title: '选题标题相似提醒',
    impactScope: ['灵感池', '桌面选题提报', '移动选题提报'],
    changes: [
      { type: 'feature', description: '提报或转化前检查当前账号可查看的选题标题，相似结果或检查失败均由用户明确决定是否继续。' },
    ],
  },
  {
    version: '3.3.46',
    date: '2026-09-28',
    title: '灵感转选题关联持久化',
    impactScope: ['灵感池', '选题详情', '灵感转化接口'],
    changes: [
      { type: 'fix', description: '转为选题时在事务中持久保存关联并防止重复创建；无可信关联的历史记录不自动猜测。' },
    ],
  },
  {
    version: '3.3.45',
    date: '2026-09-28',
    title: '桌面消息已读失败恢复',
    impactScope: ['桌面消息中心', '待处理消息跳转'],
    changes: [
      { type: 'fix', description: '标记未读消息失败时留在消息中心并保留重试机会；请求中阻止重复提交，成功后才打开关联页面。' },
    ],
  },
  {
    version: '3.3.44',
    date: '2026-09-28',
    title: '内容生产导航顺序优化',
    impactScope: ['内容生产导航'],
    changes: [
      { type: 'improvement', description: '创作管理和成片制作移到选题管理之后，让内容生产导航更贴近实际工作顺序；页面路由与权限不变。' },
    ],
  },
  {
    version: '3.3.43',
    date: '2026-09-28',
    title: '桌面消息聚合与业务直达',
    impactScope: ['桌面消息通知', '选题关联跳转'],
    changes: [
      { type: 'improvement', description: '同一选题的同类桌面提醒在五分钟内合并更新并避免重复提示音；点击通知可安全直达站内关联页面。消息记录和未读状态仍逐条保留。' },
    ],
  },
  {
    version: '3.3.42',
    date: '2026-09-28',
    title: '移动消息错误恢复与账号安全反馈',
    impactScope: ['移动消息', '移动账号安全'],
    changes: [
      { type: 'fix', description: '消息读取失败且无缓存时显示错误与重试，不再误报暂无消息；未读标记失败时保留在消息页。移动端改密码增加长度校验和重复提交保护。' },
    ],
  },
  {
    version: '3.3.41',
    date: '2026-09-27',
    title: '移动本机内容按账号隔离',
    impactScope: ['移动消息', '选题与稿件草稿', '移动日报'],
    changes: [
      { type: 'security', description: '同一设备切换账号后，移动消息缓存和本机草稿只按当前账号恢复；旧版无法确认归属的缓存不再自动显示，原数据仍留在设备上。' },
    ],
  },
  {
    version: '3.3.40',
    date: '2026-09-27',
    title: '移动工作流状态兜底中文化',
    impactScope: ['移动首页/列表/详情', '拍摄/发布列表与详情', '历史状态显示'],
    changes: [
      { type: 'fix', description: '移动首页、选题/创作列表和选题/拍摄/发布详情对未知状态显示状态待确认；未知选题状态采用中性样式，拍摄 pending 显示为计划中。权限和服务端流程规则不变。' },
    ],
  },
  {
    version: '3.3.39',
    date: '2026-09-27',
    title: '移动日报状态和审核意见',
    impactScope: ['移动日报', '状态提示', '审核反馈'],
    changes: [
      { type: 'improvement', description: '移动日报显示中文审核状态和对应操作说明；被退回时可直接查看审核意见，已通过或已归档的日报明确为只读。' },
    ],
  },
  {
    version: '3.3.38',
    date: '2026-09-27',
    title: '移动岗位名称中文化',
    impactScope: ['移动我的账号页', '文案/后期/摄像角色'],
    changes: [
      { type: 'improvement', description: '补全文案、后期和摄像岗位的中文角色显示；角色权限保持不变，Android 工程版本已对齐。' },
    ],
  },
  {
    version: '3.3.37',
    date: '2026-09-27',
    title: '移动选题编辑与失败恢复',
    impactScope: ['移动选题提报', '移动选题详情', '角色权限反馈'],
    changes: [
      { type: 'fix', description: '修复权限状态变化触发的选题详情重复加载，恢复授权负责人的稳定编辑；创建和审核失败保留服务端说明及页面输入，支持重试。' },
    ],
  },
  {
    version: '3.3.36',
    date: '2026-09-27',
    title: '移动创作角色与稿件范围对齐',
    impactScope: ['移动工作中心', '创作详情', '角色权限反馈'],
    changes: [
      { type: 'fix', description: '移动创作详情依据服务端稿件可编辑范围决定是否开放编辑；无编辑范围时可继续只读查看，不再显示必然被拒绝的保存入口。' },
    ],
  },
  {
    version: '3.3.35',
    date: '2026-09-27',
    title: '移动日报部分成功后安全重试',
    impactScope: ['移动工作中心', '日报', '失败恢复'],
    changes: [
      { type: 'fix', description: '日报草稿已保存但提交失败时保留服务端新版本号，恢复后重试不再因旧版本号冲突。' },
    ],
  },
  {
    version: '3.3.34',
    date: '2026-09-27',
    title: '移动日历失败恢复与权限核验',
    impactScope: ['移动工作中心', '排期日历', '日历事件权限'],
    changes: [
      { type: 'fix', description: '日历读取失败提供错误说明和重试，刷新失败时不再保留旧月份汇总；创建失败保留输入并可安全重试。' },
      { type: 'improvement', description: '校验日历响应数据结构，并补充日历事件创建者权限和关联选题访问范围回归。' },
    ],
  },
  {
    version: '3.3.33',
    date: '2026-09-27',
    title: '移动日历与灵感关联选题闭环',
    impactScope: ['移动工作中心', '排期日历', '灵感池', '选题详情'],
    changes: [
      { type: 'improvement', description: '从首页或工作中心进入移动子页后返回原入口；日历排期和已转化灵感可直接打开关联选题，并回到来源页面。' },
      { type: 'fix', description: '修复日历与灵感关联选题只有文字、没有可达入口，以及子页返回固定回工作中心的问题。' },
    ],
  },
  {
    version: '3.3.32',
    date: '2026-09-27',
    title: '移动灵感与看板布局优化',
    impactScope: ['移动工作中心', '灵感池', '看板', '日历'],
    changes: [
      { type: 'improvement', description: '手机上的灵感和看板操作布局更清晰；触屏设备可直接看到删除入口，按钮文案不再被挤成竖排。' },
      { type: 'fix', description: '修复窄屏看板筛选标签逐字换行的问题，并验证日历、灵感、看板与返回工作入口。' },
    ],
  },
  {
    version: '3.3.31',
    date: '2026-09-27',
    title: '看板流程详情正确关联',
    impactScope: ['移动工作中心', '看板', '拍摄详情', '发布详情'],
    changes: [
      { type: 'fix', description: '从看板进入拍摄或发布环节时，先按选题找到对应流程记录再打开详情；缺少记录或加载失败时明确提示并回到选题。' },
    ],
  },
  {
    version: '3.3.30',
    date: '2026-09-27',
    title: '移动编辑器轻工具栏与 Android 版本对齐',
    impactScope: ['移动创作', '拍摄详情', '发布详情', 'Android 安装包'],
    changes: [
      { type: 'improvement', description: '手机端编辑器改用精简的常用写作工具，窄屏下发布编辑操作分行显示；桌面端完整工具栏保持不变。' },
      { type: 'fix', description: 'Android 应用版本名称和版本码跟随 XMT 当前版本，避免手机端包版本落后。' },
    ],
  },
  {
    version: '3.3.29',
    date: '2026-09-27',
    title: '移动工作流详情窄屏适配',
    impactScope: ['拍摄详情', '发布详情', '移动选题详情'],
    changes: [
      { type: 'improvement', description: '拍摄和发布详情在手机上更易阅读和操作，发布流程改为两列展示。选题协作动态用中文呈现审核结果。' },
      { type: 'fix', description: '选题详情遇到失权或记录不存在时不再展示本机旧数据，审核状态、历史意见、通知和实时广播增加一致性验证。' },
    ],
  },
  {
    version: '3.3.28',
    date: '2026-09-27',
    title: '移动工作流权限与消息状态保护',
    impactScope: ['移动选题', '移动日报', '移动消息'],
    changes: [
      { type: 'fix', description: '移动端选题新建、编辑和审核以及日报提交均按服务端权限区分；日报读取失败可重试且禁止空数据覆盖。批量已读仅同步成功项，部分失败保留未读状态。' },
    ],
  },
  {
    version: '3.3.27',
    date: '2026-09-27',
    title: '移动创作权限与通知加载保护',
    impactScope: ['移动创作', '移动通知偏好'],
    changes: [
      { type: 'fix', description: '移动端创作列表按查看权限显示，编辑器按查看/修改能力切换只读与可提交操作；只读状态不读取或写回本机草稿。移动通知的偏好、渠道和事件必须全部成功加载后才开放保存，失败时可重试。。' },
    ],
  },
  {
    version: '3.3.26',
    date: '2026-09-27',
    title: '手机浏览器移动办公入口',
    impactScope: ['手机浏览器', '移动工作中心', '移动导航'],
    changes: [
      { type: 'improvement', description: '手机浏览器打开应用时使用移动导航和已有移动页面；布局在本次打开期间保持稳定，避免旋转时中断编辑。' },
      { type: 'fix', description: '工作子页正确高亮工作导航并提供返回入口；移动壳层可显示保存等操作反馈。' },
    ],
  },
  {
    version: '3.3.25',
    date: '2026-09-27',
    title: '个人设置与系统管理分组',
    impactScope: ['设置中心', '品牌信息', '数据与备份'],
    changes: [
      { type: 'improvement', description: '设置中心按个人、系统管理、产品信息分组；关于系统展示已保存的品牌信息。' },
      { type: 'fix', description: '系统配置读取失败时提供重试并阻止默认值误保存；备份读取失败不再显示为暂无记录。' },
    ],
  },
  {
    version: '3.3.24',
    date: '2026-09-27',
    title: '通知偏好与品牌 Logo 保存反馈',
    impactScope: ['通知偏好', '品牌设置'],
    changes: [
      { type: 'fix', description: '通知配置必须完整加载后才可保存，避免读取失败时以空列表覆盖已有偏好；Logo 选择、图片读取失败和保存应用状态反馈更准确。' },
    ],
  },
  {
    version: '3.3.23',
    date: '2026-09-27',
    title: '实时通知单链路呈现',
    impactScope: ['选题实时更新', '灵感实时更新', '系统桌面通知'],
    changes: [
      { type: 'fix', description: '房间事件只显示应用内 toast，桌面提醒由持久化个人消息触发，避免同一业务事件重复弹系统通知。' },
    ],
  },
  {
    version: '3.3.22',
    date: '2026-09-27',
    title: '日报、番茄钟与已读状态反馈',
    impactScope: ['日报与月/年报', '番茄钟统计', '消息中心'],
    changes: [
      { type: 'fix', description: '加载错误保留为可见错误并可重试；提交结果明确反馈；批量已读局部成功状态准确同步。' },
    ],
  },
  {
    version: '3.3.21',
    date: '2026-09-27',
    title: '业务数据失败和竞态保护',
    impactScope: ['成就系统', '资料搜索', '资料列表'],
    changes: [
      { type: 'fix', description: '成就关键接口失败显示重试；资料搜索和列表仅接受最新请求结果。' },
    ],
  },
  {
    version: '3.3.20',
    date: '2026-09-27',
    title: '周报加载失败可重试',
    impactScope: ['报告中心周报'],
    changes: [
      { type: 'fix', description: '周报接口失败显示明确错误及重试，不再伪装为暂无数据。' },
    ],
  },
  {
    version: '3.3.19',
    date: '2026-09-27',
    title: '知识库过期请求保护',
    impactScope: ['知识库搜索', '分类切换'],
    changes: [
      { type: 'fix', description: '仅提交最新分类/搜索请求的结果，避免迟到响应覆盖当前资料或加载/错误状态。' },
    ],
  },
  {
    version: '3.3.18',
    date: '2026-09-27',
    title: '全局崩溃回退双主题修复',
    impactScope: ['全局错误恢复', '明暗主题'],
    changes: [
      { type: 'fix', description: '错误回退改用双主题表面、文字与统一按钮样式；重载、返回首页及复制诊断保持不变。' },
    ],
  },
  {
    version: '3.3.17',
    date: '2026-09-27',
    title: '共用空状态图标底色',
    impactScope: ['空状态', '明暗主题'],
    changes: [
      { type: 'fix', description: '图标面板改用不透明 Studio 表面令牌，修复背景透明；空状态文案和可选操作不变。' },
    ],
  },
  {
    version: '3.3.16',
    date: '2026-09-27',
    title: '403 权限提示主题底色',
    impactScope: ['共用权限提示', '明暗主题'],
    changes: [
      { type: 'fix', description: '权限提示头部及锁图标面板改用双主题语义柔和底色和中性边框，权限判断与导航不变。' },
    ],
  },
  {
    version: '3.3.15',
    date: '2026-09-27',
    title: '确认弹窗主题底色',
    impactScope: ['共用确认弹窗', '明暗主题'],
    changes: [
      { type: 'fix', description: '危险、警告及默认类型图标面板改用双主题语义底色、中性边框和 Studio 对比文字。' },
    ],
  },
  {
    version: '3.3.14',
    date: '2026-09-27',
    title: '共用错误状态主题底色',
    impactScope: ['共用错误提示', '明暗主题'],
    changes: [
      { type: 'fix', description: '失败、警告和未找到状态图标面板改用双主题可见底色和中性边框，提示及重试行为不变。' },
    ],
  },
  {
    version: '3.3.13',
    date: '2026-09-27',
    title: '组织权限徽标主题底色',
    impactScope: ['组织权限', '明暗主题'],
    changes: [
      { type: 'fix', description: '角色和账户启用状态徽标改用可见的双主题语义柔和底色及中性边框。' },
    ],
  },
  {
    version: '3.3.12',
    date: '2026-09-27',
    title: '全局通知主题底色',
    impactScope: ['全局通知', '明暗主题'],
    changes: [
      { type: 'fix', description: '成功、失败、警告和提示通知改用双主题可见的语义柔和底色与中性边框。' },
    ],
  },
  {
    version: '3.3.11',
    date: '2026-09-27',
    title: '成就稀有度标签主题底色',
    impactScope: ['成就系统', '明暗主题'],
    changes: [
      { type: 'fix', description: '四档成就稀有度标签改用可见的双主题语义底色和中性边框，筛选与成就逻辑不变。' },
    ],
  },
  {
    version: '3.3.10',
    date: '2026-09-27',
    title: '移动端选题状态标签主题底色',
    impactScope: ['移动选题列表', '移动选题详情', '明暗主题'],
    changes: [
      { type: 'fix', description: '移动端选题列表与详情按待审、通过、驳回、创作、拍摄和发布阶段显示语义底色与中性边框。' },
    ],
  },
  {
    version: '3.3.9',
    date: '2026-09-27',
    title: '复盘状态标签主题底色',
    impactScope: ['复盘列表', '复盘行动项', '明暗主题'],
    changes: [
      { type: 'fix', description: '复盘及行动项状态标签改用双主题语义柔和底色，状态与操作逻辑不变。' },
    ],
  },
  {
    version: '3.3.8',
    date: '2026-09-27',
    title: '灵感标签主题底色',
    impactScope: ['灵感库', '明暗主题'],
    changes: [
      { type: 'fix', description: '灵感类别和已转选题标签改用双主题语义柔和底色，转化和评论逻辑不变。' },
    ],
  },
  {
    version: '3.3.7',
    date: '2026-09-27',
    title: '发布详情状态标签主题底色',
    impactScope: ['发布详情', '明暗主题'],
    changes: [
      { type: 'fix', description: '发布状态标签改用双主题语义柔和底色与中性边框，发布状态及流转不变。' },
    ],
  },
  {
    version: '3.3.6',
    date: '2026-09-27',
    title: '成片制作标签主题底色',
    impactScope: ['成片制作详情', '明暗主题'],
    changes: [
      { type: 'fix', description: '成片制作阶段、完成和本地编辑提示改用可见的双主题柔和底色令牌。' },
    ],
  },
  {
    version: '3.3.5',
    date: '2026-09-27',
    title: '选题阶段标签主题底色',
    impactScope: ['选题详情', '明暗主题'],
    changes: [
      { type: 'fix', description: '选题详情阶段状态标签改用可见的主题语义柔和底色，状态流转逻辑不变。' },
    ],
  },
  {
    version: '3.3.4',
    date: '2026-09-24',
    title: '创作状态标签主题底色',
    impactScope: ['创作列表', '明暗主题'],
    changes: [
      { type: 'fix', description: '选题和稿件状态标签改用明确的语义柔和底色令牌，确保背景在明暗主题下可见。' },
    ],
  },
  {
    version: '3.3.3',
    date: '2026-09-24',
    title: '灵感新评论提示对比度',
    impactScope: ['灵感库', '明暗主题'],
    changes: [
      { type: 'fix', description: '灵感库“有新评论”标签改用可见主题表面与高对比文字，评论事件逻辑保持不变。' },
    ],
  },
  {
    version: '3.3.2',
    date: '2026-09-24',
    title: '趋势周期主题对比度',
    impactScope: ['数据趋势中心', '明暗主题'],
    changes: [
      { type: 'fix', description: '趋势周期选中态改用主题柔和表面和 cyan 对比文字，增强当前周期的可见性与可读性。' },
      { type: 'improvement', description: '重新验收编辑器浅色/暗色主题下的批注添加和编辑路径。' },
    ],
  },
  {
    version: '3.3.1',
    date: '2026-09-24',
    title: '浅色主题批注输入修正',
    impactScope: ['富文本编辑器', '浅色主题'],
    changes: [
      { type: 'fix', description: '编辑器浅色主题下的批注输入框改用统一表面与占位文字颜色，保持输入体验跟随当前主题。' },
    ],
  },
  {
    version: '3.3.0',
    date: '2026-09-24',
    title: '选题草稿、窄屏列表与编辑器写作辅助',
    impactScope: ['选题提报', '选题列表', '富文本编辑器'],
    changes: [
      { type: 'feature', description: '选题可先存本机草稿，下次继续编辑；提报成功后直达选题详情。' },
      { type: 'fix', description: '存草稿不再误建待审选题，编辑器页面切换时不再偶发报错。' },
      { type: 'improvement', description: '大纲使用统一编辑器，选题列表在窄屏仍可查看操作按钮。' },
      { type: 'feature', description: '编辑器可查找高亮并逐个或全部替换；只读时仅可查找，替换可撤销。' },
      { type: 'feature', description: '编辑器显示当前字数、目标进度与预计阅读时长；目标只保存在当前设备。' },
      { type: 'feature', description: '当前稿件可进入专注写作，暂时隐藏导航、资料和版本区，退出后原样恢复。' },
      { type: 'feature', description: '当前稿件可按选题大纲补入缺失小节，重复点击不复制，插入可撤销。' },
      { type: 'fix', description: '修复通知更新触发创作详情重载、覆盖刚插入正文的问题。' },
      { type: 'feature', description: '创作资料可连同来源链接引用到正式正文，搜索结果按当前稿件显示已用或待用。' },
      { type: 'feature', description: '选中资料草稿中的原文片段可选择来源引用到正文，来源不匹配时不会插入。' },
    ],
  },
  {
    version: '3.2.0',
    date: '2026-09-23',
    title: '产品工作流全面改造',
    impactScope: ['工作台', '内容生产', '导航', '移动端', '系统设置'],
    changes: [
      { type: 'feature', description: '首页改为按角色聚合今日任务、逾期提醒、七阶段内容流和最近变化的工作台。' },
      { type: 'fix', description: '打通灵感转选题、审核选题进入创作和已有稿件更新链路，避免修改时误建重复稿件。' },
      { type: 'improvement', description: '日常导航收敛为五个业务分组，命令面板、移动状态和系统设置统一使用业务语言。' },
      { type: 'improvement', description: '创作列表增加兼容式分页和精确总数，旧调用方式保持可用。' },
    ],
  },
  {
    version: '3.1.2',
    date: '2026-09-23',
    title: '版本操作按钮跨设备显示修复',
    impactScope: ['创作管理', '版本操作', '跨分辨率'],
    changes: [
      { type: 'fix', description: '修复部分电脑/缩放下「另开新版」等版本操作按钮完全不显示的问题。' },
      { type: 'improvement', description: '核心操作按钮始终可见，空间不足时自动换行，不再被侧栏隐藏或裁切。' },
    ],
  },
  {
    version: '3.1.1',
    date: '2026-09-23',
    title: '编辑器文字选中可见性修复',
    impactScope: ['富文本编辑器', '创作管理', '亮色/暗色主题'],
    changes: [
      { type: 'fix', description: '修复亮色/暗色下编辑器文字选区对比度过低、几乎不可见的问题。' },
      { type: 'improvement', description: '选区统一使用主题高对比色：亮色中深蓝底白字，暗色较亮蓝底白字；彩色文字与高亮亦可辨认。' },
    ],
  },
  {
    version: '3.1.0',
    date: '2026-09-22',
    title: 'Studio Atelier 与项目完整性升级',
    impactScope: ['全局界面', '登录安全', '资料中心', '协作编辑', '番茄钟', '抖音运营中心'],
    changes: [
      { type: 'feature', description: '引入 Studio Atelier 设计系统：统一深空墨蓝色板、发丝线玻璃材质与镜面高光卡片。' },
      { type: 'improvement', description: '按钮、输入框、状态标签、空态/骨架/错误态全面 token 化，深浅主题对比度提升。' },
      { type: 'improvement', description: '命令面板、模态与更新弹窗共用统一浮层入场编排，交互节奏更一致。' },
      { type: 'improvement', description: '登录页与首页驾驶舱按新视觉精修，编辑器工具栏 chrome 对齐系统材质。' },
      { type: 'security', description: '需要修改密码的账号先完成改密才能使用业务接口；资料写入和协作编辑按授权范围检查。' },
      { type: 'fix', description: '番茄钟计时和统计接入服务端，旧抖音技术页转到运营中心，失效的社媒复盘入口停止开放。' },
    ],
  },
  { version: '3.0.5', date: '2026-09-22', title: '抖音周期指标可用性修复', impactScope: ['抖音运营中心'], changes: [{ type: 'fix', description: '周期卡片展示官方播放、互动值及粉丝基线缺失原因，官方作品导出不再伪造当日粉丝快照。' }] },
  { version: '3.0.4', date: '2026-09-21', title: '协作编辑与版本记录修复', impactScope: ['创作管理', '内容动态'], changes: [{ type: 'fix', description: '多人同时编辑时保留各自新增的内容；普通粘贴不再自动生成新版。' }, { type: 'fix', description: '版本记录按北京时间展示真实保存事件及操作人，历史快照不再重复显示为新版本。' }] },
  { version: '3.0.3', date: '2026-09-21', title: '抖音定时官方导出稳定化', impactScope: ['Creator Agent', '抖音运营中心'], changes: [{ type: 'fix', description: '每日与 12 小时自动任务使用官方四文件采集路径，避免全量滚动异常阻断定时导出。' }] },
  { version: '3.0.2', date: '2026-09-19', title: '抖音作品状态标量兼容', impactScope: ['Creator Agent', '抖音运营中心'], changes: [{ type: 'fix', description: '兼容抖音对象形态的作品状态，未知结构按缺失处理，避免普通作品快照部分失败。' }] },
  { version: '3.0.1', date: '2026-09-17', title: '抖音作品数据导出定位修复', impactScope: ['Creator Agent', '抖音运营中心'], changes: [{ type: 'fix', description: '固定选择数据中心“作品数据”区域的导出按钮，避免误下载粉丝指标文件。' }] },
  { version: '3.0.0', date: '2026-09-17', title: '抖音官方双导出与逐日口径', impactScope: ['抖音运营中心', '复盘报告', 'Creator Agent'], changes: [{ type: 'feature', description: '后台下载作品列表及昨天、近 7 天、近 30 天官方数据，按最新完整文件清洗。' }, { type: 'improvement', description: '周期计数按日求和，比例和平均播放时长按播放量加权，不再对日流量二次差分。' }] },
  { version: '2.22.3', date: '2026-09-17', title: '抖音官方增长口径保护', impactScope: ['抖音运营中心', '复盘报告'], changes: [{ type: 'fix', description: '官方累计指标不再与旧采集快照混算；缺少同口径基线时，播放和互动周期增长显示暂不可用。' }] },
  { version: '2.22.2', date: '2026-09-17', title: '抖音官方作品计数校准', impactScope: ['抖音运营中心', '复盘报告'], changes: [{ type: 'fix', description: '官方导出中播放为零且未提供播放指标行的作品，现在仍会计入官方作品总数。' }] },
  { version: '2.22.1', date: '2026-09-16', title: '抖音官方数据校准', impactScope: ['抖音运营中心', '复盘报告', 'Creator Agent'], changes: [{ type: 'fix', description: '修复创作者中心实时粉丝字段漏采，粉丝总数不再停留在旧值。' }, { type: 'improvement', description: '作品数、累计播放和互动统一使用最新一次官方导出，多次导出不会叠加。' }, { type: 'improvement', description: '仅对标题与发布日期完全一致的作品校准明细；缺少可比快照时不再误算周期变化。' }] },
  { version: '2.22.0', date: '2026-09-16', title: '抖音运营数据统一与复盘完善', impactScope: ['抖音运营中心', '复盘报告', '登录安全升级'], changes: [{ type: 'improvement', description: '运营概览、累计播放、粉丝、趋势和复盘报告统一读取同一套抖音标准化数据，缺失指标会明确标注。' }, { type: 'feature', description: '复盘报告支持账号范围内安全删除；下线没有真实数据来源的粉丝画像入口。' }, { type: 'fix', description: '登录安全升级只把真实外部监控抓取视为观测证据，不再把进程内指标误判为已接入监控。' }] },
  { version: '2.21.4', date: '2026-09-16', title: '管理与运营入口收敛', impactScope: ['内容动态', '登录安全升级', '备份管理', '抖音运营中心'], changes: [{ type: 'improvement', description: '内容记录和认证升级改为直接给出可理解、可执行的信息，抖音运营导航移除重复入口。' }, { type: 'fix', description: '备份管理可汇总应用、部署应急和服务器定时备份，并显示不可访问来源。' }] },
  { version: '2.21.3', date: '2026-09-15', title: '里程碑反馈优化', impactScope: ['日常使用'], changes: [{ type: 'improvement', description: '重要业务操作完成后增加轻量庆祝反馈，让阶段成果更容易被感知。' }] },
  { version: '2.21.2', date: '2026-09-15', title: '日常交互细节优化', impactScope: ['日常使用'], changes: [{ type: 'improvement', description: '优化常用页面的操作反馈与过渡体验。' }] },
  { version: '2.21.1', date: '2026-09-15', title: '发布与分析数据一致性修复', impactScope: ['发布管理', '数据分析', '权限与统计'], changes: [{ type: 'fix', description: '多日分析快照不再造成发布重复或跨日期覆盖，部分指标更新会保留其他字段。' }, { type: 'improvement', description: '发布页统计改为全量北京时间口径，抖音关联权威字段增加服务端保护。' }] },
  { version: '2.21.0', date: '2026-09-12', title: '发布管理接入抖音作品数据', impactScope: ['发布管理', '抖音运营中心', 'Creator 数据同步'], changes: [{ type: 'feature', description: '发布稿件可自动或人工关联抖音作品，并支持候选搜索与解除关联。' }, { type: 'improvement', description: '关联后的发布时间、状态和互动指标实时以抖音运营中心为准，原稿件数据继续保留。' }] },
  { version: '2.20.25', date: '2026-09-12', title: '创作只读与首页数据联动', impactScope: ['创作管理', '首页驾驶舱', '抖音运营中心'], changes: [{ type: 'fix', description: '已审核稿件的创作资料严格只读，不再因自动保存连续提示失败。' }, { type: 'improvement', description: '首页聚合内容生产链路和抖音播放数据，并按最深业务阶段计算内容生产指数。' }] },
  { version: '2.20.24', date: '2026-09-11', title: '北京时间与活动日志保留', impactScope: ['系统时间', '活动日志', '日期展示'], changes: [{ type: 'fix', description: '活动日志统一按北京时间写入和显示，历史 UTC 记录在升级时校正。' }, { type: 'improvement', description: '活动日志仅保留最近 7 天，其他页面日期展示统一使用北京时间。' }] },
  { version: '2.20.23', date: '2026-09-11', title: '统一创作资料草稿', impactScope: ['创作管理', '资料库', '富文本编辑'], changes: [{ type: 'improvement', description: '创作资料简化为一份连续草稿，可直接输入、复制粘贴和自动保存。' }, { type: 'improvement', description: '添加资料直接打开资料库选择器，并把所选正文按光标位置插入草稿。' }] },
  { version: '2.20.22', date: '2026-09-10', title: '创作资料工作区', impactScope: ['创作管理', '资料库', '富文本编辑'], changes: [{ type: 'feature', description: '创作详情直接展示资料正文，支持从资料库批量生成独立快照及手动粘贴资料。' }, { type: 'improvement', description: '资料支持安全编辑、自动保存、独立删除，以及按用户记忆的工作区高度。' }] },
  { version: '2.20.21', date: '2026-09-10', title: '共享用户模型安全精简', impactScope: ['登录', '用户状态', '认证运行时'], changes: [{ type: 'security', description: '登录响应进入客户端用户状态前会丢弃密码字段，前后端共享用户模型不再声明密码。' }, { type: 'improvement', description: '删除无生产调用的认证模式辅助函数，并保留仍在灰度期使用的兼容能力。' }] },
  { version: '2.20.20', date: '2026-09-09', title: '代码审查安全整改', impactScope: ['API 权限', '错误响应', '用户与日志列表', '工作流通知'], changes: [{ type: 'security', description: 'Social Review 休眠路由统一增加数据分析查看权限，未知内部异常只返回固定安全响应。' }, { type: 'fix', description: '限制用户与日志列表查询规模，缩短权限缓存窗口并修复选题通知标题。' }] },
  { version: '2.20.19', date: '2026-09-09', title: 'Creator 托管封面与重复作品合并', impactScope: ['Creator Agent', '作品库', '数据驾驶舱'], changes: [{ type: 'fix', description: '认证浏览器已加载的封面可安全同步并在生产端稳定显示。' }, { type: 'fix', description: '同标题、同发布时间但采集编号不同的同一作品合并展示。' }] },
  { version: '2.20.18', date: '2026-09-08', title: '亮色主题对比度修复', impactScope: ['选题管理', '状态标签', '共享界面'], changes: [{ type: 'fix', description: '选题统计卡片和关联资料在亮色模式下恢复清晰背景与文字。' }, { type: 'improvement', description: '共享状态、平台、资源和提示控件统一使用深浅主题自适应高对比色。' }] },
  { version: '2.20.17', date: '2026-09-08', title: '登录与主题显示修复', impactScope: ['登录', '用户管理', '页面显示'], changes: [{ type: 'fix', description: '新建账号未填写姓名时，登录响应使用用户名作为显示名，不再误报服务暂时不可用。' }, { type: 'fix', description: '恢复生产页面的主题背景、卡片颜色和边框显示。' }] },
  { version: '2.20.16', date: '2026-09-07', title: '历史修复整合与依赖精简', impactScope: ['稳定性', '安全维护'], changes: [{ type: 'fix', description: '修复自动回归测试入口并隔离测试数据库。' }, { type: 'security', description: '更新受影响工具依赖，增加持续安全检查。' }, { type: 'improvement', description: '减少重复依赖，收敛源码检查范围。' }] },
  { version: '2.20.15', date: '2026-09-07', title: '依赖安全与工程化收口', impactScope: ['依赖安全', 'API 防护', '工程化'], changes: [
    { type: 'security', description: '升级 @tiptap/* 全家桶到 ^3.31.0，修复 mergeAttributes() 在 __proto__ 上的 DOM 属性污染中危漏洞。' },
    { type: 'security', description: '在 overrides 中锁定 qs 6.16.0，修复 express/body-parser 链路上数组上限绕过与 isBuffer DoS 中危漏洞。' },
    { type: 'security', description: '新增 HTTP 级错误脱敏拦截器回归测试，守护 api/app.ts:267 单点保护机制。' },
    { type: 'improvement', description: '请求体与同步包体积统一到 api/utils/limits.ts，消除 12MB/16MB 不一致文案与魔法数字。' },
    { type: 'improvement', description: '抖音官方导出 xlsx 改用 sheet[\'!ref\'] 前置行/列防护；移除 creatorDataCenter.acceptCreatorDataSync 死代码；成就进度接口按 condition_type 聚合消除 N+1。' },
    { type: 'improvement', description: '新增 deploy/linux/HTTPS_REQUIRED.md，明确 upgrade-insecure-requests 要求 HTTPS 部署。' },
  ] },
  { version: '2.20.14', date: '2026-09-04', title: '总结归档详情完善', impactScope: ['日报系统', '月报', '年报'], changes: [{ type: 'fix', description: '月报、年报归档新增完整详情入口和分区内容展示。' }, { type: 'improvement', description: '详情支持长文本滚动、Esc 关闭，并保持现有权限边界。' }] },
  { version: '2.20.13', date: '2026-09-04', title: '总结归档正文显示修复', impactScope: ['日报系统', '月报', '年报'], changes: [{ type: 'fix', description: '修复月报、年报提交正文未被服务端读取，归档记录存在却显示为空的问题。' }, { type: 'improvement', description: '归档统一输出明确正文模型，并兼容仍在旧字段中的历史报告。' }] },
  { version: '2.20.12', date: '2026-09-02', title: 'Creator 封面候选 403 诊断', impactScope: ['Creator Agent', '安全'], changes: [{ type: 'fix', description: '增加有限的 HEAD、Range GET 与固定 Creator Referer 对照，分类远端拒绝。' }, { type: 'security', description: '不转发认证信息、不保存候选或图片，并继续执行重定向与网络目标校验。' }] },
  { version: '2.20.11', date: '2026-09-02', title: 'Creator 封面来源空作品诊断', impactScope: ['Creator Agent', '安全'], changes: [{ type: 'fix', description: '修复 Creator XHR 双重转义导致的来源未捕获，并拒绝相似域名。' }, { type: 'security', description: '空来源使用分阶段脱敏失败诊断，不再伪装为成功作品 0。' }] },
  { version: '2.20.10', date: '2026-09-02', title: 'Creator Agent Preload 沙箱兼容', impactScope: ['Creator Agent', '安全'], changes: [{ type: 'fix', description: '将 Main-only HMAC 身份投影与浏览器安全 Preload 契约拆分，修复正式包 Renderer 空白。' }, { type: 'security', description: 'Bridge 缺失时显示固定脱敏错误页，Preload 构建产物禁止包含 Node crypto。' }] },
  { version: '2.20.9', date: '2026-09-01', title: 'Creator Agent 账号标识脱敏', impactScope: ['Creator Agent', '安全'], changes: [{ type: 'security', description: 'Renderer 仅接收短审计标识和范围状态，完整绑定配置不再跨 IPC。' }] },
  { version: '2.20.8', date: '2026-09-01', title: 'Creator 本地封面来源检查', impactScope: ['Creator Agent', '封面诊断'], changes: [{ type: 'feature', description: '新增独立本地封面候选检查，结果仅返回脱敏汇总。' }, { type: 'security', description: '检查路径不调用同步、上传、队列或官方导出下载。' }] },
  { version: '2.20.7', date: '2026-08-31', title: 'Creator 作品封面 URL 完整性', impactScope: ['Creator 作品库', '同步兼容'], changes: [{ type: 'fix', description: '拒绝相对路径和无效封面 URL，避免浏览器加载失败。' }, { type: 'fix', description: '读取旧数据时从既有 raw 字段恢复可解析封面，并保留已有有效封面。' }] },
  { version: '2.20.6', date: '2026-08-31', title: 'Creator Agent 认证与窗口状态解耦', impactScope: ['Creator Agent', 'macOS 正式包'], changes: [{ type: 'fix', description: '认证事实与临时登录窗口状态分离，Main 权威计算 canSync 和登录动作。' }, { type: 'security', description: 'Renderer 不能伪造同步能力；Main 在同步前再次校验认证、浏览器、绑定、Token 与数据库状态。' }] },
  {
    version: '2.20.5', date: '2026-08-31', title: '登录一致性与安全修复',
    impactScope: ['Creator Agent', '拍摄与发布', '数据安全'],
    changes: [
      { type: 'fix', description: '关闭窗口或重启后按实际登录状态恢复；仅在登录会话有效时确认，无可用浏览器时暂停登录与同步并给出提示。' },
      { type: 'security', description: '异常提示不暴露内部细节；服务错误响应、连接保护和相关依赖完成安全加固，Excel 导入限制文件大小及内容规模。' },
      { type: 'improvement', description: '拍摄计划和发布管理支持分页，列表可逐页查看。' },
    ],
  },
  { version: '2.20.4', date: '2026-08-28', title: 'Creator Agent 本地队列 SQLite 修复', impactScope: ['Creator Agent', '本地数据安全'], changes: [{ type: 'fix', description: '队列 payload 固定为 canonical JSON TEXT，校验 SQLite 参数类型与回读哈希。' }, { type: 'improvement', description: '旧数据库首次启动会先完成幂等队列迁移，并提供无敏感运行时身份诊断。' }] },
  {
    version: '2.20.3', date: '2026-08-28', title: 'Creator 官方导出本地安全同步',
    impactScope: ['Creator Agent', '抖音数据', '数据安全'],
    changes: [
      { type: 'feature', description: '本地解析官方导出文件并上传标准化指标与质量摘要。' },
      { type: 'security', description: '原始 Excel 和浏览器登录资料不上传；批次、文件和业务指标均有幂等保护。' },
    ],
  },
  {
    version: '2.20.2', date: '2026-08-27', title: '主线收口与移动认证续期修复',
    impactScope: ['Android', '认证', '版本治理'],
    changes: [
      { type: 'fix', description: 'Android 真实登录显式绑定服务端 Token 生命周期，并在 refresh 后重新安排下一周期。' },
      { type: 'security', description: '补齐 JWT 回退、恢复补偿、single-flight 与旧定时器代际保护合同。' },
      { type: 'improvement', description: '归档 Socket 生产观察报告并收口已替代分支，不重复迁移旧实现。' },
    ],
  },
  {
    version: '2.20.1', date: '2026-08-26', title: 'Creator Collector 无 UI E2E 验收',
    impactScope: ['Creator Agent', '抖音采集'],
    changes: [
      { type: 'fix', description: '修复 works SQLite 非标量字段持久化。' },
      { type: 'feature', description: '新增无 UI CLI E2E 入口与官方双导出连续验收。' },
    ],
  },
  {
    version: '2.20.0', date: '2026-08-18', title: 'Creator Collector Scrapling First',
    impactScope: ['Creator Agent', '抖音采集', '本地安全'],
    changes: [
      { type: 'feature', description: '新增 Scrapling Python Worker 与抖音能力清单采集。' },
      { type: 'security', description: '本地 Worker 仅输出脱敏 JSON 协议事件，不记录会话凭据。' },
    ],
  },
  {
    version: '2.19.11', date: '2026-08-20', title: 'Creator Agent 上传协议安全收口',
    impactScope: ['Creator Agent', '上传安全', 'Android'],
    changes: [
      { type: 'security', description: 'Creator Agent /data-sync 固定只接受 protocol_version=1，HMAC 覆盖 timestamp 与 nonce，并以原子预留拒绝重放。' },
      { type: 'security', description: '旧 /report 上传入口已退役并返回 410，关闭 legacy protocol 防重放旁路。' },
    ],
  },
  {
    version: '2.19.10', date: '2026-08-20', title: '认证与角色权限安全补充',
    impactScope: ['认证', '权限', 'Android'],
    changes: [
      { type: 'security', description: 'Legacy 401 Recovery 仅接受精确可信 Origin，拒绝伪同源、错误端口和 HTTP 降级地址。' },
      { type: 'security', description: '角色批量授予与角色权限定义在写入前执行调用者有效权限上限检查，避免自举提权。' },
      { type: 'fix', description: '新增认证 Origin 与角色权限安全回归合同，并纳入核心安全 CI 门禁。' },
    ],
  },
  {
    version: '2.19.9', date: '2026-08-20', title: '权限、编辑器与认证安全硬化',
    impactScope: ['权限', '编辑器', '协作', '认证', 'Android'],
    changes: [
      { type: 'security', description: '限制角色授予上限，统一净化富文本渲染，并拒绝畸形协作 update。' },
      { type: 'security', description: 'Webhook fail-closed；禁用账号立即撤销会话并断开实时连接。' },
      { type: 'fix', description: 'Legacy Web 与 Android HTTP 401 复用既有 refresh runtime 后只重试一次。' },
    ],
  },
  {
    version: '2.19.8', date: '2026-08-17', title: 'Android 生产端点构建合同',
    impactScope: ['Android', '构建安全', 'API 运行时'],
    changes: [
      { type: 'fix', description: '正式 Android 构建固定注入生产 API/Socket 地址，并将非敏感构建元数据随 APK 打包。' },
      { type: 'security', description: 'Native Production 缺失或错误端点时 fail-closed；API Health 不再接受 HTTP 200 HTML。' },
    ],
  },
  {
    version: '2.19.7', date: '2026-08-17', title: 'Android Native Auth 自动续期修复',
    impactScope: ['Android', '认证', '运行时安全'],
    changes: [
      { type: 'fix', description: 'Native Runtime 独立安排 access token 临期 refresh，不再依赖可选 Socket Coordinator。' },
      { type: 'security', description: '瞬时网络失败保留 Keystore refresh credential 并有界重试；终态认证失败才清理会话。' },
    ],
  },
  {
    version: '2.19.6', date: '2026-08-14', title: 'Android HTTPS localhost Origin 兼容',
    impactScope: ['Android', 'CORS', '运行时安全'],
    changes: [
      { type: 'fix', description: '精确允许 Capacitor WebView 的 HTTPS localhost Origin，并拒绝任意端口、局域网与 lookalike 来源。' },
      { type: 'security', description: '新增真实 HTTP CORS 合同测试，验证 GET、OPTIONS、credentials 与恶意 Origin 不反射。' },
    ],
  },
  {
    version: '2.19.5', date: '2026-08-14', title: '编辑器 Word 式格式刷',
    impactScope: ['编辑器', '协作编辑'],
    changes: [
      { type: 'feature', description: '新增单次和连续格式刷，支持文字样式、颜色、高亮、标题、对齐与首行缩进。' },
      { type: 'improvement', description: '格式应用使用独立 ProseMirror transaction，链接、批注和业务 metadata 不会复制。' },
    ],
  },
  {
    version: '2.19.4', date: '2026-08-14', title: '部署门禁可靠性修复',
    impactScope: ['生产部署', '运行时安全'],
    changes: [
      { type: 'fix', description: '公网内部路由检查读取权威运行时文件，并为重启健康检查加入受限重试。' },
    ],
  },
  {
    version: '2.19.3', date: '2026-08-14', title: '日报 Glass Surface 布局修复',
    impactScope: ['日报', '界面布局'],
    changes: [
      { type: 'fix', description: '修复宽屏日报卡片将多个区块横向挤压的问题。' },
    ],
  },
  {
    version: '2.19.2', date: '2026-08-13', title: '内部接口与生产运行时配置硬化',
    impactScope: ['生产安全', '部署运行时'],
    changes: [
      { type: 'security', description: '统一保护 /internal Direct Loopback 边界并拒绝反向代理转发访问。' },
      { type: 'security', description: '建立生产运行环境确定性加载、回读与公网暴露部署门禁。' },
    ],
  },
  {
    version: '2.19.1', date: '2026-08-13', title: '移动认证生产准入安全热修',
    impactScope: ['Android', '认证', 'Socket.IO'],
    changes: [
      { type: 'security', description: '新增独立 Mobile allowlist、刷新持续准入和 Mobile Socket 授权。' },
    ],
  },
  {
    version: '2.19.0', date: '2026-08-13', title: 'Android 移动办公客户端',
    impactScope: ['Android', '认证', '实时协作'],
    changes: [
      { type: 'feature', description: '新增 Capacitor Android 工程、移动办公壳与底部导航。' },
      { type: 'security', description: '新增 Android Keystore 刷新凭据保护和 HTTPS/WSS 运行时约束。' },
    ],
  },
  {
    version: '2.18.4',
    date: '2026-08-13',
    title: '正式部署版本 Gate 补齐',
    impactScope: ['部署脚本'],
    changes: [
      { type: 'fix', description: '正式部署在服务重启前验证版本事实源一致。' },
    ],
  },
  {
    version: '2.18.3',
    date: '2026-08-13',
    title: '正式部署 Gate 修复',
    impactScope: ['部署脚本'],
    changes: [
      { type: 'fix', description: '正式部署固定精确目标 SHA，并在服务重启前验证在线备份可进行非破坏恢复演练。' },
    ],
  },
  {
    version: '2.18.2',
    date: '2026-08-12',
    title: '运维可靠性与仓库治理硬化',
    impactScope: ['备份与恢复演练', '部署迁移 Gate', '版本治理'],
    changes: [
      { type: 'improvement', description: '备份关键流程增加跨进程互斥与非破坏恢复演练。' },
      { type: 'security', description: '部署前增加迁移兼容性检查，避免不可安全回退的演进自动上线。' },
    ],
  },
  {
    version: '2.18.0',
    date: '2026-08-12',
    title: 'React Bits 场景化视觉编排与全系统体验升级',
    impactScope: ['Home', 'Topics', 'Daily Report', 'Creator', 'Analytics', 'Workflow', 'Editor', 'Settings / Appearance Center'],
    changes: [
      { type: 'feature', description: '建立 React Bits 官方组件、Typed Adapter、Semantic Slot 与 Page Scene 的统一视觉架构。' },
      { type: 'feature', description: '提供岚曜极光、深空科技、丝绸创意、线性协作、极简无扰、自由搭配六套视觉方案。' },
      { type: 'feature', description: 'Appearance Center 支持 Scene Preview、配置导入导出、恢复默认、持久化与页面应用范围控制。' },
      { type: 'improvement', description: '优化多页面视觉表现、响应式体验、字号、深浅主题、motionMode 与 Canvas 生命周期管理。' },
      { type: 'fix', description: '修复 Silk / React Three Fiber 生命周期兼容、动效关闭后的 Canvas 残留风险及 Settings 主题 select 可访问名称问题。' },
      { type: 'security', description: 'Workflow Engine、Backend、API、权限、Socket.IO、Yjs 与数据库保持不变。' },
    ],
  },
  {
    version: '2.17.2',
    date: '2026-08-08',
    title: 'React Bits 认证态兼容测试补充',
    impactScope: ['本地认证态兼容测试', 'React Bits 外观设置验证'],
    changes: [
      { type: 'fix', description: '认证态测试仅从临时 XMT_E2E 环境变量读取专用测试账号，不提供明文 fallback。' },
      { type: 'improvement', description: '补充登录后双主题、六套预设、字号、视口、按钮、配置持久化与恢复默认验证。' },
      { type: 'security', description: '测试目标限制为 localhost 或 127.0.0.1，不连接生产环境。' },
    ],
  },
  {
    version: '2.17.1',
    date: '2026-08-08',
    title: 'React Bits 浅色主题与字体兼容修复',
    impactScope: ['外观与动效设置', 'React Bits 按钮与文本适配层', '业务正文排版'],
    changes: [
      { type: 'fix', description: '修复浅色模式中 React Bits 按钮的文字、边框与高光对比。' },
      { type: 'fix', description: '修复 SpecularButton 主题色，以及 GlareHover、ClickSpark、Magnet 的尺寸与布局。' },
      { type: 'fix', description: '修复文本动画裁切；用户字号不再改变 html rem 基准。' },
      { type: 'improvement', description: '新增深色、浅色双主题真实预览与仅开发环境可见的主题兼容矩阵。' },
    ],
  },
  {
    version: '2.17.0',
    date: '2026-08-08',
    title: 'React Bits 原生动效主题系统',
    impactScope: ['外观与动效设置', 'Login', 'Home', '通用 ActionButton', '当前浏览器本地配置'],
    changes: [
      { type: 'feature', description: '新增 React Bits 原生动效外观中心、六套官方组件预设和自由搭配能力。' },
      { type: 'feature', description: '支持背景、标题、数字、按钮、卡片、内容进入和导航风格的实时预览、导入导出与恢复默认。' },
      { type: 'improvement', description: '新增 reduced-motion、移动端低强度、单主背景限制与 WebGL 静态 fallback。' },
      { type: 'security', description: '所有动效均来自 React Bits 官方 TS + Tailwind 源码；后端 API、数据库、权限、Workflow、Socket.IO 与 Yjs 保持不变。' },
    ],
  },
  {
    version: '2.16.1',
    date: '2026-08-07',
    title: '首页驾驶舱视觉增强',
    impactScope: ['Home 首页', '前端视觉与交互', '桌面端与移动端'],
    changes: [
      { type: 'feature', description: '新增品牌级 Hero 区域，融合平台名称、内容生产驾驶舱标题、核心指标与主要业务入口。' },
      { type: 'improvement', description: '增强 Aurora 动态背景，并提供 WebGL 不可用及减少动态效果偏好下的静态渐变降级。' },
      { type: 'improvement', description: 'MagicBento 升级为非对称布局，以内容生产指数作为主视觉大卡，并配置任务、选题、审核、发布、播放和 AI 辅助卡。' },
      { type: 'improvement', description: '启用 Spotlight、粒子、3D 倾斜、磁吸、点击反馈与 AnimatedContent 动态进入动画。' },
      { type: 'security', description: '后端 API、数据库、权限、Workflow Engine、Socket.IO 与 Yjs 保持不变。' },
    ],
  },
  {
    version: '2.16.0',
    date: '2026-08-06',
    title: 'React Bits 原生体验升级',
    impactScope: ['Login', 'Home / Dashboard', 'Topics 重点内容', 'Creator Dashboard'],
    changes: [
      { type: 'feature', description: '正式接入 React Bits 官方 TypeScript + Tailwind 组件源码。' },
      { type: 'feature', description: '接入 AuroraBackground、MagicBento、AnimatedContent、SpotlightCard 与 ProfileCard。' },
      { type: 'improvement', description: '完成 Login、Dashboard、Topics 重点内容与 Creator 展示体验升级。' },
      { type: 'security', description: '后端 API、数据库、权限、Workflow Engine、Socket.IO 与 Yjs 保持不变。' },
    ],
  },
  {
    version: '2.15.4',
    date: '2026-08-06',
    title: 'UI 应用补全升级',
    impactScope: ['Dashboard', 'Topics', 'Workflow', 'Creator'],
    changes: [
      { type: 'improvement', description: '将 XMT 自研 Design System 实际应用到核心业务页面，不作为 React Bits 官方组件集成。' },
      { type: 'improvement', description: '统一 Dashboard 卡片体系并优化 Topics 页面统计卡与核心列表卡片。' },
      { type: 'improvement', description: '统一 Workflow 模板、节点和流程预览视觉，并优化 Creator 指标卡展示。' },
      { type: 'security', description: '业务数据、权限规则与 Workflow 状态机保持不变。' },
    ],
  },
  {
    version: '2.15.3',
    date: '2026-08-05',
    title: 'React Bits 风格 Design System 基础升级',
    impactScope: ['XMT Design System', 'Dashboard 基础指标', 'Sidebar', 'Modal / Loading / EmptyState'],
    changes: [
      { type: 'feature', description: '建立 XMT Design System 基础层，新增 XMTTheme 与 XMTCard。' },
      { type: 'feature', description: '新增 AnimatedNumber 与 ProgressBar，统一指标数字和进度展示。' },
      { type: 'improvement', description: '优化页面基础动效以及 Sidebar 展开收缩体验。' },
      { type: 'improvement', description: '统一 Modal、Loading 与 EmptyState 的视觉和进入反馈。' },
    ],
  },
  {
    version: '2.13.2',
    date: '2026-07-30',
    title: 'Auth 模块边界拆分',
    changes: [
      { type: 'improvement', description: '认证登录建立 Repository、Service、Controller、Token、Password 与 Mapper 模块边界。' },
      { type: 'improvement', description: '旧 /api/auth/login 改为兼容委托 Auth Module，外部契约和错误行为保持不变。' },
      { type: 'security', description: '新增临时 SQLite 冻结测试，覆盖登录、JWT、角色回查及 logout 不撤销令牌的当前行为。' },
      { type: 'security', description: '未引入 Refresh Token，数据库、权限、Socket、前端登录和 7 天 JWT 时效均未改变。' },
    ],
  },
  {
    version: '2.13.1',
    date: '2026-07-30',
    title: '资料创建与档案导入修复',
    changes: [
      { type: 'fix', description: '修复资料库新增资料按钮无响应，补齐创建表单、校验和详情跳转。' },
      { type: 'improvement', description: '山东地情档案导入增加统一编码、换行、不可见字符、空白和空行清洗。' },
      { type: 'security', description: 'manifest 保留原始与清洗后哈希，导入继续支持 ZIP 安全检查、批次审计、幂等和回滚。' },
    ],
  },
  {
    version: '2.13.0',
    date: '2026-07-30',
    title: '创作生产资料引用',
    changes: [
      { type: 'feature', description: '生产详情新增参考资料模块，支持搜索、关联、查看和解除资料。' },
      { type: 'feature', description: '新增生产资料关联接口，统一使用 production/reference 关系记录。' },
      { type: 'security', description: '关联操作同时校验生产编辑范围和资料查看权限，普通查看用户保持只读。' },
      { type: 'improvement', description: '资料关联独立于编辑器、版本历史、协作编辑和保存流程，解除关联不删除资料。' },
    ],
  },
  {
    version: '2.12.0',
    date: '2026-07-29',
    title: 'API Contract 标准化建设',
    changes: [
      { type: 'feature', description: '建立 /api/v1 成功、错误、分页、错误码和 HTTP 状态码公共契约。' },
      { type: 'feature', description: '新增 requestId 生成与透传，并提供 Zod 驱动的 OpenAPI 文档和 Swagger UI。' },
      { type: 'improvement', description: 'Topic v1 接入统一 envelope，新增 api-client 基础骨架和契约测试。' },
      { type: 'security', description: 'legacy API、数据库、权限、状态机及业务逻辑保持不变。' },
    ],
  },
  {
    version: '2.11.0',
    date: '2026-07-29',
    title: 'Topic 模块化基础落地',
    changes: [
      { type: 'feature', description: 'Topic 新增 Repository、Policy、Service、Controller 与模块路由边界，legacy 接口继续兼容。' },
      { type: 'feature', description: '新增默认关闭的 /api/v1/topics 严格 Zod 契约，为后续客户端迁移做准备。' },
      { type: 'improvement', description: '新增临时 SQLite 专项测试，覆盖数据访问、业务错误和 legacy/v1 API 契约。' },
      { type: 'security', description: '权限、状态机、通知、Socket 与历史日志行为保持原样，未修改数据库结构。' },
    ],
  },
  {
    version: '2.10.3',
    date: '2026-07-29',
    title: '修复抖音粉丝与作品封面显示并优化数据驾驶舱',
    changes: [
      { type: 'fix', description: '修复粉丝总数未进入统一上传载荷的问题，兼容分隔符、万/亿单位、加号与嵌套对象。' },
      { type: 'fix', description: '修复作品主封面在数据裁剪和规范化过程中丢失的问题，并避免缺失值覆盖有效封面。' },
      { type: 'improvement', description: '移除账号健康度模块，将六个核心指标调整为两行三列并优化窄屏显示。' },
      { type: 'improvement', description: '封面统一使用无 Referer 懒加载与失败占位，Creator Agent 继续作为唯一运营数据主链路。' },
    ],
  },
  {
    version: '2.10.2-storage',
    date: '2026-07-24',
    title: '数据可见性治理与作品库展示优化',
    changes: [
      { type: 'improvement', description: 'Creator 数据查看权限与管理权限分离，具有查看权限的成员可读取已标准化同步的公开平台账号数据。' },
      { type: 'security', description: '同步、绑定、授权管理仍仅限 admin 与 director，普通成员的操作权限不放大。' },
      { type: 'improvement', description: '作品库增加默认 20 条、最大 100 条的 cursor 分页和下一页加载。' },
      { type: 'fix', description: '统一解析 douyin_works、creator_content_items 与 raw_json 中的封面，并为作品库和驾驶舱 TOP5 增加懒加载失败占位。' },
    ],
  },
  {
    version: '2.10.2-sync',
    date: '2026-07-24',
    title: '抖音服务端同步契约升级',
    changes: [
      { type: 'feature', description: '支持 contract_version=2.10.2 严格 DouyinWorkInput 链路，并继续兼容无版本和 v2.10.1 Agent。' },
      { type: 'improvement', description: '同一作品在单事务内写入 creator_content_items 与 douyin_works，并通过 content_id 建立一致性关系。' },
      { type: 'improvement', description: '同步日志增加 contract_version、collection_mode、snapshot_id 与只含统计摘要的 summary_json。' },
      { type: 'fix', description: '移除同步过程中的直接删除动作，改为只读污染候选报告；本版本不修改前端页面。' },
    ],
  },
  {
    version: '2.10.2-agent',
    date: '2026-07-24',
    title: 'Creator Agent 契约与编辑器稳定性升级',
    changes: [
      { type: 'feature', description: 'Agent 增加安全 JSON 解析、超长 ID 保真、严格作品识别、cursor 分页、collection_mode 和 snapshot_id。' },
      { type: 'fix', description: '修复编辑器右键菜单定位及 BubbleMenu 互斥问题，保留 Yjs 与多人协作光标。' },
    ],
  },
  {
    version: '2.10.1',
    date: '2026-07-24',
    title: '标准抖音数据中心',
    changes: [
      { type: 'feature', description: '新增 douyin_works、daily snapshots、work snapshots、analysis records 与增强同步日志模型。' },
      { type: 'improvement', description: 'Creator Center 运营分析、作品复盘和趋势改为使用标准 douyin_* 真实数据。' },
    ],
  },
  {
    version: '2.10.0',
    date: '2026-07-23',
    title: 'Creator Data Center 运营分析',
    changes: [
      { type: 'feature', description: '新增账号驾驶舱、作品库、作品复盘、趋势、粉丝分析和运营报告。' },
      { type: 'feature', description: '新增规则驱动的作品评分、账号健康度和日报、周报、月报能力。' },
    ],
  },
  {
    version: '2.6.0',
    date: '2026年7月',
    title: '传媒内容中台能力升级版',
    changes: [
      { type: 'security', description: '权限管理体系重构：完成角色权限重新规划；admin 拥有完整系统权限，member 仅可查看选题、创作及详情，文案、后期、摄像等生产角色具备内容编辑权限，普通人员可提交选题并编辑自己的内容；系统设置仅管理员可用，个人设置对所有用户开放。同步优化页面权限控制、数据归属过滤与操作权限校验。' },
      { type: 'improvement', description: '多人实时协作编辑优化：基于 Tiptap + Yjs + Socket.IO 优化实时同步、断线重连与连接策略，修复编辑器高频操作卡顿，并增强异常日志。' },
      { type: 'improvement', description: '内容版本管理升级：Production / Shooting 版本规则优化，小版本在当前 major 下自动递增且同一 major 仅保留最新 minor；新版本自动生成 major 并保留历史主版本最新记录。同步优化历史展示、版本聚合和数据冗余清理。' },
      { type: 'feature', description: '工作流系统升级：完成 Shadow Logging、Analytics、Decision、Enforcement、Explainability 能力建设，增强流程追踪、操作记录及后续 AI 自动化扩展能力。' },
      { type: 'improvement', description: '系统稳定性优化：优化登录错误提示与登录限流、API 请求限制和 429 异常提示，并修复系统设置接口异常。' },
      { type: 'improvement', description: 'Socket.IO 生产环境优化：完成单例连接复用、连接异常日志增强与断线恢复优化，提升生产环境稳定运行能力。' },
      { type: 'feature', description: '部署运维升级：完善 PM2 服务管理、Caddy 代理配置、健康检查接口、自动部署脚本与数据备份机制，提升生产环境可靠性。' },
      { type: 'feature', description: '数据资料库建设：完成山东省情资料采集方案、泰安节点数据抓取、本地资料归档、目录结构保存、断点续爬和数据索引生成，为知识库与 AI 能力提供数据基础。' },
      { type: 'feature', description: 'AI 能力准备：完成 llama.cpp 本地模型运行验证、Qwen GGUF 模型部署测试及 OpenAI API 兼容调用准备，支持后续 AI 内容助手、AI 选题分析与私有知识库。' },
      { type: 'fix', description: 'Bug 修复：覆盖登录异常反馈、Socket 连接、编辑器性能、版本历史、点赞接口限流、环境变量及部署异常等问题。' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-06-17',
    title: '编辑器统一入口与低风险页面接入',
    changes: [
      {
        type: 'feature',
        description: '新增 ContentEditor 统一编辑器入口，统一 rich、legacy、readonly 三种模式，为业务页面后续收敛编辑器引用提供稳定入口。',
      },
      {
        type: 'improvement',
        description: 'Topics 创建弹窗与 AddTopic 大纲编辑区已接入 ContentEditor legacy 模式，保持原 HTML 内容字段和保存流程不变。',
      },
      {
        type: 'improvement',
        description: '完成 RichTextEditor 直接业务页面引用核对，旧编辑器进入 legacy 兼容期，后续新页面应优先通过 ContentEditor 使用编辑器能力。',
      },
      {
        type: 'improvement',
        description: '补充组件规范、重构规划和系统架构中的编辑器路线治理说明，明确 Tiptap Editor 为长期主线、协同编辑作为后续专项推进。',
      },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-06-17',
    title: '权限细化与前端基础框架试点',
    changes: [
      {
        type: 'security',
        description: '继续收紧默认角色权限绑定与管理接口访问边界，避免 member、editor 在权限点迁移过程中出现实际能力放大。',
      },
      {
        type: 'improvement',
        description: '补齐角色与权限在前端导航、角色守卫和人员管理中的一致性处理，新增角色后可更稳定地联动页面访问控制与角色选择。',
      },
      {
        type: 'feature',
        description: '新增 PageHeader、PageToolbar、BaseModal、ConfirmModal、FormModal、LoadingState、ErrorState 等基础组件，为后续页面统一迁移提供低侵入骨架。',
      },
      {
        type: 'improvement',
        description: 'Messages 页面完成第一批试点迁移，统一了页面头部、清空确认、加载态与空状态，同时保持原有消息读取与跳转逻辑不变。',
      },
      {
        type: 'fix',
        description: '恢复登录页样式 1 到指定旧版布局与文案，保留现有登录功能、记住密码和系统设置联动能力。',
      },
      {
        type: 'improvement',
        description: '补充页面级空状态、无权限提示文案与基础交互整理，并同步修复若干固定角色名文案残留问题，降低后续页面治理成本。',
      },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-06-16',
    title: '系统设置后端统一化',
    changes: [
      {
        type: 'feature',
        description: '新增系统设置后端接口，统一管理系统名称、页签标题、Logo、品牌文案与登录页配置。',
      },
      {
        type: 'security',
        description: '新增 system:settings 权限点，系统配置修改必须通过登录认证与权限校验。',
      },
      {
        type: 'improvement',
        description: '设置中心拆分为系统设置、品牌设置、登录页设置与个人偏好，避免全局配置和本地偏好混放。',
      },
      {
        type: 'improvement',
        description: '登录页、侧边栏与应用品牌展示改为读取统一配置来源，管理员设备间的系统展示保持一致。',
      },
      {
        type: 'fix',
        description: '移除对 localStorage 中 xmt_system_settings 的全局依赖，修复不同浏览器配置不一致的问题。',
      },
      {
        type: 'fix',
        description: '系统更新说明文件改为 UTF-8 干净内容，修复历史乱码导致的阅读与维护问题。',
      },
    ],
  },
  {
    version: '2.0.1',
    date: '2026-06-11',
    title: '稳定性与安全修复',
    changes: [
      { type: 'fix', description: '修复资源与日历相关 SQL 更新异常。' },
      { type: 'security', description: 'Socket.IO 握手增加 JWT 认证。' },
      { type: 'improvement', description: '补充接口异常处理，避免数据库失败后误报成功。' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-06-05',
    title: '文档编辑器升级',
    changes: [
      { type: 'feature', description: '编辑器支持标题级别切换、颜色、右键菜单与目录高亮。' },
      { type: 'improvement', description: '打印与编辑体验优化。' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-05',
    title: '登录体验优化',
    changes: [
      { type: 'feature', description: '新增记住密码与快速登录体验。' },
      { type: 'fix', description: '修复人员管理与选题提报的相关问题。' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-05',
    title: '编辑器迁移完成',
    changes: [
      { type: 'feature', description: '引入新的编辑器组件与 Markdown 双向转换。' },
      { type: 'improvement', description: '同步更新服务端接口和页面适配。' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-04',
    title: '系统基础架构优化',
    changes: [
      { type: 'security', description: '加强 JWT、登录频率限制与 Socket.IO 来源控制。' },
      { type: 'improvement', description: '统一 API 响应与数据库索引策略。' },
      { type: 'feature', description: '补充 Docker、PM2 与系统设置入口。' },
    ],
  },
];

export function getLatestVersion(): ChangelogEntry {
  return changelog[0];
}

export function getVersion(version: string): ChangelogEntry | undefined {
  return changelog.find((entry) => entry.version === version);
}

export function getChangeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    feature: '新增',
    improvement: '优化',
    fix: '修复',
    security: '安全',
  };
  return labels[type] || type;
}

export function getChangeTypeColor(type: string): string {
  const colors: Record<string, string> = {
    feature: 'bg-studio-success/12 text-studio-success-contrast border-studio-success/35',
    improvement: 'bg-studio-primary/12 text-studio-primary-contrast border-studio-primary/35',
    fix: 'bg-studio-amber/12 text-studio-amber-contrast border-studio-amber/35',
    security: 'bg-studio-coral/12 text-studio-coral-contrast border-studio-coral/35',
  };
  return colors[type] || 'bg-studio-surface-soft text-studio-text-secondary border-studio-border-soft';
}
