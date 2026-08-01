# Auth 灰度准入清单

- [ ] 生产版本、数据库备份、测试账号和 allowlist 双人复核确认。
- [ ] 观察窗口和浏览器 A/B 夹具确认。
- [ ] Auth v1、Login Gateway、Socket Bridge 与回滚检查均为 READY。
- [ ] 仅 allowlist；禁止 percentage、admin 和 director。
- [ ] 结束后恢复 legacy、禁用测试账号并输出报告。
