import {useEffect,useState} from 'react';
import type {DesktopState,SettingsInput} from '../types.js';
const PRODUCTION_SERVER='https://lanyaomedia.com';

export default function Settings({state,onSave}:{state:DesktopState;onSave:(value:SettingsInput)=>Promise<void>}){
  const[cfg,setCfg]=useState<SettingsInput>({serverUrl:'',enabled:false,interval:'manual',dailyHour:2,autoLaunch:false,browserId:'',executablePath:''});
  const[saved,setSaved]=useState('');const[bindingCode,setBindingCode]=useState('');const[error,setError]=useState('');
  useEffect(()=>{if(state.settings)setCfg({serverUrl:state.settings.serverUrl,...state.settings.syncConfig,autoLaunch:state.autoLaunch,browserId:state.settings.browserConfig.id,executablePath:state.settings.browserConfig.executablePath||''});},[state]);
  const chooseBrowser=async()=>{try{const selected=await window.xmtAgent.chooseBrowser();if(selected)setCfg({...cfg,executablePath:selected,browserId:''});}catch{setError('浏览器选择失败，请重新尝试。');}};
  const restartBrowser=async()=>{try{await window.xmtAgent.restartBrowser();setSaved('浏览器会话测试完成');}catch{setError('浏览器会话测试失败，请检查浏览器配置。');}};
  const clearProfile=async()=>{if(!window.confirm('第一次确认：清理后当前 Agent 浏览器的抖音登录状态会丢失，确定继续吗？'))return;try{const result=await window.xmtAgent.clearBrowserProfile();setSaved(result.cleared?'独立浏览器资料已清理，请重新登录':'已取消清理');}catch{setError('浏览器资料清理失败，请稍后重试。');}};
  const rebind=async()=>{setError('');setSaved('');try{await window.xmtAgent.rebind({serverUrl:PRODUCTION_SERVER,bindingCode});setBindingCode('');setSaved('生产服务器已重新绑定，浏览器资料保持不变');}catch{setError('服务器重新绑定失败，请检查绑定码后重试。');}};
  return <div className="settings-grid"><section className="card settings"><h2>设置</h2>
    <label>当前服务器<input value={cfg.serverUrl} readOnly/></label><p>生产服务器：{PRODUCTION_SERVER}</p>
    <label>更换服务器绑定码<input value={bindingCode} onChange={e=>setBindingCode(e.target.value.trim())} autoComplete="off" placeholder="更换服务器时填写一次性绑定码"/></label>
    <button type="button" className="secondary" disabled={!bindingCode} onClick={()=>void rebind()}>安全更换并重新绑定服务器</button>{error&&<p className="error">{error}</p>}
    <label>默认浏览器<select value={cfg.browserId} onChange={e=>setCfg({...cfg,browserId:e.target.value,executablePath:''})}>{state.browsers.map(browser=><option key={browser.id} value={browser.id}>{browser.displayName} · {browser.engine} · {browser.runtime}</option>)}</select></label>
    <div className="browser-help"><strong>自定义浏览器程序</strong><input value={cfg.executablePath||''} onChange={e=>setCfg({...cfg,executablePath:e.target.value,browserId:''})} placeholder="留空时自动发现"/><div className="browser-actions"><button type="button" className="secondary" onClick={()=>void chooseBrowser()}>选择浏览器</button><button type="button" className="secondary" onClick={()=>void restartBrowser()}>测试 / 重建会话</button><button type="button" className="danger" onClick={()=>void clearProfile()}>清理浏览器资料</button></div><p>浏览器资料保存在 Agent 独立目录，不使用日常浏览器资料；清理操作需要两次确认。</p></div>
    <label className="toggle"><input type="checkbox" checked={cfg.enabled} onChange={e=>setCfg({...cfg,enabled:e.target.checked})}/><span>启用自动同步</span></label><label>同步周期<select value={cfg.interval} onChange={e=>setCfg({...cfg,interval:e.target.value as SettingsInput['interval']})}><option value="manual">手动</option><option value="12h">每 12 小时</option><option value="daily">每天</option></select></label>{cfg.interval==='daily'&&<label>每天执行时间<input type="number" min="0" max="23" value={cfg.dailyHour} onChange={e=>setCfg({...cfg,dailyHour:Number(e.target.value)})}/></label>}
    <label className="toggle"><input type="checkbox" disabled={state.portableMode} checked={cfg.autoLaunch} onChange={e=>setCfg({...cfg,autoLaunch:e.target.checked})}/><span>{state.portableMode?'便携模式不启用开机启动':'系统登录后自动启动'}</span></label><button onClick={()=>void onSave(cfg).then(()=>setSaved('设置已保存')).catch(()=>setError('设置保存失败，请检查输入后重试。'))}>保存设置</button>{saved&&<p className="success">{saved}</p>}
  </section><section className="card logs"><h2>运行日志</h2><p>出于隐私保护，运行日志不会暴露给 Renderer。</p><small>日志不会记录 Cookie、密码、认证 Token 或账号原始标识。</small></section></div>;
}
