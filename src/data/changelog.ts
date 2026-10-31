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
    version: '10.1.54',
    date: '2026-10-31',
    title: '日历结果核实状态防缓存',
    impactScope: ['排期日历', '创建结果核实'],
    changes: [
      { type: 'fix', description: '日历事件创建结果核实始终读取最新状态，不使用浏览器缓存；无记录、已删除和错误响应同样不会缓存。' },
    ],
  },
  {
    version: '10.1.53',
    date: '2026-10-31',
    title: '回执时间有效性分类修正',
    impactScope: ['B8 写入结果恢复', '运维只读盘点'],
    changes: [
      { type: 'fix', description: '回执盘点先校验时间有效性，再识别 UTC 或明确时区偏移；无效日期、偏移及缺失值均归入无效/缺失，避免按文本外观误判。' },
    ],
  },
  {
    version: '10.1.52',
    date: '2026-10-31',
    title: '幂等回执时间表示只读盘点',
    impactScope: ['B8 写入结果恢复', '运维只读盘点'],
    changes: [
      { type: 'improvement', description: '幂等回执只读报告新增 UTC 后缀、显式偏移、可解析无时区及无效/缺失时间计数和混合表示标记；不猜测无时区语义，不推断保留期限或清理记录。' },
    ],
  },
  {
    version: '10.1.51',
    date: '2026-10-31',
    title: '创作者驾驶舱信息层级与移动布局',
    impactScope: ['创作者数据驾驶舱', '移动端响应式', '数据摘要'],
    changes: [
      { type: 'improvement', description: '手机端以紧凑账号摘要展示创作者身份和查看作品入口，账号指标与互动表现分组呈现，避免重复，并将设备绑定信息放到主要数据和创作建议之后。' },
    ],
  },
  {
    version: '10.1.50',
    date: '2026-10-31',
    title: '最近变化数据校验与选题看板空状态',
    impactScope: ['工作台最近变化', '桌面选题看板', '移动选题看板'],
    changes: [
      { type: 'fix', description: '最近变化会先核对读取结果，格式异常时明确提示重载并阻止无效跳转。' },
      { type: 'improvement', description: '选题看板区分上层搜索/状态筛选、看板内平台/负责人筛选和真正空列表的提示；上层筛选无结果时可清除筛选。' },
      { type: 'improvement', description: '包含数据复盘统计卡浅/深主题颜色与对比度修复。' },
    ],
  },
  {
    version: '10.1.49',
    date: '2026-10-31',
    title: '数据复盘统计卡主题颜色优化',
    impactScope: ['数据复盘', '浅色与深色主题'],
    changes: [
      { type: 'improvement', description: '统计卡的说明文字和图标颜色随主题切换保持清晰可辨，图标底色正常显示。' },
    ],
  },
  {
    version: '10.1.48',
    date: '2026-10-31',
    title: '实时提示无障碍播报与触控',
    impactScope: ['实时通知', '无障碍体验', '减少动态效果'],
    changes: [
      { type: 'improvement', description: '实时提示以常驻礼貌播报区报告最新内容，重复文案重新播报；关闭按钮具备明确名称和 40×40px 触控区域，入场动画尊重减少动态效果设置。' },
    ],
  },
  {
    version: '10.1.47',
    date: '2026-10-31',
    title: '首页跨模块待办摘要优化',
    impactScope: ['管理首页', '移动端首页', '待办概览'],
    changes: [
      { type: 'improvement', description: '管理首页的跨模块待办改为紧凑且便于触控的按钮，手机端自动换行；重复的选题卡点摘要及重点说明中的重复数量已移除。' },
    ],
  },
  {
    version: '10.1.46',
    date: '2026-10-30',
    title: '依赖安全、主题回归与发布状态校验',
    impactScope: ['依赖安全', '外观设置', '发布管理', '回归验证'],
    changes: [
      { type: 'security', description: '生产依赖 re2js 更新至 2.9.1、qs 更新至 6.17.1，并更新 postcss-selector-parser 至 6.1.5；完整依赖审计通过。' },
      { type: 'improvement', description: '设置中心主题选中态回归移开鼠标后读取样式，避免悬停状态干扰自动断言。' },
      { type: 'fix', description: '发布接口先校验状态类型；数组等非字符串状态返回明确的 400 错误。' },
    ],
  },
  {
    version: '10.1.45',
    date: '2026-10-30',
    title: '日历键盘导航与主题选中状态',
    impactScope: ['排期日历', '键盘导航', '成片制作', '外观设置', '无障碍体验'],
    changes: [
      { type: 'improvement', description: '日历网格支持方向键和 Home/End 日期移动，跨月后焦点保持在目标日期；拍摄计划创建表单恢复清晰键盘焦点框；外观设置主题快捷按钮以视觉和读屏状态显示当前选择。' },
    ],
  },
  {
    version: '10.1.44',
    date: '2026-10-30',
    title: '选题审核通知原子持久化',
    impactScope: ['选题审核', '站内消息', '操作恢复'],
    changes: [
      { type: 'fix', description: '审核结果和创建者/负责人收件箱消息同事务保存；失败时整体回滚，推送失败不丢消息，重复审核不重复通知。' },
    ],
  },
  {
    version: '10.1.43',
    date: '2026-10-30',
    title: '编辑器色板平板触屏尺寸优化',
    impactScope: ['编辑器', '文字颜色', '高亮色板', '触屏操作'],
    changes: [
      { type: 'improvement', description: '粗指针触屏设备上的文字颜色与高亮色块至少 40×40px，细指针桌面保留紧凑布局。' },
    ],
  },
  {
    version: '10.1.42',
    date: '2026-10-30',
    title: '番茄钟触控尺寸与重置结果恢复',
    impactScope: ['番茄钟', '移动触控', '操作恢复'],
    changes: [
      { type: 'fix', description: '完整与紧凑番茄钟的开始/暂停按钮至少 40px 高；重置响应丢失时保留会话供用户显式安全重试。' },
    ],
  },
  {
    version: '10.1.41',
    date: '2026-10-30',
    title: '编辑器剪贴板操作结果反馈',
    impactScope: ['编辑器', '右键菜单', '剪贴板'],
    changes: [
      { type: 'fix', description: '复制、剪切和粘贴菜单操作按浏览器返回结果显示明确反馈；失败时保留正文并恢复编辑器焦点。' },
    ],
  },
  {
    version: '10.1.40',
    date: '2026-10-30',
    title: '首页内容流读取失败提示修复',
    impactScope: ['首页', '内容流', '错误恢复'],
    changes: [
      { type: 'fix', description: '内容阶段卡片读取失败时只显示读取状态；重试通过工作台顶部操作，卡片仍进入对应列表。' },
    ],
  },
  {
    version: '10.1.39',
    date: '2026-10-30',
    title: '首页公告板触控尺寸修复',
    impactScope: ['首页', '公告板', '移动触控'],
    changes: [
      { type: 'fix', description: '公告板的添加、列表重试与创建/删除状态核实操作均达到至少 40px 触控高度，新增入口达到 40×40px。' },
    ],
  },
  {
    version: '10.1.38',
    date: '2026-10-30',
    title: '选题维度读取重试触控尺寸修复',
    impactScope: ['选题详情', '内容维度', '移动触控'],
    changes: [
      { type: 'fix', description: '内容维度首次读取失败时，“重试”按钮的触控高度达到 40px，并可在重试后恢复显示。' },
    ],
  },
  {
    version: '10.1.37',
    date: '2026-10-30',
    title: '编辑器颜色菜单方向键操作修复',
    impactScope: ['编辑器', '右键菜单', '键盘导航'],
    changes: [
      { type: 'fix', description: '颜色子菜单向哪侧展开，方向键就向哪侧进入；按相反方向键返回触发项。' },
    ],
  },
  {
    version: '10.1.36',
    date: '2026-10-30',
    title: '编辑器颜色菜单高缩放显示修复',
    impactScope: ['编辑器', '右键菜单', '高缩放操作'],
    changes: [
      { type: 'fix', description: '文字和高亮颜色面板不再被主菜单的滚动区域裁切；高缩放下主菜单仍可滚动且键盘能到达末项。' },
    ],
  },
  {
    version: '10.1.35',
    date: '2026-10-30',
    title: '编辑器菜单缩放定位优化',
    impactScope: ['编辑器', '右键菜单', '缩放与窗口调整'],
    changes: [
      { type: 'fix', description: '编辑器菜单会随窗口尺寸重新定位并更新子菜单方向，窄桌面视口下仍为调色板预留完整空间。' },
    ],
  },
  {
    version: '10.1.34',
    date: '2026-10-30',
    title: '稿件批注回复视图切换保护',
    impactScope: ['成片审阅', '稿件批注', '切换稿件'],
    changes: [
      { type: 'fix', description: '切换账号或稿件后，旧的批注回复结果不会覆盖当前反馈或刷新当前线程；恢复记录仍按原稿件核实。' },
    ],
  },
  {
    version: '10.1.33',
    date: '2026-10-30',
    title: '日报归档周期状态与触控优化',
    impactScope: ['日报归档', '辅助技术', '触控操作'],
    changes: [
      { type: 'improvement', description: '归档周期按钮会明确报告当前选择，键盘和触控操作保持清楚易用。' },
    ],
  },
  {
    version: '10.1.32',
    date: '2026-10-30',
    title: '编辑器目录当前阅读位置提示',
    impactScope: ['编辑器', '目录导航', '无障碍阅读'],
    changes: [
      { type: 'improvement', description: '当前阅读标题会由辅助技术明确播报；跳转后当前标题状态随之更新。' },
    ],
  },
  {
    version: '10.1.31',
    date: '2026-10-30',
    title: '首页最近变化折叠语义优化',
    impactScope: ['桌面首页', '最近变化', '无障碍操作'],
    changes: [
      { type: 'improvement', description: '最近变化使用具名折叠按钮并播报展开状态，标题和内容区域语义清楚，键盘操作保持可用。' },
    ],
  },
  {
    version: '10.1.30',
    date: '2026-10-30',
    title: '登录及更新提示手机触控优化',
    impactScope: ['登录页', '版本更新提示', '触控操作'],
    changes: [
      { type: 'fix', description: '修复手机登录标题重叠，并扩大登录复选框和版本更新提示关闭目标。' },
    ],
  },
  {
    version: '10.1.29',
    date: '2026-10-30',
    title: '内容资产核实入口触控尺寸优化',
    impactScope: ['主题内容资产', '操作结果核实', '触控操作'],
    changes: [
      { type: 'improvement', description: '只读核实当前状态入口达到至少 40px 高；状态不明确时继续锁定写入，用户明确核实后才读取结果。' },
    ],
  },
  {
    version: '10.1.28',
    date: '2026-10-30',
    title: '资料详情导航触控尺寸优化',
    impactScope: ['资料详情', '面包屑导航', '触控操作'],
    changes: [
      { type: 'improvement', description: '资料详情的返回入口和桌面面包屑链接达到至少 40×40px，窄屏下仍能完整显示。' },
    ],
  },
  {
    version: '10.1.27',
    date: '2026-10-30',
    title: '角色权限管理触控尺寸优化',
    impactScope: ['角色权限管理', '触控操作', '窄屏表单'],
    changes: [
      { type: 'improvement', description: '角色管理的新建、编辑、删除、弹窗操作和权限选择区域达到至少 40px；窄屏下编码与名称字段改为单列。' },
    ],
  },
  {
    version: '10.1.26',
    date: '2026-10-30',
    title: '人员管理触控区域优化',
    impactScope: ['人员管理', '触控操作', '视图切换'],
    changes: [
      { type: 'improvement', description: '人员管理的视图切换、添加用户、行内操作和用户状态选择区域高度至少 40px；搜索、新建及编辑字段采用统一样式，密码管理字段具有明确的表单与自动填充语义。' },
    ],
  },
  {
    version: '10.1.25',
    date: '2026-10-30',
    title: '侧栏触控目标优化',
    impactScope: ['桌面侧栏', '触控操作', '辅助技术'],
    changes: [
      { type: 'improvement', description: '侧栏展开和收起按钮的点击区域扩大到至少 40px，图标尺寸和导航位置保持稳定。' },
    ],
  },
  {
    version: '10.1.24',
    date: '2026-10-30',
    title: '弹窗键盘取消与焦点恢复',
    impactScope: ['表单弹窗', '确认弹窗', '键盘操作', '焦点管理'],
    changes: [
      { type: 'improvement', description: '表单和确认弹窗可用 Escape 取消并将焦点还给触发按钮；提交中或恢复锁定时继续保持打开。其他可安全取消的对话框也支持键盘关闭。' },
    ],
  },
  {
    version: '10.1.23',
    date: '2026-10-30',
    title: '移动首页阶段入口触控优化',
    impactScope: ['移动首页', '内容阶段', '移动触控'],
    changes: [
      { type: 'improvement', description: '“各阶段最新内容”入口采用统一按钮样式，触控高度至少 40px，并保留展开/收起状态播报。' },
    ],
  },
  {
    version: '10.1.22',
    date: '2026-10-30',
    title: '移动页面标题层级与区域语义修正',
    impactScope: ['移动端导航', '页面标题', '内容区域', '键盘与屏幕阅读器'],
    changes: [
      { type: 'improvement', description: '移动端栏目作为一级标题，当前页面标题作为二级标题；切换页面后焦点仍进入具体页面标题。' },
      { type: 'improvement', description: '桌面页面继续使用页面标题作为一级标题，侧栏品牌名不再干扰标题导航。' },
      { type: 'fix', description: '拍摄详情不再在应用主区域内嵌套第二个主区域，屏幕阅读器可稳定定位页面主体。' },
    ],
  },
  {
    version: '10.1.21',
    date: '2026-10-30',
    title: '创作来源隔离与触控/读屏细节',
    impactScope: ['成片制作', '发布管理', '发布归档', '选题版本历史', '来源权限', '通知偏好', '日报填写', '数据趋势', '公告', '番茄钟', '移动触控', '辅助技术'],
    changes: [
      { type: 'fix', description: '成片、发布和归档记录打开服务端记录的准确创作版本；选题调整后仍能按原来源选题校验访问权限。' },
      { type: 'security', description: '跨选题归档不复制原稿正文；来源缺失或版本不唯一时隐藏正文，不回退显示当前稿。' },
      { type: 'improvement', description: '来源快照只读且不缓存；成就排行和创作者驾驶舱的失败重试入口更易点击和键盘操作。' },
      { type: 'improvement', description: '页面错误提示按当前标题层级呈现，读屏浏览结构更连续。' },
      { type: 'fix', description: '移动通知偏好保存结果不明时保留账号范围的恢复记录，重新打开后只读核实，不重复提交。' },
      { type: 'fix', description: '移动日报恢复信息未能清除时暂停提交；清理成功后再继续，避免刷新后误判草稿冲突。' },
      { type: 'improvement', description: '趋势周期按钮至少 40px 高；窄屏图表明细仍可由屏幕阅读器访问，页面不再横向溢出。' },
      { type: 'improvement', description: '公告表单、公告删除、番茄钟排行榜和选题内容维度操作具有更易点击的触控区域。' },
      { type: 'improvement', description: '编辑器基础富文本工具栏以具名控件组呈现；VoiceOver 已确认能播报两个侧栏视图的已选状态。' },
      { type: 'improvement', description: '选题、成片和发布来源链接及版本历史展开/重试操作至少 40px；大纲版本保存后若历史读取失败，可只读重试且不会重复保存或误报为空历史。' },
    ],
  },
  {
    version: '10.1.20',
    date: '2026-10-30',
    title: '读屏可用性与恢复安全补强',
    impactScope: ['编辑器', '活动日志', '日报', '登录灰度', '资料中心', '发布管理', '键盘操作', '无障碍'],
    changes: [
      { type: 'fix', description: '编辑器只读状态、正文名称和当前格式会清晰地提供给屏幕阅读器。' },
      { type: 'fix', description: '登录灰度页按实际运行方式显示状态；不匹配或比例试用不会误报为准备完成。' },
      { type: 'improvement', description: '品牌 Logo 支持键盘选择；资料没有匹配结果时可直接清除筛选。' },
      { type: 'fix', description: '日报恢复信息无法清除时会暂停提交；活动日志页码会明确播报当前页。' },
      { type: 'security', description: '发布和成片恢复标记按账号隔离；恢复信息异常时暂停写入并要求安全核实。' },
    ],
  },
  {
    version: '10.1.19',
    date: '2026-10-30',
    title: '消息主题适配与番茄钟读屏优化',
    impactScope: ['消息中心', '番茄钟', '主题适配', '无障碍'],
    changes: [
      { type: 'fix', description: '消息未读数字外侧的光效随浅色和深色主题使用对应的珊瑚色。' },
      { type: 'fix', description: '番茄钟分区标题按顺序呈现；排行榜和今日统计读取失败时会向屏幕阅读器播报错误。' },
    ],
  },
  {
    version: '10.1.18',
    date: '2026-10-30',
    title: '历史更新说明改用用户用语',
    impactScope: ['版本更新说明', '用户文案', '文案检查'],
    changes: [
      { type: 'improvement', description: '历史更新说明中的内部路径、字段名、依赖名称和开发工具改写为用户可理解的功能结果。' },
      { type: 'fix', description: '增加更新说明用语检查，防止内部路径、代码字段名和开发工具术语重新出现在用户页面。' },
    ],
  },
  {
    version: '10.1.17',
    date: '2026-10-30',
    title: '登录触控目标与找回密码反馈',
    impactScope: ['登录页', '移动可用性', '操作反馈', '无障碍'],
    changes: [
      { type: 'fix', description: '忘记密码入口提供至少 44px 高的触控区域，点击后在表单内显示并播报管理员重置说明。' },
    ],
  },
  {
    version: '10.1.16',
    date: '2026-10-30',
    title: '消息标题层级与未读数读屏名称',
    impactScope: ['消息中心', '顶栏导航', '无障碍'],
    changes: [
      { type: 'fix', description: '消息标题使用连续的二级标题；顶栏消息入口名称包含可见未读数。' },
    ],
  },
  {
    version: '10.1.15',
    date: '2026-10-30',
    title: '消息未读状态主题适配',
    impactScope: ['消息中心', '主题适配', '视觉一致性'],
    changes: [
      { type: 'fix', description: '未读消息左侧强调线改用 Studio 青色主题令牌，随浅色/深色主题同步变化。' },
    ],
  },
  {
    version: '10.1.14',
    date: '2026-10-30',
    title: '选题详情标题层级与截止日期读屏名称',
    impactScope: ['选题详情', '无障碍'],
    changes: [
      { type: 'fix', description: '选题详情分区标题按层级播报，截止日期按钮名称包含可见日期和编辑用途。' },
    ],
  },
  {
    version: '10.1.13',
    date: '2026-10-30',
    title: '导航读屏名称与可见标签对齐',
    impactScope: ['侧边导航', '无障碍'],
    changes: [
      { type: 'fix', description: '“工作台导航分组”与同名页面使用不同读屏名称；桌面用户菜单名称沿用可见账号名和角色，并补充打开用途。' },
    ],
  },
  {
    version: '10.1.12',
    date: '2026-10-30',
    title: '创作者账号光晕随主题适配',
    impactScope: ['创作者中心', '主题适配', '视觉一致性'],
    changes: [
      { type: 'fix', description: '账号卡片光晕改用 Studio 青色令牌，浅色与深色主题各自显示当前语义色。' },
    ],
  },
  {
    version: '10.1.11',
    date: '2026-10-30',
    title: '选题卡片悬停光效随主题适配',
    impactScope: ['选题管理', '主题适配', '视觉一致性'],
    changes: [
      { type: 'fix', description: '指标卡和重点选题卡的悬停光斑改用 Studio 青色令牌，浅色与深色主题不再共用固定颜色。' },
    ],
  },
  {
    version: '10.1.10',
    date: '2026-10-29',
    title: '编辑器缩进语义与采集端账号隔离',
    impactScope: ['编辑器', '创作者中心', '无障碍', '账号隔离'],
    changes: [
      { type: 'improvement', description: '编辑器主工具栏与“更多”菜单的首行缩进切换均报告当前状态。' },
      { type: 'fix', description: '创作者中心只显示当前已加载账号匹配的采集端；无匹配时明确显示未绑定，失败时不泄露其他账号的设备、浏览器或登录信息。' },
    ],
  },
  {
    version: '10.1.9',
    date: '2026-10-29',
    title: '资料筛选状态与编辑器切换语义',
    impactScope: ['资料库', '编辑器', '无障碍'],
    changes: [
      { type: 'fix', description: '资料库只显示当前身份与筛选查询成功返回的数量和页码；查询失败后隐藏旧统计并禁用翻页，重试后恢复。' },
      { type: 'improvement', description: '编辑器格式、列表、对齐与块级切换按钮报告当前启用状态，链接按钮保留打开对话框语义。' },
    ],
  },
  {
    version: '10.1.8',
    date: '2026-10-29',
    title: '首页摘要账号隔离',
    impactScope: ['首页', '账号隔离'],
    changes: [
      { type: 'fix', description: '关注事项、灵感预览与最近变化均绑定当前账号；切换身份期间不显示旧摘要，旧账号的重试回包也不能覆盖新账号。' },
    ],
  },
  {
    version: '10.1.7',
    date: '2026-10-29',
    title: '首页最近变化账号隔离',
    impactScope: ['首页', '账号隔离'],
    changes: [
      { type: 'fix', description: '切换账号后立即隐藏旧账号最近变化；新账号读取完成前显示加载状态，成功后只呈现当前账号记录。' },
    ],
  },
  {
    version: '10.1.6',
    date: '2026-10-29',
    title: '活动日志翻页并发读取保护',
    impactScope: ['活动日志', '无障碍'],
    changes: [
      { type: 'fix', description: '快速切页或更换成员时，迟到的旧响应不再覆盖当前记录和页码播报。' },
      { type: 'fix', description: '旧请求结束不会提前关闭最新查询的加载状态；查询变化或离页后旧回包失效。' },
    ],
  },
  {
    version: '10.1.5',
    date: '2026-10-29',
    title: '发布记录并发保护与移动切页焦点',
    impactScope: ['发布管理', '移动端', '无障碍'],
    changes: [
      { type: 'fix', description: '发布记录编辑在事务内核对原始字段基线，冲突时拒绝写入并保留草稿。' },
      { type: 'improvement', description: '移动导航切换页面后将焦点移到新视图标题，首次挂载不抢焦点。' },
    ],
  },
  {
    version: '10.1.4',
    date: '2026-10-29',
    title: '编辑器上下文菜单键盘与读屏语义',
    impactScope: ['编辑器', '无障碍'],
    changes: [
      { type: 'improvement', description: '右键、Shift+F10 和 Context Menu 键打开具名菜单；方向键、Home/End、子菜单返回、Escape 和 Tab 离开均可键盘操作。' },
      { type: 'fix', description: '无选区时禁用的菜单项仍可由方向键浏览并明确播报，不会执行操作。' },
    ],
  },
  {
    version: '10.1.3',
    date: '2026-10-29',
    title: '系统设置并发合并与用户菜单焦点恢复',
    impactScope: ['系统设置', '桌面导航', '无障碍'],
    changes: [
      { type: 'fix', description: '设置分区的并发保存改为事务内合并，避免互相覆盖。' },
      { type: 'improvement', description: '桌面用户菜单具名化，Escape 关闭后焦点恢复到触发按钮。' },
    ],
  },
  {
    version: '10.1.2',
    date: '2026-10-29',
    title: '键盘快捷键帮助焦点管理',
    impactScope: ['桌面导航', '无障碍'],
    changes: [
      { type: 'improvement', description: '快捷键帮助加入具名对话框、焦点圈定和关闭后焦点恢复。' },
    ],
  },
  {
    version: '10.1.1',
    date: '2026-10-29',
    title: '侧边导航地标命名',
    impactScope: ['桌面导航', '无障碍'],
    changes: [
      { type: 'improvement', description: '为侧边导航增加可访问名称，便于与面包屑导航区分。' },
    ],
  },
  {
    version: '10.1.0',
    date: '2026-10-29',
    title: '复盘行动项进入个人任务',
    impactScope: ['首页工作台', '数据复盘', '移动端'],
    changes: [
      { type: 'feature', description: '首页任务区展示本人负责且未完成的复盘行动项，可直接返回所属复盘继续处理。' },
      { type: 'improvement', description: '行动项摘要按负责人隔离、优先展示待办和临近截止项，并限制最多返回 3 条。' },
      { type: 'fix', description: '复盘详情由服务端按单条权限判定，避免复盘列表查看权限拦截本人行动项入口。' },
    ],
  },
  {
    version: '10.0.0',
    date: '2026-10-29',
    title: '官方日报追溯、并发复盘与无障碍搜索',
    impactScope: ['创作权限', '创作者数据', '90 天趋势', '复盘报告', '命令面板', '数据库迁移'],
    changes: [
      { type: 'security', description: '创作记录删除同时校验逐条编辑范围，自定义角色不能凭删除权限跨选题删除。' },
      { type: 'improvement', description: '官方账号日报在同一导入事务追加批次观测，90 天趋势按日期与指标重建最新有效事实。' },
      { type: 'improvement', description: '迁移时保留现存投影 baseline，并将其标为没有原批次身份，明确不可恢复的历史边界。' },
      { type: 'fix', description: '复盘快照计算期间若报告并发发布，拒绝用过期草稿结果替换已发布报告。' },
      { type: 'improvement', description: '命令面板将忙碌与无结果状态置于 listbox 外，避免把空状态暴露成结果选项。' },
    ],
  },
  {
    version: '9.6.144',
    date: '2026-10-29',
    title: '创作删除保留操作者审计',
    impactScope: ['创作管理', '操作审计', '数据一致性'],
    changes: [
      { type: 'fix', description: '删除创作稿及其版本历史时，在同一事务记录选题历史和全局操作日志。' },
      { type: 'fix', description: '审计写入失败会回滚删除，避免稿件消失但无法追溯操作者。' },
    ],
  },
  {
    version: '9.6.143',
    date: '2026-10-29',
    title: '侧栏明确播报当前视图',
    impactScope: ['侧栏导航', '无障碍访问'],
    changes: [
      { type: 'improvement', description: '侧栏当前页面使用 aria-current 语义，让屏幕阅读器识别当前视图。' },
      { type: 'improvement', description: '桌面侧栏折叠时，活动分组名称会附带当前子视图；展开后当前项保留页面语义。' },
      { type: 'fix', description: '导航回归要求唯一当前项与视觉选中状态保持一致。' },
    ],
  },
  {
    version: '9.6.142',
    date: '2026-10-29',
    title: '成就并发检查只通知一次',
    impactScope: ['成就系统', '通知可靠性'],
    changes: [
      { type: 'fix', description: '并发检查只由实际写入新授予记录的请求报告成就，避免重复显示获得结果。' },
      { type: 'fix', description: '一项成就只发送一条持久通知和一次实时提醒。' },
    ],
  },
  {
    version: '9.6.141',
    date: '2026-10-29',
    title: '资料回收与恢复防重复审计',
    impactScope: ['资料中心', '操作审计', '并发安全'],
    changes: [
      { type: 'fix', description: '资料删除和恢复在事务内按当前状态条件变更，并发重复请求不再重复写入状态审计。' },
      { type: 'improvement', description: '请求重试时若资料已达到目标状态，会返回成功，避免结果不明后产生误导性失败。' },
    ],
  },
  {
    version: '9.6.140',
    date: '2026-10-29',
    title: '发布归档可恢复删除',
    impactScope: ['发布归档', '资料中心', '数据保护'],
    changes: [
      { type: 'fix', description: '发布归档删除不再物理移除快照，改为事务内软删除并留下资料审计；旧归档列表和详情隐藏已删除项。' },
      { type: 'improvement', description: '删除后的归档可由资料中心现有恢复接口还原，审计写入失败时删除状态回滚。' },
    ],
  },
  {
    version: '9.6.139',
    date: '2026-10-29',
    title: '停用旧日报修改入口',
    impactScope: ['日报', '数据一致性'],
    changes: [
      { type: 'fix', description: '旧日报入口现在只允许查看，不能再通过它新建、修改或删除日报，避免跳过现有的状态、版本和操作记录保护。' },
      { type: 'security', description: '保留旧入口的登录、权限和查看行为，原有修改请求不会改变或删除日报。' },
    ],
  },
  {
    version: '9.6.138',
    date: '2026-10-29',
    title: '日报自动保存状态保护',
    impactScope: ['日报', '数据一致性', '审核流程'],
    changes: [
      { type: 'fix', description: '日报自动保存仅允许更新草稿，并在同一事务内核对状态；已提交或驳回日报不会在版本和审计不变时被静默改写。' },
      { type: 'fix', description: '并发首次建档、同版本更新、提交及审核回归确认同一日报只接受一个竞争请求，输家不会覆盖内容或重复写审计/通知。' },
    ],
  },
  {
    version: '9.6.137',
    date: '2026-10-29',
    title: 'Creator Center 无障碍明细、主题令牌与写入恢复',
    impactScope: ['创作者中心', '数据趋势', '作品复盘', '运营报告', '作品库', '内容实验室', '主题系统', '辅助技术', '发布恢复', '日历', '移动选题', '分析页', '日报'],
    changes: [
      { type: 'fix', description: '通用页面标题显示传入的说明文案；分析页说明在 1440px、390px 和 320px 浏览器页面检查中均可见。' },
      { type: 'improvement', description: '趋势和作品复盘曲线增加屏幕阅读器可读的北京时间日期与指标明细；空值和空序列清楚说明。' },
      { type: 'fix', description: '作品库卡片与表格封面在标题已提供信息的上下文中作为装饰，避免重复播报作品标题。' },
      { type: 'improvement', description: '运营报告生成期间播报具体报告类型，忙碌按钮暴露 aria-busy 并防止其它写操作。' },
      { type: 'fix', description: '内容实验室协作动态的“人类可读模式”复选框改用随浅/深主题变化的 Studio 主色令牌。' },
      { type: 'fix', description: '发布状态更新回归覆盖提交后响应丢失与刷新只读核实，确认恢复时不重复写入。' },
      { type: 'fix', description: '日历创建确认本机恢复标记清除后才解除锁定；移动选题看板的审核和阶段变更刷新后只读核实且不自动重发，写请求结束后核实入口正确恢复。' },
      { type: 'fix', description: '日报已提交后重复直接提交返回 409，不重复递增版本、写提交审计或发送待审核通知；驳回后保存回草稿仍可再次提交。' },
    ],
  },
  {
    version: '9.6.136',
    date: '2026-10-29',
    title: '日报忙碌播报与灵感转选题刷新恢复',
    impactScope: ['移动端', '日报', '灵感池', '辅助技术', '数据恢复'],
    changes: [
      { type: 'improvement', description: '移动日报保存、提交、恢复重试和状态核实时提供 polite 忙碌提示，相关按钮暴露 aria-busy 并保持单次操作。' },
      { type: 'security', description: '灵感转选题写入前核验账号/灵感范围恢复标记；结果不明时刷新后只读核实，不自动重复转换。' },
    ],
  },
  {
    version: '9.6.135',
    date: '2026-10-29',
    title: '移动消息筛选窄屏完整显示',
    impactScope: ['移动端', '消息中心', '响应式布局'],
    changes: [
      { type: 'fix', description: '移动消息页筛选按钮在 320px 窄屏自动换行，五个筛选项无需横向滑动即可看到和操作。' },
      { type: 'improvement', description: '筛选组维持具名无障碍分组及 aria-pressed 当前选中状态。' },
    ],
  },
  {
    version: '9.6.134',
    date: '2026-10-29',
    title: '主题开关读屏播报当前颜色',
    impactScope: ['移动端', '辅助技术', '主题'],
    changes: [
      { type: 'improvement', description: '移动端“我的”页主题开关名称直接包含当前浅色或深色状态，并保留 aria-pressed 语义。' },
      { type: 'fix', description: '键盘切换后可访问名称、选中状态与保存的主题偏好保持一致。' },
    ],
  },
  {
    version: '9.6.133',
    date: '2026-10-29',
    title: '移动端主题开关状态播报',
    impactScope: ['移动端', '辅助技术', '主题'],
    changes: [
      { type: 'improvement', description: '移动端“我的”页主题切换提供稳定可访问名称，并通过 aria-pressed 暴露深色主题启用状态。' },
      { type: 'fix', description: '点击或按空格切换主题时都会保存当前偏好，不会误改其他业务数据。' },
    ],
  },
  {
    version: '9.6.132',
    date: '2026-10-29',
    title: '复盘发布与归档刷新恢复',
    impactScope: ['复盘', '数据恢复', '操作可靠性'],
    changes: [
      { type: 'security', description: '发布和归档写入前保存并核验账号/复盘范围标记；结果不明后刷新只读核验，确认前锁定重复操作。' },
      { type: 'improvement', description: '仅在读回确认原状态后提供用户明确确认的重试，不自动重复发布或归档。' },
    ],
  },
  {
    version: '9.6.131',
    date: '2026-10-29',
    title: '复盘快照恢复与窄屏提示验收',
    impactScope: ['复盘', '创作管理', '数据恢复', '移动端', '辅助技术'],
    changes: [
      { type: 'security', description: '复盘指标快照生成前核验账号/复盘范围恢复标记；结果不明时只读核实，刷新后继续核验，确认前锁定重复生成。' },
      { type: 'improvement', description: '创作自动保存恢复提示补齐窄屏浅/深主题布局与键盘焦点回归，避免横向溢出且不自动重发。' },
    ],
  },
  {
    version: '9.6.130',
    date: '2026-10-29',
    title: '移动端字号选项具名分组',
    impactScope: ['移动端', '辅助技术', '显示偏好'],
    changes: [
      { type: 'improvement', description: '移动端“我的”页面的 14/16/18 字号选项加入“字体大小”具名组，保留当前选中状态播报。' },
    ],
  },
  {
    version: '9.6.129',
    date: '2026-10-29',
    title: '资料关联刷新恢复与版本历史读屏分组',
    impactScope: ['选题资料', '创作详情', '辅助技术', '数据恢复'],
    changes: [
      { type: 'security', description: '资料关联写入前核验账号范围的本机恢复记录；结果未知时刷新后只读核实，不自动重复写入。' },
      { type: 'improvement', description: '创作详情版本选择项置于具名“版本记录”组中，保留键盘操作和选中状态播报。' },
    ],
  },
  {
    version: '9.6.128',
    date: '2026-10-29',
    title: '桌面与移动端个人资料保存恢复保护',
    impactScope: ['个人资料', '账号安全', '数据恢复'],
    changes: [
      { type: 'security', description: '个人资料写入前核对账号隔离的本机恢复记录；结果未知时刷新后只读核实、不自动重发，明确确认后才允许再次保存。' },
      { type: 'improvement', description: '桌面和移动端均恢复待处理草稿，并在服务器状态确认且恢复记录已核实清除后解锁表单。' },
    ],
  },
  {
    version: '9.6.127',
    date: '2026-10-29',
    title: '密码修改恢复保护与粉丝趋势空状态播报',
    impactScope: ['账号安全', '创作者中心', '辅助技术'],
    changes: [
      { type: 'security', description: '密码修改结果未知时按账号保存不含密码或令牌的恢复标记；刷新后保持锁定，成功重新登录后核实清理。' },
      { type: 'improvement', description: '创作者趋势缺少粉丝数据时播报可访问的空状态，不展示伪造图表。' },
    ],
  },
  {
    version: '9.6.126',
    date: '2026-10-29',
    title: '通知偏好恢复与活动日志空状态播报',
    impactScope: ['通知偏好', '活动日志', '辅助技术'],
    changes: [
      { type: 'fix', description: '通知偏好保存结果未知时按账号恢复提交草稿，刷新后只读核实并避免自动重复保存。' },
      { type: 'improvement', description: '活动日志成功返回空结果时通过礼貌状态播报空状态。' },
    ],
  },
  {
    version: '9.6.125',
    date: '2026-10-29',
    title: '系统设置保存恢复与成片标题悬停对比度',
    impactScope: ['系统设置', '成片管理', '辅助技术'],
    changes: [
      { type: 'fix', description: '系统设置写入前保存并核对账号隔离的本机恢复记录；结果不明时刷新后只读核实，不自动重复提交。' },
      { type: 'improvement', description: '成片列表标题悬停和键盘聚焦时使用可区分的主题对比色。' },
    ],
  },
  {
    version: '9.6.124',
    date: '2026-10-29',
    title: '报告中心视图具名分组',
    impactScope: ['报告中心', '辅助技术'],
    changes: [
      { type: 'improvement', description: '为日报、周报与导出视图切换补充“报告中心视图”分组名称，保留各视图选中状态。' },
    ],
  },
  {
    version: '9.6.123',
    date: '2026-10-29',
    title: '移动选题审核结果具名',
    impactScope: ['移动选题详情', '辅助技术'],
    changes: [
      { type: 'improvement', description: '为移动端通过/驳回选项补充“审核结果”分组名称，并保留选择状态播报。' },
    ],
  },
  {
    version: '9.6.122',
    date: '2026-10-29',
    title: '选题视图切换状态回归',
    impactScope: ['选题管理', '辅助技术'],
    changes: [
      { type: 'improvement', description: '补充桌面列表/看板具名视图组的默认与切换状态验证，确认辅助技术可识别当前视图。' },
    ],
  },
  {
    version: '9.6.121',
    date: '2026-10-29',
    title: '选题保存恢复校验',
    impactScope: ['选题详情', '保存恢复', '数据安全'],
    changes: [
      { type: 'fix', description: '选题聚合保存前核验带内容指纹的恢复标记，浏览器静默篡改或丢写时保留输入且不发送写请求。' },
      { type: 'improvement', description: '恢复标记清理失败时保持写入锁定，并提供只读核实入口以避免重复保存。' },
    ],
  },
  {
    version: '9.6.120',
    date: '2026-10-29',
    title: '消息筛选具名分组',
    impactScope: ['消息中心', '移动消息', '辅助技术'],
    changes: [
      { type: 'improvement', description: '桌面和移动消息中心筛选按钮增加“消息筛选”分组名称。' },
      { type: 'fix', description: '辅助技术可获取筛选控件组用途；各筛选按钮选中状态保持不变。' },
    ],
  },
  {
    version: '9.6.119',
    date: '2026-10-29',
    title: '日报视图导航辅助名称',
    impactScope: ['日报', '辅助技术'],
    changes: [
      { type: 'improvement', description: '为“我的日报 / 团队日报 / 总结归档”视图切换导航添加可访问名称。' },
      { type: 'fix', description: '让屏幕阅读器能识别日报视图导航地标的用途。' },
    ],
  },
  {
    version: '9.6.118',
    date: '2026-10-29',
    title: '创作者趋势周期控件读屏说明',
    impactScope: ['创作者中心', '数据趋势', '辅助技术'],
    changes: [
      { type: 'improvement', description: '为 7/30/90 天统计周期按钮添加“数据统计周期”具名分组。' },
      { type: 'fix', description: '保留 aria-pressed 选中状态，便于辅助技术识别当前统计周期。' },
    ],
  },
  {
    version: '9.6.117',
    date: '2026-10-29',
    title: '复盘写入恢复标记精确核验',
    impactScope: ['复盘结论', '行动项创建', '行动项更新', '写入恢复'],
    changes: [
      { type: 'fix', description: '复盘结论和行动项写入前逐字核对恢复标记；同一请求编号下内容被改写时不发送业务请求。' },
      { type: 'improvement', description: '安全清理异常标记并保留表单输入；旧格式有效恢复记录仍可读取。' },
    ],
  },
  {
    version: '9.6.116',
    date: '2026-10-29',
    title: '成片恢复标记安全核验',
    impactScope: ['成片制作', '剧本版本', '状态更新', '写入恢复'],
    changes: [
      { type: 'fix', description: '成片创建、状态和剧本版本写入前逐字核对恢复标记；不可读或内容不一致时锁定相关写入。' },
      { type: 'improvement', description: '恢复标记异常时提示重新读取；读取成功后恢复正常操作。' },
    ],
  },
  {
    version: '9.6.115',
    date: '2026-10-29',
    title: '写入恢复与创作详情错误态完善',
    impactScope: ['创作者中心', '匿名意见管理', '创作详情', '写入恢复', '主题验收'],
    changes: [
      { type: 'fix', description: '报告生成/删除与匿名意见删除在请求前精确核验恢复标记；读取或清理不可靠时暂停写入。' },
      { type: 'improvement', description: '创作详情读取失败显示可重试错误态，不再误报记录不存在；补充浅/深主题悬停与手机错误态对比检查。' },
    ],
  },
  {
    version: '9.6.114',
    date: '2026-10-29',
    title: '绑定码安全重试标记前置核验',
    impactScope: ['创作者中心', 'Creator Agent', '写入恢复'],
    changes: [
      { type: 'fix', description: '生成绑定码前会再次核对当前账号和申请；本机保存失败时明确提示尚未发送，并阻止生成绑定码。' },
    ],
  },
  {
    version: '9.6.113',
    date: '2026-10-29',
    title: '发布管理恢复凭证请求前核验',
    impactScope: ['发布管理', '创建', '编辑', '删除', '写入恢复'],
    changes: [
      { type: 'fix', description: '发布记录创建、编辑和删除请求前精确回读恢复凭证；静默丢写时保留表单/确认状态并阻止请求。' },
    ],
  },
  {
    version: '9.6.112',
    date: '2026-10-29',
    title: '创作详情状态恢复凭证回读',
    impactScope: ['创作详情', '审核提交', '状态操作', '写入恢复'],
    changes: [
      { type: 'fix', description: '状态、审核、版本保存和删除请求前精确回读恢复凭证；静默丢写时不发业务请求。' },
    ],
  },
  {
    version: '9.6.111',
    date: '2026-10-29',
    title: '制作计划恢复凭证前置核验',
    impactScope: ['成片制作', '写入恢复'],
    changes: [
      { type: 'fix', description: '删除与完成请求前精确回读恢复凭证；静默丢写时保留状态并拦截业务请求。' },
    ],
  },
  {
    version: '9.6.110',
    date: '2026-10-29',
    title: '消息操作恢复凭证精确回读',
    impactScope: ['桌面消息中心', '移动消息中心', '写入恢复'],
    changes: [
      { type: 'fix', description: '批量已读和清空消息在业务请求前精确回读恢复凭证；静默丢写时明确提示并拦截请求。' },
    ],
  },
  {
    version: '9.6.109',
    date: '2026-10-29',
    title: '生产审阅恢复凭证精确回读',
    impactScope: ['生产审阅', '批注', '讨论回复', '写入恢复'],
    changes: [
      { type: 'fix', description: '批注、讨论回复与状态处理均在业务请求前精确回读 sessionStorage 恢复凭证；静默丢写时保留内容并阻止请求。' },
    ],
  },
  {
    version: '9.6.108',
    date: '2026-10-29',
    title: '写入恢复凭证精确回读',
    impactScope: ['日报', '灵感投票', '发布剧本', '写入恢复'],
    changes: [
      { type: 'fix', description: '日报、灵感投票和发布剧本保存前精确回读恢复凭证；静默丢写时保留内容且不发送业务写请求。' },
    ],
  },
  {
    version: '9.6.107',
    date: '2026-10-29',
    title: '日报草稿恢复凭证校验',
    impactScope: ['桌面日报', '移动日报', '写入恢复'],
    changes: [
      { type: 'fix', description: '日报草稿写入前精确回读恢复凭证；存储静默丢写时保留表单且不发送写请求。' },
    ],
  },
  {
    version: '9.6.106',
    date: '2026-10-29',
    title: '日历创建恢复编号校验',
    impactScope: ['排期日历', '写入恢复'],
    changes: [
      { type: 'fix', description: '日历事件创建前精确回读恢复编号；存储静默丢写时保留表单且不发送创建请求。' },
    ],
  },
  {
    version: '9.6.105',
    date: '2026-10-29',
    title: '公告发布恢复记录校验',
    impactScope: ['首页公告', '写入恢复'],
    changes: [
      { type: 'fix', description: '公告发布前验证恢复编号可靠保存；发布确认后恢复编号无法清理时保留操作锁并说明真实状态，刷新后只读恢复。' },
    ],
  },
  {
    version: '9.6.104',
    date: '2026-10-29',
    title: '统一错误读屏播报',
    impactScope: ['全站错误反馈', '辅助技术'],
    changes: [
      { type: 'improvement', description: '共用错误面板默认通过 alert 播报标题和说明；未找到状态使用 status，重试按钮保持单独可达。' },
    ],
  },
  {
    version: '9.6.103',
    date: '2026-10-29',
    title: '移动消息错误读屏播报',
    impactScope: ['移动消息', '辅助技术'],
    changes: [
      { type: 'fix', description: '移动消息列表首读失败使用 alert 播报错误标题与说明，重试按钮保持单独可达。' },
    ],
  },
  {
    version: '9.6.102',
    date: '2026-10-29',
    title: '历史来源归属、角色写入恢复与通知错误播报',
    impactScope: ['创作历史', '发布归档', '角色管理', '移动通知', '辅助技术'],
    changes: [
      { type: 'fix', description: '创作历史版本保存来源选题；稿件重关联后只向原选题解析历史，旧数据保持未知。' },
      { type: 'improvement', description: '角色创建、更新、删除前验证本机恢复快照；预写失败时不发送请求，结果不明时只读核实。' },
      { type: 'fix', description: '移动通知偏好首读错误通过 alert 播报，重试按钮保持独立可操作。' },
    ],
  },
  {
    version: '9.6.101',
    date: '2026-10-29',
    title: '来源选题追溯、角色创建恢复与键盘操作',
    impactScope: ['创作来源', '选题详情', '角色管理', '辅助技术'],
    changes: [
      { type: 'improvement', description: '创作来源快照保留创建时的选题 ID；稿件重关联后仍链接至原选题版本，旧数据不推断。' },
      { type: 'fix', description: '角色创建 POST 前验证恢复标记；浏览器存储无法确认时不发送创建请求。' },
      { type: 'improvement', description: '选题详情截止日期入口改为可键盘操作的具名按钮，并提供清晰焦点状态。' },
    ],
  },
  {
    version: '9.6.100',
    date: '2026-10-29',
    title: '用户写入恢复、来源快照唯一性与悬停对比度',
    impactScope: ['用户管理', '发布归档', '登录页', '数据恢复'],
    changes: [
      { type: 'improvement', description: '用户新增、编辑、删除和启停写入前校验恢复标记已精确保存，失败时不发送业务请求。' },
      { type: 'fix', description: '发布归档来源快照必须唯一匹配选题、创作稿和版本，否则隐藏有歧义的正文。' },
      { type: 'fix', description: '登录页 style2 忘记密码链接在浅色悬停状态改用足够对比度的 Studio 语义颜色。' },
    ],
  },
  {
    version: '9.6.99',
    date: '2026-10-29',
    title: '选题审核恢复、弹窗焦点与品牌对比度',
    impactScope: ['选题审核', '角色权限', '登录页', '辅助技术'],
    changes: [
      { type: 'improvement', description: '选题审核写入前验证本机恢复标记；结果不明时保护离页和刷新，重新进入后只读核实。' },
      { type: 'fix', description: '只有服务器状态未变化且用户二次确认后才重试审核；恢复记录无法安全保存时不发送审核请求。' },
      { type: 'improvement', description: '角色新建/编辑弹窗增加键盘焦点循环、Escape 关闭和焦点返回。' },
      { type: 'fix', description: '登录页品牌小字采用主题语义对比度令牌，提升浅色主题可读性。' },
    ],
  },
  {
    version: '9.6.98',
    date: '2026-10-29',
    title: '桌面稿件自动保存恢复保护',
    impactScope: ['创作管理', '正文自动保存', '协作恢复'],
    changes: [
      { type: 'improvement', description: '桌面创作详情在自动保存结果不明时保留本机草稿，并通过只读核对确认服务器是否已保存。' },
      { type: 'fix', description: '未写入的自动保存不会自行重发；检测到协作者并发更新时保留服务器正文和本机草稿，只有用户核对并明确恢复后才再次保存。' },
    ],
  },
  {
    version: '9.6.97',
    date: '2026-10-29',
    title: '首页概览、日报归档和界面语义完善',
    impactScope: ['首页', '日报归档', '角色管理', '编辑器', '辅助技术'],
    changes: [
      { type: 'improvement', description: '管理者桌面与移动首页集中显示现有权限范围内的跨模块待处理数量，并直达对应模块。' },
      { type: 'improvement', description: '角色编码、角色名称和描述字段与可见标签关联，并补充稳定 id/name。' },
      { type: 'improvement', description: '编辑器各类子菜单统一使用编辑器层级令牌；工具栏下拉按可见滚动区域定位，触发按钮报告展开状态。' },
      { type: 'improvement', description: '数据导出的选项通过具名按钮组和按下状态报告类型与当前选择。' },
      { type: 'improvement', description: '选题审核结果通过具名按钮组和按下状态报告批准或驳回选择。' },
      { type: 'improvement', description: '日报归档的成员和日期筛选框与标签关联，并补充稳定字段标识。' },
      { type: 'improvement', description: '发布归档逐条保存各平台记录的准确来源版本及正文快照；跨选题或不可用来源不展示推断内容。' },
      { type: 'improvement', description: '资源中心历史归档详情逐条显示已验证来源版本，并在权限允许时打开原稿；不明确的快照不展示推断正文。' },
      { type: 'improvement', description: '发布归档删除前验证本机恢复标记；结果不明时只读核实，标记无法保存时不发送删除请求，确认仍存在后须用户再次确认。' },
      { type: 'improvement', description: '剧本保存结果待核实期间若读取权限被撤销，隐藏已加载正文并保留本标签页恢复信息，允许权限恢复后只读核实且不重复提交。' },
      { type: 'fix', description: '资料关联待核实提示改用已注册的 Studio 表面颜色令牌。' },
    ],
  },
  {
    version: '9.6.96',
    date: '2026-10-29',
    title: '表单、活动日志、审阅、消息与写入恢复更清晰',
    impactScope: ['日历', '活动日志', '消息中心', '公告板', '生产审阅', '移动端', '灵感池', '灵感讨论', '成就管理', '辅助技术'],
    changes: [
      { type: 'improvement', description: '新建日历事件的标题控件暴露原生必填状态，空提交保留既有拦截且不发送创建请求。' },
      { type: 'improvement', description: '移动端字号按钮报告当前选择；灵感评论在恢复编号无法安全保存时拦截写入并保留草稿。' },
      { type: 'improvement', description: '移动首页公告板的新建内容框关联可见标签，并补充稳定字段标识。' },
      { type: 'improvement', description: '日历今天的日期格以 aria-current="date" 暴露当前日期状态。' },
      { type: 'improvement', description: '活动日志读取成功后播报页码与记录数；失败时不播报成功。' },
      { type: 'improvement', description: '桌面消息页关联图标使用语义颜色，在浅色与深色主题保持足够对比度。' },
      { type: 'improvement', description: '批注和修改建议的回复框名称包含讨论类型与摘要，便于辨认回复目标。' },
      { type: 'improvement', description: '灵感创建弹层提供模态名称与焦点管理；结果待核实时禁止关闭。' },
      { type: 'improvement', description: '灵感创建提交前保存并回读匹配的完整恢复凭据；预检失败时保留草稿且不发送请求。' },
      { type: 'improvement', description: '成就初始化结果不明时按账号只读核实；空列表才允许明确重试，核实失败时锁定写入。' },
    ],
  },
  {
    version: '9.6.95',
    date: '2026-10-29',
    title: '匿名意见必填字段更清晰',
    impactScope: ['匿名意见', '辅助技术'],
    changes: [
      { type: 'improvement', description: '意见类型和内容关联可见标签并暴露必填状态；装饰星号不混入控件名称。' },
    ],
  },
  {
    version: '9.6.94',
    date: '2026-10-29',
    title: '登录页布局选择更容易识别',
    impactScope: ['系统设置', '登录页设置', '辅助技术'],
    changes: [
      { type: 'improvement', description: '登录页布局选择框与可见标签关联，并补充稳定字段标识。' },
    ],
  },
  {
    version: '9.6.93',
    date: '2026-10-29',
    title: '表单与搜索操作更容易识别',
    impactScope: ['创作管理', '拍摄计划', '全局搜索', '选题创作恢复'],
    changes: [
      { type: 'improvement', description: '创作管理和拍摄计划表单标签正确关联；全局搜索用键盘和读屏状态标明当前候选项。' },
      { type: 'fix', description: '选题建稿遇到未知结果时按账号和选题只读核实回执，确认未创建后才允许用同一编号明确重试。' },
    ],
  },
  {
    version: '9.6.92',
    date: '2026-10-29',
    title: '移动选题提报字段更易识别',
    impactScope: ['移动端选题提报', '辅助技术'],
    changes: [
      { type: 'improvement', description: '移动端选题提报字段与可见标签关联并补齐稳定标识；标题必填状态可感知，装饰星号不进入读屏名称。' },
    ],
  },
  {
    version: '9.6.91',
    date: '2026-10-29',
    title: '选题提报字段更易识别',
    impactScope: ['选题提报', '辅助技术'],
    changes: [
      { type: 'improvement', description: '桌面选题提报的基本字段与可见标签正确关联；富文本大纲提供明确的多行文本框名称。' },
    ],
  },
  {
    version: '9.6.90',
    date: '2026-10-29',
    title: '搜索框名称更清楚',
    impactScope: ['人员管理', '全站搜索', '辅助技术'],
    changes: [
      { type: 'improvement', description: '人员管理搜索名称随视图变化；全站共享搜索框优先使用显式名称，否则从占位文字生成可访问名称。' },
    ],
  },
  {
    version: '9.6.89',
    date: '2026-10-29',
    title: '选题列表排序状态更清楚',
    impactScope: ['桌面选题列表', '列表排序', '辅助技术'],
    changes: [
      { type: 'improvement', description: '默认按可见的提交时间降序；当前列标记 aria-sort，排序按钮说明当前和下一方向，排序变化通过 polite status 播报。' },
    ],
  },
  {
    version: '9.6.88',
    date: '2026-10-29',
    title: '选题资料关联结果可安全核实',
    impactScope: ['桌面选题详情', '资料关联', '结果恢复'],
    changes: [
      { type: 'fix', description: '关联和解除关联遇到响应不确定时先读取服务端关系；只读核实失败时锁定对应资料的重复写入，只允许 GET 核实，确认关系未变后才可由用户显式重试。' },
    ],
  },
  {
    version: '9.6.87',
    date: '2026-10-29',
    title: '选题状态核实后锁定旧卡片',
    impactScope: ['移动选题看板', '状态核实', '结果反馈'],
    changes: [
      { type: 'fix', description: '服务端状态已确认但选题列表刷新失败时，继续锁定旧卡片操作并持续显示已确认状态；用户只能只读核实和刷新列表，不会重复提交。' },
    ],
  },
  {
    version: '9.6.86',
    date: '2026-10-29',
    title: '选题编辑字段可被读屏识别',
    impactScope: ['桌面选题详情', '选题编辑', '辅助技术'],
    changes: [
      { type: 'improvement', description: '选题详情编辑和审核表单中的标题、负责人、截止时间、发布平台、项目背景、目标受众、指派负责人和审核意见控件均有明确读屏名称，背景和受众编辑按钮可区分；编辑、自动聚焦和保存流程保持。' },
    ],
  },
  {
    version: '9.6.85',
    date: '2026-10-29',
    title: '资料分类提示清晰并补齐标题读屏名称',
    impactScope: ['资料分类管理', '选题详情', '辅助技术'],
    changes: [
      { type: 'fix', description: '资料分类新增、编辑、删除遇到网络或浏览器技术异常时显示中文提示，保留可读业务原因与原有结果核实和防重复保护。' },
      { type: 'improvement', description: '选题详情标题编辑框补齐“选题标题”读屏名称，不改变自动聚焦和保存行为。' },
    ],
  },
  {
    version: '9.6.84',
    date: '2026-10-29',
    title: '选题恢复提示隐藏浏览器异常',
    impactScope: ['桌面选题提报', '移动选题提报', '请求恢复'],
    changes: [
      { type: 'fix', description: '提报恢复信息保存或只读结果核实失败时，网络和浏览器技术错误使用中文操作提示；可读业务原因、原请求编号和安全重试规则保持。' },
    ],
  },
  {
    version: '9.6.83',
    date: '2026-10-29',
    title: '资料恢复核实错误提示更清楚',
    impactScope: ['资料中心', '创建与编辑恢复'],
    changes: [
      { type: 'fix', description: '资料创建和编辑结果核实异常、恢复信息保存失败时，过滤网络和浏览器技术错误并显示中文操作提示；业务拒绝原因和防重复保护保持。' },
    ],
  },
  {
    version: '9.6.82',
    date: '2026-10-29',
    title: '补齐登录错误文字颜色映射',
    impactScope: ['Studio Atelier', '首次登录改密提示'],
    changes: [
      { type: 'fix', description: '将改密错误提示使用的 danger-contrast 名称映射到现有珊瑚色对比文字令牌，不增加颜色值或主题偏差。' },
    ],
  },
  {
    version: '9.6.81',
    date: '2026-10-29',
    title: '改密结果不确定时保留恢复提示',
    impactScope: ['移动端个人设置', '账号安全', '密码修改恢复'],
    changes: [
      { type: 'fix', description: '改密结果不确定时按账号保存不含凭据的会话标记，刷新或离开再返回仍锁定；同账号成功登录后清除，无法安全保存标记时不会发送改密请求。' },
    ],
  },
  {
    version: '9.6.80',
    date: '2026-10-29',
    title: '选题资料关联操作更易点按',
    impactScope: ['选题详情', '资料关联', '触屏与辅助技术'],
    changes: [
      { type: 'improvement', description: '查看、解除关联和搜索结果关联操作达到 40px 触控高度，搜索框与各项操作有明确的读屏名称；窄屏操作保持在视口内。' },
    ],
  },
  {
    version: '9.6.79',
    date: '2026-10-29',
    title: '编辑器菜单适配滚动容器',
    impactScope: ['富文本编辑器', '窄屏布局', '浏览器缩放'],
    changes: [
      { type: 'fix', description: '标题、颜色、导出和更多操作菜单按实际滚动/裁切区域计算位置与最大高度，随滚动、窗口或容器尺寸变化重新定位；按 Escape 可关闭菜单并将焦点还给触发按钮；窄容器中的颜色面板也会收缩到可用宽度。' },
    ],
  },
  {
    version: '9.6.78',
    date: '2026-10-29',
    title: '首次登录改密结果保护与表单可访问性',
    impactScope: ['首次登录', '账号安全', '密码表单'],
    changes: [
      { type: 'fix', description: '服务器明确拒绝改密时可修正重试；结果未知时锁定重复提交并清除本机密码恢复线索。服务器确认成功后，即使记住密码保存失败仍正常登出并提示手动登录。' },
      { type: 'improvement', description: '改密表单补齐读屏标签、密码管理器字段语义和 Enter 提交。' },
    ],
  },
  {
    version: '9.6.77',
    date: '2026-10-29',
    title: '当前挂载模块技术错误提示收口',
    impactScope: ['资料中心', 'Creator 数据', '复盘恢复', '创作审核', '通知设置'],
    changes: [
      { type: 'improvement', description: '资料中心、Creator 数据、灵感转选题、复盘恢复、创作审核与通知设置中的网络/浏览器存储技术异常改为中文操作提示；保留可读业务原因、只读核实与已有写入保护。创作恢复信息未能安全保存时明确说明请求未发送。' },
    ],
  },
  {
    version: '9.6.76',
    date: '2026-10-28',
    title: '个人设置错误提示与表单语义',
    impactScope: ['个人设置', '个人资料保存', '表单可访问性'],
    changes: [
      { type: 'improvement', description: '个人资料读取遇到网络或浏览器异常时显示中文操作提示；为个人资料及系统设置输入补齐关联标签，并保留可读业务原因与保存结果核实。' },
    ],
  },
  {
    version: '9.6.75',
    date: '2026-10-28',
    title: '匿名意见弹窗读取恢复与错误反馈',
    impactScope: ['匿名意见箱', '意见读取', '提交结果核实'],
    changes: [
      { type: 'improvement', description: '匿名意见列表读取失败在弹窗内显示中文错误和重试，避免误显示空列表；提交后刷新和结果核实的技术异常去技术化，可读业务原因、匿名回执及不确定结果锁定保持。' },
    ],
  },
  {
    version: '9.6.74',
    date: '2026-10-28',
    title: '报告中心 CSV 导出错误反馈',
    impactScope: ['报告中心', '数据导出', '错误提示'],
    changes: [
      { type: 'improvement', description: 'CSV 导出遇到浏览器或服务器技术异常时显示中文操作提示，同时保留可读业务原因和既有下载、通知行为。' },
    ],
  },
  {
    version: '9.6.73',
    date: '2026-10-28',
    title: '日报总结错误提示与 Creator 头像稳定性',
    impactScope: ['月报/年报编辑', '总结归档', 'Creator 运营概览'],
    changes: [
      { type: 'improvement', description: '总结读取、结果核实和归档读取的技术异常改为中文提示，保留只读核实和未知写入锁定；日报与总结表单补齐稳定标识，Creator 首屏头像改为优先加载并明确宽高比例。' },
    ],
  },
  {
    version: '9.6.72',
    date: '2026-10-28',
    title: '抖音运营概览与复盘报告错误提示',
    impactScope: ['抖音运营概览', '运营复盘报告', '读取失败恢复'],
    changes: [
      { type: 'improvement', description: '浏览器和服务器技术错误显示中文重试提示，可读业务原因、报告写入保护和只读核实边界保持。' },
    ],
  },
  {
    version: '9.6.71',
    date: '2026-10-28',
    title: '移动创作错误反馈',
    impactScope: ['移动创作列表', '移动稿件编辑', '结果核实'],
    changes: [
      { type: 'improvement', description: '网络、浏览器存储与不可读服务器错误显示中文处理提示；创建编号、只读核实、写入锁定和明确重试边界保持。' },
    ],
  },
  {
    version: '9.6.70',
    date: '2026-10-28',
    title: '移动端账号表单与错误提示',
    impactScope: ['移动通知偏好', '移动个人资料', '移动密码修改', '键盘操作'],
    changes: [
      { type: 'improvement', description: '网络和不可读技术错误显示中文处理提示；个人资料与密码表单可按 Enter 提交，业务校验、资料核实和密码结果未知保护保持。' },
    ],
  },
  {
    version: '9.6.69',
    date: '2026-10-28',
    title: '移动选题看板错误反馈收敛',
    impactScope: ['移动选题看板', '流程详情跳转', '状态操作反馈'],
    changes: [
      { type: 'improvement', description: '看板流程详情读取和审核/状态操作遇到浏览器技术异常时显示中文处理提示；保留业务原因与既有结果核实流程。' },
    ],
  },
  {
    version: '9.6.68',
    date: '2026-10-28',
    title: '移动选题详情错误反馈与只读恢复',
    impactScope: ['移动选题详情', '关联资料', '操作反馈'],
    changes: [
      { type: 'improvement', description: '关联资料读取和选题保存、审核、状态操作遇到浏览器技术异常时显示中文处理提示；保留可读业务原因和原有只读核实、写入保护。' },
    ],
  },
  {
    version: '9.6.67',
    date: '2026-10-28',
    title: '移动选题列表断网提示与恢复',
    impactScope: ['移动选题', '列表读取', '错误反馈'],
    changes: [
      { type: 'improvement', description: '移动选题列表遇到浏览器网络等技术异常时显示中文连接提示；服务端可读业务原因、最近成功列表和显式重试保持。' },
    ],
  },
  {
    version: '9.6.66',
    date: '2026-10-28',
    title: '移动消息技术异常提示与只读恢复',
    impactScope: ['移动消息', '错误反馈', '只读核实', '防重复操作'],
    changes: [
      { type: 'improvement', description: '移动消息加载、分页、单条已读状态核实和批量已读请求准备中的技术异常显示中文操作提示；可读业务原因保留。' },
      { type: 'fix', description: '状态核实失败继续锁定未读写入；只有只读核实确认仍未读后，才允许用户明确重试。' },
    ],
  },
  {
    version: '9.6.65',
    date: '2026-10-28',
    title: '移动工作台错误提示去技术化',
    impactScope: ['移动工作台', '关注事项', '最近变化', '错误反馈'],
    changes: [
      { type: 'improvement', description: '移动工作台关注事项和最近变化遇到网络或浏览器技术异常时显示中文处理提示；保留只读重试与最近一次成功内容。' },
    ],
  },
  {
    version: '9.6.64',
    date: '2026-10-28',
    title: '移动日报异常提示与保存保护',
    impactScope: ['移动日报', '错误反馈', '写入恢复'],
    changes: [
      { type: 'improvement', description: '移动日报的保存、提交、加载和只读核实遇到网络或浏览器技术异常时显示中文操作提示；未知写入结果仍锁定编辑与重复保存。' },
    ],
  },
  {
    version: '9.6.63',
    date: '2026-10-28',
    title: '创作资料本机恢复按钮尺寸统一',
    impactScope: ['创作资料', '本机草稿恢复', '触屏操作'],
    changes: [
      { type: 'improvement', description: '创作资料面板的本机草稿恢复/核实操作恢复共享按钮 40px 最小高度，避免紧凑样式压缩点击区域。' },
    ],
  },
  {
    version: '9.6.62',
    date: '2026-10-28',
    title: '公告板触屏删除操作可见性',
    impactScope: ['首页公告板', '移动端触屏', '操作可达性'],
    changes: [
      { type: 'improvement', description: '首页公告板移动端删除操作常显并扩大到 40×40px；桌面仍在悬停或键盘聚焦时显示。' },
    ],
  },
  {
    version: '9.6.61',
    date: '2026-10-28',
    title: '资料删除核实错误提示去技术化',
    impactScope: ['资料中心', '资料删除', '错误反馈'],
    changes: [
      { type: 'improvement', description: '资料详情删除请求与只读状态核实连续断网时显示中文处理提示；保留可读业务原因、写入锁定和显式只读重试，不重复发送删除。' },
    ],
  },
  {
    version: '9.6.60',
    date: '2026-10-28',
    title: '知识库、公告与成就错误提示去技术化',
    impactScope: ['知识库', '系统公告', '成就系统', '错误反馈'],
    changes: [
      { type: 'improvement', description: '知识库分类、公告列表及成就检查/初始化遇到网络或浏览器技术异常时显示中文处理提示，保留业务原因及原有重试与核实。' },
    ],
  },
  {
    version: '9.6.59',
    date: '2026-10-28',
    title: '备份管理技术错误提示去技术化',
    impactScope: ['备份管理', '错误反馈'],
    changes: [
      { type: 'improvement', description: '备份清单读取和备份下载遇到网络或浏览器技术异常时显示中文处理提示，保留业务原因、只读重载与备份结果核实流程。' },
    ],
  },
  {
    version: '9.6.58',
    date: '2026-10-28',
    title: '公开意见、番茄钟与导出错误提示去技术化',
    impactScope: ['公开意见', '专注排行', '数据导出', '错误反馈'],
    changes: [
      { type: 'improvement', description: '公开意见、番茄钟排行榜和数据导出遇到网络或浏览器异常时显示中文处理提示，保留业务原因和原有重试反馈。' },
    ],
  },
  {
    version: '9.6.57',
    date: '2026-10-28',
    title: '模板、匿名意见与日历错误提示去技术化',
    impactScope: ['模板管理', '匿名意见管理', '日历', '错误反馈'],
    changes: [
      { type: 'improvement', description: '模板、匿名意见和日历遇到网络或浏览器异常时显示中文操作提示，保留业务原因及现有权限、结果核实和防重复流程。' },
    ],
  },
  {
    version: '9.6.56',
    date: '2026-10-28',
    title: '资料归档与灵感流程错误提示去技术化',
    impactScope: ['资源归档', '灵感管理', '错误反馈'],
    changes: [
      { type: 'improvement', description: '资料归档与灵感读取、删除和转选题核实遇到不可读技术错误时显示中文提示，保留业务原因及原有结果核实保护。' },
    ],
  },
  {
    version: '9.6.55',
    date: '2026-10-28',
    title: '用户与权限管理错误提示去技术化',
    impactScope: ['用户管理', '操作日志', '权限管理', '错误反馈'],
    changes: [
      { type: 'improvement', description: '用户/角色列表、创建、更新和核实遇到不可读技术错误时显示中文提示，保留权限边界、请求恢复及可读业务原因。' },
    ],
  },
  {
    version: '9.6.54',
    date: '2026-10-28',
    title: '工作台与活动日志错误提示去技术化',
    impactScope: ['工作台', '活动日志', '错误反馈'],
    changes: [
      { type: 'improvement', description: '工作台摘要、最近变化和活动日志遇到技术错误时显示中文重试提示，保留业务原因和失败/空数据状态区分。' },
    ],
  },
  {
    version: '9.6.53',
    date: '2026-10-28',
    title: '消息中心错误提示去技术化',
    impactScope: ['消息中心', '错误反馈'],
    changes: [
      { type: 'improvement', description: '消息读取、已读和清空核实遇到技术错误时显示中文提示，保留账号隔离、请求编号和只读核实流程。' },
    ],
  },
  {
    version: '9.6.52',
    date: '2026-10-28',
    title: '创作列表恢复提示去技术化',
    impactScope: ['创作管理', '错误反馈'],
    changes: [
      { type: 'improvement', description: '创作创建、更新和结果核实遇到技术错误时显示中文处理提示，保留可读业务原因及请求结果核实流程。' },
    ],
  },
  {
    version: '9.6.51',
    date: '2026-10-28',
    title: '看板与资料操作错误提示去技术化',
    impactScope: ['选题看板', '选题资料', '创作资料', '错误反馈'],
    changes: [
      { type: 'improvement', description: '看板、资料关联/维度与创作资料操作遇到网络或技术错误时显示中文处理提示，保留业务原因和现有恢复逻辑。' },
    ],
  },
  {
    version: '9.6.50',
    date: '2026-10-28',
    title: '选题操作错误提示去技术化',
    impactScope: ['选题管理', '选题详情', '选题资料', '错误反馈'],
    changes: [
      { type: 'improvement', description: '选题读取、审核、删除、阶段推进、保存和资料维度操作遇到技术错误时显示中文处理提示；保持原有结果核实与防重复规则。' },
    ],
  },
  {
    version: '9.6.49',
    date: '2026-10-28',
    title: '工作流与日报错误提示去技术化',
    impactScope: ['成片制作', '发布管理', '创作详情', '日报', '错误反馈'],
    changes: [
      { type: 'improvement', description: '拍摄、发布、创作和日报操作遇到断网或系统异常时改用中文处理提示；保留可读的业务原因与原有结果核实流程。' },
    ],
  },
  {
    version: '9.6.48',
    date: '2026-10-28',
    title: '复盘错误提示去技术化',
    impactScope: ['复盘中心', '复盘详情', '错误反馈'],
    changes: [
      { type: 'improvement', description: '复盘操作对网络或技术异常显示中文重试提示，保留可读业务校验原因与冲突提示。' },
    ],
  },
  {
    version: '9.6.47',
    date: '2026-10-28',
    title: '设置错误提示去技术化',
    impactScope: ['通知设置', '系统设置', '错误反馈'],
    changes: [
      { type: 'improvement', description: '通知与系统设置遇到技术性错误时改用具体操作的中文提示，并保留可读的中文业务原因。' },
    ],
  },
  {
    version: '9.6.46',
    date: '2026-10-28',
    title: '桌面消息统计首读状态',
    impactScope: ['桌面消息', '统计状态', '辅助技术'],
    changes: [
      { type: 'improvement', description: '桌面消息统计首读时显示加载中，失败后显示暂不可用；未知统计不再误报为零。' },
    ],
  },
  {
    version: '9.6.45',
    date: '2026-10-28',
    title: '选题维度待确认写入恢复',
    impactScope: ['选题详情', '内容维度', '写入恢复'],
    changes: [
      { type: 'improvement', description: '选题维度写入前持久化账号与选题范围的恢复标记；刷新后只读核实，不会自动重放。' },
    ],
  },
  {
    version: '9.6.44',
    date: '2026-10-28',
    title: '移动消息首读状态提示',
    impactScope: ['移动消息', '辅助技术'],
    changes: [
      { type: 'improvement', description: '消息首读期间显示未读数正在读取，失败后才显示不可用提示。' },
    ],
  },
  {
    version: '9.6.43',
    date: '2026-10-28',
    title: '创作资料本机草稿恢复',
    impactScope: ['创作资料', '本机恢复'],
    changes: [
      { type: 'improvement', description: '按账号和生产记录保留未完成资料修改，先核对服务端基线，明确恢复后才保存，并发变化时不自动覆盖。' },
    ],
  },
  {
    version: '9.6.42',
    date: '2026-10-28',
    title: '移动消息列表刷新忙碌状态',
    impactScope: ['移动消息', '可访问性'],
    changes: [
      { type: 'improvement', description: '手动刷新消息列表期间，按钮明确报告读取状态并禁用重复刷新。' },
    ],
  },
  {
    version: '9.6.41',
    date: '2026-10-28',
    title: '移动单条消息操作忙碌状态',
    impactScope: ['移动消息', '可访问性'],
    changes: [
      { type: 'improvement', description: '单条标记已读期间，目标消息卡片明确报告忙碌状态并保持禁用。' },
    ],
  },
  {
    version: '9.6.40',
    date: '2026-10-28',
    title: '移动单条消息只读核实忙碌状态',
    impactScope: ['移动消息', '可访问性'],
    changes: [
      { type: 'improvement', description: '单条已读状态只读核实进行中时，按钮明确报告忙碌状态并禁用重复查询。' },
    ],
  },
  {
    version: '9.6.39',
    date: '2026-10-28',
    title: '移动消息只读核实忙碌状态',
    impactScope: ['移动消息', '可访问性'],
    changes: [
      { type: 'improvement', description: '只读核实进行中时，按钮明确报告忙碌状态并保持禁用；查询失败后恢复只读重试。' },
    ],
  },
  {
    version: '9.6.38',
    date: '2026-10-28',
    title: '移动消息批量已读忙碌状态',
    impactScope: ['移动消息', '可访问性'],
    changes: [
      { type: 'improvement', description: '批量已读请求进行中时，操作按钮明确报告忙碌状态并保持禁用。' },
    ],
  },
  {
    version: '9.6.37',
    date: '2026-10-28',
    title: '移动端选题审核区域关联',
    impactScope: ['移动端选题', '可访问性'],
    changes: [
      { type: 'improvement', description: '审核展开按钮关联到有名称的审核区域；收起时保留当前选择和审核意见。' },
    ],
  },
  {
    version: '9.6.36',
    date: '2026-10-28',
    title: '角色权限模块辅助关系与触控尺寸',
    impactScope: ['角色权限', '可访问性'],
    changes: [
      { type: 'improvement', description: '权限模块折叠状态关联到对应权限列表；全选与折叠按钮使用统一样式和至少 40px 触控高度。' },
    ],
  },
  {
    version: '9.6.35',
    date: '2026-10-28',
    title: '通知偏好开关辅助状态完善',
    impactScope: ['通知偏好', '可访问性'],
    changes: [
      { type: 'improvement', description: '通知开关名称说明事件和渠道，并通过按下状态报告是否启用。' },
    ],
  },
  {
    version: '9.6.34',
    date: '2026-10-28',
    title: '创作资料草稿离页保护',
    impactScope: ['创作管理', '操作可靠性'],
    changes: [
      { type: 'fix', description: '未保存的资料本地修改会拦截站内离开；用户可复制文字、继续编辑，或明确放弃后离开，切换历史版本也会先受保护。' },
    ],
  },
  {
    version: '9.6.33',
    date: '2026-10-28',
    title: '创作资料草稿保存恢复完善',
    impactScope: ['创作管理', '操作可靠性'],
    changes: [
      { type: 'fix', description: '保存结果不明时先只读核实；确认未提交后才允许显式重试，并发或核实失败时保留本地编辑并锁定写入。' },
    ],
  },
  {
    version: '9.6.32',
    date: '2026-10-28',
    title: '角色权限模块键盘操作完善',
    impactScope: ['角色权限', '可访问性'],
    changes: [
      { type: 'improvement', description: '权限模块折叠按钮报告展开状态并支持键盘操作，折叠不清除已有权限选择。' },
    ],
  },
  {
    version: '9.6.31',
    date: '2026-10-28',
    title: '公告表单展开状态提示完善',
    impactScope: ['公告板', '可访问性'],
    changes: [
      { type: 'improvement', description: '公告表单的添加与关闭按钮会向辅助技术报告表单当前展开状态。' },
    ],
  },
  {
    version: '9.6.30',
    date: '2026-10-28',
    title: '复盘发布与归档结果核实完善',
    impactScope: ['复盘', '操作可靠性'],
    changes: [
      { type: 'fix', description: '发布或归档结果不明时先只读核实服务器状态；只在确认未完成且用户再次确认后重试。' },
    ],
  },
  {
    version: '9.6.29',
    date: '2026-10-28',
    title: '知识库分类展开状态提示完善',
    impactScope: ['知识库', '可访问性'],
    changes: [
      { type: 'improvement', description: '分类树展开/收起按钮会报告当前状态，收起时隐藏子分类。' },
    ],
  },
  {
    version: '9.6.28',
    date: '2026-10-28',
    title: '手机首页任务列表展开状态提示完善',
    impactScope: ['移动端首页', '可访问性'],
    changes: [
      { type: 'improvement', description: '优先任务的展开和收起操作会向辅助技术报告状态，并关联被控制的任务列表。' },
    ],
  },
  {
    version: '9.6.27',
    date: '2026-10-28',
    title: '稿件编辑器菜单状态提示完善',
    impactScope: ['稿件编辑', '目录导航', '可访问性'],
    changes: [
      { type: 'improvement', description: '目录、颜色选择、标题、导出和浮动插入等菜单会向辅助技术报告展开状态。' },
    ],
  },
  {
    version: '9.6.26',
    date: '2026-10-28',
    title: '密码显示与展开状态提示完善',
    impactScope: ['系统设置', '登录', '移动端', '可访问性'],
    changes: [
      { type: 'improvement', description: '密码显示按钮会说明对应字段及当前状态；更新说明折叠区会报告展开状态。' },
      { type: 'improvement', description: '系统设置中的密码输入框与字段名称建立关联，便于读屏识别。' },
    ],
  },
  {
    version: '9.6.25',
    date: '2026-10-28',
    title: '选题预览模式辅助语义完善',
    impactScope: ['选题管理', '可访问性'],
    changes: [
      { type: 'improvement', description: '新建选题页的预览和编辑模式切换向辅助技术暴露当前所选模式。' },
    ],
  },
  {
    version: '9.6.24',
    date: '2026-10-28',
    title: '反馈恢复与展开状态提示完善',
    impactScope: ['创作建议', '移动端', '工作台', '创作管理', '可访问性'],
    changes: [
      { type: 'fix', description: '创作建议反馈结果不明时先只读核实，避免误报失败或自动重复提交。' },
      { type: 'improvement', description: '桌面与移动页面的折叠区域向辅助技术报告展开状态。' },
    ],
  },
  {
    version: '9.6.23',
    date: '2026-10-28',
    title: '折叠区域状态辅助语义完善',
    impactScope: ['工作台', '创作管理', '可访问性'],
    changes: [
      { type: 'improvement', description: '桌面首页最近变化和创作详情版本历史报告展开状态，并随折叠操作同步。' },
    ],
  },
  {
    version: '9.6.22',
    date: '2026-10-28',
    title: '多页面切换选中状态完善',
    impactScope: ['日报', '移动消息', '创作管理', '可访问性'],
    changes: [
      { type: 'improvement', description: '日报视图、移动消息筛选与创作详情版本切换向辅助技术暴露当前选中状态。' },
    ],
  },
  {
    version: '9.6.21',
    date: '2026-10-28',
    title: '视图切换选中状态完善',
    impactScope: ['系统设置', '成就', '人员管理', '资源归档', '可访问性'],
    changes: [
      { type: 'improvement', description: '设置分类、成就状态筛选、人员管理视图和归档信息视图向辅助技术暴露当前选中状态。' },
    ],
  },
  {
    version: '9.6.20',
    date: '2026-10-28',
    title: '写入结果恢复与页签状态完善',
    impactScope: ['审批流', '模板管理', '报告中心', '可访问性'],
    changes: [
      { type: 'improvement', description: '审批流模板删除响应不明时只读核实当前状态，核实失败则保持锁定且不自动重发。' },
      { type: 'improvement', description: '报告中心页签暴露读屏选中状态；选题模板首读失败时提供重新加载操作。' },
    ],
  },
  {
    version: '9.6.19',
    date: '2026-10-28',
    title: '分页加载状态说明补齐',
    impactScope: ['移动首页', '作品库', '消息', '可访问性'],
    changes: [
      { type: 'improvement', description: '移动进行中选题、创作历史、创作者作品和消息分页显示明确的加载范围，并在读取期间暴露忙碌状态。' },
    ],
  },
  {
    version: '9.6.18',
    date: '2026-10-28',
    title: '日报首次创建并发保护',
    impactScope: ['日报', '写入一致性'],
    changes: [
      { type: 'fix', description: '桌面和移动端创建日报草稿时以版本 0 声明预期记录不存在，避免安全重试覆盖另一标签页并发创建的日报。' },
    ],
  },
  {
    version: '9.6.17',
    date: '2026-10-28',
    title: '加载状态读屏播报补齐',
    impactScope: ['日报', '移动创作', '番茄钟', '辅助技术'],
    changes: [
      { type: 'improvement', description: '桌面日报、移动稿件详情、番茄排行榜和创作批注列表的加载过程提供礼貌、原子的读屏状态。' },
    ],
  },
  {
    version: '9.6.16',
    date: '2026-10-28',
    title: '移动日报加载状态读屏播报',
    impactScope: ['移动端', '日报', '辅助技术'],
    changes: [
      { type: 'improvement', description: '移动端日报初次读取和重试期间提供明确、礼貌的读屏加载状态。' },
    ],
  },
  {
    version: '9.6.15',
    date: '2026-10-28',
    title: '移动日报草稿结果恢复',
    impactScope: ['移动端', '日报', '写入恢复'],
    changes: [
      { type: 'fix', description: '移动日报保存结果不明时通过只读内容与版本核对恢复；仅在确认服务器仍为原状态后提供同载荷显式重试，并锁定冲突写入。' },
    ],
  },
  {
    version: '9.6.14',
    date: '2026-10-28',
    title: '创作者图表主题语义色',
    impactScope: ['数据趋势', '作品复盘', 'Studio 主题'],
    changes: [
      { type: 'improvement', description: '创作者趋势和作品复盘曲线统一改用 Studio 语义色彩令牌，浅色与深色主题采用对应的指标颜色。' },
    ],
  },
  {
    version: '9.6.13',
    date: '2026-10-28',
    title: '创作者趋势图表读屏名称',
    impactScope: ['数据趋势', '作品复盘', '辅助技术'],
    changes: [
      { type: 'improvement', description: '为创作者趋势和作品复盘中的每张曲线图提供对应指标名称及数据点数量，读屏时可以区分图表。' },
    ],
  },
  {
    version: '9.6.12',
    date: '2026-10-28',
    title: '复盘与创作者数据读取反馈',
    impactScope: ['内容复盘', '作品库', '数据趋势', '辅助技术'],
    changes: [
      { type: 'improvement', description: '个人行动项与日报风险加载期间增加礼貌状态播报，刷新按钮明确表示忙碌。' },
      { type: 'improvement', description: '生成指标快照和重新读取创作者作品数据时播报处理状态；按钮忙碌期间禁用，装饰图标遵循减少动态效果设置。' },
    ],
  },
  {
    version: '9.6.11',
    date: '2026-10-28',
    title: '复盘列表加载读屏状态',
    impactScope: ['内容复盘', '复盘列表', '辅助技术'],
    changes: [
      { type: 'improvement', description: '复盘列表首读提供礼貌状态播报，刷新按钮明确表示忙碌并在读取期间锁定。' },
      { type: 'improvement', description: '复盘刷新图标对读屏隐藏，并尊重减少动态效果设置。' },
    ],
  },
  {
    version: '9.6.10',
    date: '2026-10-28',
    title: '内容动态读取反馈',
    impactScope: ['内容动态', '辅助技术', '响应反馈'],
    changes: [
      { type: 'improvement', description: '内容动态首读和刷新期间提供明确的礼貌状态播报，并禁用重复读取操作。' },
      { type: 'improvement', description: '读取状态图标对读屏隐藏，并遵循减少动态效果设置。' },
    ],
  },
  {
    version: '9.6.9',
    date: '2026-10-28',
    title: '首屏加载读屏提示',
    impactScope: ['工作台', '选题与发布', '权限管理', '备份', '辅助技术'],
    changes: [
      { type: 'improvement', description: '工作台、成就、权限、看板、选题详情、发布详情和备份列表的首次读取增加具体、礼貌的加载提示。' },
      { type: 'improvement', description: '首页、选题、创作和公告骨架读取期间说明当前状态，Studio 骨架标记为装饰并隐藏于辅助技术。' },
    ],
  },
  {
    version: '9.6.8',
    date: '2026-10-28',
    title: '周报加载读屏播报',
    impactScope: ['报告中心', '周报生成', '辅助技术'],
    changes: [
      { type: 'improvement', description: '周报首次读取和重试期间会礼貌播报加载状态，spinner 作为装饰不重复朗读。' },
      { type: 'improvement', description: '周报隔离回归覆盖挂起读取、加载状态呈现、读取恢复与状态消失。' },
    ],
  },
  {
    version: '9.6.7',
    date: '2026-10-28',
    title: '共用加载状态读屏播报',
    impactScope: ['匿名意见管理', '意见列表', '创作者数据', '辅助技术'],
    changes: [
      { type: 'improvement', description: '共用 table、inline、page、section 加载状态统一提供礼貌状态播报和单次完整提示；骨架屏、旋转图标作为装饰对读屏隐藏。' },
      { type: 'improvement', description: '新增四种状态的语义合同测试，并使用隔离页面核对挂起读取与恢复后的真实辅助树状态。' },
    ],
  },
  {
    version: '9.6.6',
    date: '2026-10-28',
    title: '活动日志加载提示与消息状态防缓存',
    impactScope: ['活动日志', '消息结果核实', '辅助功能'],
    changes: [
      { type: 'improvement', description: '活动日志读取期间通过礼貌状态播报“正在加载活动日志…”，装饰性旋转图标不重复朗读。' },
      { type: 'fix', description: '批量已读和清空状态查询在登录前后都不会被缓存，并补齐相关使用规则说明。' },
    ],
  },
  {
    version: '9.6.5',
    date: '2026-10-28',
    title: '协作编辑保存核验与资料面板修复',
    impactScope: ['桌面稿件编辑', '手机稿件编辑', '创作资料', '编辑器无障碍'],
    changes: [
      { type: 'fix', description: '临时保存或审核锁定不会卸载实时协作文档；状态切换前检查当前编辑器内容是否与已确认保存内容一致，避免提交过期正文。' },
      { type: 'fix', description: '创作资料独立滚动面板中的工具栏贴合面板顶部吸附，不再遮挡首段文字；编辑器颜色子菜单支持在鼠标悬停时按 Escape 收起。' },
    ],
  },
  {
    version: '9.6.4',
    date: '2026-10-28',
    title: '全局搜索弹窗可访问性',
    impactScope: ['全局搜索', '弹窗焦点管理', '浏览器回归'],
    changes: [
      { type: 'fix', description: '全局搜索面板接入统一弹窗生命周期并挂载到页面顶层，在确认弹窗打开时仍可访问；补齐对话框语义、焦点约束和关闭后的焦点恢复。' },
      { type: 'improvement', description: '修正资源删除、发布候选响应和灵感删除恢复的隔离浏览器回归夹具与状态断言。' },
    ],
  },
  {
    version: '9.6.3',
    date: '2026-10-28',
    title: '登录安全状态读屏提示',
    impactScope: ['登录安全升级', '辅助技术'],
    changes: [
      { type: 'improvement', description: '登录安全页的首次读取和手动重新检查状态使用礼貌读屏播报；失败结果以可访问的错误提示呈现，装饰性刷新图标不重复朗读。' },
    ],
  },
  {
    version: '9.6.2',
    date: '2026-10-28',
    title: '作品评分对比度修复',
    impactScope: ['创作者作品库', '辅助可读性'],
    changes: [
      { type: 'fix', description: '桌面作品评分改用满足正文对比度要求的 Studio 语义文字令牌；浏览器回归按桌面表格行与移动卡片分别读取评分。' },
    ],
  },
  {
    version: '9.6.1',
    date: '2026-10-28',
    title: '消息清空账号隔离',
    impactScope: ['桌面消息中心', '消息清空恢复'],
    changes: [
      { type: 'fix', description: '清空消息期间切换账号后，旧账号的迟到响应、确认弹窗、恢复提示和处理中状态均不再覆盖新账号；新账号可以独立处理自己的请求。' },
    ],
  },
  {
    version: '9.6.0',
    date: '2026-10-28',
    title: '消息已读状态恢复',
    impactScope: ['桌面消息中心', '移动消息中心', '消息状态接口'],
    changes: [
      { type: 'fix', description: '标记消息已读后若响应丢失，先只读核实服务器状态；确认已读才继续跳转，避免误报或重复提交。' },
      { type: 'improvement', description: '暂时无法核实的消息会锁定后续未读写入，并提供只读重试；确认仍未读后才允许用户明确重试。' },
    ],
  },
  {
    version: '9.5.0',
    date: '2026-10-28',
    title: '番茄钟恢复与选题读取可靠性',
    impactScope: ['番茄钟', '选题列表与看板', '移动稿件编辑器', '匿名意见恢复说明'],
    changes: [
      { type: 'improvement', description: '重新打开页面时只读恢复当前账号未完成的番茄钟，使用服务端剩余时间，避免重复创建会话。' },
      { type: 'fix', description: '选题列表只显示一次读取错误；看板失败时保留原内容并提供只读重试。' },
      { type: 'fix', description: '批量审核经只读核实确认已生效后按成功计数，避免误报失败并重复执行。' },
      { type: 'fix', description: '选题详情响应格式异常时保持待核实状态和失败项选中，不将无效数据误判为状态变化。' },
      { type: 'improvement', description: '通知卡片文字区域不再挡住下层业务操作，关闭按钮仍可使用。' },
      { type: 'improvement', description: '移动稿件加载状态增加读屏礼貌播报，用户确认听到本轮核对的加载提示。' },
      { type: 'fix', description: '匿名意见旧回执不存在时不再复用旧请求编号；回执按用户规则保留至意见删除。' },
    ],
  },
  {
    version: '9.4.15',
    date: '2026-10-28',
    title: '移动选题筛选与分页一致',
    impactScope: ['移动选题列表'],
    changes: [
      { type: 'improvement', description: '“我的”和“进行中”筛选由服务端在分页和计数前执行，页面总数与实际结果保持一致；“我的”只显示本人创建或负责的选题。' },
      { type: 'fix', description: '状态、搜索和选题筛选共同生效，翻页不会把不符合筛选条件的选题混入结果。' },
      { type: 'fix', description: '选题看板状态徽标使用明暗主题有效的柔和背景令牌，修复状态徽标透明问题。' },
      { type: 'fix', description: '补全 Studio 令牌颜色透明度刻度，修复全站多处透明度类没有生成样式的问题。' },
      { type: 'fix', description: '修复番茄钟颜色在主题切换时无法正确显示的问题，统一使用 Studio 背景颜色。' },
      { type: 'improvement', description: '移动选题筛选结果、页码和空结果现可由读屏识别；看板结果数量也提供状态播报。' },
      { type: 'fix', description: '移动个人资料姓名或邮箱有未保存修改时，离开页面会先确认；取消保留草稿，确认离开不提交。' },
    ],
  },
  {
    version: '9.4.14',
    date: '2026-10-28',
    title: '作品库分页失败提示与恢复',
    impactScope: ['创作者作品库', '作品详情', '移动通知偏好', '移动稿件编辑器'],
    changes: [
      { type: 'fix', description: '作品库下一页读取失败时明确说明失败位置并保留已加载作品；重试继续读取下一页，不再误称为列表刷新失败。' },
      { type: 'improvement', description: '在隔离 Google Chrome 夹具中核对作品列表/详情只读恢复、登录安全重新检查及移动通知和稿件编辑器返回保护。' },
    ],
  },
  {
    version: '9.4.13',
    date: '2026-10-27',
    title: '写入结果核实与离页保护',
    impactScope: ['创作记录', '选题阶段', '系统设置', '个人资料', '移动端偏好'],
    changes: [
      { type: 'improvement', description: '创作记录、选题阶段、系统设置和个人资料遇到响应不确定时先只读核实，不自动重发；未决核实按账号保留，离开页面前明确提示。' },
      { type: 'improvement', description: '桌面与移动通知偏好保留未保存草稿并在离页时提醒；移动端改密结果不明时锁定重复提交，并提示通过重新登录核验。' },
    ],
  },
  {
    version: '9.4.12',
    date: '2026-10-27',
    title: '移动与桌面操作及卡片悬停反馈完善',
    impactScope: ['移动工作中心', '移动选题列表', '移动成片列表', '移动主要操作', '桌面选题创建恢复', '桌面内容动态', 'Creator Center 趋势'],
    changes: [
      { type: 'improvement', description: '移动工作中心、选题与成片列表卡片及主要操作，以及桌面选题创建恢复、内容动态查看和 Creator Center 趋势入口统一使用 Studio 悬停状态；启用减少动态效果时保留颜色反馈并取消位移，业务处理和权限规则保持不变。' },
    ],
  },
  {
    version: '9.4.11',
    date: '2026-10-27',
    title: '编辑器输入改用站内弹窗',
    impactScope: ['桌面编辑器', '链接与图片', '批注'],
    changes: [
      { type: 'improvement', description: '链接和图片地址输入使用 Studio 弹窗；取消保留正文，确认恢复编辑器焦点与原选区。无选区添加批注时显示站内提示。' },
    ],
  },
  {
    version: '9.4.10',
    date: '2026-10-27',
    title: '站内确认统一使用 Studio 弹窗',
    impactScope: ['选题管理', '灵感', '复盘', '桌面与移动编辑器'],
    changes: [
      { type: 'improvement', description: '删除、复盘替换/发布/归档和编辑器离开未保存内容等站内确认统一使用 Studio 弹窗；取消不写入，确认后执行既有操作。' },
    ],
  },
  {
    version: '9.4.9',
    date: '2026-10-27',
    title: '清理旧版创作者数据页面',
    impactScope: ['创作者中心'],
    changes: [
      { type: 'improvement', description: '移除没有路由或文件外引用的旧创作者数据页面；当前创作者中心工作台、作品库和详情入口保持不变。' },
    ],
  },
  {
    version: '9.4.8',
    date: '2026-10-27',
    title: '匿名意见提交结果恢复',
    impactScope: ['匿名意见箱'],
    changes: [
      { type: 'improvement', description: '提交响应中断或刷新后可只读核实匿名意见结果；只有服务器明确未处理时才允许沿用原请求编号人工重试，回执随意见删除。' },
    ],
  },
  {
    version: '9.4.7',
    date: '2026-10-27',
    title: '成员列表失败提示本地化',
    impactScope: ['用户管理'],
    changes: [
      { type: 'improvement', description: '用户管理的成员、角色、日志、写入与结果核实请求在服务端没有具体提示时使用中文错误说明；服务端有具体错误时仍显示原始说明。' },
    ],
  },
  {
    version: '9.4.6',
    date: '2026-10-27',
    title: '移动端选题列表失败重试收敛',
    impactScope: ['移动端选题'],
    changes: [
      { type: 'fix', description: '首次读取时不再用 0 伪装选题数量；读取失败后不自动发送重复 GET，保留错误和显式重试入口，用户点击后再重新读取。' },
    ],
  },
  {
    version: '9.4.5',
    date: '2026-10-27',
    title: '移动首页任务状态反馈修复',
    impactScope: ['移动工作区首页'],
    changes: [
      { type: 'fix', description: '关注事项或待处理消息读取失败且没有可展示任务时，改为说明结果尚未确认；只有相关读取成功后才显示真实空状态。' },
    ],
  },
  {
    version: '9.4.4',
    date: '2026-10-27',
    title: '移动首页加载状态读屏播报完善',
    impactScope: ['移动工作区首页'],
    changes: [
      { type: 'improvement', description: '选题关注读取期间会礼貌播报加载状态，与今日任务和灵感数量保持一致；不改变业务行为。' },
    ],
  },
  {
    version: '9.4.3',
    date: '2026-10-27',
    title: '移动首页辅助功能验收稳定性修复',
    impactScope: ['移动工作区本地验收'],
    changes: [
      { type: 'fix', description: '本地验收期间，移动首页的重复数据读取会一起等待明确放行，避免加载提示提前消失；不改变产品页面或业务行为。' },
    ],
  },
  {
    version: '9.4.2',
    date: '2026-10-26',
    title: '移动端验收连接稳定性修复',
    impactScope: ['移动工作区本地验收'],
    changes: [
      { type: 'fix', description: '移动工作区的本地验收环境现使用协议正确的实时连接，不再因测试连接反复重连而干扰加载状态检查；不改变产品页面、业务数据或权限。' },
    ],
  },
  {
    version: '9.4.1',
    date: '2026-10-26',
    title: '通知偏好保存结果安全核实',
    impactScope: ['系统通知设置', '移动端通知设置'],
    changes: [
      { type: 'fix', description: '通知设置保存遇到网络中断或服务异常时，会先只读核实服务器结果；确认已保存后提示成功，不会自动重复提交。' },
      { type: 'security', description: '服务器设置与本地草稿不一致时保留草稿并锁定编辑，用户可载入服务器设置或明确确认覆盖；核实不可用时仅开放只读重试。' },
    ],
  },
  {
    version: '9.4.0',
    date: '2026-10-26',
    title: '备份恢复与内容洞察体验完善',
    impactScope: ['备份管理', '系统设置', '内容洞察', '报表口径'],
    changes: [
      { type: 'fix', description: '备份创建遇到响应丢失时先只读核实；确认未找到后才允许用户使用原请求编号明确重试，避免重复备份。' },
      { type: 'security', description: '结果状态按当前操作者隔离并禁止缓存；处理中或无法核实期间锁定新的备份创建。旧客户端仍可不带请求编号创建。' },
      { type: 'improvement', description: '内容洞察的协作文档选择框提供辅助名称，移动端影响力表格可完整滚动查看“判断”列，桌面端列完整显示。' },
      { type: 'improvement', description: '团队日报首读期间提供可访问的加载播报；仅在成功读取后才显示真实空状态。' },
      { type: 'improvement', description: '缺失或无效官方周期文件时，日报、周报、月报发布数回退窗口均按北京时间包含报告当天；有效官方日报仍采用平台“昨天”文件窗口。' },
      { type: 'security', description: '更新存在风险的生产组件，并改进接口说明生成方式；生产环境依赖安全检查未发现漏洞。' },
    ],
  },
  {
    version: '9.3.70',
    date: '2026-10-26',
    title: '移动端加载状态播报完善',
    impactScope: ['移动首页', '移动选题'],
    changes: [
      { type: 'improvement', description: '移动首页今日任务、灵感摘要和选题列表首读提示提供礼貌播报状态，数据加载完成后自动消失。' },
    ],
  },
  {
    version: '9.3.69',
    date: '2026-10-26',
    title: '移动消息状态与作品详情操作完善',
    impactScope: ['移动消息中心', '创作者作品详情', '抖音报告口径'],
    changes: [
      { type: 'improvement', description: '移动消息首次读取时明确提供可被辅助技术感知的加载状态。' },
      { type: 'fix', description: '创作者作品详情封面在窄屏按内容宽度收缩，避免页面横向溢出；“返回作品库”入口在错误与正常状态均至少高 40px。' },
      { type: 'improvement', description: '确认缺失或无效官方周期文件时，日报、周报、月报回退窗口均包含报告当天；有效官方日报仍遵循平台“昨天”文件。' },
    ],
  },
  {
    version: '9.3.68',
    date: '2026-10-26',
    title: '写入结果恢复与可访问性完善',
    impactScope: ['选题/资料/模板写入', '匿名意见管理', '月报与年报', '日历与编辑器', '抖音报告'],
    changes: [
      { type: 'fix', description: '审批流模板、资料分类、匿名意见管理状态/回复、旧选题模板和月/年报摘要在写入结果不明时先只读核实，仅确认未处理后才允许以同一请求编号和原内容显式重试。' },
      { type: 'security', description: '新增 SAFE_EXPAND 迁移 061–065，为上述写入保存操作者隔离的幂等回执；月/年报并发冲突保留本地草稿，不覆盖服务器新版本。' },
      { type: 'improvement', description: '日历有事件日期提供日期、事件类型和标题描述；编辑器上下文菜单支持 Shift+F10、Context Menu 键以及键盘焦点导航。' },
      { type: 'fix', description: '无有效官方抖音周期文件时，日报/周报/月报发布数使用包含报告当天的北京时间自然日 1/7/30 日回退窗口；完整官方日报仍按“昨天”窗口统计。' },
    ],
  },
  {
    version: '9.3.67',
    date: '2026-10-24',
    title: '桌面消息批量已读安全恢复',
    impactScope: ['桌面消息中心', '请求结果恢复', '账号隔离'],
    changes: [
      { type: 'fix', description: '桌面全部已读写入前保存账号和请求编号；结果不明时只读核实，明确未处理后才允许同编号显式重试。' },
      { type: 'security', description: '刷新后恢复已处理回执而不重复写入；账号切换隔离迟到结果和错误提示，提交后到达的新消息保持未读。' },
    ],
  },
  {
    version: '9.3.66',
    date: '2026-10-24',
    title: '选题覆盖摘要与报告日期口径',
    impactScope: ['选题内容资产', '抖音分析报告', '日历排期', '公告管理'],
    changes: [
      { type: 'improvement', description: '主题资产按当前可见选题汇总城市、人物、项目的明确登记数；按选题去重，不代表完整率或质量评分。' },
      { type: 'fix', description: '缺失或无效抖音官方周期文件时，发布作品数仍按日报昨天、周报含当天 7 日、月报含当天 30 日的北京时间自然日计算。' },
      { type: 'fix', description: '抖音作品身份去重解析无时区发布时间时采用共享北京时间规则，结果不再随运行机器时区变化。' },
      { type: 'security', description: '公告删除结果不明时只读核实并跨刷新保留写锁，不自动重发 DELETE。' },
      { type: 'improvement', description: '日历会议与“其他”采用不同语义色，并新增六类事件的双主题静态对比度契约。' },
    ],
  },
  {
    version: '9.3.65',
    date: '2026-10-24',
    title: '稿件引用与写入结果恢复',
    impactScope: ['主题内容资产', '选题阶段交接', '成片剧本', '日历语义颜色'],
    changes: [
      { type: 'improvement', description: '主题资产卡片展示当前正式稿件中明确引用的可访问资料，并保持去重和资料可见范围。' },
      { type: 'fix', description: '开始创作遇到不确定阶段推进结果时先只读核实；未确认前不重复推进或创建稿件。' },
      { type: 'fix', description: '成片剧本版本保存结果不明时只读核对详情和版本历史，保留未提交草稿并避免重复建版。' },
      { type: 'security', description: '主题资产维度写入结果不确定时只读核实，恢复锁跨筛选和刷新保留，不会自动重发。' },
      { type: 'improvement', description: '新增日历事件浅/深主题语义令牌对比度契约测试。' },
    ],
  },
  {
    version: '9.3.64',
    date: '2026-10-24',
    title: '复盘表单宽度与发布关联范围收口',
    impactScope: ['内容复盘', '抖音发布关联', '权限边界'],
    changes: [
      { type: 'fix', description: '复盘行动项表单根据实际可用宽度自适应排布，避免窄栏内输入框被压缩。' },
      { type: 'security', description: '抖音批量关联服务要求显式声明全库或逐条可编辑范围，避免漏传范围时扩大关联对象。' },
    ],
  },
  {
    version: '9.3.63',
    date: '2026-10-24',
    title: '全站主操作悬停反馈',
    impactScope: ['内容实验室', '选题管理', '公告与通用状态', '主题视觉反馈'],
    changes: [
      { type: 'improvement', description: '11 个主操作统一使用 Studio 主按钮悬停反馈；内容实验室五项完成了双主题浏览器核验，其余六项沿用同一令牌样式。' },
    ],
  },
  {
    version: '9.3.62',
    date: '2026-10-24',
    title: '日历月份读屏播报与原生缩放复核',
    impactScope: ['排期日历', '无障碍', '创作编辑器'],
    changes: [
      { type: 'improvement', description: '切换排期月份后会礼貌播报新的月份名称，跨年时同步更新年份。' },
      { type: 'improvement', description: '创作详情页的编辑器工具弹层在 Chrome 原生放大显示时留在内容区内。' },
    ],
  },
  {
    version: '9.3.61',
    date: '2026-10-24',
    title: '日报审核只读与移动恢复验收',
    impactScope: ['日报审核', '移动工作台', '消息恢复', '成片制作'],
    changes: [
      { type: 'improvement', description: '已提交日报在审核完成前保持只读，避免误改或重复提交。' },
      { type: 'fix', description: '成片制作状态经只读核实后，用户明确重新确认时清除过期核实提示。' },
      { type: 'improvement', description: '移动浏览器全流程在 320px 与 390px 验收通过，覆盖消息恢复、账号隔离和主题内容资产。' },
    ],
  },
  {
    version: '9.3.60',
    date: '2026-10-24',
    title: '回执保留只读盘点',
    impactScope: ['幂等回执', '运维核查', '数据安全'],
    changes: [
      { type: 'improvement', description: '新增显式指定本地数据库的只读盘点工具，汇总回执数量和原始时间范围，不显示请求键或业务内容。' },
      { type: 'security', description: '未获得延迟重试期限与统一时间口径证据前，不启用自动删除或保留期假设。' },
    ],
  },
  {
    version: '9.3.59',
    date: '2026-10-24',
    title: '复盘结论安全更新与恢复',
    impactScope: ['复盘结论', '并发编辑', '结果恢复', '日报风险联动'],
    changes: [
      { type: 'security', description: '复盘标题与结论更新使用操作者/复盘隔离回执和稳定版本比较；结果不明时只读核实，避免重复写入。' },
      { type: 'fix', description: '只有确认未处理时才可用原编号显式重试；并发冲突保留草稿和服务器当前值，本地恢复标记写入失败可重试修复。' },
      { type: 'improvement', description: '日报风险转行动项在失败时保留表单、确认重试后清空，并为控件提供稳定可访问名称。' },
      { type: 'improvement', description: '新增 SAFE_EXPAND 迁移 057，仅在隔离临时数据库验证；回执暂未配置自动清理。' },
    ],
  },
  {
    version: '9.3.58',
    date: '2026-10-24',
    title: '复盘行动项并发安全更新',
    impactScope: ['复盘行动项', '并发编辑', '结果恢复', '数据库迁移'],
    changes: [
      { type: 'security', description: '更新使用操作者隔离请求回执和整行并发比较；旧客户端继续兼容，过期并发写入改为返回冲突而不覆盖新内容。' },
      { type: 'fix', description: '响应不明时只读核实；确认冲突后保留本地草稿和服务器最新值，用户显式确认后以新请求保存。' },
      { type: 'improvement', description: '新增 SAFE_EXPAND 迁移 055、056；仅在隔离数据库验证，回执尚无自动清理策略。' },
    ],
  },
  {
    version: '9.3.57',
    date: '2026-10-24',
    title: '移动改密表单可访问性',
    impactScope: ['移动端账号安全', '表单可访问性'],
    changes: [
      { type: 'improvement', description: '当前密码和新密码字段增加持续可见的关联标签，读屏用户可准确识别输入项。' },
      { type: 'fix', description: '改密回归按可访问名称定位字段，继续覆盖无效输入不请求及失败后显式重试。' },
    ],
  },
  {
    version: '9.3.56',
    date: '2026-10-24',
    title: '内容流程与统计边界持续改进',
    impactScope: ['成片制作', '内容资产', 'Creator Analytics', '日报', '创作只读权限'],
    changes: [
      { type: 'improvement', description: '成片制作入口保留选题上下文，主题资产展示当前账号可访问的关联资料。' },
      { type: 'fix', description: 'Creator Analytics 使用北京时间自然日窗口并排除未来数据；缺少粉丝基线时保持未知。' },
      { type: 'security', description: '日报草稿结果不明时只读核实并锁定重写；只读创作正文展示真实原因并隐藏写入入口。' },
    ],
  },
  {
    version: '9.3.55',
    date: '2026-10-24',
    title: '灵感点赞结果安全恢复',
    impactScope: ['灵感点赞', '请求结果恢复', '数据库迁移'],
    changes: [
      { type: 'security', description: '点赞/取消点赞新增操作者隔离的请求编号与目标状态；同编号重放不再重复切换，旧客户端仍兼容。' },
      { type: 'fix', description: '响应不确定或刷新后可只读核实；明确未提交时沿用原编号安全重试，并隔离账号切换后的迟到回包。' },
      { type: 'improvement', description: '新增 SAFE_EXPAND 迁移 054；回执暂不自动清理，避免延迟重试再次执行。' },
    ],
  },
  {
    version: '9.3.54',
    date: '2026-10-24',
    title: 'Creator Agent 绑定凭据响应恢复',
    impactScope: ['Creator Agent 绑定', '凭据安全恢复', '设备重绑'],
    changes: [
      { type: 'security', description: '绑定结果还需通过随机恢复凭据核验；仅凭申请编号无法取回凭据，绑定和确认结果不会被缓存。' },
      { type: 'fix', description: '提交后若确认信息未送达，可通过原申请找回凭据；已有设备会保留旧凭据，直到新版本安全保存并确认新凭据。' },
      { type: 'improvement', description: '桌面端会在发送前安全保存重试所需信息，并在本机保存成功后清除绑定码和恢复记录。' },
    ],
  },
  {
    version: '9.3.53',
    date: '2026-10-24',
    title: 'Creator Agent 绑定码安全恢复',
    impactScope: ['Creator Agent 绑定', '结果不确定恢复', '账号隔离'],
    changes: [
      { type: 'security', description: '绑定码创建支持按操作者、账号与规范化请求编号幂等恢复，专用加密密钥缺失或不匹配时拒绝服务。' },
      { type: 'fix', description: '响应丢失或刷新后可找回同一有效绑定码；会话标记不保存绑定码，并隔离不同账号的迟到响应。' },
      { type: 'improvement', description: '绑定码使用后的注册与元数据写入在同一事务完成；过期或消费后的恢复密文被清除。' },
    ],
  },
  {
    version: '9.3.52',
    date: '2026-10-23',
    title: '移动创作列表分页',
    impactScope: ['移动 Web 创作管理', '列表性能', '账号数据隔离'],
    changes: [
      { type: 'improvement', description: '移动创作列表每页最多读取 20 条稿件，并显示当前页码和总数。' },
      { type: 'fix', description: '切换账号时回到第一页并丢弃旧账号迟到回包；分页读取失败时保留上次成功内容并支持重试。' },
      { type: 'fix', description: '稿件总数缩减导致末页失效时，在同一读取流程内校正页码；校正失败保留与旧页码对应的内容，避免重复请求。' },
      { type: 'improvement', description: '复用现有服务端权限范围与分页接口，不改变稿件写入或授权规则。' },
    ],
  },
  {
    version: '9.3.51',
    date: '2026-10-23',
    title: '稿件批注状态安全恢复',
    impactScope: ['稿件批注与建议', '状态处理恢复', '数据库迁移'],
    changes: [
      { type: 'security', description: '批注/建议状态更新加入操作者隔离的幂等请求回执，并维持现有权限检查。' },
      { type: 'fix', description: '响应不确定时先只读核实，接受建议恢复仅重试状态写入，避免重复应用正文替换。' },
      { type: 'improvement', description: '新增 SAFE_EXPAND 迁移 051，兼容未携带请求编号的旧客户端。' },
    ],
  },
  {
    version: '9.3.50',
    date: '2026-10-23',
    title: '活动日志动作对比度矩阵',
    impactScope: ['活动日志', '明暗主题', '可访问性回归'],
    changes: [
      { type: 'improvement', description: '活动日志自动回归覆盖创建、更新、删除、登录、发布、审核、状态变更及未知动作在浅色和深色主题下的对比度。' },
      { type: 'fix', description: '按实际渲染文字色和复合背景测量全部徽标均达到 4.5:1；现有颜色令牌无需调整。' },
    ],
  },
  {
    version: '9.3.49',
    date: '2026-10-23',
    title: '稿件批注与建议创建安全恢复',
    impactScope: ['稿件批注与建议', '创建结果恢复', '数据库迁移'],
    changes: [
      { type: 'security', description: '批注与建议创建使用操作者、稿件和载荷指纹绑定的请求编号；线程与结果账本同事务提交，旧客户端继续兼容。' },
      { type: 'fix', description: '创建结果不明时先只读核实；只有确认未找到才允许沿用相同编号和原载荷显式重试，避免重复线程。' },
      { type: 'improvement', description: '新增 SAFE_EXPAND 迁移 050 及并发、权限隔离、状态查询和事务回滚回归。' },
    ],
  },
  {
    version: '9.3.48',
    date: '2026-10-23',
    title: '界面动效默认轻量',
    impactScope: ['视觉外观', '动效性能', '预设配置'],
    changes: [
      { type: 'improvement', description: '首次使用和恢复默认时关闭装饰背景与额外动效，减少页面资源占用。' },
      { type: 'fix', description: '命名视觉预设显式保留原有组件与页面应用范围，已有本地保存的用户偏好继续兼容。' },
    ],
  },
  {
    version: '9.3.47',
    date: '2026-10-23',
    title: '稿件批注回复安全恢复',
    impactScope: ['稿件批注与建议', '回复恢复', '数据库迁移'],
    changes: [
      { type: 'security', description: '批注回复使用操作者、稿件、线程和内容指纹绑定的请求编号；回复和结果账本原子提交，旧客户端继续兼容。' },
      { type: 'fix', description: '回复结果不明时先只读核实；只有确认未找到才允许沿用相同编号和原内容显式重试，避免重复回复。' },
      { type: 'improvement', description: '新增 SAFE_EXPAND 迁移 049 及并发、权限隔离、状态查询和事务回滚回归。' },
    ],
  },
  {
    version: '9.3.46',
    date: '2026-10-23',
    title: '改密安全恢复与工作流窄屏操作',
    impactScope: ['账号安全', '工作流设计器', '工作流运维文档'],
    changes: [
      { type: 'security', description: '改密请求结果不明时锁定表单、清空密码并阻止自动重放；只有确定拒绝才允许用户修正后重试。' },
      { type: 'improvement', description: '工作流设计器的常用节点操作统一触控目标，并补充窄屏、键盘操作回归。' },
      { type: 'improvement', description: '补充 strict 工作流运行模式、只读诊断边界及安全回退操作手册。' },
    ],
  },
  {
    version: '9.3.45',
    date: '2026-10-23',
    title: '交互语义、主题对比与创建安全恢复',
    impactScope: ['审批流设计', '灵感池', '拍摄与发布详情', '复盘行动项', '公告板'],
    changes: [
      { type: 'improvement', description: '审批流模板和节点删除入口达到 40×40px，窄屏布局保持卡片内可见。' },
      { type: 'improvement', description: '灵感卡片改为文章语义，提供独立、可键盘访问的详情按钮，点赞和评论等动作不再嵌套在按钮角色容器中。' },
      { type: 'fix', description: '拍摄、发布详情的剧本历史读取失败提示采用亮暗主题安全文字色，实测对比度均高于 4.5:1。' },
      { type: 'fix', description: '侧栏登出按钮悬停文字改用主题安全色。' },
      { type: 'security', description: '复盘行动项创建以 SAFE_EXPAND 迁移 047 记录操作者隔离的请求结果；响应不明或刷新后先只读核实，安全重试复用原请求编号和内容。' },
      { type: 'security', description: '公告创建以 SAFE_EXPAND 迁移 048 保存操作者隔离的请求结果；响应不明或刷新后先只读核实，只有明确未创建才允许同编号、同内容显式重试。' },
    ],
  },
  {
    version: '9.3.44',
    date: '2026-10-23',
    title: '首页待办准确性与匿名意见安全删除',
    impactScope: ['首页待办', '复盘日报风险联动', '匿名意见管理'],
    changes: [
      { type: 'fix', description: '已退回选题不再计入逾期或即将到期；匿名意见删除目标被其他操作先行删除时，结果明确为未确认成功并释放写锁。' },
      { type: 'security', description: '匿名意见删除以 SAFE_EXPAND 迁移 046 记录操作者隔离的请求结果；不重复删除，也不把外部删除当作本次成功。' },
      { type: 'improvement', description: '复盘日报风险转行动项补齐辅助名称，并通过独立浏览器页面检查移动布局和恢复提示。' },
    ],
  },
  {
    version: '9.3.43',
    date: '2026-10-23',
    title: '审批流模板创建安全恢复',
    impactScope: ['审批流设计', '模板创建', '安全恢复'],
    changes: [
      { type: 'fix', description: '创建结果不明或刷新后先按账号只读核实；确认未创建后才能复用相同编号和原内容安全重试。' },
      { type: 'security', description: '服务端以事务账本保证同编号幂等，已删除模板不会因恢复重建；旧客户端仍兼容。' },
      { type: 'improvement', description: '补充重复申请和小窗口显示检查，确保结果一致且关键内容完整可见。' },
    ],
  },
  {
    version: '9.3.42',
    date: '2026-10-23',
    title: '移动消息安全恢复与账号隔离',
    impactScope: ['移动消息中心', '消息恢复', '活动日志', 'CreatorReports'],
    changes: [
      { type: 'fix', description: '全部标记已读遇到响应不确定时可以只读核实并安全恢复；同一请求不会误改后来到达的消息。' },
      { type: 'security', description: '账号切换后旧的单条已读回包不会覆盖新账号的消息、未读状态、提示或导航。' },
      { type: 'improvement', description: '活动日志成员筛选器补齐辅助技术名称，CreatorReports 删除入口达到移动触控尺寸要求。' },
    ],
  },
  {
    version: '9.3.41',
    date: '2026-10-23',
    title: '全局选区可读性与复盘安全恢复',
    impactScope: ['全站文字选区', '日历', '数据复盘', '失败恢复'],
    changes: [
      { type: 'improvement', description: '普通文字、表格和编辑器的选区在明暗主题下都使用清晰、达到对比度要求的颜色。' },
      { type: 'fix', description: '复盘创建响应不明或刷新后先核实结果，再以原请求编号安全恢复，避免重复创建。' },
      { type: 'improvement', description: '日历月视图在常见桌面宽度下完整显示七个日期列。' },
    ],
  },
  {
    version: '9.3.40',
    date: '2026-10-23',
    title: '抖音关联留痕与界面可访问性改进',
    impactScope: ['发布管理', '日报归档', '移动端可读性', '弹窗键盘访问'],
    changes: [
      { type: 'feature', description: '抖音作品关联新增、更换和解除后可追溯；重复设置同一关系不增加历史记录。' },
      { type: 'improvement', description: '日报归档、选题审核和灵感详情弹层补齐键盘焦点管理与背景隔离。' },
      { type: 'fix', description: '移动创作和草稿存储错误提示在浅色、深色主题下均保持清晰可读。' },
    ],
  },
  {
    version: '9.3.39',
    date: '2026-10-23',
    title: '消息清空结果安全恢复',
    impactScope: ['消息中心', '请求幂等', '失败恢复'],
    changes: [
      { type: 'fix', description: '清空结果不明时先按当前操作者只读核实，避免刷新或重试误删后来到达的消息。' },
      { type: 'security', description: '同一请求编号的重放返回原清空结果，旧版不带编号的客户端仍兼容。' },
    ],
  },
  {
    version: '9.3.38',
    date: '2026-10-22',
    title: '编辑器工具栏颜色菜单文字对比度',
    impactScope: ['创作详情', '编辑器工具栏', '主题可读性'],
    changes: [
      { type: 'improvement', description: '文字颜色与高亮颜色菜单标题统一使用 Studio 次级文字令牌，不再靠透明度降低字色。' },
      { type: 'fix', description: '亮色和暗色主题的菜单标题均增加实际渲染对比度回归。' },
    ],
  },
  {
    version: '9.3.37',
    date: '2026-10-22',
    title: '人员创建撤权后的只读恢复',
    impactScope: ['人员管理', '权限边界', '安全重试'],
    changes: [
      { type: 'fix', description: '人员创建结果不确定时，即使创建权限被撤销，仍可按操作者和请求编号只读核实。' },
      { type: 'security', description: '无创建权限时保留恢复标记并锁定写入；401/403 不会被误判为原请求未提交。' },
    ],
  },
  {
    version: '9.3.36',
    date: '2026-10-22',
    title: 'Chrome 高缩放下编辑器菜单安全定位',
    impactScope: ['创作详情', '编辑器工具栏', '响应式适配'],
    changes: [
      { type: 'fix', description: '编辑器下拉根据工具栏列边界定位，避免原生 Chrome 高缩放时文字和高亮色板被左侧导航覆盖。' },
      { type: 'improvement', description: '回归测试现在检查工具栏列边界及文字色板色块的实际指针命中。' },
    ],
  },
  {
    version: '9.3.35',
    date: '2026-10-22',
    title: '人员启停恢复与弹窗可访问性',
    impactScope: ['人员管理', '请求恢复', '会话安全', '弹窗可访问性'],
    changes: [
      { type: 'fix', description: '人员启停结果不确定时按原请求只读核实；未找到时只有编辑权限仍有效才可复用同一编号显式重试，不推断当前状态就是原请求结果。' },
      { type: 'security', description: '启用字段严格接受布尔值，堵住畸形值绕过自禁用保护；并发删除已被其他操作移除的账号时，确认本次请求未执行后再清理界面。' },
      { type: 'improvement', description: '共享弹窗统一处理初始焦点、Tab 焦点圈定、关闭后焦点恢复、嵌套弹窗与背景隔离。' },
    ],
  },
  {
    version: '9.3.34',
    date: '2026-10-22',
    title: '人员删除结果安全核实',
    impactScope: ['人员管理', '用户删除', '结果核实'],
    changes: [
      { type: 'fix', description: '用户删除提交后若响应丢失，可按操作者与目标账号只读核实；未找到时复用同一请求编号安全重试，避免重复删除或重复记日志。' },
    ],
  },
  {
    version: '9.3.33',
    date: '2026-10-22',
    title: '人员资料刷新后安全恢复',
    impactScope: ['人员管理', '用户更新', '结果核实'],
    changes: [
      { type: 'fix', description: '人员资料更新结果不确定后刷新，可按操作者和目标用户只读核实；未找到时用同一请求编号安全重试，密码不保存在浏览器恢复记录中。' },
    ],
  },
  {
    version: '9.3.32',
    date: '2026-10-22',
    title: '人员创建刷新后安全恢复',
    impactScope: ['人员管理', '用户创建', '结果核实'],
    changes: [
      { type: 'fix', description: '人员创建遇到响应不确定后刷新页面，可用只读状态核实找回结果；未创建时保留同一请求编号，仅要求重新输入密码再安全重试，密码不会写入浏览器恢复记录。' },
    ],
  },
  {
    version: '9.3.31',
    date: '2026-10-22',
    title: '人员创建安全重试',
    impactScope: ['人员管理', '用户创建', '活动日志'],
    changes: [
      { type: 'fix', description: '人员创建结果不确定时锁定原表单，用同一请求键安全重试；已提交的创建不会重复生成账号、分配角色或写入日志，密码不进入重放记录。' },
    ],
  },
  {
    version: '9.3.30',
    date: '2026-10-22',
    title: '人员资料安全重试',
    impactScope: ['人员管理', '用户更新', '会话安全', '活动日志'],
    changes: [
      { type: 'fix', description: '人员编辑结果不确定时锁定原表单，用同一请求键安全重试；已提交的更新不会重复改密、改角色情况下再次撤销会话或重复记日志，密码不进入重放记录。' },
      { type: 'security', description: '逐条抖音批量关联继续限制在创建人、负责人或发布操作人可编辑的记录范围内；范围外数据不写入、不计入结果。' },
    ],
  },
  {
    version: '9.3.29',
    date: '2026-10-22',
    title: '选题操作触控区域',
    impactScope: ['选题管理', '窄屏触控', 'Studio 设计系统'],
    changes: [
      { type: 'improvement', description: '选题列表、看板及共享分页的主要操作统一达到至少 40×40px；手机分页保留前后翻页和相邻页入口。' },
    ],
  },
  {
    version: '9.3.28',
    date: '2026-10-22',
    title: '资料库列表触控区域',
    impactScope: ['资料中心', '窄屏触控', 'Studio 设计系统'],
    changes: [
      { type: 'improvement', description: '资料库列表查看、编辑、删除与翻页操作以及共享对话框关闭按钮均达到至少 40×40px Studio 点击区；资料操作及权限规则保持不变。' },
    ],
  },
  {
    version: '9.3.27',
    date: '2026-10-22',
    title: '番茄钟控件触控区域',
    impactScope: ['番茄钟', '窄屏触控', '错误恢复'],
    changes: [
      { type: 'improvement', description: '番茄钟完整页与紧凑卡片中的重置、统计重试和完成记录重试操作均有至少 40×40px Studio 命中区，排行榜在移动固定底栏上方可滚动触达。' },
    ],
  },
  {
    version: '9.3.26',
    date: '2026-10-22',
    title: '番茄钟移动导航收敛',
    impactScope: ['番茄钟', '移动导航'],
    changes: [
      { type: 'improvement', description: '窄屏番茄钟不再重复显示移动壳层已有的“返回首页”；桌面端原入口保留。' },
    ],
  },
  {
    version: '9.3.25',
    date: '2026-10-22',
    title: '创作子状态输入校验',
    impactScope: ['创作管理', '工作流数据完整性'],
    changes: [
      { type: 'fix', description: '审批模板保存、阶段先后判断及工作流状态输入统一遵循共享状态机与合法枚举，非法载荷不会写入工作流记录或阶段历史。' },
    ],
  },
  {
    version: '9.3.24',
    date: '2026-10-22',
    title: '窄屏页面动画安全可见',
    impactScope: ['数据复盘', '窄屏兼容', '页面动效可访问性'],
    changes: [
      { type: 'fix', description: '页面入场动画无法调度时仍先保持内容可见；窄屏桌面布局与真实移动壳层分别回归。' },
    ],
  },
  {
    version: '9.3.23',
    date: '2026-10-22',
    title: '选题阶段转换规则收敛为共享真源',
    impactScope: ['选题阶段', '审批流', '工作流状态一致性'],
    changes: [
      { type: 'improvement', description: '选题手动推进与严格审批策略共用同一状态转换矩阵，非法跳级和未知阶段不能写入；不改现有合法流转或历史记录。' },
    ],
  },
  {
    version: '9.3.22',
    date: '2026-10-22',
    title: '人员管理操作触控目标优化',
    impactScope: ['人员管理', '移动端触控', 'Studio 设计系统'],
    changes: [
      { type: 'improvement', description: '用户列表的启用/禁用、编辑与删除操作现在至少达到 40×40px，窄屏固定操作列仍可直接点按。' },
    ],
  },
  {
    version: '9.3.21',
    date: '2026-10-22',
    title: '复盘中心筛选与操作触控优化',
    impactScope: ['数据复盘', '移动端触控', '无障碍名称', 'Studio 设计系统'],
    changes: [
      { type: 'improvement', description: '复盘筛选字段补充读屏名称并达到至少 40px 高；列表标题详情入口对短标题也保持至少 40px 点击区。筛选条件先编辑后统一应用，单次应用仅读取一次，迟到的旧结果不会覆盖最新筛选。' },
      { type: 'improvement', description: '复盘行动项详情抽屉统一使用 Studio 输入控件，单行字段至少 40px，说明和处理结果保留足够的可编辑空间。' },
      { type: 'improvement', description: '公共顶部栏的消息中心、主题切换、导航菜单与窄屏侧栏关闭按钮统一达到 40×40px Studio 触控目标。' },
    ],
  },
  {
    version: '9.3.20',
    date: '2026-10-22',
    title: '复盘行动项表单触控尺寸优化',
    impactScope: ['数据复盘', '日报风险联动', '移动端触控', 'Studio 设计系统'],
    changes: [
      { type: 'improvement', description: '复盘行动项创建、表格状态选择及日报风险联动字段统一达到至少 40px 高，并复用 Studio 输入控件；不改变保存和权限规则。' },
    ],
  },
  {
    version: '9.3.19',
    date: '2026-10-22',
    title: '数据复盘触控与视口验收',
    impactScope: ['数据复盘筛选', '移动端触控', '浏览器回归'],
    changes: [
      { type: 'improvement', description: '年/月/选题筛选最小尺寸达到 40×40px，移动端定位选题筛选时避开固定底栏。' },
      { type: 'fix', description: '修正数据复盘视口矩阵的执行顺序：先确认统计读取恢复，再检查完整数据页，避免把失败态按预期隐藏的热力图误报为缺陷。' },
    ],
  },
  {
    version: '9.3.18',
    date: '2026-10-22',
    title: '移动操作触控尺寸优化',
    impactScope: ['移动我的页面', '移动选题详情', 'Studio 设计系统'],
    changes: [
      { type: 'improvement', description: '字号选项和关联资料读取失败后的重试操作均至少达到 40×40px；保持字号保存、资料读取和既有权限行为。' },
    ],
  },
  {
    version: '9.3.17',
    date: '2026-10-22',
    title: '内容操作触控尺寸优化',
    impactScope: ['发布管理', '创作管理', '灵感池', 'Studio 设计系统', '移动端'],
    changes: [
      { type: 'improvement', description: '发布与创作管理列表、灵感卡片的主要操作统一提升至至少 40×40px Studio 控件；窄屏仍可达，固定列保持可用。' },
    ],
  },
  {
    version: '9.3.16',
    date: '2026-10-22',
    title: '选题操作触控尺寸优化',
    impactScope: ['选题管理', 'Studio 设计系统'],
    changes: [
      { type: 'improvement', description: '桌面选题列表“查看/删除”图标入口使用共享 Studio 按钮，尺寸从 32×32px 提升至 40×40px；保持原有操作语义和权限规则。' },
    ],
  },
  {
    version: '9.3.15',
    date: '2026-10-22',
    title: '工作流详情手机触控优化',
    impactScope: ['创作详情', '拍摄详情', '发布详情', '编辑器', '移动端'],
    changes: [
      { type: 'improvement', description: '创作/拍摄/发布详情的返回、关联与历史入口，以及拍摄信息栏、发布来源稿和编辑器复制全文操作均至少达到 40px 高度，手机上更容易触控。' },
    ],
  },
  {
    version: '9.3.14',
    date: '2026-10-21',
    title: '平台名称统一展示',
    impactScope: ['发布管理', '选题管理', '工作台', '周报与资料中心'],
    changes: [
      { type: 'fix', description: '已知平台标识统一显示为易识别的平台名称，覆盖发布/选题/看板/任务/周报/资料视图，保留自定义平台名称。' },
    ],
  },
  {
    version: '9.3.13',
    date: '2026-10-21',
    title: '活动日志移动布局与触控优化',
    impactScope: ['活动日志', '移动端'],
    changes: [
      { type: 'improvement', description: '窄屏标题和成员筛选分层显示，记录时间信息不再挤压正文；筛选、分页及只读恢复操作统一达到 40px 触控高度。' },
    ],
  },
  {
    version: '9.3.12',
    date: '2026-10-21',
    title: '内容动态手机触控优化',
    impactScope: ['内容动态', '移动端'],
    changes: [
      { type: 'improvement', description: '文档选择框、“查看”和只读重试操作提升到 40px 高，方便手机触控。' },
    ],
  },
  {
    version: '9.3.11',
    date: '2026-10-21',
    title: '移动端资料中心返回路径修复',
    impactScope: ['移动端', '资料中心导航'],
    changes: [
      { type: 'fix', description: '从资料中心打开资料库子页后，顶栏标题保持“资料中心”，返回操作回到资料中心总览，不再误返首页。' },
    ],
  },
  {
    version: '9.3.10',
    date: '2026-10-21',
    title: '资料中心总览响应式与键盘验收',
    impactScope: ['资料中心', '浏览器验收'],
    changes: [
      { type: 'improvement', description: '隔离浏览器回归覆盖桌面与窄屏、浅色与深色主题、卡片边界、可见键盘焦点、四类资料库导航及桌面侧栏选中态，不改变产品行为。' },
    ],
  },
  {
    version: '9.3.9',
    date: '2026-10-21',
    title: '手动保存确认时机修复',
    impactScope: ['编辑器', '发布管理'],
    changes: [
      { type: 'fix', description: '手动保存等待异步回调完成并取得确认；Meta/Ctrl+S 始终使用当前最新稿，失败或未确认时不提前显示保存成功。' },
    ],
  },
  {
    version: '9.3.8',
    date: '2026-10-21',
    title: '选题详情读取状态区分修复',
    impactScope: ['选题详情', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '桌面及移动详情读取暂时失败时不再误报选题不存在或残留上一条内容；提供不泄漏服务端错误内容的只读重试，404 仍单独说明记录不可访问。' },
    ],
  },
  {
    version: '9.3.7',
    date: '2026-10-21',
    title: '修复窄屏编辑器选区工具栏裁切',
    impactScope: ['编辑器', '移动端适配'],
    changes: [
      { type: 'fix', description: '选中文字后的工具栏在窄屏自动换行，文字颜色与高亮面板完整留在视口内，操作按钮和色块更适合触控；关联选题与目标字数输入具有稳定字段名。' },
    ],
  },
  {
    version: '9.3.6',
    date: '2026-10-21',
    title: '登录主题验收入口完善',
    impactScope: ['登录页面', '测试验收'],
    changes: [
      { type: 'improvement', description: '登录主题测试新增本机合成夹具服务模式，在自动化浏览器启动受限时仍可使用已连接的浏览器工具检查主题、窄屏和首次改密键盘操作。' },
    ],
  },
  {
    version: '9.3.5',
    date: '2026-10-21',
    title: '手机选题筛选完整显示',
    impactScope: ['移动网页选题', '窄屏适配', '可访问性'],
    changes: [
      { type: 'fix', description: '移动端选题筛选项在窄屏自动换行，五种筛选方式都能完整看到和点击；筛选结果与地址栏行为保持不变。' },
    ],
  },
  {
    version: '9.3.4',
    date: '2026-10-21',
    title: '编辑器状态与无障碍提示修复',
    impactScope: ['创作管理', '选题管理', '可访问性'],
    changes: [
      { type: 'fix', description: '关闭“查找替换”后焦点返回打开面板前的按钮；通过快捷键打开时返回正文，避免键盘焦点丢失且不改动稿件内容。' },
      { type: 'fix', description: '协作空闲时显示无人正在编辑的说明，避免与已同步状态同时出现“系统正在同步”。' },
      { type: 'fix', description: '选题管理空结果和读取失败提示按页面标题层级呈现；共享空态的其他调用保持原有默认层级。' },
    ],
  },
  {
    version: '9.3.3',
    date: '2026-10-21',
    title: '移动首页关注事项完整展开',
    impactScope: ['移动网页首页', '今日任务', '团队选题关注'],
    changes: [
      { type: 'fix', description: '移动首页将完整的关注选题预览交给任务排序；默认显示三项、展开最多六项，避免第 4–6 条关注事项被提前隐藏。' },
    ],
  },
  {
    version: '9.3.2',
    date: '2026-10-21',
    title: '移动选题保存结果安全恢复',
    impactScope: ['移动网页选题', '内容保存', '防止覆盖并发修改'],
    changes: [
      { type: 'fix', description: '移动选题标题/说明保存遇到响应不明时先只读核实；已保存不重发，读回失败会锁定写入并在重开页面后恢复核实，并发变化时展示服务端内容并要求用户明确选择。' },
    ],
  },
  {
    version: '9.3.1',
    date: '2026-10-21',
    title: '移动创作写入结果安全恢复',
    impactScope: ['移动网页创作', '保存与审核', '防止重复写入'],
    changes: [
      { type: 'fix', description: '已有稿件保存或审核结果不明时先只读核实；已应用不重发，读回失败则保留正文并暂停后续写入，刷新后只读恢复，仍为原状态时仅允许用户明确重试。' },
    ],
  },
  {
    version: '9.3.0',
    date: '2026-10-21',
    title: '移动创作新建结果安全恢复',
    impactScope: ['移动网页创作', '结果核实', '防止重复创建'],
    changes: [
      { type: 'fix', description: '移动端新建稿件响应不明时以同一请求编号只读核实；已创建不重发，未创建仅允许用户明确确认后安全重试，读回失败会保留正文并暂停新建。' },
    ],
  },
  {
    version: '9.2.99',
    date: '2026-10-21',
    title: '移动选题操作结果安全核实',
    impactScope: ['移动选题看板', '选题详情审核', '阶段推进'],
    changes: [
      { type: 'fix', description: '移动网页审核或状态推进响应不明确时先只读核实；已生效不重发，仍为原状态时要求用户明确重试，读回失败则锁定相关状态操作。' },
    ],
  },
  {
    version: '9.2.98',
    date: '2026-10-21',
    title: '选题审核与看板状态结果安全核实',
    impactScope: ['选题批量审核', '选题看板', '防止重复操作'],
    changes: [
      { type: 'fix', description: '审核或状态更新响应不明时先只读读取服务器当前记录；不自动重发，读取失败会锁住该条记录的后续写入。' },
    ],
  },
  {
    version: '9.2.97',
    date: '2026-10-21',
    title: '选题审核结果安全核实',
    impactScope: ['选题审核', '结果恢复', '防止重复操作'],
    changes: [
      { type: 'fix', description: '审核响应不明确时只读核实服务端状态；已生效不重发，仍待审时仅由用户明确重试，核实失败则锁定审核操作。' },
    ],
  },
  {
    version: '9.2.96',
    date: '2026-10-21',
    title: '选题删除结果安全核实',
    impactScope: ['选题管理', '删除结果反馈', '防止重复操作'],
    changes: [
      { type: 'fix', description: '删除响应不明确时先只读核实同一条记录；状态未确认前锁定该记录，明确仍存在后才恢复用户可控重试。' },
    ],
  },
  {
    version: '9.2.95',
    date: '2026-10-21',
    title: '灵感删除结果安全核实',
    impactScope: ['灵感库', '删除结果反馈', '防止重复操作'],
    changes: [
      { type: 'fix', description: '删除响应不明确时先只读核实；状态未确认前暂停再次删除，明确仍存在后才恢复用户可控重试。' },
    ],
  },
  {
    version: '9.2.94',
    date: '2026-10-21',
    title: '资料详情可读性回归',
    impactScope: ['资料详情', '主题对比度', '窄屏布局'],
    changes: [
      { type: 'improvement', description: '增加资料详情普通文字明暗主题与窄屏对比度回归，保障 Studio 令牌调整后页面可读性。' },
    ],
  },
  {
    version: '9.2.93',
    date: '2026-10-21',
    title: '日历创建结果安全核实',
    impactScope: ['排期日历', '创建幂等', '结果恢复'],
    changes: [
      { type: 'fix', description: '日历创建响应不明确时先核实原请求，已创建不重发；暂未找到时仅支持同编号显式重试。' },
      { type: 'feature', description: '新增账号范围的创建请求账本和 SAFE_EXPAND 迁移 038，旧客户端保持兼容。' },
    ],
  },
  {
    version: '9.2.92',
    date: '2026-10-20',
    title: '深色弱化文字对比度优化',
    impactScope: ['Studio 设计令牌', '侧栏', '创作详情', '可读性'],
    changes: [
      { type: 'improvement', description: '提升深色主题弱化文字对比度，并增加令牌表面及创作详情双主题回归。' },
    ],
  },
  {
    version: '9.2.91',
    date: '2026-10-20',
    title: '成就文字可读性优化',
    impactScope: ['成就系统', '明暗主题', '可读性'],
    changes: [
      { type: 'improvement', description: '积分摘要、统计标签、进度与日期、排行榜和空状态普通文字统一使用 Studio 次级文字令牌。' },
    ],
  },
  {
    version: '9.2.90',
    date: '2026-10-20',
    title: '日历文字对比度优化',
    impactScope: ['排期日历', '明暗主题', '可读性'],
    changes: [
      { type: 'improvement', description: '周标题、跨月日期、事件计数和溢出提示改用 Studio 次级文字令牌，提高明暗主题下的对比度。' },
    ],
  },
  {
    version: '9.2.89',
    date: '2026-10-20',
    title: '创作新建结果安全核实',
    impactScope: ['创作管理', '新建结果恢复', '重复创建保护'],
    changes: [
      { type: 'fix', description: '创作记录新建响应不明确时按原请求编号只读核实；已创建不重发，尚未创建时只用同一编号安全重试。' },
      { type: 'improvement', description: '核实失败时暂停创作列表其它写入并支持刷新后只读恢复，避免重复创建。' },
    ],
  },
  {
    version: '9.2.88',
    date: '2026-10-20',
    title: '创作删除结果安全核实',
    impactScope: ['创作管理', '删除结果恢复', '重复删除保护'],
    changes: [
      { type: 'fix', description: '创作删除响应不明确时只读核实记录是否存在；已删除不重发，记录未变化时仅允许用户明确确认后重试。' },
      { type: 'improvement', description: '核实读取失败时锁定当前稿件写入，并在刷新后继续只读恢复。' },
    ],
  },
  {
    version: '9.2.87',
    date: '2026-10-20',
    title: '创作版本保存结果安全核实',
    impactScope: ['创作管理', '版本保存', '重复建版保护'],
    changes: [
      { type: 'fix', description: '小修保存或另开新版响应不明确时只读核实服务器版本和正文；已建版不会重复创建，未建版只在用户明确确认后重试。' },
      { type: 'improvement', description: '首次核实失败时锁定创作写入并支持刷新后继续只读恢复。' },
    ],
  },
  {
    version: '9.2.86',
    date: '2026-10-20',
    title: '创作详情状态写入安全核实',
    impactScope: ['创作管理', '审核提交恢复', '状态写入保护'],
    changes: [
      { type: 'fix', description: '提交审核或状态更新响应不明确时只读核实服务器状态和正文；已生效不重发，仍为原状态时仅在用户明确确认后重试。' },
      { type: 'improvement', description: '核实失败时保留账号/稿件限定恢复标记并锁定后续写入；刷新后继续只读恢复，操作前确认正文已保存。' },
    ],
  },
  {
    version: '9.2.85',
    date: '2026-10-20',
    title: '成片详情状态更新安全核实',
    impactScope: ['成片制作', '状态更新恢复', '剧本写入保护'],
    changes: [
      { type: 'fix', description: '成片详情状态更新响应不明确时只读核实；确认已生效不重发，仍为原状态时仅在用户明确确认后重试，服务器状态变化时采用最新读回结果。' },
      { type: 'improvement', description: '状态未确认期间锁定剧本、版本与归档写入；状态操作前先确认剧本自动保存完成，刷新后支持只读恢复。' },
    ],
  },
  {
    version: '9.2.84',
    date: '2026-10-20',
    title: '制作计划创建防重复与安全恢复',
    impactScope: ['成片制作', '创建恢复', '请求幂等'],
    changes: [
      { type: 'fix', description: '创建响应不明确时先只读核实，未创建后复用同一请求编号安全重试；状态暂不可读时暂停本页写入并支持刷新恢复。' },
      { type: 'security', description: '新增创建者范围内的服务端原子幂等账本与删除墓碑，防止重放产生重复制作计划。' },
    ],
  },
  {
    version: '9.2.83',
    date: '2026-10-20',
    title: '制作计划完成状态安全核实',
    impactScope: ['成片制作', '完成操作恢复', '操作反馈'],
    changes: [
      { type: 'fix', description: '完成响应不明确时只读核实制作计划状态；确认已完成不重发，状态暂不可读时暂停本页写入并允许安全恢复。' },
    ],
  },
  {
    version: '9.2.82',
    date: '2026-10-20',
    title: '制作计划删除状态安全核实',
    impactScope: ['成片制作', '删除恢复', '操作反馈'],
    changes: [
      { type: 'fix', description: '删除响应不明确时只读核实制作计划是否仍存在；确认已删除不重发，状态不可读时暂停本页写入并允许安全恢复。' },
      { type: 'improvement', description: '制作计划删除操作增加可访问名称，便于辅助技术识别具体记录。' },
    ],
  },
  {
    version: '9.2.81',
    date: '2026-10-20',
    title: '抖音自动同步关联范围收敛',
    impactScope: ['Creator Agent 同步', '发布管理', '逐条编辑权限'],
    changes: [
      { type: 'fix', description: '旧格式与标准协议同步后的自动关联均按账号所属用户的逐条编辑范围处理；范围外发布稿件不关联、不推进选题状态。' },
    ],
  },
  {
    version: '9.2.80',
    date: '2026-10-20',
    title: '编辑器剪贴板结果反馈',
    impactScope: ['创作编辑器', '复制与粘贴', '操作反馈'],
    changes: [
      { type: 'improvement', description: '编辑器右键菜单的复制、剪切和粘贴操作现在会说明是否成功；浏览器拒绝访问剪贴板时给出可行的替代操作。' },
      { type: 'fix', description: '剪贴板操作失败不再静默关闭菜单，避免用户误以为正文或剪贴板已更新。' },
    ],
  },
  {
    version: '9.2.79',
    date: '2026-10-20',
    title: '抖音关联范围与命令面板键盘恢复',
    impactScope: ['发布管理', '全局搜索', '键盘无障碍'],
    changes: [
      { type: 'fix', description: '抖音批量关联遵循逐条编辑范围；全局查看但未创建、负责或参与选题的成员不会写入范围外记录或看到其统计，全局编辑者仍可全量刷新。' },
      { type: 'improvement', description: '命令面板打开时聚焦搜索框，关闭后恢复到打开前的可用控件，支持键盘用户继续原操作。' },
      { type: 'fix', description: '新增键盘回归覆盖上下键边界、Enter 激活日报结果与 Escape 关闭后的焦点恢复。' },
    ],
  },
  {
    version: '9.2.78',
    date: '2026-10-20',
    title: '工作台恢复与发布归档反馈',
    impactScope: ['移动工作台', '抖音关联', '发布归档恢复'],
    changes: [
      { type: 'fix', description: '移动首页复盘摘要读取失败时仍保留复盘阶段，以未知数量明确提示无法确认是否有记录，避免把失败误报为空。' },
      { type: 'improvement', description: '复盘阶段提供单独的只读重试；读取恢复后同步还原计数与预览。' },
      { type: 'fix', description: '抖音自动关联后若发布归档同步失败，明确报告部分完成数量，并引导用户在对应发布详情页重试归档。' },
    ],
  },
  {
    version: '9.2.77',
    date: '2026-10-20',
    title: '抖音关联异常结果安全核实',
    impactScope: ['发布管理', '抖音作品关联', '异常操作恢复'],
    changes: [
      { type: 'fix', description: '手工关联或解除抖音作品时响应不明，先读取发布详情确认实际绑定；已生效不重复写入，未生效才恢复供用户手动重试。' },
      { type: 'improvement', description: '关联状态读取失败时暂停发布页写入，并在刷新后继续只读核实，防止重复关联或误判。' },
    ],
  },
  {
    version: '9.2.76',
    date: '2026-10-20',
    title: '发布详情剧本保存结果安全核实',
    impactScope: ['发布详情', '剧本版本历史', '异常保存恢复'],
    changes: [
      { type: 'fix', description: '发布剧本及显式版本保存结果不明时按记录读取正文与版本历史；确认已保存不会重复创建版本，确认未保存则恢复草稿供用户手动重试。' },
      { type: 'improvement', description: '状态读取失败时将快照保存在当前账号标签会话、锁定编辑写入并在刷新后继续只读核实。' },
    ],
  },
  {
    version: '9.2.75',
    date: '2026-10-20',
    title: '发布记录更新结果核实与日期恢复',
    impactScope: ['发布管理', '更新恢复', '北京时间日期'],
    changes: [
      { type: 'fix', description: '发布记录更新响应不明时先只读对照服务器状态；刷新后继续核实，确认已更新不重发，确认未更新则恢复草稿供用户手动决定。' },
      { type: 'fix', description: '编辑表单从数据库时间戳恢复日期时按北京时间自然日提取，确保日期输入值有效且保留原日期。' },
      { type: 'improvement', description: '官方数据日期窗口继续统一按北京时间自然日计算；昨天取采集日前一日，近 7/30 天包含当天。' },
    ],
  },
  {
    version: '9.2.74',
    date: '2026-10-20',
    title: '发布记录创建幂等与异常恢复',
    impactScope: ['发布管理', '创建恢复', '重复操作保护'],
    changes: [
      { type: 'fix', description: '发布创建请求使用稳定编号和服务端原子账本；相同请求重放返回原记录，删除后的请求墓碑阻止迟到重试复活记录。' },
      { type: 'improvement', description: '创建响应和首次状态读取都异常时暂停发布页写入并保留原请求，刷新后只读核实；确认未创建后仅允许用同一编号安全重试。' },
    ],
  },
  {
    version: '9.2.73',
    date: '2026-10-20',
    title: '发布记录删除结果只读核实',
    impactScope: ['发布管理', '删除恢复', '重复操作保护'],
    changes: [
      { type: 'fix', description: '发布记录删除响应异常时按记录编号只读核实服务端状态；确认仍存在时由用户明确决定是否再次删除。' },
      { type: 'improvement', description: '待核实记录在当前账号标签会话中保存，刷新后继续只读恢复，核实期间暂停发布页面写入。' },
    ],
  },
  {
    version: '9.2.72',
    date: '2026-10-20',
    title: '移动首页快捷操作铺满网格',
    impactScope: ['手机工作台', 'Studio 操作按钮', '响应式布局'],
    changes: [
      { type: 'fix', description: '修复按钮动效外层包装忽略显式全宽要求的问题，移动首页快捷操作现在能填满两列网格。' },
      { type: 'improvement', description: '为 390px 与 320px 手机布局增加快捷操作宽度和横向溢出回归。' },
    ],
  },
  {
    version: '9.2.71',
    date: '2026-10-20',
    title: '角色创建与删除结果安全核实',
    impactScope: ['权限管理', '角色创建', '角色删除', '异常结果恢复'],
    changes: [
      { type: 'fix', description: '角色创建响应异常时暂停全部角色写入，并按唯一角色编码只读核实；刷新后恢复核实状态，不会自动重发。' },
      { type: 'improvement', description: '确认创建未发生后恢复原表单供用户手动重试；发现同编码但资料不一致时展示服务器当前值供明确处理。' },
      { type: 'fix', description: '角色删除响应异常时按角色编号只读核实；确认已删除后更新页面，仍存在时要求用户明确重新发起，避免重复删除。' },
    ],
  },
  {
    version: '9.2.70',
    date: '2026-10-20',
    title: '权限结果核实与剧本历史可读性',
    impactScope: ['权限管理', '拍摄剧本历史', '响应式回归'],
    changes: [
      { type: 'fix', description: '角色更新响应异常时按角色编号只读核实；核实期间暂停所有角色写入，刷新后可继续恢复且不会重复提交。' },
      { type: 'improvement', description: '拍摄剧本版本历史的说明、空状态和版本信息在明暗主题下保持清晰可读。' },
      { type: 'improvement', description: '浏览器缩放检查按实际页面布局尺寸验证响应式效果，避免用样式模拟缩放造成误判。' },
    ],
  },
  {
    version: '9.2.69',
    date: '2026-10-20',
    title: '人员状态安全恢复与阶段停留',
    impactScope: ['人员管理', '工作台内容流', '创作详情响应式验收'],
    changes: [
      { type: 'fix', description: '用户启停响应不明确时先按编号只读核实；状态暂不可读时暂停重复修改，恢复不重发写请求。' },
      { type: 'improvement', description: '首页已通过待开工选题显示可信阶段停留时间；未知时间不推算。' },
      { type: 'improvement', description: '创作评审页面的缩放检查按实际布局尺寸覆盖响应式变化，确保按钮在不同窗口大小下保持可见。' },
    ],
  },
  {
    version: '9.2.68',
    date: '2026-10-20',
    title: '灵感创建防重复恢复',
    impactScope: ['灵感池', '灵感创建', '异常结果恢复'],
    changes: [
      { type: 'fix', description: '灵感创建使用客户端请求编号和服务端事务账本；同一请求重放返回原记录，原记录删除后保留墓碑以阻止迟到重试复活。' },
      { type: 'improvement', description: '创建结果不明时先只读核实，读取失败后暂停再次提交；刷新后恢复原内容并继续核实。' },
      { type: 'improvement', description: '官方日期窗口按北京时间自然日验证，近 7 天和近 30 天包含当天，并覆盖边界与未来日回归。' },
    ],
  },
  {
    version: '9.2.67',
    date: '2026-10-20',
    title: '灵感评论防重复恢复',
    impactScope: ['灵感池', '评论提交', '异常结果恢复'],
    changes: [
      { type: 'fix', description: '评论请求增加唯一编号，重试复用同一编号；服务端已保存但响应丢失时按编号只读核实，避免重复评论。' },
      { type: 'improvement', description: '核实读取暂不可用时暂停再次提交，当前浏览器标签刷新后仍可恢复原评论草稿并继续核实。' },
      { type: 'improvement', description: '评论表采用兼容历史数据的可空唯一索引，重复请求回放原评论且不重复广播。' },
    ],
  },
  {
    version: '9.2.66',
    date: '2026-10-20',
    title: '灵感操作结果核实',
    impactScope: ['灵感池', '转为选题', '操作结果恢复'],
    changes: [
      { type: 'fix', description: '点赞切换和灵感转选题请求异常后只读核实服务器状态，避免响应丢失时重复写入或停留在误报失败。' },
      { type: 'improvement', description: '转化结果已关联选题时直接打开目标；状态无法读取时暂停重复操作并提供只读核实入口。' },
      { type: 'improvement', description: '浏览器回归覆盖点赞/转化已写入但响应丢失、首次状态读取失败及只读恢复。' },
    ],
  },
  {
    version: '9.2.65',
    date: '2026-10-20',
    title: '用户删除后的列表恢复',
    impactScope: ['人员管理'],
    changes: [
      { type: 'fix', description: '用户删除确认成功后刷新当前列表；刷新失败时提供只读重试，避免再次提交删除。' },
    ],
  },
  {
    version: '9.2.64',
    date: '2026-10-20',
    title: '移动首页选题总数',
    impactScope: ['手机工作台', '选题概览'],
    changes: [
      { type: 'improvement', description: '手机工作台单独显示进行中选题总数与最近预览数量，并标明团队或个人范围。' },
      { type: 'improvement', description: '最近选题卡片和查看全部入口使用共享按钮；总数非零但预览缺失时不会误报为空。' },
    ],
  },
  {
    version: '9.2.63',
    date: '2026-10-20',
    title: '桌面审核待办直达',
    impactScope: ['桌面首页', '创作稿件审核', '权限安全边界'],
    changes: [
      { type: 'improvement', description: '桌面首页审核稿件待办直达当前审核动作，并在授权后聚焦“审核通过”；不会因打开任务自动审批。' },
      { type: 'security', description: '只读审核权限与正文编辑能力分开；审批仍遵循服务端权限、当前版本与正文冲突检查。' },
    ],
  },
  {
    version: '9.2.62',
    date: '2026-10-20',
    title: '选题筛选地址状态同步',
    impactScope: ['桌面选题列表/看板', '手机网页选题列表'],
    changes: [
      { type: 'fix', description: '桌面选题筛选变更后同步更新 status 地址参数，清除筛选后刷新仍保持一致。' },
      { type: 'improvement', description: '手机网页选题筛选通过 status/topic_filter 记住当前选择，补充按钮选中状态语义。' },
    ],
  },
  {
    version: '9.2.61',
    date: '2026-10-20',
    title: '工作台创作阶段选题完整性',
    impactScope: ['桌面工作台', '手机网页首页', '选题列表与看板'],
    changes: [
      { type: 'fix', description: '将已通过待开始创作的选题纳入工作台创作阶段数量与预览，并保留其实际状态。' },
      { type: 'improvement', description: '工作台创作阶段入口提供已通过与创作中联合筛选，移动网页和桌面列表/看板均可继续处理。' },
    ],
  },
  {
    version: '9.2.60',
    date: '2026-10-20',
    title: '创作者首页稿件保存状态',
    impactScope: ['桌面首页', '手机网页首页', '创作协作保存状态'],
    changes: [
      { type: 'improvement', description: '桌面首页与手机网页共用稿件保存状态提示，桌面创作者待办可看到最近编辑状态。' },
      { type: 'security', description: '只接受当前账号的明确保存完成事件；协作同步和其他账号事件不会冒充本账号保存成功。' },
      { type: 'fix', description: '状态订阅改为跟随完整编辑事件，连续保存确认即使状态类别相同也能及时刷新。' },
    ],
  },
  {
    version: '9.2.59',
    date: '2026-10-19',
    title: '创作者首页写稿快捷入口',
    impactScope: ['桌面首页', '手机网页首页', '创作新建流程'],
    changes: [
      { type: 'improvement', description: '创作者首页新增“写两句”快捷入口，桌面直达现有新建弹窗，手机网页直达新稿编辑器。' },
      { type: 'security', description: '沿用 production:update 权限；桌面导航参数在权限确认后消费，原生 Android 首页保持不变。' },
      { type: 'improvement', description: '浏览器回归覆盖两端跳转、桌面弹窗和账号切换后的权限收敛。' },
    ],
  },
  {
    version: '9.2.58',
    date: '2026-10-19',
    title: '手机首页稿件审核直达',
    impactScope: ['手机网页首页', '创作稿件审核', '协作保存确认'],
    changes: [
      { type: 'improvement', description: '手机网页首页“待审核稿件”现在直达当前审核页，底部提供“审核通过”操作，并可返回工作台。' },
      { type: 'security', description: '沿用现有生产编辑权限与稿件范围校验；审核前先确认正文同步，离线或保存未确认时不发送审核。待审核状态已变化时页面保持只读，避免误提交。' },
      { type: 'improvement', description: '新增手机工作台待审稿件审批、单次写入和过期任务只读回归。' },
    ],
  },
  {
    version: '9.2.57',
    date: '2026-10-19',
    title: '手机选题审核直达',
    impactScope: ['手机网页选题详情', '首页审核待办', '权限安全'],
    changes: [
      { type: 'fix', description: '手机网页选题详情现识别首页审核待办的直达参数；待审且有审核权限时自动展开审核区，不需要再次点击“开始审核”。' },
      { type: 'security', description: '审核直达参数仅用于打开审核面板并在读取权限/状态后清除，不自动提交；无权限或状态已变化时保持只读详情。' },
      { type: 'improvement', description: '补充手机网页审核直达、参数消费和无权限边界回归。' },
    ],
  },
  {
    version: '9.2.56',
    date: '2026-10-19',
    title: '手机首页灵感快捷入口',
    impactScope: ['手机网页首页', '灵感记录'],
    changes: [
      { type: 'improvement', description: '手机网页首页新增“记灵感”入口，直接打开现有灵感页。' },
      { type: 'improvement', description: '该快捷入口仅用于响应式网页，原生 Android 首页保持不变。' },
    ],
  },
  {
    version: '9.2.55',
    date: '2026-10-19',
    title: '首页公告条与管理入口',
    impactScope: ['首页工作台', '公告管理', '窄屏可用性'],
    changes: [
      { type: 'improvement', description: '首页顶部以紧凑公告条展示置顶或最新公告，保留原公告板展开入口。' },
      { type: 'fix', description: '公告读取失败显示独立重试，不伪装为空；公告管理仍遵循原权限和确认流程。' },
      { type: 'improvement', description: '新增 320px 公告条、展开/收起与只读权限边界回归。' },
      { type: 'improvement', description: '公告条现覆盖响应式手机网页首页；原生 Android 移动首页保持不变。' },
      { type: 'fix', description: '首页卡点任务摘要补充负责人/待认领信息，并提升亮暗主题文字对比度。' },
    ],
  },
  {
    version: '9.2.54',
    date: '2026-10-19',
    title: '工作台播放数据日期口径与可读性',
    impactScope: ['工作台', '抖音运营数据', '明暗主题无障碍'],
    changes: [
      { type: 'improvement', description: '明确工作台近 7 天播放变化按北京时间自然日统计并包含当天。' },
      { type: 'fix', description: '提升工作台播放指标标签和来源说明的明暗主题文字对比度。' },
      { type: 'improvement', description: '增加统计口径说明与亮/暗主题对比度回归断言。' },
    ],
  },
  {
    version: '9.2.53',
    date: '2026-10-19',
    title: '报告中心可读性与标题层级',
    impactScope: ['报告中心', '周报', '数据导出', '明暗主题无障碍'],
    changes: [
      { type: 'fix', description: '修复周报指标标签、成员/平台说明及数据导出格式提示在暗色主题下的低对比问题。' },
      { type: 'fix', description: '修复报告中心周报和数据导出区域的页面标题跳级。' },
      { type: 'improvement', description: '增加报告中心明暗主题普通文案及标题顺序回归断言。' },
    ],
  },
  {
    version: '9.2.52',
    date: '2026-10-19',
    title: '数据复盘文字可读性与标题层级',
    impactScope: ['数据复盘', '协作热力图', '明暗主题无障碍'],
    changes: [
      { type: 'fix', description: '修复数据复盘指标标签、统计说明和协作热力图刻度在暗色主题下的低对比问题。' },
      { type: 'fix', description: '修复数据复盘页面分区标题跳级，统一使用连续的页面标题层级。' },
      { type: 'improvement', description: '增加数据复盘标题顺序及普通说明 Studio 令牌回归断言。' },
    ],
  },
  {
    version: '9.2.51',
    date: '2026-10-19',
    title: '创作者中心文字可读性与无障碍',
    impactScope: ['创作者作品库', '创作者作品详情', '创作者运营概览', '明暗主题无障碍'],
    changes: [
      { type: 'fix', description: '修复创作者中心普通说明在暗色主题下的低对比文字，并提升作品评分在亮色主题下的可读性。' },
      { type: 'fix', description: '修复运营概览资料卡标题层级跳级及“查看作品”按钮名称与可见文案不匹配。' },
      { type: 'improvement', description: '增加创作者中心对比度、窄屏与标题顺序回归覆盖。' },
    ],
  },
  {
    version: '9.2.50',
    date: '2026-10-19',
    title: '创作者趋势页暗色可读性',
    impactScope: ['创作者数据趋势', '周期切换', '明暗主题无障碍'],
    changes: [
      { type: 'fix', description: '修复未选周期按钮、周期合计与趋势状态/来源说明的暗色低对比问题，改用 Studio 次级文字令牌。' },
      { type: 'improvement', description: '趋势页普通文字对比度回归覆盖 1440px、390px 和 320px 明暗主题与不完整周期状态。' },
    ],
  },
  {
    version: '9.2.49',
    date: '2026-10-19',
    title: '创作者报告暗色文字可读性',
    impactScope: ['创作者运营报告', '创作者中心共享说明', '明暗主题无障碍'],
    changes: [
      { type: 'fix', description: '修复创作者报告普通说明、指标标签、日期与状态文案在暗色主题下的低对比问题，采用 Studio 次级文字令牌。' },
      { type: 'improvement', description: '新增普通报告文案在桌面、移动、明暗主题及 320px 窄屏的对比度和横向溢出回归。' },
    ],
  },
  {
    version: '9.2.48',
    date: '2026-10-19',
    title: '运营报告周期边界校准',
    impactScope: ['创作者运营日报', '创作者运营周报', '创作者运营月报', '北京时间日期窗口'],
    changes: [
      { type: 'fix', description: '发布作品数量按对应的北京时间日期闭区间计算，日报只含昨天，近7天和近30天包含窗口末日。' },
      { type: 'fix', description: '排除窗口前的期初基线日及窗口结束日之后的未来作品，防止周期发布数多算或污染。' },
      { type: 'improvement', description: '新增日报、周报、月报跨北京时间午夜的边界回归。' },
    ],
  },
  {
    version: '9.2.47',
    date: '2026-10-19',
    title: '选题信息可读性与字段识别',
    impactScope: ['桌面选题列表与看板', '移动选题列表', '移动选题详情', '关联资料与主题维度', '亮暗主题无障碍'],
    changes: [
      { type: 'fix', description: '移动选题列表负责人/截止日期、加载/空结果态、详情普通元信息、关联资料/主题维度说明与空状态、协作动态备注统一使用 Studio 次级文字，修复暗色主题下 4.08:1 的对比度不足。' },
      { type: 'improvement', description: '选题标题和说明输入框增加稳定的 id/name，改善浏览器表单识别与自动填充兼容。' },
      { type: 'improvement', description: '增加 320/390px 移动视口明暗主题的元信息对比度和字段属性回归。' },
      { type: 'fix', description: '桌面选题页指标、表格表头、行内元信息及分页文字统一使用 Studio 次级文字，改善亮暗主题对比度。' },
      { type: 'fix', description: '选题看板总量、列计数、负责人/截止日期、空列与加载说明统一使用 Studio 次级文字，修复暗色主题低对比文字。' },
    ],
  },
  {
    version: '9.2.46',
    date: '2026-10-19',
    title: '资料删除状态安全核实',
    impactScope: ['资料中心', '软删除恢复', '重复操作保护'],
    changes: [
      { type: 'fix', description: '资料删除响应未确认时只读核实服务端状态；状态不明时锁定写入，避免重复移入回收站。' },
      { type: 'improvement', description: '回收状态在列表和详情中可辨识，已回收资料保持只读。' },
      { type: 'improvement', description: '隔离浏览器回归覆盖响应丢失、只读读取失败与恢复。' },
    ],
  },
  {
    version: '9.2.45',
    date: '2026-10-19',
    title: '运营报告写入状态核实',
    impactScope: ['创作者运营报告', '重复写入保护', '隔离浏览器回归'],
    changes: [
      { type: 'fix', description: '报告生成或删除响应未确认时按运营账号保存待核实状态，跨页面刷新仍锁定写入；核实后需用户明确确认才恢复操作。' },
      { type: 'fix', description: '已确认报告写入但列表刷新失败时，按账号跨页面刷新锁定后续写入；只读重读成功后自动解除。' },
      { type: 'improvement', description: '隔离回归覆盖生成/删除响应丢失、核实读取失败、页面重载状态保持及用户确认恢复流程。' },
    ],
  },
  {
    version: '9.2.44',
    date: '2026-10-19',
    title: '备份管理 Studio 体验与重复创建保护',
    impactScope: ['备份管理', '响应式体验', '备份安全操作'],
    changes: [
      { type: 'improvement', description: '备份管理页统一使用 Studio Atelier 共享页面壳、指标卡、按钮、加载/空状态和来源状态组件。' },
      { type: 'fix', description: '创建已确认但备份清单读回失败时，暂时禁止再次创建；成功重新核实清单后恢复操作。' },
      { type: 'improvement', description: '补充明暗主题与不同屏幕尺寸检查，并确认页面不会显示本机存储位置等内部信息。' },
    ],
  },
  {
    version: '9.2.43',
    date: '2026-10-19',
    title: '设置中心品牌说明可读性',
    impactScope: ['设置中心', '亮暗主题', '响应式回归'],
    changes: [
      { type: 'fix', description: '关于系统的品牌说明使用 Studio 次级正文令牌，提升暗色主题下的对比度余量。' },
      { type: 'improvement', description: '设置中心覆盖常见手机屏幕尺寸和明暗主题，并兼容不同浏览器的颜色显示。' },
    ],
  },
  {
    version: '9.2.42',
    date: '2026-10-19',
    title: '日报提交状态安全恢复',
    impactScope: ['个人日报', '账号切换保护'],
    changes: [
      { type: 'fix', description: '日报提交响应异常时只读核实服务器状态，已提交不会被误报失败或重复提交。' },
      { type: 'fix', description: '状态暂时无法确认时锁定编辑与重复提交，并提供只读状态核实入口。' },
      { type: 'improvement', description: '桌面和移动网页均按草稿/退回状态开放编辑，异步日报回读按账号身份隔离。' },
    ],
  },
  {
    version: '9.2.41',
    date: '2026-10-19',
    title: '登录页触控与主内容无障碍',
    impactScope: ['登录页', '移动端可访问性'],
    changes: [
      { type: 'improvement', description: '密码显隐按钮提供 40px 触控区与清晰键盘焦点环，保持图标尺寸及输入内容留白不变。' },
      { type: 'fix', description: '登录页补充唯一主内容地标，便于屏幕阅读器直接定位页面主体。' },
      { type: 'improvement', description: '登录页浏览器回归覆盖窄屏下的显隐按钮尺寸、密码遮罩切换和主内容地标。' },
    ],
  },
  {
    version: '9.2.40',
    date: '2026-10-19',
    title: '移动工作中心文字对比度',
    impactScope: ['移动工作中心'],
    changes: [
      { type: 'fix', description: '移动工作中心说明和常用入口副标题统一使用 Studio 次级文字令牌，修复暗色主题下可读性不足。' },
      { type: 'improvement', description: '增加 390px 明暗主题说明文字对比度与横向溢出回归。' },
    ],
  },
  {
    version: '9.2.39',
    date: '2026-10-19',
    title: '协作同步状态文字对比度',
    impactScope: ['成片详情', '拍摄详情', '发布详情', '富文本编辑器'],
    changes: [
      { type: 'fix', description: '协作编辑器文档同步状态提示改用 Studio 次级文字令牌，提升暗色主题下的可读性。' },
      { type: 'improvement', description: '补充同步状态提示在亮暗主题下的对比度回归。' },
    ],
  },
  {
    version: '9.2.38',
    date: '2026-10-19',
    title: '详情文字对比度',
    impactScope: ['成片详情', '发布详情', '富文本编辑器'],
    changes: [
      { type: 'fix', description: '成片与发布详情的统计、字段和当前流程步骤文字改用 Studio 次级/高对比语义令牌，修正亮暗主题对比度不足。' },
      { type: 'improvement', description: '增加 390px 移动端明暗主题文字对比度与横向溢出回归。' },
    ],
  },
  {
    version: '9.2.37',
    date: '2026-10-19',
    title: '编辑器工具栏避让应用顶栏',
    impactScope: ['创作详情', '富文本编辑器', '移动网页'],
    changes: [
      { type: 'fix', description: '创作正文工具栏按当前应用顶栏实际高度定位，桌面缩放和移动页面滚动时不再被顶部导航遮挡；全屏编辑仍从屏幕顶部开始。' },
      { type: 'improvement', description: '新增桌面和 320px 移动端的工具栏遮挡/真实命中目标回归检查。' },
    ],
  },
  {
    version: '9.2.36',
    date: '2026-10-19',
    title: '资料搜索可靠性与导航',
    impactScope: ['资料搜索', '资料与资产导航'],
    changes: [
      { type: 'fix', description: '资料搜索以同步互斥拦截同一在途查询的重复提交；关键词或筛选变化后旧请求失效，迟到结果不会覆盖新查询。' },
      { type: 'improvement', description: '资料搜索新增独立侧栏入口，搜索期间清晰显示处理中状态并保持关键词可编辑。' },
    ],
  },
  {
    version: '9.2.35',
    date: '2026-10-19',
    title: '数据可信与操作可访问性',
    impactScope: ['发布归档', '数据复盘', '资料搜索', '资料中心', '团队日报', '人员管理', '备份清单', '匿名意见箱', '消息中心', '番茄钟', '成就视图', '活动日志分页', '首页数据可信度', '官方导入', '登录安全', '通知偏好', '选题模板'],
    changes: [
      { type: 'fix', description: '旧版发布归档缺少内容时仍可正常显示；异常数据不会原样展示，发布异常状态清楚可辨。' },
      { type: 'improvement', description: '数据复盘支持键盘横向浏览并补齐行动项可访问名称；资料搜索提交按钮统一共享主按钮；日报账号切换隔离旧请求。' },
      { type: 'fix', description: '消息中心单条已读与筛选/分页切换时保护当前查询，避免迟到写入回包覆盖新结果。' },
      { type: 'improvement', description: '首页抖音指标分别标注来源、观测日期及有精确依据的官方采集时间，避免借用其他同步时间。' },
      { type: 'fix', description: '抖音官方昨天/近 7 天/近 30 天日期按北京时间自然日验证，7/30 天含采集日；以签名采集时间锚定并拒绝不完整或失真的日期窗口。' },
      { type: 'fix', description: '抖音 7/30 天逐日核心指标必须有效且完整；缺失、NULL 或畸形值在写入前拒绝，不补零生成周期合计，可选空值与负数修正保留原语义。' },
      { type: 'fix', description: '抖音 90 天趋势验证北京时间连续日期和每日必需指标；不完整官方数据不补零或伪造周期合计，无官方历史则保留精确窗口的旧快照回退。' },
      { type: 'improvement', description: '成就视图选择与活动日志翻页补齐屏幕阅读器状态；人员列表隔离筛选、分页切换期间的迟到读取及旧写入回调。' },
      { type: 'fix', description: '备份清单与匿名意见列表采用读取代次保护，旧响应不能覆盖较新的确认数据、错误提示或加载状态。' },
      { type: 'fix', description: '资料中心单库读取失败时仍保留其他可用计数，失败项不再误显示为零并可重试；登录安全状态页次要文字改用 Studio 次级令牌提升可读性。' },
      { type: 'improvement', description: '番茄钟排行榜奖杯图标改用 Studio 彩色底前景令牌，修复暗色主题对比度不足。' },
      { type: 'improvement', description: '强制改密对话框接管键盘焦点并圈定 Tab 顺序，背景登录页在弹窗期间不可操作，关闭后恢复焦点。' },
      { type: 'fix', description: '移动网页通知偏好在已保存后再次编辑时清除过期成功提示，不会把未提交选择显示成已保存。' },
      { type: 'fix', description: '选题模板初始列表读取完成前阻止提交与编辑，避免旧读取快照覆盖已确认的新建结果。' },
    ],
  },
  {
    version: '9.2.34',
    date: '2026-10-17',
    title: '内容动态恢复与流程可靠性',
    impactScope: ['创作动态', '创作列表', '番茄钟', '成就初始化', '无障碍与响应式验收'],
    changes: [
      { type: 'fix', description: '区分内容动态读取失败与确认空结果，失败提供只读重试；修复创作列表实时新增计数竞态和末页删除后的页码越界。' },
      { type: 'improvement', description: '成就预设初始化改为原子事务，番茄钟取消改用兼容旧查询语义的独立账本；团队日报日期筛选补齐可访问标签。' },
      { type: 'improvement', description: '数据复盘新增手机/桌面及缩放等效视口回归矩阵；仓库 Chromium 启动受系统权限阻断，矩阵尚未执行。' },
    ],
  },
  {
    version: '9.2.33',
    date: '2026-10-17',
    title: '创作版本保存确认与读取恢复',
    impactScope: ['创作详情', '版本保存', '读取失败恢复'],
    changes: [
      { type: 'fix', description: '创作版本保存获服务端确认后立即保留新版本号与正文；详情或版本历史读取失败时，提示只重试读取，不诱导重复创建版本。' },
      { type: 'improvement', description: '新增保存确认后详情读取失败的隔离浏览器回归，验证版本写入只发生一次，显式重试只读取详情。' },
    ],
  },
  {
    version: '9.2.32',
    date: '2026-10-17',
    title: '发布候选隔离与表单可访问性',
    impactScope: ['发布管理', '审批流设计器', '匿名意见管理', '无障碍操作'],
    changes: [
      { type: 'fix', description: '隔离抖音候选列表的迟到响应；发布记录、搜索条件或弹窗变化后，旧结果不再覆盖当前状态，绑定仅能使用当前候选。' },
      { type: 'improvement', description: '发布记录九个表单控件补齐标签关联；审批表单字段和图标操作、匿名意见图标操作提供明确可访问名称，并增加针对性浏览器回归。' },
    ],
  },
  {
    version: '9.2.31',
    date: '2026-10-17',
    title: '排期日历月份切换准确性',
    impactScope: ['排期日历', '月份切换', '异步读取隔离'],
    changes: [
      { type: 'fix', description: '为日历排期和选题截止事项读取增加请求代次校验；迟到的旧月份响应或错误不能覆盖当前月份，离开页面后未完成请求也会失效。' },
      { type: 'improvement', description: '新增旧月份成功/失败延迟回包竞态回归，补齐创建事件表单可访问标签并验证桌面/窄屏行为。' },
    ],
  },
  {
    version: '9.2.30',
    date: '2026-10-17',
    title: '成片列表确认操作状态保护',
    impactScope: ['成片制作', '确认操作', '重复提交保护'],
    changes: [
      { type: 'fix', description: '成片列表确认完成/删除操作增加同步确认锁；同一事件周期重复触发不会提前解除处理中状态，底层写入仍保持单次执行。' },
      { type: 'improvement', description: '新增延迟状态更新下重复确认的浏览器回归，验证确认按钮持续禁用并在服务端确认后关闭弹窗。' },
    ],
  },
  {
    version: '9.2.29',
    date: '2026-10-17',
    title: '灵感池写入反馈与重复提交保护',
    impactScope: ['灵感池', '评论讨论', '选题转化'],
    changes: [
      { type: 'fix', description: '灵感删除、评论和转选题增加同步互斥，快速重复触发只发一条写入；失败时保留可重试内容/记录，服务端确认成功后才更新界面。' },
      { type: 'improvement', description: '评论成功后明确提示已发布；扩充隔离浏览器回归并确保 Chromium 启动失败时也会关闭本地测试服务。' },
    ],
  },
  {
    version: '9.2.28',
    date: '2026-10-17',
    title: '复盘模块暗色文字对比度',
    impactScope: ['数据复盘', '个人行动项', '暗色主题可读性'],
    changes: [
      { type: 'fix', description: '复盘中心列表、个人行动项和详情页的说明文字改用 Studio 次级文字令牌，提升暗色磨砂背景上的可读性。' },
      { type: 'improvement', description: '补充复盘列表/详情表头、空状态和详情抽屉的暗色文字对比度回归，并覆盖移动与桌面宽度。' },
    ],
  },
  {
    version: '9.2.27',
    date: '2026-10-17',
    title: '成片状态写入保护与分类回归',
    impactScope: ['成片制作', '知识库分类管理', '写入操作反馈'],
    changes: [
      { type: 'fix', description: '成片详情状态更新加入同步互斥并在请求期间禁用状态操作；服务端确认后详情刷新失败时保留已确认状态，提示只读重载并阻止重复提交。' },
      { type: 'improvement', description: '补充分类新增失败重试与空分类删除在途双触发浏览器回归，确保快速重复操作只发一次写入。' },
    ],
  },
  {
    version: '9.2.26',
    date: '2026-10-17',
    title: '选题删除操作防重复',
    impactScope: ['选题管理', '删除操作反馈'],
    changes: [
      { type: 'fix', description: '选题单条删除在服务端确认前使用同步互斥，重复确认只发送一次请求；失败继续保留确认与重试入口，成功后才移除选题。' },
      { type: 'improvement', description: '增加延迟删除回包下的同任务双触发回归，验证写入去重及确认后列表反馈。' },
    ],
  },
  {
    version: '9.2.25',
    date: '2026-10-17',
    title: '成片与发布写入同步互斥',
    impactScope: ['成片制作', '发布管理', '剧本版本历史', '发布归档'],
    changes: [
      { type: 'fix', description: '成片和发布的小版本、大版本保存，以及两个入口的归档重试增加同步互斥；同一事件周期重复触发只发送一次写入，避免重复建版和重复重试。' },
      { type: 'improvement', description: '为版本保存和归档重试增加延迟响应下的同任务双触发回归。' },
    ],
  },
  {
    version: '9.2.24',
    date: '2026-10-17',
    title: '内容维度操作防重复提交',
    impactScope: ['选题详情', '主题内容资产', '内容维度'],
    changes: [
      { type: 'fix', description: '城市、人物与项目维度登记及移除增加同步互斥；同一事件周期重复触发仅发送一次写入，仍保留失败重试与成功回显。' },
      { type: 'improvement', description: '补充选题详情和主题内容资产两个入口的双提交浏览器回归。' },
    ],
  },
  {
    version: '9.2.23',
    date: '2026-10-17',
    title: '移动首页辅助名称与可见文字一致',
    impactScope: ['移动首页', '无障碍体验'],
    changes: [
      { type: 'fix', description: '阶段计数按钮不再覆盖自身可见文字的辅助名称；稿件保存状态不重复播报状态前缀；异常摘要时隐藏说明不撑宽页面。' },
      { type: 'improvement', description: '数量暂不可用时仍在按钮内提供辅助技术说明，并为阶段按钮、任务名称和 390px 无溢出补充回归。' },
    ],
  },
  {
    version: '9.2.22',
    date: '2026-10-17',
    title: '移动首页展示稿件保存状态',
    impactScope: ['移动首页', '个人稿件', '保存状态'],
    changes: [
      { type: 'improvement', description: '个人稿件卡片区分保存中、已明确保存、待保存修改、协作同步中与冲突；本次会话没有当前账号的可信保存事件时，明确显示状态未确认。' },
      { type: 'fix', description: '不再以稿件更新时间推断保存成功；内存中的编辑状态按当前账号隔离，不跨账号误显示。' },
    ],
  },
  {
    version: '9.2.21',
    date: '2026-10-17',
    title: '移动首页可查看各阶段最新内容',
    impactScope: ['移动首页', '内容阶段概览'],
    changes: [
      { type: 'improvement', description: '增加可折叠的阶段最新内容预览，最多展示七个阶段各自三条；选题预览显示阶段停留时间，并可直达选题或复盘。' },
      { type: 'improvement', description: '复用首页摘要权限范围，灵感预览限制为三条既有列表数据，保留原有阶段筛选跳转。' },
    ],
  },
  {
    version: '9.2.20',
    date: '2026-10-17',
    title: '移动首页最近变化可按需查看',
    impactScope: ['移动首页', '近期活动'],
    changes: [
      { type: 'improvement', description: '新增默认折叠的最近变化区，按现有可见范围展示最近稿件版本、批注回复和选题状态变化，最多五条并可直达站内内容。' },
      { type: 'improvement', description: '活动仅在展开时读取；失败可重试，刷新失败保留最近成功结果，收起或切换身份时可中止旧请求。' },
    ],
  },
  {
    version: '9.2.19',
    date: '2026-10-17',
    title: '首页任务按角色优先显示',
    impactScope: ['桌面工作台', '移动首页', '内容阶段概览'],
    changes: [
      { type: 'improvement', description: '桌面与移动首页共享角色化任务顺序；移动首页默认显示三项并可展开至六项，同时展示灵感池至复盘的七阶段数量。' },
      { type: 'improvement', description: '审核角色的任务上限优先保留个人稿件，避免重复审核事项挤掉待修改的退回稿。' },
    ],
  },
  {
    version: '9.2.18',
    date: '2026-10-17',
    title: '移动工作台可继续处理自己的稿件',
    impactScope: ['移动工作台', '个人稿件任务'],
    changes: [
      { type: 'improvement', description: '移动首页展示现有摘要接口提供的个人草稿和退回稿，并可直接继续写稿或处理退回内容。' },
    ],
  },
  {
    version: '9.2.17',
    date: '2026-10-17',
    title: '选题看板更早进入视野',
    impactScope: ['选题管理', '看板浏览效率'],
    changes: [
      { type: 'improvement', description: '选题看板不再显示列表专属概览指标和重点选题卡片，阶段列提前出现；列表模式摘要和重点选题照常保留。' },
    ],
  },
  {
    version: '9.2.16',
    date: '2026-10-17',
    title: '资料搜索支持组合筛选与排序',
    impactScope: ['资料全文搜索', '资料库与分类筛选'],
    changes: [
      { type: 'improvement', description: '资料搜索支持按资料库、分类和标签组合筛选，并可选择相关度、最近更新或标题排序；无结果时提供清除筛选并保留关键词重试的建议。' },
    ],
  },
  {
    version: '9.2.15',
    date: '2026-10-17',
    title: '资料搜索会突出显示命中关键词',
    impactScope: ['资料全文搜索', '安全文本呈现'],
    changes: [
      { type: 'improvement', description: '资料全文搜索结果突出显示命中词；标记可被辅助功能识别，其余内容仍按安全文本展示，并适配 Studio 主题。' },
    ],
  },
  {
    version: '9.2.14',
    date: '2026-10-17',
    title: '资料搜索更清晰易用',
    impactScope: ['资料搜索', '可访问性', '移动端浏览'],
    changes: [
      { type: 'improvement', description: '为资料搜索关键词框增加明确名称，提升暗色主题分类文字对比度，为资料列表翻页按钮补充名称，并覆盖 320/390px 布局。' },
    ],
  },
  {
    version: '9.2.13',
    date: '2026-10-17',
    title: '知识库分类树操作更明确',
    impactScope: ['知识库', '辅助技术操作'],
    changes: [
      { type: 'improvement', description: '分类树只在有子项时展示展开/收起按钮，按钮名称包含分类名，叶子分类不再提供无效操作。' },
    ],
  },
  {
    version: '9.2.12',
    date: '2026-10-17',
    title: '知识库分类计数在暗色主题下更清晰',
    impactScope: ['知识库', '暗色主题可读性'],
    changes: [
      { type: 'fix', description: '知识库分类数量改用 Studio 次级文字令牌，修复暗色磨砂面板上仅 4.22:1 的对比度问题，并补充亮暗主题实际合成对比度回归。' },
    ],
  },
  {
    version: '9.2.11',
    date: '2026-10-17',
    title: '知识库手机页面更紧凑',
    impactScope: ['知识库', '移动端浏览体验'],
    changes: [
      { type: 'improvement', description: '移动端知识库分类面板按内容自然收缩，不再保留桌面最小高度；搜索与资料列表因此更早进入视野，并增加 320/390px 亮暗主题布局回归。' },
    ],
  },
  {
    version: '9.2.10',
    date: '2026-10-16',
    title: '消息中心计数在暗色主题下更清晰',
    impactScope: ['消息中心', '亮暗主题可读性', '移动消息页'],
    changes: [
      { type: 'fix', description: '桌面消息列表计数改用 Studio 次级文字令牌；补充亮暗主题对比度和独立 320px 移动壳层回归，并确认取消清空不会发送写入请求。' },
    ],
  },
  {
    version: '9.2.9',
    date: '2026-10-16',
    title: '发布管理暗色文字更清晰',
    impactScope: ['发布管理', '暗色主题可读性'],
    changes: [
      { type: 'fix', description: '发布表头、负责人说明和统计卡片标题使用更易辨认的 Studio 次级文字样式；共享统计卡片单位一并改进，并增加亮暗主题对比度回归。' },
    ],
  },
  {
    version: '9.2.8',
    date: '2026-10-16',
    title: '协作成员标记在不同颜色上都清晰可读',
    impactScope: ['创作协作', '亮暗主题可读性'],
    changes: [
      { type: 'fix', description: '协作头像与光标名称会按成员背景色自动采用高对比文字，覆盖常见成员色；无法识别的颜色使用可读的默认组合。' },
    ],
  },
  {
    version: '9.2.7',
    date: '2026-10-16',
    title: '隐藏导航不再拦截键盘操作',
    impactScope: ['桌面与窄窗导航', '辅助技术识别', '键盘操作'],
    changes: [
      { type: 'fix', description: '收起分组和关闭的窄窗导航抽屉不再接收键盘焦点，图标模式仍播报分组名称；点击图标分组会展开侧栏并打开该分组；抽屉打开后焦点会进入并限制在菜单内，关闭后归还触发按钮。' },
    ],
  },
  {
    version: '9.2.6',
    date: '2026-10-16',
    title: '桌面工作台任务更容易区分',
    impactScope: ['桌面工作台', '辅助技术识别'],
    changes: [
      { type: 'improvement', description: '审核、发布和续写按钮的读屏名称会带上对应任务，重复操作名称不再混淆；显示文案与业务行为保持不变。' },
    ],
  },
  {
    version: '9.2.5',
    date: '2026-10-16',
    title: '移动首页的任务信息更容易看清和读懂',
    impactScope: ['移动首页', '辅助技术识别', '亮暗主题可读性'],
    changes: [
      { type: 'improvement', description: '任务卡片按可见标题、状态和处理信息生成读屏名称；辅助文字和“查看全部”使用更清晰的主题色。' },
    ],
  },
  {
    version: '9.2.4',
    date: '2026-10-16',
    title: '手机创作页操作按钮不再被导航遮挡',
    impactScope: ['移动创作编辑', '协作光标无障碍'],
    changes: [
      { type: 'fix', description: '保存和提交栏避开底部导航与系统键盘；协作光标头像组补齐辅助技术语义。' },
    ],
  },
  {
    version: '9.2.3',
    date: '2026-10-16',
    title: '让匿名意见回复更容易识别和填写',
    impactScope: ['匿名意见管理', '输入辅助识别'],
    changes: [
      { type: 'improvement', description: '回复窗增加可见字段标签，输入框使用统一 Studio 样式并可调整高度。' },
    ],
  },
  {
    version: '9.2.2',
    date: '2026-10-16',
    title: '避免匿名意见列表旧结果覆盖新操作',
    impactScope: ['匿名意见管理', '并发读取与写入'],
    changes: [
      { type: 'fix', description: '写入确认后使在途旧列表读取失效，防止迟到回包覆盖状态、公开、回复或删除结果。' },
    ],
  },
  {
    version: '9.2.1',
    date: '2026-10-16',
    title: '意见提交后立即收到确认',
    impactScope: ['匿名意见箱', '重复提交保护', '列表刷新反馈'],
    changes: [
      { type: 'fix', description: '意见写入得到服务端确认后立即结束提交并清空表单；后续列表刷新失败不会再被误报为提交失败。' },
      { type: 'improvement', description: '新增同步提交锁，阻止快速重复发送；写入失败保留输入，允许重试。' },
    ],
  },
  {
    version: '9.2.0',
    date: '2026-10-16',
    title: '资料详情可以直接编辑',
    impactScope: ['资料详情', '资料分类', '正文与可见范围'],
    changes: [
      { type: 'feature', description: '资料详情支持修改标题、摘要、分类、可见范围和正文，沿用服务端权限范围与审计校验。' },
      { type: 'improvement', description: '保存失败时保留输入；确认成功后立即回显，详情刷新失败可单独重试，不重复保存。' },
    ],
  },
  {
    version: '9.1.47',
    date: '2026-10-16',
    title: '让资料中心的写入与操作状态更清楚',
    impactScope: ['资料创建', '资料详情操作入口', '重复提交保护'],
    changes: [
      { type: 'fix', description: '新增资料等待服务端确认期间锁定表单与关闭入口，防止重复创建或误以为内容已提交；失败后保留输入，可明确重试。' },
      { type: 'improvement', description: '资料详情中尚未接入的在线编辑和文件上传入口明确标记为暂未开放并禁用，避免误点。' },
    ],
  },
  {
    version: '9.1.46',
    date: '2026-10-16',
    title: '让资料库导航与页面保持一致',
    impactScope: ['项目资料库', '内容档案库', '素材归档', '资料详情导航'],
    changes: [
      { type: 'fix', description: '资料库列表和详情按 library_type 显示对应的侧栏、面包屑与返回位置；旧详情地址会从服务端资料类型补齐导航来源。' },
    ],
  },
  {
    version: '9.1.45',
    date: '2026-10-16',
    title: '保护系统设置保存中的修改',
    impactScope: ['系统设置', '品牌设置', '登录页设置'],
    changes: [
      { type: 'fix', description: '系统、品牌和登录页设置在保存期间锁定字段并使用同步写入锁，避免改动被回包覆盖或重复提交；失败后仍可重试。' },
    ],
  },
  {
    version: '9.1.44',
    date: '2026-10-16',
    title: '让稿件审阅操作安全保存',
    impactScope: ['批注与回复', '修改建议', '移动端稿件编辑'],
    changes: [
      { type: 'fix', description: '批注和回复失败时保留可重试输入；接受修改建议期间锁定正文和冲突操作，移动端同时阻止保存、审核与离页。' },
    ],
  },
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
      { type: 'fix', description: '首页摘要内容不完整时显示可重试提示，避免移动首页无法打开；读取正常后恢复首页展示。' },
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
      { type: 'fix', description: '实时协作遇到暂时中断或保存冲突时会保留内容并稍后重试；未标注时区的历史时间按北京时间读取。' },
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
      { type: 'improvement', description: '说明下载文件只包含对应模块的数据；状态和平台名称统一使用中文。' },
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
    impactScope: ['设置中心', '界面动效', '亮暗主题'],
    changes: [
      { type: 'improvement', description: 'AI 按钮和边框、星光、电流、火花及光泽效果统一使用 Studio 语义颜色。' },
      { type: 'fix', description: '画布和悬停动效现在会跟随当前区域的主题颜色；检查确认明暗主题实际显示和对比度正确。' },
    ],
  },
  {
    version: '8.5.4',
    date: '2026-10-12',
    title: '文字动效接入主题令牌',
    impactScope: ['设置中心', '界面动效', '亮暗主题'],
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
    impactScope: ['报告中心', '数据文件导出', '权限范围'],
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
    impactScope: ['负责人首页', '稿件审核入口', '创作数据范围', '权限范围检查'],
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
    impactScope: ['首页工作台', '关注事项汇总', '权限范围'],
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
      { type: 'improvement', description: '独立回归覆盖越权拒绝、阶段记录创建与复用、未处理发布阻断和发布异常完成；无数据结构调整或历史回填。' },
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
      { type: 'improvement', description: '独立桌面与移动端回归通过；无数据结构调整或历史回填。' },
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
      { type: 'improvement', description: '独立桌面与移动端回归通过；无数据结构调整。' },
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
      { type: 'improvement', description: '独立回归覆盖多平台成功、异常待处理、全异常处理完及完成状态保护；无数据结构调整。' },
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
      { type: 'improvement', description: '独立回归覆盖状态更正留痕、自动交接记录和完成阶段保持；无数据结构调整。' },
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
      { type: 'improvement', description: '独立回归覆盖完成状态保护、无效状态拒绝及完成后仍可修正文案；无数据结构变化。' },
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
      { type: 'improvement', description: '补充阶段交接与选题处理规则检查，并通过桌面和移动端浏览器回归；没有数据结构或业务数据变更。' },
    ],
  },
  {
    version: '6.1.4',
    date: '2026-09-30',
    title: '操作失败提示优化',
    impactScope: ['操作失败提示', '内容上传'],
    changes: [
      { type: 'improvement', description: '服务暂时无法处理、功能暂时找不到或提交内容过大时，显示清楚的中文说明和重试建议。' },
      { type: 'improvement', description: '补充真实错误结果检查，覆盖内容不存在、超出限制和错误信息保护。' },
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
      { type: 'feature', description: '登录、实时协作、错误处理、权限、通知和运行状态诊断使用统一的运行记录，便于排查问题。' },
      { type: 'security', description: '日志只输出白名单事件与字段；不输出令牌、原始标识、错误消息或堆栈，也不向外部服务发送遥测。' },
    ],
  },
  {
    version: '6.1.0',
    date: '2026-09-30',
    title: '服务运行记录与隐私保护',
    impactScope: ['服务请求追踪', '登录异常排查', '协作故障定位', '创作者助手诊断', '敏感信息保护'],
    changes: [
      { type: 'feature', description: '服务和创作者助手的运行记录采用统一格式，便于定位数据读取、协作和采集问题。' },
      { type: 'security', description: '运行记录只保留排查问题所需的信息，不记录登录凭据、原始异常、访问地址或可识别账号和设备的资料。' },
    ],
  },
  {
    version: '6.0.3',
    date: '2026-09-30',
    title: '协作服务异常恢复检查',
    impactScope: ['创作协作', '服务故障恢复'],
    changes: [
      { type: 'improvement', description: '在本机隔离环境中强制结束共享缓存服务并重启后，协作记录仍保留且两个服务恢复协作；生产多机或断电恢复尚未验收。' },
    ],
  },
  {
    version: '6.0.2',
    date: '2026-09-30',
    title: '协作事件 AOF 恢复验收',
    impactScope: ['创作协作', '服务故障恢复'],
    changes: [
      { type: 'improvement', description: '补充独立集成回归，确认共享缓存服务重启后协作记录保留且两个服务恢复协作；生产多机持久化尚未验收。' },
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
      { type: 'feature', description: '新增共享任务锁、自动续期、过期接管及防止旧任务误写的保护；此能力尚未接入具体生产任务。' },
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
    title: '多服务协作恢复检查',
    impactScope: ['创作协作', '跨实例房间广播', '成员状态'],
    changes: [
      { type: 'improvement', description: '补充两个独立服务间的协作回归，覆盖房间消息、成员查询和服务恢复后的广播。' },
      { type: 'security', description: '协作服务中断时暂停协作入口，恢复后再接受操作；生产仍按单服务运行，多机和完整负载均衡尚未验收。' },
    ],
  },
  {
    version: '5.0.0',
    date: '2026-09-29',
    title: '协作跨实例协调准备',
    impactScope: ['创作协作', '服务端运行配置', '协作成员状态'],
    changes: [
      { type: 'improvement', description: '增加可选的多实例协作协调与共享状态冲突恢复；默认继续单服务运行。' },
      { type: 'security', description: '多服务配置缺少协作支持时会停止启动，不会静默降低保护；生产启用仍未完成。' },
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
      { type: 'improvement', description: '协作内容只有在服务确认保存后才从待发送列表移除；保存失败或确认超时会保留内容并稍后重试。' },
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
      { type: 'improvement', description: '按钮、输入框、状态标签及加载和错误提示统一适配主题，提升明暗模式下的文字对比度。' },
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
  { version: '2.20.20', date: '2026-09-09', title: '权限与错误提示安全修复', impactScope: ['数据查看权限', '错误提示', '成员与操作记录'], changes: [{ type: 'security', description: '为数据分析查看补齐权限检查，未知异常只显示安全提示，不泄露内部信息。' }, { type: 'fix', description: '限制成员与操作记录的查询范围，并修复选题通知标题。' }] },
  { version: '2.20.19', date: '2026-09-09', title: 'Creator 托管封面与重复作品合并', impactScope: ['Creator Agent', '作品库', '数据驾驶舱'], changes: [{ type: 'fix', description: '认证浏览器已加载的封面可安全同步并在生产端稳定显示。' }, { type: 'fix', description: '同标题、同发布时间但采集编号不同的同一作品合并展示。' }] },
  { version: '2.20.18', date: '2026-09-08', title: '亮色主题对比度修复', impactScope: ['选题管理', '状态标签', '共享界面'], changes: [{ type: 'fix', description: '选题统计卡片和关联资料在亮色模式下恢复清晰背景与文字。' }, { type: 'improvement', description: '共享状态、平台、资源和提示控件统一使用深浅主题自适应高对比色。' }] },
  { version: '2.20.17', date: '2026-09-08', title: '登录与主题显示修复', impactScope: ['登录', '用户管理', '页面显示'], changes: [{ type: 'fix', description: '新建账号未填写姓名时，登录响应使用用户名作为显示名，不再误报服务暂时不可用。' }, { type: 'fix', description: '恢复生产页面的主题背景、卡片颜色和边框显示。' }] },
  { version: '2.20.16', date: '2026-09-07', title: '历史修复整合与依赖精简', impactScope: ['稳定性', '安全维护'], changes: [{ type: 'fix', description: '修复自动回归测试入口并隔离测试数据库。' }, { type: 'security', description: '更新受影响工具依赖，增加持续安全检查。' }, { type: 'improvement', description: '减少重复依赖，收敛源码检查范围。' }] },
  { version: '2.20.15', date: '2026-09-07', title: '安全与稳定性修复', impactScope: ['内容编辑', '数据导入', '账号与数据安全'], changes: [
    { type: 'security', description: '修复特殊格式内容可能影响页面显示的问题，保护编辑内容和页面安全。' },
    { type: 'security', description: '加固网络请求处理，降低异常输入造成服务中断的风险。' },
    { type: 'security', description: '统一异常提示保护，避免内部处理细节展示给用户。' },
    { type: 'improvement', description: '统一请求和同步内容的大小限制，避免不同入口使用不一致的规则。' },
    { type: 'improvement', description: '改进抖音官方数据文件校验和成就进度计算，并移除不再使用的处理步骤。' },
    { type: 'improvement', description: '生产环境启用安全连接，保护用户访问和数据传输。' },
  ] },
  { version: '2.20.14', date: '2026-09-04', title: '总结归档详情完善', impactScope: ['日报系统', '月报', '年报'], changes: [{ type: 'fix', description: '月报、年报归档新增完整详情入口和分区内容展示。' }, { type: 'improvement', description: '详情支持长文本滚动、Esc 关闭，并保持现有权限边界。' }] },
  { version: '2.20.13', date: '2026-09-04', title: '总结归档正文显示修复', impactScope: ['日报系统', '月报', '年报'], changes: [{ type: 'fix', description: '修复月报、年报提交正文未被服务端读取，归档记录存在却显示为空的问题。' }, { type: 'improvement', description: '归档统一输出明确正文模型，并兼容仍在旧字段中的历史报告。' }] },
  { version: '2.20.12', date: '2026-09-02', title: 'Creator 封面候选 403 诊断', impactScope: ['Creator Agent', '安全'], changes: [{ type: 'fix', description: '增加有限的 HEAD、Range GET 与固定 Creator Referer 对照，分类远端拒绝。' }, { type: 'security', description: '不转发认证信息、不保存候选或图片，并继续执行重定向与网络目标校验。' }] },
  { version: '2.20.11', date: '2026-09-02', title: 'Creator 封面来源空作品诊断', impactScope: ['Creator Agent', '安全'], changes: [{ type: 'fix', description: '修复 Creator XHR 双重转义导致的来源未捕获，并拒绝相似域名。' }, { type: 'security', description: '空来源使用分阶段脱敏失败诊断，不再伪装为成功作品 0。' }] },
  { version: '2.20.10', date: '2026-09-02', title: '创作者助手启动与安全修复', impactScope: ['创作者助手', '安全'], changes: [{ type: 'fix', description: '修复正式安装版登录窗口空白问题，并分开处理账号识别和窗口显示。' }, { type: 'security', description: '连接检查失败时显示固定安全提示，窗口只接收必要的状态信息。' }] },
  { version: '2.20.9', date: '2026-09-01', title: '创作者助手账号信息保护', impactScope: ['创作者助手', '安全'], changes: [{ type: 'security', description: '窗口只接收简短账号标识和必要状态，不再传递完整绑定资料。' }] },
  { version: '2.20.8', date: '2026-09-01', title: 'Creator 本地封面来源检查', impactScope: ['Creator Agent', '封面诊断'], changes: [{ type: 'feature', description: '新增独立本地封面候选检查，结果仅返回脱敏汇总。' }, { type: 'security', description: '检查路径不调用同步、上传、队列或官方导出下载。' }] },
  { version: '2.20.7', date: '2026-08-31', title: 'Creator 作品封面 URL 完整性', impactScope: ['Creator 作品库', '同步兼容'], changes: [{ type: 'fix', description: '拒绝相对路径和无效封面 URL，避免浏览器加载失败。' }, { type: 'fix', description: '读取旧数据时从既有 raw 字段恢复可解析封面，并保留已有有效封面。' }] },
  { version: '2.20.6', date: '2026-08-31', title: '创作者助手登录与同步状态修复', impactScope: ['创作者助手', '桌面版'], changes: [{ type: 'fix', description: '登录状态不再受临时窗口开关影响；系统会根据实际登录情况提供同步操作。' }, { type: 'security', description: '开始同步前会再次确认登录、浏览器和账号绑定状态，窗口显示不能改变校验结果。' }] },
  {
    version: '2.20.5', date: '2026-08-31', title: '登录一致性与安全修复',
    impactScope: ['Creator Agent', '拍摄与发布', '数据安全'],
    changes: [
      { type: 'fix', description: '关闭窗口或重启后按实际登录状态恢复；仅在登录会话有效时确认，无可用浏览器时暂停登录与同步并给出提示。' },
      { type: 'security', description: '异常提示不暴露内部细节；服务错误响应、连接保护和相关依赖完成安全加固，Excel 导入限制文件大小及内容规模。' },
      { type: 'improvement', description: '拍摄计划和发布管理支持分页，列表可逐页查看。' },
    ],
  },
  { version: '2.20.4', date: '2026-08-28', title: '创作者助手本地同步任务修复', impactScope: ['创作者助手', '本地数据安全'], changes: [{ type: 'fix', description: '统一保存待同步任务的内容格式，并核对保存结果，避免任务信息损坏。' }, { type: 'improvement', description: '旧版首次启动会先整理本地任务记录，并提供不含敏感信息的运行状态诊断。' }] },
  {
    version: '2.20.3', date: '2026-08-28', title: 'Creator 官方导出本地安全同步',
    impactScope: ['Creator Agent', '抖音数据', '数据安全'],
    changes: [
      { type: 'feature', description: '本地解析官方导出文件并上传标准化指标与质量摘要。' },
      { type: 'security', description: '原始 Excel 和浏览器登录资料不上传；批次、文件和业务指标均有幂等保护。' },
    ],
  },
  {
    version: '2.20.2', date: '2026-08-27', title: '移动端登录状态续期修复',
    impactScope: ['Android', '登录安全'],
    changes: [
      { type: 'fix', description: 'Android 登录状态与服务端有效期保持一致，并在更新后安排下一次检查。' },
      { type: 'security', description: '补齐登录状态更新失败时的恢复处理，避免旧任务影响当前登录状态。' },
      { type: 'improvement', description: '整理实时服务运行观察记录，并收敛已替代实现。' },
    ],
  },
  {
    version: '2.20.1', date: '2026-08-26', title: '创作者数据采集检查完善',
    impactScope: ['创作者助手', '抖音采集'],
    changes: [
      { type: 'fix', description: '修复作品记录中复杂内容无法正确保存的问题。' },
      { type: 'feature', description: '新增无需打开窗口的完整采集检查，并验证两份官方数据文件可连续处理。' },
    ],
  },
  {
    version: '2.20.0', date: '2026-08-18', title: '创作者数据采集能力完善',
    impactScope: ['Creator Agent', '抖音采集', '本地安全'],
    changes: [
      { type: 'feature', description: '新增本地数据采集工具，并支持读取抖音账号能力清单。' },
      { type: 'security', description: '本地采集只输出必要的脱敏结果，不记录登录凭据。' },
    ],
  },
  {
    version: '2.19.11', date: '2026-08-20', title: 'Creator Agent 上传协议安全收口',
    impactScope: ['Creator Agent', '上传安全', 'Android'],
    changes: [
      { type: 'security', description: '创作者助手上传会校验版本、签名和时效，并拒绝重复请求。' },
      { type: 'security', description: '停用旧上传入口，避免绕过重复请求保护。' },
    ],
  },
  {
    version: '2.19.10', date: '2026-08-20', title: '认证与角色权限安全补充',
    impactScope: ['认证', '权限', 'Android'],
    changes: [
      { type: 'security', description: '旧版登录恢复仅接受可信站点地址，并拒绝相似域名、错误端口和不安全连接。' },
      { type: 'security', description: '角色批量授予与角色权限定义在写入前执行调用者有效权限上限检查，避免自举提权。' },
      { type: 'fix', description: '补充站点来源和角色权限安全检查，并纳入核心发布检查。' },
    ],
  },
  {
    version: '2.19.9', date: '2026-08-20', title: '权限、编辑器与认证安全硬化',
    impactScope: ['权限', '编辑器', '协作', '认证', 'Android'],
    changes: [
      { type: 'security', description: '限制角色授予上限，统一净化富文本渲染，并拒绝畸形协作 update。' },
      { type: 'security', description: 'Webhook fail-closed；禁用账号立即撤销会话并断开实时连接。' },
      { type: 'fix', description: '浏览器端与 Android 遇到登录失效时会安全恢复登录状态，并且最多重试一次。' },
    ],
  },
  {
    version: '2.19.8', date: '2026-08-17', title: 'Android 正式版连接安全修复',
    impactScope: ['Android', '正式版安全'],
    changes: [
      { type: 'fix', description: '正式 Android 版本固定使用生产服务地址，并随安装包保留必要的版本信息。' },
      { type: 'security', description: '正式版服务地址缺失或错误时停止连接，避免将普通网页误认为服务可用。' },
    ],
  },
  {
    version: '2.19.7', date: '2026-08-17', title: 'Android 登录状态自动续期修复',
    impactScope: ['Android', '登录安全'],
    changes: [
      { type: 'fix', description: 'Android 会在登录状态即将失效时主动更新，不依赖实时协作连接。' },
      { type: 'security', description: '短暂网络故障时保留安全凭据并有限重试；确认登录已失效后才清除会话。' },
    ],
  },
  {
    version: '2.19.6', date: '2026-08-14', title: 'Android 安全连接兼容修复',
    impactScope: ['Android', '登录安全'],
    changes: [
      { type: 'fix', description: '允许 Android 应用使用自身的安全连接，同时拒绝未知站点、局域网和相似域名。' },
      { type: 'security', description: '补充真实网络请求检查，确认跨站访问和登录凭据保护符合预期。' },
    ],
  },
  {
    version: '2.19.5', date: '2026-08-14', title: '编辑器 Word 式格式刷',
    impactScope: ['编辑器', '协作编辑'],
    changes: [
      { type: 'feature', description: '新增单次和连续格式刷，支持文字样式、颜色、高亮、标题、对齐与首行缩进。' },
      { type: 'improvement', description: '格式应用只影响文字样式，不会误复制链接、批注或其他内容信息。' },
    ],
  },
  {
    version: '2.19.4', date: '2026-08-14', title: '部署门禁可靠性修复',
    impactScope: ['生产部署', '运行时安全'],
    changes: [
      { type: 'fix', description: '上线检查会核对实际服务设置，并在服务重启后进行有限次数的健康确认。' },
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
    version: '2.19.2', date: '2026-08-13', title: '生产环境访问边界加固',
    impactScope: ['生产安全', '内部服务保护'],
    changes: [
      { type: 'security', description: '内部诊断入口仅允许本机访问，并拒绝外部转发请求。' },
      { type: 'security', description: '上线前检查生产服务设置，并确认内部页面不会向公众开放。' },
    ],
  },
  {
    version: '2.19.1', date: '2026-08-13', title: '移动端登录与协作权限修复',
    impactScope: ['Android', '登录安全', '实时协作'],
    changes: [
      { type: 'security', description: '分别核验移动端登录、登录续期和实时协作的访问权限。' },
    ],
  },
  {
    version: '2.19.0', date: '2026-08-13', title: 'Android 移动办公客户端',
    impactScope: ['Android', '认证', '实时协作'],
    changes: [
      { type: 'feature', description: '新增 Android 移动办公客户端，提供移动工作台和底部导航。' },
      { type: 'security', description: '使用 Android 安全存储保护登录凭据，并要求应用通过安全连接访问服务。' },
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
    title: '全系统界面体验与主题方案升级',
    impactScope: ['首页', '选题', '日报', '创作者中心', '数据分析', '工作流', '编辑器', '外观设置'],
    changes: [
      { type: 'feature', description: '统一各页面的视觉层级和交互风格，让工作台、选题、编辑器和设置中心保持一致。' },
      { type: 'feature', description: '提供六套可选外观：岚曜极光、深空科技、丝绸创意、线性协作、极简无扰和自由搭配。' },
      { type: 'feature', description: '外观设置支持实时预览、导入导出、恢复默认和选择应用范围。' },
      { type: 'improvement', description: '优化不同页面和屏幕尺寸下的显示、字号、明暗主题与动态效果。' },
      { type: 'fix', description: '修复外观切换后残留动画，以及设置中心主题选择项缺少辅助名称的问题。' },
      { type: 'security', description: '本次只调整界面展示，不改变业务数据和现有权限。' },
    ],
  },
  {
    version: '2.17.2',
    date: '2026-08-08',
    title: '外观设置兼容检查补充',
    impactScope: ['登录后外观设置', '主题与显示选项'],
    changes: [
      { type: 'fix', description: '补充登录后外观设置检查，避免测试账号信息写入页面内容。' },
      { type: 'improvement', description: '检查登录后的明暗主题、六套预设、字号、窗口尺寸、按钮、设置保存与恢复默认。' },
      { type: 'security', description: '所有检查均在独立的本机页面进行，不连接正式服务。' },
    ],
  },
  {
    version: '2.17.1',
    date: '2026-08-08',
    title: '浅色主题与字体显示修复',
    impactScope: ['外观与动效设置', '按钮与文本显示', '正文排版'],
    changes: [
      { type: 'fix', description: '修复浅色模式下按钮文字、边框与高光的对比度。' },
      { type: 'fix', description: '修复外观效果切换后按钮颜色、尺寸和布局显示不一致的问题。' },
      { type: 'fix', description: '修复文本动画裁切；用户字号不再改变 html rem 基准。' },
      { type: 'improvement', description: '补充深色和浅色主题的实际页面预览，确保常用设置组合显示正常。' },
    ],
  },
  {
    version: '2.17.0',
    date: '2026-08-08',
    title: '外观与动效设置',
    impactScope: ['外观设置', '登录页', '首页', '通用按钮', '本机偏好'],
    changes: [
      { type: 'feature', description: '新增外观设置中心，提供六套预设并支持自由搭配。' },
      { type: 'feature', description: '支持背景、标题、数字、按钮、卡片、内容进入和导航风格的实时预览、导入导出与恢复默认。' },
      { type: 'improvement', description: '尊重减少动态效果偏好；手机端降低动效强度，设备不支持动态背景时显示静态背景。' },
      { type: 'security', description: '本次只调整界面外观，不改变业务数据、权限和协作规则。' },
    ],
  },
  {
    version: '2.16.1',
    date: '2026-08-07',
    title: '首页驾驶舱视觉增强',
    impactScope: ['Home 首页', '前端视觉与交互', '桌面端与移动端'],
    changes: [
      { type: 'feature', description: '新增品牌级 Hero 区域，融合平台名称、内容生产驾驶舱标题、核心指标与主要业务入口。' },
      { type: 'improvement', description: '增强首页动态背景；设备不支持动态效果或用户减少动态效果时会显示静态背景。' },
      { type: 'improvement', description: '首页采用更清晰的非对称布局，突出内容生产指标，并展示任务、选题、审核、发布、播放和智能辅助卡片。' },
      { type: 'improvement', description: '增加卡片高亮、轻微立体、点击反馈和页面进入动效。' },
      { type: 'security', description: '本次只调整页面展示，不改变业务数据和权限。' },
    ],
  },
  {
    version: '2.16.0',
    date: '2026-08-06',
    title: '登录页、首页和创作者中心体验升级',
    impactScope: ['登录页', '首页', '选题重点内容', '创作者中心'],
    changes: [
      { type: 'feature', description: '为登录页、首页、选题重点内容和创作者中心增加统一的视觉效果与交互反馈。' },
      { type: 'feature', description: '增加动态背景、重点卡片、内容入场、悬停高亮和个人资料卡片效果。' },
      { type: 'improvement', description: '优化登录、工作台、选题和创作者数据页面的显示体验。' },
      { type: 'security', description: '本次只调整页面展示，不改变业务数据和权限。' },
    ],
  },
  {
    version: '2.15.4',
    date: '2026-08-06',
    title: 'UI 应用补全升级',
    impactScope: ['首页', '选题', '工作流', '创作者中心'],
    changes: [
      { type: 'improvement', description: '统一核心业务页面的视觉样式和组件体验。' },
      { type: 'improvement', description: '统一首页卡片样式，并优化选题统计和重点列表的显示。' },
      { type: 'improvement', description: '统一工作流模板、步骤和预览样式，并优化创作者指标卡。' },
      { type: 'security', description: '本次不改变业务数据、权限和工作流规则。' },
    ],
  },
  {
    version: '2.15.3',
    date: '2026-08-05',
    title: '统一界面视觉基础升级',
    impactScope: ['界面视觉', '首页指标', '导航栏', '弹窗与状态提示'],
    changes: [
      { type: 'feature', description: '建立统一的页面、卡片和主题样式基础。' },
      { type: 'feature', description: '统一指标数字和进度展示方式。' },
      { type: 'improvement', description: '优化页面基础动效以及侧边导航展开和收起体验。' },
      { type: 'improvement', description: '统一弹窗、加载提示和空页面的视觉效果。' },
    ],
  },
  {
    version: '2.13.2',
    date: '2026-07-30',
    title: '登录保护与兼容性修复',
    changes: [
      { type: 'improvement', description: '整理登录相关处理，确保账号验证、密码保护和登录状态检查职责清晰。' },
      { type: 'improvement', description: '旧版登录方式继续可用，现有登录结果和错误提示保持一致。' },
      { type: 'security', description: '补充登录和角色核对检查；当前退出登录不会立即撤销已发放的登录凭据。' },
      { type: 'security', description: '保持现有登录有效期（最长 7 天）与权限规则不变。' },
    ],
  },
  {
    version: '2.13.1',
    date: '2026-07-30',
    title: '资料创建与档案导入修复',
    changes: [
      { type: 'fix', description: '修复资料库新增资料按钮无响应，补齐创建表单、校验和详情跳转。' },
      { type: 'improvement', description: '山东地情档案导入增加统一编码、换行、不可见字符、空白和空行清洗。' },
      { type: 'security', description: '导入记录保留原文件与清理后文件的校验信息；压缩包检查、批次记录、重复保护和回滚能力保持有效。' },
    ],
  },
  {
    version: '2.13.0',
    date: '2026-07-30',
    title: '创作生产资料引用',
    changes: [
      { type: 'feature', description: '生产详情新增参考资料模块，支持搜索、关联、查看和解除资料。' },
      { type: 'feature', description: '创作详情可关联参考资料，并在资料列表中显示关联关系。' },
      { type: 'security', description: '关联操作同时校验生产编辑范围和资料查看权限，普通查看用户保持只读。' },
      { type: 'improvement', description: '资料关联独立于编辑器、版本历史、协作编辑和保存流程，解除关联不删除资料。' },
    ],
  },
  {
    version: '2.12.0',
    date: '2026-07-29',
    title: '数据请求结果与错误提示统一',
    changes: [
      { type: 'feature', description: '统一数据读取与保存结果的说明方式，并提供清晰的错误信息和分页提示。' },
      { type: 'feature', description: '为每次数据请求加入可查询的追踪编号，并补充接口使用说明。' },
      { type: 'improvement', description: '选题相关数据读取采用统一格式，便于后续页面保持一致的提示和分页体验。' },
      { type: 'security', description: '本次不改变现有权限、业务状态和数据处理规则。' },
    ],
  },
  {
    version: '2.11.0',
    date: '2026-07-29',
    title: '选题数据处理兼容性完善',
    changes: [
      { type: 'feature', description: '整理选题相关数据处理并保留旧版使用方式，减少后续更新对现有工作的影响。' },
      { type: 'feature', description: '为选题页面后续改进预留兼容能力，当前使用方式保持不变。' },
      { type: 'improvement', description: '补充选题读取、保存、业务错误和旧版使用方式的独立回归检查。' },
      { type: 'security', description: '权限、状态流转、通知和历史记录行为保持原样，未调整数据结构。' },
    ],
  },
  {
    version: '2.10.3',
    date: '2026-07-29',
    title: '修复抖音粉丝与作品封面显示并优化数据驾驶舱',
    changes: [
      { type: 'fix', description: '修复粉丝总数没有正确保存的问题，并兼容常见数字格式和嵌套数据。' },
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
      { type: 'fix', description: '统一读取抖音作品封面；作品库和首页重点作品图片加载失败时显示占位。' },
    ],
  },
  {
    version: '2.10.2-sync',
    date: '2026-07-24',
    title: '抖音数据同步与作品记录完善',
    changes: [
      { type: 'feature', description: '升级作品数据同步方式，并继续兼容较早版本的采集工具。' },
      { type: 'improvement', description: '同一作品及其内容记录会一起保存并相互关联，避免记录不一致。' },
      { type: 'improvement', description: '同步记录补充采集类型和完整采集结果摘要，便于后续核对。' },
      { type: 'fix', description: '同步过程不再直接删除数据，而是列出疑似问题供查看；本版本未改动页面。' },
    ],
  },
  {
    version: '2.10.2-agent',
    date: '2026-07-24',
    title: '创作者数据采集与编辑器稳定性升级',
    changes: [
      { type: 'feature', description: '数据采集优化复杂数据读取、长编号识别、作品筛选、分页和完整快照记录。' },
      { type: 'fix', description: '修复编辑器右键菜单位置与悬浮工具栏冲突，保留多人协作光标。' },
    ],
  },
  {
    version: '2.10.1',
    date: '2026-07-24',
    title: '标准抖音数据中心',
    changes: [
      { type: 'feature', description: '新增抖音作品、每日数据、作品快照、分析记录和同步记录，便于查看历史表现。' },
      { type: 'improvement', description: '创作者运营分析、作品复盘和趋势使用实际采集的数据。' },
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
      { type: 'improvement', description: '优化多人实时协作、断线重连和连接恢复，修复编辑器频繁操作卡顿，并改进异常问题排查。' },
      { type: 'improvement', description: '内容版本管理升级：Production / Shooting 版本规则优化，小版本在当前 major 下自动递增且同一 major 仅保留最新 minor；新版本自动生成 major 并保留历史主版本最新记录。同步优化历史展示、版本聚合和数据冗余清理。' },
      { type: 'feature', description: '工作流系统升级：完成 Shadow Logging、Analytics、Decision、Enforcement、Explainability 能力建设，增强流程追踪、操作记录及后续 AI 自动化扩展能力。' },
      { type: 'improvement', description: '改进登录错误提示和频率保护、过多请求提示，并修复系统设置异常。' },
      { type: 'improvement', description: '改进实时协作连接复用、异常排查和断线恢复，提升正式环境稳定性。' },
      { type: 'feature', description: '部署运维升级：完善 PM2 服务管理、Caddy 代理配置、健康检查接口、自动部署脚本与数据备份机制，提升生产环境可靠性。' },
      { type: 'feature', description: '数据资料库建设：完成山东省情资料采集方案、泰安节点数据抓取、本地资料归档、目录结构保存、断点续爬和数据索引生成，为知识库与 AI 能力提供数据基础。' },
      { type: 'feature', description: '完成本地智能模型调研和验证，为后续智能内容助手、选题分析与私有知识库做好准备。' },
      { type: 'fix', description: '修复登录提示、实时协作连接、编辑器性能、版本历史、点赞频率保护和正式环境设置等问题。' },
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
        description: '补充编辑器规范和后续规划，明确继续使用当前主编辑器，并将协同编辑作为后续专项推进。',
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
      { type: 'fix', description: '修复资源和日历相关的数据更新异常。' },
      { type: 'security', description: '加强实时协作连接的登录身份核验。' },
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
      { type: 'security', description: '加强登录身份核验、登录频率限制和实时连接来源保护。' },
      { type: 'improvement', description: '统一数据请求结果，并优化数据读取速度。' },
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
